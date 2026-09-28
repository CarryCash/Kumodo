import LunaToolbar, {
  LunaToolbarSelect,
  LunaToolbarSeparator,
} from 'luna-toolbar/react'
import types from 'licia/types'
import Style from './Device.module.scss'
import { observer } from 'mobx-react-lite'
import isEmpty from 'licia/isEmpty'
import store from '../../store'
import { t } from 'common/util'
import each from 'licia/each'
import ToolbarIcon from 'share/renderer/components/ToolbarIcon'
import { useState } from 'react'
import WirelessBridgeModal from './WirelessBridgeModal'
import ForensicModal from './ForensicModal'

export default observer(function Device() {
  const [wirelessModalVisible, setWirelessModalVisible] = useState(false)
  const [forensicModalVisible, setForensicModalVisible] = useState(false)

  let deviceOptions: types.PlainObj<string> = {}
  let deviceDisabled = false
  if (!isEmpty(store.devices)) {
    deviceOptions = {}
    each(store.devices, (device) => {
      deviceOptions[`${device.name} (${device.id})`] = device.id
    })
  } else {
    deviceOptions[t('deviceNotConnected')] = ''
    deviceDisabled = true
  }

  return (
    <>
      <LunaToolbar
        className={Style.container}
        onChange={(key, val) => {
          if (key === 'device') {
            store.selectDevice(val)
          }
        }}
      >
        <LunaToolbarSelect
          keyName="device"
          disabled={deviceDisabled}
          value={store.device ? store.device.id : ''}
          options={deviceOptions}
        />
        <ToolbarIcon
          icon="manage"
          title={t('deviceManager')}
          onClick={() => main.showDevices()}
        />
        <LunaToolbarSeparator />
        <ToolbarIcon
          icon="screencast"
          disabled={!store.device}
          title={t('screencast')}
          onClick={() => main.showScreencast()}
        />
        <ToolbarIcon
          icon="wifi"
          title="Puente de Red WiFi (Conexión sin cable)"
          onClick={() => setWirelessModalVisible(true)}
        />
        <ToolbarIcon
          icon="info"
          disabled={!store.device}
          title="🕵️ Modo Forense — Llamadas, SMS, Contactos, Apps residuales, Archivos borrados"
          onClick={() => setForensicModalVisible(true)}
        />
      </LunaToolbar>
      <WirelessBridgeModal
        visible={wirelessModalVisible}
        onClose={() => setWirelessModalVisible(false)}
      />
      <ForensicModal
        visible={forensicModalVisible}
        onClose={() => setForensicModalVisible(false)}
      />
    </>
  )
})
