import { useState, useEffect } from 'react'
import LunaModal from 'luna-modal/react'
import { ISecurityAudit, ISecurityCheckItem } from 'common/types'
import store from '../../store'
import Style from './SecurityAuditModal.module.scss'
import { notify } from 'share/renderer/lib/util'

interface IProps {
  visible: boolean
  onClose: () => void
}

type FilterType = 'all' | 'danger' | 'warning' | 'secure'

export default function SecurityAuditModal({ visible, onClose }: IProps) {
  const [loading, setLoading] = useState(false)
  const [audit, setAudit] = useState<ISecurityAudit | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')

  const { device } = store

  useEffect(() => {
    if (visible && device) {
      runAudit()
    }
  }, [visible, device?.id])

  async function runAudit() {
    if (!device) return
    setLoading(true)
    try {
      const res = await main.auditSecurity(device.id)
      setAudit(res)
    } catch (e: any) {
      console.error('Error running security audit:', e)
      notify('Error al ejecutar la auditoría de seguridad: ' + (e?.message || ''), {
        icon: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  function exportReport() {
    if (!audit) return

    const dateStr = new Date(audit.timestamp).toLocaleString()
    const content = `=====================================================
INFORME DE AUDITORÍA DE SEGURIDAD PROFUNDA ANDROID
=====================================================
Fecha: ${dateStr}
Dispositivo: ${audit.deviceModel || device?.name || 'Desconocido'}
Número de serie / ID: ${audit.serialno || device?.id || 'Desconocido'}
Puntuación de Seguridad: ${audit.score} / 100 (${
      audit.level === 'secure'
        ? 'SEGURO'
        : audit.level === 'warning'
        ? 'PRECAUCIÓN'
        : 'RIESGO CRÍTICO'
    })
=====================================================

RESULTADOS DE LAS VERIFICACIONES:
-----------------------------------------------------
${audit.items
  .map(
    (item, idx) => `
[${idx + 1}] ${item.title.toUpperCase()}
Estado: ${item.status.toUpperCase()}
Resultado: ${item.value}
Detalle técnico: ${item.detail}
${item.recommendation ? `Recomendación: ${item.recommendation}` : ''}
-----------------------------------------------------`
  )
  .join('\n')}

=====================================================
Generado automáticamente por Kumodo
=====================================================
`

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Auditoria_Seguridad_${audit.deviceModel || 'Android'}_${
      audit.serialno || Date.now()
    }.txt`
    a.click()
    URL.revokeObjectURL(url)
    notify('Informe de auditoría exportado con éxito', { icon: 'success' })
  }

  const dangerCount = audit?.items.filter((i) => i.status === 'danger').length || 0
  const warningCount = audit?.items.filter((i) => i.status === 'warning').length || 0
  const secureCount = audit?.items.filter((i) => i.status === 'secure').length || 0

  const filteredItems = (audit?.items || []).filter((item) => {
    if (filter === 'all') return true
    return item.status === filter
  })

  const scoreColor =
    !audit || audit.score >= 80 ? '#52c41a' : audit.score >= 55 ? '#faad14' : '#f5222d'

  const scoreLabel =
    !audit
      ? 'Analizando...'
      : audit.score >= 80
      ? 'Dispositivo Seguro'
      : audit.score >= 55
      ? 'Precaución: Configuraciones Vulnerables'
      : 'Riesgo Crítico de Seguridad'

  return (
    <LunaModal
      title="🛡️ Auditoría de Seguridad Profunda"
      width={760}
      visible={visible}
      onClose={onClose}
    >
      <div className={Style.container}>
        {/* Score banner */}
        <div className={Style.scoreBanner}>
          <div className={Style.scoreLeft}>
            <div
              className={Style.scoreCircle}
              style={{
                borderColor: scoreColor,
                color: scoreColor,
              }}
            >
              {loading ? '...' : audit?.score ?? 0}
              <span>/ 100</span>
            </div>
            <div>
              <div className={Style.scoreTitle} style={{ color: scoreColor }}>
                {loading ? 'Escaneando dispositivo...' : scoreLabel}
              </div>
              <div className={Style.scoreSubtitle}>
                {loading ? (
                  'Verificando FRP, Bootloader, Root, SELinux, Puertos y Certificados...'
                ) : (
                  <>
                    <strong style={{ color: '#f5222d' }}>{dangerCount} críticos</strong> ·{' '}
                    <strong style={{ color: '#faad14' }}>{warningCount} advertencias</strong> ·{' '}
                    <strong style={{ color: '#52c41a' }}>{secureCount} seguros</strong>
                  </>
                )}
              </div>
            </div>
          </div>
          <div>
            <button
              className={`${Style.btn} ${Style.primary}`}
              disabled={loading || !device}
              onClick={runAudit}
            >
              <span className="icon-refresh"></span>
              {loading ? 'Analizando...' : 'Re-auditar'}
            </button>
          </div>
        </div>

        {/* Filters */}
        {audit && (
          <div className={Style.filterRow}>
            <button
              className={`${Style.filterBtn} ${filter === 'all' ? Style.active : ''}`}
              onClick={() => setFilter('all')}
            >
              Todos ({audit.items.length})
            </button>
            <button
              className={`${Style.filterBtn} ${filter === 'danger' ? Style.active : ''}`}
              onClick={() => setFilter('danger')}
            >
              🔴 Críticos ({dangerCount})
            </button>
            <button
              className={`${Style.filterBtn} ${filter === 'warning' ? Style.active : ''}`}
              onClick={() => setFilter('warning')}
            >
              🟡 Advertencias ({warningCount})
            </button>
            <button
              className={`${Style.filterBtn} ${filter === 'secure' ? Style.active : ''}`}
              onClick={() => setFilter('secure')}
            >
              🟢 Seguros ({secureCount})
            </button>
          </div>
        )}

        {/* Checks List */}
        <div className={Style.itemsList}>
          {filteredItems.map((item: ISecurityCheckItem) => (
            <div
              key={item.id}
              className={`${Style.itemCard} ${Style[item.status]}`}
            >
              <div className={Style.itemHeader}>
                <div className={Style.itemTitleGroup}>
                  <span style={{ fontSize: 16 }}>
                    {item.status === 'secure'
                      ? '🟢'
                      : item.status === 'warning'
                      ? '🟡'
                      : '🔴'}
                  </span>
                  <div>
                    <div className={Style.itemTitle}>{item.title}</div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>{item.description}</div>
                  </div>
                </div>
                <div className={`${Style.itemBadge} ${Style[item.status]}`}>
                  {item.status === 'secure'
                    ? 'Protegido'
                    : item.status === 'warning'
                    ? 'Advertencia'
                    : 'Riesgo'}
                </div>
              </div>

              <div className={Style.itemValue}>{item.value}</div>
              <div className={Style.itemDetail}>{item.detail}</div>

              {item.recommendation && (
                <div className={Style.itemRec}>
                  <span>💡</span>
                  <span>{item.recommendation}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer actions */}
        <div className={Style.actionBar}>
          <button
            className={Style.btn}
            disabled={!audit || loading}
            onClick={exportReport}
          >
            <span className="icon-save"></span>
            Exportar Informe TXT
          </button>
          <button className={Style.btn} onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </LunaModal>
  )
}
