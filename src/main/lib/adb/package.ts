import { Client } from '@devicefarmer/adbkit'
import { shell } from './base'
import singleton from 'licia/singleton'
import map from 'licia/map'
import trim from 'licia/trim'
import contain from 'licia/contain'
import { handleEvent } from 'share/main/lib/util'
import {
  IpcClearPackage,
  IpcDisablePackage,
  IpcEnablePackage,
  IpcGetPackages,
  IpcGetTopPackage,
  IpcInstallPackage,
  IpcStartPackage,
  IpcStopPackage,
  IpcUninstallPackage,
  IpcGetAppAnalysis,
  IpcToggleApp,
  IAppInfo,
} from 'common/types'

let client: Client

const getCurrentUser = singleton(async (deviceId: string) => {
  const result = await shell(deviceId, 'am get-current-user')
  return parseInt(result, 10)
})

export const getPackages = singleton(<IpcGetPackages>(async (
  deviceId,
  system = true
) => {
  const result: string = await shell(
    deviceId,
    `pm list packages${system ? '' : ' -3'} --user ${await getCurrentUser(
      deviceId
    )}`
  )

  return map(trim(result).split('\n'), (line) => line.slice(8))
}))

const stopPackage: IpcStopPackage = async function (deviceId, pkg) {
  await shell(deviceId, `am force-stop ${pkg}`)
}

const clearPackage: IpcClearPackage = async function (deviceId, pkg) {
  const device = await client.getDevice(deviceId)
  await device.clear(pkg)
}

const startPackage: IpcStartPackage = async function (deviceId, pkg) {
  const component = await getMainComponent(deviceId, pkg)
  const device = await client.getDevice(deviceId)
  await device.startActivity({
    component,
  })
}

const installPackage: IpcInstallPackage = async function (deviceId, apkPath) {
  const device = await client.getDevice(deviceId)
  await device.install(apkPath)
}

const uninstallPackage: IpcUninstallPackage = async function (deviceId, pkg) {
  const device = await client.getDevice(deviceId)
  await device.uninstall(pkg)
}

async function getMainComponent(deviceId: string, pkg: string) {
  const result = await shell(
    deviceId,
    `dumpsys package ${pkg} | grep -A 1 MAIN`
  )
  const lines = result.split('\n')
  for (let i = 0, len = lines.length; i < len; i++) {
    const line = trim(lines[i])
    if (contain(line, `${pkg}/`)) {
      return line.substring(line.indexOf(`${pkg}/`), line.indexOf(' filter'))
    }
  }

  throw new Error('Failed to get main activity')
}

export const getTopPackage = singleton(<IpcGetTopPackage>(
  async function (deviceId) {
    const topActivity = await shell(deviceId, 'dumpsys activity')
    const lines = topActivity.split('\n')
    let line = ''
    for (let i = 0, len = lines.length; i < len; i++) {
      if (contain(lines[i], 'top-activity')) {
        line = trim(lines[i])
        break
      }
    }

    if (!line) {
      return {
        name: '',
        pid: 0,
      }
    }

    let parts = line.split(/\s+/)
    parts = parts[parts.length - 2].split(':')
    const pid = parseInt(parts[0], 10)
    let name = parts[1]
    if (contain(name, '/')) {
      name = name.split('/')[0]
    }

    return {
      name,
      pid,
    }
  }
))

const disablePackage: IpcDisablePackage = async function (deviceId, pkg) {
  await shell(deviceId, `pm disable-user ${pkg}`)
}

const enablePackage: IpcEnablePackage = async function (deviceId, pkg) {
  await shell(deviceId, `pm enable ${pkg}`)
}

// Dangerous permissions list that indicate risky apps
const DANGEROUS_PERMISSIONS = [
  'READ_CONTACTS', 'WRITE_CONTACTS',
  'READ_CALL_LOG', 'WRITE_CALL_LOG',
  'READ_SMS', 'SEND_SMS', 'RECEIVE_SMS',
  'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION',
  'RECORD_AUDIO',
  'CAMERA',
  'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE',
  'PROCESS_OUTGOING_CALLS',
  'READ_PHONE_STATE', 'CALL_PHONE',
  'GET_ACCOUNTS', 'USE_CREDENTIALS',
  'MANAGE_ACCOUNTS',
  'SYSTEM_ALERT_WINDOW',
  'BIND_DEVICE_ADMIN',
  'READ_LOGS',
]

// Known suspicious/adware package prefixes
const SUSPICIOUS_PREFIXES = [
  'com.airpush', 'com.admarvel', 'com.taptica', 'com.leadbolt',
  'com.startapp', 'com.mobvista', 'com.inmobi', 'com.mopub',
]

