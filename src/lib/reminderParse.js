// Natural-language reminder parser for Hebrew and English. Runs entirely on the device: no API
// key, no network. It pulls out the date, time and recurrence, and whatever text is left is the
// task. It never fills a gap by guessing: a missing time, or an hour that could be morning or
// evening ("at 4", "בארבע"), is reported so the confirmation step can ask.

import { DEFAULT_TZ, localParts, zonedToUtc, addDays, addMonths, daysInMonth, weekday, dayNumber, firstOccurrence, timeString, pad2 } from '../../supabase/functions/_shared/nx-time.js'
import { normalize } from './search.js'

const L = '[\\p{L}\\p{N}]'
const B = `(?<!${L})` // word start (\b does not understand Hebrew)
const E = `(?!${L})` // word end
const alt = (words) => [...words].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
const re = (src) => new RegExp(src, 'iu')

// ---------- vocabulary ----------

const EN_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 }
const HE_HOUR = { 'אחת': 1, 'אחד': 1, 'שתיים': 2, 'שתים': 2, 'שלוש': 3, 'ארבע': 4, 'חמש': 5, 'שש': 6, 'שבע': 7, 'שמונה': 8, 'תשע': 9, 'עשר': 10, 'אחת עשרה': 11, 'אחת-עשרה': 11, 'שתים עשרה': 12, 'שתיים עשרה': 12, 'שתים-עשרה': 12 }
const HE_COUNT = { ...HE_HOUR, 'שתי': 2, 'שני': 2, 'שלושה': 3, 'ארבעה': 4, 'חמישה': 5, 'שישה': 6, 'שבעה': 7, 'שמונה': 8, 'תשעה': 9, 'עשרה': 10, 'חמש עשרה': 15, 'עשרים': 20, 'שלושים': 30, 'ארבעים': 40, 'חמישים': 50 }
const EN_COUNT = { ...EN_NUM, a: 1, an: 1, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, fifty: 50 }
const HE_ORD = { 'ראשון': 1, 'שני': 2, 'שלישי': 3, 'רביעי': 4, 'חמישי': 5, 'שישי': 6, 'שביעי': 7, 'שמיני': 8, 'תשיעי': 9, 'עשירי': 10 }

