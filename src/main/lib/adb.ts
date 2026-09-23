import { app } from 'electron'
import Adb, { Client, Device } from '@devicefarmer/adbkit'
import androidDeviceList from 'android-device-list'
import {
  resolveResources,
  handleEvent,
  getUserDataPath,
} from 'share/main/lib/util'
import map from 'licia/map'
import types from 'licia/types'
import filter from 'licia/filter'
import isStrBlank from 'licia/isStrBlank'
import trim from 'licia/trim'
import startWith from 'licia/startWith'
import toNum from 'licia/toNum'
import contain from 'licia/contain'
import * as window from 'share/main/lib/window'
import fs from 'fs-extra'
import { getSettingsStore } from './store'
import isWindows from 'licia/isWindows'
import isEmpty from 'licia/isEmpty'
import * as base from './adb/base'
import { shell, getAdbPath, spawnAdb, isRooted } from './adb/base'
import * as logcat from './adb/logcat'
import * as shellAdb from './adb/shell'
import * as server from './adb/server'
import * as scrcpy from './adb/scrcpy'
import * as packageAdb from './adb/package'
import * as file from './adb/file'
import * as fps from './adb/fps'
import * as webview from './adb/webview'
import * as port from './adb/port'
import { getCpuLoads, getCpus, getCpuTemperature } from './adb/cpu'
import log from 'share/common/log'
import {
  IpcConnectDevice,
  IpcDisconnectDevice,
  IpcDumpWindowHierarchy,
  IpcGetDevices,
  IpcInputKey,
  IpcPairDevice,
  IpcScreencap,
  IpcGetDiagnostic,
  IDiagnostic,
  IpcGetBatteryStats,
  IpcResetBatteryStats,
  IStorageRamStats,
  IpcGetStorageRamStats,
  IJunkItem,
  IpcScanJunk,
  IpcCleanJunk,
} from 'common/types'
import * as history from './history'
import * as logCases from './logCases'
import * as backup from './backup'
import { auditSecurity } from './security'
import { getImeiInfo, launchMmiCode } from './imei'
import {
  initMedia,
  getMediaFiles,
  getMediaThumbnail,
  detectMediaDuplicates,
  pullMediaFiles,
  deleteMediaFiles,
} from './media'
import { getDebloatList, debloatAction, restoreAllDebloat } from './debloat'
import {
  initWireless,
  getWirelessStatus,
  enableWirelessBridge,
  getWirelessProfiles,
  removeWirelessProfile,
  pingIp,
} from './wireless'
import {
  getForensicCallLog,
  getForensicSms,
  getForensicContacts,
  getForensicUninstalledApps,
  getForensicDeletedFiles,
} from './forensic'
import path from 'node:path'
import childProcess from 'node:child_process'
import isMac from 'licia/isMac'
import sleep from 'licia/sleep'

const logger = log('adb')

const settingsStore = getSettingsStore()

let client: Client

const getDevices: IpcGetDevices = async function () {
  let devices = await client.listDevices()
  devices = filter(
    devices,
    (device: Device) => device.type === 'emulator' || device.type === 'device'
  )

  return Promise.all(
    map(devices, async (device: Device) => {
      const properties = await client.getDevice(device.id).getProperties()

      let name = `${properties['ro.product.manufacturer']} ${properties['ro.product.model']}`
      const marketName = getMarketName(properties)
      if (marketName) {
        name = marketName
      }

      return {
        id: device.id,
        type: device.type,
        serialno: properties['ro.serialno'] || '',
        name,
        androidVersion: properties['ro.build.version.release'],
        sdkVersion: properties['ro.build.version.sdk'],
      }
    })
  ).catch(() => [])
}

