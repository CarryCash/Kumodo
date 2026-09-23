import LunaTab, { LunaTabItem } from 'luna-tab/react'
import { observer } from 'mobx-react-lite'
import map from 'licia/map'
import { t } from 'common/util'
import Style from './Tabs.module.scss'
import store from '../../store'

const PANELS: Array<{ id: string; label?: string }> = [
  { id: 'overview' },
  { id: 'file' },
  { id: 'media', label: 'Multimedia' },
  { id: 'application' },
  { id: 'process' },
  { id: 'performance' },
  { id: 'shell' },
  { id: 'layout' },
  { id: 'screenshot' },
  { id: 'logcat' },
  { id: 'webview' },
]

export default observer(function Panels() {
  const tabItems = map(PANELS, ({ id, label }) => {
    return (
      <LunaTabItem
        key={id}
        id={id}
        title={label || t(id)}
        selected={id === store.panel}
      />
    )
  })

  return (
    <LunaTab
      className={Style.container}
      height={31}
      onSelect={(panel) => store.selectPanel(panel)}
    >
      {tabItems}
    </LunaTab>
  )
})
