import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, BellRing, Repeat, ChevronDown, Sparkles } from 'lucide-react'
import { useStore, createReminder, toast } from '../store'
import { goBack, navigate } from '../router'
import { openReminderEditor } from '../ui'
import { NavBar } from './Topic'
import ReminderForm from '../components/ReminderForm'
import ReminderRow from '../components/ReminderRow'
import NotificationCard from '../components/NotificationCard'
import { parseReminder } from '../lib/reminderParse'
import { draftFromParse, emptyDraft } from '../lib/reminderDraft'
import { whenLabel, relativeHint, userTimezone, recurrenceLabel, dayLabel } from '../lib/reminderFormat'
import { usePush } from '../lib/push'
import useNow from '../lib/useNow'

const EXAMPLES = ['מחר בארבע בצהריים לאסוף חבילה מהסופר', 'בעוד 30 דקות לבדוק את התנור', 'כל יום ראשון ב-20:00 לעבור על היעדים', 'Remind me to call the dentist on Thursday at 10 AM']

export default function Reminders({ topicId = null, reminderId = null }) {
  const { reminders, topics, status } = useStore()
  const now = useNow(30e3)
  const tz = useMemo(userTimezone, [])
  const [showDone, setShowDone] = useState(false)

  // Opened from a notification: show that reminder.
  useEffect(() => {
    if (!reminderId) return
    if (reminders.some((r) => r.id === reminderId)) {
      openReminderEditor(reminderId)
      navigate('/reminders', { replace: true })
    } else if (status === 'ready') {
      toast('התזכורת הזו כבר לא קיימת')
      navigate('/reminders', { replace: true })
    }
  }, [reminderId, reminders, status])

  const groups = useMemo(() => {
    const pending = reminders.filter((r) => r.status === 'pending')
    const byDue = (a, b) => a.due_at.localeCompare(b.due_at)
    const overdue = pending.filter((r) => !r.recurrence && Date.parse(r.due_at) <= now).sort(byDue)
    const upcoming = pending.filter((r) => !r.recurrence && Date.parse(r.due_at) > now).sort(byDue)
    const recurring = pending.filter((r) => r.recurrence).sort(byDue)
    const done = reminders
      .filter((r) => r.status === 'completed')
      .sort((a, b) => (b.completed_at || b.updated_at).localeCompare(a.completed_at || a.updated_at))
    const next = pending.filter((r) => Date.parse(r.due_at) > now).sort(byDue)[0] || null
    return { overdue, upcoming, recurring, done, next }
  }, [reminders, now])

  const empty = !reminders.length

  return (
    <div className="screen reminders-screen">
      <NavBar onBack={() => goBack('/')} title="תזכורות" />

      <Composer tz={tz} now={now} topicId={topicId && topics.some((t) => t.id === topicId) ? topicId : null} />

      <NotificationCard variant="banner" />

      {groups.next && <NextUp r={groups.next} now={now} />}

      {groups.overdue.length > 0 && (
        <Section title="באיחור" count={groups.overdue.length} tone="late">
          {groups.overdue.map((r) => (
            <ReminderRow key={r.id} reminder={r} now={now} />
          ))}
        </Section>
      )}
      {groups.upcoming.length > 0 && (
        <Section title="הבאות" count={groups.upcoming.length}>
          {groups.upcoming.map((r) => (
            <ReminderRow key={r.id} reminder={r} now={now} />
          ))}
        </Section>
      )}
      {groups.recurring.length > 0 && (
        <Section title="חוזרות" count={groups.recurring.length} icon={<Repeat size={14} />}>
          {groups.recurring.map((r) => (
            <ReminderRow key={r.id} reminder={r} now={now} />
          ))}
        </Section>
      )}
      {groups.done.length > 0 && (
        <>
          <button type="button" className="section-toggle" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
            <span>
              הושלמו <span className="count">{groups.done.length}</span>
            </span>
            <ChevronDown size={18} className={showDone ? 'flip' : ''} />
          </button>
          {showDone && (
            <div className="list-card">
              {groups.done.slice(0, 50).map((r) => (
                <ReminderRow key={r.id} reminder={r} now={now} />
              ))}
            </div>
          )}
        </>
      )}

      {empty && (
        <div className="empty small reminders-empty">
          <div className="empty-art" aria-hidden="true">
            <BellRing size={30} />
          </div>
          <h2>כתוב מה להזכיר לך ומתי</h2>
          <p>במילים שלך, בעברית או באנגלית. למשל:</p>
          <div className="examples">
            {EXAMPLES.map((e) => (
              <button key={e} type="button" className="example-chip" dir="auto" onClick={() => window.dispatchEvent(new CustomEvent('nx-reminder-example', { detail: e }))}>
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, count, tone = '', icon = null, children }) {
  return (
    <>
      <div className={'section-head small ' + tone}>
        <h2>
          {icon}
          {title} <span className="count">{count}</span>
        </h2>
      </div>
      <div className="list-card">{children}</div>
    </>
  )
}

function NextUp({ r, now }) {
  const due = Date.parse(r.due_at)
  return (
    <button type="button" className="next-up" onClick={() => openReminderEditor(r.id)}>
      <span className="next-up-icon">
        <BellRing size={20} />
      </span>
      <span className="next-up-text">
        <span className="eyebrow">התזכורת הבאה · {relativeHint(due, now)}</span>
        <span className="next-up-title" dir="auto">
          {r.title}
        </span>
        <span className="muted small">
          {whenLabel(due, r.timezone, now)}
          {r.recurrence && ` · ${recurrenceLabel(r.recurrence)}`}
        </span>
      </span>
    </button>
  )
}

// Type a reminder in your own words; confirm (and fix) what was understood; save.
function Composer({ tz, now, topicId }) {
  const { topics } = useStore()
  const push = usePush()
  const [text, setText] = useState('')
  const [draft, setDraft] = useState(null) // non-null = confirming
  const fieldRef = useRef(null)

  const parsed = useMemo(() => (text.trim() ? parseReminder(text, { now, tz, topics }) : null), [text, tz, topics, now])

  useEffect(() => {
    const onExample = (e) => {
      setText(e.detail)
      setDraft(draftFromParse(parseReminder(e.detail, { now: Date.now(), tz, topics }), topicId))
    }
    window.addEventListener('nx-reminder-example', onExample)
    return () => window.removeEventListener('nx-reminder-example', onExample)
  }, [tz, topics, topicId])

  useEffect(() => {
    if (topicId) fieldRef.current?.focus({ preventScroll: true })
  }, [topicId])

  const confirm = () => {
    if (!text.trim()) return fieldRef.current?.focus()
    setDraft(draftFromParse(parseReminder(text, { now: Date.now(), tz, topics }), topicId))
  }
  const reset = () => {
    setText('')
    setDraft(null)
  }

  const save = (res) => {
    const r = createReminder({
      title: draft.title,
      notes: draft.notes,
      topicId: draft.topicId,
      dueAt: new Date(res.dueMs).toISOString(),
      timezone: tz,
      recurrence: res.recurrence,
    })
    reset()
    const pushOff = push.status !== 'on' && push.status !== 'checking'
    toast(`נקבעה ל${whenLabel(res.dueMs, tz)}${pushOff ? '. כדי לקבל התראה, הפעל התראות.' : ''}`, { label: 'עריכה', run: () => openReminderEditor(r.id) }, 5000)
  }

  return (
    <div className={'composer' + (draft ? ' confirming' : '')}>
      <div className="composer-input">
        <textarea
          ref={fieldRef}
          dir="auto"
          rows={1}
          value={text}
          placeholder="מה להזכיר לך, ומתי?"
          aria-label="תזכורת חדשה"
          enterKeyHint="next"
          onChange={(e) => {
            setText(e.target.value)
            if (draft) setDraft(draftFromParse(parseReminder(e.target.value, { now: Date.now(), tz, topics }), draft.topicId || topicId))
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (!draft) confirm()
            }
            if (e.key === 'Escape' && draft) setDraft(null)
          }}
        />
        {!draft && (
          <button type="button" className="composer-go" aria-label="המשך" disabled={!text.trim()} onClick={confirm}>
            <ArrowUp size={20} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {!draft && parsed && (
        <div className="composer-hint" aria-live="polite">
          <Sparkles size={14} />
          {parsed.dueMs != null && !parsed.past ? (
            <span>
              {whenLabel(parsed.dueMs, tz, now)}
              {parsed.rule && ` · ${recurrenceLabel(parsed.rule)}`}
            </span>
          ) : parsed.needs === 'when' ? (
            <span className="muted">אפשר לכתוב גם מתי, למשל ״מחר ב־9״</span>
          ) : (
            <span className="muted">{parsed.date ? dayLabel(parsed.date, tz, now) + ' · ' : ''}חסרה שעה, נשאל אותך</span>
          )}
        </div>
      )}

      {draft && (
        <div className="composer-confirm">
          <ReminderForm draft={draft} onChange={setDraft} tz={tz} now={now} onSubmit={save} />
          <button type="button" className="text-btn center composer-cancel" onClick={() => setDraft(null)}>
            ביטול
          </button>
        </div>
      )}
    </div>
  )
}