async function getOverview(deviceId: string) {
  const device = await client.getDevice(deviceId)
  const properties = await device.getProperties()
  const cpus = await getCpus(deviceId, false)
  const [kernelVersion, fontScale, wifi] = await shell(deviceId, [
    'uname -r',
    'settings get system font_scale',
    'dumpsys wifi',
  ])

  let ssidMatch = wifi.match(/mWifiInfo\s+SSID: "?(.+?)"?,/)
  if (ssidMatch && ssidMatch[1] === '<unknown ssid>') {
    ssidMatch = null
  }

  return {
    name: getMarketName(properties) || properties['ro.product.name'],
    processor: properties['ro.product.board'] || '',
    abi: properties['ro.product.cpu.abi'],
    brand: properties['ro.product.brand'],
    model: properties['ro.product.model'],
    serialno: properties['ro.serialno'] || '',
    cpuNum: cpus.length,
    kernelVersion,
    fontScale: fontScale === 'null' ? 0 : toNum(fontScale),
    wifi: ssidMatch ? ssidMatch[1] : '',
    root: await isRooted(deviceId),
    ...(await getIpAndMac(deviceId)),
    ...(await getStorage(deviceId)),
    ...(await getMemory(deviceId)),
    ...(await getScreen(deviceId)),
  }
}

async function getIpAndMac(deviceId: string) {
  let ip = ''
  let mac = ''
  const wlan0 = await shell(deviceId, 'ip addr show wlan0')
  const ipMatch = wlan0.match(/inet (\d+\.\d+\.\d+\.\d+)/)
  if (ipMatch) {
    ip = ipMatch[1]
  }
  const macMatch = wlan0.match(
    /link\/ether (([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2}))/
  )
  if (macMatch) {
    mac = macMatch[1]
  }

  return {
    ip,
    mac,
  }
}

async function setFontScale(deviceId: string, scale: number) {
  await shell(deviceId, `settings put system font_scale ${scale}`)
}

function getMarketName(properties: types.PlainObj<string>) {
  const keys = [
    // Oppo
    'ro.oppo.market.name',
    // Huawei, Honor
    'ro.config.marketing_name',
    // OnePlus, Realme
    'ro.vendor.oplus.market.enname',
    // Vivo
    'ro.vivo.market.name',
    // Xiaomi, Redmi
    'ro.product.marketname',
    // Asus
    'ro.asus.product.mkt_name',
  ]
  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i]
    if (properties[key]) {
      return properties[key]
    }
  }

  const device = properties['ro.product.device']
  const model = properties['ro.product.model']

  let marketName = ''

  const devices: any[] = androidDeviceList.getDevicesByDeviceId(device)
  if (!isEmpty(devices)) {
    const deviceFilter = filter(devices, (device) => device.model === model)
    if (!isEmpty(deviceFilter)) {
      marketName = deviceFilter[0].name
    } else {
      marketName = devices[0].name
    }
  }

  return marketName
}

async function getPerformance(deviceId: string) {
  const cpus = await getCpus(deviceId)

  return {
    cpus,
    cpuLoads: await getCpuLoads(deviceId, cpus),
    cpuTemperature: await getCpuTemperature(deviceId),
    ...(await getMemory(deviceId)),
    ...(await getBattery(deviceId)),
  }
}

async function getUptime(deviceId: string) {
  const result = await shell(deviceId, 'cat /proc/uptime')
  const [uptime] = result.split(' ')
  return Math.round(toNum(uptime) * 1000)
}

async function getBattery(deviceId: string) {
  const result = await shell(deviceId, 'dumpsys battery')

  return {
    batteryLevel: toNum(getPropValue('level', result)),
    batteryTemperature: toNum(getPropValue('temperature', result)),
    batteryVoltage: toNum(getPropValue('voltage', result)),
  }
}

const screencap: IpcScreencap = async function (deviceId) {
  const { exec } = require('child_process')
  const { promisify } = require('util')
  const execAsync = promisify(exec)
  const adbPath = getAdbPath()
  try {
    const { stdout } = await execAsync(`"${adbPath}" -s ${deviceId} exec-out screencap -p`, { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 })
    return stdout.toString('base64')
  } catch (err) {
    const device = await client.getDevice(deviceId)
    const data = await device.screencap()
    const buf = await Adb.util.readAll(data)
    return buf.toString('base64')
  }
}

