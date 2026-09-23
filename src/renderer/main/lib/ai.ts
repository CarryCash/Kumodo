import store from '../store'

import { extractGeminiTextPayload, normalizeGeminiCommand } from './geminiResponse'

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent'

export { extractGeminiTextPayload, normalizeGeminiCommand }

export async function testGeminiConnection(apiKey?: string): Promise<{ ok: boolean; message: string }> {
  const key = (apiKey ?? store.settings.geminiApiKey ?? '').trim()
  if (!key) {
    return { ok: false, message: 'No hay clave de Gemini guardada.' }
  }

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Responde solo con OK' }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 32,
          responseMimeType: 'text/plain',
        },
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      return {
        ok: false,
        message: `La llamada falló: ${err.error?.message || response.statusText || 'respuesta no válida'}`,
      }
    }

    const data = await response.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!content) {
      return { ok: false, message: 'Gemini respondió sin contenido útil.' }
    }

    return { ok: true, message: `Conexión correcta: ${content.trim().slice(0, 32)}` }
  } catch (error: any) {
    return {
      ok: false,
      message: `No se pudo conectar a Gemini: ${error?.message || 'error desconocido'}`,
    }
  }
}

export async function askGeminiForAdbCommand(userPrompt: string): Promise<{ command: string; explanation: string }> {
  const apiKey = store.settings.geminiApiKey
  if (!apiKey) {
    throw new Error('API Key de Gemini no configurada. Ve a Ajustes (⚙️) para agregarla.')
  }

  const systemPrompt = `Eres un asistente experto en Android Debug Bridge (ADB).
Tu única función es recibir una solicitud en lenguaje natural y devolver el comando ADB EXACTO para ejecutarla, junto con una brevísima explicación.
IMPORTANTE: 
- El comando será pasado al ejecutor de ADB. Usa solo comandos ADB permitidos y directos (ej: 'pm clear com.whatsapp' o 'input text hola').
- No pongas 'adb shell' al principio, asume que ya estás en el shell, a menos que el comando sea específico de adb como 'adb reboot' (en cuyo caso pon 'reboot').
- Nunca inventes operadores de shell ni concatenaciones como &&, ||, ;, $, backticks, >, <, pipe, ni comandos no permitidos.
- Si no estás seguro, responde con un comando seguro y simple dentro de la lista permitida o devuelve un error claro.
- Formato de respuesta OBLIGATORIO en JSON:
{
  "command": "comando",
  "explanation": "Por qué este comando funciona"
}
Ejemplo de entrada: Limpia la caché de WhatsApp
Ejemplo de salida JSON:
{
  "command": "pm clear com.whatsapp",
  "explanation": "Borra los datos y la caché del paquete de WhatsApp"
}
Solo devuelve un bloque JSON válido y nada más.`

  const body = {
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: [
      {
        parts: [{ text: userPrompt }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    }
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(`Error de Gemini: ${err.error?.message || response.statusText}`)
  }

  const data = await response.json()
  const content = extractGeminiTextPayload(data)

  if (!content) {
    throw new Error('Respuesta vacía de la IA')
  }

  try {
    const parsed = JSON.parse(content)
    const command = normalizeGeminiCommand(parsed.command || content)
    const explanation = parsed.explanation || 'Sin explicación'

    if (!command) {
      throw new Error('La IA no devolvió un comando válido')
    }

    return {
      command,
      explanation,
    }
  } catch {
    throw new Error('La IA no devolvió un JSON válido: ' + content)
  }
}

export interface IAiSuggestion {
  command: string
  description: string
  category: string
}

/**
 * Given a partial shell command the user is typing, ask Gemini to suggest
 * up to 5 ADB shell completions with a one-line description each.
 */
export async function getGeminiAutocompleteSuggestions(
  partial: string
): Promise<IAiSuggestion[]> {
  const apiKey = store.settings.geminiApiKey
  if (!apiKey || partial.trim().length < 2) return []

  const systemPrompt = `Eres un experto en ADB shell de Android.
El usuario está escribiendo un comando en la terminal ADB shell y necesita autocompletado.
Devuelve EXACTAMENTE un JSON array con hasta 5 objetos con estas propiedades:
- command: el comando completo sugerido (sin 'adb shell', ya están en el shell)
- description: descripción MUY corta (máximo 8 palabras)
- category: una de estas categorías: "Sistema" | "Red" | "Batería" | "Debug" | "Archivos" | "Apps"

Ejemplo de salida:
[
  {"command": "dumpsys battery", "description": "Estado completo de la batería", "category": "Batería"},
  {"command": "dumpsys battery reset", "description": "Resetea simulación de batería", "category": "Batería"}
]

DEVUELVE SOLO el JSON array, sin texto adicional ni markdown.`

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: [{ text: `Comando parcial: "${partial}"` }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 512,
      responseMimeType: 'application/json',
    },
  }

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) return []

    const data = await response.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!content) return []

    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((s: any) => typeof s.command === 'string' && s.command.trim())
      .slice(0, 5)
      .map((s: any) => ({
        command: s.command.trim(),
        description: s.description || '',
        category: s.category || 'Sistema',
      }))
  } catch {
    return []
  }
}

