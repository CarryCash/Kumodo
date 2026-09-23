import { useEffect, useMemo, useState } from 'react'
import LunaModal from 'luna-modal/react'
import store from '../../store'
import { notify } from 'share/renderer/lib/util'
import { analyzeSymptom } from 'common/diagnosticWizard.js'
import { diagnoseDeviceWithGemini } from '../../lib/ai'

interface IProps {
    readonly visible: boolean
    readonly onClose: () => void
}

type DiagnosisHypothesis = {
    title: string
    detail: string
    confidence: string
}

type DiagnosisResult = {
    summary: string
    hypotheses: DiagnosisHypothesis[]
    nextActions: string[]
}

type DeviceSnapshot = {
    batteryLevel: number
    batteryTemperature: number
    batteryVoltage: number
    storagePercent: number
    memPercent: number
    root: boolean
    capturedAt: string
    criticalLogCount: number
    logPreview: string
}

type SymptomKey =
    | 'random_reboots'
    | 'battery_drain'
    | 'overheating'
    | 'app_crashes'
    | 'slow_performance'

const symptomOptions: Array<{ key: SymptomKey; label: string; description: string }> = [
    { key: 'random_reboots', label: 'Reinicios aleatorios', description: 'Cortes bruscos, reboots o reencendidos sin motivo aparente.' },
    { key: 'battery_drain', label: 'Drenaje de batería', description: 'La batería cae más rápido de lo habitual o se calienta.' },
    { key: 'overheating', label: 'Sobrecalentamiento', description: 'El teléfono se calienta durante carga o uso ligero.' },
    { key: 'app_crashes', label: 'Apps que se cierran', description: 'Aplicaciones que se cierra o se fuerza al fondo.' },
    { key: 'slow_performance', label: 'Ralentización', description: 'Uso lento, lag, tiempos de respuesta altos.' },
]

function getCriticalLogCount(log: string) {
    return (log.match(/(fatal|oom|outofmemoryerror|thermal|reboot|lowmemorykiller|force stopping)/gi) || []).length
}

function buildSnapshot(metrics: {
    batteryLevel: number
    batteryTemperature: number
    batteryVoltage: number
    storagePercent: number
    memPercent: number
    root: boolean
}, rawLog: string): DeviceSnapshot {
    return {
        batteryLevel: Number(metrics.batteryLevel || 0),
        batteryTemperature: Number(metrics.batteryTemperature || 0),
        batteryVoltage: Number(metrics.batteryVoltage || 0),
        storagePercent: Number(metrics.storagePercent || 0),
        memPercent: Number(metrics.memPercent || 0),
        root: Boolean(metrics.root),
        capturedAt: new Date().toISOString(),
        criticalLogCount: getCriticalLogCount(rawLog),
        logPreview: String(rawLog || '').slice(0, 500),
    }
}

function buildBeforeAfterDifferences(before: DeviceSnapshot | null, after: DeviceSnapshot | null) {
    if (!before || !after) {
        return []
    }

    return [
        {
            label: 'Nivel de batería',
            value: `${before.batteryLevel}% → ${after.batteryLevel}%`,
            delta: after.batteryLevel - before.batteryLevel,
        },
        {
            label: 'Temperatura de batería',
            value: `${before.batteryTemperature} → ${after.batteryTemperature}`,
            delta: after.batteryTemperature - before.batteryTemperature,
        },
        {
            label: 'Uso de almacenamiento',
            value: `${before.storagePercent.toFixed(1)}% → ${after.storagePercent.toFixed(1)}%`,
            delta: after.storagePercent - before.storagePercent,
        },
        {
            label: 'Uso de memoria',
            value: `${before.memPercent.toFixed(1)}% → ${after.memPercent.toFixed(1)}%`,
            delta: after.memPercent - before.memPercent,
        },
        {
            label: 'Logs críticos',
            value: `${before.criticalLogCount} → ${after.criticalLogCount}`,
            delta: after.criticalLogCount - before.criticalLogCount,
        },
    ]
}

