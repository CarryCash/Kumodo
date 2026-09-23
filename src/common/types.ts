export interface IDevice {
  id: string
  name: string
  serialno: string
  androidVersion: string
  sdkVersion: string
  type: 'emulator' | 'device' | 'offline' | 'unauthorized' | 'unknown'
}

export interface IAvd {
  id: string
  name: string
  abi: string
  sdkVersion: string
  memory: number
  internalStorage: number
  resolution: string
  folder: string
  pid: number
}

export interface IPackageInfo {
  icon: string
  label: string
  enabled: boolean
  packageName: string
  versionName: string
  apkPath: string
  apkSize: number
  system: boolean
  firstInstallTime: number
  lastUpdateTime: number
  minSdkVersion?: number
  targetSdkVersion?: number
  dataSize: number
  cacheSize: number
  appSize: number
  signatures: string[]
  dangerLevel?: 'high' | 'medium' | 'low' | 'none'
  suspiciousReasons?: string[]
  permissions?: string[]
  batteryUser?: boolean
}

export interface IFileStat {
  size?: number
  mtime: Date
  directory: boolean
  mode: string
}

export interface IFile extends IFileStat {
  name: string
  mime?: string
}

export interface IWebview {
  title: string
  url: string
  devtoolsFrontendUrl: string
  webSocketDebuggerUrl: string
  faviconUrl?: string
}

export interface IProcess {
  name: string
  pid: string
}

export enum TransferType {
  Upload,
  Download,
}

export type IpcGetFps = (deviceId: string, pkg: string) => Promise<number>
export type IpcGetDevices = () => Promise<IDevice[]>
export type IpcSetScreencastAlwaysOnTop = (alwaysOnTop: boolean) => void
export type IpcListForwards = (
  deviceId: string
) => Promise<Array<{ local: string; remote: string }>>
export type IpcListReverses = IpcListForwards
export type IpcForward = (
  deviceId: string,
  local: string,
  remote: string
) => void
export type IpcReverse = (
  deviceId: string,
  remote: string,
  local: string
) => void
export type IpcDumpWindowHierarchy = (deviceId: string) => Promise<string>
export type IpcGetPackageInfos = (
  deviceId: string,
  packageNames: string[]
) => Promise<IPackageInfo[]>
export type IpcGetAvds = (forceRefresh?: boolean) => Promise<IAvd[]>
export type IpcStartAvd = (avdId: string) => Promise<void>
export type IpcStopAvd = IpcStartAvd
export type IpcWipeAvdData = (avdId: string) => Promise<void>
export type IpcPairDevice = (
  host: string,
  port: number,
  password: string
) => Promise<void>
export type IpcCreateShell = (deviceId: string) => Promise<string>
export type IpcWriteShell = (sessionId: string, data: string) => void
export type IpcResizeShell = (
  sessionId: string,
  cols: number,
  rows: number
) => void
export type IpcKillShell = (sessionId: string) => void
export type IpcScreencap = (deviceId: string) => Promise<string>
export type IpcOpenLogcat = (deviceId: string) => Promise<string>
export type IpcCloseLogcat = (logcatId: string) => Promise<void>
export type IpcPauseLogcat = IpcCloseLogcat
export type IpcResumeLogcat = IpcCloseLogcat
export type IpcInputKey = (deviceId: string, keyCode: number) => Promise<void>
export type IpcReverseTcp = (
  deviceId: string,
  remote: string
) => Promise<number>
export type IpcStartScrcpy = (deviceId: string, args: string[]) => Promise<void>
export type IpcConnectDevice = (host: string, port?: number) => Promise<void>
export type IpcDisconnectDevice = IpcConnectDevice
export type IpcMoveFile = (
  deviceId: string,
  src: string,
  dest: string
) => Promise<void>
export type IpcStatFile = (deviceId: string, path: string) => Promise<IFileStat>
export type IpcReadDir = (deviceId: string, path: string) => Promise<IFile[]>
export type IpcCreateDir = (deviceId: string, path: string) => Promise<void>
export type IpcDeleteDir = IpcCreateDir
export type IpcDeleteFile = IpcCreateDir
export type IpcOpenFile = IpcCreateDir
export type IpcPushFile = (
  deviceId: string,
  src: string,
  dest: string
) => Promise<void>
export type IpcPullFile = (
  deviceId: string,
  src: string,
  dest: string
) => Promise<void>
export type IpcEnablePackage = (deviceId: string, pkg: string) => Promise<void>
export type IpcDisablePackage = IpcEnablePackage
export type IpcGetPackages = (
  deviceId: string,
  system?: boolean
) => Promise<string[]>
export type IpcInstallPackage = (
  deviceId: string,
  apkPath: string
) => Promise<void>
export type IpcUninstallPackage = (
  deviceId: string,
  pkg: string
) => Promise<void>
export type IpcStartPackage = (deviceId: string, pkg: string) => Promise<void>
export type IpcStopPackage = IpcStartPackage
export type IpcClearPackage = IpcStartPackage
export type IpcGetTopPackage = (deviceId: string) => Promise<{
  name: string
  pid: number
}>
export type IpcGetWebviews = (
  deviceId: string,
  pid: number
) => Promise<IWebview[]>
export type IpcGetProcesses = (deviceId: string) => Promise<IProcess[]>
export type IpcGetFileUrl = (
  deviceId: string,
  path: string,
  port?: number
) => Promise<string>