export interface IDiagnosticAiResult {
  summary: string
  hypotheses: Array<{
    title: string
    detail: string
    confidence: 'alta' | 'media' | 'baja'
  }>
  nextActions: string[]
}

export async function diagnoseDeviceWithGemini(input: {
  symptom: string
  deviceName?: string
  brand?: string
  model?: string
  batteryLevel?: number
  batteryTemperature?: number
  batteryVoltage?: number
  storagePercent?: number
  memPercent?: number
  root?: boolean
  rawLog?: string
}): Promise<IDiagnosticAiResult | null> {
  const apiKey = store.settings.geminiApiKey
  if (!apiKey) return null

  const systemPrompt = `Eres un experto en diagnóstico de dispositivos Android y soporte técnico de hardware/software.
Analiza SOLO los datos reales del dispositivo que te enviamos.
No inventes valores ni datos de prueba, y no sueltes conclusiones sin base en las cifras y el logcat.

Debes responder exactamente con un JSON válido con este esquema:
{
  "summary": "texto breve",
  "hypotheses": [
    { "title": "titulo", "detail": "explicación clara", "confidence": "alta|media|baja" }
  ],
  "nextActions": ["acción 1", "acción 2"]
}

Usa la información que te llega:
- síntoma del usuario
- marca/modelo
- nivel de batería, temperatura, voltaje
- uso de memoria y almacenamiento
- si el dispositivo está rooteado
- logcat reciente

Si no hay evidencia suficiente, indica que la causa no está clara y sugiere pruebas de confirmación.
Devuelve solo JSON y nada más.`

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{
      parts: [{ text: JSON.stringify({
        symptom: input.symptom,
        device: `${input.brand || ''} ${input.model || ''}`.trim() || input.deviceName || 'Dispositivo Android',
        batteryLevel: input.batteryLevel,
        batteryTemperature: input.batteryTemperature,
        batteryVoltage: input.batteryVoltage,
        storagePercent: input.storagePercent,
        memPercent: input.memPercent,
        root: input.root,
        rawLog: input.rawLog || '',
      }, null, 2) }]
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  }

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) return null

    const data = await response.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!content) return null

    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object') return null

    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'Diagnóstico generado con los datos reales del dispositivo.',
      hypotheses: Array.isArray(parsed.hypotheses) ? parsed.hypotheses.map((item: any) => ({
        title: String(item?.title || 'Hipótesis detectada'),
        detail: String(item?.detail || 'Se requiere más contexto para confirmar.'),
        confidence: ['alta', 'media', 'baja'].includes(item?.confidence) ? item.confidence : 'media',
      })) : [],
      nextActions: Array.isArray(parsed.nextActions)
        ? parsed.nextActions.map(String).filter(Boolean)
        : [],
    }
  } catch {
    return null
  }
}

export interface IDebloatAiResult {
  package: string
  name: string
  category: 'safe' | 'risky' | 'danger'
  description: string
  dependencies: string
}

/**
 * Ask Gemini to dynamically analyze real system packages installed on the device,
 * extracting their purpose, safety category, and potential broken dependencies.
 */
export async function analyzeDebloatWithGemini(
  packages: string[],
  deviceBrand: string,
  deviceModel: string
): Promise<Record<string, IDebloatAiResult>> {
  const apiKey = store.settings.geminiApiKey
  if (!apiKey || packages.length === 0) return {}

  const systemPrompt = `Eres un experto senior en Android Debloating, optimización de rendimiento y privacidad móvil.
Dispositivo bajo análisis: ${deviceBrand} ${deviceModel}.
Se te entrega una lista de nombres de paquetes del sistema reales instalados en este dispositivo.
Tu objetivo es analizar qué hace cada uno en este fabricante (${deviceBrand}), clasificándolo con precisión para saber si el usuario puede desinstalarlo o congelarlo sin dañar el teléfono.

Devuelve OBLIGATORIAMENTE un JSON array con objetos que tengan estas propiedades exactas:
- package: el nombre del paquete tal cual (ej. "com.miui.analytics" o "com.samsung.android.bixby.agent")
- name: nombre amigable de la app en español
- category: "safe" (100% seguro de desactivar: telemetría, publicidad, bloatware promocional, apps basura) | "risky" (desactivable pero pierdes una función específica como sincronización de nube o asistente) | "danger" (crítico del sistema operativo o telefonía)
- description: explicación clara y concisa (máximo 15 palabras) de su función real
- dependencies: advertencia de qué deja de funcionar si se desactiva (ej. "Perderás Bixby Voice" o "Ninguna")

Responde ÚNICAMENTE con el bloque JSON array válido.`

  const batch = packages.slice(0, 50)
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: [{ text: `Paquetes instalados:\n${batch.join('\n')}` }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  }

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) return {}

    const data = await response.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!content) return {}

    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) return {}

    const map: Record<string, IDebloatAiResult> = {}
    for (const item of parsed) {
      if (item?.package) {
        const cat =
          item.category === 'safe' || item.category === 'danger'
            ? item.category
            : 'risky'
        map[item.package] = {
          package: item.package,
          name: item.name || item.package,
          category: cat,
          description: item.description || '',
          dependencies: item.dependencies || 'Ninguna',
        }
      }
    }
    return map
  } catch {
    return {}
  }
}

