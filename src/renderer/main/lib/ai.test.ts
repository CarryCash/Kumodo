import { describe, expect, it } from 'vitest'
import { extractGeminiTextPayload, isCasualChatPrompt, normalizeGeminiCommand } from './geminiResponse'

describe('gemini response parsing', () => {
    it('extracts JSON from fenced Gemini responses', () => {
        const payload = {
            candidates: [
                {
                    content: {
                        parts: [{ text: '```json\n{"command":"pm list packages","explanation":"Muestra apps instaladas"}\n```' }],
                    },
                },
            ],
        }

        const text = extractGeminiTextPayload(payload)
        expect(text).toContain('"command":"pm list packages"')
        expect(JSON.parse(text)).toMatchObject({
            command: 'pm list packages',
            explanation: 'Muestra apps instaladas',
        })
    })

    it('normalizes adb shell wrappers before allowlist checks', () => {
        expect(normalizeGeminiCommand('adb shell dumpsys battery')).toBe('dumpsys battery')
        expect(normalizeGeminiCommand('  ```json\n{"command":"pm clear com.whatsapp"}\n```  ')).toBe('pm clear com.whatsapp')
    })

    it('treats greetings as casual chat, not ADB commands', () => {
        expect(isCasualChatPrompt('hola')).toBe(true)
        expect(isCasualChatPrompt('revisa el almacenamiento')).toBe(false)
        expect(isCasualChatPrompt('estado de la batería')).toBe(false)
    })
})
