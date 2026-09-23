import LunaModal from 'luna-modal/react'
import LunaSetting, {
  LunaSettingButton,
  LunaSettingCheckbox,
  LunaSettingInput,
  LunaSettingSelect,
  LunaSettingSeparator,
  LunaSettingTitle,
} from 'luna-setting/react'
import { notify } from 'share/renderer/lib/util'
import { t } from 'common/util'
import Style from './SettingsModal.module.scss'
import { createPortal } from 'react-dom'
import { observer } from 'mobx-react-lite'
import contain from 'licia/contain'
import debounce from 'licia/debounce'
import SettingPath from 'share/renderer/components/SettingPath'
import store from '../../store'
import { IModalProps } from 'share/common/types'
import { useState } from 'react'
import { testGeminiConnection } from '../../lib/ai'

const notifyRequireReload = debounce(() => {
  notify(t('requireReload'), { icon: 'info' })
}, 1000)

export default observer(function SettingsModal(props: IModalProps) {
  const [auditVisible, setAuditVisible] = useState(false)
  const [auditEntries, setAuditEntries] = useState<any[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [geminiTest, setGeminiTest] = useState<{ ok: boolean; message: string } | null>(null)
  const [testingGemini, setTestingGemini] = useState(false)

  function onChange(key, val) {
    if (contain(['language', 'useNativeTitlebar'], key)) {
      notifyRequireReload()
    }

    const normalizedVal = key === 'geminiApiKey' && typeof val === 'string' ? val.trim() : val
    store.settings.set(key, normalizedVal)
  }

  async function openAuditLog() {
    setAuditLoading(true)
    setAuditVisible(true)
    try {
      const entries = await main.getAuditLog(100)
      setAuditEntries(entries)
    } catch (e: any) {
      notify('No se pudo cargar el log interno: ' + (e?.message || e), { icon: 'error' })
      setAuditEntries([])
    } finally {
      setAuditLoading(false)
    }
  }

  async function testGeminiKey() {
    setTestingGemini(true)
    setGeminiTest(null)
    try {
      const result = await testGeminiConnection(store.settings.geminiApiKey)
      setGeminiTest(result)
      notify(result.ok ? 'Prueba de Gemini correcta.' : result.message, {
        icon: result.ok ? 'success' : 'error',
      })
    } catch (error: any) {
      const msg = `No se pudo probar Gemini: ${error?.message || 'error desconocido'}`
      setGeminiTest({ ok: false, message: msg })
      notify(msg, { icon: 'error' })
    } finally {
      setTestingGemini(false)
    }
  }

  return createPortal(
    <>
      <LunaModal
        title={t('settings')}
        width={400}
        visible={props.visible}
        onClose={props.onClose}
      >
        <LunaSetting className={Style.settings} onChange={onChange}>
          <LunaSettingTitle title={t('appearance')} />
          <LunaSettingSelect
            keyName="theme"
            value={store.settings.theme}
            title={t('theme')}
            options={{
              [t('sysPreference')]: 'system',
              [t('light')]: 'light',
              [t('dark')]: 'dark',
            }}
          />
          <LunaSettingSelect
            keyName="language"
            value={store.settings.language}
            title={t('language')}
            options={{
              [t('sysPreference')]: 'system',
              ['العربية']: 'ar',
              English: 'en-US',
              ['Français']: 'fr',
              ['Português']: 'pt',
              ['Español']: 'es',
              ['Русский']: 'ru',
              ['Türkçe']: 'tr',
              ['中文']: 'zh-CN',
              ['繁體中文']: 'zh-TW',
            }}
          />
          <LunaSettingCheckbox
            keyName="useNativeTitlebar"
            value={store.settings.useNativeTitlebar}
            description={t('useNativeTitlebar')}
          />
          <LunaSettingSeparator />
          <LunaSettingTitle title="ADB" />
          <SettingPath
            title={t('adbPath')}
            value={store.settings.adbPath}
            onChange={(val) => {
              notifyRequireReload()
              store.settings.set('adbPath', val)
            }}
            options={{
              properties: ['openFile'],
            }}
          />
          <LunaSettingCheckbox
            keyName="killAdbWhenExit"
            value={store.settings.killAdbWhenExit}
            description={t('killAdbWhenExit')}
          />
          <LunaSettingSeparator />
          <LunaSettingTitle title="Inteligencia Artificial" />
          <LunaSettingInput
            keyName="geminiApiKey"
            value={store.settings.geminiApiKey}
            title="Gemini API Key"
            description="Necesario para el Chat ADB (gemini-3.1-flash-lite)"
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 8 }}>
            <button
              type="button"
              className="luna-modal-button luna-modal-button-primary"
              disabled={testingGemini || !store.settings.geminiApiKey}
              onClick={testGeminiKey}
            >
              {testingGemini ? 'Probando...' : 'Probar Gemini'}
            </button>
            {geminiTest && (
              <span
                style={{
                  fontSize: 12,
                  color: geminiTest.ok ? '#52c41a' : '#f5222d',
                  wordBreak: 'break-word',
                }}
              >
                {geminiTest.message}
              </span>
            )}
          </div>
          <LunaSettingSeparator />
          <LunaSettingButton
            description="Auditoría interna (acceso avanzado)"
            onClick={openAuditLog}
          />
          <LunaSettingSeparator />
          <LunaSettingButton
            description={t('restartAya')}
            onClick={() => main.relaunch()}
          />
        </LunaSetting>
      </LunaModal>

      <LunaModal
        title="Log interno de auditoría"
        width={760}
        visible={auditVisible}
        onClose={() => setAuditVisible(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>
            Operaciones críticas, autorizaciones y eventos del chat IA con timestamps.
          </div>
          {auditLoading ? (
            <div style={{ padding: 16, color: 'var(--color-text-secondary)' }}>Cargando log...</div>
          ) : (
            <pre
              style={{
                maxHeight: 440,
                overflow: 'auto',
                margin: 0,
                background: 'rgba(0,0,0,0.18)',
                borderRadius: 8,
                padding: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 11,
                lineHeight: 1.5,
                color: 'var(--color-text-primary)',
              }}
            >
              {auditEntries.length > 0
                ? auditEntries
                    .map((entry) =>
                      JSON.stringify({
                        ts: entry.timestamp,
                        category: entry.category,
                        action: entry.action,
                        level: entry.level,
                        status: entry.status,
                        deviceId: entry.deviceId,
                        actor: entry.actor,
                        authorizedBy: entry.authorizedBy,
                        source: entry.source,
                        command: entry.command,
                        prompt: entry.prompt,
                        details: entry.details,
                      }, null, 2)
                    )
                    .join('\n---\n')
                : 'No hay registros en el log interno todavía.'}
            </pre>
          )}
        </div>
      </LunaModal>
    </>,
    document.body
  )
})
