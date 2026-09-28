import { observer } from 'mobx-react-lite'
import { useState, useRef, useEffect } from 'react'
import Style from './ChatAdb.module.scss'
import store from '../../store'
import { askGeminiForAdbCommand } from '../../lib/ai'
import { isCasualChatPrompt } from '../../lib/geminiResponse'
import { notify } from 'share/renderer/lib/util'

interface ApprovedAction {
  id: string
  label: string
  description: string
  command: string
  category: string
  keywords: string[]
}

interface Message {
  id: string
  role: 'user' | 'ai'
  text?: string
  command?: string
  explanation?: string
  status?: 'pending' | 'success' | 'error' | 'blocked' | 'cancelled'
  output?: string
  suggestions?: ApprovedAction[]
}

interface SecurityNotice {
  level: 'warning' | 'error'
  text: string
}

interface BlockedAttempt {
  id: string
  reason: string
  prompt: string
  timestamp: string
}

function createSafeId(prefix: string): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

const approvedActions: ApprovedAction[] = [
  {
    id: 'storage',
    label: 'Ver espacio disponible',
    description: 'Muestra el uso de disco y almacenamiento del dispositivo.',
    command: 'df',
    category: 'Sistema',
    keywords: ['espacio', 'almacenamiento', 'storage', 'disco', 'memoria interna'],
  },
  {
    id: 'battery',
    label: 'Estado de batería',
    description: 'Consulta el estado general de carga y batería.',
    command: 'dumpsys battery',
    category: 'Batería',
    keywords: ['batería', 'battery', 'carga', 'power'],
  },
  {
    id: 'packages',
    label: 'Listar apps instaladas',
    description: 'Muestra los paquetes instalados para inspección segura.',
    command: 'pm list packages',
    category: 'Apps',
    keywords: ['apps', 'aplicaciones', 'paquetes', 'packages', 'instaladas'],
  },
  {
    id: 'network',
    label: 'Estado de red',
    description: 'Consulta la configuración de red del dispositivo.',
    command: 'ip addr show wlan0',
    category: 'Red',
    keywords: ['red', 'wifi', 'network', 'ip', 'conectividad'],
  },
  {
    id: 'properties',
    label: 'Propiedades del sistema',
    description: 'Muestra propiedades Android básicas del equipo.',
    command: 'getprop',
    category: 'Sistema',
    keywords: ['android', 'propiedades', 'sistema', 'device', 'info'],
  },
]

const SHELL_SPECIAL_RE = /[;&|`$<>]/
const DANGEROUS_ACTION_RE = /(rm\s|delete|erase|wipe|format|reboot|factory\s*reset|fastboot|dd\s)/i
const DEFAULT_SESSION_ID = createSafeId('chat')

function hasDisallowedInput(value: string): boolean {
  if (SHELL_SPECIAL_RE.test(value)) return true

  return Array.from(value).some((char) => {
    const code = char.codePointAt(0) ?? 0
    return code < 32 || code === 127
  })
}

function normalizeApprovedAction(command: string): ApprovedAction | null {
  const trimmed = command.trim()
  if (!trimmed) return null

  const blocked = hasDisallowedInput(trimmed)
  if (blocked) return null

  const allowed = approvedActions.find((action) => {
    const same = action.command.trim() === trimmed
    const startsWith = action.command.trim().startsWith(trimmed)
    const beginsWithCommand = trimmed.startsWith(action.command.trim())
    return same || startsWith || beginsWithCommand
  })

  return allowed || null
}

function sanitizeForAudit(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 80)
}

function validateUserInput(value: string): { ok: true } | { ok: false; reason: string } {
  const trimmed = value.trim()

  if (!trimmed) {
    return { ok: false, reason: 'La entrada está vacía.' }
  }

  if (trimmed.length > 240) {
    return { ok: false, reason: 'La entrada es demasiado larga para un comando seguro.' }
  }

  if (hasDisallowedInput(trimmed)) {
    return {
      ok: false,
      reason: 'Entrada bloqueada por seguridad: no se permiten caracteres shell ni control (|, ;, &, <, >, $, `, \n, \r).',
    }
  }

  return { ok: true }
}

function getDangerousActionWarning(command: string, label?: string) {
  const text = `${label || ''} ${command}`.toLowerCase()
  if (!DANGEROUS_ACTION_RE.test(text)) {
    return null
  }

  return {
    text: `Alerta de seguridad: la acción puede implicar borrado, reinicio o cambios destructivos. Se va a ejecutar una operación crítica: "${label || command}". ¿Continuar?`,
    confirmText: `Se va a ejecutar una acción crítica:\n\n${label || command}\n\nComando: ${command}\n\nEsto puede borrar datos, reiniciar el sistema o afectar la integridad del dispositivo. ¿Continuar?`,
  }
}

