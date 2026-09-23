import { createPortal } from 'react-dom'
import LunaModal from 'luna-modal/react'
import { IModalProps } from 'share/common/types'
import { useEffect, useState, useCallback } from 'react'
import { IHistoryEntry } from 'common/types'
import { t } from 'common/util'
import { notify } from 'share/renderer/lib/util'
import debounce from 'licia/debounce'
import Style from './HistoryModal.module.scss'

export default function HistoryModal(props: IModalProps) {
  const [entries, setEntries] = useState<IHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (props.visible) refresh()
  }, [props.visible])

  async function refresh() {
    setIsLoading(true)
    try {
      const history = await main.getHistory()
      setEntries(history)
    } catch {
      notify(t('commonErr'), { icon: 'error' })
    }
    setIsLoading(false)
  }

  async function clear() {
    if (confirm('¿Estás seguro de que deseas borrar todo el historial?')) {
      await main.clearHistory()
      refresh()
      notify('Historial borrado', { icon: 'success' })
    }
  }

  return createPortal(
    <LunaModal
      title="Historial de Dispositivos"
      width={600}
      visible={props.visible}
      onClose={props.onClose}
    >
      <div style={{ padding: '0 14px 14px 14px', maxHeight: '60vh', overflow: 'auto' }}>
        <div style={{ marginBottom: 14, textAlign: 'right' }}>
          <button 
            onClick={clear} 
            disabled={entries.length === 0}
            style={{ 
              padding: '6px 12px', 
              background: 'var(--color-error)', 
              color: 'white', 
              border: 'none', 
              borderRadius: 4,
              cursor: entries.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            Borrar Todo
          </button>
        </div>

        {entries.length === 0 ? (
          <div className={Style.empty}>No hay dispositivos en el historial</div>
        ) : (
          <div className={Style.list}>
            {entries.map((entry) => (
              <HistoryCard key={entry.serialno} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </LunaModal>,
    document.body
  )
}

function HistoryCard({ entry }: { entry: IHistoryEntry }) {
  const [notes, setNotes] = useState(entry.notes)

  const saveNotes = useCallback(
    debounce((newNotes: string) => {
      main.updateHistoryNotes(entry.serialno, newNotes)
    }, 500),
    [entry.serialno]
  )

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setNotes(val)
    saveNotes(val)
  }

  return (
    <div className={Style.card}>
      <div className={Style.header}>
        <div className={Style.title}>{entry.name}</div>
        <div className={Style.date}>{new Date(entry.connectedAt).toLocaleString()}</div>
      </div>
      <div className={Style.body}>
        <div className={Style.infoRow}>
          <div className={Style.infoItem}>
            <strong>S/N:</strong> {entry.serialno}
          </div>
          <div className={Style.infoItem}>
            <strong>Android:</strong> {entry.androidVersion} (API {entry.sdkVersion})
          </div>
        </div>
        <div className={Style.notesLabel}>Notas del Técnico:</div>
        <textarea
          className={Style.textarea}
          value={notes}
          onChange={handleChange}
          placeholder="Escribe notas sobre el diagnóstico, problemas, cliente, etc..."
        />
      </div>
    </div>
  )
}
