import { shell } from './adb/base'
import log from 'share/common/log'
import {
  IForensicCallLog,
  IForensicSms,
  IForensicContact,
  IForensicUninstalledApp,
  IForensicDeletedFile,
  IpcGetForensicCallLog,
  IpcGetForensicSms,
  IpcGetForensicContacts,
  IpcGetForensicUninstalledApps,
  IpcGetForensicDeletedFiles,
} from 'common/types'

const logger = log('forensic')

// ─── Call Log ─────────────────────────────────────────────────────────────────

export const getForensicCallLog: IpcGetForensicCallLog = async function (deviceId) {
  try {
    const [out] = await shell(deviceId, [
      `content query --uri content://call_log/calls --projection number:date:duration:type:name 2>/dev/null | head -n 300`,
    ])

    const entries: IForensicCallLog[] = []
    for (const line of (out || '').split('\n').filter(Boolean)) {
      if (!line.startsWith('Row:')) continue
      const row = parseContentRow(line)
      if (!row.number) continue
      const typeMap: Record<string, string> = {
        '1': 'incoming',
        '2': 'outgoing',
        '3': 'missed',
        '4': 'voicemail',
        '5': 'rejected',
      }
      entries.push({
        number: row.number || '(desconocido)',
        name: row.name && row.name !== 'NULL' ? row.name : undefined,
        date: row.date ? parseInt(row.date) : 0,
        duration: row.duration ? parseInt(row.duration) : 0,
        type: (typeMap[row.type || ''] as any) || 'incoming',
      })
    }

    return entries.sort((a, b) => b.date - a.date)
  } catch (err) {
    logger.error('getForensicCallLog error', err)
    return []
  }
}

// ─── SMS ──────────────────────────────────────────────────────────────────────

export const getForensicSms: IpcGetForensicSms = async function (deviceId) {
  try {
    const [out] = await shell(deviceId, [
      `content query --uri content://sms --projection address:date:body:type:read 2>/dev/null | head -n 300`,
    ])

    const entries: IForensicSms[] = []
    for (const line of (out || '').split('\n').filter(Boolean)) {
      if (!line.startsWith('Row:')) continue
      const row = parseContentRow(line)
      if (!row.address && !row.body) continue
      entries.push({
        address: row.address || '(desconocido)',
        date: row.date ? parseInt(row.date) : 0,
        body: row.body || '',
        type: row.type === '2' ? 'sent' : 'received',
        read: row.read !== '0',
      })
    }

    return entries.sort((a, b) => b.date - a.date)
  } catch (err) {
    logger.error('getForensicSms error', err)
    return []
  }
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

export const getForensicContacts: IpcGetForensicContacts = async function (deviceId) {
  try {
    const [out] = await shell(deviceId, [
      `content query --uri content://contacts/phones --projection display_name:number:type 2>/dev/null | head -n 500`,
    ])

    const entries: IForensicContact[] = []
    for (const line of (out || '').split('\n').filter(Boolean)) {
      if (!line.startsWith('Row:')) continue
      const row = parseContentRow(line)
      if (!row.display_name && !row.number) continue
      entries.push({
        name: row.display_name || '(sin nombre)',
        number: row.number || '',
        type: row.type || '0',
      })
    }

    return entries.sort((a, b) => a.name.localeCompare(b.name))
  } catch (err) {
    logger.error('getForensicContacts error', err)
    return []
  }
}

// ─── Uninstalled App Residues ─────────────────────────────────────────────────

export const getForensicUninstalledApps: IpcGetForensicUninstalledApps = async function (deviceId) {
  try {
    // Apps that have data residue in /data/data but are not currently installed
    const [installedOut, dataOut] = await Promise.all([
      shell(deviceId, [`pm list packages 2>/dev/null`]),
      shell(deviceId, [`ls /data/data 2>/dev/null || ls /data/user/0 2>/dev/null`]),
    ])

    const installed = new Set<string>()
    for (const line of (installedOut[0] || '').split('\n')) {
      const pkg = line.trim().replace('package:', '').trim()
      if (pkg) installed.add(pkg)
    }

    const dataFolders: string[] = []
    for (const line of (dataOut[0] || '').split('\n').filter(Boolean)) {
      const pkg = line.trim()
      if (pkg && pkg.includes('.') && !installed.has(pkg)) {
        dataFolders.push(pkg)
      }
    }

    const results: IForensicUninstalledApp[] = []
    for (const pkg of dataFolders.slice(0, 50)) {
      try {
        const [sizeOut] = await shell(deviceId, [
          `du -sk /data/data/${pkg} 2>/dev/null || du -sk /data/user/0/${pkg} 2>/dev/null`,
        ])
        const kb = parseInt((sizeOut || '0').split('\t')[0]) || 0
        results.push({
          package: pkg,
          dataSize: kb * 1024,
          path: `/data/data/${pkg}`,
        })
      } catch {
        results.push({ package: pkg, dataSize: 0, path: `/data/data/${pkg}` })
      }
    }

    return results.sort((a, b) => b.dataSize - a.dataSize)
  } catch (err) {
    logger.error('getForensicUninstalledApps error', err)
    return []
  }
}

// ─── Deleted Files (not yet overwritten) ─────────────────────────────────────

export const getForensicDeletedFiles: IpcGetForensicDeletedFiles = async function (deviceId) {
  try {
    // Look for .trashed / .thumbnails / empty-ish recently modified files in DCIM and Downloads
    const [out] = await shell(deviceId, [
      `find /sdcard/DCIM /sdcard/Downloads /sdcard/Pictures -name "*.trashed*" -o -name ".nomedia" -o -name "*.tmp" 2>/dev/null | head -n 60`,
    ])

    const found: string[] = (out || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    const results: IForensicDeletedFile[] = []
    for (const filePath of found) {
      try {
        const [statOut] = await shell(deviceId, [
          `stat -c "%s %Y %n" "${filePath}" 2>/dev/null`,
        ])
        const parts = (statOut || '').trim().split(' ')
        const size = parseInt(parts[0]) || 0
        const mtime = (parseInt(parts[1]) || 0) * 1000
        results.push({ path: filePath, size, mtime, status: 'recoverable' })
      } catch {
        results.push({ path: filePath, size: 0, mtime: 0, status: 'recoverable' })
      }
    }

    return results.sort((a, b) => b.mtime - a.mtime)
  } catch (err) {
    logger.error('getForensicDeletedFiles error', err)
    return []
  }
}

// ─── Helper: parse ADB content query row ─────────────────────────────────────

function parseContentRow(line: string): Record<string, string> {
  // e.g. "Row: 0 number=+521234567890, date=1695000000000, duration=12, type=1, name=NULL"
  const result: Record<string, string> = {}
  // Remove "Row: N "
  const withoutPrefix = line.replace(/^Row:\s*\d+\s*/, '')
  // Split on ", key=" boundaries
  const parts = withoutPrefix.split(/, (?=[a-z_]+=)/)
  for (const part of parts) {
    const eqIdx = part.indexOf('=')
    if (eqIdx === -1) continue
    const key = part.slice(0, eqIdx).trim()
    const value = part.slice(eqIdx + 1).trim()
    result[key] = value === 'NULL' ? '' : value
  }
  return result
}
