import { useState } from 'react'
import LunaModal from 'luna-modal/react'
import { createPortal } from 'react-dom'
import { IJunkItem } from 'common/types'
import store from '../../store'
import fileSize from 'licia/fileSize'

import { notify } from 'share/renderer/lib/util'

interface IProps {
  onClose: () => void
}

type Phase = 'idle' | 'scanning' | 'results' | 'cleaning' | 'done'

const categoryLabels: Record<string, string> = {
  cache: '📦 Caché de apps',
  temp: '🗑️ Archivos temporales',
  apk: '📱 APKs en Descargas',
  orphan: '👻 Carpetas huérfanas',
  report: '🧾 Reportes de error y tombstones',
}

const categoryColors: Record<string, string> = {
  cache: '#1677ff',
  temp: '#fa8c16',
  apk: '#52c41a',
  orphan: '#f5222d',
  report: '#fa541c',
}

export default function CleanerModal({ onClose }: IProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [items, setItems] = useState<IJunkItem[]>([])
  const [freedBytes, setFreedBytes] = useState(0)
  const [progress, setProgress] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { device } = store

  async function scan() {
    if (!device) {
      notify('No hay dispositivo conectado', { icon: 'error' })
      return
    }
    setPhase('scanning')
    setProgress('Analizando almacenamiento y caché...')
    try {
      const found: IJunkItem[] = await main.scanJunk(device.id)
      setItems(found)
      setSelected(new Set(found.map((i) => i.path)))
      setPhase('results')
    } catch (e: any) {
      console.error('Error al analizar basura:', e)
      notify('Error al analizar: ' + (e?.message || 'Fallo de conexión ADB'), { icon: 'error' })
      setPhase('idle')
    }
  }

  async function clean() {
    if (!device) return
    setPhase('cleaning')
    const toClean = items.filter((i) => selected.has(i.path))
    setProgress(`Limpiando ${toClean.length} elementos...`)
    try {
      const freed = await main.cleanJunk(device.id, toClean)
      setFreedBytes(freed)
      setPhase('done')
    } catch (e: any) {
      console.error('Error al limpiar:', e)
      notify('Error al limpiar: ' + (e?.message || 'Error desconocido'), { icon: 'error' })
      setPhase('results')
    }
  }

  function toggleItem(path: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const totalSelected = items
    .filter((i) => selected.has(i.path))
    .reduce((acc, i) => acc + i.size, 0)

  const byCategory = items.reduce(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = []
      acc[item.category].push(item)
      return acc
    },
    {} as Record<string, IJunkItem[]>
  )

  return createPortal(
    <LunaModal
      title="🧹 Limpiador Inteligente"
      width={700}
      visible={true}
      onClose={onClose}
    >
      <div style={{ minHeight: 340, fontFamily: 'inherit', padding: '8px 0' }}>
        {/* IDLE */}
        {phase === 'idle' && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🧹</div>
            <div style={{ fontSize: 16, marginBottom: 8, fontWeight: 600 }}>
              Limpiador Inteligente
            </div>
            <div style={{ opacity: 0.6, marginBottom: 28, fontSize: 13 }}>
              Detecta caché, archivos temporales, APKs y carpetas huérfanas
            </div>
            <button onClick={scan} style={btnStyle('#1677ff')}>
              Analizar dispositivo
            </button>
          </div>
        )}

        {/* SCANNING */}
        {phase === 'scanning' && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Escaneando...</div>
            <div style={{ opacity: 0.6, fontSize: 13 }}>{progress}</div>
            <div style={{ marginTop: 24 }}>
              <LoadingDots />
            </div>
          </div>
        )}

        {/* RESULTS */}
        {phase === 'results' && (
          <div>
            {items.length === 0 ? (
              <div style={{ textAlign: 'center', paddingTop: 60 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                <div style={{ fontWeight: 600 }}>¡El dispositivo está limpio!</div>
                <div style={{ opacity: 0.6, fontSize: 13, marginTop: 8 }}>
                  No se encontró basura
                </div>
              </div>
            ) : (
              <>
                {/* Summary banner */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, #1677ff22, #1677ff08)',
                    border: '1px solid #1677ff44',
                    borderRadius: 10,
                    padding: '14px 18px',
                    marginBottom: 16,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      Puedes liberar{' '}
                      <span style={{ color: '#1677ff' }}>
                        {fileSize(totalSelected)}
                      </span>
                    </div>
                    <div style={{ opacity: 0.6, fontSize: 12, marginTop: 2 }}>
                      {selected.size} elementos seleccionados de {items.length}
                    </div>
                  </div>
                  <button onClick={clean} style={btnStyle('#1677ff')}>
                    Limpiar ahora
                  </button>
                </div>

                {/* Categories */}
                <div
                  style={{
                    maxHeight: 260,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  {Object.entries(byCategory).map(([cat, catItems]) => (
                    <div key={cat}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 12,
                          color: categoryColors[cat],
                          marginBottom: 4,
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                        }}
                      >
                        {categoryLabels[cat]} — {catItems.length} ítem(s)
                      </div>
                      {catItems.map((item) => (
                        <label
                          key={item.path}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '5px 10px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            background: selected.has(item.path)
                              ? `${categoryColors[cat]}11`
                              : 'transparent',
                            marginBottom: 2,
                            fontSize: 12,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(item.path)}
                            onChange={() => toggleItem(item.path)}
                            style={{ accentColor: categoryColors[cat] }}
                          />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.label}
                          </span>
                          <span style={{ opacity: 0.5, flexShrink: 0 }}>
                            {fileSize(item.size)}
                          </span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* CLEANING */}
        {phase === 'cleaning' && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🗑️</div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Limpiando...</div>
            <div style={{ opacity: 0.6, fontSize: 13 }}>{progress}</div>
            <div style={{ marginTop: 24 }}>
              <LoadingDots />
            </div>
          </div>
        )}

        {/* DONE */}
        {phase === 'done' && (
          <div style={{ textAlign: 'center', paddingTop: 50 }}>
            <div style={{ fontSize: 64, marginBottom: 12 }}>🎉</div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>
              ¡Limpieza completada!
            </div>
            <div style={{ fontSize: 28, color: '#52c41a', fontWeight: 700, marginBottom: 8 }}>
              {fileSize(freedBytes)} liberados
            </div>
            <div style={{ opacity: 0.6, fontSize: 13, marginBottom: 28 }}>
              Tu dispositivo está más limpio 🚀
            </div>
            <button onClick={() => { setPhase('idle'); setItems([]); setFreedBytes(0) }} style={btnStyle('#52c41a')}>
              Limpiar de nuevo
            </button>
          </div>
        )}
      </div>
    </LunaModal>,
    document.body
  )
}

function btnStyle(color: string): React.CSSProperties {
  return {
    background: color,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '9px 24px',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    boxShadow: `0 2px 8px ${color}55`,
  }
}

function LoadingDots() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#1677ff',
            animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
