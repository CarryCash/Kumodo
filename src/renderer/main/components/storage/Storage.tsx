import { observer } from 'mobx-react-lite'
import { useEffect, useState } from 'react'
import store from '../../store'
import Style from './Storage.module.scss'
import LunaToolbar, { LunaToolbarSpace } from 'luna-toolbar/react'
import ToolbarIcon from 'share/renderer/components/ToolbarIcon'
import { IStorageRamStats } from 'common/types'
import { notify } from 'share/renderer/lib/util'
import className from 'licia/className'

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default observer(function Storage() {
  const { device } = store
  const [stats, setStats] = useState<IStorageRamStats | null>(null)
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
      const data = await main.getStorageRamStats(device.id)
      setStats(data)
    } catch (e) {
      notify('Error obteniendo almacenamiento/RAM', { icon: 'error' })
    }
    setLoading(false)
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

  const storageUsed = stats.storageTotal - stats.storageFree
  const storagePercent = stats.storageTotal > 0 ? (storageUsed / stats.storageTotal) * 100 : 0

  const memUsed = stats.memTotal - stats.memAvailable
  const memPercent = stats.memTotal > 0 ? (memUsed / stats.memTotal) * 100 : 0

  return (
    <div className={className('panel-with-toolbar', Style.container)}>
      <LunaToolbar className="panel-toolbar">
        <LunaToolbarSpace />
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
            <div className={Style.cardHeader}>
              <div className={Style.cardLabel}>Almacenamiento (ROM)</div>
              <span className={Style.cardIcon}>💾</span>
            </div>
            <div className={className(Style.cardValue, storagePercent > 90 && Style.warning)}>
              {formatBytes(storageUsed)}
              <span className={Style.cardSubValue}>/ {formatBytes(stats.storageTotal)}</span>
            </div>
            <div className={Style.progressBg}>
              <div className={className(Style.progressFill, storagePercent > 90 && Style.warningBg)} style={{ width: `${storagePercent}%` }} />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textAlign: 'right' }}>
              {formatBytes(stats.storageFree)} Libres
            </div>
          </div>

          <div className={Style.card}>
            <div className={Style.cardHeader}>
              <div className={Style.cardLabel}>Memoria (RAM)</div>
              <span className={Style.cardIcon}>🧠</span>
            </div>
            <div className={className(Style.cardValue, memPercent > 85 && Style.warning)}>
              {formatBytes(memUsed)}
              <span className={Style.cardSubValue}>/ {formatBytes(stats.memTotal)}</span>
            </div>
            <div className={Style.progressBg}>
              <div className={className(Style.progressFill, memPercent > 85 && Style.warningBg)} style={{ width: `${memPercent}%` }} />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textAlign: 'right', display: 'flex', justifyContent: 'space-between' }}>
              <span>Caché Sistema: {formatBytes(stats.memCached)}</span>
              <span>{formatBytes(stats.memAvailable)} Disponibles</span>
            </div>
          </div>
        </div>

        <div className={Style.sectionTitle}>Aplicaciones con Mayor Consumo de RAM (PSS)</div>
        {stats.appsRamConsumption.length === 0 ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            No hay datos de consumo.
          </div>
        ) : (
          <div className={Style.appsList}>
            {stats.appsRamConsumption.map((app, idx) => (
              <div key={idx} className={Style.appItem}>
                <div className={Style.appName}>{app.packageName}</div>
                <div className={Style.appConsumption}>
                  <span>{formatBytes(app.pss)}</span>
                  <div className={Style.barBg}>
                    <div className={Style.barFill} style={{ width: `${Math.min(app.pss / stats.appsRamConsumption[0].pss * 100, 100)}%` }} />
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