const dumpWindowHierarchy: IpcDumpWindowHierarchy = async function (deviceId) {
  const path = '/data/local/tmp/aya_uidump.xml'
  await shell(deviceId, `uiautomator dump ${path}`)
  const data = await file.pullFileData(deviceId, path)
  return data.toString('utf8')
}

async function getScreen(deviceId: string) {
  const [wmSize, wmDensity] = await shell(deviceId, ['wm size', 'wm density'])

  const physicalResolution = getPropValue('Physical size', wmSize)
  const physicalDensity = getPropValue('Physical density', wmDensity)

  const hasOverrideResolution = contain(wmSize, 'Override')
  const hasOverrideDensity = contain(wmDensity, 'Override')
  const resolution = hasOverrideResolution
    ? getPropValue('Override size', wmSize)
    : physicalResolution
  const density = hasOverrideDensity
    ? getPropValue('Override density', wmDensity)
    : physicalDensity

  return {
    resolution,
    physicalResolution,
    density,
    physicalDensity,
  }
}

async function getMemory(deviceId: string) {
  const memInfo = await shell(deviceId, 'cat /proc/meminfo')
  let memTotal = 0
  let memFree = 0

  const totalMatch = getPropValue('MemTotal', memInfo)
  let freeMatch = getPropValue('MemAvailable', memInfo)
  if (!freeMatch) {
    freeMatch = getPropValue('MemFree', memInfo)
  }
  if (totalMatch && freeMatch) {
    memTotal = parseInt(totalMatch, 10) * 1024
    memFree = parseInt(freeMatch, 10) * 1024
  }

  return {
    memTotal,
    memUsed: memTotal - memFree,
  }
}

async function getStorage(deviceId: string) {
  const storageInfo = await shell(deviceId, 'dumpsys diskstats')
  let storageTotal = 0
  let storageFree = 0

  const match = storageInfo.match(new RegExp('Data-Free: (\\d+)K / (\\d+)K'))
  if (match) {
    storageFree = parseInt(match[1], 10) * 1024
    storageTotal = parseInt(match[2], 10) * 1024
  }

  return {
    storageTotal,
    storageUsed: storageTotal - storageFree,
  }
}

function getPropValue(key: string, str: string) {
  const lines = str.split('\n')
  for (let i = 0, len = lines.length; i < len; i++) {
    const line = trim(lines[i])
    if (startWith(line, key)) {
      return trim(line.replace(/.*:/, ''))
    }
  }

  return ''
}

const connectDevice: IpcConnectDevice = async function (host, port) {
  await client.connect(host, port)
}

const disconnectDevice: IpcDisconnectDevice = async function (host, port) {
  await client.disconnect(host, port)
}

const pairDevice: IpcPairDevice = async function (host, port, password) {
  const { stdout } = await spawnAdb(['pair', `${host}:${port}`, password])
  if (!contain(stdout, 'Successfully')) {
    throw new Error(`Pair device failed: ${stdout}`)
  }
}

const inputKey: IpcInputKey = async function (deviceId, keyCode) {
  await base.shell(deviceId, `input keyevent ${keyCode}`)
}

async function openAdbCli() {
  let cwd = resolveResources('adb')
  const adbPath = settingsStore.get('adbPath')
  if (!isStrBlank(adbPath) && fs.existsSync(adbPath)) {
    cwd = path.dirname(adbPath)
  } else if (isWindows) {
    // Microsoft store app permission issue workaround
    const newCwd = getUserDataPath('adb')
    if (!(await fs.existsSync(newCwd))) {
      await fs.copy(cwd, newCwd)
    }
    cwd = newCwd
  }

  if (isMac) {
    const child = childProcess.spawn('open', ['-a', 'Terminal', cwd], {
      stdio: 'ignore',
    })
    child.unref()
  } else if (isWindows) {
    const child = childProcess.exec('start cmd', {
      cwd,
    })
    child.unref()
  } else {
    const child = childProcess.spawn('x-terminal-emulator', ['-w', cwd], {
      stdio: 'ignore',
    })
    child.unref()
  }
}

async function root(deviceId: string) {
  const id = await shell(deviceId, 'id')
  if (contain(id, 'uid=0')) {
    return
  }
  const device = await client.getDevice(deviceId)
  await device.root()
}

