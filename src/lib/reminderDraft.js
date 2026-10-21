// The editable form state behind the reminder confirmation, and how it turns into a due time.
// A draft: { title, notes, topicId, date: 'YYYY-MM-DD'|'', time: 'HH:MM'|'', rule, timeOptions,
// approxTime }. `rule` holds the recurrence without its time; the form's time is used.

import { zonedToUtc, nextOccurrence, localParts, timeString, pad2, weekday } from '../../supabase/functions/_shared/nx-time.js'
import { updateReminder, toast } from '../store'
import { parseDateKey, dateKey } from './reminderParse'
import { whenLabel } from './reminderFormat'

export function emptyDraft(topicId = null) {
  return { title: '', notes: '', topicId, date: '', time: '', rule: null, timeOptions: null, approxTime: false }
}

export function draftFromParse(p, fallbackTopic = null) {
  const { time: _t, ...rule } = p.rule || {}
  return {
    title: p.title,
    notes: '',
    topicId: p.topicId || fallbackTopic,
    date: p.date ? dateKey(p.date) : '',
    time: p.time && !p.timeOptions ? timeString(p.time.h, p.time.min) : '',
    rule: p.rule ? rule : null,
    timeOptions: p.timeOptions,
    approxTime: p.approxTime,
  }
}

export function draftFromReminder(r) {
  const p = localParts(Date.parse(r.due_at), r.timezone)
  const { time: _t, ...rule } = r.recurrence || {}
  return {
    title: r.title,
    notes: r.notes || '',
    topicId: r.topic_id,
    date: `${p.y}-${pad2(p.m)}-${pad2(p.d)}`,
    time: timeString(p.h, p.min),
    rule: r.recurrence ? rule : null,
    timeOptions: null,
    approxTime: false,
  }
}

/** @returns {{ dueMs: number|null, recurrence: object|null, problem: null|'title'|'when'|'time'|'ampm'|'date'|'past' }} */
export function resolveDraft(d, tz, now = Date.now()) {
  const out = { dueMs: null, recurrence: null, problem: null }
  if (!d.title.trim()) out.problem = 'title'
  if (d.timeOptions && !d.time) return { ...out, problem: 'ampm' }
  if (!d.time) return { ...out, problem: !d.date && !d.rule ? 'when' : 'time' }
  const [h, min] = d.time.split(':').map(Number)
  const date = parseDateKey(d.date)
  if (d.rule) {
    const start = date || (() => {
      const p = localParts(now, tz)
      return { y: p.y, m: p.m, d: p.d }
    })()
    const rule = { ...d.rule, time: timeString(h, min) }
    if (rule.freq === 'monthly' || rule.freq === 'yearly') rule.monthDay = start.d
    if (rule.freq === 'yearly') rule.month = start.m
    if (rule.freq === 'weekly' && !rule.days?.length) rule.days = [weekday(start)]
    const startMs = zonedToUtc({ ...start, h: 0, min: 0 }, tz)
    out.recurrence = rule
    out.dueMs = nextOccurrence(rule, tz, Math.max(now, startMs - 1), startMs)
    return out
  }
  if (!date) return { ...out, problem: 'date' }
  out.dueMs = zonedToUtc({ ...date, h, min }, tz)
  if (out.dueMs <= now && !out.problem) out.problem = 'past'
  return out
}

// ---------- actions shared by the list, the menu and the edit sheet ----------

const iso = (ms) => new Date(ms).toISOString()

// Done. For a recurring reminder this finishes the current occurrence and moves to the next.
export function completeReminder(r, now = Date.now()) {
  if (r.recurrence) {
    const due = Date.parse(r.due_at)
    const next = nextOccurrence(r.recurrence, r.timezone, Math.max(now, due), due)
    if (next == null) return updateReminder(r.id, { status: 'completed' })
    updateReminder(r.id, { due_at: iso(next) })
    toast(`הבאה: ${whenLabel(next, r.timezone)}`, { label: 'ביטול', run: () => updateReminder(r.id, { due_at: r.due_at }) })
    return
  }
  updateReminder(r.id, { status: 'completed' })
  toast('סומנה כבוצעה', { label: 'ביטול', run: () => updateReminder(r.id, { status: 'pending' }) })
}

export function reopenReminder(r) {
  updateReminder(r.id, { status: 'pending' })
}

// Snooze: notify again `ms` from now (rounded up to a whole minute).
export function snoozeReminder(r, ms, now = Date.now()) {
  const due = Math.ceil((now + ms) / 60e3) * 60e3
  updateReminder(r.id, { due_at: iso(due), status: 'pending' })
  toast(`נדחתה ל${whenLabel(due, r.timezone)}`)
}

// Tomorrow at 09:00 in the reminder's timezone.
export function tomorrowMorning(tz, now = Date.now()) {
  const p = localParts(now + 864e5, tz)
  return zonedToUtc({ y: p.y, m: p.m, d: p.d, h: 9, min: 0 }, tz)
}
