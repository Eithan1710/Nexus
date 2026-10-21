import { useSyncExternalStore } from 'react'

// Hash router (GitHub Pages has no server rewrites). Routes:
//   #/                home
//   #/t/:id           topic
//   #/i/:id           item
//   #/search          global search
//   #/topics          all topics / manage
//   #/settings        settings
//   #/reminders       reminders (#/reminders/new/:topicId starts one for a topic)
//   #/r/:id           a reminder (opened from its notification)

function parse(hash) {
  const path = (hash || '').replace(/^#/, '') || '/'
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 't' && parts[1]) return { name: 'topic', id: parts[1], path }
  if (parts[0] === 'i' && parts[1]) return { name: 'item', id: parts[1], path, isNew: parts[2] === 'new', edit: parts[2] === 'edit' }
  if (parts[0] === 'search') return { name: 'search', path }
  if (parts[0] === 'topics') return { name: 'topics', path }
  if (parts[0] === 'settings') return { name: 'settings', path }
  if (parts[0] === 'reminders') return { name: 'reminders', path, topicId: parts[1] === 'new' ? parts[2] || null : null }
  if (parts[0] === 'r' && parts[1]) return { name: 'reminders', path, reminderId: parts[1] }
  return { name: 'home', path: '/' }
}

let route = parse(location.hash)
let direction = 'none' // push | pop | none
const listeners = new Set()
const scrollPositions = new Map()

// Track how deep we are in in-app history so "back" never leaves the app.
let depth = Number(sessionStorage.getItem('nx-depth') || 0)
let pendingPush = false

window.addEventListener('hashchange', () => {
  scrollPositions.set(route.path, window.scrollY)
  const next = parse(location.hash)
  if (pendingPush) {
    direction = 'push'
    depth++
  } else {
    direction = 'pop'
    depth = Math.max(0, depth - 1)
  }
  pendingPush = false
  sessionStorage.setItem('nx-depth', String(depth))
  route = next
  for (const l of listeners) l()
})

export function useRoute() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => route,
  )
}

export function getDirection() {
  return direction
}

export function savedScroll(path) {
  return scrollPositions.get(path) ?? 0
}

export function navigate(path, { replace = false } = {}) {
  if ('#' + path === location.hash || (path === '/' && !location.hash)) return
  if (replace) {
    scrollPositions.set(route.path, window.scrollY)
    history.replaceState(null, '', '#' + path)
    route = parse('#' + path)
    direction = 'none'
    for (const l of listeners) l()
    return
  }
  pendingPush = true
  location.hash = path
}

// Back within the app, or to a sensible parent when the app was opened on a deep link.
export function goBack(fallback = '/') {
  if (depth > 0) history.back()
  else navigate(fallback, { replace: true })
}
