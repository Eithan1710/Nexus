import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { uuid } from './lib/format'

// Local-first data layer. Every change is applied to memory and the on-device cache at once,
// then queued in a persisted outbox that is sent to Supabase in order. Nothing the user typed
// lives only in component state, and a failed send is retried rather than dropped.

const DEFAULT_PREFS = { theme: 'system', topicOrder: 'recent' }

let state = {
  authReady: false,
  userId: null,
  email: null,
  status: 'idle', // idle | loading | ready
  topics: [],
  items: [],
  reminders: [],
  pending: 0,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncError: null,
  prefs: loadLocalPrefs(),
  toast: null,
}

const listeners = new Set()
function emit() {
  for (const l of listeners) l()
}
function set(patch) {
  state = { ...state, ...patch }
  emit()
}
export function getState() {
  return state
}
export function useStore() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

// ---------- persistence ----------

function loadLocalPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem('nx-prefs') || '{}') }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

const cacheKey = () => `nx-cache-${state.userId}`
const outboxKey = () => `nx-outbox-${state.userId}`
let outbox = []
let inflight = null
let saveTimer = null

function persistSoon() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(persistNow, 250)
}
function persistNow() {
  clearTimeout(saveTimer)
  if (!state.userId) return
  try {
    localStorage.setItem(cacheKey(), JSON.stringify({ topics: state.topics, items: state.items, reminders: state.reminders }))
  } catch (e) {
    console.warn('cache write failed', e)
  }
}
function persistOutbox() {
  if (!state.userId) return
  try {
    localStorage.setItem(outboxKey(), JSON.stringify(outbox))
  } catch (e) {
    console.warn('outbox write failed', e)
  }
  set({ pending: outbox.length })
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', persistNow)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistNow()
    else if (state.userId) {
      flush()
      refresh()
    }
  })
  window.addEventListener('online', () => {
    set({ online: true })
    flush()
    refresh()
  })
  window.addEventListener('offline', () => set({ online: false }))
}

// ---------- session ----------

export async function initAuth() {
  const { data } = await supabase.auth.getSession()
  if (data.session) startSession(data.session)
  set({ authReady: true })
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') endSession()
    else if (session && session.user.id !== state.userId) startSession(session)
  })
}

function startSession(session) {
  const userId = session.user.id
  let cached = null
  try {
    cached = JSON.parse(localStorage.getItem(`nx-cache-${userId}`) || 'null')
    outbox = JSON.parse(localStorage.getItem(`nx-outbox-${userId}`) || '[]')
  } catch {
    outbox = []
  }
  const remotePrefs = session.user.user_metadata?.nx_prefs
  const prefs = remotePrefs ? { ...state.prefs, ...remotePrefs } : state.prefs
  saveLocalPrefs(prefs)
  set({
    userId,
    email: session.user.user_metadata?.username || session.user.email,
    prefs,
    topics: cached?.topics || [],
    items: cached?.items || [],
    reminders: cached?.reminders || [],
    status: cached ? 'ready' : 'loading',
    pending: outbox.length,
  })
  refresh()
  flush()
}

function endSession() {
  persistNow()
  outbox = []
  set({ userId: null, email: null, topics: [], items: [], reminders: [], status: 'idle', pending: 0 })
}

export async function signOut() {
  if (outbox.length && !confirm('יש שינויים שעדיין לא סונכרנו. להתנתק בכל זאת? השינויים יישמרו במכשיר הזה.')) return
  await supabase.auth.signOut()
}

// ---------- prefs ----------

function saveLocalPrefs(prefs) {
  try {
    localStorage.setItem('nx-prefs', JSON.stringify(prefs))
  } catch {}
}

export function setPref(key, value) {
  const prefs = { ...state.prefs, [key]: value }
  set({ prefs })
  saveLocalPrefs(prefs)
  if (state.userId) supabase.auth.updateUser({ data: { nx_prefs: prefs } }).catch(() => {})
}

// ---------- toast ----------

let toastTimer = null
export function toast(text, action = null, ms = 3200) {
  clearTimeout(toastTimer)
  const t = { id: Math.random(), text, action }
  set({ toast: t })
  toastTimer = setTimeout(() => {
    if (state.toast?.id === t.id) set({ toast: null })
  }, ms)
}
export function dismissToast() {
  set({ toast: null })
}

