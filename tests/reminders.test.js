// Run with: npm test  (node's built-in test runner, no extra dependencies)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseReminder } from '../src/lib/reminderParse.js'
import { zonedToUtc, localParts, nextOccurrence, firstOccurrence } from '../supabase/functions/_shared/nx-time.js'
import { deliveryOutcome, classifyPushError, retryDelayMs, MAX_ATTEMPTS, notificationPayload } from '../supabase/functions/_shared/nx-delivery.js'

const TZ = 'Asia/Jerusalem'
// Wednesday 21 Oct 2026, 15:00 in Jerusalem (UTC+3, summer time still on).
const NOW = Date.parse('2026-10-21T12:00:00Z')
const at = (ms) => {
  const p = localParts(ms, TZ)
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')} ${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`
}
const parse = (text, opts = {}) => parseReminder(text, { now: NOW, tz: TZ, ...opts })

// ---------- timezone ----------

test('zonedToUtc uses the right offset in summer and winter', () => {
  assert.equal(new Date(zonedToUtc({ y: 2026, m: 7, d: 1, h: 16, min: 0 }, TZ)).toISOString(), '2026-07-01T13:00:00.000Z')
  assert.equal(new Date(zonedToUtc({ y: 2026, m: 12, d: 1, h: 16, min: 0 }, TZ)).toISOString(), '2026-12-01T14:00:00.000Z')
})

test('a time skipped by the spring-forward jump moves forward', () => {
  // Israel jumps 02:00 -> 03:00 on Friday 27 March 2026.
  const ms = zonedToUtc({ y: 2026, m: 3, d: 27, h: 2, min: 30 }, TZ)
  assert.equal(at(ms), '2026-03-27 03:30')
})

test('a repeated fall-back time resolves to its first occurrence', () => {
  // Israel falls back 02:00 -> 01:00 on Sunday 25 October 2026.
  const ms = zonedToUtc({ y: 2026, m: 10, d: 25, h: 1, min: 30 }, TZ)
  assert.equal(new Date(ms).toISOString(), '2026-10-24T22:30:00.000Z') // still UTC+3
})

test('daily 08:00 keeps its wall-clock time across the October DST change', () => {
  const rule = { freq: 'daily', time: '08:00' }
  let t = firstOccurrence(rule, TZ, Date.parse('2026-10-23T12:00:00Z'))
  const seen = []
  for (let i = 0; i < 4; i++) {
    seen.push([at(t), new Date(t).toISOString().slice(11, 16)])
    t = nextOccurrence(rule, TZ, t, t)
  }
  assert.deepEqual(seen, [
    ['2026-10-24 08:00', '05:00'],
    ['2026-10-25 08:00', '06:00'], // winter time: UTC+2
    ['2026-10-26 08:00', '06:00'],
    ['2026-10-27 08:00', '06:00'],
  ])
})

// ---------- recurrence ----------

test('weekly on Sunday 20:00', () => {
  const rule = { freq: 'weekly', days: [0], time: '20:00' }
  const first = firstOccurrence(rule, TZ, NOW)
  assert.equal(at(first), '2026-10-25 20:00')
  assert.equal(at(nextOccurrence(rule, TZ, first, first)), '2026-11-01 20:00')
})

test('weekly on several days, and every other week', () => {
  const multi = { freq: 'weekly', days: [1, 3], time: '07:00' }
  let t = firstOccurrence(multi, TZ, NOW)
  const got = []
  for (let i = 0; i < 3; i++, t = nextOccurrence(multi, TZ, t, t)) got.push(at(t))
  assert.deepEqual(got, ['2026-10-26 07:00', '2026-10-28 07:00', '2026-11-02 07:00'])

  const biweekly = { freq: 'weekly', interval: 2, days: [4], time: '09:00' }
  const a = firstOccurrence(biweekly, TZ, NOW)
  const b = nextOccurrence(biweekly, TZ, a, a)
  assert.equal(at(a), '2026-10-22 09:00')
  assert.equal(at(b), '2026-11-05 09:00')
})

test('monthly on the 31st falls back to the last day of shorter months', () => {
  const rule = { freq: 'monthly', monthDay: 31, time: '10:00' }
  let t = firstOccurrence(rule, TZ, NOW)
  const got = []
  for (let i = 0; i < 4; i++, t = nextOccurrence(rule, TZ, t, t)) got.push(at(t))
  assert.deepEqual(got, ['2026-10-31 10:00', '2026-11-30 10:00', '2026-12-31 10:00', '2027-01-31 10:00'])
})

test('yearly on 29 February uses 28 February in other years', () => {
  const rule = { freq: 'yearly', month: 2, monthDay: 29, time: '09:00' }
  const t = firstOccurrence(rule, TZ, NOW)
  assert.equal(at(t), '2027-02-28 09:00')
  assert.equal(at(nextOccurrence(rule, TZ, Date.parse('2028-01-01T00:00:00Z'), t)), '2028-02-29 09:00')
})