export default function DiagnosticWizardModal({ visible, onClose }: Readonly<IProps>) {
    const { device } = store
    const [selectedSymptom, setSelectedSymptom] = useState<SymptomKey>('random_reboots')
    const [analysis, setAnalysis] = useState<DiagnosisResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [step, setStep] = useState(0)
    const [expertMode, setExpertMode] = useState(false)
    const [baselineSnapshot, setBaselineSnapshot] = useState<DeviceSnapshot | null>(null)
    const [afterSnapshot, setAfterSnapshot] = useState<DeviceSnapshot | null>(null)

    const currentSymptom = useMemo(
        () => symptomOptions.find((item) => item.key === selectedSymptom) ?? symptomOptions[0],
        [selectedSymptom]
    )

    useEffect(() => {
        if (!visible || !device) {
            return
        }

        runAnalysis(selectedSymptom)
    }, [visible, device?.id, selectedSymptom])

    async function runAnalysis(symptom: SymptomKey) {
        if (!device) {
            return
        }

        setLoading(true)
        setAnalysis(null)
        setStep(0)

        try {
            const [diagnostic, batteryStats, storageStats] = await Promise.all([
                main.getDiagnostic(device.id).catch(() => null),
                main.getBatteryStats(device.id).catch(() => null),
                main.getStorageRamStats(device.id).catch(() => null),
            ])

            const logs = await main.execAdb(device.id, 'logcat -d -t 200').catch(() => '')

            const metrics = {
                batteryLevel: diagnostic?.batteryLevel ?? batteryStats?.level ?? 0,
                batteryTemperature: diagnostic?.batteryTemperature ?? batteryStats?.temperature ?? 0,
                batteryVoltage: diagnostic?.batteryVoltage ?? batteryStats?.voltage ?? 0,
                storagePercent:
                    storageStats && storageStats.storageTotal > 0
                        ? ((storageStats.storageTotal - storageStats.storageFree) / storageStats.storageTotal) * 100
                        : 0,
                memPercent:
                    storageStats && storageStats.memTotal > 0
                        ? ((storageStats.memTotal - storageStats.memAvailable) / storageStats.memTotal) * 100
                        : 0,
                root: !!diagnostic?.root,
            }

            const aiResult = store.settings.geminiApiKey
                ? await diagnoseDeviceWithGemini({
                    symptom,
                    deviceName: device.name,
                    brand: diagnostic?.brand ?? device.name,
                    model: diagnostic?.model ?? device.name,
                    batteryLevel: metrics.batteryLevel,
                    batteryTemperature: metrics.batteryTemperature,
                    batteryVoltage: metrics.batteryVoltage,
                    storagePercent: metrics.storagePercent,
                    memPercent: metrics.memPercent,
                    root: metrics.root,
                    rawLog: logs,
                }).catch(() => null)
                : null

            const result = aiResult || analyzeSymptom(symptom, metrics, logs)
            const baseline = buildSnapshot(metrics, logs)
            setBaselineSnapshot(baseline)
            setAfterSnapshot(null)
            setAnalysis(result)
            setStep(1)
        } catch (e: any) {
            notify('No se pudo completar el diagnóstico: ' + (e?.message || 'error desconocido'), {
                icon: 'error',
            })
        } finally {
            setLoading(false)
        }
    }

    function openLogcat() {
        if (!device) return
        if (!expertMode) {
            store.selectPanel('logcat')
            main.openLogcat(device.id).catch(() => notify('No se pudo abrir el visor de logcat', { icon: 'error' }))
            onClose()
            return
        }
        const confirmed = window.confirm('Esto abrirá el logcat del dispositivo; es una acción no destructiva, pero requiere confirmación explícita en modo experto. ¿Continuar?')
        if (!confirmed) {
            return
        }
        store.selectPanel('logcat')
        main.openLogcat(device.id).catch(() => notify('No se pudo abrir el visor de logcat', { icon: 'error' }))
        onClose()
    }

    function requireExpertForDangerousAction(actionName: string, callback: () => void) {
        if (!expertMode) {
            notify(`Acción bloqueada por modo seguro: ${actionName}. Activa Modo experto o confirma explícitamente.`, { icon: 'warning' })
            return
        }

        const confirmed = window.confirm(`La acción "${actionName}" es destructiva o crítica. Confirma que quieres continuar en modo experto.`)
        if (!confirmed) {
            return
        }

        callback()
    }

    async function captureAfterRepair() {
        if (!device) {
            return
        }

        try {
            const [diagnostic, batteryStats, storageStats] = await Promise.all([
                main.getDiagnostic(device.id).catch(() => null),
                main.getBatteryStats(device.id).catch(() => null),
                main.getStorageRamStats(device.id).catch(() => null),
            ])
            const logs = await main.execAdb(device.id, 'logcat -d -t 200').catch(() => '')

            const metrics = {
                batteryLevel: diagnostic?.batteryLevel ?? batteryStats?.level ?? 0,
                batteryTemperature: diagnostic?.batteryTemperature ?? batteryStats?.temperature ?? 0,
                batteryVoltage: diagnostic?.batteryVoltage ?? batteryStats?.voltage ?? 0,
                storagePercent:
                    storageStats && storageStats.storageTotal > 0
                        ? ((storageStats.storageTotal - storageStats.storageFree) / storageStats.storageTotal) * 100
                        : 0,
                memPercent:
                    storageStats && storageStats.memTotal > 0
                        ? ((storageStats.memTotal - storageStats.memAvailable) / storageStats.memTotal) * 100
                        : 0,
                root: !!diagnostic?.root,
            }

            setAfterSnapshot(buildSnapshot(metrics, logs))
            notify('Estado posterior grabado para comparación.', { icon: 'success' })
        } catch (error: any) {
            notify('No se pudo registrar el estado posterior: ' + (error?.message || 'error desconocido'), { icon: 'error' })
        }
    }

    async function copyTechnicalReport() {
        const deltas = buildBeforeAfterDifferences(baselineSnapshot, afterSnapshot)
        const text = [
            'REPORTE TÉCNICO - EVIDENCIA BEFORE / AFTER',
            `Síntoma: ${selectedSymptom}`,
            `Captura previa: ${baselineSnapshot?.capturedAt || 'N/A'}`,
            `Captura posterior: ${afterSnapshot?.capturedAt || 'N/A'}`,
            '',
            ...deltas.map((item) => `${item.label}: ${item.value} (Δ ${item.delta >= 0 ? '+' : ''}${item.delta})`),
            '',
            baselineSnapshot?.logPreview ? `Log previo: ${baselineSnapshot.logPreview}` : '',
            afterSnapshot?.logPreview ? `Log posterior: ${afterSnapshot.logPreview}` : '',
        ].filter(Boolean).join('\n')

        try {
            await navigator.clipboard.writeText(text)
            notify('Reporte técnico copiado al portapapeles.', { icon: 'success' })
        } catch {
            notify('No se pudo copiar el reporte, pero está disponible en pantalla.', { icon: 'info' })
        }
    }

    const stepLabels = ['Conectar', 'Recoger datos', 'Análisis', 'Acción']
    const beforeAfterDeltas = buildBeforeAfterDifferences(baselineSnapshot, afterSnapshot)

    let content: React.ReactNode

    if (loading) {
        content = <div style={{ color: 'var(--color-text, #101828)' }}>Realizando diagnóstico del dispositivo...</div>
    } else if (analysis) {
        content = (
            <>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10, color: 'var(--color-text, #101828)' }}>{currentSymptom.label}</div>
                <div style={{ marginBottom: 12, color: 'var(--color-text, #101828)' }}>{analysis.summary}</div>

                <div style={{ marginTop: 14 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--color-text, #101828)' }}>Hipótesis</div>
                    {analysis.hypotheses.map((item) => (
                        <div key={item.title} style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ fontWeight: 600, color: 'var(--color-text, #101828)' }}>{item.title}</div>
                            <div style={{ opacity: 0.8, marginTop: 4, color: 'var(--color-text, #101828)' }}>{item.detail}</div>
                            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6, color: 'var(--color-text, #101828)' }}>Confianza: {item.confidence}</div>
                        </div>
                    ))}
                </div>

                <div style={{ marginTop: 14 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--color-text, #101828)' }}>Siguientes pruebas</div>
                    <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--color-text, #101828)' }}>
                        {analysis.nextActions.map((action) => (
                            <li key={action} style={{ marginBottom: 6 }}>{action}</li>
                        ))}
                    </ol>
                </div>

                <div style={{ marginTop: 18, padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(122, 162, 255, 0.35)', background: 'rgba(122, 162, 255, 0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 700, color: 'var(--color-text, #101828)' }}>Evidencia before/after</div>
                        <button
                            type="button"
                            onClick={captureAfterRepair}
                            style={{ padding: '8px 12px', borderRadius: 10, background: '#fff', color: '#101828', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                        >
                            Registrar estado tras reparación
                        </button>
                    </div>

                    {beforeAfterDeltas.length > 0 ? (
                        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                            {beforeAfterDeltas.map((item) => (
                                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
                                    <span style={{ color: 'var(--color-text, #101828)' }}>{item.label}</span>
                                    <strong style={{ color: 'var(--color-text, #101828)' }}>{item.value}</strong>
                                    <span style={{ color: item.delta >= 0 ? '#7ef29a' : '#ffb199' }}>Δ {item.delta >= 0 ? '+' : ''}{item.delta}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ marginTop: 12, color: 'var(--color-text, #101828)', opacity: 0.8 }}>
                            Captura una línea base y luego el estado posterior para comparar impacto real.
                        </div>
                    )}

                    {beforeAfterDeltas.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                            <button
                                type="button"
                                onClick={copyTechnicalReport}
                                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(77,163,255,0.5)', background: 'rgba(77,163,255,0.12)', color: '#fff', cursor: 'pointer' }}
                            >
                                Copiar reporte técnico
                            </button>
                        </div>
                    )}
                </div>
            </>
        )
    } else {
        content = <div style={{ color: '#dfeaff' }}>Selecciona un síntoma para comenzar el análisis del dispositivo.</div>
    }

    return (
        <LunaModal
            title="🧭 Diagnóstico guiado"
            width={820}
            visible={visible}
            onClose={onClose}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minHeight: 360 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 12, color: 'var(--color-text, #101828)', opacity: 0.9 }}>
                        Modo diagnóstico: <strong>{expertMode ? 'Experto' : 'Seguro'}</strong>
                        <div style={{ opacity: 0.7, marginTop: 4 }}>Por defecto se bloquean acciones destructivas como wipe, flash, factory reset o reboots avanzados.</div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setExpertMode((value) => !value)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: 999,
                            background: expertMode ? 'rgba(255,153,0,0.12)' : 'rgba(82,196,26,0.12)',
                            border: `1px solid ${expertMode ? 'rgba(255,153,0,0.5)' : 'rgba(82,196,26,0.5)'}`,
                            color: '#fff',
                            cursor: 'pointer',
                        }}
                    >
                        {expertMode ? 'Desactivar modo experto' : 'Activar modo experto'}
                    </button>
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    {symptomOptions.map((option) => (
                        <button
                            key={option.key}
                            type="button"
                            onClick={() => setSelectedSymptom(option.key)}
                            style={{
                                border: selectedSymptom === option.key ? '1px solid #4da3ff' : '1px solid rgba(255,255,255,0.14)',
                                background: selectedSymptom === option.key ? 'rgba(77,163,255,0.12)' : 'rgba(255,255,255,0.02)',
                                color: 'var(--color-text, #101828)',
                                borderRadius: 10,
                                padding: '10px 12px',
                                cursor: 'pointer',
                                minWidth: 160,
                                textAlign: 'left',
                            }}
                        >
                            <div style={{ fontWeight: 600, color: 'var(--color-text, #101828)' }}>{option.label}</div>
                            <div style={{ opacity: 0.7, fontSize: 11, color: 'var(--color-text, #101828)' }}>{option.description}</div>
                        </button>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {stepLabels.map((label, index) => (
                        <div
                            key={label}
                            style={{
                                padding: '6px 10px',
                                borderRadius: 999,
                                background: index <= step ? 'rgba(82,196,26,0.18)' : 'rgba(255,255,255,0.05)',
                                border: index <= step ? '1px solid rgba(82,196,26,0.5)' : '1px solid rgba(255,255,255,0.08)',
                                fontSize: 12,
                                color: 'var(--color-text, #101828)',
                            }}
                        >
                            {label}
                        </div>
                    ))}
                </div>

                <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16, background: 'rgba(255,255,255,0.02)' }}>
                    {content}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                    <button type="button" onClick={() => setStep(0)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--color-text, #101828)', cursor: 'pointer' }}>
                        Reiniciar
                    </button>
                    <button type="button" onClick={openLogcat} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(77,163,255,0.5)', background: 'rgba(77,163,255,0.12)', color: '#fff', cursor: 'pointer' }}>
                        Abrir Logcat
                    </button>
                    
                    <button
                        type="button"
                        onClick={() => requireExpertForDangerousAction('reboot bootloader / flasheo', () => notify('Acción avanzada permitida por modo experto.', { icon: 'info' }))}
                        style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,153,0,0.5)', background: 'rgba(255,153,0,0.08)', color: 'var(--color-text, #101828)', cursor: 'pointer' }}
                    >
                        Acción avanzada
                    </button>
                </div>
            </div>
        </LunaModal>
    )
}
