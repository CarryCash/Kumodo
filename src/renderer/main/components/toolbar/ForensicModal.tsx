import LunaModal from 'luna-modal/react'
import { observer } from 'mobx-react-lite'
import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import store from '../../store'
import {
  IForensicCallLog,
  IForensicSms,
  IForensicContact,
  IForensicUninstalledApp,
  IForensicDeletedFile,
} from 'common/types'
import Style from './ForensicModal.module.scss'
import { notify } from 'share/renderer/lib/util'
import className from 'licia/className'
import download from 'licia/download'
import dateFormat from 'licia/dateFormat'
import fileSize from 'licia/fileSize'

type ForensicTab = 'calls' | 'sms' | 'contacts' | 'apps' | 'files'

interface IProps {
  visible: boolean
  onClose: () => void
}

const TAB_LABELS: Record<ForensicTab, string> = {
  calls: '📞 Llamadas',
  sms: '💬 SMS',
  contacts: '👤 Contactos',
  apps: '🗂️ Apps Residuales',
  files: '🗑️ Archivos Borrados',
}

export default observer(function ForensicModal(props: IProps) {
  const { visible, onClose } = props
  const { device } = store

  const [tab, setTab] = useState<ForensicTab>('calls')
  const [loading, setLoading] = useState(false)

  const [calls, setCalls] = useState<IForensicCallLog[]>([])
  const [sms, setSms] = useState<IForensicSms[]>([])
  const [contacts, setContacts] = useState<IForensicContact[]>([])
  const [apps, setApps] = useState<IForensicUninstalledApp[]>([])
  const [deletedFiles, setDeletedFiles] = useState<IForensicDeletedFile[]>([])

  const [search, setSearch] = useState('')

  useEffect(() => {
    if (visible && device) {
      loadTab(tab)
    }
  }, [visible, device ? device.id : null, tab])

  async function loadTab(t: ForensicTab) {
    if (!device) return
    setLoading(true)
    setSearch('')
    try {
      switch (t) {
        case 'calls': {
          const data = await main.getForensicCallLog(device.id)
          setCalls(data)
          break
        }
        case 'sms': {
          const data = await main.getForensicSms(device.id)
          setSms(data)
          break
        }
        case 'contacts': {
          const data = await main.getForensicContacts(device.id)
          setContacts(data)
          break
        }
        case 'apps': {
          const data = await main.getForensicUninstalledApps(device.id)
          setApps(data)
          break
        }
        case 'files': {
          const data = await main.getForensicDeletedFiles(device.id)
          setDeletedFiles(data)
          break
        }
      }
    } catch {
      notify('Error al obtener datos forenses del dispositivo', { icon: 'error' })
    } finally {
      setLoading(false)
    }
  }

  function handleTabChange(t: ForensicTab) {
    setTab(t)
  }

  // ── Export CSV ──────────────────────────────────────────────────────────────
  function exportCallsCsv() {
    if (calls.length === 0) return
    const header = 'Número,Nombre,Fecha,Duración (s),Tipo\n'
    const rows = calls
      .map((c) =>
        [
          `"${c.number}"`,
          `"${c.name || ''}"`,
          `"${new Date(c.date).toLocaleString()}"`,
          c.duration,
          c.type,
        ].join(',')
      )
      .join('\n')
    download(header + rows, `llamadas-${dateFormat('yyyymmdd')}.csv`, 'text/csv')
    notify('Historial de llamadas exportado como CSV', { icon: 'success' })
  }

  function exportSmsCsv() {
    if (sms.length === 0) return
    const header = 'Número,Fecha,Tipo,Leído,Mensaje\n'
    const rows = sms
      .map((s) =>
        [
          `"${s.address}"`,
          `"${new Date(s.date).toLocaleString()}"`,
          s.type === 'sent' ? 'Enviado' : 'Recibido',
          s.read ? 'Sí' : 'No',
          `"${s.body.replace(/"/g, "'").replace(/\n/g, ' ')}"`,
        ].join(',')
      )
      .join('\n')
    download(header + rows, `sms-${dateFormat('yyyymmdd')}.csv`, 'text/csv')
    notify('SMS exportados como CSV', { icon: 'success' })
  }

  function exportVcf() {
    if (contacts.length === 0) return
    const vcf = contacts
      .map(
        (c) =>
          `BEGIN:VCARD\nVERSION:3.0\nFN:${c.name}\nTEL:${c.number}\nEND:VCARD`
      )
      .join('\n')
    download(vcf, `contactos-${dateFormat('yyyymmdd')}.vcf`, 'text/x-vcard')
    notify(`${contacts.length} contactos exportados como VCF`, { icon: 'success' })
  }

  // ── Filtered data ───────────────────────────────────────────────────────────
  const q = search.toLowerCase()

  const filteredCalls = calls.filter(
    (c) =>
      !q ||
      c.number.toLowerCase().includes(q) ||
      (c.name || '').toLowerCase().includes(q)
  )
  const filteredSms = sms.filter(
    (s) =>
      !q ||
      s.address.toLowerCase().includes(q) ||
      s.body.toLowerCase().includes(q)
  )
  const filteredContacts = contacts.filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.number.toLowerCase().includes(q)
  )
  const filteredApps = apps.filter((a) => !q || a.package.toLowerCase().includes(q))
  const filteredFiles = deletedFiles.filter((f) => !q || f.path.toLowerCase().includes(q))

  const callTypeLabel: Record<string, { label: string; color: string }> = {
    incoming: { label: '↙ Entrante', color: '#22c55e' },
    outgoing: { label: '↗ Saliente', color: '#60a5fa' },
    missed: { label: '✗ Perdida', color: '#ef4444' },
    voicemail: { label: '📧 Buzón', color: '#a78bfa' },
    rejected: { label: '✗ Rechazada', color: '#f97316' },
  }

  function formatDuration(secs: number) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}m ${s}s`
  }

  return createPortal(
    <LunaModal
      title="🕵️ Modo Forense Básico"
      width={960}
      visible={visible}
      onClose={onClose}
    >
      <div className={Style.modalBody}>
        {/* Tab Bar */}
        <div className={Style.tabBar}>
          {(Object.keys(TAB_LABELS) as ForensicTab[]).map((t) => (
            <button
              key={t}
              className={className(Style.tabBtn, { [Style.activeTab]: tab === t })}
              onClick={() => handleTabChange(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Search + Actions */}
        <div className={Style.toolbar}>
          <input
            className={Style.searchInput}
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className={Style.actions}>
            {tab === 'calls' && (
              <button
                className={className(Style.btn, Style.export)}
                onClick={exportCallsCsv}
                disabled={calls.length === 0}
              >
                ⬇ Exportar CSV
              </button>
            )}
            {tab === 'sms' && (
              <button
                className={className(Style.btn, Style.export)}
                onClick={exportSmsCsv}
                disabled={sms.length === 0}
              >
                ⬇ Exportar CSV
              </button>
            )}
            {tab === 'contacts' && (
              <button
                className={className(Style.btn, Style.export)}
                onClick={exportVcf}
                disabled={contacts.length === 0}
              >
                ⬇ Exportar VCF
              </button>
            )}
            <button
              className={className(Style.btn)}
              onClick={() => loadTab(tab)}
              disabled={loading}
            >
              {loading ? '⏳ Cargando...' : '↺ Actualizar'}
            </button>
          </div>
        </div>

        {/* Stats banner */}
        <div className={Style.statsBanner}>
          {tab === 'calls' && (
            <span>
              <strong>{filteredCalls.length}</strong> llamadas
              {' · '}
              <span style={{ color: '#22c55e' }}>{filteredCalls.filter((c) => c.type === 'incoming').length} entrantes</span>
              {' · '}
              <span style={{ color: '#60a5fa' }}>{filteredCalls.filter((c) => c.type === 'outgoing').length} salientes</span>
              {' · '}
              <span style={{ color: '#ef4444' }}>{filteredCalls.filter((c) => c.type === 'missed').length} perdidas</span>
            </span>
          )}
          {tab === 'sms' && (
            <span>
              <strong>{filteredSms.length}</strong> mensajes
              {' · '}
              <span style={{ color: '#60a5fa' }}>{filteredSms.filter((s) => s.type === 'sent').length} enviados</span>
              {' · '}
              <span style={{ color: '#22c55e' }}>{filteredSms.filter((s) => s.type === 'received').length} recibidos</span>
              {' · '}
              <span style={{ color: '#f59e0b' }}>{filteredSms.filter((s) => !s.read).length} sin leer</span>
            </span>
          )}
          {tab === 'contacts' && (
            <span><strong>{filteredContacts.length}</strong> contactos encontrados</span>
          )}
          {tab === 'apps' && (
            <span>
              <strong>{filteredApps.length}</strong> apps desinstaladas con datos residuales
              {filteredApps.length > 0 && (
                <span style={{ color: '#f59e0b' }}>
                  {' · '}{fileSize(filteredApps.reduce((a, b) => a + b.dataSize, 0))} en total
                </span>
              )}
            </span>
          )}
          {tab === 'files' && (
            <span>
              <strong>{filteredFiles.length}</strong> archivos potencialmente recuperables detectados
            </span>
          )}
        </div>

        {/* Table Content */}
        <div className={Style.tableWrap}>
          {loading ? (
            <div className={Style.emptyState}>
              <div className={Style.spinner} />
              Consultando dispositivo via ADB...
            </div>
          ) : (
            <>
              {/* ── Call Log ── */}
              {tab === 'calls' && (
                <table className={Style.table}>
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Nombre</th>
                      <th>Fecha</th>
                      <th>Duración</th>
                      <th>Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCalls.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={Style.emptyRow}>
                          Sin datos (requiere permiso READ_CALL_LOG)
                        </td>
                      </tr>
                    ) : (
                      filteredCalls.map((c, i) => {
                        const typeInfo = callTypeLabel[c.type] || { label: c.type, color: '#94a3b8' }
                        return (
                          <tr key={i}>
                            <td className={Style.mono}>{c.number}</td>
                            <td>{c.name || <span className={Style.muted}>—</span>}</td>
                            <td className={Style.muted}>
                              {c.date > 0 ? new Date(c.date).toLocaleString() : '—'}
                            </td>
                            <td className={Style.muted}>{c.duration > 0 ? formatDuration(c.duration) : '—'}</td>
                            <td>
                              <span className={Style.pill} style={{ color: typeInfo.color, borderColor: typeInfo.color + '44' }}>
                                {typeInfo.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              )}

              {/* ── SMS ── */}
              {tab === 'sms' && (
                <table className={Style.table}>
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Leído</th>
                      <th>Mensaje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSms.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={Style.emptyRow}>
                          Sin datos (requiere permiso READ_SMS)
                        </td>
                      </tr>
                    ) : (
                      filteredSms.map((s, i) => (
                        <tr key={i} className={!s.read ? Style.unread : ''}>
                          <td className={Style.mono}>{s.address}</td>
                          <td className={Style.muted}>
                            {s.date > 0 ? new Date(s.date).toLocaleString() : '—'}
                          </td>
                          <td>
                            <span
                              className={Style.pill}
                              style={{
                                color: s.type === 'sent' ? '#60a5fa' : '#22c55e',
                                borderColor: s.type === 'sent' ? '#60a5fa44' : '#22c55e44',
                              }}
                            >
                              {s.type === 'sent' ? '↗ Enviado' : '↙ Recibido'}
                            </span>
                          </td>
                          <td className={Style.muted}>{s.read ? '✓' : '●'}</td>
                          <td className={Style.bodyCell}>{s.body || <span className={Style.muted}>—</span>}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {/* ── Contacts ── */}
              {tab === 'contacts' && (
                <table className={Style.table}>
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Número</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContacts.length === 0 ? (
                      <tr>
                        <td colSpan={2} className={Style.emptyRow}>
                          Sin contactos o permiso READ_CONTACTS no disponible
                        </td>
                      </tr>
                    ) : (
                      filteredContacts.map((c, i) => (
                        <tr key={i}>
                          <td>
                            <div className={Style.contactAvatar}>
                              <span className={Style.avatarIcon}>{c.name.charAt(0).toUpperCase()}</span>
                              {c.name}
                            </div>
                          </td>
                          <td className={Style.mono}>{c.number}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {/* ── Uninstalled App Residues ── */}
              {tab === 'apps' && (
                <table className={Style.table}>
                  <thead>
                    <tr>
                      <th>Paquete</th>
                      <th>Datos residuales</th>
                      <th>Ruta</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredApps.length === 0 ? (
                      <tr>
                        <td colSpan={4} className={Style.emptyRow}>
                          No se encontraron datos de apps desinstaladas (puede requerir root)
                        </td>
                      </tr>
                    ) : (
                      filteredApps.map((a, i) => (
                        <tr key={i}>
                          <td>
                            <div className={Style.pkgInfo}>
                              <span className={Style.pkgName}>{a.package.split('.').pop() || a.package}</span>
                              <span className={Style.pkgCode}>{a.package}</span>
                            </div>
                          </td>
                          <td>
                            <span className={Style.pill} style={{ color: '#f59e0b', borderColor: '#f59e0b44' }}>
                              {a.dataSize > 0 ? fileSize(a.dataSize) : '< 1 KB'}
                            </span>
                          </td>
                          <td className={className(Style.mono, Style.muted)}>{a.path}</td>
                          <td>
                            <button
                              className={className(Style.btn, Style.dangerBtn)}
                              title="Eliminar datos residuales de esta app (irreversible)"
                              onClick={() => {
                                if (!device) return
                                if (!window.confirm(`¿Eliminar datos residuales de ${a.package}?`)) return
                                main.execAdb(device.id, `rm -rf "${a.path}"`).then(() => {
                                  notify(`Datos de ${a.package} eliminados`, { icon: 'success' })
                                  setApps((prev) => prev.filter((x) => x.package !== a.package))
                                }).catch(() => notify('Error al eliminar (puede requerir root)', { icon: 'error' }))
                              }}
                            >
                              🗑 Limpiar
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {/* ── Deleted Files ── */}
              {tab === 'files' && (
                <table className={Style.table}>
                  <thead>
                    <tr>
                      <th>Archivo</th>
                      <th>Tamaño</th>
                      <th>Última modificación</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFiles.length === 0 ? (
                      <tr>
                        <td colSpan={4} className={Style.emptyRow}>
                          No se encontraron archivos borrados pendientes de sobreescritura en /sdcard
                        </td>
                      </tr>
                    ) : (
                      filteredFiles.map((f, i) => (
                        <tr key={i}>
                          <td>
                            <div className={Style.pkgInfo}>
                              <span className={Style.pkgName}>{f.path.split('/').pop()}</span>
                              <span className={Style.pkgCode}>{f.path}</span>
                            </div>
                          </td>
                          <td className={Style.muted}>{f.size > 0 ? fileSize(f.size) : '—'}</td>
                          <td className={Style.muted}>
                            {f.mtime > 0 ? new Date(f.mtime).toLocaleString() : '—'}
                          </td>
                          <td>
                            <span className={Style.pill} style={{ color: '#22c55e', borderColor: '#22c55e44' }}>
                              ⚠ Recuperable
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>

        {/* Bottom notice */}
        <div className={Style.notice}>
          ℹ️ Algunos datos requieren permisos especiales del sistema. Los resultados dependen de la versión Android y del fabricante.
        </div>
      </div>
    </LunaModal>,
    document.body
  )
})
