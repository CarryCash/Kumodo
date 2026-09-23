import { useState } from 'react'
import LunaModal from 'luna-modal/react'
import { ADB_COMMANDS, IAdbCommand } from './adbCommands'
import Style from './CommandLibraryModal.module.scss'
import copy from 'licia/copy'
import { notify } from 'share/renderer/lib/util'

interface IProps {
  visible: boolean
  onClose: () => void
  onExecute: (command: string, autoEnter?: boolean) => void
}

type CategoryType = 'all' | 'Batería' | 'Sistema' | 'Red' | 'Debug'

export default function CommandLibraryModal({
  visible,
  onClose,
  onExecute,
}: IProps) {
  const [category, setCategory] = useState<CategoryType>('all')
  const [search, setSearch] = useState('')

  const categories: { label: string; value: CategoryType }[] = [
    { label: 'Todas', value: 'all' },
    { label: '⚡ Batería', value: 'Batería' },
    { label: '⚙️ Sistema', value: 'Sistema' },
    { label: '📡 Red', value: 'Red' },
    { label: '🐞 Debug', value: 'Debug' },
  ]

  const filtered = ADB_COMMANDS.filter((cmd) => {
    if (category !== 'all' && cmd.category !== category) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      cmd.name.toLowerCase().includes(q) ||
      cmd.command.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q) ||
      cmd.tags?.some((t) => t.toLowerCase().includes(q))
    )
  })

  function handleRun(command: string) {
    onExecute(command, true)
    onClose()
  }

  function handleInsert(command: string) {
    onExecute(command, false)
    onClose()
  }

  function handleCopy(command: string) {
    copy(command)
    notify('Comando copiado al portapapeles', { icon: 'info' })
  }

  const categoryClass = (cat: string) => {
    switch (cat) {
      case 'Batería':
        return Style.battery
      case 'Sistema':
        return Style.system
      case 'Red':
        return Style.network
      case 'Debug':
        return Style.debug
      default:
        return ''
    }
  }

  return (
    <LunaModal
      title="🔧 Biblioteca de Comandos ADB"
      width={780}
      visible={visible}
      onClose={onClose}
    >
      <div className={Style.container}>
        {/* Search */}
        <div className={Style.searchBar}>
          <input
            className={Style.searchInput}
            type="text"
            placeholder="Buscar por comando, nombre o palabra clave (ej: battery, reboot, ip, logs)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {/* Category Tabs */}
        <div className={Style.categoryTabs}>
          {categories.map((cat) => {
            const count =
              cat.value === 'all'
                ? ADB_COMMANDS.length
                : ADB_COMMANDS.filter((c) => c.category === cat.value).length
            return (
              <button
                key={cat.value}
                className={`${Style.catBtn} ${
                  category === cat.value ? Style.active : ''
                }`}
                onClick={() => setCategory(cat.value)}
              >
                {cat.label} ({count})
              </button>
            )
          })}
        </div>

        {/* Commands List */}
        <div className={Style.commandsList}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', opacity: 0.5 }}>
              No se encontraron comandos para &quot;{search}&quot;
            </div>
          ) : (
            filtered.map((cmd: IAdbCommand) => (
              <div key={cmd.command} className={Style.cmdCard}>
                <div className={Style.cmdInfo}>
                  <div className={Style.cmdHeader}>
                    <span className={Style.cmdName}>{cmd.name}</span>
                    <span className={`${Style.badge} ${categoryClass(cmd.category)}`}>
                      {cmd.category}
                    </span>
                  </div>
                  <div>
                    <code className={Style.cmdCode}>{cmd.command}</code>
                  </div>
                  <div className={Style.cmdDesc}>{cmd.description}</div>
                </div>

                <div className={Style.actions}>
                  <button
                    className={`${Style.actionBtn} ${Style.run}`}
                    title="Ejecutar directamente en la shell activa"
                    onClick={() => handleRun(cmd.command)}
                  >
                    ▶ Ejecutar
                  </button>
                  <button
                    className={Style.actionBtn}
                    title="Insertar en la terminal para editar antes de enviar"
                    onClick={() => handleInsert(cmd.command)}
                  >
                    ✏️ Insertar
                  </button>
                  <button
                    className={Style.actionBtn}
                    title="Copiar comando"
                    onClick={() => handleCopy(cmd.command)}
                  >
                    📋
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </LunaModal>
  )
}