test('a series that fell far behind skips to the next future occurrence', () => {
  const rule = { freq: 'daily', time: '09:00' }
  const old = zonedToUtc({ y: 2026, m: 10, d: 1, h: 9, min: 0 }, TZ)
  assert.equal(at(nextOccurrence(rule, TZ, NOW, old)), '2026-10-22 09:00')
})

// ---------- parsing: the user's examples ----------

test('Tomorrow at 4 PM, pick up my package from the supermarket.', () => {
  const r = parse('Tomorrow at 4 PM, pick up my package from the supermarket.')
  assert.equal(r.title, 'Pick up my package from the supermarket')
  assert.equal(at(r.dueMs), '2026-10-22 16:00')
  assert.equal(r.needs, null)
})

test('Remind me to call my dentist on Thursday at 10 AM.', () => {
  const r = parse('Remind me to call my dentist on Thursday at 10 AM.')
  assert.equal(r.title, 'Call my dentist')
  assert.equal(at(r.dueMs), '2026-10-22 10:00')
})

test('Pay my phone bill on the 1st of next month: asks for the time', () => {
  const r = parse('Pay my phone bill on the 1st of next month.')
  assert.equal(r.title, 'Pay my phone bill')
  assert.deepEqual(r.date, { y: 2026, m: 11, d: 1 })
  assert.equal(r.time, null)
  assert.equal(r.needs, 'time')
  assert.equal(r.dueMs, null)
})

test('Remind me in 30 minutes to check the oven.', () => {
  const r = parse('Remind me in 30 minutes to check the oven.')
  assert.equal(r.title, 'Check the oven')
  assert.equal(r.relative, true)
  assert.equal(r.dueMs, NOW + 30 * 60e3)
})

test('Every Sunday at 8 PM, review my weekly goals.', () => {
  const r = parse('Every Sunday at 8 PM, review my weekly goals.')
  assert.equal(r.title, 'Review my weekly goals')
  assert.deepEqual(r.rule, { freq: 'weekly', days: [0], time: '20:00' })
  assert.equal(at(r.dueMs), '2026-10-25 20:00')
})

test('מחר בארבע בצהריים: 16:00 tomorrow', () => {
  const r = parse('מחר בארבע בצהריים לאסוף את החבילה מהסופר')
  assert.equal(r.title, 'לאסוף את החבילה מהסופר')
  assert.equal(at(r.dueMs), '2026-10-22 16:00')
})

// ---------- parsing: Hebrew ----------

for (const [text, title, when] of [
  ['תזכיר לי בעוד חצי שעה לבדוק את התנור', 'לבדוק את התנור', '2026-10-21 15:30'],
  ['בעוד שעתיים להוציא כביסה', 'להוציא כביסה', '2026-10-21 17:00'],
  ['ביום חמישי ב-10 בבוקר להתקשר לרופא השיניים', 'להתקשר לרופא השיניים', '2026-10-22 10:00'],
  ['ב-3/11 בשעה 14:30 פגישה עם רואה החשבון', 'פגישה עם רואה החשבון', '2026-11-03 14:30'],
  ['הערב בשמונה וחצי לסגור את הדוח', 'לסגור את הדוח', '2026-10-21 20:30'],
  ['מחרתיים ב-9:15 טסט לרכב', 'טסט לרכב', '2026-10-23 09:15'],
  ['ב-5 בנובמבר ב-18:00 יום הולדת לדנה', 'יום הולדת לדנה', '2026-11-05 18:00'],
  ['בשבת בערב להתקשר לסבתא', 'להתקשר לסבתא', '2026-10-24 20:00'],
]) {
  test(`he: ${text}`, () => {
    const r = parse(text)
    assert.equal(r.title, title)
    assert.equal(at(r.dueMs), when)
  })
}

test('he: recurring with several days', () => {
  const r = parse('כל יום שני ורביעי ב-7 בבוקר חדר כושר')
  assert.equal(r.title, 'חדר כושר')
  assert.deepEqual(r.rule.days, [1, 3])
  assert.equal(r.rule.time, '07:00')
})

test('he: payday on the 1st of next month needs a time', () => {
  const r = parse('לשלם את חשבון הטלפון ב-1 לחודש הבא')
  assert.equal(r.title, 'לשלם את חשבון הטלפון')
  assert.deepEqual(r.date, { y: 2026, m: 11, d: 1 })
  assert.equal(r.needs, 'time')
})

test('he: monthly on a fixed day', () => {
  const r = parse('ב-10 לכל חודש בשעה 9:00 לשלם שכר דירה')
  assert.equal(r.title, 'לשלם שכר דירה')
  assert.deepEqual({ freq: r.rule.freq, monthDay: r.rule.monthDay }, { freq: 'monthly', monthDay: 10 })
  assert.equal(at(r.dueMs), '2026-11-10 09:00')
})

// ---------- ambiguity: never guess silently ----------