export interface IDiagnostic {
  // Identity
  name: string
  brand: string
  model: string
  serialno: string
  buildNumber: string
  // Software
  androidVersion: string
  sdkVersion: string
  kernelVersion: string
  bootloader: string
  // Hardware
  processor: string
  cpuNum: number
  abi: string
  memTotal: number
  memUsed: number
  storageTotal: number
  storageUsed: number
  resolution: string
  physicalResolution: string
  density: string
  // Battery
  batteryLevel: number
  batteryVoltage: number
  batteryTemperature: number
  // Connectivity
  wifi: string
  ip: string
  mac: string
  // System
  uptime: number
  root: boolean
  encryption: string
}

export interface IHistoryEntry {
  serialno: string
  name: string
  androidVersion: string
  sdkVersion: string
  connectedAt: number
  notes: string
}

export type IpcGetDiagnostic = (deviceId: string) => Promise<IDiagnostic>
export type IpcGetHistory = () => Promise<IHistoryEntry[]>
export type IpcSaveHistory = (entry: IHistoryEntry) => Promise<void>
export type IpcUpdateHistoryNotes = (serialno: string, notes: string) => Promise<void>
export type IpcClearHistory = () => Promise<void>

export type ILogIssueSeverity = 'crash' | 'anr' | 'oom' | 'security' | 'system' | 'error'

export interface ILogIssue {
  id: string
  severity: ILogIssueSeverity
  tag: string
  message: string
  package?: string
  timestamp: number
  raw: string
}

export interface ILogCase {
  id: string
  serialno: string
  deviceName: string
  createdAt: number
  label: string
  issues: ILogIssue[]
}

export type IpcGetLogCases = (serialno: string) => Promise<ILogCase[]>
export type IpcSaveLogCase = (logCase: ILogCase) => Promise<void>
export type IpcDeleteLogCase = (serialno: string, caseId: string) => Promise<void>

export interface IBatteryStats {
  level: number
  health: string
  voltage: number
  temperature: number
  technology: string
  status: string
  isCharging: boolean
  appsConsumption: Array<{ packageName: string; percent: number; uid: string }>
  warnings: string[]
}

export type IpcGetBatteryStats = (deviceId: string) => Promise<IBatteryStats>
export type IpcResetBatteryStats = (deviceId: string) => Promise<void>

export interface IStorageRamStats {
  storageTotal: number
  storageFree: number
  memTotal: number
  memFree: number
  memAvailable: number
  memCached: number
  appsRamConsumption: Array<{ packageName: string; pss: number; type: string }>
  warnings: string[]
}

export type IpcGetStorageRamStats = (deviceId: string) => Promise<IStorageRamStats>

export interface IAppInfo {
  packageName: string
  isSystem: boolean
  dangerLevel: 'none' | 'low' | 'medium' | 'high'
  permissions: string[]
  dangerousPermissions: string[]
  batteryUser: boolean
  suspiciousReasons: string[]
  enabled: boolean
}

export type IpcGetAppAnalysis = (deviceId: string) => Promise<IAppInfo[]>
export type IpcToggleApp = (deviceId: string, pkg: string, enable: boolean) => Promise<void>

export type BackupType = 'photos' | 'files' | 'apks' | 'appdata'

export interface IBackupJob {
  type: BackupType
  deviceId: string
  destFolder: string
  packageName?: string // only for appdata
}

export interface IBackupProgress {
  type: BackupType
  status: 'running' | 'done' | 'error'
  file?: string
  total?: number
  done?: number
  error?: string
  outputPath?: string
  checksum?: string
  manifestPath?: string
  manifestHash?: string
  chainOfCustodyPath?: string
  evidenceBy?: string
}

export type IpcRunBackup = (job: IBackupJob) => Promise<IBackupProgress>
export type IpcPickFolder = () => Promise<string | null>
export type IpcExecAdb = (deviceId: string, command: string) => Promise<string>

export interface IJunkItem {
  category: 'cache' | 'temp' | 'apk' | 'orphan' | 'report'
  path: string
  label: string
  size: number // bytes
}

export type IpcScanJunk = (deviceId: string) => Promise<IJunkItem[]>
export type IpcCleanJunk = (deviceId: string, items: IJunkItem[]) => Promise<number>

export interface ISecurityCheckItem {
  id: string
  title: string
  description: string
  status: 'secure' | 'warning' | 'danger' | 'info'
  value: string
  detail: string
  recommendation?: string
}

export interface ISecurityAudit {
  score: number
  level: 'secure' | 'warning' | 'danger'
  items: ISecurityCheckItem[]
  timestamp: number
  deviceModel?: string
  serialno?: string
}

