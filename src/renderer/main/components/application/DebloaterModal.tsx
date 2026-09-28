import LunaModal from 'luna-modal/react'
import { observer } from 'mobx-react-lite'
import { createPortal } from 'react-dom'
import { useEffect, useMemo, useState } from 'react'
import store from '../../store'
import { IDebloatPackage } from 'common/types'
import Style from './DebloaterModal.module.scss'
import { notify } from 'share/renderer/lib/util'
import className from 'licia/className'
import { analyzeDebloatWithGemini } from '../../lib/ai'

interface IProps {
  visible: boolean
  onClose: () => void
}

export default observer(function DebloaterModal(props: IProps) {
  const { visible, onClose } = props
  const { device } = store

  const [loading, setLoading] = useState(false)
  const [packages, setPackages] = useState<IDebloatPackage[]>([])
  const [selectedPkgs, setSelectedPkgs] = useState<Set<string>>(new Set())
  const [filterMfg, setFilterMfg] = useState<string>('all')
  const [filterCat, setFilterCat] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [processing, setProcessing] = useState(false)
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false)
  const [deviceBrand, setDeviceBrand] = useState('')
  const [deviceModel, setDeviceModel] = useState('')

  useEffect(() => {
    if (visible && device) {
      loadList()
    }
  }, [visible, device ? device.id : null])

  async function loadList() {
    if (!device) return
    setLoading(true)
    setSelectedPkgs(new Set())
    try {
      const [list, diag] = await Promise.all([
        main.getDebloatList(device.id),
        main.getDiagnostic(device.id).catch(() => null),
      ])
      setPackages(list)
      if (diag) {
        setDeviceBrand(diag.brand || device.name)
        setDeviceModel(diag.model || '')
      } else {
        setDeviceBrand(device.name)
        setDeviceModel('')
      }
    } catch {
      notify('Error al cargar lista de bloatware', { icon: 'error' })
    } finally {
      setLoading(false)
    }
  }

  // Filtered packages
  const filtered = useMemo(() => {
    return packages.filter((p) => {
      if (filterMfg !== 'all' && p.manufacturer !== filterMfg) return false
      if (filterCat === 'safe' && p.category !== 'safe') return false
      if (filterCat === 'risky' && p.category !== 'risky') return false
      if (filterCat === 'disabled' && p.isEnabled) return false
      if (filterCat === 'enabled' && !p.isEnabled) return false
      if (search) {
        const q = search.toLowerCase()
        if (!p.name.toLowerCase().includes(q) && !p.package.toLowerCase().includes(q)) {
          return false
        }
      }
      return true
    })
  }, [packages, filterMfg, filterCat, search])

  // Select all safe packages
  function selectAllSafe() {
    const next = new Set<string>()
    for (const p of filtered) {
      if (p.category === 'safe' && p.isEnabled) {
        next.add(p.package)
      }
    }
    setSelectedPkgs(next)
    notify(`${next.size} paquetes seguros seleccionados`, { icon: 'info' })
  }

  function togglePkg(pkgName: string) {
    const next = new Set(selectedPkgs)
    if (next.has(pkgName)) {
      next.delete(pkgName)
    } else {
      next.add(pkgName)
    }
    setSelectedPkgs(next)
  }

  async function analyzeWithGemini() {
    if (!device || packages.length === 0 || isAiAnalyzing) return
    if (!store.settings.geminiApiKey) {
      notify('Configura tu API Key de Gemini en Ajustes (⚙️) para habilitar el análisis en vivo con IA', { icon: 'error' })
      return
    }

    setIsAiAnalyzing(true)
    notify('Consultando con Gemini IA en la web para clasificar paquetes de este dispositivo...', { icon: 'info' })
    try {
      const packageNames = packages.map((p) => p.package)
      const aiMap = await analyzeDebloatWithGemini(
        packageNames,
        deviceBrand || device.name,
        deviceModel || ''
      )

      const analyzedCount = Object.keys(aiMap).length
      if (analyzedCount > 0) {
        setPackages((prev) =>
          prev.map((pkg) => {
            const aiData = aiMap[pkg.package]
            if (aiData) {
              return {
                ...pkg,
                name: aiData.name || pkg.name,
                category: aiData.category,
                description: aiData.description,
                dependencies: aiData.dependencies,
              }
            }
            return pkg
          })
        )
        notify(`¡Gemini clasificó con éxito ${analyzedCount} aplicaciones con información en vivo!`, { icon: 'success' })
      } else {
        notify('Gemini no encontró bloatware crítico adicional en los paquetes analizados', { icon: 'info' })
      }
    } catch {
      notify('Error en la consulta con Gemini', { icon: 'error' })
    } finally {
      setIsAiAnalyzing(false)
    }
  }

  function toggleSelectAll() {
    if (selectedPkgs.size === filtered.length && filtered.length > 0) {
      setSelectedPkgs(new Set())
    } else {
      setSelectedPkgs(new Set(filtered.map((p) => p.package)))
    }
  }

  // Execute action on selected
  async function handleBatchAction(action: 'disable' | 'uninstall' | 'enable') {
    if (!device || selectedPkgs.size === 0 || processing) return

    let actionText = 'reactivar'
    if (action === 'disable') {
      actionText = 'desactivar'
    } else if (action === 'uninstall') {
      actionText = 'desinstalar para el usuario'
    }

    const confirm = window.confirm(
      `¿Deseas ${actionText} los ${selectedPkgs.size} paquetes seleccionados?`
    )
    if (!confirm) return

    setProcessing(true)
    let okCount = 0
    for (const pkg of Array.from(selectedPkgs)) {
      const ok = await main.debloatAction(device.id, pkg, action)
      if (ok) okCount++
    }

    notify(
      `Acción completada: ${okCount} de ${selectedPkgs.size} paquetes procesados`,
      { icon: 'success' }
    )
    setProcessing(false)
    loadList()
  }

  // Restore all disabled
  async function handleRestoreAll() {
    if (!device || processing) return
    const disabledPkgs = packages.filter((p) => !p.isEnabled).map((p) => p.package)
    if (disabledPkgs.length === 0) {
      notify('No hay aplicaciones desactivadas para restaurar', { icon: 'info' })
      return
    }

    const confirm = window.confirm(
      `Se reactivarán ${disabledPkgs.length} aplicaciones desactivadas. ¿Continuar?`
    )
    if (!confirm) return

    setProcessing(true)
    const res = await main.restoreAllDebloat(device.id, disabledPkgs)
    notify(
      `Restauración completa: ${res.restored} apps reactivadas`,
      { icon: 'success' }
    )
    setProcessing(false)
    loadList()
  }

  const allSelected = filtered.length > 0 && selectedPkgs.size === filtered.length
  const disabledCount = packages.filter((p) => !p.isEnabled).length

  return createPortal(
    <LunaModal
      title="🔧 Debloater Inteligente (Desinstalador de Bloatware)"
      width={900}
      visible={visible}
      onClose={onClose}
    >
      <div className={Style.modalBody}>
        {/* Top Controls */}
        <div className={Style.topBar}>
          <div className={Style.filters}>
            <select
              className={Style.filterSelect}
              value={filterMfg}
              onChange={(e) => setFilterMfg(e.target.value)}
            >
              <option value="all">Todas las marcas</option>
              <option value="samsung">Samsung</option>
              <option value="xiaomi">Xiaomi / MIUI</option>
              <option value="motorola">Motorola</option>
              <option value="google">Google / AOSP</option>
              <option value="oppo">Oppo / Realme</option>
              <option value="carrier">Operadoras / Preloads</option>
            </select>

            <select
              className={Style.filterSelect}
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
            >
              <option value="all">Todas las categorías</option>
              <option value="safe">🟢 Solo Seguras (Safe)</option>
              <option value="risky">🟡 Avanzadas / Riesgosas (Risky)</option>
              <option value="disabled">⚪ Desactivadas actualmente</option>
            </select>

            <input
              className={Style.searchInput}
              type="text"
              placeholder="Buscar por nombre o paquete..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={className(Style.btn, Style.success)}
              onClick={selectAllSafe}
              disabled={loading || processing}
              title="Selecciona automáticamente todas las apps que es 100% seguro remover"
            >
              ✓ Seleccionar Seguras
            </button>

            {disabledCount > 0 && (
              <button
                className={className(Style.btn, Style.primary)}
                onClick={handleRestoreAll}
                disabled={processing}
                title="Reactiva todas las apps del sistema que hayan sido desactivadas"
              >
                ↺ Restaurar Todo ({disabledCount})
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className={Style.statsBar}>
          <span>
            Mostrando <strong>{filtered.length}</strong> de{' '}
            <strong>{packages.length}</strong> paquetes detectados
            {selectedPkgs.size > 0 && (
              <>
                {' • '}
                <strong style={{ color: '#60a5fa' }}>
                  {selectedPkgs.size} seleccionados
                </strong>
              </>
            )}
          </span>
          {disabledCount > 0 && (
            <span style={{ color: '#94a3b8' }}>
              {disabledCount} apps desactivadas actualmente
            </span>
          )}
        </div>

        {/* Table */}
        <div className={Style.tableContainer}>
          {loading ? (
            <div className={Style.emptyState}>Escaneando paquetes del dispositivo...</div>
          ) : filtered.length === 0 ? (
            <div className={Style.emptyState}>
              No se encontraron paquetes con los filtros actuales
            </div>
          ) : (
            <table className={Style.packageTable}>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th>Aplicación / Paquete</th>
                  <th>Categoría</th>
                  <th>Descripción & Dependencias</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((pkg) => {
                  const isSelected = selectedPkgs.has(pkg.package)
                  return (
                    <tr
                      key={pkg.package}
                      className={className({ [Style.selected]: isSelected })}
                      onClick={() => togglePkg(pkg.package)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>

                      <td>
                        <div className={Style.pkgInfo}>
                          <span className={Style.pkgName}>{pkg.name}</span>
                          <span className={Style.pkgCode}>{pkg.package}</span>
                        </div>
                      </td>

                      <td>
                        <span
                          className={className(Style.badge, {
                            [Style.safe]: pkg.category === 'safe',
                            [Style.risky]: pkg.category === 'risky',
                            [Style.danger]: pkg.category === 'danger',
                          })}
                        >
                          {pkg.category === 'safe' && '🟢 Seguro'}
                          {pkg.category === 'risky' && '🟡 Riesgoso'}
                          {pkg.category !== 'safe' && pkg.category !== 'risky' && '🔴 Crítico'}
                        </span>
                      </td>

                      <td className={Style.descCol}>
                        <div>{pkg.description}</div>
                        {pkg.dependencies && (
                          <div className={Style.dependenciesWarn}>
                            ⚠️ {pkg.dependencies}
                          </div>
                        )}
                      </td>

                      <td>
                        <span
                          className={className(Style.badge, {
                            [Style.safe]: pkg.isEnabled,
                            [Style.disabled]: !pkg.isEnabled,
                          })}
                        >
                          {pkg.isEnabled ? 'Activo' : 'Desactivado'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Bottom Actions */}
        <div className={Style.bottomBar}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className={className(Style.btn, Style.ai)}
              onClick={analyzeWithGemini}
              disabled={loading || isAiAnalyzing || packages.length === 0}
              title="Usa Gemini IA para analizar cada paquete en tiempo real según el fabricante del dispositivo"
            >
              {isAiAnalyzing ? '⏳ Analizando con IA...' : '✨ Analizar con Gemini IA'}
            </button>

            <button
              className={className(Style.btn, Style.warning)}
              disabled={selectedPkgs.size === 0 || processing}
              onClick={() => handleBatchAction('disable')}
              title="Congela las apps sin eliminarlas (Reversible)"
            >
              ⏸ Desactivar ({selectedPkgs.size})
            </button>

            <button
              className={className(Style.btn, Style.danger)}
              disabled={selectedPkgs.size === 0 || processing}
              onClick={() => handleBatchAction('uninstall')}
              title="Desinstala las apps para el usuario actual (pm uninstall -k --user 0)"
            >
              🗑️ Desinstalar para usuario ({selectedPkgs.size})
            </button>

            <button
              className={className(Style.btn, Style.success)}
              disabled={selectedPkgs.size === 0 || processing}
              onClick={() => handleBatchAction('enable')}
              title="Vuelve a activar las apps seleccionadas"
            >
              ▶ Reactivar ({selectedPkgs.size})
            </button>
          </div>

          <button className="luna-modal-button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </LunaModal>,
    document.body
  )
})
