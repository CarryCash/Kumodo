import fs from "fs-extra"
import path from "path"
import { app } from "electron"
import { handleEvent } from "share/main/lib/util"
import { IHistoryEntry, IpcGetHistory, IpcSaveHistory, IpcUpdateHistoryNotes, IpcClearHistory } from "common/types"

const HISTORY_FILE = path.join(app.getPath("userData"), "device_history.json")

async function readHistory(): Promise<IHistoryEntry[]> {
  try {
    await fs.ensureFile(HISTORY_FILE)
    const content = await fs.readFile(HISTORY_FILE, "utf8")
    if (!content.trim()) return []
    return JSON.parse(content)
  } catch {
    return []
  }
}

async function writeHistory(entries: IHistoryEntry[]): Promise<void> {
  await fs.writeFile(HISTORY_FILE, JSON.stringify(entries, null, 2), "utf8")
}

export const getHistory: IpcGetHistory = async function () {
  const entries = await readHistory()
  return entries.sort((a, b) => b.connectedAt - a.connectedAt)
}

export const saveHistory: IpcSaveHistory = async function (entry) {
  const entries = await readHistory()
  const idx = entries.findIndex((e) => e.serialno === entry.serialno)
  if (idx >= 0) {
    entries[idx] = { ...entries[idx], ...entry, notes: entries[idx].notes }
  } else {
    entries.push(entry)
  }
  await writeHistory(entries)
}

export const updateHistoryNotes: IpcUpdateHistoryNotes = async function (serialno, notes) {
  const entries = await readHistory()
  const idx = entries.findIndex((e) => e.serialno === serialno)
  if (idx >= 0) {
    entries[idx].notes = notes
    await writeHistory(entries)
  }
}

export const clearHistory: IpcClearHistory = async function () {
  await writeHistory([])
}

export function init() {
  handleEvent("getHistory", getHistory)
  handleEvent("saveHistory", saveHistory)
  handleEvent("updateHistoryNotes", updateHistoryNotes)
  handleEvent("clearHistory", clearHistory)
}
