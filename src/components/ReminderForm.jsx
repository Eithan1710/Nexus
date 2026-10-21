import { useMemo, useState } from 'react'
import { Bell, Repeat, Hash, StickyNote, CircleAlert } from 'lucide-react'
import { useStore } from '../store'
import { resolveDraft } from '../lib/reminderDraft'
import { whenLabel, relativeHint, recurrenceLabel, todayKey, tomorrowKey, DAY_LETTERS, DAY_NAMES, dateInputValue, timeInputValue } from '../lib/reminderFormat'
import { parseDateKey } from '../lib/reminderParse'
import { weekday, pad2 } from '../../supabase/functions/_shared/nx-time.js'
import { sortTopics, topicStats } from '../lib/topics'

const QUICK_TIMES = ['09:00', '12:00', '16:00', '20:00']
const FREQS = [
  ['', 'לא חוזרת'],
  ['daily', 'כל יום'],
  ['weekly', 'כל שבוע'],
  ['monthly', 'כל חודש'],
  ['yearly', 'כל שנה'],
]

const fmt12 = ({ h, min }) => `${h % 12 === 0 ? 12 : h % 12}:${pad2(min)}`

// The compact confirmation: shows exactly when the reminder will fire and lets every part be
// changed. Whatever the parser could not settle (no time, morning or evening) is asked here.
export default function ReminderForm({ draft, onChange, tz, now, onSubmit, autoFocusTitle = false, keepDueMs = null }) {
  const { topics, items } = useStore()
  const [showNotes, setShowNotes] = useState(!!draft.notes)
  const set = (patch) => onChange({ ...draft, ...patch })
  const res = resolveDraft(draft, tz, now)
  // Editing an overdue reminder without moving it (e.g. fixing its title) is fine.
  if (res.problem === 'past' && res.dueMs === keepDueMs) res.problem = null
  const orderedTopics = useMemo(() => sortTopics(topics, topicStats(items), 'alpha'), [topics, items])
  const date = parseDateKey(draft.date)

  const setFreq = (freq) => {
    if (!freq) return set({ rule: null })
    const base = date || parseDateKey(todayKey(tz, now))
    set({ rule: { freq, interval: 1, ...(freq === 'weekly' && { days: draft.rule?.days?.length ? draft.rule.days : [weekday(base)] }) }, date: draft.date || todayKey(tz, now) })
  }
  const toggleDay = (d) => {
    const days = draft.rule.days || []
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort()
    if (next.length) set({ rule: { ...draft.rule, days: next } })
  }

  const ask =
    res.problem === 'ampm' ? (
      <div className="rf-ask">
        <span>
          ב־{fmt12(draft.timeOptions[0])}: בבוקר או אחר הצהריים?
        </span>
        <div className="rf-ask-options">
          {draft.timeOptions.map((o) => (
            <button key={o.h} type="button" className="example-chip" onClick={() => set({ time: `${pad2(o.h)}:${pad2(o.min)}`, timeOptions: null })}>
              {pad2(o.h)}:{pad2(o.min)} {o.h < 12 ? 'בבוקר' : o.h < 17 ? 'אחה״צ' : 'בערב'}
            </button>
          ))}
        </div>
      </div>
    ) : res.problem === 'time' ? (
      <div className="rf-ask">
        <span>באיזו שעה?</span>
        <div className="rf-ask-options">
          {QUICK_TIMES.map((t) => (
            <button key={t} type="button" className="example-chip" onClick={() => set({ time: t })}>
              {t}
            </button>
          ))}
        </div>
      </div>
    ) : res.problem === 'when' || res.problem === 'date' ? (
      <div className="rf-ask">
        <span>מתי להזכיר לך?</span>
        <div className="rf-ask-options">
          <button type="button" className="example-chip" onClick={() => set({ date: dateInputValue(now + 3600e3, tz), time: timeInputValue(Math.ceil((now + 3600e3) / 60e3) * 60e3, tz) })}>
            בעוד שעה
          </button>
          {timeInputValue(now, tz) < '19:30' && (
            <button type="button" className="example-chip" onClick={() => set({ date: todayKey(tz, now), time: '20:00' })}>
              הערב 20:00
            </button>
          )}
          <button type="button" className="example-chip" onClick={() => set({ date: tomorrowKey(tz, now), time: '09:00' })}>
            מחר 09:00
          </button>
        </div>
      </div>
    ) : null

  return (
    <form
      className="rf"
      onSubmit={(e) => {
        e.preventDefault()
        if (!res.problem) onSubmit(res)
      }}
    >
      <div className={'rf-summary' + (res.problem && res.problem !== 'title' ? ' pending' : '') + (res.problem === 'past' ? ' bad' : '')} aria-live="polite">
        <Bell size={18} />
        {res.dueMs != null && res.problem !== 'past' ? (
          <span>
            <b>{whenLabel(res.dueMs, tz, now)}</b>
            <span className="muted"> · {relativeHint(res.dueMs, now)}</span>
            {res.recurrence && <span className="rf-repeat"> · {recurrenceLabel(res.recurrence)}</span>}
          </span>
        ) : res.problem === 'past' ? (
          <span>השעה הזו כבר עברה. בחר זמן עתידי.</span>
        ) : (
          <span className="muted">עוד לא נקבע מתי</span>
        )}
      </div>

      <input
        type="text"
        className="rf-title"
        dir="auto"
        value={draft.title}
        placeholder="מה להזכיר לך?"
        maxLength={300}
        autoFocus={autoFocusTitle}
        onChange={(e) => set({ title: e.target.value })}
        aria-label="משימה"
      />

      {ask}

      <div className="rf-row">
        <label className={'rf-field' + (res.problem === 'date' || res.problem === 'when' ? ' need' : '')}>
          <input type="date" value={draft.date} min={draft.rule ? undefined : todayKey(tz, now)} onChange={(e) => set({ date: e.target.value })} aria-label="תאריך" />
        </label>
        <label className={'rf-field' + (['time', 'ampm', 'when'].includes(res.problem) ? ' need' : '') + (draft.approxTime ? ' approx' : '')}>
          <input type="time" value={draft.time} onChange={(e) => set({ time: e.target.value, timeOptions: null, approxTime: false })} aria-label="שעה" />
        </label>
      </div>
      {draft.approxTime && res.dueMs != null && <p className="rf-note">השעה נקבעה לפי ״{draft.time < '12:00' ? 'בבוקר' : draft.time < '17:00' ? 'צהריים' : 'ערב'}״. אפשר לשנות.</p>}

      <div className="rf-row">
        <label className="rf-field select">
          <Repeat size={17} />
          <select value={draft.rule?.freq || ''} onChange={(e) => setFreq(e.target.value)} aria-label="חזרה">
            {FREQS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="rf-field select">
          <Hash size={17} />
          <select value={draft.topicId || ''} onChange={(e) => set({ topicId: e.target.value || null })} aria-label="נושא">
            <option value="">ללא נושא</option>
            {orderedTopics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {draft.rule?.freq === 'weekly' && (
        <div className="rf-days" role="group" aria-label="ימים">
          {DAY_LETTERS.map((l, d) => (
            <button key={d} type="button" className={'rf-day' + (draft.rule.days?.includes(d) ? ' on' : '')} aria-pressed={!!draft.rule.days?.includes(d)} aria-label={DAY_NAMES[d]} onClick={() => toggleDay(d)}>
              {l}
            </button>
          ))}
        </div>
      )}

      {showNotes ? (
        <textarea className="rf-notes" dir="auto" rows={2} placeholder="פרטים נוספים (לא חובה)" value={draft.notes} maxLength={5000} onChange={(e) => set({ notes: e.target.value })} />
      ) : (
        <button type="button" className="text-btn small rf-add-notes" onClick={() => setShowNotes(true)}>
          <StickyNote size={15} /> הוסף פרטים
        </button>
      )}

      {res.problem === 'title' && draft.title === '' && (
        <p className="rf-note warn">
          <CircleAlert size={14} /> כתוב מה להזכיר לך
        </p>
      )}

      <button type="submit" className="primary-btn wide rf-save" disabled={!!res.problem}>
        שמור תזכורת
      </button>
    </form>
  )
}
