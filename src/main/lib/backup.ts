import path from 'path'
import fs from 'fs-extra'
import crypto from 'crypto'
import { shell, getAdbPath, spawnAdb } from './adb/base'
import { handleEvent } from 'share/main/lib/util'
import { IpcRunBackup, IpcPickFolder, IBackupJob, IBackupProgress } from 'common/types'
import { dialog } from 'electron'

/** Compute SHA-256 checksum of a file (or folder summary) */
async function checksumFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (d) => hash.update(d))
    stream.on('end', () => resolve(hash.digest('hex').slice(0, 16)))
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
  return hash.digest('hex').slice(0, 16)
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

    // Generate checksum of the output folder
    const checksum = await checksumDir(outputPath)

    // Write a manifest file
    const manifest = {
      type,
      deviceId,
      packageName,
      date: new Date().toISOString(),
      sha256_partial: checksum,
    }
    await fs.writeJson(path.join(outputPath, 'manifest.json'), manifest, { spaces: 2 })

    return {
      type,
      status: 'done',
      outputPath,
      checksum,
    }
  } catch (err: any) {
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
