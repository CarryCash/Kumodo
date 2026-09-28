import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import log from 'share/common/log'
import { handleEvent } from 'share/main/lib/util'
import { getUserDataPath } from 'share/main/lib/util'
import { IAuditLogEntry, IpcGetAuditLog, IpcWriteAuditLog } from 'common/types'

const logger = log('audit')
const AUDIT_DIR = getUserDataPath('audit')
const AUDIT_LOG_FILE = path.join(AUDIT_DIR, 'internal-audit.jsonl')

export function getCurrentActor(): string {
  return process.env.USER || process.env.USERNAME || os.userInfo().username || 'desktop-user'
}

export function normalizeAuditEntry(entry: Partial<IAuditLogEntry>): IAuditLogEntry {
  const timestamp = new Date().toISOString()
  return {
    timestamp,
    category: entry.category || 'system',
    action: entry.action || 'unknown_action',
    level: entry.level || 'info',
    status: entry.status || 'success',
    deviceId: entry.deviceId,
    actor: entry.actor || getCurrentActor(),
    authorizedBy: entry.authorizedBy,
    command: entry.command,
    prompt: entry.prompt,
    details: entry.details,
    sessionId: entry.sessionId,
    source: entry.source || 'app',
  }
}

export const appendAuditEntry: IpcWriteAuditLog = async function (entry) {
  try {
    await fs.ensureDir(AUDIT_DIR)
    const normalized = normalizeAuditEntry(entry)
    await fs.appendFile(AUDIT_LOG_FILE, `${JSON.stringify(normalized)}\n`, 'utf8')
    return
  } catch (err) {
    logger.error('write audit entry failed', err)
    throw err
  }
}

export const getAuditLog: IpcGetAuditLog = async function (limit = 200) {
  try {
    if (!(await fs.pathExists(AUDIT_LOG_FILE))) {
      return []
    }

    const contents = await fs.readFile(AUDIT_LOG_FILE, 'utf8')
    const lines = contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-limit)

    return lines
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .filter(Boolean) as IAuditLogEntry[]
  } catch (err) {
    logger.error('read audit log failed', err)
    return []
  }
}

export function init() {
  handleEvent('writeAuditLog', appendAuditEntry)
  handleEvent('getAuditLog', getAuditLog)
  logger.info('audit logger initialized', { file: AUDIT_LOG_FILE })
}
