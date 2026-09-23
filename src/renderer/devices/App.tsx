import { observer } from 'mobx-react-lite'
import DeviceManager from './components/DeviceManager'
import Toolbar from './components/Toolbar'
import Style from './App.module.scss'

export default observer(function App() {
  return (
    <>
      <Toolbar />
      <div className={Style.splitPane}>
        <DeviceManager />
      </div>
    </>
  )
})
