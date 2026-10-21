import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Bottom sheet that stays mounted (so inputs inside can be focused synchronously from a tap,
// which iOS requires to raise the keyboard) and slides above the keyboard.
export default function Sheet({ open, onClose, children, label, className = '' }) {
  const ref = useRef(null)
  const [drag, setDrag] = useState(0)
  const start = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.documentElement.classList.add('sheet-open')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.documentElement.classList.remove('sheet-open')
    }
  }, [open, onClose])

  const onPointerDown = (e) => {
    start.current = e.clientY
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (start.current == null) return
    setDrag(Math.max(0, e.clientY - start.current))
  }
  const onPointerUp = () => {
    if (start.current == null) return
    start.current = null
    if (drag > 90) onClose()
    setDrag(0)
  }

  return createPortal(
    <div className={'sheet-layer' + (open ? ' open' : '')} aria-hidden={!open}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        ref={ref}
        className={'sheet ' + className}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
        inert={!open}
      >
        <div className="sheet-grab" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <span />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
