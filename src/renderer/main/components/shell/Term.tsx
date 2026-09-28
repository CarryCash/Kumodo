import { observer } from 'mobx-react-lite'
import store from '../../store'
import { Terminal, ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { CanvasAddon } from '@xterm/addon-canvas'
import { WebglAddon } from '@xterm/addon-webgl'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { useEffect, useRef, useState } from 'react'
import {
  colorBgContainer,
  colorBgContainerDark,
  colorPrimary,
  colorText,
  colorTextDark,
  fontFamilyCode,
} from 'common/theme'
import copy from 'licia/copy'
import Style from './Term.module.scss'
import '@xterm/xterm/css/xterm.css'
import { t } from 'common/util'
import contextMenu from 'share/renderer/lib/contextMenu'
import isHidden from 'licia/isHidden'
import { getGeminiAutocompleteSuggestions, IAiSuggestion } from '../../lib/ai'

interface ITermProps {
  visible: boolean
  onSessionIdChange: (id: string) => void
  onCreate: (terminal: Terminal) => void
}

export default observer(function Term(props: ITermProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal>(null)
  const fitAddonRef = useRef<FitAddon>(null)
  const sessionIdRef = useRef('')

  // Autocomplete state & refs
  const [suggestions, setSuggestions] = useState<IAiSuggestion[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [aiLoading, setAiLoading] = useState(false)
  const bufferRef = useRef('')
  const suggestionsRef = useRef<IAiSuggestion[]>([])
  const selectedIndexRef = useRef(0)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  suggestionsRef.current = suggestions
  selectedIndexRef.current = selectedIndex

  const { device } = store

  function updateSuggestions(buf: string) {
    const q = buf.trim()
    if (q.length < 2) {
      setSuggestions([])
      setAiLoading(false)
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      return
    }

    // Debounce the Gemini call
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    setAiLoading(true)
    debounceTimerRef.current = setTimeout(async () => {
      const results = await getGeminiAutocompleteSuggestions(q)
      setSuggestions(results)
      setSelectedIndex(0)
      setAiLoading(false)
    }, 600)
  }

  function completeSuggestion(cmd: IAiSuggestion, autoEnter = false) {
    if (!sessionIdRef.current) return
    const current = bufferRef.current
    const target = cmd.command
    const currentLower = current.toLowerCase()
    const targetLower = target.toLowerCase()

    if (targetLower.startsWith(currentLower)) {
      const suffix = target.slice(current.length) + (autoEnter ? '\n' : ' ')
      main.writeShell(sessionIdRef.current, suffix)
      bufferRef.current = autoEnter ? '' : target + ' '
    } else {
      const backspaces = '\x7f'.repeat(current.length)
      const toSend = backspaces + target + (autoEnter ? '\n' : ' ')
      main.writeShell(sessionIdRef.current, toSend)
      bufferRef.current = autoEnter ? '' : target + ' '
    }

    setSuggestions([])
    if (termRef.current) {
      termRef.current.focus()
    }
  }

  useEffect(() => {
    const term = new Terminal({
      allowProposedApi: true,
      fontSize: 14,
      fontFamily: fontFamilyCode,
      theme: getTheme(store.theme === 'dark'),
    })

    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    term.loadAddon(fitAddon)
    const fit = () => {
      if (!isHidden(terminalRef.current!)) {
        fitAddon.fit()
      }
    }
    window.addEventListener('resize', fit)

    term.loadAddon(new Unicode11Addon())
    term.unicode.activeVersion = '11'

    try {
      term.loadAddon(new WebglAddon())
    } catch {
      term.loadAddon(new CanvasAddon())
    }

    // Intercept keyboard navigation for autocomplete
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type === 'keydown') {
        const curSuggestions = suggestionsRef.current
        const curIdx = selectedIndexRef.current

        if (curSuggestions.length > 0) {
          if (e.key === 'Tab') {
            e.preventDefault()
            e.stopPropagation()
            completeSuggestion(curSuggestions[curIdx], false)
            return false
          }

          if (e.key === 'ArrowDown') {
            e.preventDefault()
            e.stopPropagation()
            setSelectedIndex((curIdx + 1) % curSuggestions.length)
            return false
          }

          if (e.key === 'ArrowUp') {
            e.preventDefault()
            e.stopPropagation()
            setSelectedIndex((curIdx - 1 + curSuggestions.length) % curSuggestions.length)
            return false
          }

          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            setSuggestions([])
            return false
          }

          if (e.key === 'Enter' && curIdx > 0) {
            e.preventDefault()
            e.stopPropagation()
            completeSuggestion(curSuggestions[curIdx], true)
            return false
          }
        }
      }
      return true
    })

    term.open(terminalRef.current!)
    termRef.current = term
    props.onCreate(term)

    function onShellData(id: string, data: string) {
      if (sessionIdRef.current !== id) {
        return
      }
      term.write(data)
    }
    const offShellData = main.on('shellData', onShellData)

    if (device) {
      main.createShell(device.id).then((id) => {
        setSessionId(id)

        term.onData((data) => {
          if (data === '\r' || data === '\n' || data === '\x03') {
            bufferRef.current = ''
            setSuggestions([])
          } else if (data === '\x7f' || data === '\b') {
            bufferRef.current = bufferRef.current.slice(0, -1)
            updateSuggestions(bufferRef.current)
          } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
            bufferRef.current += data
            updateSuggestions(bufferRef.current)
          }

          main.writeShell(sessionIdRef.current, data)
        })

        term.onResize((size) => {
          main.resizeShell(sessionIdRef.current, size.cols, size.rows)
        })
        fit()
      })
    }

    return () => {
      offShellData()
      if (sessionIdRef.current) {
        main.killShell(sessionIdRef.current)
      }
      term.dispose()
      window.removeEventListener('resize', fit)
    }
  }, [])

  useEffect(() => {
    if (fitAddonRef.current && props.visible) {
      fitAddonRef.current.fit()
    }
    if (props.visible) {
      setTimeout(() => {
        if (termRef.current) {
          termRef.current.focus()
        }
      }, 500)
    }
  }, [props.visible])

  const theme = getTheme(store.theme === 'dark')
  if (termRef.current) {
    termRef.current.options.theme = theme
  }

  function setSessionId(id: string) {
    sessionIdRef.current = id
    props.onSessionIdChange(id)
  }

  const onContextMenu = (e: React.MouseEvent) => {
    if (!device) {
      return
    }

    const term = termRef.current!
    const template: any[] = [
      {
        label: t('copy'),
        click() {
          if (term.hasSelection()) {
            copy(term.getSelection())
            term.focus()
          }
        },
      },
      {
        label: t('paste'),
        click: async () => {
          const text = await navigator.clipboard.readText()
          if (text) {
            main.writeShell(sessionIdRef.current, text)
          }
        },
      },
      {
        label: t('selectAll'),
        click() {
          term.selectAll()
        },
      },
      {
        type: 'separator',
      },
      {
        label: t('reset'),
        click() {
          if (sessionIdRef.current) {
            main.killShell(sessionIdRef.current)
          }
          term.reset()
          if (device) {
            main.createShell(device.id).then((id) => {
              setSessionId(id)
            })
            term.focus()
          }
        },
      },
      {
        label: t('clear'),
        click() {
          term.clear()
          term.focus()
        },
      },
    ]

    contextMenu(e, template)
  }

  const badgeClass = (cat: string) => {
    switch (cat) {
      case 'Batería':
        return Style.battery
      case 'Sistema':
        return Style.system
      case 'Red':
        return Style.network
      case 'Debug':
        return Style.debug
      case 'Archivos':
        return Style.files
      case 'Apps':
        return Style.apps
      default:
        return ''
    }
  }

  return (
    <div
      className={Style.container}
      style={{ display: props.visible ? 'block' : 'none' }}
    >
      <div
        className={Style.term}
        ref={terminalRef}
        onContextMenu={onContextMenu}
      />

      {/* Gemini AI Autocomplete Popup */}
      {(suggestions.length > 0 || aiLoading) && (
        <div className={Style.autocompletePopup}>
          <div className={Style.popupHeader}>
            <span>
              <span className={Style.aiLabel}>✦ Gemini</span>
              {aiLoading ? ' Pensando...' : ` · Presiona `}
              {!aiLoading && <span className={Style.hintKey}>Tab</span>}
              {!aiLoading && ' para completar'}
            </span>
            <span>
              {!aiLoading && (
                <>
                  <span className={Style.hintKey}>↑</span>
                  <span className={Style.hintKey}>↓</span> navegar ·{' '}
                  <span className={Style.hintKey}>Esc</span>
                </>
              )}
            </span>
          </div>

          <div className={Style.suggestionList}>
            {aiLoading ? (
              <div className={Style.loadingRow}>
                <span className={Style.spinner} /> Generando sugerencias...
              </div>
            ) : (
              suggestions.map((cmd, idx) => (
                <div
                  key={cmd.command}
                  className={`${Style.suggestionItem} ${
                    idx === selectedIndex ? Style.active : ''
                  }`}
                  onClick={() => completeSuggestion(cmd, false)}
                >
                  <div className={Style.itemLeft}>
                    <div className={Style.cmdText}>{cmd.command}</div>
                    <div className={Style.cmdDesc}>{cmd.description}</div>
                  </div>
                  <span className={`${Style.badge} ${badgeClass(cmd.category)}`}>
                    {cmd.category}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
})

function getTheme(dark = false) {
  let theme: ITheme = {
    background: colorBgContainer,
    foreground: colorText,
    cursor: colorText,
  }

  if (dark) {
    theme = {
      background: colorBgContainerDark,
      foreground: colorTextDark,
      cursor: colorTextDark,
    }
  }

  return {
    selectionForeground: '#fff',
    selectionBackground: colorPrimary,
    ...theme,
  }
}