export type IpcAuditSecurity = (deviceId: string) => Promise<ISecurityAudit>

export interface IImeiInfo {
  imei: string
  slot: number
  isValidLuhn: boolean
  tac: string
  reportedBrand: string
  reportedModel: string
  tacBrand?: string
  tacModel?: string
  isClonedOrMismatch: boolean
  hardwareMatched: boolean
}

export interface IImeiVerificationResult {
  imeis: IImeiInfo[]
  deviceBrand: string
  deviceModel: string
  serialno: string
  dualSim: boolean
}

export type IpcGetImeiInfo = (deviceId: string) => Promise<IImeiVerificationResult>
export type IpcLaunchMmiCode = (deviceId: string) => Promise<boolean>

export interface IMediaFile {
  path: string
  name: string
  size: number
  mtime: number // unix epoch ms
  type: 'image' | 'video'
  extension: string
  hash?: string
  isDuplicate?: boolean
}

export type IpcGetMediaFiles = (deviceId: string) => Promise<IMediaFile[]>
export type IpcGetMediaThumbnail = (deviceId: string, remotePath: string) => Promise<string>
export type IpcDetectMediaDuplicates = (deviceId: string, paths: string[]) => Promise<Record<string, string[]>>
export type IpcPullMediaFiles = (deviceId: string, remotePaths: string[], targetDir: string) => Promise<{ success: number; failed: number }>
export type IpcDeleteMediaFiles = (deviceId: string, remotePaths: string[]) => Promise<boolean>

// Debloater Types
export type DebloatSafety = 'safe' | 'risky' | 'danger'

export interface IDebloatPackage {
  package: string
  name: string
  manufacturer: string
  category: DebloatSafety
  description: string
  dependencies: string
  isInstalled: boolean
  isEnabled: boolean
}

export type IpcGetDebloatList = (deviceId: string) => Promise<IDebloatPackage[]>
export type IpcDebloatAction = (
  deviceId: string,
  pkg: string,
  action: 'disable' | 'uninstall' | 'enable'
) => Promise<boolean>
export type IpcRestoreAllDebloat = (
  deviceId: string,
  pkgs: string[]
) => Promise<{ restored: number; failed: number }>

// Wireless Bridge Types
export interface IWirelessStatus {
  ip: string
  port: number
  ssid?: string
  isTcpipEnabled: boolean
  isConnectedWireless: boolean
}

export interface IWirelessProfile {
  id: string
  name: string
  ip: string
  port: number
  lastConnected: number
  isOnline?: boolean
}

export type IpcGetWirelessStatus = (deviceId: string) => Promise<IWirelessStatus>
export type IpcEnableWirelessBridge = (
  deviceId: string
) => Promise<{ success: boolean; ip: string; port: number; error?: string }>
export type IpcGetWirelessProfiles = () => Promise<IWirelessProfile[]>
export type IpcRemoveWirelessProfile = (ip: string) => Promise<void>
export type IpcPingIp = (ip: string, port?: number) => Promise<boolean>

export interface IAuditLogEntry {
  timestamp: string
  category: 'system' | 'adb' | 'ai' | 'backup' | 'security' | 'user'
  action: string
  level: 'info' | 'warn' | 'error' | 'debug'
  status: 'success' | 'error' | 'cancelled' | 'pending' | 'blocked'
  deviceId?: string
  actor?: string
  authorizedBy?: string
  command?: string
  prompt?: string
  details?: string
  sessionId?: string
  source?: 'app' | 'renderer' | 'main' | 'ai'
}

export type IpcWriteAuditLog = (entry: Partial<IAuditLogEntry>) => Promise<void>
export type IpcGetAuditLog = (limit?: number) => Promise<IAuditLogEntry[]>

// ─── Forensic Mode Types ───────────────────────────────────────────────────────

export interface IForensicCallLog {
  number: string
  name?: string
  date: number
  duration: number // seconds
  type: 'incoming' | 'outgoing' | 'missed' | 'voicemail' | 'rejected'
}

export interface IForensicSms {
  address: string
  date: number
  body: string
  type: 'sent' | 'received'
  read: boolean
}

export interface IForensicContact {
  name: string
  number: string
  type: string
}

export interface IForensicUninstalledApp {
  package: string
  dataSize: number // bytes
  path: string
}

export interface IForensicDeletedFile {
  path: string
  size: number // bytes
  mtime: number // epoch ms
  status: 'recoverable' | 'unknown'
}

export type IpcGetForensicCallLog = (deviceId: string) => Promise<IForensicCallLog[]>
export type IpcGetForensicSms = (deviceId: string) => Promise<IForensicSms[]>
export type IpcGetForensicContacts = (deviceId: string) => Promise<IForensicContact[]>
export type IpcGetForensicUninstalledApps = (deviceId: string) => Promise<IForensicUninstalledApp[]>
export type IpcGetForensicDeletedFiles = (deviceId: string) => Promise<IForensicDeletedFile[]>
