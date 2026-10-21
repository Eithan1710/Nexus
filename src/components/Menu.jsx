import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'

const GAP = 6
const EDGE = 8

// Contextual menu anchored to the button that opened it. Rendered into <body> so it is
// positioned against the viewport, then flipped/clamped so it never leaves the screen.
// `anchor` is the opener's DOMRect (null = closed).
export default function Menu({ anchor, onClose, title, actions }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return setPos(null)
    const el = ref.current
    const vw = window.visualViewport?.width || window.innerWidth
    const vh = window.visualViewport?.height || window.innerHeight
    const w = el.offsetWidth
    const h = el.offsetHeight
    // RTL: line the menu up with the opener's right edge, otherwise its left edge.
    let left = anchor.right - w
    if (left < EDGE) left = anchor.left
    left = Math.max(EDGE, Math.min(left, vw - w - EDGE))
    let top = anchor.bottom + GAP
    let origin = 'top'
    if (top + h > vh - EDGE) {
      top = anchor.top - h - GAP
      origin = 'bottom'
    }
    if (top < EDGE) {
      top = Math.max(EDGE, vh - h - EDGE)
      origin = 'center'
    }
    setPos({ left, top, origin })
  }, [anchor])

  useEffect(() => {
    if (!anchor) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    const onScroll = () => onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, { passive: true })
    ref.current?.querySelector('button')?.focus({ preventScroll: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll)
    }
  }, [anchor, onClose])

  if (!anchor) return null
  return createPortal(
    <div className="popover-layer">
      <div className="popover-backdrop" onPointerDown={(e) => { e.preventDefault(); onClose() }} />
      <div
        ref={ref}
        className={'popover' + (pos ? ' shown from-' + pos.origin : '')}
        role="menu"
        aria-label={title}
        style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
      >
        {title && <div className="popover-title">{title}</div>}
        {actions.filter(Boolean).map((a) =>
          a.divider ? (
            <div key={a.key} className="popover-sep" role="separator" />
          ) : (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              className={'popover-item' + (a.danger ? ' danger' : '')}
              onClick={(e) => {
                e.stopPropagation()
                onClose()
                a.run()
              }}
            >
              {a.icon ? <a.icon size={18} /> : <span className="popover-icon-space" />}
              <span>{a.label}</span>
              {a.checked && <Check size={16} className="popover-check" />}
            </button>
          ),
        )}
      </div>
    </div>,
    document.body,
  )
}

// Opens a Menu from a click on any element.
export function anchorOf(e) {
  e.stopPropagation()
  e.preventDefault()
  return e.currentTarget.getBoundingClientRect()
}

export function Confirm({ open, title, body, confirmLabel, onConfirm, onClose }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="dialog-layer">
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
        <div className="dialog-body">
          <h2 id="dlg-title">{title}</h2>
          {body && <p>{body}</p>}
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onClose} autoFocus>
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
    </div>,
    document.body,
  )
}
