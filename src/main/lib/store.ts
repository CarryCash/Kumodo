import { safeStorage } from 'electron'
import memoize from 'licia/memoize'
import FileStore from 'licia/FileStore'
import { getUserDataPath } from 'share/main/lib/util'

export function encryptSettingValue(name: string, value: any) {
  if (name !== 'geminiApiKey' || value === undefined || value === null) {
    return value
  }

  if (typeof value !== 'string') {
    return value
  }

  const normalizedValue = value.trim()
  if (!normalizedValue) {
    return ''
  }

  if (!safeStorage.isEncryptionAvailable()) {
    return normalizedValue
  }

  try {
    return safeStorage.encryptString(normalizedValue).toString('base64')
  } catch {
    return normalizedValue
  }
}

export function decryptSettingValue(name: string, value: any) {
  if (name !== 'geminiApiKey' || typeof value !== 'string' || !value) {
    return value
  }

  if (!safeStorage.isEncryptionAvailable()) {
    return value.trim()
  }

  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64')).trim()
  } catch {
    return value.trim()
  }
}

export const getMainStore = memoize(function () {
  return new FileStore(getUserDataPath('data/main.json'), {})
})

export const getScreencastStore = memoize(function () {
  return new FileStore(getUserDataPath('data/screencast.json'), {
    settings: {},
    alwaysOnTop: false,
  })
})

export const getDevicesStore = memoize(function () {
  return new FileStore(getUserDataPath('data/devices.json'), {
    remoteDevices: [],
  })
})

export const getSettingsStore = memoize(function () {
  const store = new FileStore(getUserDataPath('data/settings.json'), {
    language: 'system',
    theme: 'system',
    useNativeTitlebar: false,
    adbPath: '',
    killAdbWhenExit: false,
  })

  const originalSet = store.set.bind(store)
  store.set = ((key: string | Record<string, any>, value?: any) => {
    if (typeof key === 'string') {
      return originalSet(key, encryptSettingValue(key, value))
    }

    if (key && typeof key === 'object') {
      const encrypted = Object.fromEntries(
        Object.entries(key).map(([entryKey, entryValue]) => [
          entryKey,
          encryptSettingValue(entryKey, entryValue),
        ])
      )
      return originalSet(encrypted)
    }

    return originalSet(key as any, value)
  }) as typeof store.set

  const originalGet = store.get.bind(store)
  store.get = ((key: string | string[]) => {
    if (typeof key === 'string') {
      const rawValue = originalGet(key)
      const decrypted = decryptSettingValue(key, rawValue)

      if (
        key === 'geminiApiKey' &&
        typeof rawValue === 'string' &&
        rawValue &&
        rawValue === decrypted &&
        safeStorage.isEncryptionAvailable()
      ) {
        const migrated = encryptSettingValue(key, rawValue)
        if (migrated !== rawValue) {
          originalSet(key, migrated)
        }
      }

      return decrypted
    }

    if (Array.isArray(key)) {
      const values = originalGet(key)
      return Object.fromEntries(
        key.map((entryKey) => [entryKey, decryptSettingValue(entryKey, values[entryKey])])
      )
    }

    return originalGet(key as any)
  }) as typeof store.get

  return store
})
