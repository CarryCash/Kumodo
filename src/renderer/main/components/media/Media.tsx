import { observer } from 'mobx-react-lite'
import { useEffect, useState, useMemo } from 'react'
import store from '../../store'
import { IMediaFile } from 'common/types'
import Style from './Media.module.scss'
import MediaPreviewModal from './MediaPreviewModal'
import { PannelLoading } from '../common/loading'
import { notify } from 'share/renderer/lib/util'
import fileSize from 'licia/fileSize'
import dateFormat from 'licia/dateFormat'
import className from 'licia/className'

export default observer(function Media() {
  const { device } = store

  const [files, setFiles] = useState<IMediaFile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all')
  const [filterDate, setFilterDate] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [duplicatesMap, setDuplicatesMap] = useState<Record<string, string[]>>({})
  const [isDetectingDuplicates, setIsDetectingDuplicates] = useState(false)
  const [duplicatesOnly, setDuplicatesOnly] = useState(false)
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({})

  // Download state
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 })

  // Preview state
  const [previewFile, setPreviewFile] = useState<IMediaFile | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')

  useEffect(() => {
    if (device) {
      loadMedia()
    }
  }, [device ? device.id : null])

  async function loadMedia() {
    if (!device) return
    setIsLoading(true)
    setSelectedPaths(new Set())
    setDuplicatesMap({})
    setDuplicatesOnly(false)
    try {
      const mediaList = await main.getMediaFiles(device.id)
      setFiles(mediaList)

      // Preload URLs for initial batch
      const urls: Record<string, string> = {}
      for (const item of mediaList.slice(0, 30)) {
        try {
          urls[item.path] = await main.getFileUrl(device.id, item.path)
        } catch {}
      }
      setFileUrls(urls)
    } catch (err: any) {
      notify('Error al cargar multimedia del dispositivo', { icon: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  // Load URL on demand when card renders
  async function ensureUrl(filePath: string) {
    if (fileUrls[filePath] || !device) return
    try {
      const url = await main.getFileUrl(device.id, filePath)
      setFileUrls((prev) => ({ ...prev, [filePath]: url }))
    } catch {}
  }

  // Extract unique available months/years for filter
  const dateOptions = useMemo(() => {
    const dates = new Set<string>()
    for (const f of files) {
      const d = dateFormat(new Date(f.mtime), 'yyyy-mm')
      dates.add(d)
    }
    return Array.from(dates).sort().reverse()
  }, [files])

  // Detect duplicates via md5sum
  async function handleDetectDuplicates() {
    if (!device || files.length === 0 || isDetectingDuplicates) return
    setIsDetectingDuplicates(true)
    try {
      notify('Calculando checksums MD5 en el dispositivo...', { icon: 'info' })
      const paths = files.map((f) => f.path)
      const dupes = await main.detectMediaDuplicates(device.id, paths)
      setDuplicatesMap(dupes)

      const duplicateCount = Object.values(dupes).reduce(
        (acc, list) => acc + list.length,
        0
      )
      if (duplicateCount > 0) {
        notify(
          `¡Se encontraron ${duplicateCount} archivos duplicados en ${Object.keys(dupes).length} grupos!`,
          { icon: 'success' }
        )
        setDuplicatesOnly(true)
      } else {
        notify('No se encontraron fotos o videos duplicados', { icon: 'success' })
      }
    } catch (err: any) {
      notify('Error al detectar duplicados', { icon: 'error' })
    } finally {
      setIsDetectingDuplicates(false)
    }
  }

  // Check if a file is duplicate
  const duplicatePathSet = useMemo(() => {
    const set = new Set<string>()
    for (const paths of Object.values(duplicatesMap)) {
      for (const p of paths) {
        set.add(p)
      }
    }
    return set
  }, [duplicatesMap])

  // Filtered files
  const filteredFiles = useMemo(() => {
    return files.filter((f) => {
      if (filterType !== 'all' && f.type !== filterType) return false
      if (filterDate !== 'all') {
        const d = dateFormat(new Date(f.mtime), 'yyyy-mm')
        if (d !== filterDate) return false
      }
      if (search && !f.name.toLowerCase().includes(search.toLowerCase())) {
        return false
      }
      if (duplicatesOnly && !duplicatePathSet.has(f.path)) {
        return false
      }
      return true
    })
  }, [files, filterType, filterDate, search, duplicatesOnly, duplicatePathSet])

  // Multi-select handlers
  function toggleSelect(path: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation()
    const next = new Set(selectedPaths)
    if (next.has(path)) {
      next.delete(path)
    } else {
      next.add(path)
    }
    setSelectedPaths(next)
  }

  function toggleSelectAll() {
    if (selectedPaths.size === filteredFiles.length && filteredFiles.length > 0) {
      setSelectedPaths(new Set())
    } else {
      setSelectedPaths(new Set(filteredFiles.map((f) => f.path)))
    }
  }

  // Batch download
  async function handleBatchDownload() {
    if (!device || selectedPaths.size === 0 || isDownloading) return
    const targetFolder = await main.pickFolder()
    if (!targetFolder) return

    setIsDownloading(true)
    const pathsToPull = Array.from(selectedPaths)
    setDownloadProgress({ current: 0, total: pathsToPull.length })

    try {
      const result = await main.pullMediaFiles(device.id, pathsToPull, targetFolder)
      notify(
        `Descarga finalizada: ${result.success} descargados con éxito (${result.failed} fallidos)`,
        { icon: result.failed > 0 ? 'error' : 'success' }
      )
    } catch (err: any) {
      notify('Error en la descarga masiva', { icon: 'error' })
    } finally {
      setIsDownloading(false)
    }
  }

  // Single download
  async function handleSingleDownload(file: IMediaFile) {
    if (!device) return
    const targetFolder = await main.pickFolder()
    if (!targetFolder) return
    try {
      const res = await main.pullMediaFiles(device.id, [file.path], targetFolder)
      if (res.success > 0) {
        notify(`Guardado en ${targetFolder}`, { icon: 'success' })
      }
    } catch {
      notify('Error al descargar el archivo', { icon: 'error' })
    }
  }

  // Delete files
  async function handleDeleteFiles(pathsToDelete: string[]) {
    if (!device || pathsToDelete.length === 0) return
    const confirm = window.confirm(
      `¿Estás seguro de que deseas eliminar ${pathsToDelete.length} archivo(s) del dispositivo? Esta acción no se puede deshacer.`
    )
    if (!confirm) return

    try {
      const ok = await main.deleteMediaFiles(device.id, pathsToDelete)
      if (ok) {
        notify('Archivos eliminados del dispositivo', { icon: 'success' })
        setFiles((prev) => prev.filter((f) => !pathsToDelete.includes(f.path)))
        setSelectedPaths(new Set())
        if (previewFile && pathsToDelete.includes(previewFile.path)) {
          setPreviewFile(null)
        }
      }
    } catch {
      notify('Error al eliminar archivos', { icon: 'error' })
    }
  }

  // Open Preview Modal
  async function openPreview(file: IMediaFile) {
    if (!device) return
    let url = fileUrls[file.path]
    if (!url) {
      try {
        url = await main.getFileUrl(device.id, file.path)
        setFileUrls((prev) => ({ ...prev, [file.path]: url }))
      } catch {}
    }
    setPreviewUrl(url || '')
    setPreviewFile(file)
  }

  if (!device) {
    return (
      <div className={Style.emptyState}>
        <span className="icon-phone" />
        <p>Conecta un dispositivo para explorar fotos y videos</p>
      </div>
    )
  }

  if (isLoading) {
    return <PannelLoading />
  }

  const allSelected =
    filteredFiles.length > 0 && selectedPaths.size === filteredFiles.length
  const totalSelectedSize = files
    .filter((f) => selectedPaths.has(f.path))
    .reduce((sum, f) => sum + f.size, 0)

  return (
    <div className={Style.container}>
      {/* Top Bar Controls */}
      <div className={Style.topBar}>
        <div className={Style.leftControls}>
          <button
            className={Style.btn}
            onClick={loadMedia}
            title="Recargar archivos multimedia"
          >
            <span className="icon-refresh" /> Actualizar
          </button>

          <select
            className={Style.filterSelect}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
          >
            <option value="all">Todos los formatos</option>
            <option value="image">🖼️ Fotos</option>
            <option value="video">🎬 Videos</option>
          </select>

          <select
            className={Style.filterSelect}
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          >
            <option value="all">Todas las fechas</option>
            {dateOptions.map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>

          <input
            className={Style.searchInput}
            type="text"
            placeholder="Buscar por nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className={Style.rightControls}>
          <button
            className={className(Style.btn, Style.warning)}
            onClick={handleDetectDuplicates}
            disabled={isDetectingDuplicates || files.length === 0}
            title="Calcular checksums MD5 y encontrar fotos/videos idénticos"
          >
            {isDetectingDuplicates ? (
              'Analizando MD5...'
            ) : (
              <>
                <span className="icon-copy" /> Buscar Duplicados
              </>
            )}
          </button>

          {Object.keys(duplicatesMap).length > 0 && (
            <button
              className={className(Style.btn, {
                [Style.primary]: duplicatesOnly,
              })}
              onClick={() => setDuplicatesOnly(!duplicatesOnly)}
            >
              {duplicatesOnly ? 'Ver Todos' : 'Ver Solo Duplicados'}
            </button>
          )}

          <button
            className={className(Style.btn, Style.primary)}
            disabled={selectedPaths.size === 0 || isDownloading}
            onClick={handleBatchDownload}
            title="Descargar archivos seleccionados a la computadora"
          >
            📥 Descargar ({selectedPaths.size})
          </button>

          {selectedPaths.size > 0 && (
            <button
              className={className(Style.btn, Style.danger)}
              onClick={() => handleDeleteFiles(Array.from(selectedPaths))}
              title="Eliminar archivos seleccionados del teléfono"
            >
              🗑️ Eliminar ({selectedPaths.size})
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar during Batch Download */}
      {isDownloading && (
        <div className={Style.progressContainer}>
          <span>
            Descargando archivos multimedia a tu carpeta seleccionada...
          </span>
          <div className={Style.progressBar}>
            <div className={Style.progressFill} style={{ width: '100%' }} />
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <div className={Style.statsBar}>
        <label className={Style.selectAllLabel}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
          />
          <span>Seleccionar todo</span>
        </label>

        <div>
          Mostrando {filteredFiles.length} de {files.length} archivos
          {selectedPaths.size > 0 && (
            <>
              {' • '}
              <strong>{selectedPaths.size} seleccionados</strong> (
              {fileSize(totalSelectedSize)})
            </>
          )}
        </div>
      </div>

      {/* Media Grid */}
      <div className={Style.gridContent}>
        {filteredFiles.length === 0 ? (
          <div className={Style.emptyState}>
            <span className="icon-camera" />
            <p>No se encontraron fotos o videos con los filtros actuales</p>
          </div>
        ) : (
          <div className={Style.mediaGrid}>
            {filteredFiles.map((file) => {
              const isSelected = selectedPaths.has(file.path)
              const isDup = duplicatePathSet.has(file.path)
              const url = fileUrls[file.path]

              // Ensure thumbnail URL
              if (!url) {
                ensureUrl(file.path)
              }

              return (
                <div
                  key={file.path}
                  className={className(Style.card, {
                    [Style.selected]: isSelected,
                    [Style.isDuplicate]: isDup,
                  })}
                  onClick={() => openPreview(file)}
                >
                  <input
                    type="checkbox"
                    className={Style.checkbox}
                    checked={isSelected}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelect(file.path)}
                  />

                  <div className={Style.badges}>
                    {isDup && (
                      <span className={Style.duplicateBadge}>Duplicado</span>
                    )}
                    {file.type === 'video' && (
                      <span className={Style.videoBadge}>
                        ▶ {file.extension.toUpperCase()}
                      </span>
                    )}
                  </div>

                  {file.type === 'video' ? (
                    url ? (
                      <video
                        className={Style.thumbnail}
                        src={url}
                        preload="metadata"
                      />
                    ) : (
                      <div className={Style.videoFallback}>🎬</div>
                    )
                  ) : url ? (
                    <img
                      className={Style.thumbnail}
                      src={url}
                      alt={file.name}
                      loading="lazy"
                    />
                  ) : (
                    <div className={Style.videoFallback}>🖼️</div>
                  )}

                  <div className={Style.overlay}>
                    <span className={Style.fileName} title={file.name}>
                      {file.name}
                    </span>
                    <div className={Style.fileMeta}>
                      <span>{fileSize(file.size)}</span>
                      <span>{dateFormat(new Date(file.mtime), 'dd/mm/yy')}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <MediaPreviewModal
        visible={!!previewFile}
        file={previewFile}
        url={previewUrl}
        onClose={() => setPreviewFile(null)}
        onDownload={handleSingleDownload}
        onDelete={(f) => handleDeleteFiles([f.path])}
      />
    </div>
  )
})