const getAppAnalysis: IpcGetAppAnalysis = async function (deviceId) {
  // Get all packages (system + user)
  const allResult: string = await shell(
    deviceId,
    `pm list packages -e --user ${await getCurrentUser(deviceId)}`
  )
  const disabledResult: string = await shell(
    deviceId,
    `pm list packages -d --user ${await getCurrentUser(deviceId)}`
  )
  const systemResult: string = await shell(
    deviceId,
    `pm list packages -s --user ${await getCurrentUser(deviceId)}`
  )
  const userResult: string = await shell(
    deviceId,
    `pm list packages -3 --user ${await getCurrentUser(deviceId)}`
  )

  const enabledPkgs = new Set(trim(allResult).split('\n').filter(Boolean).map(l => l.slice(8)))
  const disabledPkgs = new Set(trim(disabledResult).split('\n').filter(Boolean).map(l => l.slice(8)))
  const systemPkgs = new Set(trim(systemResult).split('\n').filter(Boolean).map(l => l.slice(8)))
  const userPkgs = new Set(trim(userResult).split('\n').filter(Boolean).map(l => l.slice(8)))

  const allPkgs = new Set([...enabledPkgs, ...disabledPkgs])

  // Get battery-consuming apps from batterystats
  const batteryData = await shell(deviceId, 'dumpsys batterystats')
  const batteryPkgs = new Set<string>()
  const batteryLines = batteryData.split('\n')
  let inPowerUse = false
  for (const line of batteryLines) {
    const t = line.trim()
    if (t.includes('Estimated power use')) { inPowerUse = true; continue }
    if (inPowerUse) {
      if (t === '' || t.startsWith('All partial wake locks')) break
      const m = t.match(/Uid \w+: [\d.]+ .+ (\S+\.\S+)\s*$/)
      if (m) batteryPkgs.add(m[1])
    }
  }

  const apps: IAppInfo[] = []

  // Limit to first 80 packages to avoid very long loading
  const pkgsToAnalyze = [...allPkgs].slice(0, 80)

  for (const pkg of pkgsToAnalyze) {
    if (!pkg || pkg.length === 0) continue

    const isSystem = systemPkgs.has(pkg)
    const isUser = userPkgs.has(pkg)
    const enabled = enabledPkgs.has(pkg)

    // Get permissions
    let permissions: string[] = []
    let dangerousPermissions: string[] = []
    try {
      const permResult = await shell(deviceId, `dumpsys package ${pkg} | grep 'uses-permission' | head -40`)
      const permLines = permResult.split('\n')
      for (const line of permLines) {
        const m = line.match(/android\.permission\.(\w+)/)
        if (m) {
          permissions.push(m[1])
          if (DANGEROUS_PERMISSIONS.includes(m[1])) {
            dangerousPermissions.push(m[1])
          }
        }
      }
    } catch (_) {}

    const batteryUser = batteryPkgs.has(pkg)

    // Determine suspicious reasons
    const suspiciousReasons: string[] = []
    if (SUSPICIOUS_PREFIXES.some(prefix => pkg.startsWith(prefix))) {
      suspiciousReasons.push('Posible adware o spyware conocido')
    }
    if (dangerousPermissions.length >= 5) {
      suspiciousReasons.push(`Tiene ${dangerousPermissions.length} permisos peligrosos`)
    }
    if (!isSystem && dangerousPermissions.includes('READ_LOGS')) {
      suspiciousReasons.push('App de usuario leyendo logs del sistema')
    }
    if (!isSystem && dangerousPermissions.includes('SYSTEM_ALERT_WINDOW') && dangerousPermissions.includes('RECORD_AUDIO')) {
      suspiciousReasons.push('Puede grabar audio y superponer ventanas (sospechoso)')
    }

    // Determine danger level
    let dangerLevel: IAppInfo['dangerLevel'] = 'none'
    if (suspiciousReasons.length > 0) dangerLevel = 'high'
    else if (dangerousPermissions.length >= 3) dangerLevel = 'medium'
    else if (dangerousPermissions.length >= 1) dangerLevel = 'low'

    apps.push({
      packageName: pkg,
      isSystem,
      dangerLevel,
      permissions,
      dangerousPermissions,
      batteryUser,
      suspiciousReasons,
      enabled,
    })
  }

  return apps.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2, none: 3 }
    return order[a.dangerLevel] - order[b.dangerLevel]
  })
}

const toggleApp: IpcToggleApp = async function (deviceId, pkg, enable) {
  if (enable) {
    await shell(deviceId, `pm enable ${pkg}`)
  } else {
    await shell(deviceId, `pm disable-user ${pkg}`)
  }
}

export async function init(c: Client) {
  client = c

  handleEvent('getPackages', getPackages)
  handleEvent('stopPackage', stopPackage)
  handleEvent('startPackage', startPackage)
  handleEvent('installPackage', installPackage)
  handleEvent('uninstallPackage', uninstallPackage)
  handleEvent('getTopPackage', getTopPackage)
  handleEvent('clearPackage', clearPackage)
  handleEvent('disablePackage', disablePackage)
  handleEvent('enablePackage', enablePackage)
  handleEvent('getAppAnalysis', getAppAnalysis)
  handleEvent('toggleApp', toggleApp)
}
