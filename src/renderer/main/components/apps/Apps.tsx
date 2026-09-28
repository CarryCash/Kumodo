import { observer } from 'mobx-react-lite'
import { useEffect, useState, useMemo } from 'react'
import store from '../../store'
import Style from './Apps.module.scss'
import LunaToolbar, { LunaToolbarSpace } from 'luna-toolbar/react'
import ToolbarIcon from 'share/renderer/components/ToolbarIcon'
import { IAppInfo } from 'common/types'
import { notify } from 'share/renderer/lib/util'
import className from 'licia/className'

type FilterMode = 'all' | 'user' | 'system' | 'dangerous' | 'battery' | 'disabled'

const DANGER_LABEL: Record<IAppInfo['dangerLevel'], string> = {
  high: '🔴 Alto Riesgo',
  medium: '🟡 Riesgo Medio',
  low: '🟢 Bajo Riesgo',
  none: '✅ Sin Riesgo',
}

const DANGER_CLASS: Record<IAppInfo['dangerLevel'], string> = {
  high: Style.dangerHigh,
  medium: Style.dangerMedium,
  low: Style.dangerLow,
  none: Style.dangerNone,
}

export default observer(function Apps() {
  const { device } = store
  const [apps, setApps] = useState<IAppInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<FilterMode>('all')
  const [search, setSearch] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    if (device) {
      refresh()
    }
  }, [device])

  async function refresh() {
    if (!device) return
    setLoading(true)
    setApps([])
    try {
      const data = await main.getAppAnalysis(device.id)
      setApps(data)
    } catch (e) {
      notify('Error analizando apps', { icon: 'error' })
    }
    setLoading(false)
  }

  async function handleToggle(app: IAppInfo) {
    const action = app.enabled ? 'desactivar' : 'activar'
    const warning = app.isSystem
      ? `⚠️ CUIDADO: Esta es una app del SISTEMA. Desactivarla puede causar inestabilidad.\n\n¿Seguro que deseas ${action} "${app.packageName}"?`
      : `¿Deseas ${action} "${app.packageName}"?`

    if (!confirm(warning)) return

    setToggling(app.packageName)
    try {
      await main.toggleApp(device!.id, app.packageName, !app.enabled)
      setApps(prev => prev.map(a =>
        a.packageName === app.packageName ? { ...a, enabled: !a.enabled } : a
      ))
      notify(`App ${!app.enabled ? 'activada' : 'desactivada'} correctamente`, { icon: 'success' })
    } catch (e) {
      notify('Error al cambiar estado de la app', { icon: 'error' })
    }
    setToggling(null)
  }

  const filtered = useMemo(() => {
    let list = apps
    if (filter === 'user') list = list.filter(a => !a.isSystem)
    else if (filter === 'system') list = list.filter(a => a.isSystem)
    else if (filter === 'dangerous') list = list.filter(a => a.dangerLevel === 'high' || a.dangerLevel === 'medium')
    else if (filter === 'battery') list = list.filter(a => a.batteryUser)
    else if (filter === 'disabled') list = list.filter(a => !a.enabled)

    if (search.trim()) {
      list = list.filter(a => a.packageName.toLowerCase().includes(search.toLowerCase()))
    }

    return list
  }, [apps, filter, search])

  const dangerCount = apps.filter(a => a.dangerLevel === 'high' || a.dangerLevel === 'medium').length
  const batteryCount = apps.filter(a => a.batteryUser).length
  const disabledCount = apps.filter(a => !a.enabled).length

  return (
    <div className={className('panel-with-toolbar', Style.container)}>
      <LunaToolbar className="panel-toolbar">
        <LunaToolbarSpace />
        <ToolbarIcon
          icon="refresh"
          title={loading ? 'Cargando... (puede tardar 1-2 min)' : 'Refrescar análisis'}
          disabled={loading || !device}
          onClick={refresh}
        />
      </LunaToolbar>

      <div className={Style.body}>
        <div className={Style.filters}>
          {(['all', 'user', 'system', 'dangerous', 'battery', 'disabled'] as FilterMode[]).map(f => (
            <button
              key={f}
              className={className(Style.filterBtn, filter === f && Style.active)}
              onClick={() => setFilter(f)}
            >
              {f === 'all' && `Todas (${apps.length})`}
              {f === 'user' && 'Usuario'}
              {f === 'system' && 'Sistema'}
              {f === 'dangerous' && `⚠️ Peligrosas (${dangerCount})`}
              {f === 'battery' && `🔋 Batería (${batteryCount})`}
              {f === 'disabled' && `Desactivadas (${disabledCount})`}
            </button>
          ))}
          <input
            className={Style.searchInput}
            placeholder="Buscar por nombre..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading && (
          <div className={Style.stats}>
            ⏳ Analizando permisos y consumo... Esto puede tardar 1-2 minutos dependiendo del número de apps instaladas.
          </div>
        )}

        {!loading && apps.length > 0 && (
          <div className={Style.stats}>
            {filtered.length} apps mostradas · {dangerCount} con riesgo · {batteryCount} consumiendo batería
          </div>
        )}

        <div className={Style.appList}>
          {filtered.map(app => (
            <div key={app.packageName} className={Style.appItem}>
              <div className={Style.appLeft}>
                <div className={Style.appHeader}>
                  <span className={Style.appName}>{app.packageName}</span>
                  <span className={className(Style.badge, app.isSystem ? Style.badgeSystem : Style.badgeUser)}>
                    {app.isSystem ? 'Sistema' : 'Usuario'}
                  </span>
                  {!app.enabled && (
                    <span className={className(Style.badge, Style.badgeDisabled)}>Desactivada</span>
                  )}
                  <span className={className(Style.badge, DANGER_CLASS[app.dangerLevel])}>
                    {DANGER_LABEL[app.dangerLevel]}
                  </span>
                </div>

                {app.suspiciousReasons.length > 0 && (
                  <div className={Style.suspiciousReasons}>
                    🚨 {app.suspiciousReasons.join(' · ')}
                  </div>
                )}

                {app.dangerousPermissions.length > 0 && (
                  <div className={Style.permissionsRow}>
                    {app.dangerousPermissions.map(p => (
                      <span key={p} className={className(Style.permTag, Style.permTagDanger)}>
                        {p}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className={Style.appRight}>
                {app.batteryUser && (
                  <div className={Style.batteryIndicator}>🔋 Consume batería</div>
                )}
                <button
                  className={className(Style.toggleBtn, app.enabled && Style.disableBtn)}
                  disabled={toggling === app.packageName}
                  onClick={() => handleToggle(app)}
                >
                  {toggling === app.packageName ? '...' : app.enabled ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          ))}

          {!loading && filtered.length === 0 && (
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '13px', padding: '16px' }}>
              {apps.length === 0
                ? 'Presiona Refrescar para cargar el análisis de apps.'
                : 'No hay apps que coincidan con el filtro.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
