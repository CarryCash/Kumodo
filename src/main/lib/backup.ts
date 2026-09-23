import path from 'node:path'
import os from 'node:os'
import fs from 'fs-extra'
import crypto from 'crypto'
import { shell, getAdbPath, spawnAdb } from './adb/base'
import { handleEvent, getUserDataPath } from 'share/main/lib/util'
import { IpcRunBackup, IpcPickFolder, IBackupJob, IBackupProgress } from 'common/types'
import { dialog } from 'electron'
import { appendAuditEntry } from './audit'

const FORBIDDEN_EVIDENCE_FILES = new Set(['manifest.json', 'seal.json', 'chain-of-custody.log', 'chain-of-custody.json'])

function getCurrentOperator(): string {
  return process.env.USER || process.env.USERNAME || os.userInfo().username || 'unknown-user'
}

/** Compute SHA-256 checksum of a file (full value) */
async function checksumFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (d) => hash.update(d))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

/** Compute a checksum over all files in a directory (sorted for stability) */
async function checksumDir(dirPath: string): Promise<string> {
  const allFiles: string[] = []
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      if (FORBIDDEN_EVIDENCE_FILES.has(name)) continue
      if (fs.statSync(full).isDirectory()) walk(full)
      else allFiles.push(full)
    }
  }
  walk(dirPath)
  allFiles.sort()

  const hash = crypto.createHash('sha256')
  for (const f of allFiles) {
    hash.update(f.replace(dirPath, ''))
    const buf = fs.readFileSync(f)
    hash.update(buf)
  }
  return hash.digest('hex')
}

async function listExtractedFiles(dirPath: string): Promise<string[]> {
  const files: string[] = []
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      if (FORBIDDEN_EVIDENCE_FILES.has(name)) continue
      if (fs.statSync(full).isDirectory()) walk(full)
      else files.push(full)
    }
  }
  walk(dirPath)
  return files.sort()
}

async function writeChainOfCustody(outputPath: string, deviceId: string, type: string, packageName: string | undefined, files: Array<{ path: string; sha256: string; size: number }>) {
  const operator = getCurrentOperator()
  const now = new Date().toISOString()
  const context = {
    generatedAt: now,
    generatedBy: operator,
    deviceId,
    type,
    packageName: packageName || null,
    evidenceFiles: files,
    totalFiles: files.length,
    totalSize: files.reduce((sum, item) => sum + item.size, 0),
  }

  const manifestPath = path.join(outputPath, 'manifest.json')
  const manifestHash = crypto.createHash('sha256').update(JSON.stringify(context, null, 2)).digest('hex')
  const sealedAt = new Date().toISOString()
  const sealedManifest = {
    ...context,
    chainOfCustody: {
      algorithm: 'SHA-256',
      sealed: true,
      sealCreatedAt: sealedAt,
      sealedBy: operator,
      sealValue: manifestHash,
    },
  }

  await fs.writeJson(manifestPath, sealedManifest, { spaces: 2 })

  const sealPath = path.join(outputPath, 'seal.json')
  await fs.writeJson(sealPath, {
    createdAt: sealedAt,
    createdBy: operator,
    deviceId,
    algorithm: 'SHA-256',
    manifestFile: 'manifest.json',
    sealValue: manifestHash,
  }, { spaces: 2 })

  const logLines = [
    `${sealedAt}\t${operator}\tEXTRACTION_STARTED\t${deviceId}\t${type}\t${packageName || 'n/a'}`,
    `${sealedAt}\t${operator}\tEVIDENCE_SEALED\t${deviceId}\tmanifest.json\t${manifestHash}`,
    ...files.map((file) => `${sealedAt}\t${operator}\tFILE_HASHED\t${deviceId}\t${file.path}\t${file.sha256}`),
  ]
  await fs.writeFile(path.join(outputPath, 'chain-of-custody.log'), logLines.join('\n') + '\n')

  return {
    manifestPath,
    manifestHash,
    chainOfCustodyPath: path.join(outputPath, 'chain-of-custody.log'),
    evidenceBy: operator,
  }
}

/** Run `adb -s <deviceId> pull <remote> <local>` using spawnAdb */
async function adbPull(deviceId: string, remote: string, local: string): Promise<{ ok: boolean; err: string }> {
  const result = await spawnAdb(['-s', deviceId, 'pull', remote, local])
  return {
    ok: result.code === 0,
    err: result.stderr,
  }
}

