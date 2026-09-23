import { app } from 'electron'
import fs from 'fs-extra'
import path from 'path'
import { ILogCase, IpcGetLogCases, IpcSaveLogCase, IpcDeleteLogCase } from 'common/types'
import { handleEvent } from 'share/main/lib/util'

function getCasesPath(): string {
  return path.join(app.getPath('userData'), 'log_cases.json')
}

async function readAll(): Promise<Record<string, ILogCase[]>> {
  const p = getCasesPath()
  if (await fs.pathExists(p)) {
    return await fs.readJson(p)
  }
  return {}
}

async function writeAll(data: Record<string, ILogCase[]>): Promise<void> {
  await fs.writeJson(getCasesPath(), data, { spaces: 2 })
}

const getLogCases: IpcGetLogCases = async function (serialno) {
  const all = await readAll()
  return all[serialno] || []
}

const saveLogCase: IpcSaveLogCase = async function (logCase) {
  const all = await readAll()
  const cases = all[logCase.serialno] || []
  const idx = cases.findIndex((c) => c.id === logCase.id)
  if (idx >= 0) {
    cases[idx] = logCase
  } else {
    cases.unshift(logCase)
  }
  all[logCase.serialno] = cases
  await writeAll(all)
}

const deleteLogCase: IpcDeleteLogCase = async function (serialno, caseId) {
  const all = await readAll()
  if (all[serialno]) {
    all[serialno] = all[serialno].filter((c) => c.id !== caseId)
    await writeAll(all)
  }
}

export function init() {
  handleEvent('getLogCases', getLogCases)
  handleEvent('saveLogCase', saveLogCase)
  handleEvent('deleteLogCase', deleteLogCase)
}