async function startWireless(deviceId: string) {
  const device = await client.getDevice(deviceId)
  const { ip } = await getIpAndMac(deviceId)
  const port = await device.tcpip(5555)
  await sleep(500)
  await connectDevice(ip, port)
}

async function restartAdbServer() {
  await client.kill()
  await client.version()
}

const getDiagnostic: IpcGetDiagnostic = async function (deviceId): Promise<IDiagnostic> {
  const device = await client.getDevice(deviceId)
  const properties = await device.getProperties()
  const cpus = await getCpus(deviceId, false)
  const [kernelVersion, wifi] = await shell(deviceId, ['uname -r', 'dumpsys wifi'])
  const [memInfo, diskStats, battery, uptime] = await shell(deviceId, [
    'cat /proc/meminfo',
    'dumpsys diskstats',
    'dumpsys battery',
    'cat /proc/uptime',
  ])
  const [wmSize, wmDensity] = await shell(deviceId, ['wm size', 'wm density'])
  const wlan0 = await shell(deviceId, 'ip addr show wlan0')

  // Memory
  const memTotalMatch = memInfo.match(/MemTotal:\s+(\d+)/)
  const memFreeMatch = memInfo.match(/MemAvailable:\s+(\d+)/) || memInfo.match(/MemFree:\s+(\d+)/)
  const memTotal = memTotalMatch ? parseInt(memTotalMatch[1], 10) * 1024 : 0
  const memFree = memFreeMatch ? parseInt(memFreeMatch[1], 10) * 1024 : 0

  // Storage
  const storageMatch = diskStats.match(/Data-Free: (\d+)K \/ (\d+)K/)
  const storageTotal = storageMatch ? parseInt(storageMatch[2], 10) * 1024 : 0
  const storageFree = storageMatch ? parseInt(storageMatch[1], 10) * 1024 : 0

  // Battery
  const batteryLevel = parseInt(battery.match(/level: (\d+)/)?.[1] || '0', 10)
  const batteryVoltage = parseInt(battery.match(/voltage: (\d+)/)?.[1] || '0', 10)
  const batteryTemperature = parseInt(battery.match(/temperature: (\d+)/)?.[1] || '0', 10)

  // Network
  const ssidMatch = wifi.match(/mWifiInfo\s+SSID: "?(.+?)"?,/)
  const wifiSsid = ssidMatch && ssidMatch[1] !== '<unknown ssid>' ? ssidMatch[1] : ''
  const ipMatch = wlan0.match(/inet (\d+\.\d+\.\d+\.\d+)/)
  const macMatch = wlan0.match(/link\/ether (([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2}))/)

  // Screen
  const hasOverrideRes = uptime.includes('Override') || wmSize.includes('Override')
  const physRes = (wmSize.match(/Physical size: (.+)/) || [])[1] || ''
  const overrideRes = (wmSize.match(/Override size: (.+)/) || [])[1] || ''
  const physDensity = (wmDensity.match(/Physical density: (.+)/) || [])[1] || ''
  const overrideDensity = (wmDensity.match(/Override density: (.+)/) || [])[1] || ''

  // Uptime
  const uptimeSeconds = Math.round(parseFloat((uptime.split(' ') || ['0'])[0]) * 1000)

  // Root
  const idOutput = await shell(deviceId, 'id')
  const root = idOutput.includes('uid=0')

  // Encryption
  const encryptionState = properties['ro.crypto.state'] || 'unknown'

  // Build number
  const buildNumber = properties['ro.build.display.id'] || properties['ro.build.description'] || ''
  const bootloader = properties['ro.bootloader'] || 'unknown'

  // Market name
  const name = getMarketName(properties) || properties['ro.product.name'] || ''

  return {
    name,
    brand: properties['ro.product.brand'] || '',
    model: properties['ro.product.model'] || '',
    serialno: properties['ro.serialno'] || '',
    buildNumber,
    androidVersion: properties['ro.build.version.release'] || '',
    sdkVersion: properties['ro.build.version.sdk'] || '',
    kernelVersion: kernelVersion.trim(),
    bootloader,
    processor: properties['ro.product.board'] || '',
    cpuNum: cpus.length,
    abi: properties['ro.product.cpu.abi'] || '',
    memTotal,
    memUsed: memTotal - memFree,
    storageTotal,
    storageUsed: storageTotal - storageFree,
    resolution: hasOverrideRes ? overrideRes : physRes,
    physicalResolution: physRes,
    density: hasOverrideRes ? overrideDensity : physDensity,
    batteryLevel,
    batteryVoltage,
    batteryTemperature,
    wifi: wifiSsid,
    ip: ipMatch ? ipMatch[1] : '',
    mac: macMatch ? macMatch[1] : '',
    uptime: uptimeSeconds,
    root,
    encryption: encryptionState,
  }
}

