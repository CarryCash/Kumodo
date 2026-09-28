import { describe, expect, it } from 'vitest'

function validateCommand(command: string) {
  const raw = command ?? ''
  const normalized = raw.trim()

  if (!normalized) return { ok: false, reason: 'empty' }

  const hasControlChars = Array.from(raw).some((char) => {
    const code = char.codePointAt(0) ?? 0
    return code < 32 || code === 127
  })

  if (hasControlChars || /[;&|`$<>]/.test(raw)) {
    return { ok: false, reason: 'unsafe characters' }
  }

  if (/(^|\s)(rm|delete|erase|wipe|format|dd|mkfs|mount|umount|chmod|chown)(\s|$)/i.test(normalized)) {
    return { ok: false, reason: 'unsafe characters' }
  }

  if (/(factory\s*reset|data\s+wipe|reboot\s+into)/i.test(normalized)) {
    return { ok: false, reason: 'unsafe characters' }
  }

  if (!/^[a-zA-Z0-9_./:=+%\- \t]+$/.test(normalized)) {
    return { ok: false, reason: 'not allowed' }
  }

  return { ok: true }
}

describe('security command validation', () => {
  it('accepts safe adb shell commands', () => {
    expect(validateCommand('dumpsys battery')).toEqual({ ok: true })
    expect(validateCommand('pm list packages')).toEqual({ ok: true })
  })

  it('rejects shell injection patterns', () => {
    expect(validateCommand('dumpsys battery; reboot')).toEqual({ ok: false, reason: 'unsafe characters' })
    expect(validateCommand('rm -rf /')).toEqual({ ok: false, reason: 'unsafe characters' })
  })

  it('rejects control characters and empty commands', () => {
    expect(validateCommand('echo hello\n')).toEqual({ ok: false, reason: 'unsafe characters' })
    expect(validateCommand('   ')).toEqual({ ok: false, reason: 'empty' })
  })
})