export default observer(function ChatAdb() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init',
      role: 'ai',
      explanation: 'Soy tu asistente ADB seguro. No ejecuto texto libre ni comandos arbitrarios. Te mostraré acciones aprobadas y deberás confirmar cada una antes de ejecutarla.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [securityNotice, setSecurityNotice] = useState<SecurityNotice | null>(null)
  const [blockedAttempts, setBlockedAttempts] = useState<BlockedAttempt[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef<string>(DEFAULT_SESSION_ID)

  const deviceId = store.device?.id

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const logBlockedAttempt = async (prompt: string, reason: string) => {
    const safePrompt = sanitizeForAudit(prompt)
    const entry: BlockedAttempt = {
      id: createSafeId('blocked'),
      reason,
      prompt: safePrompt || 'entrada vacía',
      timestamp: new Date().toISOString(),
    }

    setBlockedAttempts((prev) => [entry, ...prev].slice(0, 5))

    await main.writeAuditLog({
      category: 'security',
      action: 'chat_input_blocked',
      level: 'warn',
      status: 'blocked',
      deviceId: deviceId || undefined,
      actor: 'operator',
      sessionId: sessionIdRef.current,
      prompt: safePrompt,
      details: reason,
      source: 'renderer',
    })
  }

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userText = input.trim()
    const validation = validateUserInput(userText)
    if (!validation.ok) {
      const reason = validation.reason
      setInput('')
      setSecurityNotice({ level: 'error', text: reason })
      await logBlockedAttempt(userText, reason)
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        role: 'ai',
        explanation: reason,
      }])
      return
    }

    setInput('')

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: userText }
    setMessages(prev => [...prev, userMsg])

    if (isCasualChatPrompt(userText)) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        explanation: '¡Hola! Puedo ayudarte a revisar batería, almacenamiento, apps y red del dispositivo. Prueba algo como “revisa el almacenamiento” o “estado de la batería”.',
      }])
      return
    }

    setLoading(true)
    setSecurityNotice(null)

    try {
      await main.writeAuditLog({
        category: 'ai',
        action: 'chat_prompt_sent',
        level: 'info',
        status: 'pending',
        deviceId: deviceId || undefined,
        actor: 'operator',
        sessionId: sessionIdRef.current,
        prompt: sanitizeForAudit(userText),
        source: 'renderer',
      })

      if (!store.settings.geminiApiKey) {
        throw new Error('La Gemini API Key está vacía. Ve a Ajustes (⚙️) y guarda la clave antes de usar el chat.')
      }

      const { command, explanation: aiExplanation } = await askGeminiForAdbCommand(userText)
      const normalized = normalizeApprovedAction(command)

      if (!normalized) {
        throw new Error('Gemini respondió con un comando que no está dentro de la allowlist segura de ADB.')
      }

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        explanation: aiExplanation || 'Gemini ha sugerido una acción segura y aprobada.',
        suggestions: [normalized],
      }

      await main.writeAuditLog({
        category: 'ai',
        action: 'chat_prompt_response',
        level: 'info',
        status: 'success',
        deviceId: deviceId || undefined,
        actor: 'operator',
        sessionId: sessionIdRef.current,
        prompt: sanitizeForAudit(userText),
        command: normalized.command,
        details: aiExplanation || 'Gemini respondió con una acción aprobada.',
        source: 'ai',
      })

      setMessages(prev => [...prev, aiMsg])
    } catch (err: any) {
      await main.writeAuditLog({
        category: 'ai',
        action: 'chat_prompt_error',
        level: 'error',
        status: 'error',
        deviceId: deviceId || undefined,
        actor: 'operator',
        sessionId: sessionIdRef.current,
        prompt: sanitizeForAudit(userText),
        details: err?.message || String(err),
        source: 'renderer',
      })

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        explanation: `Error: ${err.message}`,
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleDryRun = async (action: ApprovedAction) => {
    if (!deviceId) {
      notify('No hay dispositivo conectado', { icon: 'error' })
      return
    }

    const risk = getDangerousActionWarning(action.command, action.label)
    if (risk) {
      setSecurityNotice({ level: 'warning', text: risk.text })
      const confirmed = window.confirm(risk.confirmText)
      if (!confirmed) {
        await main.writeAuditLog({
          category: 'security',
          action: 'ai_action_cancelled_precheck',
          level: 'warn',
          status: 'cancelled',
          deviceId,
          actor: 'operator',
          sessionId: sessionIdRef.current,
          command: action.command,
          source: 'renderer',
          details: 'Acción ambigua o destructiva rechazada por el técnico.',
        })
        return null
      }
    }

    const preview = `VERIFICACION ${action.command}`
    await main.writeAuditLog({
      category: 'adb',
      action: 'execute_adb_command_preview',
      level: 'info',
      status: 'pending',
      deviceId,
      actor: 'operator',
      sessionId: sessionIdRef.current,
      command: action.command,
      source: 'renderer',
      details: 'Dry-run / validación previa antes de ejecutar',
    })

    try {
      const dryRunCommand = `echo ${JSON.stringify(preview)}`
      const output = await main.execAdb(deviceId, dryRunCommand)
      notify(`Verificación previa OK: ${action.label}`, { icon: 'success' })
      return output
    } catch (err: any) {
      notify(`La validación previa falló: ${err?.message || 'error'}`, { icon: 'error' })
      return null
    }
  }

  const handleExecute = async (msgId: string, command: string) => {
    if (!deviceId) {
      notify('No hay dispositivo conectado', { icon: 'error' })
      return
    }

    const normalized = normalizeApprovedAction(command)
    if (!normalized) {
      notify('Este comando no está dentro de la lista aprobada. Ejecución bloqueada.', { icon: 'error' })
      await main.writeAuditLog({
        category: 'adb',
        action: 'execute_adb_command_blocked',
        level: 'error',
        status: 'blocked',
        deviceId,
        actor: 'operator',
        sessionId: sessionIdRef.current,
        command,
        source: 'renderer',
        details: 'Comando rechazado porque no pertenece a la allowlist',
      })
      return
    }

    const risk = getDangerousActionWarning(normalized.command, normalized.label)
    if (risk) {
      setSecurityNotice({ level: 'warning', text: risk.text })
      const confirmDefault = window.confirm(risk.confirmText)
      if (!confirmDefault) {
        await main.writeAuditLog({
          category: 'security',
          action: 'adb_action_cancelled_by_operator',
          level: 'warn',
          status: 'cancelled',
          deviceId,
          actor: 'operator',
          sessionId: sessionIdRef.current,
          command: normalized.command,
          source: 'renderer',
          details: 'Ejecución cancelada por el técnico tras advertencia de seguridad.',
        })
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'error', output: 'Cancelado por el usuario' } : m))
        return
      }
    }

    const preview = await handleDryRun(normalized)
    if (preview === null) {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'error', output: 'Validación previa fallida' } : m))
      return
    }

    await main.writeAuditLog({
      category: 'adb',
      action: 'execute_adb_command_authorized',
      level: 'info',
      status: 'pending',
      deviceId,
      actor: 'operator',
      authorizedBy: 'operator',
      sessionId: sessionIdRef.current,
      command: normalized.command,
      source: 'renderer',
      details: 'Autorización explícita por acción aprobada y validada antes de ejecutar',
    })

    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'pending', output: 'Ejecutando...' } : m))

    try {
      const output = await main.execAdb(deviceId, normalized.command)
      let abbreviatedOutput = 'Sin salida'
      if (output) {
        abbreviatedOutput = output.slice(0, 400)
        if (output.length > 400) {
          abbreviatedOutput += '…'
        }
      }

      await main.writeAuditLog({
        category: 'adb',
        action: 'execute_adb_command_completed',
        level: 'info',
        status: 'success',
        deviceId,
        actor: 'operator',
        authorizedBy: 'operator',
        sessionId: sessionIdRef.current,
        command: normalized.command,
        source: 'main',
        details: abbreviatedOutput,
      })
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'success', output: output || '(Comando ejecutado con éxito, sin salida)' } : m))
    } catch (err: any) {
      await main.writeAuditLog({
        category: 'adb',
        action: 'execute_adb_command_failed',
        level: 'error',
        status: 'error',
        deviceId,
        actor: 'operator',
        authorizedBy: 'operator',
        sessionId: sessionIdRef.current,
        command: normalized.command,
        source: 'main',
        details: err?.message || String(err),
      })
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

                {msg.suggestions?.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                    {msg.suggestions.map((suggestion) => (
                      <div key={suggestion.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 10, background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{suggestion.label}</div>
                        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>{suggestion.description}</div>
                        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>$ {suggestion.command}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className={Style.executeButton} onClick={() => handleDryRun(suggestion)}>
                            Verificar
                          </button>
                          <button className={Style.executeButton} onClick={() => handleExecute(msg.id, suggestion.command)}>
                            Ejecutar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

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

        {securityNotice && (
          <div className={`${Style.securityBanner} ${Style[securityNotice.level]}`}>
            {securityNotice.text}
          </div>
        )}

        {blockedAttempts.length > 0 && (
          <div className={Style.blockedAttempts}>
            <div className={Style.blockedAttemptsTitle}>Historial de intentos bloqueados</div>
            {blockedAttempts.map((attempt) => (
              <div key={attempt.id} className={Style.blockedAttemptItem}>
                <div className={Style.blockedAttemptTime}>{new Date(attempt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                <div className={Style.blockedAttemptText}>{attempt.reason}</div>
              </div>
            ))}
          </div>
        )}

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
          placeholder="Ej: necesito revisar el almacenamiento..."
          disabled={loading}
        />
        <button className={Style.sendButton} onClick={handleSend} disabled={!input.trim() || loading}>
          <span className="icon-send" />
        </button>
      </div>
    </div>
  )
})
