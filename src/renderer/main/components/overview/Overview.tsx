import { observer } from 'mobx-react-lite'
import Style from './Overview.module.scss'
import { JSX, useEffect, useState } from 'react'
import isEmpty from 'licia/isEmpty'
import fileSize from 'licia/fileSize'
import types from 'licia/types'
import { notify } from 'share/renderer/lib/util'
import { t } from 'common/util'
import store from '../../store'
import copy from 'licia/copy'
import { PannelLoading } from '../common/loading'
import className from 'licia/className'
import FontAdjustModal from './FontAdjustModal'
import LunaToolbar, { LunaToolbarSpace } from 'luna-toolbar/react'
import ToolbarIcon from 'share/renderer/components/ToolbarIcon'
import PortMappingModal from './PortMappingModal'
import RemoteControllerModal from './RemoteControllerModal'
import HistoryModal from './HistoryModal'
import toBool from 'licia/toBool'
import durationFormat from 'licia/durationFormat'
import { IDiagnostic, IImeiVerificationResult } from 'common/types'
import { createPortal } from 'react-dom'
import LunaModal from 'luna-modal/react'
import Battery from '../battery/Battery'
import Storage from '../storage/Storage'
import Backup from '../backup/Backup'
import SecurityAuditModal from './SecurityAuditModal'
import DiagnosticWizardModal from './DiagnosticWizardModal'


