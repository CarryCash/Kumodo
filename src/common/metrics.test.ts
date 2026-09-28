import { describe, expect, it, vi } from 'vitest'
import {
    createTelemetryLogger,
    measureExecution,
    parseAdbDevicesOutput,
    parseGetPropOutput,
    sanitizeCommand,
    trackMetric,
} from './metrics'

describe('adb output parsing helpers', () => {
    it('parses adb devices output and ignores offline entries', () => {
        const output = `List of devices attached
0123456789ABCDEF device product:blueline model:Pixel_3 device
emulator-5554 offline
`

        expect(parseAdbDevicesOutput(output)).toEqual([
            {
                id: '0123456789ABCDEF',
                type: 'device',
                product: 'blueline',
                model: 'Pixel_3',
            },
        ])
    })

    it('parses getprop output into a clean property map', () => {
        const output = `[ro.product.model]: [Pixel 7]\n[ro.build.version.release]: [14]\n[ro.serialno]: [ABC123]\n`

        expect(parseGetPropOutput(output)).toEqual({
            'ro.product.model': 'Pixel 7',
            'ro.build.version.release': '14',
            'ro.serialno': 'ABC123',
        })
    })

    it('sanitizes adb commands and rejects unsafe shell patterns', () => {
        expect(sanitizeCommand('dumpsys battery')).toBe('dumpsys battery')
        expect(sanitizeCommand('  pm list packages  ')).toBe('pm list packages')
        expect(() => sanitizeCommand('dumpsys battery; reboot')).toThrow(/unsafe|unsafe/i)
        expect(() => sanitizeCommand('rm -rf /')).toThrow(/unsafe|unsafe/i)
    })
})

describe('telemetry helpers', () => {
    it('tracks a metric event and captures duration', async () => {
        const onEvent = vi.fn()
        const logger = createTelemetryLogger(onEvent)

        const result = await measureExecution('diagnostic-test', async () => 'ok', logger)

        expect(result).toBe('ok')
        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'diagnostic-test',
                durationMs: expect.any(Number),
            })
        )
    })

    it('records a metric event with structured payload', () => {
        const onEvent = vi.fn()
        const logger = createTelemetryLogger(onEvent)

        trackMetric(logger, 'device_connected', { deviceId: 'ABC123', sdk: 34 })

        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'device_connected',
                deviceId: 'ABC123',
                sdk: 34,
            })
        )
    })
})