const EN_WD = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6 }
const HE_WD = { 'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6 }
const HE_WD_LETTER = { 'א': 0, 'ב': 1, 'ג': 2, 'ד': 3, 'ה': 4, 'ו': 5, 'ש': 6 }
const EN_MONTH = { january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12 }
const HE_MONTH = { 'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'מרס': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6, 'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12 }

// Part of the day: the default time when no hour is given, and how a 1-12 hour maps to 24h.
export const PART_DEFAULT = { morning: [9, 0], noon: [12, 0], afternoon: [16, 0], evening: [20, 0], night: [22, 0] }
function hourInPart(h, part) {
  if (part === 'morning') return h === 12 ? 0 : h
  if (part === 'noon') return h >= 11 ? h : h + 12
  if (part === 'afternoon' || part === 'evening') return h < 12 ? h + 12 : h
  if (part === 'night') return h >= 7 && h <= 11 ? h + 12 : h === 12 ? 0 : h
  return h
}
const EN_PART = { morning: 'morning', afternoon: 'afternoon', evening: 'evening', night: 'night', noon: 'noon' }
const HE_PART_WORDS = {
  'בבוקר': 'morning', 'לפנות בוקר': 'morning', 'בצהריים': 'noon', 'בצהרים': 'noon', 'צהריים': 'noon',
  'אחה״צ': 'afternoon', 'אחה"צ': 'afternoon', "אחה''צ": 'afternoon', 'אחהצ': 'afternoon', 'אחר הצהריים': 'afternoon', 'אחרי הצהריים': 'afternoon', 'אחר הצהרים': 'afternoon',
  'בערב': 'evening', 'בלילה': 'night',
}

const WD_EN = alt(Object.keys(EN_WD))
const WD_HE = alt(Object.keys(HE_WD))
const WD_HE_ANY = `(?:יום\\s+)?(?:${WD_HE})|יום\\s+[אבגדהוש](?:['׳])`
const MONTH_EN = alt(Object.keys(EN_MONTH))
const MONTH_HE = alt(Object.keys(HE_MONTH))
const HOUR_EN = `\\d{1,2}|${alt(Object.keys(EN_NUM))}`
const HOUR_HE = alt(Object.keys(HE_HOUR))
const COUNT_HE = `\\d+|${alt(Object.keys(HE_COUNT))}`
const COUNT_EN = `\\d+|${alt(Object.keys(EN_COUNT))}`
const ORD_EN = '(?:st|nd|rd|th)'
const PART_HE = alt(Object.keys(HE_PART_WORDS))
const DASH = '[-־–]?'

function heWeekday(s) {
  s = s.replace(/^יום\s+/, '').replace(/['׳]$/, '')
  if (s in HE_WD) return HE_WD[s]
  return HE_WD_LETTER[s]
}
const num = (s, table) => (/^\d+$/.test(s) ? +s : table[s.toLowerCase()])

// ---------- rules ----------
// Each rule matches once per pass; its span is blanked out so the rest of the text is the task.

const RULES = [
  // --- recurrence ---
  {
    sets: 'rule',
    re: re(`${B}(?:every|each)\\s+((?:${WD_EN})(?:\\s*(?:,|and|&)\\s*(?:${WD_EN}))*)${E}(?:\\s+(morning|afternoon|evening|night))?`),
    run: (m, r) => {
      r.rule = { freq: 'weekly', days: m[1].split(/\s*(?:,|and|&)\s*/i).map((w) => EN_WD[w.toLowerCase()]) }
      if (m[2]) r.part = EN_PART[m[2].toLowerCase()]
    },
  },
  {
    sets: 'rule',
    re: re(`${B}(?:ב)?(?:כל|מדי)\\s+((?:${WD_HE_ANY})(?:\\s*(?:,|ו)\\s*(?:ב)?(?:${WD_HE_ANY}))*)(?![\\p{L}\\p{N}'׳])`),
    run: (m, r) => {
      const parts = m[1].split(/\s*,\s*|\s+ו(?:ב)?(?=יום|[א-ת])/).map((s) => s.trim()).filter(Boolean)
      const days = parts.map(heWeekday).filter((d) => d != null)
      if (!days.length) return false
      r.rule = { freq: 'weekly', days }
    },
  },
  {
    sets: 'rule',
    re: re(`${B}(?:on\\s+)?(?:the\\s+)?(\\d{1,2})${ORD_EN}?\\s+(?:day\\s+)?of\\s+(?:every|each)\\s+month${E}`),
    run: (m, r) => (r.rule = { freq: 'monthly', monthDay: +m[1] }),
  },
  {
    sets: 'rule',
    re: re(`${B}(?:ב${DASH})?(\\d{1,2}|${alt(Object.keys(HE_ORD))})\\s+(?:ל|ב)(?:כל\\s+)?(?:חודש)\\s+(?:ב)?(?:כל\\s+חודש)?`),
    test: (m) => /כל/.test(m[0]),
    run: (m, r) => (r.rule = { freq: 'monthly', monthDay: num(m[1], HE_ORD) }),
  },
  {
    sets: 'rule',
    re: re(`${B}(?:ב)?כל\\s+(?:ה)?(\\d{1,2})\\s+(?:ל|ב)חודש${E}`),
    run: (m, r) => (r.rule = { freq: 'monthly', monthDay: +m[1] }),
  },
  {
    sets: 'rule',
    re: re(`${B}every\\s+(other\\s+|(${COUNT_EN})\\s+)?(day|week|month|year)s?${E}`),
    run: (m, r) => {
      const unit = m[3].toLowerCase()
      r.rule = { freq: unit === 'day' ? 'daily' : unit + 'ly', interval: m[1]?.trim() === 'other' ? 2 : m[2] ? num(m[2], EN_COUNT) : 1 }
    },
  },
  {
    sets: 'rule',
    re: re(`${B}(?:every|each)\\s+(morning|afternoon|evening|night)${E}`),
    run: (m, r) => {
      r.rule = { freq: 'daily' }
      r.part = EN_PART[m[1].toLowerCase()]
    },
  },
  { sets: 'rule', re: re(`${B}every\\s*weekday${E}`), run: (m, r) => (r.rule = { freq: 'weekly', days: [1, 2, 3, 4, 5] }) },
  {
    // Bare "weekly" only at the start or end ("weekly goals" is a task, not a schedule).
    sets: 'rule',
    re: re(`${B}(daily|weekly|monthly|yearly|annually)${E}`),
    test: (m, r, s) => /^[\s,.;:]*$/.test(s.slice(0, m.index)) || /^[\s,.;:!]*$/.test(s.slice(m.index + m[0].length)),
    run: (m, r) => (r.rule = { freq: { annually: 'yearly' }[m[1].toLowerCase()] || m[1].toLowerCase() }) },
  {
    sets: 'rule',
    re: re(`${B}(?:ב)?(?:כל|מדי)\\s+(יומיים|שבועיים|חודשיים|שנתיים)${E}`),
    run: (m, r) => (r.rule = { freq: { 'יומיים': 'daily', 'שבועיים': 'weekly', 'חודשיים': 'monthly', 'שנתיים': 'yearly' }[m[1]], interval: 2 }),
  },
  {
    sets: 'rule',
    re: re(`${B}(?:ב)?(?:כל|מדי)\\s+(\\d+|${alt(Object.keys(HE_COUNT))})\\s+(ימים|שבועות|חודשים|שנים)${E}`),
    run: (m, r) => (r.rule = { freq: { 'ימים': 'daily', 'שבועות': 'weekly', 'חודשים': 'monthly', 'שנים': 'yearly' }[m[2]], interval: num(m[1], HE_COUNT) }),
  },
  {
    sets: 'rule',
    re: re(`${B}(?:ב)?(?:כל|מדי)\\s+(יום|בוקר|ערב|לילה|צהריים|שבוע|חודש|שנה)${E}|${B}פעם\\s+ב(יום|שבוע|חודש|שנה)${E}`),
    run: (m, r) => {
      const w = m[1] || m[2]
      const map = { 'יום': ['daily'], 'בוקר': ['daily', 'morning'], 'ערב': ['daily', 'evening'], 'לילה': ['daily', 'night'], 'צהריים': ['daily', 'noon'], 'שבוע': ['weekly'], 'חודש': ['monthly'], 'שנה': ['yearly'] }[w]
      r.rule = { freq: map[0] }
      if (map[1]) r.part = map[1]
    },
  },

  // --- relative to now ---
  {
    re: re(`${B}in\\s+(?:(${COUNT_EN})\\s+(?:and\\s+a\\s+half\\s+)?|half\\s+an\\s+|a\\s+quarter\\s+of\\s+an\\s+)?(minutes?|mins?|hours?|hrs?|h|days?|weeks?|months?)(\\s+and\\s+a\\s+half)?${E}`),
    run: (m, r) => {
      const whole = m[0].toLowerCase()
      let n = m[1] ? num(m[1], EN_COUNT) : whole.includes('half') ? 0.5 : whole.includes('quarter') ? 0.25 : 1
      if (n == null) return false
      if (m[1] && /and a half/.test(whole)) n += 0.5
      return relative(r, n, m[2].toLowerCase())
    },
  },
  {
    re: re(`${B}(?:ב)?עוד\\s+(?:(${COUNT_HE})\\s+)?(דקות|דקה|שעות|שעה|שעתיים|ימים|יום|יומיים|שבועות|שבוע|שבועיים|חודשים|חודש|חודשיים|רבע\\s+שעה|חצי\\s+שעה)(\\s+ו(?:חצי|רבע))?${E}`),
    run: (m, r) => {
      const unitWord = m[2].replace(/\s+/g, ' ')
      let n = m[1] ? num(m[1], HE_COUNT) : 1
      if (n == null) return false
      const units = { 'דקות': 'minute', 'דקה': 'minute', 'שעות': 'hour', 'שעה': 'hour', 'ימים': 'day', 'יום': 'day', 'שבועות': 'week', 'שבוע': 'week', 'חודשים': 'month', 'חודש': 'month' }
      let unit = units[unitWord]
      if (unitWord === 'שעתיים') [n, unit] = [2, 'hour']
      if (unitWord === 'יומיים') [n, unit] = [2, 'day']
      if (unitWord === 'שבועיים') [n, unit] = [2, 'week']
      if (unitWord === 'חודשיים') [n, unit] = [2, 'month']
      if (unitWord === 'רבע שעה') [n, unit] = [0.25, 'hour']
      if (unitWord === 'חצי שעה') [n, unit] = [0.5, 'hour']
      if (m[3]) n += m[3].includes('חצי') ? 0.5 : 0.25
      return relative(r, n, unit)
    },
  },

  // --- calendar dates ---
  {
    re: re(`${B}(?:on\\s+)?(?:the\\s+)?(\\d{1,2})${ORD_EN}?\\s+(?:day\\s+)?of\\s+(next|this|the)\\s+month${E}`),
    run: (m, r) => monthDay(r, +m[1], m[2].toLowerCase() === 'next' ? 1 : 0),
  },
  {
    re: re(`${B}(?:ב${DASH})?(\\d{1,2}|${alt(Object.keys(HE_ORD))})\\s+(?:ל|ב)חודש(?:\\s+(הבא|הזה|הנוכחי))?${E}`),
    run: (m, r) => monthDay(r, num(m[1], HE_ORD), m[2] === 'הבא' ? 1 : m[2] ? 0 : null),
  },
  {
    re: re(`${B}(?:on\\s+)?(?:(${MONTH_EN})\\.?\\s+(\\d{1,2})${ORD_EN}?|(?:the\\s+)?(\\d{1,2})${ORD_EN}?\\s+(?:of\\s+)?(${MONTH_EN}))${E}(?:,?\\s*(\\d{4})${E})?`),
    run: (m, r) => calendarDate(r, m[1] ? EN_MONTH[m[1].toLowerCase()] : EN_MONTH[m[4].toLowerCase()], +(m[2] || m[3]), m[5] && +m[5]),
  },
  {
    re: re(`${B}(?:ב${DASH})?(\\d{1,2})\\s+(?:ב|ל)?(${MONTH_HE})${E}(?:\\s+(\\d{4})${E})?`),
    run: (m, r) => calendarDate(r, HE_MONTH[m[2]], +m[1], m[3] && +m[3]),
  },
  {
    re: re(`(?<![\\p{L}\\d:/.])(?:on\\s+|ב${DASH})?(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{2}|\\d{4}))?(?![\\d:/.])`),
    run: (m, r) => {
      // Day first, the way dates are written in Israel.
      const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null
      return calendarDate(r, +m[2], +m[1], y)
    },
  },
  {
    re: re(`${B}on\\s+the\\s+(\\d{1,2})${ORD_EN}?${E}|${B}(?:on\\s+)?the\\s+(\\d{1,2})${ORD_EN}${E}`),
    run: (m, r) => monthDay(r, +(m[1] || m[2]), null),
  },

  // --- day words ---
  {
    re: re(`${B}(?:the\\s+)?day\\s+after\\s+tomorrow${E}|${B}(?:ו)?מחרתיים${E}`),
    run: (m, r) => setDate(r, addDays(r.today, 2)),
  },
  {
    re: re(`${B}(today|tonight|tomorrow|tmrw|tmr)${E}(?:\\s+(morning|afternoon|evening|night|noon))?`),
    run: (m, r) => {
      const w = m[1].toLowerCase()
      setDate(r, w === 'today' || w === 'tonight' ? r.today : addDays(r.today, 1))
      if (w === 'tonight') r.part = 'evening'
      if (m[2]) r.part = EN_PART[m[2].toLowerCase()]
    },
  },
  {
    re: re(`${B}this\\s+(morning|afternoon|evening)${E}`),
    run: (m, r) => {
      setDate(r, r.today)
      r.part = EN_PART[m[1].toLowerCase()]
    },
  },
  {
    re: re(`${B}(?:ו)?(?:ב)?(היום|הערב|הלילה|הבוקר|מחר|למחר)${E}`),
    run: (m, r) => {
      const w = m[1]
      setDate(r, w === 'מחר' || w === 'למחר' ? addDays(r.today, 1) : r.today)
      if (w === 'הערב') r.part = 'evening'
      if (w === 'הלילה') r.part = 'night'
      if (w === 'הבוקר') r.part = 'morning'
    },
  },
  {
    re: re(`${B}(?:on\\s+)?(next|this|coming)?\\s*(${WD_EN})${E}(?:\\s+(morning|afternoon|evening|night))?`),
    run: (m, r) => {
      weekdayDate(r, EN_WD[m[2].toLowerCase()], m[1]?.toLowerCase())
      if (m[3]) r.part = EN_PART[m[3].toLowerCase()]
    },
  },
  {
    re: re(`${B}(?:ב)?(${WD_HE_ANY})(?:\\s+(הבא|הקרוב|הזה))?(?![\\p{L}\\p{N}'׳])`),
    test: (m) => /^ב|^יום/.test(m[0]) || !!m[2],
    run: (m, r) => weekdayDate(r, heWeekday(m[1]), m[2] === 'הבא' ? 'next' : m[2] === 'הזה' ? 'this' : null),
  },
  {
    re: re(`${B}(next\\s+week|next\\s+month|(?:ב)?שבוע\\s+הבא|(?:ב)?חודש\\s+הבא)${E}`),
    run: (m, r) => setDate(r, /month|חודש/.test(m[1]) ? addMonths(r.today, 1, r.today.d) : addDays(r.today, 7)),
  },

  // --- times ---
  { re: re(`${B}(?:at\\s+)?(noon|midday|midnight)${E}|${B}(?:ב)?חצות${E}`), run: (m, r) => setTime(r, m[1] && /noon|midday/i.test(m[1]) ? 12 : 0, 0, true) },
  {
    // 16:00, 8:30, at 4:30 pm, ב-16:00, בשעה 8:15
    re: re(`(?<![\\p{L}\\d:/.])(?:at\\s+|@\\s*|(?:ב)?שעה\\s+|ב${DASH})?([01]?\\d|2[0-3])[:.]([0-5]\\d)(?!\\d)\\s*(a\\.?m\\.?|p\\.?m\\.?)?(?![\\p{L}])`),
    run: (m, r) => {
      if (m[3]) return setTime(r, ampm(+m[1], m[3]), +m[2], true)
      setTime(r, +m[1], +m[2], true)
    },
  },
  {
    // 4pm, at 4 pm, at four o'clock, at 10
    re: re(`${B}(?:at\\s+|@\\s*)?(${HOUR_EN})\\s*(a\\.?m\\.?|p\\.?m\\.?|o'?clock)(?![\\p{L}])|${B}(?:at|@)\\s*(${HOUR_EN})${E}`),
    run: (m, r) => {
      const h = num(m[1] || m[3], EN_NUM)
      if (h == null || h > 23) return false
      if (m[2] && /m/i.test(m[2].replace(/o'?clock/i, ''))) return setTime(r, ampm(h, m[2]), 0, true)
      setTime(r, h, 0, h > 12 || h === 0)
    },
  },
  {
    // בארבע, בשעה ארבע וחצי, ב-4, בשעה 16, רבע לחמש
    re: re(`${B}(?:(?:ב)?שעה\\s+|ב${DASH}|ב)(\\d{1,2}|${HOUR_HE})(?:\\s+ו(חצי|רבע|עשרה|עשר|חמישה|עשרים|ארבעים))?${E}`),
    run: (m, r) => {
      const h = num(m[1], HE_HOUR)
      if (h == null || h > 23) return false
      setTime(r, h, heMinutes(m[2]), h > 12 || h === 0)
    },
  },
  {
    re: re(`${B}(?:ב)?רבע\\s+ל(?:${DASH})?(\\d{1,2}|${HOUR_HE})${E}`),
    run: (m, r) => {
      const h = num(m[1], HE_HOUR)
      if (h == null || h > 23) return false
      setTime(r, (h + 23) % 24 || (h === 1 ? 12 : 0), 45, h > 12)
    },
  },
  {
    // A bare Hebrew hour word followed by a part of day: "ארבע בצהריים"
    re: re(`${B}(\\d{1,2}|${HOUR_HE})(?:\\s+ו(חצי|רבע|עשרה|עשר|עשרים))?(?=\\s+(?:${PART_HE})${E})`),
    run: (m, r) => setTime(r, num(m[1], HE_HOUR), heMinutes(m[2]), false),
  },

  // --- part of day ---
  {
    re: re(`${B}(?:in\\s+the\\s+)?(morning|afternoon|evening)${E}|${B}at\\s+night${E}`),
    test: (m, r) => r.time != null || r.date != null || r.rule != null || /^in the/i.test(m[0]) || /night/i.test(m[0]),
    run: (m, r) => (r.part = m[1] ? EN_PART[m[1].toLowerCase()] : 'night'),
  },
  { re: re(`(?<![\\p{L}])(${PART_HE})${E}`), run: (m, r) => (r.part = HE_PART_WORDS[m[1]]) },
]

function heMinutes(w) {
  return { 'חצי': 30, 'רבע': 15, 'עשרה': 10, 'עשר': 10, 'חמישה': 5, 'עשרים': 20, 'ארבעים': 40 }[w] || 0
}
function ampm(h, mer) {
  const pm = /p/i.test(mer)
  if (h === 12) return pm ? 12 : 0
  return pm ? h + 12 : h
}

function setDate(r, { y, m, d }) {
  if (r.date) return false
  r.date = { y, m, d }
}
function setTime(r, h, min, exact) {
  if (r.time) return false
  r.time = { h, min }
  r.timeExact = exact
}
function relative(r, n, unit) {
  if (r.relMs != null || r.date) return false
  const u = unit.replace(/s$/, '')
  if (/^(minute|min|hour|hr|h)$/.test(u)) {
    r.relMs = Math.round(n * (/^m/.test(u) ? 60e3 : 3600e3))
    return
  }
  if (u === 'day') r.date = addDays(r.today, Math.round(n))
  else if (u === 'week') r.date = addDays(r.today, Math.round(n * 7))
  else if (u === 'month') r.date = addMonths(r.today, Math.round(n), r.today.d)
  else return false
}
// Day N of this/next month; with no month given, the next time that day comes around.
function monthDay(r, d, monthOffset) {
  if (!d || d < 1 || d > 31) return false
  if (r.rule?.freq === 'monthly' && !r.rule.monthDay) {
    r.rule.monthDay = d
    return
  }
  if (r.date) return false
  if (monthOffset != null) {
    r.date = addMonths(r.today, monthOffset, d)
    return
  }
  let date = addMonths(r.today, 0, d)
  if (dayNumber(date) < dayNumber(r.today)) date = addMonths(r.today, 1, d)
  r.date = date
}
function calendarDate(r, m, d, y) {
  if (!m || m > 12 || !d || d > 31) return false
  if (r.rule?.freq === 'yearly') {
    r.rule.month = m
    r.rule.monthDay = d
    return
  }
  if (r.date) return false
  if (y) {
    if (d > daysInMonth(y, m)) return false
    r.date = { y, m, d }
    return
  }
  let date = { y: r.today.y, m, d: Math.min(d, daysInMonth(r.today.y, m)) }
  if (dayNumber(date) < dayNumber(r.today)) date = { y: r.today.y + 1, m, d: Math.min(d, daysInMonth(r.today.y + 1, m)) }
  r.date = date
}
function weekdayDate(r, wd, which) {
  if (wd == null) return false
  if (r.rule?.freq === 'weekly' && !r.rule.days?.length) {
    r.rule.days = [wd]
    return
  }
  if (r.date) return false
  let diff = (wd - r.today.wd + 7) % 7
  // "Thursday" said on a Thursday means next week; "this Thursday" means today.
  if (diff === 0 && which !== 'this') diff = 7
  r.date = addDays(r.today, diff)
}

// ---------- title cleanup ----------

const LEAD = [
  /^(?:please\s+)?(?:remind\s+me|reminder|remember|don'?t\s+forget)\s*(?:to|that|about|of)?(?=\s|$|[,:])/i,
  /^(?:בבקשה\s+)?(?:תזכיר(?:י|ו)?|הזכר|להזכיר|תזכורת|תזכורות|אל\s+תשכח(?:י)?|לא\s+לשכוח)(?:\s+לי)?(?:\s+ש)?(?=\s|$|[,:])/u,
]
const EDGE_WORDS = /^(?:at|on|by|in|to|and|for|from|then|ב|ו|ל|ש|של|ב-|ו-|ב־|-|–|—|:|,|\.|;)$/iu

function cleanTitle(s) {
  let t = s.replace(/\s+/g, ' ').trim()
  for (let i = 0; i < 3; i++) for (const rx of LEAD) t = t.replace(rx, '').trim()
  // Drop connectors left dangling where a date or time was cut out.
  let words = t.split(' ').filter(Boolean)
  const trimEdge = () => {
    while (words.length && EDGE_WORDS.test(words[0].replace(/[,.;:]+$/, '') || words[0])) words.shift()
    while (words.length && EDGE_WORDS.test(words[words.length - 1].replace(/^[,.;:]+/, '') || words[words.length - 1])) words.pop()
  }
  trimEdge()
  t = words.join(' ')
  t = t.replace(/\s+([,.;:!?])/g, '$1').replace(/([,;:])(?=[,;:.])/g, '').replace(/^[\s,.;:!?\-–—]+|[\s,;:\-–—]+$/g, '').trim()
  for (let i = 0; i < 3; i++) for (const rx of LEAD) t = t.replace(rx, '').trim()
  words = t.split(' ').filter(Boolean)
  trimEdge()
  t = words.join(' ').replace(/^[\s,.;:!?\-–—]+|[\s,.;:\-–—]+$/g, '')
  if (/^[a-z]/.test(t)) t = t[0].toUpperCase() + t.slice(1)
  return t
}

// ---------- main ----------

/**
 * @returns {{
 *   title: string, topicId: string|null, rule: object|null,
 *   date: {y,m,d}|null, time: {h,min}|null,
 *   timeOptions: [{h,min},{h,min}]|null,  // hour could be AM or PM: ask
 *   approxTime: boolean,                    // time came from "morning"/"evening": show it
 *   relative: boolean, dueMs: number|null,
 *   needs: null|'time'|'when',              // what the user still has to give
 *   past: boolean, found: boolean
 * }}
 */
export function parseReminder(text, { now = Date.now(), tz = DEFAULT_TZ, topics = [] } = {}) {
  const lp = localParts(now, tz)
  const r = { today: { y: lp.y, m: lp.m, d: lp.d, wd: lp.wd }, date: null, time: null, timeExact: false, part: null, rule: null, relMs: null }
  let s = ' ' + String(text || '').replace(/[\u200e\u200f]/g, '') + ' '
  let found = false

  for (const rule of RULES) {
    for (let guard = 0; guard < 3; guard++) {
      const m = rule.re.exec(s)
      if (!m) break
      if (rule.test && !rule.test(m, r, s)) break
      if (rule.sets === 'rule' && r.rule) break
      if (rule.run(m, r) === false) break
      found = true
      s = s.slice(0, m.index) + ' '.repeat(m[0].length) + s.slice(m.index + m[0].length)
      if (!rule.re.flags.includes('g')) break
    }
  }
  const out = { title: cleanTitle(s), topicId: matchTopic(text, topics), rule: null, date: null, time: null, timeOptions: null, approxTime: false, relative: false, dueMs: null, needs: null, past: false, found }

  if (r.relMs != null) {
    // "in 30 minutes": an exact instant, rounded up to the next whole minute.
    const due = Math.ceil((now + r.relMs) / 60e3) * 60e3
    const p = localParts(due, tz)
    Object.assign(out, { relative: true, dueMs: due, date: { y: p.y, m: p.m, d: p.d }, time: { h: p.h, min: p.min } })
    return out
  }

  // Resolve the hour against am/pm and part-of-day words.
  let time = null
  if (r.time) {
    let { h, min } = r.time
    if (!r.timeExact && h >= 1 && h <= 12) {
      if (r.part) h = hourInPart(h, r.part)
      else out.timeOptions = h === 12 ? [{ h: 12, min }, { h: 0, min }] : [{ h, min }, { h: h + 12, min }]
    }
    time = { h, min }
  } else if (r.part) {
    const [h, min] = PART_DEFAULT[r.part]
    time = { h, min }
    out.approxTime = true
  }

  if (r.rule) {
    const rule = { ...r.rule }
    if (rule.freq === 'monthly' && !rule.monthDay) rule.monthDay = r.date?.d || r.today.d
    if (rule.freq === 'yearly') {
      rule.month = rule.month || r.date?.m || r.today.m
      rule.monthDay = rule.monthDay || r.date?.d || r.today.d
    }
    if (rule.freq === 'weekly' && !rule.days?.length) rule.days = [r.date ? weekday(r.date) : r.today.wd]
    out.rule = rule
    if (!time || out.timeOptions) {
      out.time = out.timeOptions ? null : time
      out.needs = 'time'
      return out
    }
    rule.time = timeString(time.h, time.min)
    out.time = time
    out.dueMs = firstOccurrence(rule, tz, now)
    const p = localParts(out.dueMs, tz)
    out.date = { y: p.y, m: p.m, d: p.d }
    return out
  }

  if (out.timeOptions) {
    // Date may still be unknown; the confirmation asks for AM/PM first.
    out.date = r.date
    out.needs = 'time'
    return out
  }
  if (!r.date && !time) {
    out.needs = 'when'
    return out
  }
  if (!time) {
    out.date = r.date
    out.needs = 'time'
    return out
  }
  let date = r.date
  if (!date) {
    // A time with no day: today if it is still ahead, otherwise tomorrow.
    date = { y: r.today.y, m: r.today.m, d: r.today.d }
    if (zonedToUtc({ ...date, ...time }, tz) <= now) date = addDays(date, 1)
  }
  out.date = date
  out.time = time
  out.dueMs = zonedToUtc({ ...date, h: time.h, min: time.min }, tz)
  out.past = out.dueMs <= now
  return out
}

function matchTopic(text, topics) {
  const t = normalize(text)
  let best = null
  for (const topic of topics) {
    const n = normalize(topic.name).trim()
    if (n.length < 2 || !t.includes(n)) continue
    if (!best || n.length > best.n.length) best = { id: topic.id, n }
  }
  return best?.id || null
}

// ---------- display helpers ----------

export const dateKey = ({ y, m, d }) => `${y}-${pad2(m)}-${pad2(d)}`
export function parseDateKey(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '')
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null
}
