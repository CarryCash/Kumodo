import { observer } from 'mobx-react-lite'
import { useEffect, useState } from 'react'
import store from '../../store'
import Style from './Battery.module.scss'
import LunaToolbar, { LunaToolbarSpace } from 'luna-toolbar/react'
import ToolbarIcon from 'share/renderer/components/ToolbarIcon'
import { IBatteryStats } from 'common/types'
import { notify } from 'share/renderer/lib/util'
import className from 'licia/className'

export default observer(function Battery() {
  const { device } = store
  const [stats, setStats] = useState<IBatteryStats | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (device) {
      refresh()
    }
  }, [device])

  async function refresh() {
    if (!device) return
    setLoading(true)
    try {
      const data = await main.getBatteryStats(device.id)
      setStats(data)
    } catch (e) {
      notify('Error obteniendo batería', { icon: 'error' })
    }
    setLoading(false)
  }

  async function resetStats() {
    if (!device) return
    if (!confirm('¿Deseas resetear las estadísticas de batería? (Ideal tras cambiar la batería física)')) return
    try {
      await main.resetBatteryStats(device.id)
      notify('Estadísticas reseteadas', { icon: 'success' })
      refresh()
    } catch (e) {
      notify('Error al resetear', { icon: 'error' })
    }
  }

  if (!stats) {
    return (
      <div className={className('panel-with-toolbar', Style.container)}>
        <LunaToolbar className="panel-toolbar">
          <ToolbarIcon
            icon="refresh"
            title="Refrescar"
            disabled={loading || !device}
            onClick={refresh}
          />
        </LunaToolbar>
        <div className={Style.body}>Cargando datos...</div>
      </div>
    )
  }

  return (
    <div className={className('panel-with-toolbar', Style.container)}>
      <LunaToolbar className="panel-toolbar">
        <LunaToolbarSpace />
        <ToolbarIcon
          icon="delete"
          title="Resetear estadísticas (dumpsys batterystats --reset)"
          disabled={loading || !device}
          onClick={resetStats}
        />
        <ToolbarIcon
          icon="refresh"
          title="Refrescar"
          disabled={loading || !device}
          onClick={refresh}
        />
      </LunaToolbar>

      <div className={Style.body}>
        {stats.warnings && stats.warnings.length > 0 && (
          <div className={Style.warningBox}>
            <div className={Style.warningTitle}>⚠️ Alertas de Diagnóstico</div>
            {stats.warnings.map((w, i) => (
              <div key={i} className={Style.warningItem}>{w}</div>
            ))}
          </div>
        )}

        <div className={Style.cards}>
          <div className={Style.card}>
            <div className={Style.cardLabel}>Nivel de Batería</div>
            <div className={className(Style.cardValue, stats.level < 15 && Style.warning)}>
              <span className={Style.cardIcon}>🔋</span>
              {stats.level}%
            </div>
          </div>
          <div className={Style.card}>
            <div className={Style.cardLabel}>Temperatura</div>
            <div className={className(Style.cardValue, stats.temperature > 400 && Style.warning)}>
              <span className={Style.cardIcon}>🌡️</span>
              {stats.temperature / 10}°C
            </div>
          </div>
          <div className={Style.card}>
            <div className={Style.cardLabel}>Voltaje</div>
            <div className={Style.cardValue}>
              <span className={Style.cardIcon}>⚡</span>
              {(stats.voltage / 1000).toFixed(2)} V
            </div>
          </div>
          <div className={Style.card}>
            <div className={Style.cardLabel}>Estado y Salud</div>
            <div className={className(Style.cardValue, stats.health !== 'Good' && stats.health !== 'Unknown' && Style.warning)}>
              <span className={Style.cardIcon}>❤️</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '16px' }}>{stats.status}</span>
                <span style={{ fontSize: '13px', fontWeight: 'normal', color: 'var(--color-text-secondary)' }}>
                  {stats.health} ({stats.technology})
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className={Style.sectionTitle}>Consumo Estimado por App (Wakelocks / CPU)</div>
        {stats.appsConsumption.length === 0 ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            No hay datos suficientes de consumo. Prueba interactuar con el dispositivo.
          </div>
        ) : (
          <div className={Style.appsList}>
            {stats.appsConsumption.map((app, idx) => (
              <div key={idx} className={Style.appItem}>
                <div className={Style.appName}>{app.packageName}</div>
                <div className={Style.appConsumption}>
                  <span>{app.percent.toFixed(1)} mAh</span>
                  <div className={Style.barBg}>
                    <div className={Style.barFill} style={{ width: `${Math.min(app.percent / stats.appsConsumption[0].percent * 100, 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})
