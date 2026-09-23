import { shell } from './adb/base'
import { ISecurityAudit, ISecurityCheckItem, IpcAuditSecurity } from 'common/types'

export const auditSecurity: IpcAuditSecurity = async function (
  deviceId: string
): Promise<ISecurityAudit> {
  const items: ISecurityCheckItem[] = []

  const [
    accountsRes,
    rootRes,
    bootloaderRes,
    selinuxRes,
    netstatRes,
    cacertsRes,
    devSettingsRes,
    deviceInfoRes,
  ] = await Promise.all([
    // 1. FRP & Accounts
    shell(deviceId, [
      'dumpsys account 2>/dev/null | grep -E "Account \\{name=" | head -10',
    ]).catch(() => ['']),

    // 2. Root & Magisk
    shell(deviceId, [
      'which su 2>/dev/null; which magisk 2>/dev/null; ls -d /system/bin/su /system/xbin/su /sbin/su /data/adb/magisk /system/xbin/busybox 2>/dev/null; getprop ro.debuggable 2>/dev/null; getprop ro.secure 2>/dev/null',
    ]).catch(() => ['']),

    // 3. Bootloader
    shell(deviceId, [
      'getprop ro.boot.verifiedbootstate 2>/dev/null; getprop ro.boot.flash.locked 2>/dev/null; getprop sys.oem_unlock_allowed 2>/dev/null',
    ]).catch(() => ['']),

    // 4. SELinux
    shell(deviceId, ['getenforce 2>/dev/null']).catch(() => ['']),

    // 5. Open Ports
    shell(deviceId, ['netstat -tuln 2>/dev/null || ss -tuln 2>/dev/null']).catch(
      () => ['']
    ),

    // 6. User SSL Certs
    shell(deviceId, [
      'ls -1 /data/misc/user/*/cacerts-added 2>/dev/null',
    ]).catch(() => ['']),

    // 7. DevMode & ADB settings
    shell(deviceId, [
      'settings get global development_settings_enabled 2>/dev/null; settings get global adb_wifi_enabled 2>/dev/null; settings get global install_non_market_apps 2>/dev/null; getprop service.adb.tcp.port 2>/dev/null',
    ]).catch(() => ['']),

    // Device Model & Serial
    shell(deviceId, [
      'getprop ro.product.model 2>/dev/null; getprop ro.serialno 2>/dev/null',
    ]).catch(() => ['']),
  ])

  const [model = '', serial = ''] = (deviceInfoRes[0] || '')
    .split('\n')
    .map((s) => s.trim())

  // --- 1. FRP Lock (Google Account Lock) ---
  const accountLines = (accountsRes[0] || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const googleAccounts = accountLines
    .filter((l) => l.toLowerCase().includes('com.google'))
    .map((l) => {
      const m = l.match(/name=([^, }\t]+)/)
      return m ? m[1] : l
    })

  if (googleAccounts.length > 0) {
    items.push({
      id: 'frp',
      title: 'Bloqueo FRP (Cuentas Google)',
      description: 'Protección contra restablecimiento de fábrica no autorizado',
      status: 'warning',
      value: `FRP Activo (${googleAccounts.length} cuenta${
        googleAccounts.length > 1 ? 's' : ''
      })`,
      detail: `Cuentas detectadas: ${googleAccounts.join(
        ', '
      )}. Si se formatea por Recovery, pedirá estas credenciales.`,
      recommendation:
        'Si vas a vender o reparar el equipo, remueve la cuenta de Google desde Ajustes antes de restablecer.',
    })
  } else {
    items.push({
      id: 'frp',
      title: 'Bloqueo FRP (Cuentas Google)',
      description: 'Protección contra restablecimiento de fábrica no autorizado',
      status: 'secure',
      value: 'Sin bloqueo FRP (Listo para resetear)',
      detail:
        'No se detectaron cuentas de Google activas que impidan la configuración tras un formateo.',
      recommendation: 'El equipo se puede formatear de forma segura sin bloqueo FRP.',
    })
  }

  // --- 2. Root / Magisk / BusyBox ---
  const rootLines = (rootRes[0] || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const suFound = rootLines.some(
    (l) =>
      l.includes('/su') ||
      l.includes('magisk') ||
      l.includes('busybox') ||
      l === 'su'
  )
  const isDebuggable = rootLines.includes('1') // ro.debuggable
  const isUnsecure = rootLines.some((l, idx) => idx > 1 && l === '0') // ro.secure = 0

  if (suFound || (isDebuggable && isUnsecure)) {
    items.push({
      id: 'root',
      title: 'Root & Magisk / BusyBox',
      description: 'Detección de binarios de superusuario y permisos elevados',
      status: 'danger',
      value: 'Root / Modificación detectada',
      detail: `Se detectaron componentes con privilegios root (${rootLines
        .filter((l) => l.length > 2 && !['0', '1'].includes(l))
        .join(', ')}).`,
      recommendation:
        'Las aplicaciones bancarias o de streaming pueden bloquearse. Desinstala Magisk o restaura el firmware oficial si necesitas certificación de seguridad.',
    })
  } else {
    items.push({
      id: 'root',
      title: 'Root & Magisk / BusyBox',
      description: 'Detección de binarios de superusuario y permisos elevados',
      status: 'secure',
      value: 'Sin Root (Sistema Original)',
      detail:
        'No se encontraron binarios su, Magisk ni entornos de depuración desprotegidos.',
      recommendation: 'Integridad del sistema verificada y protegida.',
    })
  }

  // --- 3. Bootloader desbloqueado ---
  const bootLines = (bootloaderRes[0] || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const verifiedState = bootLines[0] || '' // green, yellow, orange, red
  const flashLocked = bootLines[1] || '' // 1 = locked, 0 = unlocked

  const isUnlocked =
    verifiedState.toLowerCase() === 'orange' ||
    verifiedState.toLowerCase() === 'yellow' ||
    flashLocked === '0'

  if (isUnlocked) {
    items.push({
      id: 'bootloader',
      title: 'Estado del Bootloader',
      description: 'Verificación de arranque seguro y firma de particiones',
      status: 'warning',
      value: 'Bootloader Desbloqueado',
      detail: `verifiedbootstate: "${verifiedState || 'orange'}", flash.locked: "${
        flashLocked || '0'
      }". Se pueden cargar ROMs y particiones no oficiales.`,
      recommendation:
        'El dispositivo es vulnerable a modificaciones físicas del sistema. Se recomienda bloquearlo si no se requiere desarrollo.',
    })
  } else {
    items.push({
      id: 'bootloader',
      title: 'Estado del Bootloader',
      description: 'Verificación de arranque seguro y firma de particiones',
      status: 'secure',
      value: 'Bootloader Bloqueado (Seguro)',
      detail: `Arranque seguro verificado (${verifiedState || 'green'}). El kernel y particiones clave están protegidas con firma del fabricante.`,
      recommendation: 'Protección criptográfica de arranque activa.',
    })
  }

  // --- 4. SELinux ---
  const selinuxMode = (selinuxRes[0] || '').trim().toLowerCase()
  if (selinuxMode.includes('enforcing')) {
    items.push({
      id: 'selinux',
      title: 'Políticas SELinux',
      description: 'Aislamiento de procesos por Control de Acceso Obligatorio (MAC)',
      status: 'secure',
      value: 'SELinux Enforcing (Estricto)',
      detail:
        'El kernel fuerza el aislamiento de procesos y restringe la escalada de privilegios.',
      recommendation: 'Configuración óptima de seguridad de Android.',
    })
  } else {
    items.push({
      id: 'selinux',
      title: 'Políticas SELinux',
      description: 'Aislamiento de procesos por Control de Acceso Obligatorio (MAC)',
      status: 'danger',
      value: `SELinux ${selinuxMode || 'Permisivo / Desactivado'}`,
      detail:
        'Las reglas de seguridad de SELinux no se están aplicando activamente, lo que facilita vulnerabilidades de día cero.',
      recommendation:
        'Riesgo crítico. Restablece el modo estricto ejecutando "setenforce 1" o reinstalando el kernel oficial.',
    })
  }

  // --- 5. Puertos Abiertos (Servidores corriendo) ---
  const netstatLines = (netstatRes[0] || '').split('\n').filter(Boolean)
  const openPorts: string[] = []
  for (const line of netstatLines) {
    if (
      line.includes('LISTEN') ||
      line.includes('0.0.0.0:') ||
      line.includes(':::') ||
      line.includes('*.*')
    ) {
      const match = line.match(/(?:0\.0\.0\.0|:::|\*):(\d+)/)
      if (match && match[1]) {
        const port = match[1]
        if (!openPorts.includes(port)) {
          openPorts.push(port)
        }
      }
    }
  }

  const hasCriticalPort = openPorts.some((p) =>
    ['5555', '22', '23', '8080'].includes(p)
  )

  if (hasCriticalPort) {
    items.push({
      id: 'ports',
      title: 'Puertos de Red Abiertos',
      description: 'Detección de sockets y servidores escuchando externamente',
      status: 'danger',
      value: `Puertos críticos expuestos (${openPorts.join(', ')})`,
      detail: `Hay servicios accesibles desde la red local (${openPorts.join(
        ', '
      )}). El puerto 5555 permite control ADB remoto sin confirmación USB en algunos equipos.`,
      recommendation:
        'Desactiva ADB inalámbrico o detén servidores locales cuando estés conectado a redes públicas.',
    })
  } else if (openPorts.length > 0) {
    items.push({
      id: 'ports',
      title: 'Puertos de Red Abiertos',
      description: 'Detección de sockets y servidores escuchando externamente',
      status: 'warning',
      value: `${openPorts.length} puerto(s) en escucha (${openPorts.join(', ')})`,
      detail: `Servicios activos escuchando en interfaces de red: ${openPorts.join(
        ', '
      )}.`,
      recommendation:
        'Comprueba que las aplicaciones que abrieron estos puertos sean legítimas.',
    })
  } else {
    items.push({
      id: 'ports',
      title: 'Puertos de Red Abiertos',
      description: 'Detección de sockets y servidores escuchando externamente',
      status: 'secure',
      value: 'Sin puertos externos expuestos',
      detail:
        'No se detectaron servidores ni sockets escuchando conexiones remotas entrantes.',
      recommendation: 'El dispositivo no expone servicios de red inseguros.',
    })
  }

  // --- 6. Certificados SSL no confiables (User CAs) ---
  const certLines = (cacertsRes[0] || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !l.includes('No such file') &&
        !l.includes('Permission denied') &&
        !l.includes('total')
    )

  if (certLines.length > 0) {
    items.push({
      id: 'certs',
      title: 'Certificados CA de Usuario',
      description: 'Autoridades de certificación instaladas en el almacén de usuario',
      status: 'danger',
      value: `${certLines.length} certificado(s) de usuario detectado(s)`,
      detail: `Se encontraron certificados CA de usuario (${certLines.join(
        ', '
      )}). Permite ataques Man-in-the-Middle e intercepción del tráfico HTTPS/SSL.`,
      recommendation:
        'Revisa en Ajustes > Seguridad > Certificados de usuario y desinstala cualquier certificado desconocido o de proxies.',
    })
  } else {
    items.push({
      id: 'certs',
      title: 'Certificados CA de Usuario',
      description: 'Autoridades de certificación instaladas en el almacén de usuario',
      status: 'secure',
      value: 'Almacén de certificados limpio',
      detail:
        'No hay autoridades certificadoras de usuario instaladas. Solo se confía en las CAs oficiales del sistema.',
      recommendation: 'Tráfico HTTPS protegido contra intercepciones Man-in-the-Middle.',
    })
  }

  // --- 7. DevMode activo & Depuración ---
  const devLines = (devSettingsRes[0] || '')
    .split('\n')
    .map((l) => l.trim())
  const devEnabled = devLines[0] === '1'
  const adbWifi = devLines[1] === '1' || (devLines[3] && devLines[3] !== '0' && devLines[3] !== '-1')
  const nonMarketApps = devLines[2] === '1'

  if (devEnabled) {
    const alerts: string[] = ['Opciones de desarrollador activas']
    if (adbWifi) alerts.push('ADB por Wi-Fi habilitado')
    if (nonMarketApps) alerts.push('Fuentes desconocidas permitidas')

    items.push({
      id: 'devmode',
      title: 'Opciones de Desarrollador',
      description: 'Depuración USB y configuración de ingeniería del sistema',
      status: 'warning',
      value: alerts.join(' · '),
      detail: `Depuración USB activa${
        adbWifi ? ', ADB TCP/Wi-Fi en escucha' : ''
      }${nonMarketApps ? ', instalación de APKs no oficiales permitida' : ''}.`,
      recommendation:
        'Si el equipo va a entregarse a un usuario final o se usa para banca móvil, desactiva las Opciones de Desarrollador.',
    })
  } else {
    items.push({
      id: 'devmode',
      title: 'Opciones de Desarrollador',
      description: 'Depuración USB y configuración de ingeniería del sistema',
      status: 'secure',
      value: 'Modo Desarrollador Inactivo',
      detail: 'Las opciones avanzadas de depuración de ingeniería están deshabilitadas.',
      recommendation: 'Configuración segura para usuarios estándar.',
    })
  }

  // Calculate score
  let score = 100
  for (const item of items) {
    if (item.status === 'danger') score -= 25
    else if (item.status === 'warning') score -= 10
  }
  score = Math.max(0, Math.min(100, score))

  const level: 'secure' | 'warning' | 'danger' =
    score >= 80 ? 'secure' : score >= 55 ? 'warning' : 'danger'

  return {
    score,
    level,
    items,
    timestamp: Date.now(),
    deviceModel: model,
    serialno: serial,
  }
}
