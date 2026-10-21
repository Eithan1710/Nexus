// What to record after trying to deliver one reminder. Pure, so it is unit-tested in node and
// shared with the nx-reminders Edge Function.

import { nextOccurrence, localParts, pad2 } from './nx-time.js'

export const MAX_ATTEMPTS = 6

// Retry backoff after the n-th failed attempt: 1, 2, 4, 8, 16 minutes.
export function retryDelayMs(attempt) {
  return Math.min(16, 2 ** Math.max(0, attempt - 1)) * 60e3
}

// Classify a push service response. 404/410: the subscription is gone for good.
export function classifyPushError(statusCode) {
  if (statusCode === 404 || statusCode === 410) return 'gone'
  if (!statusCode || statusCode === 408 || statusCode === 429 || statusCode >= 500) return 'transient'
  return 'permanent'
}

/**
 * @param reminder  the claimed row (delivery_attempts already counts this attempt)
 * @param results   one entry per subscription: { ok: true } | { ok: false, kind, status }
 * @returns patch for nx_reminders
 */
export function deliveryOutcome(reminder, results, nowMs) {
  const now = new Date(nowMs).toISOString()
  const sent = results.some((r) => r.ok)
  const live = results.filter((r) => r.kind !== 'gone')
  const transient = !sent && (live.length === 0 || live.some((r) => r.kind === 'transient'))
  const error = sent ? null : results.length === 0 || live.length === 0 ? 'no_device' : `push_${live.find((r) => !r.ok)?.status ?? 'error'}`

  // Not delivered yet, but worth another try (temporary error, or no device registered yet).
  if (transient && reminder.delivery_attempts < MAX_ATTEMPTS) {
    return { delivery_status: 'retry', next_attempt_at: new Date(nowMs + retryDelayMs(reminder.delivery_attempts)).toISOString(), last_error: error, claimed_at: null }
  }

  if (reminder.recurrence) {
    // Recurring: move on to the next occurrence whatever happened to this one.
    const dueMs = Date.parse(reminder.due_at)
    const next = nextOccurrence(reminder.recurrence, reminder.timezone, Math.max(nowMs, dueMs), dueMs)
    if (next == null) return { status: 'completed', delivery_status: sent ? 'sent' : 'failed', delivered_at: sent ? now : reminder.delivered_at, last_error: error, claimed_at: null, next_attempt_at: null }
    return {
      due_at: new Date(next).toISOString(),
      delivery_status: 'scheduled',
      delivery_attempts: 0,
      delivered_at: sent ? now : reminder.delivered_at,
      last_error: error,
      claimed_at: null,
      next_attempt_at: null,
    }
  }
  return sent
    ? { delivery_status: 'sent', delivered_at: now, last_error: null, claimed_at: null, next_attempt_at: null }
    : { delivery_status: 'failed', last_error: error, claimed_at: null, next_attempt_at: null }
}

// The notification itself. `url` is relative to the app's scope; the service worker resolves it.
export function notificationPayload(reminder, topicName, nowMs) {
  const p = localParts(Date.parse(reminder.due_at), reminder.timezone)
  const late = nowMs - Date.parse(reminder.due_at) > 10 * 60e3
  const bits = [`${late ? 'היה אמור להזכיר ב־' : ''}${pad2(p.h)}:${pad2(p.min)}`]
  if (topicName) bits.push(topicName)
  const note = (reminder.notes || '').split('\n').find((l) => l.trim())
  return {
    title: reminder.title,
    body: bits.join(' · ') + (note ? '\n' + note.trim().slice(0, 140) : ''),
    tag: 'nx-' + reminder.id,
    id: reminder.id,
    url: '#/r/' + reminder.id,
    ts: Date.parse(reminder.due_at),
  }
}
