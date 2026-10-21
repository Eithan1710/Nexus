import { DEFAULT_TZ, localParts, addDays, dayNumber, pad2 } from '../../supabase/functions/_shared/nx-time.js'

export const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
export const DAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

// The user's timezone. Asia/Jerusalem unless the device says otherwise.
export function userTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ
  } catch {
    return DEFAULT_TZ
  }
}

// "היום" / "מחר" / "יום חמישי" / "5 בנובמבר" for a calendar date relative to today.
export function dayLabel(date, tz = userTimezone(), now = Date.now()) {
  const t = localParts(now, tz)
  const today = { y: t.y, m: t.m, d: t.d }
  const diff = dayNumber(date) - dayNumber(today)
  if (diff === 0) return 'היום'
  if (diff === 1) return 'מחר'
  if (diff === -1) return 'אתמול'
  if (diff === 2) return 'מחרתיים'
  const wd = new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay()
  if (diff > 0 && diff < 7) return `יום ${DAY_NAMES[wd]}`
  return `${DAY_NAMES[wd].startsWith('שבת') ? 'שבת' : 'יום ' + DAY_NAMES[wd]}, ${date.d} ב${MONTHS[date.m - 1]}${date.y !== t.y ? ' ' + date.y : ''}`
}

export function whenLabel(ms, tz = userTimezone(), now = Date.now()) {
  if (ms == null) return ''
  const p = localParts(ms, tz)
  return `${dayLabel(p, tz, now)}, ${pad2(p.h)}:${pad2(p.min)}`
}

// Short relative hint: "בעוד 25 דק׳", "לפני 3 שעות".
export function relativeHint(ms, now = Date.now()) {
  const diff = ms - now
  const a = Math.abs(diff)
  const fmt = (n, one, many) => (n === 1 ? one : `${n} ${many}`)
  let s
  if (a < 60e3) return diff >= 0 ? 'בעוד פחות מדקה' : 'עכשיו'
  if (a < 3600e3) s = fmt(Math.round(a / 60e3), 'דקה', 'דק׳')
  else if (a < 86400e3) s = fmt(Math.round(a / 3600e3), 'שעה', 'שעות')
  else s = fmt(Math.round(a / 86400e3), 'יום', 'ימים')
  return diff >= 0 ? `בעוד ${s}` : `לפני ${s}`
}

export function recurrenceLabel(rule) {
  if (!rule) return ''
  const n = rule.interval || 1
  const time = rule.time ? ` ב־${rule.time}` : ''
  switch (rule.freq) {
    case 'daily':
      return (n === 1 ? 'כל יום' : n === 2 ? 'כל יומיים' : `כל ${n} ימים`) + time
    case 'weekly': {
      const days = (rule.days || []).slice().sort()
      const names = days.length === 7 ? 'כל יום' : days.map((d) => (days.length > 2 ? DAY_LETTERS[d] : DAY_NAMES[d])).join(days.length > 2 ? ' ' : ' ו')
      const every = n === 1 ? 'כל' : n === 2 ? 'כל שבועיים,' : `כל ${n} שבועות,`
      return days.length === 7 ? 'כל יום' + time : `${every} ${days.length > 2 ? 'ימים' : 'יום'} ${names}${time}`
    }
    case 'monthly':
      return `${n === 1 ? 'כל חודש' : n === 2 ? 'כל חודשיים' : `כל ${n} חודשים`} ב־${rule.monthDay}${time}`
    case 'yearly':
      return `כל שנה ב־${rule.monthDay} ב${MONTHS[(rule.month || 1) - 1]}${time}`
    default:
      return ''
  }
}

export function dateInputValue(ms, tz = userTimezone()) {
  const p = localParts(ms, tz)
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`
}
export function timeInputValue(ms, tz = userTimezone()) {
  const p = localParts(ms, tz)
  return `${pad2(p.h)}:${pad2(p.min)}`
}
export function todayKey(tz = userTimezone(), now = Date.now()) {
  return dateInputValue(now, tz)
}
export function tomorrowKey(tz = userTimezone(), now = Date.now()) {
  const p = localParts(now, tz)
  const t = addDays(p, 1)
  return `${t.y}-${pad2(t.m)}-${pad2(t.d)}`
}
