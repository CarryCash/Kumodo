import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeSymptom } from './diagnosticWizard.js'

test('reboots suspiciously are classified as software/thermal risk when logs mention OOM and battery temp is high', () => {
    const result = analyzeSymptom('random_reboots', {
        batteryLevel: 26,
        batteryTemperature: 430,
        batteryVoltage: 3900,
        storagePercent: 91,
        memPercent: 88,
        root: false,
    }, 'OutOfMemoryError: heap exhausted\nW/ActivityManager: Force stopping app')

    assert.ok(result.summary.toLowerCase().includes('reinicios'))
    assert.ok(result.hypotheses.length >= 2)
    assert.ok(result.nextActions.length >= 2)
    assert.ok(result.hypotheses.some((item) => item.title.toLowerCase().includes('software')))
})

test('battery drain is classified with low battery and thermal warnings', () => {
    const result = analyzeSymptom('battery_drain', {
        batteryLevel: 11,
        batteryTemperature: 480,
        batteryVoltage: 3700,
        storagePercent: 52,
        memPercent: 58,
        root: false,
    }, 'D/PowerManager: battery low')

    assert.ok(result.summary.toLowerCase().includes('bater'))
    assert.ok(result.hypotheses.some((item) => item.title.toLowerCase().includes('bater')) || result.hypotheses.some((item) => item.title.toLowerCase().includes('hardware')))
})
