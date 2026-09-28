import LunaModal from 'luna-modal/react'
import { observer } from 'mobx-react-lite'
import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import store from '../../store'
import { IWirelessProfile, IWirelessStatus } from 'common/types'
import Style from './WirelessBridgeModal.module.scss'
import { notify, copyData } from 'share/renderer/lib/util'
import className from 'licia/className'

interface IProps {
  visible: boolean
  onClose: () => void
}

export default observer(function WirelessBridgeModal(props: IProps) {
  const { visible, onClose } = props
  const { device } = store

  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<IWirelessStatus | null>(null)
  const [profiles, setProfiles] = useState<IWirelessProfile[]>([])
  const [pingStates, setPingStates] = useState<Record<string, boolean>>({})
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    if (visible) {
      refreshData()
    }
  }, [visible, device ? device.id : null])

  async function refreshData() {
    setLoading(true)
    try {
      if (device) {
        const st = await main.getWirelessStatus(device.id)
        setStatus(st)
      } else {
        setStatus(null)
      }

      const profs = await main.getWirelessProfiles()
      setProfiles(profs)

      // Ping profiles in background
      for (const p of profs) {
        main.pingIp(p.ip, p.port).then((online) => {
          setPingStates((prev) => ({ ...prev, [p.ip]: online }))
        })
      }
    } catch {
      notify('Error al obtener estado inalámbrico', { icon: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function handleSwitchToWireless() {
    if (!device || switching) return
    setSwitching(true)
    try {
      notify('Iniciando puerto ADB 5555 y conectando por WiFi...', { icon: 'info' })
      const res = await main.enableWirelessBridge(device.id)
      if (res.success) {
        notify(
          `¡Conectado inalámbricamente a ${res.ip}:${res.port}! Ya puedes desconectar el cable USB.`,
          { icon: 'success' }
        )
        refreshData()
      } else {
        notify(res.error || 'Error al conectar por WiFi', { icon: 'error' })
      }
    } catch (err: any) {
      notify('Fallo en la activación inalámbrica', { icon: 'error' })
    } finally {
      setSwitching(false)
    }
  }

  async function handleReconnect(p: IWirelessProfile) {
    try {
      notify(`Reconectando a ${p.name} (${p.ip})...`, { icon: 'info' })
      await main.connectDevice(p.ip, p.port)
      notify(`Dispositivo ${p.name} reconectado con éxito`, { icon: 'success' })
      refreshData()
    } catch {
      notify(`No se pudo conectar con ${p.ip}:${p.port}`, { icon: 'error' })
    }
  }

  async function handleRemoveProfile(ip: string) {
    await main.removeWirelessProfile(ip)
    setProfiles((prev) => prev.filter((p) => p.ip !== ip))
    notify('Perfil eliminado', { icon: 'info' })
  }

  const isWireless = device && device.id.includes(':')
  const connectCmd = status && status.ip ? `adb connect ${status.ip}:5555` : ''

  return createPortal(
    <LunaModal
      title="🌐 Puente de Red WiFi → USB Automático"
      width={600}
      visible={visible}
      onClose={onClose}
    >
      <div className={Style.modalBody}>
        {/* Device Status Card */}
        {device ? (
          <div className={Style.statusCard}>
            <div className={Style.statusHeader}>
              <div className={Style.statusTitle}>
                <span className="icon-phone" /> {device.name}
              </div>
              <span
                className={className(Style.badge, {
                  [Style.wireless]: isWireless,
                  [Style.online]: !isWireless,
                })}
              >
                {isWireless ? '📶 Modo Inalámbrico' : '🔌 Conectado por USB'}
              </span>
            </div>

            <div className={Style.statusGrid}>
              <div className={Style.statusItem}>
                <span className={Style.itemLabel}>Identificador:</span>
                <span className={Style.itemVal}>{device.id}</span>
              </div>
              <div className={Style.statusItem}>
                <span className={Style.itemLabel}>Dirección IP WiFi (wlan0):</span>
                <span className={Style.itemVal}>
                  {status?.ip || 'Detectando o no conectado a WiFi...'}
                </span>
              </div>
            </div>

            {!isWireless && status?.ip && (
              <div className={Style.connectSection}>
                <p style={{ margin: 0, fontSize: '13px' }}>
                  Tu teléfono está en la red local con la IP <strong>{status.ip}</strong>.
                </p>
                <button
                  className={className(Style.btn, Style.primary)}
                  onClick={handleSwitchToWireless}
                  disabled={switching}
                >
                  {switching ? 'Activando...' : '⚡ Cambiar a Conexión Inalámbrica'}
                </button>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  (Habilita adb tcpip 5555 y conecta directamente. Podrás desconectar el cable).
                </span>

                <div className={Style.qrContainer}>
                  <div className={Style.commandBox}>
                    <span>{connectCmd}</span>
                    <button
                      className={className(Style.btn, Style.small)}
                      onClick={() => {
                        copyData(connectCmd, 'text/plain')
                        notify('Comando copiado al portapapeles', { icon: 'success' })
                      }}
                      title="Copiar comando"
                    >
                      Copiar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
            Conecta tu teléfono por USB para configurar la conexión inalámbrica automática.
          </div>
        )}

        {/* Saved Profiles for Reconnection */}
        <div>
          <div className={Style.sectionTitle}>
            <span className="icon-history" /> Dispositivos Guardados para Reconexión
          </div>
          <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 10px 0' }}>
            Si desconectaste el cable o reiniciaste el equipo, puedes reconectar con 1 clic:
          </p>

          {profiles.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#94a3b8', padding: '10px 0' }}>
              No hay perfiles inalámbricos guardados aún.
            </div>
          ) : (
            <div className={Style.profilesList}>
              {profiles.map((p) => {
                const isOnline = pingStates[p.ip] ?? p.isOnline
                return (
                  <div key={p.ip} className={Style.profileItem}>
                    <div className={Style.profileLeft}>
                      <div
                        className={className(Style.pingDot, {
                          [Style.online]: isOnline,
                        })}
                        title={isOnline ? 'En línea en tu red' : 'Sin respuesta de red'}
                      />
                      <div className={Style.profileMeta}>
                        <span className={Style.profileName}>{p.name}</span>
                        <span className={Style.profileIp}>
                          {p.ip}:{p.port}
                        </span>
                      </div>
                    </div>

                    <div className={Style.profileActions}>
                      <button
                        className={className(Style.btn, Style.primary, Style.small)}
                        onClick={() => handleReconnect(p)}
                      >
                        Reconectar
                      </button>
                      <button
                        className={className(Style.btn, Style.small)}
                        onClick={() => handleRemoveProfile(p.ip)}
                        title="Olvidar dispositivo"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
          <button className="luna-modal-button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </LunaModal>,
    document.body
  )
})
