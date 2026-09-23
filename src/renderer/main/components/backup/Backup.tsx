import { observer } from 'mobx-react-lite'
import { useState } from 'react'
import store from '../../store'
import Style from './Backup.module.scss'
import LunaToolbar from 'luna-toolbar/react'
import { BackupType, IBackupProgress } from 'common/types'
import { notify } from 'share/renderer/lib/util'
import className from 'licia/className'

interface BackupOption {
  type: BackupType
  icon: string
  title: string
  desc: string
}

const BACKUP_OPTIONS: BackupOption[] = [
  { type: 'photos', icon: '📷', title: 'Fotos y Medios', desc: 'DCIM, Pictures, WhatsApp Media' },
  { type: 'files', icon: '📁', title: 'Archivos', desc: 'Documents, Downloads, Music, Videos' },
  { type: 'apks', icon: '📦', title: 'APKs de Apps', desc: 'Extrae los .apk de apps instaladas' },
  { type: 'appdata', icon: '🗂️', title: 'Datos de App', desc: 'Respaldo de datos de una app específica' },
]

export default observer(function Backup() {
  const { device } = store
  const [selected, setSelected] = useState<BackupType>('photos')
  const [destFolder, setDestFolder] = useState('')
  const [packageName, setPackageName] = useState('')
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState('')
  const [result, setResult] = useState<IBackupProgress | null>(null)

  async function pickFolder() {
    const folder = await main.pickFolder()
    if (folder) setDestFolder(folder)
  }

  async function runBackup() {
    if (!device) {
      notify('No hay dispositivo conectado', { icon: 'error' })
      return
    }
    if (!destFolder) {
      notify('Selecciona una carpeta de destino', { icon: 'error' })
      return
    }
    if (selected === 'appdata' && !packageName.trim()) {
      notify('Ingresa el nombre del paquete', { icon: 'error' })
      return
    }

    setRunning(true)
    setResult(null)
    setLog(`⏳ Iniciando respaldo de ${selected}...\nDispositivo: ${device.id}\nDestino: ${destFolder}\n`)

    try {
      const res = await main.runBackup({
        type: selected,
        deviceId: device.id,
        destFolder,
        packageName: packageName.trim() || undefined,
      })
      setResult(res)

      if (res.status === 'done') {
        setLog(prev => prev + `\n✅ Respaldo completado.\nRuta: ${res.outputPath}\nChecksum SHA-256: ${res.checksum}\n`)
      } else {
        setLog(prev => prev + `\n❌ Error: ${res.error}\n`)
      }
    } catch (e: any) {
      setLog(prev => prev + `\n❌ Error inesperado: ${e?.message || e}\n`)
      setResult({ type: selected, status: 'error', error: e?.message })
    }

    setRunning(false)
  }

  return (
    <div className={className('panel-with-toolbar', Style.container)}>
      <LunaToolbar className="panel-toolbar" />

      <div className={Style.body}>
        <div className={Style.section}>
          <div className={Style.sectionTitle}>🗄️ Módulo de Respaldo Autorizado</div>
          <div className={Style.sectionDesc}>
            Respalda datos del teléfono en la computadora. Cada respaldo genera una carpeta con timestamp y un checksum SHA-256 para verificar integridad.
          </div>

          <div className={Style.backupCards}>
            {BACKUP_OPTIONS.map(opt => (
              <div
                key={opt.type}
                className={className(Style.backupCard, selected === opt.type && Style.selected)}
                onClick={() => setSelected(opt.type)}
              >
                <div className={Style.backupCardIcon}>{opt.icon}</div>
                <div className={Style.backupCardTitle}>{opt.title}</div>
                <div className={Style.backupCardDesc}>{opt.desc}</div>
              </div>
            ))}
          </div>

          {selected === 'appdata' && (
            <div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                Nombre del paquete (ej: com.whatsapp)
              </div>
              <input
                className={Style.pkgInput}
                placeholder="com.example.app"
                value={packageName}
                onChange={e => setPackageName(e.target.value)}
              />
            </div>
          )}

          <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
            Carpeta de destino (se guardará en el PC)
          </div>
          <div className={Style.formRow}>
            <input
              className={Style.folderInput}
              placeholder="Selecciona la carpeta del cliente..."
              value={destFolder}
              readOnly
            />
            <button className={className(Style.btn, Style.btnSecondary)} onClick={pickFolder}>
              📂 Explorar
            </button>
            <button
              className={className(Style.btn, Style.btnPrimary)}
              disabled={running || !device || !destFolder}
              onClick={runBackup}
            >
              {running ? ' Respaldando...' : ' Iniciar Respaldo'}
            </button>
          </div>
        </div>

        {log && (
          <div className={Style.section}>
            <div className={Style.sectionTitle}>Registro</div>
            <div className={Style.logBox}>{log}</div>

            {result && result.status === 'done' && (
              <div className={className(Style.resultBox, Style.resultOk)}>
                <strong>Respaldo exitoso</strong> — Guardado en: <code>{result.outputPath}</code>
                <div className={Style.checksumRow}>
                   Checksum SHA-256 (parcial): <strong>{result.checksum}</strong>
                  <br />
                  <small>Guarda este checksum para verificar la integridad del respaldo en el futuro.</small>
                </div>
              </div>
            )}

            {result && result.status === 'error' && (
              <div className={className(Style.resultBox, Style.resultErr)}>
                 <strong>Error durante el respaldo:</strong> {result.error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
