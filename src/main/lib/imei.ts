import { shell } from './adb/base'
import {
  IImeiInfo,
  IImeiVerificationResult,
  IpcGetImeiInfo,
  IpcLaunchMmiCode,
} from 'common/types'

// Algoritmo de Luhn (Módulo 10)
export function checkLuhn(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false
  let sum = 0
  for (let i = 0; i < 14; i++) {
    let digit = parseInt(imei[i], 10)
    if (i % 2 !== 0) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  const checkDigit = (10 - (sum % 10)) % 10
  return checkDigit === parseInt(imei[14], 10)
}

// Decodifica la salida de `service call iphonesubinfo <slot>`
function parseIphoneSubInfoOutput(output: string): string | null {
  if (!output) return null
  // Extraer la parte entre comillas simples que contiene caracteres UTF-16
  const textMatches = output.match(/'([^']+)'/g)
  if (textMatches && textMatches.length > 0) {
    const raw = textMatches.join('').replace(/[^0-9]/g, '')
    if (raw.length >= 14 && raw.length <= 16) {
      return raw.slice(0, 15)
    }
  }

  // Fallback: decodificar pares hexadecimales
  const hexParts = output
    .replace(/Result: Parcel\(/i, '')
    .replace(/\)/g, '')
    .split(/\s+/)
    .filter((p) => /^[0-9a-fA-F]{8}$/.test(p))

  let chars = ''
  for (const part of hexParts) {
    // En little endian: dos caracteres UTF-16 de 16 bits cada uno
    const low = parseInt(part.slice(4, 8), 16)
    const high = parseInt(part.slice(0, 4), 16)
    if (low >= 48 && low <= 57) chars += String.fromCharCode(low)
    if (high >= 48 && high <= 57) chars += String.fromCharCode(high)
  }

  const digits = chars.replace(/[^0-9]/g, '')
  if (digits.length >= 14 && digits.length <= 16) {
    return digits.slice(0, 15)
  }

  return null
}

export const getImeiInfo: IpcGetImeiInfo = async function (
  deviceId: string
): Promise<IImeiVerificationResult> {
  const [
    subinfo1Res,
    subinfo2Res,
    propsRes,
    deviceInfoRes,
  ] = await Promise.all([
    shell(deviceId, ['service call iphonesubinfo 1 2>/dev/null']).catch(() => ['']),
    shell(deviceId, ['service call iphonesubinfo 2 2>/dev/null']).catch(() => ['']),
    shell(deviceId, [
      'getprop gsm.baseband.imei 2>/dev/null; getprop ril.gsm.imei 2>/dev/null; getprop persist.radio.imei 2>/dev/null; dumpsys telephony.registry 2>/dev/null | grep -i "mImei=" | head -4',
    ]).catch(() => ['']),
    shell(deviceId, [
      'getprop ro.product.brand 2>/dev/null; getprop ro.product.model 2>/dev/null; getprop ro.serialno 2>/dev/null',
    ]).catch(() => ['']),
  ])

  const [deviceBrand = 'Desconocido', deviceModel = 'Desconocido', serialno = ''] = (
    deviceInfoRes[0] || ''
  )
    .split('\n')
    .map((s) => s.trim())

  const foundImeis: string[] = []

  // 1. Extraer de iphonesubinfo 1 y 2
  const imei1 = parseIphoneSubInfoOutput(subinfo1Res[0] || '')
  if (imei1 && !foundImeis.includes(imei1)) foundImeis.push(imei1)

  const imei2 = parseIphoneSubInfoOutput(subinfo2Res[0] || '')
  if (imei2 && !foundImeis.includes(imei2)) foundImeis.push(imei2)

  // 2. Extraer de propiedades y dumpsys
  const propMatches = (propsRes[0] || '').match(/\b\d{15}\b/g)
  if (propMatches) {
    for (const m of propMatches) {
      if (!foundImeis.includes(m)) {
        foundImeis.push(m)
      }
    }
  }

  const imeis: IImeiInfo[] = foundImeis.map((imei, idx) => {
    const isValidLuhn = checkLuhn(imei)
    const tac = imei.slice(0, 8)

    return {
      imei,
      slot: idx + 1,
      isValidLuhn,
      tac,
      reportedBrand: deviceBrand,
      reportedModel: deviceModel,
      tacBrand: '',
      tacModel: '',
      isClonedOrMismatch: false,
      hardwareMatched: true,
    }
  })

  return {
    imeis,
    deviceBrand,
    deviceModel,
    serialno,
    dualSim: imeis.length > 1,
  }
}

export const launchMmiCode: IpcLaunchMmiCode = async function (
  deviceId: string
): Promise<boolean> {
  try {
    // Abrir el marcador telefónico con el código MMI *#06#
    await shell(deviceId, [
      'am start -a android.intent.action.DIAL -d "tel:*%2306%23"',
    ])
    return true
  } catch {
    return false
  }
}