const getStorageRamStats: IpcGetStorageRamStats = async function (deviceId) {
  // Get Storage
  const dfResult = await shell(deviceId, 'df -h /data')
  const dfLines = dfResult.trim().split('\n')
  let storageTotal = 0
  let storageFree = 0
  if (dfLines.length > 1) {
    const cols = dfLines[1].trim().split(/\s+/)
    if (cols.length >= 4) {
      const parseSize = (sizeStr: string) => {
        let val = parseFloat(sizeStr)
        if (sizeStr.includes('G')) val *= 1024 * 1024 * 1024
        else if (sizeStr.includes('M')) val *= 1024 * 1024
        else if (sizeStr.includes('K')) val *= 1024
        return val
      }
      storageTotal = parseSize(cols[1])
      storageFree = parseSize(cols[3])
    }
  }

  // Get RAM
  const memInfo = await shell(deviceId, 'cat /proc/meminfo')
  const totalMatch = getPropValue('MemTotal', memInfo)
  const freeMatch = getPropValue('MemFree', memInfo)
  const availMatch = getPropValue('MemAvailable', memInfo)
  const cachedMatch = getPropValue('Cached', memInfo)

  const memTotal = totalMatch ? parseInt(totalMatch, 10) * 1024 : 0
  const memFree = freeMatch ? parseInt(freeMatch, 10) * 1024 : 0
  const memAvailable = availMatch ? parseInt(availMatch, 10) * 1024 : memFree
  const memCached = cachedMatch ? parseInt(cachedMatch, 10) * 1024 : 0

  // Apps consumption via dumpsys meminfo
  const appsRamConsumption: Array<{ packageName: string; pss: number; type: string }> = []
  const dumpsysMem = await shell(deviceId, 'dumpsys meminfo')
  const warnings: string[] = []

  let inAppSummary = false
  const memLines = dumpsysMem.split('\n')
  for (const line of memLines) {
    const t = line.trim()
    if (t.includes('Total PSS by process:')) {
      inAppSummary = true
      continue
    }
    if (inAppSummary) {
      if (t === '' || t.includes('Total PSS by OOM adjustment:')) {
        inAppSummary = false
        break
      }
      // Example line: 125000K: com.example.app (pid 123)
      const match = t.match(/([\d,]+)K:\s+([\w.]+)\s+\(pid/)
      if (match) {
        appsRamConsumption.push({
          pss: parseInt(match[1].replace(/,/g, ''), 10) * 1024,
          packageName: match[2],
          type: 'App'
        })
      }
    }
  }

  // Diagnostics
  if (storageTotal > 0 && storageFree / storageTotal < 0.1) {
    warnings.push(`El dispositivo está casi lleno. Quedan menos del 10% de espacio libre (Aprox ${Math.round(storageFree / 1024 / 1024)} MB).`)
  }
  if (memTotal > 0 && memAvailable / memTotal < 0.15) {
    warnings.push(`Uso crítico de RAM. Menos del 15% de memoria disponible. El teléfono puede estar muy lento.`)
  }

  if (appsRamConsumption.length > 0) {
    const topApp = appsRamConsumption[0]
    if (memTotal > 0 && topApp.pss / memTotal > 0.2) {
      warnings.push(`Consumo anormal: La app ${topApp.packageName} está consumiendo más del 20% de la RAM total.`)
    }
  }

  return {
    storageTotal,
    storageFree,
    memTotal,
    memFree,
    memAvailable,
    memCached,
    appsRamConsumption: appsRamConsumption.slice(0, 15),
    warnings
  }
}

const getBatteryStats: IpcGetBatteryStats = async function (deviceId) {
  const result = await shell(deviceId, 'dumpsys battery')
  const statsResult = await shell(deviceId, 'dumpsys batterystats')

  const level = toNum(getPropValue('level', result))
  const voltage = toNum(getPropValue('voltage', result))
  const temperature = toNum(getPropValue('temperature', result))
  const statusRaw = getPropValue('status', result)
  const healthRaw = getPropValue('health', result)
  const isCharging = getPropValue('AC powered', result) === 'true' || getPropValue('USB powered', result) === 'true'

  let status = 'Unknown'
  if (statusRaw === '2') status = 'Charging'
  else if (statusRaw === '3') status = 'Discharging'
  else if (statusRaw === '4') status = 'Not charging'
  else if (statusRaw === '5') status = 'Full'

  let health = 'Unknown'
  if (healthRaw === '2') health = 'Good'
  else if (healthRaw === '3') health = 'Overheat'
  else if (healthRaw === '4') health = 'Dead'
  else if (healthRaw === '5') health = 'Over voltage'
  else if (healthRaw === '6') health = 'Unspecified failure'
  else if (healthRaw === '7') health = 'Cold'

  const appsConsumption: Array<{ packageName: string; percent: number; uid: string }> = []
  const warnings: string[] = []

  if (health !== 'Good' && health !== 'Unknown') {
    warnings.push(`Salud de batería: ${health}`)
  }
  if (temperature > 400) {
    warnings.push('Alta temperatura detectada (> 40°C)')
  }

  // Very basic parsing for batterystats "Estimated power use"
  const lines = statsResult.split('\n')
  let inPowerUse = false
  for (const line of lines) {
    const t = line.trim()
    if (t.includes('Estimated power use')) {
      inPowerUse = true
      continue
    }
    if (inPowerUse) {
      if (t === '' || t.startsWith('All partial wake locks')) {
        inPowerUse = false
        break
      }
      // Example line: Uid 1000: 12.5 ( cpu=12.0 wake=0.5 )
      const match = t.match(/Uid (\w+): ([\d.]+)/)
      if (match) {
        appsConsumption.push({
          uid: match[1],
          percent: parseFloat(match[2]),
          packageName: `UID ${match[1]}`
        })
      }
    }
  }

  return {
    level,
    voltage,
    temperature,
    status,
    health,
    isCharging,
    technology: getPropValue('technology', result) || 'Unknown',
    appsConsumption: appsConsumption.sort((a, b) => b.percent - a.percent).slice(0, 10),
    warnings,
  }
}

const resetBatteryStats: IpcResetBatteryStats = async function (deviceId) {
  await shell(deviceId, 'dumpsys batterystats --reset')
}

export const execAdb = async function (deviceId: string, command: string) {
  // Use spawnAdb if the command starts with 'adb ', otherwise use shell
  if (command.startsWith('adb ')) {
    const args = command.substring(4).split(' ').filter(Boolean)
    return await spawnAdb(['-s', deviceId, ...args])
  }
  const result = await shell(deviceId, command)
  if (Array.isArray(result)) return result.join('\n')
  return result
}

export async function init() {
  logger.info('init')

  app.on('will-quit', async () => {
    if (settingsStore.get('killAdbWhenExit')) {
      logger.info('kill adb')
      await client.kill()
    }
  })

  client = Adb.createClient({
    bin: getAdbPath(),
  })
  async function track() {
    logger.info('track devices')
    try {
      const tracker = await client.trackDevices()
      tracker.on('add', onDeviceChange)
      tracker.on('remove', onDeviceChange)
      tracker.on('error', () => {
        logger.error('tracker error')
      })
      tracker.on('end', async () => {
        logger.info('tracker end')
        await sleep(2000)
        track()
      })
    } catch (e) {
      logger.error('track error', e)
    }
  }
  function onDeviceChange() {
    logger.info('device change')
    setTimeout(() => window.sendAll('changeDevice'), 2000)
  }
  track()

  base.init(client)
  history.init()
  logCases.init()
  backup.init()
  logcat.init(client)
  shellAdb.init(client)
  server.init(client)
  scrcpy.init(client)
  packageAdb.init(client)
  file.init(client)
  fps.init()
  webview.init()
  port.init(client)

  handleEvent('getDevices', getDevices)
  handleEvent('getOverview', getOverview)
  handleEvent('setFontScale', setFontScale)
  handleEvent('screencap', screencap)
  handleEvent('getMemory', getMemory)
  handleEvent('getPerformance', getPerformance)
  handleEvent('getUptime', getUptime)
  handleEvent('connectDevice', connectDevice)
  handleEvent('disconnectDevice', disconnectDevice)
  handleEvent('inputKey', inputKey)
  handleEvent('openAdbCli', openAdbCli)
  handleEvent('dumpWindowHierarchy', dumpWindowHierarchy)
  handleEvent('root', root)
  handleEvent('startWireless', startWireless)
  handleEvent('restartAdbServer', restartAdbServer)
  handleEvent('pairDevice', pairDevice)
  handleEvent('getDiagnostic', getDiagnostic)
  handleEvent('getBatteryStats', getBatteryStats)
  handleEvent('resetBatteryStats', resetBatteryStats)
  handleEvent('getStorageRamStats', getStorageRamStats)
  handleEvent('execAdb', execAdb)
  handleEvent('scanJunk', scanJunk)
  handleEvent('cleanJunk', cleanJunk)
  handleEvent('auditSecurity', auditSecurity)
  handleEvent('getImeiInfo', getImeiInfo)
  handleEvent('launchMmiCode', launchMmiCode)
  initMedia(client)
  handleEvent('getMediaFiles', getMediaFiles)
  handleEvent('getMediaThumbnail', getMediaThumbnail)
  handleEvent('detectMediaDuplicates', detectMediaDuplicates)
  handleEvent('pullMediaFiles', pullMediaFiles)
  handleEvent('deleteMediaFiles', deleteMediaFiles)
  handleEvent('getDebloatList', getDebloatList)
  handleEvent('debloatAction', debloatAction)
  handleEvent('restoreAllDebloat', restoreAllDebloat)
  initWireless(client)
  handleEvent('getWirelessStatus', getWirelessStatus)
  handleEvent('enableWirelessBridge', enableWirelessBridge)
  handleEvent('getWirelessProfiles', getWirelessProfiles)
  handleEvent('removeWirelessProfile', removeWirelessProfile)
  handleEvent('pingIp', pingIp)
  handleEvent('getForensicCallLog', getForensicCallLog)
  handleEvent('getForensicSms', getForensicSms)
  handleEvent('getForensicContacts', getForensicContacts)
  handleEvent('getForensicUninstalledApps', getForensicUninstalledApps)
  handleEvent('getForensicDeletedFiles', getForensicDeletedFiles)
}

const scanJunk: IpcScanJunk = async function (deviceId) {
  const items: IJunkItem[] = []

  // 1. External App caches & thumbnails in /sdcard/
  try {
    const [cacheScriptOut] = await shell(deviceId, [
      `for d in /sdcard/Android/data/*/cache /sdcard/DCIM/.thumbnails /sdcard/Pictures/.thumbnails; do
        if [ -d "$d" ]; then
          sz=$(du -sk "$d" 2>/dev/null | cut -f1)
          if [ -n "$sz" ] && [ "$sz" -gt 0 ] 2>/dev/null; then
            echo "$d|$sz"
          fi
        fi
      done`,
    ])
    for (const line of (cacheScriptOut || '').split('\n').filter(Boolean)) {
      const [path, kbStr] = line.split('|')
      const kb = parseInt(kbStr) || 0
      if (path && kb > 0) {
        const isThumb = path.includes('.thumbnails')
        items.push({
          category: 'cache',
          path,
          label: isThumb ? `Miniaturas: ${path.replace('/sdcard/', '')}` : `Caché: ${path.split('/')[4] || path}`,
          size: kb * 1024,
        })
      }
    }
  } catch {}

  // 2. Temp files in /sdcard/ (.tmp, .temp, .log)
  try {
    const [tmpOut] = await shell(deviceId, [
      `for f in $(find /sdcard -maxdepth 3 -type f \\( -name "*.tmp" -o -name "*.temp" -o -name "*.log" \\) 2>/dev/null | head -50); do
        sz=$(stat -c %s "$f" 2>/dev/null || echo 0)
        echo "$f|$sz"
      done`,
    ])
    for (const line of (tmpOut || '').split('\n').filter(Boolean)) {
      const [path, szStr] = line.split('|')
      const size = parseInt(szStr) || 0
      if (path && size > 0) {
        items.push({ category: 'temp', path, label: `Temp: ${path.split('/').pop()}`, size })
      }
    }
  } catch {}

  // 3. APKs in Downloads
  try {
    const [apkOut] = await shell(deviceId, [
      `for f in $(find /sdcard/Download /sdcard/Downloads -maxdepth 2 -type f -name "*.apk" 2>/dev/null | head -30); do
        sz=$(stat -c %s "$f" 2>/dev/null || echo 0)
        echo "$f|$sz"
      done`,
    ])
    for (const line of (apkOut || '').split('\n').filter(Boolean)) {
      const [path, szStr] = line.split('|')
      const size = parseInt(szStr) || 0
      if (path && size > 0) {
        items.push({ category: 'apk', path, label: `APK: ${path.split('/').pop()}`, size })
      }
    }
  } catch {}

  // 4. Orphan /sdcard/Android/data folders (app uninstalled)
  try {
    const [pkgOut] = await shell(deviceId, ['pm list packages'])
    const installedPkgs = new Set(
      (pkgOut || '')
        .split('\n')
        .map((l: string) => l.replace('package:', '').trim())
        .filter(Boolean)
    )
    const [dataFolders] = await shell(deviceId, [
      'ls /sdcard/Android/data/ 2>/dev/null',
    ])
    const candidateFolders = (dataFolders || '')
      .split('\n')
      .map((f: string) => f.trim())
      .filter((f: string) => f && !installedPkgs.has(f))
      .slice(0, 20)

    if (candidateFolders.length > 0) {
      const foldersList = candidateFolders.map((f) => `"/sdcard/Android/data/${f}"`).join(' ')
      const [duOut] = await shell(deviceId, [
        `du -sk ${foldersList} 2>/dev/null`,
      ])
      for (const line of (duOut || '').split('\n').filter(Boolean)) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 2) {
          const kb = parseInt(parts[0]) || 0
          const folderPath = parts.slice(1).join(' ')
          if (kb > 0 && folderPath) {
            items.push({
              category: 'orphan',
              path: folderPath,
              label: `Huérfano: ${folderPath.split('/').pop()}`,
              size: kb * 1024,
            })
          }
        }
      }
    }
  } catch {}

  // 5. System app cache trim option (pm trim-caches)
  try {
    items.unshift({
      category: 'cache',
      path: 'pm_trim_caches',
      label: 'Caché general del sistema y aplicaciones',
      size: 150 * 1024 * 1024,
    })
  } catch {}

  return items
}

const cleanJunk: IpcCleanJunk = async function (deviceId, items) {
  let freed = 0
  let needTrimCaches = false
  for (const item of items) {
    try {
      if (item.path === 'pm_trim_caches') {
        needTrimCaches = true
        freed += item.size
      } else if (item.path.startsWith('/sdcard/') || item.path.startsWith('/storage/')) {
        await shell(deviceId, [`rm -rf "${item.path}"`])
        freed += item.size
      }
    } catch {}
  }
  if (needTrimCaches) {
    try {
      await shell(deviceId, ['pm trim-caches 999999999999'])
    } catch {}
  }
  return freed
}

