import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, Maximize2, X } from 'lucide-react'
import Sheet from './Sheet'
import TopicIcon from './TopicIcon'
import { useStore, createItem, createTopic, toast } from '../store'
import { useUI, closeCapture, registerCaptureField } from '../ui'
import { navigate } from '../router'
import { sortTopics, topicStats } from '../lib/topics'
import { normalize } from '../lib/search'
import { guessIcon } from '../lib/icons'
import { nextColor } from '../lib/colors'

const DRAFT_KEY = 'nx-draft'

function loadDraft() {
  try {
    return localStorage.getItem(DRAFT_KEY) || ''
  } catch {
    return ''
  }
}

export default function QuickCapture() {
  const { capture } = useUI()
  const { topics, items, prefs } = useStore()
  const open = !!capture
  const [text, setText] = useState(loadDraft)
  const [topicId, setTopicId] = useState(null)
  const [filter, setFilter] = useState('')
  const [nudge, setNudge] = useState(false)
  const [addingTopic, setAddingTopic] = useState(false)
  const filterRef = useRef(null)
  const fieldRef = useRef(null)
  const chipsRef = useRef(null)

  useEffect(() => {
    registerCaptureField(fieldRef.current)
  }, [])

  useEffect(() => {
    if (!capture) return
    setTopicId(capture.topicId && topics.some((t) => t.id === capture.topicId) ? capture.topicId : null)
    setFilter('')
    setNudge(false)
    setAddingTopic(false)
    requestAnimationFrame(() => {
      fieldRef.current?.focus({ preventScroll: true })
      chipsRef.current?.querySelector('.chip.selected')?.scrollIntoView({ inline: 'center', block: 'nearest' })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture?.at])

  useEffect(() => {
    try {
      if (text) localStorage.setItem(DRAFT_KEY, text)
      else localStorage.removeItem(DRAFT_KEY)
    } catch {}
  }, [text])

  useEffect(() => {
    const el = fieldRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, window.innerHeight * 0.4) + 'px'
  }, [text, open])

  const ordered = useMemo(() => {
    const stats = topicStats(items)
    // Most recently used first: that is almost always where a new thought goes.
    return sortTopics(topics, stats, 'recent')
  }, [topics, items])

  const visible = useMemo(() => {
    const q = normalize(filter.trim())
    const list = q ? ordered.filter((t) => normalize(t.name).includes(q)) : ordered
    // Keep the chosen topic visible even when filtering.
    if (topicId && !list.some((t) => t.id === topicId)) {
      const sel = ordered.find((t) => t.id === topicId)
      if (sel) return [sel, ...list]
    }
    return list
  }, [ordered, filter, topicId])

  const exact = filter.trim() && ordered.some((t) => normalize(t.name) === normalize(filter.trim()))
  const showFilter = topics.length > 6 || addingTopic || !topics.length
  const selected = topics.find((t) => t.id === topicId)

  const makeTopic = (name) => {
    const t = createTopic({ name, icon: guessIcon(name) || 'lightbulb', color: nextColor(topics) })
    setTopicId(t.id)
    setFilter('')
    setAddingTopic(false)
    return t
  }

  const save = (openFull = false) => {
    const content = text.replace(/\s+$/, '')
    let tid = topicId
    if (!tid && filter.trim() && !exact) tid = makeTopic(filter.trim()).id
    if (!tid) {
      setNudge(true)
      setTimeout(() => setNudge(false), 600)
      return
    }
    if (!content.trim() && !openFull) {
      fieldRef.current?.focus()
      return
    }
    const item = createItem({ topicId: tid, content })
    setText('')
    closeCapture()
    const topic = topics.find((t) => t.id === tid)
    if (openFull) navigate(`/i/${item.id}/new`)
    else toast(`נשמר ב${topic ? '״' + topic.name + '״' : 'נושא'}`, { label: 'פתח', run: () => navigate(`/i/${item.id}`) })
  }

  return (
    <Sheet open={open} onClose={closeCapture} label="הוסף רעיון" className="capture-sheet">
      <div className="sheet-head">
        <button type="button" className="text-btn" onClick={closeCapture}>
          ביטול
        </button>
        <div className="sheet-title">רעיון חדש</div>
        <button type="button" className="pill-btn" onClick={() => save(false)} disabled={!text.trim()}>
          שמור
        </button>
      </div>

      <textarea
        ref={fieldRef}
        className="capture-field"
        dir="auto"
        placeholder="מה עובר לך בראש?"
        value={text}
        rows={3}
        enterKeyHint="enter"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            save(false)
          }
        }}
      />

      <div className={'capture-topics' + (nudge ? ' nudge' : '')}>
        <div className="capture-topics-head">
          <span>{selected ? 'יישמר ב:' : topics.length ? 'לאיזה נושא?' : 'צור נושא ראשון:'}</span>
          <button type="button" className="text-btn small" onClick={() => save(true)} aria-label="פתח כפתק מלא">
            <Maximize2 size={15} /> פתק מלא
          </button>
        </div>
        {showFilter && (
          <label className="chip-search">
            {topics.length ? <Search size={16} /> : <Plus size={16} />}
            <input
              ref={filterRef}
              type="text"
              dir="auto"
              placeholder={!topics.length ? 'למשל: רעיונות לאתר' : addingTopic ? 'שם הנושא החדש' : 'חיפוש או נושא חדש'}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (visible.length === 1 && filter.trim()) {
                    setTopicId(visible[0].id)
                    setFilter('')
                  } else if (filter.trim() && !exact) makeTopic(filter.trim())
                }
              }}
            />
            {filter && (
              <button type="button" className="icon-btn tiny" aria-label="נקה" onClick={() => setFilter('')}>
                <X size={14} />
              </button>
            )}
          </label>
        )}
        <div className="chips" ref={chipsRef}>
          {visible.map((t) => (
            <button
              key={t.id}
              type="button"
              className={'chip' + (t.id === topicId ? ' selected' : '')}
              aria-pressed={t.id === topicId}
              onClick={() => setTopicId(t.id === topicId ? null : t.id)}
            >
              <TopicIcon topic={t} size={22} radius={7} />
              <span>{t.name}</span>
            </button>
          ))}
          {filter.trim() && !exact && (
            <button type="button" className="chip new" onClick={() => makeTopic(filter.trim())}>
              <Plus size={16} />
              <span>צור ״{filter.trim()}״</span>
            </button>
          )}
          {!filter && topics.length > 0 && !showFilter && (
            <button
              type="button"
              className="chip new"
              onClick={() => {
                filterRef.current?.focus()
                setAddingTopic(true)
                setTimeout(() => filterRef.current?.focus(), 30)
              }}
            >
              <Plus size={16} />
              <span>נושא חדש</span>
            </button>
          )}
        </div>
      </div>
    </Sheet>
  )
}