export default observer(function Overview() {
  const [portModalVisible, setPortModalVisible] = useState(false)
  const [remoteControllerModalVisible, setRemoteControllerModalVisible] =
    useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [overview, setOverview] = useState<types.PlainObj<string | number | boolean>>({})
  const [diagnostic, setDiagnostic] = useState<IDiagnostic | null>(null)
  const [fontAdjustModalVisible, setFontAdjustModalVisible] = useState(false)
  const [historyModalVisible, setHistoryModalVisible] = useState(false)
  const [securityModalVisible, setSecurityModalVisible] = useState(false)
  const [diagnosticWizardVisible, setDiagnosticWizardVisible] = useState(false)
  const [imeiModalVisible, setImeiModalVisible] = useState(false)
  const [imeiInfo, setImeiInfo] = useState<IImeiVerificationResult | null>(null)
  const [imeiLoading, setImeiLoading] = useState(false)
  const [toolModal, setToolModal] = useState<string | null>(null)

  const { device } = store

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    if (!device || isLoading) {
      return
    }

    try {
      setIsLoading(true)
      const overview = await main.getOverview(device.id)
      const diag = await main.getDiagnostic(device.id)
      setOverview(overview)
      setDiagnostic(diag)
      try {
        await main.saveHistory({
          serialno: diag.serialno || device.id,
          name: diag.name || device.name || 'Unknown',
          androidVersion: diag.androidVersion || '',
          sdkVersion: diag.sdkVersion || '',
          connectedAt: Date.now(),
          notes: ''
        })
      } catch {
        // Ignorar historial si no está disponible.
      }
    } catch {
      notify(t('commonErr'), { icon: 'error' })
    }

    setIsLoading(false)
  }

  let content: JSX.Element | null = null

  if (!device) {
    content = (
      <div className={className('panel-body', Style.container)}>
        {t('deviceNotConnected')}
      </div>
    )
  } else if (isLoading) {
    content = <PannelLoading />
  } else if (!isEmpty(overview)) {
    content = (
      <div className={Style.info}>
        <div className={Style.row}>
          {item(t('name'), overview.name, 'phone')}
          {item(t('brand'), overview.brand)}
          {item(t('model'), overview.model, 'model')}
        </div>
        <div className={Style.row}>
          {item(t('serialno'), overview.serialno, 'serial-number')}
          {item(
            t('androidVersion'),
            `Android ${device.androidVersion} (API ${device.sdkVersion})`,
            'android'
          )}
          {item(t('kernelVersion'), overview.kernelVersion, 'android')}
        </div>
        <div className={Style.row}>
          {item(
            t('processor'),
            `${overview.processor || t('unknown')} ${t('cpuNum', {
              count: overview.cpuNum,
            })} (${overview.abi})`,
            'processor'
          )}
          {item(
            t('storage'),
            `${fileSize(overview.storageUsed as number)} / ${fileSize(
              overview.storageTotal as number
            )}`,
            'storage'
          )}
          {item(t('memory'), fileSize(overview.memTotal as number), 'memory')}
        </div>
        <div className={Style.row}>
          {item(
            t('physicalResolution'),
            `${overview.physicalResolution} (${overview.physicalDensity}dpi)`,
            'phone'
          )}
          {item(
            t('resolution'),
            `${overview.resolution} (${overview.density}dpi)`,
            'phone'
          )}
          {item(
            t('fontScale'),
            overview.fontScale ? `${overview.fontScale}x` : '1x',
            'font',
            overview.fontScale
              ? () => setFontAdjustModalVisible(true)
              : undefined
          )}
        </div>
        <div className={Style.row}>
          {item('Wi-Fi', overview.wifi, 'wifi')}
          {item(t('ipAddress'), overview.ip, 'browser')}
          {item(t('macAddress'), overview.mac, 'browser')}
          {item('IMEI', imeiInfo?.imeis?.[0]?.imei || 'Verificar', 'phone', undefined, openImeiModal)}
        </div>
        {diagnostic && (
          <>
            <div className={Style.row}>
              {item('Batería', `${diagnostic.batteryLevel}%`, 'power')}
              {item('Voltaje', `${(diagnostic.batteryVoltage / 1000).toFixed(2)}V`, 'power')}
              {item('Temperatura', `${diagnostic.batteryTemperature / 10}°C`, 'power')}
            </div>
            <div className={Style.row}>
              {item('Uptime', durationFormat(diagnostic.uptime, 'd:hh:mm:ss'), 'time')}
              {item('Bootloader', diagnostic.bootloader, 'android')}
              {item('Cifrado', diagnostic.encryption, 'unlock')}
            </div>
          </>
        )}
        <div className={Style.row}>
          {item('Batería', 'Abrir módulo', 'power', undefined, () => setToolModal('battery'))}
          {item('Almacenamiento', 'Abrir módulo', 'storage', undefined, () => setToolModal('storage'))}
          {item('Respaldo', 'Abrir módulo', 'save', undefined, () => setToolModal('backup'))}
        </div>
        <FontAdjustModal
          visible={fontAdjustModalVisible}
          initialScale={overview.fontScale as number}
          onClose={() => {
            setFontAdjustModalVisible(false)
            refresh()
          }}
        />
      </div>
    )
  }

  async function root() {
    if (!device || overview.root) {
      return
    }
    if (!window.confirm('Esto solicitará privilegios root en el dispositivo y puede permitir operaciones destructivas. ¿Continuar?')) {
      return
    }
    try {
      await main.root(device.id)
      setTimeout(() => refresh(), 2000)
    } catch {
      notify(t('rootModeErr'), { icon: 'error' })
    }
  }

  async function openImeiModal() {
    if (!device) {
      return
    }

    setImeiModalVisible(true)
    setImeiLoading(true)
    try {
      const result = await main.getImeiInfo(device.id)
      setImeiInfo(result)
    } catch (error: any) {
      console.error('Error loading IMEI info:', error)
      notify(`No se pudo obtener la información de IMEI: ${error?.message || 'desconocido'}`, {
        icon: 'error',
      })
      setImeiInfo(null)
    } finally {
      setImeiLoading(false)
    }
  }

  async function restartAdbServer() {
    await main.restartAdbServer()
    notify(t('adbServerRestarted'), { icon: 'success' })
  }

  function exportReport() {
    if (!diagnostic) return
    const content = `INFORME DE DIAGNÓSTICO
======================
Fecha: ${new Date().toLocaleString()}

IDENTIDAD
---------
Nombre: ${diagnostic.name}
Marca: ${diagnostic.brand}
Modelo: ${diagnostic.model}
Serial: ${diagnostic.serialno}
Build: ${diagnostic.buildNumber}

SOFTWARE
--------
Android: ${diagnostic.androidVersion} (API ${diagnostic.sdkVersion})
Kernel: ${diagnostic.kernelVersion}
Bootloader: ${diagnostic.bootloader}

HARDWARE
--------
CPU: ${diagnostic.processor} (${diagnostic.cpuNum} cores)
RAM: ${fileSize(diagnostic.memTotal)} (Usada: ${fileSize(diagnostic.memUsed)})
Almacenamiento: ${fileSize(diagnostic.storageTotal)} (Usado: ${fileSize(diagnostic.storageUsed)})
Pantalla: ${diagnostic.resolution} (${diagnostic.density} dpi)

BATERÍA
-------
Nivel: ${diagnostic.batteryLevel}%
Voltaje: ${(diagnostic.batteryVoltage / 1000).toFixed(2)}V
Temperatura: ${diagnostic.batteryTemperature / 10}°C

RED
---
Wi-Fi: ${diagnostic.wifi || 'Desconectado'}
IP: ${diagnostic.ip || 'N/A'}
MAC: ${diagnostic.mac || 'N/A'}

SISTEMA
-------
Uptime: ${durationFormat(diagnostic.uptime, 'd:hh:mm:ss')}
Root: ${diagnostic.root ? 'Sí' : 'No'}
Cifrado: ${diagnostic.encryption}
`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Diagnostico_${diagnostic.model}_${diagnostic.serialno}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  let modalTitle = '📦 Respaldo'
  if (toolModal === 'battery') {
    modalTitle = '⚡ Batería'
  } else if (toolModal === 'storage') {
    modalTitle = '💾 Almacenamiento'
  }

  return (
    <div className={className('panel-with-toolbar', Style.container)}>
      <LunaToolbar className="panel-toolbar">
        <ToolbarIcon
          icon="terminal"
          title={t('adbCli')}
          onClick={() => main.openAdbCli()}
        />
        <ToolbarIcon
          icon="reset"
          title={t('restartAdbServer')}
          onClick={restartAdbServer}
        />
        <ToolbarIcon
          icon="unlock"
          disabled={!device || toBool(overview.root)}
          state={toBool(overview.root) ? 'active' : ''}
          title={t('rootMode')}
          onClick={root}
        />
        <ToolbarIcon
          icon="bidirection"
          disabled={!device}
          title={t('portMapping')}
          onClick={() => setPortModalVisible(true)}
        />
        <ToolbarIcon
          icon="remote-controller"
          disabled={!device}
          title={t('remoteController')}
          onClick={() => setRemoteControllerModalVisible(true)}
        />
        <LunaToolbarSpace />
        <ToolbarIcon
          icon="time"
          title="Historial de Dispositivos"
          onClick={() => setHistoryModalVisible(true)}
        />
        <ToolbarIcon
          icon="shield"
          title="Auditoría de Seguridad"
          disabled={!device}
          onClick={() => setSecurityModalVisible(true)}
        />
        <ToolbarIcon
          icon="info"
          title="Diagnóstico guiado"
          disabled={!device}
          onClick={() => setDiagnosticWizardVisible(true)}
        />
        <ToolbarIcon
          icon="save"
          title="Exportar TXT"
          disabled={!diagnostic}
          onClick={exportReport}
        />
        <ToolbarIcon
          icon="refresh"
          title={t('refresh')}
          disabled={isLoading || !device}
          onClick={() => refresh()}
        />
      </LunaToolbar>
      {content}
      <PortMappingModal
        visible={portModalVisible}
        onClose={() => setPortModalVisible(false)}
      />
      <RemoteControllerModal
        visible={remoteControllerModalVisible}
        onClose={() => setRemoteControllerModalVisible(false)}
      />
      <HistoryModal
        visible={historyModalVisible}
        onClose={() => setHistoryModalVisible(false)}
      />
      <SecurityAuditModal
        visible={securityModalVisible}
        onClose={() => setSecurityModalVisible(false)}
      />
      <DiagnosticWizardModal
        visible={diagnosticWizardVisible}
        onClose={() => setDiagnosticWizardVisible(false)}
      />
      {imeiModalVisible && createPortal(
        <LunaModal
          title="IMEI / SIM"
          width={700}
          visible={true}
          onClose={() => setImeiModalVisible(false)}
        >
          <div style={{ display: 'grid', gap: 12, minHeight: 200 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <strong>Dispositivo:</strong> {imeiInfo?.deviceModel || device?.name || 'Desconocido'}
              </div>
              <button
                type="button"
                className="luna-modal-button luna-modal-button-primary"
                onClick={async () => {
                  if (!device) return
                  try {
                    const ok = await main.launchMmiCode(device.id)
                    notify(ok ? 'Se abrió el MMI *#06# correctamente.' : 'No se pudo abrir el MMI *#06#.', {
                      icon: ok ? 'success' : 'error',
                    })
                  } catch {
                    notify('No se pudo abrir el código MMI.', { icon: 'error' })
                  }
                }}
              >
                Abrir *#06#
              </button>
            </div>

            {imeiLoading && <div>Cargando datos del IMEI...</div>}

            {!imeiLoading && imeiInfo && imeiInfo.imeis.length > 0 && (
              <div style={{ display: 'grid', gap: 10 }}>
                {imeiInfo.imeis.map((entry) => (
                  <div
                    key={`${entry.slot}-${entry.imei}`}
                    style={{
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 8,
                      padding: 12,
                      background: 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                      Slot {entry.slot}
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <strong>IMEI:</strong> {entry.imei}
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <strong>Validación:</strong>{' '}
                      {entry.isValidLuhn ? 'Válido (Luhn)' : 'Inválido o no válido'}
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <strong>TAC:</strong> {entry.tac}
                    </div>
                    <div>
                      <strong>Estado:</strong>{' '}
                      {entry.isClonedOrMismatch || !entry.hardwareMatched ? 'Posible clonación o desajuste' : 'Normal'}
                    </div>
                  </div>
                ))}
                <div style={{ opacity: 0.8 }}>
                  <strong>Dual SIM:</strong> {imeiInfo.dualSim ? 'Sí' : 'No'}
                </div>
              </div>
            )}

            {!imeiLoading && (!imeiInfo || imeiInfo.imeis.length === 0) && (
              <div>No se pudo recuperar información de IMEI para este dispositivo.</div>
            )}
          </div>
        </LunaModal>,
        document.body
      )}
      {toolModal && createPortal(
        <LunaModal
          title={modalTitle}
          width={850}
          visible={true}
          onClose={() => setToolModal(null)}
        >
          <div style={{ height: '70vh', position: 'relative', overflowY: 'auto' }}>
            {toolModal === 'battery' && <Battery />}
            {toolModal === 'storage' && <Storage />}
            {toolModal === 'backup' && <Backup />}
          </div>
        </LunaModal>,
        document.body
      )}
    </div>
  )
})

function item(
  title,
  value,
  icon = 'info',
  onDoubleClick?: () => void,
  onClick?: () => void
) {
  function handleClick() {
    if (onClick) {
      onClick()
      return
    }
    setTimeout(() => {
      if (hasDoubleClick) {
        return
      }
      copy(value)
      notify(t('copied'), { icon: 'info' })
    }, 200)
  }

  let hasDoubleClick = false

  return (
    <button
      type="button"
      className={Style.item}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleClick()
        }
      }}
      onDoubleClick={() => {
        if (!onDoubleClick) {
          return
        }
        hasDoubleClick = true
        onDoubleClick()
      }}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <div className={Style.title}>
        <span className={`icon-${icon}`}></span>
        &nbsp;{title}
      </div>
      <div className={Style.value}>{value || t('unknown')}</div>
    </button>
  )
}
