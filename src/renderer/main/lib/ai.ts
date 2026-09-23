import store from '../store'

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent'

export async function askGeminiForAdbCommand(userPrompt: string): Promise<{ command: string; explanation: string }> {
  const apiKey = store.settings.geminiApiKey
  if (!apiKey) {
    throw new Error('API Key de Gemini no configurada. Ve a Ajustes (⚙️) para agregarla.')
  }

  const systemPrompt = `Eres un asistente experto en Android Debug Bridge (ADB).
Tu única función es recibir una solicitud en lenguaje natural y devolver el comando ADB EXACTO para ejecutarla, junto con una brevísima explicación.
IMPORTANTE: 
- El comando será pasado al ejecutor de ADB. Usa comandos de shell directos (ej: 'pm clear com.whatsapp' o 'input text hola').
- No pongas 'adb shell' al principio, asume que ya estás en el shell, a menos que el comando sea específico de adb como 'adb reboot' (en cuyo caso pon 'reboot').
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
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text
  
  if (!content) {
    throw new Error('Respuesta vacía de la IA')
  }

  try {
    const result = JSON.parse(content)
    return {
      command: result.command || '',
      explanation: result.explanation || 'Sin explicación'
    }
  } catch (e) {
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
      if (item && item.package) {
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

