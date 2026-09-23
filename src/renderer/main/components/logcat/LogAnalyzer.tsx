import { useEffect, useRef, useState } from 'react'
import { ILogCase, ILogIssue, ILogIssueSeverity } from 'common/types'
import { IDevice } from 'common/types'
import className from 'licia/className'
import download from 'licia/download'
import uniqId from 'licia/uniqId'
import Style from './LogAnalyzer.module.scss'
import { notify } from 'share/renderer/lib/util'
import dateFormat from 'licia/dateFormat'

/* ─────────────────────────── Detection Rules ─────────────────────────── */
const RULES: Array<{
  severity: ILogIssueSeverity
  label: string
  test: (entry: any) => boolean
}> = [
  {
    severity: 'crash',
    label: 'CRASH',
    test: (e) =>
      e.priority >= 6 &&
      (e.message.includes('FATAL EXCEPTION') ||
        e.message.includes('Process: ') ||
        e.tag === 'AndroidRuntime'),
  },
  {
    severity: 'anr',
    label: 'ANR',
    test: (e) =>
      (e.tag === 'ActivityManager' || e.tag === 'art') &&
      (e.message.includes('ANR in') || e.message.includes('not responding')),
  },
  {
    severity: 'oom',
    label: 'OutOfMemory',
    test: (e) => e.message.includes('OutOfMemoryError') || e.message.includes('java.lang.OutOfMemory'),
  },
  {
    severity: 'security',
    label: 'SecurityException',
    test: (e) => e.message.includes('SecurityException') || e.message.includes('Permission Denial'),
  },
  {
    severity: 'system',
    label: 'System Error',
    test: (e) => e.priority >= 6 && (e.package === 'system_server' || e.tag === 'system_server'),
  },
  {
    severity: 'error',
    label: 'Error',
    test: (e) => e.priority >= 6,
  },
]

const SEVERITY_LABELS: Record<ILogIssueSeverity, string> = {
  crash: 'CRASH',
  anr: 'ANR',
  oom: 'OOM',
  security: 'SEC',
  system: 'SYS',
  error: 'ERR',
}

interface Props {
  device: IDevice | null
  entriesRef: React.MutableRefObject<any[]>
  onClose: () => void
}

