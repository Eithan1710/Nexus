import { useEffect, useRef, useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
import Sheet from './Sheet'
import TopicIcon from './TopicIcon'
import { Confirm } from './Menu'
import { useStore, createTopic, updateTopic, deleteTopic } from '../store'
import { useUI, closeTopicEditor, registerTopicField } from '../ui'
import { ICON_KEYS, TOPIC_ICONS, guessIcon } from '../lib/icons'
import { COLOR_KEYS, colorVars, nextColor } from '../lib/colors'
import { navigate } from '../router'
import { countLabel } from '../lib/format'

export default function TopicEditor() {
  const { topicEditor } = useUI()
  const { topics, items } = useStore()
  const editing = topicEditor?.topic || null
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('lightbulb')
  const [color, setColor] = useState('indigo')
  const [iconTouched, setIconTouched] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const fieldRef = useRef(null)

  useEffect(() => {
    registerTopicField(fieldRef.current)
  }, [])

  useEffect(() => {
    if (!topicEditor) return
    const t = topicEditor.topic
    const preset = topicEditor.presetName || ''
    setName(t?.name || preset)
    setIcon(t?.icon || guessIcon(preset) || 'lightbulb')
    setColor(t?.color || nextColor(topics))
    setIconTouched(!!t)
    requestAnimationFrame(() => fieldRef.current?.focus({ preventScroll: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicEditor?.at])

  const onName = (v) => {
    setName(v)
    if (!iconTouched) setIcon(guessIcon(v) || 'lightbulb')
  }

  const save = () => {
    const n = name.trim()
    if (!n) return fieldRef.current?.focus()
    if (editing) {
      updateTopic(editing.id, { name: n, icon, color })
      closeTopicEditor()
    } else {
      const t = createTopic({ name: n, icon, color })
      closeTopicEditor()
      if (topicEditor?.openAfter !== false) navigate(`/t/${t.id}`)
    }
  }

  const count = editing ? items.filter((i) => i.topic_id === editing.id).length : 0

  return (
    <>
      <Sheet open={!!topicEditor} onClose={closeTopicEditor} label={editing ? 'עריכת נושא' : 'נושא חדש'} className="topic-sheet">
        <div className="sheet-head">
          <button type="button" className="text-btn" onClick={closeTopicEditor}>
            ביטול
          </button>
          <div className="sheet-title">{editing ? 'עריכת נושא' : 'נושא חדש'}</div>
          <button type="button" className="pill-btn" onClick={save} disabled={!name.trim()}>
            {editing ? 'שמור' : 'צור'}
          </button>
        </div>

        <div className="topic-form">
          <div className="topic-name-row">
            <TopicIcon topic={{ icon, color }} size={52} />
            <input
              ref={fieldRef}
              type="text"
              dir="auto"
              className="topic-name-input"
              placeholder="שם הנושא"
              value={name}
              maxLength={80}
              enterKeyHint="done"
              onChange={(e) => onName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
          </div>

          <div className="field-label">צבע</div>
          <div className="color-row" role="radiogroup" aria-label="צבע">
            {COLOR_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={k === color}
                aria-label={k}
                className={'swatch' + (k === color ? ' selected' : '')}
                style={colorVars(k)}
                onClick={() => setColor(k)}
              >
                {k === color && <Check size={16} strokeWidth={3} />}
              </button>
            ))}
          </div>

          <div className="field-label">סמל</div>
          <div className="icon-grid" role="radiogroup" aria-label="סמל" style={colorVars(color)}>
            {ICON_KEYS.map((k) => {
              const Icon = TOPIC_ICONS[k]
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={k === icon}
                  aria-label={k}
                  className={'icon-choice' + (k === icon ? ' selected' : '')}
                  onClick={() => {
                    setIcon(k)
                    setIconTouched(true)
                  }}
                >
                  <Icon size={22} />
                </button>
              )
            })}
          </div>

          {editing && (
            <button type="button" className="danger-row" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={18} /> מחק נושא
            </button>
          )}
        </div>
      </Sheet>
      <Confirm
        open={confirmDelete}
        title={`למחוק את ״${editing?.name}״?`}
        body={count ? `הנושא וכל ${countLabel(count) === 'פריט אחד' ? 'הפריט שבו' : `${count} הפריטים שבו`} יימחקו לצמיתות. כדאי לייצא גיבוי לפני כן.` : 'הנושא ריק ויימחק.'}
        confirmLabel="מחק"
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          const id = editing.id
          closeTopicEditor()
          deleteTopic(id)
          if (location.hash.includes(id)) navigate('/', { replace: true })
        }}
      />
    </>
  )
}