// ---------- remote sync ----------

async function fetchAll(table) {
  const all = []
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + size - 1)
    if (error) throw error
    all.push(...data)
    if (data.length < size) break
  }
  return all
}

let refreshing = null
export function refresh() {
  if (!state.userId) return Promise.resolve()
  if (refreshing) return refreshing
  const userId = state.userId
  refreshing = (async () => {
    try {
      const [topics, items, reminders] = await Promise.all([fetchAll('nx_topics'), fetchAll('nx_items'), fetchAll('nx_reminders').catch(() => null)])
      if (state.userId !== userId) return
      set({
        topics: mergeRows(state.topics, topics, 'topic'),
        items: mergeRows(state.items, items, 'item'),
        ...(reminders && { reminders: mergeRows(state.reminders, reminders, 'reminder') }),
        status: 'ready',
        syncError: null,
      })
      persistSoon()
    } catch (e) {
      console.warn('refresh failed', e)
      if (state.status === 'loading' && !navigator.onLine) set({ status: 'ready' })
      set({ syncError: navigator.onLine ? 'refresh' : null })
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

// Server rows win, except rows with unsent local changes, which keep their local state.
function mergeRows(local, server, kind) {
  const pending = new Map()
  for (const op of outbox) if (op.t === kind) pending.set(op.id, op.op)
  if (inflight?.t === kind) pending.set(inflight.id, inflight.op)
  const localById = new Map(local.map((r) => [r.id, r]))
  const out = []
  const seen = new Set()
  for (const row of server) {
    seen.add(row.id)
    const p = pending.get(row.id)
    if (p === 'delete') continue
    if (p && localById.has(row.id)) out.push(localById.get(row.id))
    else out.push(row)
  }
  for (const row of local) if (!seen.has(row.id) && pending.get(row.id) === 'insert') out.push(row)
  return out
}

function enqueue(op) {
  const tail = outbox[outbox.length - 1]
  if (tail && tail !== inflight && tail.t === op.t && tail.id === op.id && !tail.notBefore) {
    if (op.op === 'update' && (tail.op === 'insert' || tail.op === 'update')) {
      tail.patch = { ...tail.patch, ...op.patch }
      persistOutbox()
      scheduleFlush(op.op === 'update' && 'content' in op.patch ? 700 : 0)
      return
    }
    if (op.op === 'delete' && !op.notBefore && tail.op === 'insert') {
      outbox.pop()
      persistOutbox()
      return
    }
  }
  outbox.push(op)
  persistOutbox()
  scheduleFlush(op.notBefore ? op.notBefore - Date.now() + 50 : op.op === 'update' && 'content' in (op.patch || {}) ? 700 : 0)
}

let flushTimer = null
function scheduleFlush(ms) {
  clearTimeout(flushTimer)
  flushTimer = setTimeout(flush, Math.max(0, ms))
}

let flushing = false
let retryDelay = 2000
export async function flush() {
  if (flushing || !state.userId) return
  flushing = true
  let nextWake = null
  try {
    let i = 0
    while (i < outbox.length) {
      const op = outbox[i]
      if (op.notBefore && op.notBefore > Date.now()) {
        nextWake = Math.min(nextWake ?? Infinity, op.notBefore - Date.now() + 50)
        i++
        continue
      }
      inflight = op
      const result = await send(op)
      inflight = null
      if (result === 'retry') {
        nextWake = retryDelay
        retryDelay = Math.min(retryDelay * 2, 60000)
        set({ syncError: navigator.onLine ? 'send' : null })
        break
      }
      retryDelay = 2000
      const idx = outbox.indexOf(op)
      if (idx >= 0) outbox.splice(idx, 1)
      persistOutbox()
      if (state.syncError) set({ syncError: null })
    }
  } finally {
    inflight = null
    flushing = false
    persistNow()
  }
  if (nextWake != null) scheduleFlush(nextWake)
}

function isRetryable(error, status) {
  if (!navigator.onLine) return true
  if (!status || status >= 500 || status === 408 || status === 429 || status === 401) return true
  const msg = String(error?.message || '')
  return /fetch|network|timeout|load failed/i.test(msg)
}

async function send(op) {
  try {
    if (op.t === 'topic') return await sendTopic(op)
    if (op.t === 'reminder') return await sendReminder(op)
    return await sendItem(op)
  } catch (e) {
    console.warn('send failed', e)
    return 'retry'
  }
}

async function sendTopic(op) {
  const q = supabase.from('nx_topics')
  let res
  if (op.op === 'insert') res = await q.upsert(op.patch)
  else if (op.op === 'update') res = await q.update(op.patch).eq('id', op.id)
  else res = await q.delete().eq('id', op.id)
  if (res.error) {
    if (res.status === 401) await supabase.auth.refreshSession().catch(() => {})
    if (isRetryable(res.error, res.status)) return 'retry'
    console.error('topic op rejected', op, res.error)
    toast('שינוי בנושא לא נשמר בשרת')
  }
  return 'ok'
}

async function sendReminder(op) {
  const q = supabase.from('nx_reminders')
  let res
  if (op.op === 'insert') res = await q.upsert(op.patch)
  else if (op.op === 'update') res = await q.update(op.patch).eq('id', op.id)
  else res = await q.delete().eq('id', op.id)
  if (res.error) {
    if (res.status === 401) await supabase.auth.refreshSession().catch(() => {})
    if (isRetryable(res.error, res.status)) return 'retry'
    console.error('reminder op rejected', op, res.error)
    toast('שינוי בתזכורת לא נשמר בשרת')
  }
  return 'ok'
}

async function sendItem(op) {
  const q = supabase.from('nx_items')
  if (op.op === 'delete') {
    const res = await q.delete().eq('id', op.id)
    if (res.error && isRetryable(res.error, res.status)) return 'retry'
    return 'ok'
  }
  if (op.op === 'insert') {
    const res = await q.upsert(op.patch).select('version').maybeSingle()
    if (res.error) {
      if (res.status === 401) await supabase.auth.refreshSession().catch(() => {})
      if (isRetryable(res.error, res.status)) return 'retry'
      return await rescueItem(op.id, res.error)
    }
    if (res.data) patchLocalItem(op.id, { version: res.data.version })
    return 'ok'
  }
  // update
  const local = state.items.find((i) => i.id === op.id)
  const touchesText = 'title' in op.patch || 'content' in op.patch
  let uq = q.update(op.patch).eq('id', op.id)
  if (touchesText && local?.version != null) uq = uq.eq('version', local.version)
  const res = await uq.select('version')
  if (res.error) {
    if (res.status === 401) await supabase.auth.refreshSession().catch(() => {})
    if (isRetryable(res.error, res.status)) return 'retry'
    return await rescueItem(op.id, res.error)
  }
  if (res.data.length) {
    patchLocalItem(op.id, { version: res.data[0].version })
    return 'ok'
  }
  return await resolveConflict(op, local)
}

// The update matched nothing: the item was edited or deleted on another device.
async function resolveConflict(op, local) {
  const { data: server, error, status } = await supabase.from('nx_items').select('*').eq('id', op.id).maybeSingle()
  if (error) return isRetryable(error, status) ? 'retry' : 'ok'
  if (!local) return 'ok'
  if (!server) {
    // Deleted elsewhere while edited here: bring it back rather than lose the edit.
    const { id, topic_id, title, content, pinned, created_at, updated_at } = local
    const res = await supabase.from('nx_items').insert({ id, topic_id, title, content, pinned, created_at, updated_at }).select('version').maybeSingle()
    if (res.error) return isRetryable(res.error, res.status) ? 'retry' : await rescueItem(op.id, res.error)
    patchLocalItem(op.id, { version: res.data?.version ?? 1 })
    return 'ok'
  }
  if (server.title === local.title && server.content === local.content) {
    patchLocalItem(op.id, { version: server.version })
    const { title, content, ...rest } = op.patch
    if (Object.keys(rest).length) await supabase.from('nx_items').update(rest).eq('id', op.id)
    return 'ok'
  }
  // Real conflict: keep the other device's version in place and save ours as a copy.
  const copy = {
    id: uuid(),
    topic_id: local.topic_id,
    title: (local.title ? local.title + ' ' : '') + '(עותק מהמכשיר הזה)',
    content: local.content,
    pinned: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const res = await supabase.from('nx_items').insert(copy).select('version').maybeSingle()
  if (res.error) return isRetryable(res.error, res.status) ? 'retry' : await rescueItem(op.id, res.error)
  set({ items: [...state.items.map((i) => (i.id === op.id ? server : i)), { ...copy, version: res.data?.version ?? 1 }] })
  persistSoon()
  toast('הפריט נערך גם במכשיר אחר. שמרנו את שתי הגרסאות.', null, 6000)
  return 'ok'
}

// Server refused an item (usually because its topic was deleted elsewhere). Move it to a
// recovery topic instead of dropping it.
async function rescueItem(itemId, error) {
  console.error('item rejected', itemId, error)
  const item = state.items.find((i) => i.id === itemId)
  if (!item) return 'ok'
  let topic = state.topics.find((t) => t.name === 'פריטים ששוחזרו')
  if (!topic) {
    topic = { id: uuid(), name: 'פריטים ששוחזרו', icon: 'shield', color: 'slate', position: -1, pinned: false, last_opened_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    const r = await supabase.from('nx_topics').upsert(topic)
    if (r.error) return 'retry'
    set({ topics: [...state.topics, topic] })
  }
  const { id, title, content, pinned, created_at, updated_at } = item
  const r = await supabase.from('nx_items').upsert({ id, topic_id: topic.id, title, content, pinned, created_at, updated_at }).select('version').maybeSingle()
  if (r.error) return isRetryable(r.error, r.status) ? 'retry' : 'ok'
  patchLocalItem(itemId, { topic_id: topic.id, version: r.data?.version ?? 1 })
  toast('פריט הועבר ל"פריטים ששוחזרו" כי הנושא שלו נמחק', null, 6000)
  return 'ok'
}

function patchLocalItem(id, patch) {
  set({ items: state.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })
  persistSoon()
}

// ---------- topics API ----------

const now = () => new Date().toISOString()

export function createTopic({ name, icon, color }) {
  const minPos = state.topics.reduce((m, t) => Math.min(m, t.position), 0)
  const topic = {
    id: uuid(),
    name: name.trim().slice(0, 80),
    icon,
    color,
    position: minPos - 1,
    pinned: false,
    last_opened_at: now(),
    created_at: now(),
    updated_at: now(),
  }
  set({ topics: [...state.topics, topic] })
  persistSoon()
  enqueue({ t: 'topic', op: 'insert', id: topic.id, patch: topic })
  return topic
}

export function updateTopic(id, patch) {
  const full = { ...patch, updated_at: now() }
  set({ topics: state.topics.map((t) => (t.id === id ? { ...t, ...full } : t)) })
  persistSoon()
  enqueue({ t: 'topic', op: 'update', id, patch: full })
}

export function touchTopic(id) {
  const t = state.topics.find((x) => x.id === id)
  if (!t) return
  const patch = { last_opened_at: now() }
  set({ topics: state.topics.map((x) => (x.id === id ? { ...x, ...patch } : x)) })
  persistSoon()
  enqueue({ t: 'topic', op: 'update', id, patch })
}

export function deleteTopic(id) {
  const itemIds = new Set(state.items.filter((i) => i.topic_id === id).map((i) => i.id))
  set({
    topics: state.topics.filter((t) => t.id !== id),
    items: state.items.filter((i) => i.topic_id !== id),
    // Reminders outlive their topic; the server unlinks them the same way.
    reminders: state.reminders.map((r) => (r.topic_id === id ? { ...r, topic_id: null } : r)),
  })
  // Drop queued ops for this topic's items; the cascade removes them on the server.
  outbox = outbox.filter((op) => op === inflight || !(op.t === 'item' && itemIds.has(op.id)))
  persistSoon()
  enqueue({ t: 'topic', op: 'delete', id })
}

export function reorderTopics(orderedIds) {
  orderedIds.forEach((id, i) => {
    const t = state.topics.find((x) => x.id === id)
    if (t && t.position !== i) updateTopic(id, { position: i })
  })
}

// ---------- items API ----------

export function createItem({ topicId, title = '', content = '' }) {
  const item = {
    id: uuid(),
    topic_id: topicId,
    title,
    content,
    pinned: false,
    version: null,
    created_at: now(),
    updated_at: now(),
  }
  set({ items: [...state.items, item] })
  persistNow()
  const { version, ...row } = item
  enqueue({ t: 'item', op: 'insert', id: item.id, patch: row })
  return item
}

export function updateItem(id, patch) {
  const full = { ...patch, updated_at: now() }
  set({ items: state.items.map((i) => (i.id === id ? { ...i, ...full } : i)) })
  persistSoon()
  enqueue({ t: 'item', op: 'update', id, patch: full })
}

// Deletion waits a few seconds so it can be undone; the queued delete survives app restarts.
export function deleteItem(id) {
  const item = state.items.find((i) => i.id === id)
  if (!item) return
  set({ items: state.items.filter((i) => i.id !== id) })
  persistNow()
  const op = { t: 'item', op: 'delete', id, notBefore: Date.now() + 6000 }
  enqueue(op)
  toast('הפריט נמחק', {
    label: 'ביטול',
    run: () => {
      const idx = outbox.indexOf(op)
      if (idx < 0 || inflight === op) return toast('כבר מאוחר מדי לביטול')
      outbox.splice(idx, 1)
      persistOutbox()
      set({ items: [...state.items, item] })
      persistNow()
    },
  }, 6000)
}

// Remove an item that never got any content (e.g. a full note opened and left empty).
export function discardItem(id) {
  if (!state.items.some((i) => i.id === id)) return
  set({ items: state.items.filter((i) => i.id !== id) })
  persistNow()
  enqueue({ t: 'item', op: 'delete', id })
}

// ---------- reminders API ----------

// Columns the app writes; delivery bookkeeping belongs to the server.
const REMINDER_FIELDS = ['title', 'notes', 'topic_id', 'due_at', 'timezone', 'recurrence', 'status', 'updated_at']

export function createReminder({ title, notes = '', topicId = null, dueAt, timezone, recurrence = null }) {
  const r = {
    id: uuid(),
    title: title.trim().slice(0, 300),
    notes,
    topic_id: topicId,
    due_at: dueAt,
    timezone,
    recurrence,
    status: 'pending',
    completed_at: null,
    delivery_status: 'scheduled',
    delivered_at: null,
    last_error: null,
    created_at: now(),
    updated_at: now(),
  }
  set({ reminders: [...state.reminders, r] })
  persistNow()
  const row = Object.fromEntries(['id', 'created_at', ...REMINDER_FIELDS].map((k) => [k, r[k]]))
  enqueue({ t: 'reminder', op: 'insert', id: r.id, patch: row })
  return r
}

export function updateReminder(id, patch) {
  const cur = state.reminders.find((r) => r.id === id)
  if (!cur) return
  const full = { ...patch, updated_at: now() }
  const local = { ...full }
  // Mirror the server: a new time or a reopened reminder is scheduled afresh.
  if (('due_at' in patch && patch.due_at !== cur.due_at) || ('recurrence' in patch && JSON.stringify(patch.recurrence) !== JSON.stringify(cur.recurrence)) || (patch.status === 'pending' && cur.status !== 'pending')) {
    Object.assign(local, { delivery_status: 'scheduled', last_error: null })
  }
  if (patch.status) local.completed_at = patch.status === 'completed' ? now() : null
  set({ reminders: state.reminders.map((r) => (r.id === id ? { ...r, ...local } : r)) })
  persistSoon()
  const sendable = Object.fromEntries(Object.entries(full).filter(([k]) => REMINDER_FIELDS.includes(k)))
  enqueue({ t: 'reminder', op: 'update', id, patch: sendable })
}

export function deleteReminder(id) {
  const r = state.reminders.find((x) => x.id === id)
  if (!r) return
  set({ reminders: state.reminders.filter((x) => x.id !== id) })
  persistNow()
  const op = { t: 'reminder', op: 'delete', id, notBefore: Date.now() + 6000 }
  enqueue(op)
  toast('התזכורת נמחקה', {
    label: 'ביטול',
    run: () => {
      const idx = outbox.indexOf(op)
      if (idx < 0 || inflight === op) return toast('כבר מאוחר מדי לביטול')
      outbox.splice(idx, 1)
      persistOutbox()
      set({ reminders: [...state.reminders, r] })
      persistNow()
    },
  }, 6000)
}

export function exportData() {
  return {
    app: 'nexus',
    exported_at: now(),
    topics: state.topics,
    items: state.items,
    reminders: state.reminders,
  }
}
