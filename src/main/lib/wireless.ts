import { Client } from '@devicefarmer/adbkit'
import {
  IWirelessProfile,
  IWirelessStatus,
  IpcEnableWirelessBridge,
  IpcGetWirelessProfiles,
  IpcGetWirelessStatus,
  IpcPingIp,
  IpcRemoveWirelessProfile,
} from 'common/types'
import { shell } from './adb/base'
import FileStore from 'licia/FileStore'
import { getUserDataPath } from 'share/main/lib/util'
import net from 'node:net'
import log from 'share/common/log'

const logger = log('wireless')

let adbClient: Client
const profilesStore = new FileStore(
  getUserDataPath('data/wireless_profiles.json'),
  { profiles: [] as IWirelessProfile[] }
)

export function initWireless(c: Client) {
  adbClient = c
}

export const getWirelessStatus: IpcGetWirelessStatus = async function (deviceId) {
  try {
    const isConnectedWireless = deviceId.includes(':')

    // 1. Get IP address from wlan0
    let ip = ''
    try {
      const [ipOutput] = await shell(deviceId, [
        'ip -f inet addr show wlan0 2>/dev/null',
      ])
      const match = (ipOutput || '').match(/inet\s+([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/)
      if (match && match[1]) {
        ip = match[1]
      }
    } catch {}

    if (!ip) {
      try {
        const [propIp] = await shell(deviceId, [
          'getprop dhcp.wlan0.ipaddress 2>/dev/null',
        ])
        ip = (propIp || '').trim()
      } catch {}
    }

    // 2. Check if tcpip is active
    let isTcpipEnabled = false
    try {
      const [tcpPort] = await shell(deviceId, [
        'getprop service.adb.tcp.port 2>/dev/null',
      ])
      const portNum = parseInt((tcpPort || '').trim(), 10)
      if (portNum > 0) {
        isTcpipEnabled = true
      }
    } catch {}

    return {
      ip,
      port: 5555,
      isTcpipEnabled,
      isConnectedWireless,
    }
  } catch (err: any) {
    logger.error('Error getting wireless status', err)
    return {
      ip: '',
      port: 5555,
      isTcpipEnabled: false,
      isConnectedWireless: false,
    }
  }
}

export const enableWirelessBridge: IpcEnableWirelessBridge = async function (
  deviceId
) {
  try {
    const status = await getWirelessStatus(deviceId)
    if (!status.ip) {
      return {
        success: false,
        ip: '',
        port: 5555,
        error:
          'No se detectó una IP WiFi activa en wlan0. Asegúrate de que el teléfono esté conectado a la misma red WiFi.',
      }
    }

    const device = adbClient.getDevice(deviceId)
    // Run adb tcpip 5555
    await device.tcpip(5555)

    // Wait a brief moment for the daemon to rebind
    await new Promise((r) => setTimeout(r, 600))

    // Connect via ADB over WiFi
    await adbClient.connect(status.ip, 5555)

    // Save profile for fast reconnection
    const profiles: IWirelessProfile[] = profilesStore.get('profiles') || []
    const props = await device.getProperties().catch(() => ({}))
    const name = `${props['ro.product.manufacturer'] || ''} ${props['ro.product.model'] || ''}`.trim() || status.ip

    const existingIdx = profiles.findIndex((p) => p.ip === status.ip)
    const newProfile: IWirelessProfile = {
      id: `${status.ip}:5555`,
      name,
      ip: status.ip,
      port: 5555,
      lastConnected: Date.now(),
      isOnline: true,
    }

    if (existingIdx >= 0) {
      profiles[existingIdx] = newProfile
    } else {
      profiles.unshift(newProfile)
    }
    profilesStore.set('profiles', profiles)

    return {
      success: true,
      ip: status.ip,
      port: 5555,
    }
  } catch (err: any) {
    logger.error('Failed to enable wireless bridge', err)
    return {
      success: false,
      ip: '',
      port: 5555,
      error: err.message || 'Error al iniciar puente inalámbrico ADB',
    }
  }
}

export const getWirelessProfiles: IpcGetWirelessProfiles = async function () {
  const profiles: IWirelessProfile[] = profilesStore.get('profiles') || []
  return profiles
}

export const removeWirelessProfile: IpcRemoveWirelessProfile = async function (
  ip
) {
  const profiles: IWirelessProfile[] = profilesStore.get('profiles') || []
  const filtered = profiles.filter((p) => p.ip !== ip)
  profilesStore.set('profiles', filtered)
}

export const pingIp: IpcPingIp = async function (ip, port = 5555) {
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(800)

    socket.connect(port, ip, () => {
      socket.destroy()
      resolve(true)
    })

    socket.on('error', () => {
      socket.destroy()
      resolve(false)
    })

    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
  })
}
