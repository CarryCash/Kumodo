export function extractGeminiTextPayload(data: any): string {
    const parts = data?.candidates?.[0]?.content?.parts ?? []
    const text = parts.map((part: any) => part?.text ?? '').join('')
    if (!text) return ''

    const cleaned = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim()

    return cleaned
}

export function normalizeGeminiCommand(value: string): string {
    const normalized = (value ?? '').trim()
    if (!normalized) return ''

    const stripped = normalized
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim()

    const jsonMatch = stripped.match(/"command"\s*:\s*"([^"]+)"/i)
    if (jsonMatch?.[1]) {
        return jsonMatch[1].trim()
    }

    const command = stripped.replace(/^adb\s+shell\s+/i, '').trim()
    return command
}

export function isCasualChatPrompt(value: string): boolean {
    const text = (value ?? '').trim()
    if (!text) return false

    const greetings = /^(hola|hello|hey|hi|buenas|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|que\s+tal|qué\s+tal|saludos|ayuda|help)\b/i
    if (greetings.test(text)) return true

    const shortNonCommand = text.length <= 28 && !/(bater[ií]a|battery|almacen|almacenamiento|storage|app|apps|paquetes|wifi|red|revisar|estado|memoria|dumpsys|pm\s+list|getprop|ip\s+addr)/i.test(text)
    return shortNonCommand
}
