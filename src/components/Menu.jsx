import { useEffect } from 'react'

// iOS-style action sheet: a list of actions plus a cancel button.
export default function Menu({ open, onClose, title, actions }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="menu-layer">
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="menu" role="menu" aria-label={title}>
        <div className="menu-group">
          {title && <div className="menu-title">{title}</div>}
          {actions.filter(Boolean).map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              className={'menu-item' + (a.danger ? ' danger' : '')}
              onClick={() => {
                onClose()
                a.run()
              }}
            >
              {a.icon && <a.icon size={20} />}
              <span>{a.label}</span>
            </button>
          ))}
        </div>
        <button type="button" className="menu-cancel" onClick={onClose}>
          ביטול
        </button>
      </div>
    </div>
  )
}

export function Confirm({ open, title, body, confirmLabel, onConfirm, onClose }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="dialog-layer">
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
        <div className="dialog-body">
          <h2 id="dlg-title">{title}</h2>
          {body && <p>{body}</p>}
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            ביטול
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              onClose()
              onConfirm()
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
