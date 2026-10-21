// Wall-clock time in a named timezone, and recurring reminder schedules.
// Shared by the app (src/) and the nx-reminders Edge Function, so both compute the same
// next occurrence. No dependencies: everything goes through Intl, which knows the DST rules.

export const DEFAULT_TZ = 'Asia/Jerusalem'

const fmtCache = new Map()
function partsFormatter(tz) {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
    })
    fmtCache.set(tz, f)
  }
  return f
}
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

// Local calendar fields of an instant: { y, m (1-12), d, h, min, s, wd (0 = Sunday) }.
export function localParts(ms, tz = DEFAULT_TZ) {
  const p = {}
  for (const { type, value } of partsFormatter(tz).formatToParts(new Date(ms))) p[type] = value
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, s: +p.second, wd: WEEKDAYS[p.weekday] }
}

function offsetAt(ms, tz) {
  const p = localParts(ms, tz)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000
}

// The instant at which the wall clock in `tz` reads y-m-d h:min. A time skipped by a DST
// jump (e.g. 02:30 on the spring-forward night) moves forward by the gap; a time that
// happens twice (fall-back) resolves to the first one.
export function zonedToUtc({ y, m, d, h = 0, min = 0 }, tz = DEFAULT_TZ) {
  const wall = Date.UTC(y, m - 1, d, h, min)
  const o1 = offsetAt(wall - 864e5 / 2, tz)
  const o2 = offsetAt(wall + 864e5 / 2, tz)
  // Try the larger offset first (the earlier instant) so a repeated time resolves to its first occurrence.
  for (const o of o1 >= o2 ? [o1, o2] : [o2, o1]) {
    const t = wall - o
    const p = localParts(t, tz)
    if (p.y === y && p.m === m && p.d === d && p.h === h && p.min === min) return t
  }
  // Inside a DST gap: keep the wall-clock distance from midnight using the pre-jump offset.
  return wall - Math.max(o1, o2) + Math.abs(o1 - o2)
}

// Pure calendar helpers on { y, m, d } (no timezone involved).
export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
export function addDays({ y, m, d }, n) {
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}
export function addMonths({ y, m }, n, day) {
  const idx = y * 12 + (m - 1) + n
  const ny = Math.floor(idx / 12)
  const nm = (idx % 12) + 1
  return { y: ny, m: nm, d: Math.min(day, daysInMonth(ny, nm)) }
}
export function weekday({ y, m, d }) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}
export function dayNumber({ y, m, d }) {
  return Math.round(Date.UTC(y, m - 1, d) / 864e5)
}

export function parseTime(hhmm) {
  const [h, min] = String(hhmm || '').split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(min) ? { h, min } : null
}
export const pad2 = (n) => String(n).padStart(2, '0')
export const timeString = (h, min) => `${pad2(h)}:${pad2(min)}`

// Recurrence rule: { freq: 'daily'|'weekly'|'monthly'|'yearly', interval?: n, days?: [0-6],
// monthDay?: 1-31, month?: 1-12, time: 'HH:MM' }. Times are wall-clock in the reminder's
// timezone, so a reminder at 20:00 stays at 20:00 across daylight saving changes.
export function normalizeRule(rule) {
  if (!rule || !['daily', 'weekly', 'monthly', 'yearly'].includes(rule.freq)) return null
  const interval = Math.max(1, Math.min(99, Math.floor(rule.interval || 1)))
  const out = { freq: rule.freq, interval, time: rule.time }
  if (rule.freq === 'weekly') out.days = [...new Set((rule.days || []).filter((x) => x >= 0 && x <= 6))].sort()
  if (rule.freq === 'monthly' || rule.freq === 'yearly') out.monthDay = rule.monthDay
  if (rule.freq === 'yearly') out.month = rule.month
  return out
}

// First occurrence of `rule` strictly after `afterMs`. `anchorMs` (the series' current or
// first occurrence) fixes which days/weeks/months an interval > 1 lands on. Returns ms or null.
export function nextOccurrence(rule, tz = DEFAULT_TZ, afterMs, anchorMs = afterMs) {
  rule = normalizeRule(rule)
  const t = rule && parseTime(rule.time)
  if (!t) return null
  const anchor = localParts(anchorMs, tz)
  const anchorDate = { y: anchor.y, m: anchor.m, d: anchor.d }
  const after = localParts(afterMs, tz)
  // Start a day early so a time later today (or a DST-shifted one) is still considered.
  let start = addDays({ y: after.y, m: after.m, d: after.d }, -1)
  if (dayNumber(start) < dayNumber(anchorDate)) start = anchorDate
  const at = (date) => zonedToUtc({ ...date, h: t.h, min: t.min }, tz)

  if (rule.freq === 'daily' || rule.freq === 'weekly') {
    const days = rule.freq === 'weekly' ? (rule.days.length ? rule.days : [weekday(anchorDate)]) : null
    const anchorWeek = Math.floor((dayNumber(anchorDate) + 4) / 7) // weeks start on Sunday
    const limit = 8 * 7 * rule.interval + 8
    for (let i = 0; i <= limit; i++) {
      const date = addDays(start, i)
      const n = dayNumber(date)
      if (rule.freq === 'daily') {
        if ((n - dayNumber(anchorDate)) % rule.interval !== 0) continue
      } else {
        if (!days.includes(weekday(date))) continue
        if ((Math.floor((n + 4) / 7) - anchorWeek) % rule.interval !== 0) continue
      }
      const ms = at(date)
      if (ms > afterMs) return ms
    }
    return null
  }

  const monthDay = rule.monthDay || anchor.d
  if (rule.freq === 'monthly') {
    const months = (start.y - anchorDate.y) * 12 + (start.m - anchorDate.m)
    let k = Math.max(0, Math.floor(months / rule.interval) * rule.interval)
    for (let guard = 0; guard < 40; guard++, k += rule.interval) {
      const ms = at(addMonths(anchorDate, k, monthDay))
      if (ms > afterMs) return ms
    }
    return null
  }
  // yearly
  const month = rule.month || anchor.m
  for (let y = Math.max(anchorDate.y, start.y - 1), guard = 0; guard < 40; guard++, y += 1) {
    if ((y - anchorDate.y) % rule.interval !== 0) continue
    const ms = at({ y, m: month, d: Math.min(monthDay, daysInMonth(y, month)) })
    if (ms > afterMs) return ms
  }
  return null
}

// The occurrence a newly created series starts on: the first one at or after `fromMs`.
export function firstOccurrence(rule, tz, fromMs) {
  return nextOccurrence(rule, tz, fromMs - 1, fromMs)
}