const runBackup: IpcRunBackup = async function (job: IBackupJob): Promise<IBackupProgress> {
  const { type, deviceId, destFolder, packageName } = job

  // Build timestamped folder name: Backup_<type>_<deviceId>_<timestamp>
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const safeDev = deviceId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const folderName = `Backup_${type}_${safeDev}_${ts}`
  const outputPath = path.join(destFolder, folderName)
  await fs.ensureDir(outputPath)

  try {
    const operator = getCurrentOperator()
    await appendAuditEntry({
      category: 'backup',
      action: 'backup_started',
      level: 'info',
      status: 'pending',
      deviceId,
      actor: operator,
      authorizedBy: operator,
      details: `Inicio de respaldo tipo ${type}`,
      source: 'main',
    })

    if (type === 'photos') {
      // Pull both DCIM and Pictures
      await adbPull(deviceId, '/sdcard/DCIM', outputPath)
      await adbPull(deviceId, '/sdcard/Pictures', outputPath)
      await adbPull(deviceId, '/sdcard/WhatsApp/Media', outputPath)
    } else if (type === 'files') {
      // Pull general files (Documents, Downloads, Music, Videos)
      for (const dir of ['Documents', 'Download', 'Music', 'Videos', 'Ringtones']) {
        await adbPull(deviceId, `/sdcard/${dir}`, outputPath)
      }
    } else if (type === 'apks') {
      // Extract installed APKs via pm path
      const pkgListRaw = await shell(deviceId, 'pm list packages -3')
      const pkgs = pkgListRaw.trim().split('\n').filter(Boolean).map((l) => l.slice(8))

      const apkDir = path.join(outputPath, 'apks')
      await fs.ensureDir(apkDir)

      for (const pkg of pkgs) {
        const pathRaw = await shell(deviceId, `pm path ${pkg}`)
        const apkPath = pathRaw.trim().replace('package:', '')
        if (apkPath) {
          const localFile = path.join(apkDir, `${pkg}.apk`)
          await adbPull(deviceId, apkPath, localFile)
        }
      }
    } else if (type === 'appdata') {
      if (!packageName) throw new Error('No se especificó paquete para el respaldo de datos')
      // Attempt adb backup (works on some ROMs without root)
      const backupFile = path.join(outputPath, `${packageName}.ab`)
      const result = await spawnAdb([
        '-s', deviceId,
        'backup', '-f', backupFile,
        '-noapk', packageName,
      ])
      if (result.code !== 0) {
        // fallback: pull /sdcard/Android/data/<pkg> if accessible
        const fallbackDir = path.join(outputPath, 'data')
        await adbPull(deviceId, `/sdcard/Android/data/${packageName}`, fallbackDir)
      }
    }

    const extractedFiles = await listExtractedFiles(outputPath)
    const fileRecords = [] as Array<{ path: string; sha256: string; size: number }>

    for (const file of extractedFiles) {
      const relative = path.relative(outputPath, file).split(path.sep).join('/')
      const size = fs.statSync(file).size
      const sha256 = await checksumFile(file)
      fileRecords.push({ path: relative, sha256, size })
    }

    const evidence = await writeChainOfCustody(outputPath, deviceId, type, packageName, fileRecords)

    const checksum = await checksumDir(outputPath)

    const manifest = {
      type,
      deviceId,
      packageName,
      generatedAt: new Date().toISOString(),
      generatedBy: evidence.evidenceBy,
      sha256_partial: checksum,
      fileHashes: fileRecords,
      manifestPath: evidence.manifestPath,
      manifestHash: evidence.manifestHash,
      chainOfCustodyPath: evidence.chainOfCustodyPath,
      evidenceBy: evidence.evidenceBy,
      chainOfCustody: {
        algorithm: 'SHA-256',
        sealed: true,
        sealCreatedAt: new Date().toISOString(),
        sealedBy: evidence.evidenceBy,
        sealValue: evidence.manifestHash,
      },
    }
    await fs.writeJson(path.join(outputPath, 'manifest.json'), manifest, { spaces: 2 })

    await appendAuditEntry({
      category: 'backup',
      action: 'backup_completed',
      level: 'info',
      status: 'success',
      deviceId,
      actor: evidence.evidenceBy,
      authorizedBy: evidence.evidenceBy,
      details: `Respaldo completado en ${outputPath}`,
      source: 'main',
    })

    return {
      type,
      status: 'done',
      outputPath,
      checksum,
      manifestPath: evidence.manifestPath,
      manifestHash: evidence.manifestHash,
      chainOfCustodyPath: evidence.chainOfCustodyPath,
      evidenceBy: evidence.evidenceBy,
    }
  } catch (err: any) {
    await appendAuditEntry({
      category: 'backup',
      action: 'backup_failed',
      level: 'error',
      status: 'error',
      deviceId,
      actor: getCurrentOperator(),
      details: err?.message || String(err),
      source: 'main',
    })

    return {
      type,
      status: 'error',
      error: err?.message || String(err),
      outputPath,
    }
  }
}

const pickFolder: IpcPickFolder = async function () {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Seleccionar carpeta de destino',
  })
  return result.canceled ? null : result.filePaths[0]
}

export function init() {
  handleEvent('runBackup', runBackup)
  handleEvent('pickFolder', pickFolder)
}
