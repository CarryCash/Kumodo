export function analyzeSymptom(symptom, metrics, rawLog = '') {
    const log = (rawLog || '').toLowerCase()
    const batteryLevel = Number(metrics?.batteryLevel ?? 0)
    const temp = Number(metrics?.batteryTemperature ?? 0)
    const storagePercent = Number(metrics?.storagePercent ?? 0)
    const memPercent = Number(metrics?.memPercent ?? 0)
    const root = Boolean(metrics?.root)

    const hypotheses = []
    const nextActions = []

    if (symptom === 'random_reboots' || symptom === 'reboots' || log.includes('reboot') || log.includes('fatal') || log.includes('oom') || log.includes('outofmemoryerror')) {
        const softwareSignals = [
            log.includes('outofmemoryerror'),
            log.includes('force stopping'),
            log.includes('lowmemorykiller'),
            storagePercent > 85,
            memPercent > 80,
        ].filter(Boolean).length

        const hardwareSignals = [
            temp >= 400,
            temp > 440,
            batteryLevel < 20,
            log.includes('thermal'),
            log.includes('battery overhe'),
        ].filter(Boolean).length

        if (softwareSignals >= 2) {
            hypotheses.push({
                title: 'Software / capacidad de memoria',
                detail: 'Los reinicios coinciden con presión de memoria, procesos que se cierran abruptamente y/o almacenamiento casi lleno.',
                confidence: 'alta',
            })
            nextActions.push('Revisa el logcat en tiempo real y captura el último bloque antes del reinicio.')
            nextActions.push('Desinstala o deshabilita apps que consumen RAM/almacenamiento y prueba con el dispositivo en modo seguro.')
        }

        if (hardwareSignals >= 1 || (batteryLevel > 0 && batteryLevel <= 30 && temp >= 380)) {
            hypotheses.push({
                title: 'Problema de batería / calor',
                detail: 'La temperatura elevada, la batería muy descargada o la protección térmica pueden provocar reinicios bruscos.',
                confidence: hardwareSignals >= 2 || temp >= 420 ? 'alta' : 'media',
            })
            nextActions.push('Mide temperatura real de la batería y revisa si el dispositivo se calienta con carga ligera.')
            nextActions.push('Prueba con batería nueva o con otro cargador y comprueba si el reinicio desaparece al conectarlo a energía estable.')
        }

        if (hypotheses.length === 0) {
            hypotheses.push({
                title: 'Causa no concluyente',
                detail: 'No hay evidencia suficiente para distinguir software y hardware con la información disponible.',
                confidence: 'media',
            })
        }

        return {
            symptom,
            summary: 'Se detectan reinicios aleatorios. El siguiente paso es confirmar si el origen es software, batería o calor.',
            hypotheses,
            nextActions,
        }
    }

    if (symptom === 'battery_drain' || symptom === 'drain' || log.includes('battery') || batteryLevel <= 15 || temp > 450) {
        const drainHypotheses = []
        if (batteryLevel <= 15 || temp > 450) {
            drainHypotheses.push({
                title: 'Batería / hardware',
                detail: 'La batería está muy descargada y/o la temperatura supera el rango normal, lo que puede acelerar el drenaje o provocar apagados.',
                confidence: temp > 450 ? 'alta' : 'media',
            })
            nextActions.push('Consulta el módulo de batería y revisa la temperatura, voltaje y consumo reciente.')
            nextActions.push('Si la batería se calienta con poco uso, prueba con una batería de reemplazo o revisa la salud del hardware.')
        }

        if (memPercent > 70 || storagePercent > 80) {
            drainHypotheses.push({
                title: 'Software de fondo',
                detail: 'La presión de memoria o de almacenamiento puede forzar más uso del sistema y provocar consumo anómalo.',
                confidence: 'media',
            })
            nextActions.push('Revisa apps con mayor consumo, wakelocks o servicios en segundo plano.')
            nextActions.push('Limpia almacenamiento y comprueba si el problema ocurre tras reiniciar el dispositivo.')
        }

        if (drainHypotheses.length === 0) {
            drainHypotheses.push({
                title: 'Diagnóstico abierto',
                detail: 'Hay síntomas de drenaje, pero no se puede separar aún CPU, batería y software con los datos actuales.',
                confidence: 'media',
            })
        }

        return {
            symptom,
            summary: 'El teléfono muestra drenaje anómalo o calor excesivo, con posible origen en batería, software o hardware.',
            hypotheses: drainHypotheses,
            nextActions,
        }
    }

    const genericHypotheses = [
        {
            title: root ? 'Sistema parcialmente modificado' : 'Estado de sistema sin evidencia crítica',
            detail: 'No se detectaron señales fuertes de fallo, pero el análisis requiere más contexto de logcat y del uso del dispositivo.',
            confidence: 'media',
        },
    ]

    return {
        symptom,
        summary: 'El síntoma no encaja con un patrón claro por sí solo; se necesitan más datos de logcat y de batería.',
        hypotheses: genericHypotheses,
        nextActions: [
            'Captura un logcat durante el problema y repite la acción que lo desencadena.',
            'Comprueba temperatura, nivel de batería y disponibilidad de almacenamiento en la misma ventana de tiempo.',
            'Si el problema persiste, usa la salida del logcat para localizar errores de sistema o aplicaciones.',
        ],
    }
}
