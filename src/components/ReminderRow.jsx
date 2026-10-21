import { useCallback, useState } from 'react'
import { Check, Ellipsis, Repeat, Pencil, Trash2, AlarmClock, RotateCcw, CircleStop, Hash, TriangleAlert } from 'lucide-react'
import Menu from './Menu'
import { deleteReminder, updateReminder, useStore } from '../store'
import { openReminderEditor } from '../ui'
import { navigate } from '../router'
import { completeReminder, reopenReminder, snoozeReminder, tomorrowMorning } from '../lib/reminderDraft'
import { whenLabel, relativeHint, recurrenceLabel } from '../lib/reminderFormat'
import { colorVars } from '../lib/colors'

export default function ReminderRow({ reminder: r, now, showTopic = true }) {
  const { topics } = useStore()
  const [anchor, setAnchor] = useState(null)
  const close = useCallback(() => setAnchor(null), [])
  const due = Date.parse(r.due_at)
  const done = r.status !== 'pending'
  const overdue = !done && due <= now
  const topic = showTopic && r.topic_id ? topics.find((t) => t.id === r.topic_id) : null

  const actions = done
    ? [
        { label: 'החזר לפעילות', icon: RotateCcw, run: () => (due > now ? reopenReminder(r) : openReminderEditor(r.id)) },
        { label: 'מחיקה', icon: Trash2, danger: true, run: () => deleteReminder(r.id) },
      ]
    : [
        { label: 'עריכה', icon: Pencil, run: () => openReminderEditor(r.id) },
        { label: 'דחה בשעה', icon: AlarmClock, run: () => snoozeReminder(r, 3600e3, Date.now()) },
        { label: 'העבר למחר 09:00', icon: AlarmClock, run: () => snoozeReminder(r, tomorrowMorning(r.timezone) - Date.now()) },
        r.recurrence && { label: 'הפסק את החזרה', icon: CircleStop, run: () => updateReminder(r.id, { status: 'completed' }) },
        { divider: true, key: 'sep' },
        { label: 'מחיקה', icon: Trash2, danger: true, run: () => deleteReminder(r.id) },
      ]

  return (
    <div className={'reminder-row' + (done ? ' done' : '') + (overdue ? ' overdue' : '')}>
      <button
        type="button"
        className="rr-check"
        aria-label={done ? 'החזר לפעילות' : r.recurrence ? 'בוצע, עבור לפעם הבאה' : 'סמן כבוצע'}
        onClick={() => (done ? (due > now ? reopenReminder(r) : openReminderEditor(r.id)) : completeReminder(r))}
      >
        <span className="checkbox">{done && <Check size={14} strokeWidth={3} />}</span>
      </button>
      <button type="button" className="rr-main" onClick={() => openReminderEditor(r.id)}>
        <div className="rr-title" dir="auto">
          {r.title}
        </div>
        <div className="rr-meta">
          <span className={'rr-when' + (overdue ? ' late' : '')}>
            {done ? `בוצעה ${r.completed_at ? whenLabel(Date.parse(r.completed_at), r.timezone, now) : ''}` : whenLabel(due, r.timezone, now)}
            {!done && <span className="muted"> · {relativeHint(due, now)}</span>}
          </span>
          {r.recurrence && (
            <span className="rr-tag">
              <Repeat size={12} /> {recurrenceLabel(r.recurrence)}
            </span>
          )}
          {topic && (
            <span
              className="rr-topic"
              style={colorVars(topic.color)}
              role="link"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/t/${topic.id}`)
              }}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/t/${topic.id}`)}
            >
              <Hash size={11} />
              {topic.name}
            </span>
          )}
          {!done && r.delivery_status === 'failed' && (
            <span className="rr-warn">
              <TriangleAlert size={12} /> ההתראה לא נשלחה
            </span>
          )}
          {!done && r.delivery_status === 'retry' && <span className="rr-warn soft">מנסה לשלוח שוב…</span>}
        </div>
      </button>
      <button type="button" className="row-more" aria-label={`פעולות עבור ${r.title}`} aria-haspopup="menu" onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}>
        <Ellipsis size={20} />
      </button>
      <Menu anchor={anchor} onClose={close} title={r.title} actions={actions} />
    </div>
  )
}
