import { observer } from 'mobx-react-lite'
import { useState, useRef, useEffect } from 'react'
import Style from './ChatAdb.module.scss'
import store from '../../store'
import { askGeminiForAdbCommand } from '../../lib/ai'
import { notify } from 'share/renderer/lib/util'

interface Message {
  id: string
  role: 'user' | 'ai'
  text?: string
  command?: string
  explanation?: string
  status?: 'pending' | 'success' | 'error'
  output?: string
}

export default observer(function ChatAdb() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init',
      role: 'ai',
      explanation: '¡Hola! Soy tu asistente ADB potenciado por IA. Dime qué quieres hacer en el dispositivo y te daré el comando exacto.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const deviceId = store.device?.id

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userText = input.trim()
    setInput('')
    
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: userText }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      if (!store.settings.geminiApiKey) {
        throw new Error('API Key no configurada. Ve a Ajustes (⚙️) -> Inteligencia Artificial')
      }

      const { command, explanation } = await askGeminiForAdbCommand(userText)
      
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        command,
        explanation,
        status: command ? 'pending' : undefined
      }
      
      setMessages(prev => [...prev, aiMsg])
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        explanation: `Error: ${err.message}`
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleExecute = async (msgId: string, command: string) => {
    if (!deviceId) {
      notify('No hay dispositivo conectado', { icon: 'error' })
      return
    }

    const dangerousPattern = /\b(wipe|format|rm\s+-rf|fastboot\s+erase|dd)\b/i
    if (dangerousPattern.test(command)) {
      const confirmStr = window.prompt(
        '⚠️ ADVERTENCIA: El comando generado (' + command + ') es potencialmente destructivo y podría borrar datos irrecoverables del cliente.\n\nEscribe "confirmar" para proceder bajo tu propio riesgo:'
      )
      if (confirmStr?.toLowerCase() !== 'confirmar') {
        notify('Ejecución cancelada por seguridad', { icon: 'info' })
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'error', output: 'Cancelado por el usuario (Seguridad)' } : m))
        return
      }
    }

    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'pending', output: 'Ejecutando...' } : m))

    try {
      // Execute command
      const output = await main.execAdb(deviceId, command)
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'success', output: output || '(Comando ejecutado con éxito, sin salida)' } : m))
    } catch (err: any) {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'error', output: err.message || 'Error desconocido' } : m))
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={Style.container}>
      <div className={Style.messages}>
        {messages.map(msg => (
          <div key={msg.id} className={msg.role === 'user' ? Style.userMessage : Style.aiMessage}>
            {msg.role === 'user' ? (
              msg.text
            ) : (
              <>
                {msg.explanation && <div className={Style.aiExplanation}>{msg.explanation}</div>}
                
                {msg.command && (
                  <div className={Style.aiCommandBox}>
                    $ {msg.command}
                  </div>
                )}
                
                {msg.command && msg.status === 'pending' && !msg.output && (
                  <button className={Style.executeButton} onClick={() => handleExecute(msg.id, msg.command!)}>
                    <span className="icon-play" /> Ejecutar
                  </button>
                )}

                {msg.output && (
                  <div className={Style.terminalOutput} style={{ color: msg.status === 'error' ? '#ff4d4f' : '#52c41a' }}>
                    {msg.output}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        {loading && <div className={Style.loading}>Pensando...</div>}
        <div ref={messagesEndRef} />
      </div>

      <div className={Style.inputArea}>
        <input
          type="text"
          className={Style.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ej: Toma una captura de pantalla..."
          disabled={loading}
        />
        <button className={Style.sendButton} onClick={handleSend} disabled={!input.trim() || loading}>
          <span className="icon-send" />
        </button>
      </div>
    </div>
  )
})
