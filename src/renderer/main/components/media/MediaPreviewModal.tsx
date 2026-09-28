import LunaModal from 'luna-modal/react'
import { observer } from 'mobx-react-lite'
import { createPortal } from 'react-dom'
import { IMediaFile } from 'common/types'
import Style from './MediaPreviewModal.module.scss'
import fileSize from 'licia/fileSize'
import dateFormat from 'licia/dateFormat'

interface IProps {
  visible: boolean
  file: IMediaFile | null
  url: string
  onClose: () => void
  onDownload: (file: IMediaFile) => void
  onDelete: (file: IMediaFile) => void
}

export default observer(function MediaPreviewModal(props: IProps) {
  const { visible, file, url, onClose, onDownload, onDelete } = props

  if (!file) return null

  return createPortal(
    <LunaModal
      title={file.name}
      width={720}
      visible={visible}
      onClose={onClose}
    >
      <div className={Style.modalBody}>
        <div className={Style.previewContainer}>
          {file.type === 'video' ? (
            <video
              className={Style.videoPreview}
              src={url}
              controls
              autoPlay
            />
          ) : (
            <img className={Style.imagePreview} src={url} alt={file.name} />
          )}
        </div>

        <div className={Style.details}>
          <div className={Style.detailRow}>
            <span className={Style.detailLabel}>Tipo:</span>
            <span className={Style.detailValue}>
              {file.type === 'video' ? '🎬 Video' : '🖼️ Imagen'} ({file.extension.toUpperCase()})
            </span>
          </div>

          <div className={Style.detailRow}>
            <span className={Style.detailLabel}>Tamaño:</span>
            <span className={Style.detailValue}>{fileSize(file.size)}</span>
          </div>

          <div className={Style.detailRow}>
            <span className={Style.detailLabel}>Fecha de modificación:</span>
            <span className={Style.detailValue}>
              {dateFormat(new Date(file.mtime), 'yyyy-mm-dd HH:MM:ss')}
            </span>
          </div>

          <div className={Style.detailRow}>
            <span className={Style.detailLabel}>Checksum MD5:</span>
            <span className={Style.detailValue}>
              {file.hash ? <code>{file.hash}</code> : 'No calculado'}
            </span>
          </div>

          <div className={`${Style.detailRow} ${Style.fullWidth}`}>
            <span className={Style.detailLabel}>Ruta en dispositivo:</span>
            <span className={Style.detailValue}>{file.path}</span>
          </div>
        </div>

        <div className={Style.actions}>
          <button
            className="luna-modal-button"
            onClick={() => onDownload(file)}
          >
            📥 Descargar
          </button>
          <button
            className="luna-modal-button luna-modal-button-danger"
            style={{ color: '#ef4444' }}
            onClick={() => onDelete(file)}
          >
            🗑️ Eliminar
          </button>
          <button
            className="luna-modal-button luna-modal-button-primary"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
    </LunaModal>,
    document.body
  )
})
