import { Client } from '@devicefarmer/adbkit'
import {
  IMediaFile,
  IpcGetMediaFiles,
  IpcGetMediaThumbnail,
  IpcDetectMediaDuplicates,
  IpcPullMediaFiles,
  IpcDeleteMediaFiles,
} from 'common/types'
import { shell } from './adb/base'
import path from 'node:path'
import fs from 'node:fs'
import log from 'share/common/log'

const logger = log('media')

let adbClient: Client

export function initMedia(c: Client) {
  adbClient = c
}

const MEDIA_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'mp4',
  'mkv',
  'mov',
  '3gp',
  'webm',
  'avi',
])

const VIDEO_EXTENSIONS = new Set(['mp4', 'mkv', 'mov', '3gp', 'webm', 'avi'])

export const getMediaFiles: IpcGetMediaFiles = async function (deviceId) {
  const mediaList: IMediaFile[] = []

  try {
    const script = `
for d in /sdcard/DCIM /sdcard/Pictures /sdcard/Movies /sdcard/Download; do
  if [ -d "$d" ]; then
    find "$d" -maxdepth 5 -type f 2>/dev/null
  fi
done | grep -iE '\\.(jpg|jpeg|png|gif|webp|bmp|mp4|mkv|mov|3gp|webm|avi)$' | while read -r f; do
  stat -c "%n|%s|%Y" "$f" 2>/dev/null
done
`
    const [stdout] = await shell(deviceId, [script])
    if (!stdout) return []

    const lines = stdout.split('\n')
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line || !line.includes('|')) continue

      const parts = line.split('|')
      if (parts.length < 3) continue

      const filePath = parts[0].trim()
      const size = parseInt(parts[1], 10) || 0
      const epochSec = parseInt(parts[2], 10) || 0
      const fileName = path.posix.basename(filePath)
      const ext = (path.posix.extname(filePath).slice(1) || '').toLowerCase()

      if (!MEDIA_EXTENSIONS.has(ext)) continue

      mediaList.push({
        path: filePath,
        name: fileName,
        size,
        mtime: epochSec * 1000,
        type: VIDEO_EXTENSIONS.has(ext) ? 'video' : 'image',
        extension: ext,
      })
    }
  } catch (err: any) {
    logger.error('Error fetching media files', err)
  }

  // Sort descending by date
  return mediaList.sort((a, b) => b.mtime - a.mtime)
}

export const getMediaThumbnail: IpcGetMediaThumbnail = async function (
  deviceId,
  remotePath
) {
  try {
    const device = adbClient.getDevice(deviceId)
    const stream = await device.pull(remotePath)

    const chunks: Buffer[] = []
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => {
        const fullBuf = Buffer.concat(chunks)
        const ext = path.extname(remotePath).slice(1).toLowerCase()
        const mime = ext === 'png' ? 'image/png' : ext === 'mp4' ? 'video/mp4' : 'image/jpeg'
        resolve(`data:${mime};base64,${fullBuf.toString('base64')}`)
      })
      stream.on('error', (err: any) => reject(err))
    })
  } catch (err: any) {
    logger.error('Error pulling thumbnail', err)
    return ''
  }
}

export const detectMediaDuplicates: IpcDetectMediaDuplicates = async function (
  deviceId,
  paths
) {
  const duplicatesMap: Record<string, string[]> = {}
  if (!paths || paths.length === 0) return duplicatesMap

  const BATCH_SIZE = 25
  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const chunk = paths.slice(i, i + BATCH_SIZE)
    const quoted = chunk.map((p) => `"${p}"`).join(' ')
    try {
      const [stdout] = await shell(deviceId, [`md5sum ${quoted} 2>/dev/null`])
      if (stdout) {
        const lines = stdout.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          const spaceIdx = trimmed.indexOf(' ')
          if (spaceIdx > 0) {
            const hash = trimmed.slice(0, spaceIdx).trim()
            const filePath = trimmed.slice(spaceIdx).trim()
            if (hash && filePath) {
              if (!duplicatesMap[hash]) {
                duplicatesMap[hash] = []
              }
              duplicatesMap[hash].push(filePath)
            }
          }
        }
      }
    } catch (err: any) {
      logger.error('Error calculating md5sums', err)
    }
  }

  const result: Record<string, string[]> = {}
  for (const [hash, fileList] of Object.entries(duplicatesMap)) {
    if (fileList.length > 1) {
      result[hash] = fileList
    }
  }

  return result
}

export const pullMediaFiles: IpcPullMediaFiles = async function (
  deviceId,
  remotePaths,
  targetDir
) {
  let success = 0
  let failed = 0
  const device = adbClient.getDevice(deviceId)

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  for (const remotePath of remotePaths) {
    try {
      const fileName = path.posix.basename(remotePath)
      const localPath = path.join(targetDir, fileName)
      const stream = await device.pull(remotePath)
      await new Promise<void>((resolve, reject) => {
        const writeStream = fs.createWriteStream(localPath)
        stream.pipe(writeStream)
        writeStream.on('finish', () => resolve())
        writeStream.on('error', (err) => reject(err))
        stream.on('error', (err: any) => reject(err))
      })
      success++
    } catch (err: any) {
      logger.error(`Failed to pull ${remotePath}`, err)
      failed++
    }
  }

  return { success, failed }
}

export const deleteMediaFiles: IpcDeleteMediaFiles = async function (
  deviceId,
  remotePaths
) {
  try {
    const quoted = remotePaths.map((p) => `"${p}"`).join(' ')
    await shell(deviceId, [`rm -f ${quoted}`])
    return true
  } catch (err: any) {
    logger.error('Error deleting media files', err)
    return false
  }
}
