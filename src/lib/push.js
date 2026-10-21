import { useEffect, useSyncExternalStore } from 'react'
import { supabase, SUPABASE_URL, SUPABASE_KEY } from '../supabase'

// Web Push on this device. The state shown to the user is only 'on' after the browser has a
// live subscription, permission is granted, and the server confirms it has that subscription.
//
// states: checking | unsupported | needs-install | off | denied | on | unverified | error

export const PUSH_FN = `${SUPABASE_URL}/functions/v1/nx-reminders`

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
export const isIOS = /iP(hone|od|ad)/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)
export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)
const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

let state = { status: 'checking', devices: 0, error: null, busy: false }
const listeners = new Set()
function set(patch) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}
export function usePush() {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
  useEffect(() => {
    if (state.status === 'checking' || Date.now() - lastCheck > 30e3) checkPush()
  }, [])
  return s
}

async function registration() {
  if (!navigator.serviceWorker.controller && !(await navigator.serviceWorker.getRegistration())) return null
  return Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 5000))])
}

function b64ToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}
function bytesToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

let vapidKey = null
async function getVapidKey() {
  if (vapidKey) return vapidKey
  const res = await fetch(`${PUSH_FN}?vapid-public-key`, { headers: { apikey: SUPABASE_KEY } })
  if (!res.ok) throw new Error('vapid ' + res.status)
  vapidKey = (await res.json()).publicKey
  return vapidKey
}

async function saveSubscription(sub) {
  const j = sub.toJSON()
  const { data, error } = await supabase.rpc('nx_save_push_subscription', {
    p_endpoint: j.endpoint,
    p_p256dh: j.keys.p256dh,
    p_auth: j.keys.auth,
    p_user_agent: ua.slice(0, 400),
  })
  if (error) throw error
  return data
}

let lastCheck = 0
let checking = null
export function checkPush() {
  if (checking) return checking
  checking = (async () => {
    lastCheck = Date.now()
    try {
      if (!supported()) return set({ status: isIOS && !isStandalone() ? 'needs-install' : 'unsupported', error: null })
      if (Notification.permission === 'denied') return set({ status: 'denied', error: null })
      const reg = await registration()
      if (!reg) return set({ status: 'unsupported', error: 'sw' })
      const sub = await reg.pushManager.getSubscription()
      if (Notification.permission !== 'granted' || !sub) return set({ status: 'off', error: null })
      // The browser has a subscription; make sure the server has the same one (and refresh it,
      // since browsers can rotate endpoints).
      try {
        const key = await getVapidKey()
        const current = sub.options?.applicationServerKey
        if (current && bytesToB64(current) !== key) {
          await sub.unsubscribe()
          return set({ status: 'off', error: null })
        }
        const st = await saveSubscription(sub)
        set({ status: st?.registered ? 'on' : 'error', devices: st?.devices || 0, error: st?.registered ? null : 'not-registered' })
      } catch (e) {
        console.warn('push verify failed', e)
        set({ status: navigator.onLine ? 'error' : 'unverified', error: navigator.onLine ? 'server' : 'offline' })
      }
    } finally {
      checking = null
    }
  })()
  return checking
}

// Must be called from a tap: iOS only shows the permission prompt for a user gesture.
export async function enablePush() {
  if (!supported()) return checkPush()
  set({ busy: true, error: null })
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      set({ status: permission === 'denied' ? 'denied' : 'off' })
      return false
    }
    const reg = await registration()
    if (!reg) throw new Error('sw')
    const key = await getVapidKey()
    let sub = await reg.pushManager.getSubscription()
    if (sub && sub.options?.applicationServerKey && bytesToB64(sub.options.applicationServerKey) !== key) {
      await sub.unsubscribe()
      sub = null
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) })
    const st = await saveSubscription(sub)
    if (!st?.registered) throw new Error('not-registered')
    set({ status: 'on', devices: st.devices, error: null })
    return true
  } catch (e) {
    console.warn('enable push failed', e)
    set({ status: 'error', error: String(e?.message || e) })
    return false
  } finally {
    set({ busy: false })
  }
}

export async function disablePush() {
  set({ busy: true })
  try {
    const reg = await registration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      await supabase.rpc('nx_delete_push_subscription', { p_endpoint: sub.endpoint }).catch(() => {})
      await sub.unsubscribe()
    }
    set({ status: 'off', error: null })
  } finally {
    set({ busy: false })
  }
}

// Asks the server to push a test notification to this device. Returns { sent, devices }.
export async function sendTestPush() {
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  const { data } = await supabase.auth.getSession()
  const res = await fetch(PUSH_FN, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: SUPABASE_KEY, authorization: `Bearer ${data.session?.access_token}` },
    body: JSON.stringify({ action: 'test', endpoint: sub?.endpoint }),
  })
  if (!res.ok) throw new Error('test ' + res.status)
  return res.json()
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.status !== 'checking' && Date.now() - lastCheck > 60e3) checkPush()
  })
}
