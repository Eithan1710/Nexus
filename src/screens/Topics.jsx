import { useMemo, useRef, useState } from 'react'
import { GripVertical, Pin, Plus, Search, X, Ellipsis } from 'lucide-react'
import { useStore, updateTopic, reorderTopics, setPref } from '../store'
import { goBack, navigate } from '../router'
import { openTopicEditor } from '../ui'
import { NavBar } from './Topic'
import TopicIcon from '../components/TopicIcon'
import useTopicActions from '../components/TopicActions'
import { countLabel, timeAgo } from '../lib/format'
import { topicStats, sortTopics } from '../lib/topics'
import { normalize } from '../lib/search'

const ORDERS = { recent: 'לפי שימוש', manual: 'ידני', alpha: 'א–ב' }

export default function Topics() {
  const { topics, items, prefs } = useStore()
  const [q, setQ] = useState('')
  const [reordering, setReordering] = useState(false)
  const stats = useMemo(() => topicStats(items), [items])
  const ordered = useMemo(() => sortTopics(topics, stats, prefs.topicOrder), [topics, stats, prefs.topicOrder])
  const filtered = useMemo(() => {
    const n = normalize(q.trim())
    return n ? ordered.filter((t) => normalize(t.name).includes(n)) : ordered
  }, [ordered, q])

  return (
    <div className="screen topics-screen">
      <NavBar
        onBack={() => goBack('/')}
        title="כל הנושאים"
        right={
          topics.length > 1 && (
            <button type="button" className="text-btn" onClick={() => setReordering((r) => !r)}>
              {reordering ? 'סיום' : 'סידור'}
            </button>
          )
        }
      />

      {reordering ? (
        <Reorder topics={ordered} />
      ) : (
        <>
          <div className="topic-tools">
            <label className="search-field">
              <Search size={17} />
              <input type="search" dir="auto" placeholder="חיפוש נושא" value={q} onChange={(e) => setQ(e.target.value)} />
              {q && (
                <button type="button" className="icon-btn tiny" aria-label="נקה" onClick={() => setQ('')}>
                  <X size={15} />
                </button>
              )}
            </label>
          </div>
          <div className="segmented" role="radiogroup" aria-label="סדר נושאים">
            {Object.entries(ORDERS).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={prefs.topicOrder === k} className={prefs.topicOrder === k ? 'on' : ''} onClick={() => setPref('topicOrder', k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="list-card">
            {filtered.map((t) => {
              const s = stats.get(t.id)
              return (
                <div key={t.id} className="topic-row">
                  <button type="button" className="topic-row-main" onClick={() => navigate(`/t/${t.id}`)}>
                    <TopicIcon topic={t} size={38} />
                    <span className="topic-row-text">
                      <span className="topic-row-name" dir="auto">
                        {t.name}
                      </span>
                      <span className="muted small">
                        {countLabel(s?.count || 0)}
                        {s?.lastUpdate && <> · {timeAgo(s.lastUpdate)}</>}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={'icon-btn' + (t.pinned ? ' active' : '')}
                    aria-label={t.pinned ? `בטל נעיצה של ${t.name}` : `נעץ את ${t.name}`}
                    aria-pressed={t.pinned}
                    onClick={() => updateTopic(t.id, { pinned: !t.pinned })}
                  >
                    <Pin size={18} fill={t.pinned ? 'currentColor' : 'none'} />
                  </button>
                  <TopicRowMore topic={t} />
                </div>
              )
            })}
            {!filtered.length && <div className="empty small"><p>אין נושא בשם הזה.</p></div>}
          </div>
          <button type="button" className="all-topics-row" onClick={() => openTopicEditor({ presetName: q.trim() })}>
            <Plus size={18} />
            <span>{q.trim() ? `צור ״${q.trim()}״` : 'נושא חדש'}</span>
          </button>
        </>
      )}
    </div>
  )
}

// Drag the handle to reorder. Switches the home screen to manual order.
function Reorder({ topics }) {
  const [order, setOrder] = useState(() => topics.map((t) => t.id))
  const [dragId, setDragId] = useState(null)
  const [offset, setOffset] = useState(0)
  const listRef = useRef(null)
  const drag = useRef(null)
  const byId = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics])

  const rowHeight = () => listRef.current?.querySelector('.reorder-row')?.offsetHeight || 60

  const onDown = (e, id) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id, startY: e.clientY, index: order.indexOf(id) }
    setDragId(id)
    setOffset(0)
  }
  const onMove = (e) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.startY
    const h = rowHeight()
    const shift = Math.round(dy / h)
    const target = Math.max(0, Math.min(order.length - 1, d.index + shift))
    if (target !== order.indexOf(d.id)) {
      const next = order.filter((x) => x !== d.id)
      next.splice(target, 0, d.id)
      setOrder(next)
    }
    setOffset(dy - (target - d.index) * h)
  }
  const onUp = () => {
    if (!drag.current) return
    drag.current = null
    setDragId(null)
    setOffset(0)
    reorderTopics(order)
    setPref('topicOrder', 'manual')
  }

  const move = (id, dir) => {
    const i = order.indexOf(id)
    const j = i + dir
    if (j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    setOrder(next)
    reorderTopics(next)
    setPref('topicOrder', 'manual')
  }

  return (
    <>
      <p className="hint">גרור כדי לקבוע את הסדר בבית. נושאים נעוצים תמיד יופיעו ראשונים.</p>
      <div className="list-card reorder" ref={listRef}>
        {order.map((id) => {
          const t = byId.get(id)
          if (!t) return null
          return (
            <div
              key={id}
              className={'reorder-row' + (dragId === id ? ' dragging' : '')}
              style={dragId === id ? { transform: `translateY(${offset}px)` } : undefined}
            >
              <TopicIcon topic={t} size={34} />
              <span className="topic-row-name" dir="auto">
                {t.name}
              </span>
              {t.pinned && <Pin size={14} className="muted" />}
              <button
                type="button"
                className="drag-handle"
                aria-label={`הזז את ${t.name}`}
                onPointerDown={(e) => onDown(e, id)}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') move(id, -1)
                  if (e.key === 'ArrowDown') move(id, 1)
                }}
              >
                <GripVertical size={20} />
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}

function TopicRowMore({ topic }) {
  const actions = useTopicActions(topic)
  return (
    <>
      <button type="button" className="icon-btn" aria-label={`פעולות עבור ${topic.name}`} aria-haspopup="menu" onClick={actions.open}>
        <Ellipsis size={20} />
      </button>
      {actions.elements}
    </>
  )
}