test('a bare hour asks morning or evening', () => {
  for (const text of ['call mom at 4', 'מחר בארבע להתקשר לאמא', 'רבע לחמש לצאת']) {
    const r = parse(text)
    assert.equal(r.needs, 'time', text)
    assert.equal(r.dueMs, null, text)
    assert.equal(r.timeOptions.length, 2, text)
  }
  assert.deepEqual(parse('call mom at 4').timeOptions, [{ h: 4, min: 0 }, { h: 16, min: 0 }])
})

test('no date or time at all asks when', () => {
  const r = parse('לקנות חלב')
  assert.equal(r.needs, 'when')
  assert.equal(r.title, 'לקנות חלב')
})

test('a date without a time asks for the time', () => {
  assert.equal(parse('מחר להתקשר לבנק').needs, 'time')
  assert.equal(parse('call the bank on friday').needs, 'time')
})

test('a time with no day means today if still ahead, else tomorrow', () => {
  assert.equal(at(parse('at 18:00 gym').dueMs), '2026-10-21 18:00')
  assert.equal(at(parse('at 9:00 gym').dueMs), '2026-10-22 09:00')
})

test('a time already past today is flagged', () => {
  const r = parse('today at 10am standup')
  assert.equal(r.past, true)
})

test('"weekly" inside the task is not a schedule', () => {
  const r = parse('tomorrow at 9:00 send the weekly report')
  assert.equal(r.rule, null)
  assert.equal(r.title, 'Send the weekly report')
})

test('a topic named in the text is suggested', () => {
  const topics = [{ id: 'a', name: 'calorie tracker' }, { id: 'b', name: 'מתכונים' }]
  assert.equal(parse('Remind me tomorrow at 4 PM to review the ideas for my calorie tracker website', { topics }).topicId, 'a')
  assert.equal(parse('מחר ב-12:00 לנסות את המתכונים החדשים', { topics }).topicId, 'b')
  assert.equal(parse('מחר ב-12:00 לקנות חלב', { topics }).topicId, null)
})

// ---------- delivery: retries and no duplicates ----------

const base = { id: 'r1', title: 'x', notes: '', timezone: TZ, due_at: '2026-10-21T12:00:00.000Z', recurrence: null, delivery_attempts: 1, delivered_at: null }

test('push errors are classified', () => {
  assert.equal(classifyPushError(410), 'gone')
  assert.equal(classifyPushError(404), 'gone')
  assert.equal(classifyPushError(503), 'transient')
  assert.equal(classifyPushError(429), 'transient')
  assert.equal(classifyPushError(undefined), 'transient')
  assert.equal(classifyPushError(400), 'permanent')
})

test('one-off: delivered to any device counts as sent', () => {
  const p = deliveryOutcome(base, [{ ok: false, kind: 'transient', status: 503 }, { ok: true }], NOW)
  assert.equal(p.delivery_status, 'sent')
  assert.equal(p.delivered_at, new Date(NOW).toISOString())
})

test('one-off: temporary failure retries with backoff, then gives up', () => {
  const p = deliveryOutcome(base, [{ ok: false, kind: 'transient', status: 503 }], NOW)
  assert.equal(p.delivery_status, 'retry')
  assert.equal(Date.parse(p.next_attempt_at), NOW + 60e3)
  assert.equal(retryDelayMs(3), 4 * 60e3)
  const last = deliveryOutcome({ ...base, delivery_attempts: MAX_ATTEMPTS }, [{ ok: false, kind: 'transient', status: 503 }], NOW)
  assert.equal(last.delivery_status, 'failed')
})

test('one-off: no registered device retries, then fails as no_device', () => {
  assert.equal(deliveryOutcome(base, [], NOW).delivery_status, 'retry')
  const p = deliveryOutcome({ ...base, delivery_attempts: MAX_ATTEMPTS }, [], NOW)
  assert.deepEqual([p.delivery_status, p.last_error], ['failed', 'no_device'])
})

test('one-off: permanent error does not retry', () => {
  const p = deliveryOutcome(base, [{ ok: false, kind: 'permanent', status: 403 }], NOW)
  assert.deepEqual([p.delivery_status, p.last_error], ['failed', 'push_403'])
})

test('recurring: after sending, the next occurrence is armed exactly once', () => {
  const r = { ...base, recurrence: { freq: 'daily', time: '15:00' } }
  const p = deliveryOutcome(r, [{ ok: true }], NOW + 30e3)
  assert.equal(p.delivery_status, 'scheduled')
  assert.equal(p.delivery_attempts, 0)
  assert.equal(at(Date.parse(p.due_at)), '2026-10-22 15:00')
  // A second run with the same claim would compute the same due_at, never an extra one today.
  assert.equal(deliveryOutcome(r, [{ ok: true }], NOW + 90e3).due_at, p.due_at)
})

test('notification payload links to the reminder', () => {
  const n = notificationPayload({ ...base, title: 'לאסוף חבילה', notes: 'בסופר ליד הבית' }, 'סידורים', NOW)
  assert.equal(n.title, 'לאסוף חבילה')
  assert.equal(n.url, '#/r/r1')
  assert.equal(n.tag, 'nx-r1')
  assert.match(n.body, /15:00 · סידורים\nבסופר ליד הבית/)
})
