export interface ApprovedAction {
    id: string
    label: string
    description: string
    command: string
    category: string
    keywords: string[]
}

export const approvedActions: ApprovedAction[] = [
    {
        id: 'storage',
        label: 'Ver espacio disponible',
        description: 'Muestra el uso de disco y almacenamiento del dispositivo.',
        command: 'df',
        category: 'Sistema',
        keywords: ['espacio', 'almacenamiento', 'storage', 'disco', 'memoria interna'],
    },
    {
        id: 'battery',
        label: 'Estado de batería',
        description: 'Consulta el estado general de carga y batería.',
        command: 'dumpsys battery',
        category: 'Batería',
        keywords: ['batería', 'battery', 'carga', 'power'],
    },
    {
        id: 'packages',
        label: 'Listar apps instaladas',
        description: 'Muestra los paquetes instalados para inspección segura.',
        command: 'pm list packages',
        category: 'Apps',
        keywords: ['apps', 'aplicaciones', 'paquetes', 'packages', 'instaladas'],
    },
    {
        id: 'network',
        label: 'Estado de red',
        description: 'Consulta la configuración de red del dispositivo.',
        command: 'ip addr show wlan0',
        category: 'Red',
        keywords: ['red', 'wifi', 'network', 'ip', 'conectividad'],
    },
    {
        id: 'properties',
        label: 'Propiedades del sistema',
        description: 'Muestra propiedades Android básicas del equipo.',
        command: 'getprop',
        category: 'Sistema',
        keywords: ['android', 'propiedades', 'sistema', 'device', 'info'],
    },
]

export function matchApprovedActions(userText: string): ApprovedAction[] {
    const lower = userText.toLowerCase()
    return approvedActions.filter((action) =>
        action.keywords.some((keyword) => lower.includes(keyword.toLowerCase()))
    )
}

export function buildSafeFallbackReply(userText: string): {
    explanation: string
    suggestions: ApprovedAction[]
} {
    const normalized = userText.trim().toLowerCase()

    const directMatches = matchApprovedActions(userText)
    if (directMatches.length > 0) {
        return {
            explanation:
                'He limitado la respuesta a acciones seguras del sistema. Elige una y confirma antes de ejecutarla.',
            suggestions: directMatches.slice(0, 3),
        }
    }

    const greeting = /^(hola|hello|hi|buenas|buenos\s+d[ií]as|buenas\s+noches)/i.test(normalized)
    if (greeting) {
        return {
            explanation:
                'Puedo ayudarte con diagnósticos seguros. Te dejo opciones aprobadas para revisar batería, almacenamiento, red o apps.',
            suggestions: approvedActions.slice(0, 3),
        }
    }

    return {
        explanation:
            'No tengo una clave de Gemini activa, pero estas son acciones seguras y aprobadas que puedes ejecutar.',
        suggestions: approvedActions.slice(0, 3),
    }
}
