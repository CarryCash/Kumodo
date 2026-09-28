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
  return Number.parseInt(result, 10)
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
  const device = client.getDevice(deviceId)
  await device.clear(pkg)
}

const startPackage: IpcStartPackage = async function (deviceId, pkg) {
  const component = await getMainComponent(deviceId, pkg)
  const device = client.getDevice(deviceId)
  await device.startActivity({
    component,
  })
}

const installPackage: IpcInstallPackage = async function (deviceId, apkPath) {
  const device = client.getDevice(deviceId)
  await device.install(apkPath)
}

const uninstallPackage: IpcUninstallPackage = async function (deviceId, pkg) {
  const device = client.getDevice(deviceId)
  await device.uninstall(pkg)
}

async function getMainComponent(deviceId: string, pkg: string) {
  const result = await shell(
    deviceId,
    `dumpsys package ${pkg} 2>/dev/null | grep -A 2 MAIN || true`
  )

  const lines = (result || '').split('\n')
  for (let i = 0, len = lines.length; i < len; i++) {
    const line = trim(lines[i])
    if (!contain(line, `${pkg}/`)) {
      continue
    }

    const start = line.indexOf(`${pkg}/`)
    const end = line.indexOf(' filter')
    if (start >= 0 && end > start) {
      return line.substring(start, end)
    }

    if (start >= 0) {
      return line.substring(start)
    }
  }

  const launcherResult = await shell(
    deviceId,
    `pm dump ${pkg} 2>/dev/null | grep -A 5 -E 'LAUNCHER|MAIN' || true`
  )
  const launcherLine = (launcherResult || '')
    .split('\n')
    .map((line) => trim(line))
    .find((line) => line.includes(pkg) && line.includes('/'))

  if (launcherLine) {
    const start = launcherLine.indexOf(`${pkg}/`)
    if (start >= 0) {
      return launcherLine.substring(start)
    }
  }

  throw new Error(`La app ${pkg} no tiene actividad principal lanzable`)
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
    parts = parts.at(-2)?.split(':') || []
    const pid = Number.parseInt(parts[0] || '0', 10)
    let name = parts[1] || ''
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
const DANGEROUS_PERMISSIONS = new Set([
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
])

// Known suspicious/adware package prefixes
const SUSPICIOUS_PREFIXES = [
  'com.airpush', 'com.admarvel', 'com.taptica', 'com.leadbolt',
  'com.startapp', 'com.mobvista', 'com.inmobi', 'com.mopub',
]

function parsePackageList(raw: string): Set<string> {
  return new Set(trim(raw).split('\n').filter(Boolean).map((line) => line.slice(8)))
}

function collectBatteryConsumers(raw: string): Set<string> {
  const batteryPkgs = new Set<string>()
  const lines = raw.split('\n')
  let inPowerUse = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.includes('Estimated power use')) {
      inPowerUse = true
      continue
    }

    if (!inPowerUse) continue
    if (!trimmed || trimmed.startsWith('All partial wake locks')) break

    if (!trimmed.startsWith('Uid ')) continue

    const colonIndex = trimmed.indexOf(':')
    if (colonIndex < 0) continue

    const afterColon = trimmed.slice(colonIndex + 1).trim()
    const lastSpace = afterColon.lastIndexOf(' ')
    const candidate = lastSpace >= 0 ? afterColon.slice(lastSpace + 1).trim() : afterColon

    if (candidate.includes('.')) {
      batteryPkgs.add(candidate)
    }
  }

  return batteryPkgs
}

function collectDangerousPermissions(permResult: string): string[] {
  const dangerousPermissions: string[] = []
  const permLines = permResult.split('\n')

  for (const line of permLines) {
    const match = /android\.permission\.(\w+)/.exec(line)
    if (!match) continue

    const permissionName = match[1]
    if (DANGEROUS_PERMISSIONS.has(permissionName)) {
      dangerousPermissions.push(permissionName)
    }
  }

  return dangerousPermissions
}

function evaluateDangerLevel(isSystem: boolean, dangerousPermissions: string[], suspiciousReasons: string[]): IAppInfo['dangerLevel'] {
  if (suspiciousReasons.length > 0) return 'high'
  if (dangerousPermissions.length >= 3) return 'medium'
  if (dangerousPermissions.length >= 1 && !isSystem) return 'low'
  return 'none'
}

const getAppAnalysis: IpcGetAppAnalysis = async function (deviceId) {
  const userId = await getCurrentUser(deviceId)

  const [allResult, disabledResult, systemResult] = await Promise.all([
    shell(deviceId, `pm list packages -e --user ${userId}`),
    shell(deviceId, `pm list packages -d --user ${userId}`),
    shell(deviceId, `pm list packages -s --user ${userId}`),
  ])

  const enabledPkgs = parsePackageList(allResult)
  const disabledPkgs = parsePackageList(disabledResult)
  const systemPkgs = parsePackageList(systemResult)
  const allPkgs = new Set([...enabledPkgs, ...disabledPkgs])

  const batteryData = await shell(deviceId, 'dumpsys batterystats')
  const batteryPkgs = collectBatteryConsumers(batteryData)

  const apps: IAppInfo[] = []
  const pkgsToAnalyze = [...allPkgs].slice(0, 80)

  for (const pkg of pkgsToAnalyze) {
    if (!pkg || pkg.length === 0) continue

    const isSystem = systemPkgs.has(pkg)
    const enabled = enabledPkgs.has(pkg)
    const suspiciousReasons: string[] = []

    const dangerousPermissions = await (async () => {
      try {
        const permResult = await shell(deviceId, `dumpsys package ${pkg} 2>/dev/null | grep 'uses-permission' | head -40`)
        return collectDangerousPermissions(permResult)
      } catch {
        // OEM builds may not expose the permission list in a standard format.
        return [] as string[]
      }
    })()

    if (SUSPICIOUS_PREFIXES.some((prefix) => pkg.startsWith(prefix))) {
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

    const batteryUser = batteryPkgs.has(pkg)
    const dangerLevel = evaluateDangerLevel(isSystem, dangerousPermissions, suspiciousReasons)

    apps.push({
      packageName: pkg,
      isSystem,
      dangerLevel,
      permissions: [],
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
  const action = enable ? enablePackage : disablePackage
  return action(deviceId, pkg)
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
