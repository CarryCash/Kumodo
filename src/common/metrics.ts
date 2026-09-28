export type TelemetryEvent = {
    name: string
    timestamp: number
    durationMs?: number
    [key: string]: unknown
}

export function parseAdbDevicesOutput(output: string) {
    const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    const entries: Array<{ id: string; type: string; product?: string; model?: string }> = []

    for (const line of lines) {
        if (line.startsWith('List of devices attached')) continue
        const parts = line.split(/\s+/)
        if (parts.length < 2) continue

        const [id, state, ...rest] = parts
        if (state !== 'device' && state !== 'emulator' && state !== 'offline') continue
        if (state === 'offline') continue

        const details = rest.join(' ')
        const productMatch = /product:([^\s]+)/.exec(details)
        const modelMatch = /model:([^\s]+)/.exec(details)
        const product = productMatch?.[1]
        const model = modelMatch?.[1]

        entries.push({ id, type: state, product, model })
    }

    return entries
}

export function parseGetPropOutput(output: string): Record<string, string> {
    const result: Record<string, string> = {}
    for (const line of output.split(/\r?\n/)) {
        const match = /^\[([^\]]+)\]:\s*\[([^\]]*)\]$/.exec(line)
        if (!match) continue
        const [, key, value] = match
        result[key] = value
    }
    return result
}

export function sanitizeCommand(command: string): string {
    const value = command.trim()
    if (!value) {
        throw new Error('unsafe command: empty')
    }

    if (/[;&|`$<>\r\n]/.test(value)) {
        throw new Error('unsafe command: shell metacharacters detected')
    }

    if (!/^[a-zA-Z0-9_./:=+%\- \t]+$/.test(value)) {
        throw new Error('unsafe command: invalid characters')
    }

    if (/(^|\s)(rm|delete|erase|wipe|format|dd|mkfs|mount|umount|chmod|chown)(\s|$)/i.test(value)) {
        throw new Error('unsafe command: destructive operation')
    }

    return value
}

export function createTelemetryLogger(onEvent: (event: TelemetryEvent) => void) {
    return {
        event(name: string, extra: Record<string, unknown> = {}) {
            onEvent({ name, timestamp: Date.now(), ...extra })
        },
    }
}

export function trackMetric(
    logger: ReturnType<typeof createTelemetryLogger>,
    name: string,
    payload: Record<string, unknown> = {}
) {
    logger.event(name, payload)
}

export async function measureExecution<T>(
    name: string,
    task: () => Promise<T> | T,
    logger: ReturnType<typeof createTelemetryLogger>
): Promise<T> {
    const started = performance.now()
    try {
        const value = await task()
        logger.event(name, { durationMs: Math.max(0, performance.now() - started) })
        return value
    } catch (error) {
        logger.event(name, {
            durationMs: Math.max(0, performance.now() - started),
            error: error instanceof Error ? error.message : String(error),
        })
        throw error
    }
}
