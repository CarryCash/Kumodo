import { observer } from 'mobx-react-lite'
import store from '../store'
import { useEffect, useRef, useState } from 'react'
import Style from './Screencast.module.scss'
import endWith from 'licia/endWith'
import className from 'licia/className'
import download from 'licia/download'
import dateFormat from 'licia/dateFormat'
import { LoadingBar } from 'share/renderer/components/loading'
import { installPackages } from '../../lib/util'
import { AndroidKeyCode } from '@yume-chan/scrcpy'

export default observer(function Screencast() {
  const { device, scrcpyClient, presentationMode, recording } = store
  const screenContainerRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showBar, setShowBar] = useState(true)
  const hideTimerRef = useRef<any>(null)

  useEffect(() => {
    preload.setTitle(device.name)

    async function start() {
      const video = await scrcpyClient.getVideo()
      video.stream.pipeTo(video.decoder.writable)
      screenContainerRef.current!.appendChild(video.decoder.renderer.element)
      setIsLoading(false)
    }
    start()

    return () => scrcpyClient.destroy()
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && store.presentationMode) {
        store.setPresentationMode(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function resetHideTimer() {
    setShowBar(true)
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
    }
    hideTimerRef.current = setTimeout(() => {
      setShowBar(false)
    }, 2500)
  }

  function inputKey(keyCode: AndroidKeyCode) {
    return () => main.inputKey(device.id, keyCode)
  }

  async function captureScreenshot() {
    const video = await scrcpyClient.getVideo()
    const blob = await video.decoder.snapshot()
    download(blob, `screenshot-${dateFormat('yyyymmddHHMMss')}.png`, 'image/png')
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault()

    const files = e.dataTransfer.files
    const apkPaths: string[] = []
    for (let i = 0, len = files.length; i < len; i++) {
      const path = preload.getPathForFile(files[i])
      if (!endWith(path, '.apk')) {
        continue
      }
      apkPaths.push(path)
    }
    await installPackages(device.id, apkPaths)
  }

  return (
    <div
      ref={screenContainerRef}
      className={className(Style.container, {
        [Style.presentationMode]: presentationMode,
      })}
      onMouseMove={presentationMode ? resetHideTimer : undefined}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {isLoading && <LoadingBar />}

      {presentationMode && (
        <div
          className={className(Style.presentationBar, {
            [Style.hidden]: !showBar,
          })}
        >
          <button
            className={Style.pillButton}
            onClick={() => store.setPresentationMode(false)}
            title="Salir de Modo Presentación (ESC)"
          >
            ✕ Salir
          </button>
          <div className={Style.pillSeparator} />

          <button
            className={Style.pillButton}
            onClick={captureScreenshot}
            title="Capturar pantalla"
          >
            <span className="icon-camera" /> Captura
          </button>

          <button
            className={className(Style.pillButton, {
              [Style.recordingActive]: recording,
            })}
            onClick={() => {
              if (recording) {
                store.stopRecording()
              } else {
                store.startRecording()
              }
            }}
            title={recording ? 'Detener grabación' : 'Grabar pantalla'}
          >
            {recording ? (
              <>
                <span className={Style.recordingDot} /> Grabando...
              </>
            ) : (
              <>
                <span className="icon-video-recorder" /> Grabar
              </>
            )}
          </button>

          <div className={Style.pillSeparator} />

          <button
            className={Style.pillButton}
            onClick={inputKey(AndroidKeyCode.AndroidBack)}
            title="Atrás (Keyevent)"
          >
            <span className="icon-back" />
          </button>

          <button
            className={Style.pillButton}
            onClick={inputKey(AndroidKeyCode.AndroidHome)}
            title="Inicio (Keyevent)"
          >
            <span className="icon-circle" />
          </button>

          <button
            className={Style.pillButton}
            onClick={inputKey(AndroidKeyCode.AndroidAppSwitch)}
            title="Recientes (Keyevent)"
          >
            <span className="icon-square" />
          </button>

          <div className={Style.pillSeparator} />

          <button
            className={Style.pillButton}
            onClick={inputKey(AndroidKeyCode.VolumeDown)}
            title="Bajar volumen"
          >
            <span className="icon-volume-down" />
          </button>

          <button
            className={Style.pillButton}
            onClick={inputKey(AndroidKeyCode.VolumeUp)}
            title="Subir volumen"
          >
            <span className="icon-volume" />
          </button>

          <button
            className={Style.pillButton}
            onClick={inputKey(AndroidKeyCode.Power)}
            title="Encender/Apagar pantalla"
          >
            <span className="icon-power" />
          </button>
        </div>
      )}
    </div>
  )
})

