import {
  IDebloatPackage,
  IpcGetDebloatList,
  IpcDebloatAction,
  IpcRestoreAllDebloat,
} from 'common/types'
import { shell } from '../adb/base'
import log from 'share/common/log'

const logger = log('debloater')

export const getDebloatList: IpcGetDebloatList = async function (deviceId) {
  try {
    const [allPkgOutput, disabledPkgOutput, manufacturer] = await Promise.all([
      shell(deviceId, ['pm list packages -s -u 2>/dev/null']),
      shell(deviceId, ['pm list packages -d 2>/dev/null']),
      shell(deviceId, ['getprop ro.product.manufacturer 2>/dev/null']),
    ])

    const mfg = (manufacturer[0] || '').trim().toLowerCase()

    // Parse installed system packages
    const installedSet = new Set<string>()
    for (const line of (allPkgOutput[0] || '').split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('package:')) {
        installedSet.add(trimmed.replace('package:', '').trim())
      }
    }

    // Parse disabled packages
    const disabledSet = new Set<string>()
    for (const line of (disabledPkgOutput[0] || '').split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('package:')) {
        disabledSet.add(trimmed.replace('package:', '').trim())
      }
    }

    const result: IDebloatPackage[] = []

    for (const pkg of installedSet) {
      const parts = pkg.split('.')
      const lastPart = parts.slice(2).join(' ') || parts.pop() || pkg
      const readableName =
        lastPart.charAt(0).toUpperCase() + lastPart.slice(1).replace(/[_.-]/g, ' ')

      let category: 'safe' | 'risky' | 'danger' = 'risky'
      const lower = pkg.toLowerCase()
      if (
        lower.includes('analytics') ||
        lower.includes('telemetry') ||
        lower.includes('tracking') ||
        lower.includes('feedback') ||
        lower.includes('bugreport') ||
        lower.includes('msa') ||
        lower.includes('adservice') ||
        lower.includes('facebook') ||
        lower.includes('partner')
      ) {
        category = 'safe'
      }

      let detectedMfg = mfg
      if (pkg.startsWith('com.samsung.')) detectedMfg = 'samsung'
      else if (pkg.startsWith('com.miui.') || pkg.startsWith('com.xiaomi.')) detectedMfg = 'xiaomi'
      else if (pkg.startsWith('com.motorola.')) detectedMfg = 'motorola'
      else if (pkg.startsWith('com.google.') || pkg.startsWith('com.android.')) detectedMfg = 'google'
      else if (pkg.startsWith('com.oppo.') || pkg.startsWith('com.coloros.')) detectedMfg = 'oppo'
      else if (pkg.startsWith('com.huawei.')) detectedMfg = 'huawei'

      result.push({
        package: pkg,
        name: readableName,
        manufacturer: detectedMfg,
        category,
        description: `Paquete del sistema de ${detectedMfg || 'Android'}. Pulsa "Analizar con Gemini IA" para obtener detalles de la web.`,
        dependencies: 'Pendiente de análisis con IA',
        isInstalled: true,
        isEnabled: !disabledSet.has(pkg),
      })
    }

    // Sort: safe first, then risky, then alphabetically
    return result.sort((a, b) => {
      const rank = { safe: 0, risky: 1, danger: 2 }
      if (rank[a.category] !== rank[b.category]) {
        return rank[a.category] - rank[b.category]
      }
      return a.name.localeCompare(b.name)
    })
  } catch (err: any) {
    logger.error('Error fetching debloat list', err)
    return []
  }
}

export const debloatAction: IpcDebloatAction = async function (
  deviceId,
  pkg,
  action
) {
  try {
    if (action === 'disable') {
      await shell(deviceId, [`pm disable-user --user 0 "${pkg}"`])
    } else if (action === 'uninstall') {
      await shell(deviceId, [`pm uninstall -k --user 0 "${pkg}"`])
    } else if (action === 'enable') {
      await shell(deviceId, [`pm enable "${pkg}"`])
    }
    return true
  } catch (err: any) {
    logger.error(`Failed to ${action} ${pkg}`, err)
    return false
  }
}

export const restoreAllDebloat: IpcRestoreAllDebloat = async function (
  deviceId,
  pkgs
) {
  let restored = 0
  let failed = 0

  for (const pkg of pkgs) {
    try {
      await shell(deviceId, [`pm enable "${pkg}"`])
      restored++
    } catch {
      failed++
    }
  }

  return { restored, failed }
}