export default function LogAnalyzer({ device, entriesRef, onClose }: Props) {
  const [issues, setIssues] = useState<ILogIssue[]>([])
  const [filter, setFilter] = useState<ILogIssueSeverity | null>(null)
  const [view, setView] = useState<'live' | 'cases'>('live')
  const [cases, setCases] = useState<ILogCase[]>([])
  const [expandedCase, setExpandedCase] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Live scan every second
  useEffect(() => {
    scan()
    intervalRef.current = setInterval(scan, 1500)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // Load saved cases
  useEffect(() => {
    loadCases()
  }, [view])

  function scan() {
    const found: ILogIssue[] = []
    const seen = new Set<string>()

    for (const entry of entriesRef.current) {
      for (const rule of RULES) {
        if (rule.test(entry)) {
          // Dedupe by (severity + message snippet)
          const key = `${rule.severity}:${entry.message.slice(0, 80)}`
          if (!seen.has(key)) {
            seen.add(key)
            found.push({
              id: uniqId('issue'),
              severity: rule.severity,
              tag: entry.tag || '',
              message: entry.message || '',
              package: entry.package,
              timestamp: entry.date ? new Date(entry.date).getTime() : Date.now(),
              raw: `${entry.tag}: ${entry.message}`,
            })
          }
          break // first matching rule wins
        }
      }
    }

    setIssues(found)
  }

  async function loadCases() {
    if (!device) return
    try {
      const c = await main.getLogCases(device.id)
      setCases(c)
    } catch {}
  }

  async function saveAsCase() {
    if (!device) return
    if (filtered.length === 0) {
      notify('No hay problemas detectados para guardar', { icon: 'info' })
      return
    }
    const label = prompt('Nombre del caso (cliente / ticket):', `Caso ${new Date().toLocaleDateString()}`)
    if (!label) return
    const newCase: ILogCase = {
      id: uniqId('case'),
      serialno: device.id,
      deviceName: device.name,
      createdAt: Date.now(),
      label,
      issues: filtered,
    }
    await main.saveLogCase(newCase)
    notify('Caso guardado correctamente', { icon: 'success' })
    loadCases()
  }

  function exportTxt() {
    const lines = filtered
      .map(
        (i) =>
          `[${new Date(i.timestamp).toLocaleString()}] [${SEVERITY_LABELS[i.severity]}] ${i.tag} (${i.package || '?'}):\n  ${i.message}\n`
      )
      .join('\n')
    const name = `logcat_analysis_${device?.name || 'device'}_${dateFormat('yyyymmddHH')}.txt`
    download(lines, name, 'text/plain')
  }

  function exportJson() {
    const data = JSON.stringify(filtered, null, 2)
    const name = `logcat_analysis_${device?.name || 'device'}_${dateFormat('yyyymmddHH')}.json`
    download(data, name, 'application/json')
  }

  async function deleteCase(caseId: string) {
    if (!device) return
    if (!confirm('¿Eliminar este caso?')) return
    await main.deleteLogCase(device.id, caseId)
    loadCases()
  }

  const counts: Partial<Record<ILogIssueSeverity, number>> = {}
  for (const i of issues) {
    counts[i.severity] = (counts[i.severity] || 0) + 1
  }

  const filtered = filter ? issues.filter((i) => i.severity === filter) : issues

  const severityOrder: ILogIssueSeverity[] = ['crash', 'anr', 'oom', 'security', 'system', 'error']

  return (
    <div className={Style.container}>
      {/* Header counters */}
      <div className={Style.toolbar}>
        <span className={Style.toolbarLabel}>Analizador de Logs</span>
        <button
          className={Style.btn}
          onClick={() => setView(view === 'live' ? 'cases' : 'live')}
        >
          {view === 'live' ? '📁 Casos Guardados' : '🔴 Tiempo Real'}
        </button>
        <div className={Style.counter}>
          {severityOrder.map((sev) =>
            (counts[sev] || 0) > 0 ? (
              <span
                key={sev}
                className={className(Style.countBadge, Style[sev], filter === sev && Style.active)}
                onClick={() => setFilter(filter === sev ? null : sev)}
              >
                {SEVERITY_LABELS[sev]} {counts[sev]}
              </span>
            ) : null
          )}
        </div>
      </div>

      {/* Main content */}
      {view === 'live' ? (
        <>
          <div className={Style.issuesList}>
            {filtered.length === 0 ? (
              <div className={Style.empty}>
                <span className={Style.emptyIcon}>✅</span>
                <span>No se detectaron problemas{filter ? ` de tipo ${filter}` : ''}</span>
                {filter && (
                  <button className={Style.btn} onClick={() => setFilter(null)}>
                    Mostrar todos
                  </button>
                )}
              </div>
            ) : (
              filtered.map((issue) => (
                <IssueItem key={issue.id} issue={issue} />
              ))
            )}
          </div>
          <div className={Style.actions}>
            <button className={className(Style.btn, Style.btnPrimary)} onClick={saveAsCase}>
              💾 Guardar Caso
            </button>
            <button className={Style.btn} onClick={exportTxt}>
              📄 Exportar TXT
            </button>
            <button className={Style.btn} onClick={exportJson}>
              🗂 Exportar JSON
            </button>
            <button className={Style.btn} onClick={onClose} style={{ marginLeft: 'auto' }}>
              ✕ Cerrar
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={Style.casesPanel}>
            {cases.length === 0 ? (
              <div className={Style.empty}>
                <span className={Style.emptyIcon}>📁</span>
                <span>No hay casos guardados para este dispositivo</span>
              </div>
            ) : (
              cases.map((c) => (
                <div key={c.id} className={Style.caseCard}>
                  <div className={Style.caseHeader} onClick={() => setExpandedCase(expandedCase === c.id ? null : c.id)}>
                    <div>
                      <div className={Style.caseTitle}>{c.label}</div>
                      <div className={Style.caseMeta}>
                        {c.issues.length} problemas · {new Date(c.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      className={Style.btn}
                      onClick={(e) => { e.stopPropagation(); deleteCase(c.id) }}
                    >
                      🗑
                    </button>
                  </div>
                  {expandedCase === c.id && (
                    <div className={Style.caseBody}>
                      {c.issues.map((issue) => (
                        <IssueItem key={issue.id} issue={issue} />
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          <div className={Style.actions}>
            <button className={Style.btn} onClick={onClose} style={{ marginLeft: 'auto' }}>
              ✕ Cerrar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function IssueItem({ issue }: { issue: ILogIssue }) {
  return (
    <div className={Style.issue}>
      <div className={className(Style.issueSeverity, Style[issue.severity])} />
      <div className={Style.issueBody}>
        <div className={Style.issueHeader}>
          <span className={className(Style.issueLabel, Style[issue.severity])}>
            {SEVERITY_LABELS[issue.severity]}
          </span>
          <span className={Style.issueTag}>{issue.tag}</span>
          {issue.package && <span className={Style.issuePkg}>{issue.package}</span>}
        </div>
        <div className={Style.issueMessage}>{issue.message}</div>
        <div className={Style.issueTime}>{new Date(issue.timestamp).toLocaleString()}</div>
      </div>
    </div>
  )
}
