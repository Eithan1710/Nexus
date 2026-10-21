import { useSyncExternalStore } from 'react'
import { dismissToast } from './store'

// Global UI state for sheets that can be opened from any screen.
let ui = { capture: null, topicEditor: null }
const listeners = new Set()
const set = (patch) => {
  ui = { ...ui, ...patch }
  for (const l of listeners) l()
}

export function useUI() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => ui,
  )
}

// iOS only raises the keyboard when focus() runs inside the tap handler, so the capture
// field registers itself here and is focused before React re-renders.
let captureField = null
export function registerCaptureField(el) {
  captureField = el
}

function focusNow(el) {
  if (!el) return
  el.closest('[inert]')?.removeAttribute('inert')
  el.focus({ preventScroll: true })
}

export function openCapture(topicId = null) {
  focusNow(captureField)
  dismissToast()
  set({ capture: { topicId, at: Date.now() } })
}
export function closeCapture() {
  captureField?.blur()
  set({ capture: null })
}

let topicField = null
export function registerTopicField(el) {
  topicField = el
}
// mode: { topic } to edit, or { onCreated } to create
export function openTopicEditor(opts = {}) {
  focusNow(topicField)
  set({ topicEditor: { ...opts, at: Date.now() } })
}
export function closeTopicEditor() {
  topicField?.blur()
  set({ topicEditor: null })
}

// Focus an off-screen input inside a tap so iOS opens the keyboard; the next screen's real
// input then takes focus over while the keyboard stays up.
let proxy = null
export function focusKeyboardProxy() {
  if (!proxy) {
    proxy = document.createElement('input')
    proxy.setAttribute('aria-hidden', 'true')
    proxy.tabIndex = -1
    proxy.className = 'kb-proxy'
    document.body.appendChild(proxy)
  }
  proxy.focus({ preventScroll: true })
}
