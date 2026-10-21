import { useEffect, useState } from 'react'
import { Check, AlarmClock, Trash2, RotateCcw, Hash } from 'lucide-react'
import Sheet from './Sheet'
import ReminderForm from './ReminderForm'
import { useStore, updateReminder, deleteReminder } from '../store'
import { useUI, closeReminderEditor } from '../ui'
import { navigate } from '../router'
import { draftFromReminder, completeReminder, snoozeReminder, tomorrowMorning } from '../lib/reminderDraft'
import { whenLabel } from '../lib/reminderFormat'
import useNow from '../lib/useNow'

// Edit sheet for an existing reminder. Opened from the list, or from a tapped notification.
export default function ReminderEditor() {
  const { reminderEditor } = useUI()
  const { reminders, topics } = useStore()
  const r = reminderEditor ? reminders.find((x) => x.id === reminderEditor.id) : null
  const [draft, setDraft] = useState(null)
  const now = useNow(20e3)

  useEffect(() => {
    if (r) setDraft(draftFromReminder(r))
    // Only when a reminder is opened, not on every background refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminderEditor?.at, !!r])

  const open = !!reminderEditor && !!r && !!draft
  const done = r?.status !== 'pending'
  const due = r ? Date.parse(r.due_at) : 0
  const topic = r?.topic_id && topics.find((t) => t.id === r.topic_id)

  const close = () => closeReminderEditor()
  const act = (fn) => () => {
    fn()
    close()
  }

  return (
    <Sheet open={open} onClose={close} label="תזכורת" className="reminder-sheet">
      <div className="sheet-head">
        <button type="button" className="text-btn" onClick={close}>
          סגור
        </button>
        <div className="sheet-title">{done ? 'תזכורת שהושלמה' : r?.recurrence ? 'תזכורת חוזרת' : 'תזכורת'}</div>
        <button type="button" className="icon-btn" aria-label="מחק תזכורת" onClick={act(() => deleteReminder(r.id))}>
          <Trash2 size={20} />
        </button>
      </div>
      {open && (
        <div className="reminder-sheet-body">
          {!done ? (
            <div className="rs-quick">
              <button type="button" className="rs-btn primary" onClick={act(() => completeReminder(r))}>
                <Check size={18} /> {r.recurrence ? 'בוצע, לפעם הבאה' : 'סמן כבוצע'}
              </button>
              <button type="button" className="rs-btn" onClick={act(() => snoozeReminder(r, 10 * 60e3))}>
                <AlarmClock size={18} /> 10 דק׳
              </button>
              <button type="button" className="rs-btn" onClick={act(() => snoozeReminder(r, 3600e3))}>
                שעה
              </button>
              <button type="button" className="rs-btn" onClick={act(() => snoozeReminder(r, tomorrowMorning(r.timezone) - Date.now()))}>
                מחר 09:00
              </button>
            </div>
          ) : (
            <p className="hint">
              הושלמה {r.completed_at ? whenLabel(Date.parse(r.completed_at), r.timezone, now) : ''}.{' '}
              {due > now ? (
                <button type="button" className="text-btn small inline" onClick={act(() => updateReminder(r.id, { status: 'pending' }))}>
                  <RotateCcw size={14} /> החזר לפעילות
                </button>
              ) : (
                'כדי להחזיר אותה, קבע זמן חדש ושמור.'
              )}
            </p>
          )}
          {topic && (
            <button type="button" className="rs-topic" onClick={act(() => navigate(`/t/${topic.id}`))}>
              <Hash size={15} /> פתח את ״{topic.name}״
            </button>
          )}
          <ReminderForm
            key={reminderEditor.at}
            keepDueMs={due}
            draft={draft}
            onChange={setDraft}
            tz={r.timezone}
            now={now}
            onSubmit={(res) => {
              updateReminder(r.id, {
                title: draft.title.trim(),
                notes: draft.notes,
                topic_id: draft.topicId,
                due_at: new Date(res.dueMs).toISOString(),
                recurrence: res.recurrence,
                status: 'pending',
              })
              close()
            }}
          />
        </div>
      )}
    </Sheet>
  )
}
