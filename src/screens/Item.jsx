import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Pin, PinOff, Pencil, Ellipsis, FolderInput, Trash2, Copy, ListChecks, List, Heading, Bold, Code, Check, Search, X, ChevronDown } from 'lucide-react'
import { useStore, updateItem, deleteItem, discardItem, toast } from '../store'
import { goBack, navigate } from '../router'
import { NavBar } from './Topic'
import TopicIcon from '../components/TopicIcon'
import ContentView, { toggleCheckLine } from '../components/ContentView'
import Menu from '../components/Menu'
import Sheet from '../components/Sheet'
import { timeAgo, fullDate } from '../lib/format'
import { normalize } from '../lib/search'
import { sortTopics, topicStats } from '../lib/topics'

export default function Item({ id, isNew }) {
  const { items, topics, status, pending, online } = useStore()
  const item = items.find((i) => i.id === id)
  const topic = item && topics.find((t) => t.id === item.topic_id)

  const [title, setTitle] = useState(item?.title || '')
  const [content, setContent] = useState(item?.content || '')
  const [editing, setEditing] = useState(isNew || (item && !item.content && !item.title))
  const [menu, setMenu] = useState(false)
  const [moving, setMoving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const dirty = useRef(false)
  const timer = useRef(null)
  const titleRef = useRef(null)
  const bodyRef = useRef(null)
  const latest = useRef({ title, content })
  latest.current = { title, content }

  // Accept changes from the store (sync, conflict copy) while the user isn't mid-edit.
  useEffect(() => {
    if (!item || dirty.current) return
    if (item.title !== latest.current.title) setTitle(item.title)
    if (item.content !== latest.current.content) setContent(item.content)
  }, [item?.title, item?.content]) // eslint-disable-line react-hooks/exhaustive-deps

  const commit = useCallback(() => {
    clearTimeout(timer.current)
    if (!dirty.current) return
    dirty.current = false
    const { title: t, content: c } = latest.current
    updateItem(id, { title: t, content: c })
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1400)
  }, [id])

  const change = (patch) => {
    if ('title' in patch) setTitle(patch.title)
    if ('content' in patch) setContent(patch.content)
    latest.current = { ...latest.current, ...patch }
    dirty.current = true
    clearTimeout(timer.current)
    timer.current = setTimeout(commit, 450)
  }

  // Save on leave; drop a note that was opened and left completely empty.
  useEffect(() => {
    const onHide = () => commit()
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onHide)
      commit()
      const { title: t, content: c } = latest.current
      if (!t.trim() && !c.trim()) discardItem(id)
    }
  }, [id, commit])

  useLayoutEffect(() => {
    if (isNew && item) requestAnimationFrame(() => bodyRef.current?.focus())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    for (const el of [titleRef.current, bodyRef.current]) {
      if (!el) continue
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
    }
  }, [title, content, editing])

  if (!item) {
    return (
      <div className="screen">
        <NavBar onBack={() => goBack('/')} />
        {status !== 'loading' && (
          <div className="empty">
            <h2>הפריט לא נמצא</h2>
            <p>ייתכן שהוא נמחק.</p>
            <button type="button" className="primary-btn" onClick={() => navigate('/', { replace: true })}>
              חזרה לבית
            </button>
          </div>
        )}
      </div>
    )
  }

  const startEditing = (e) => {
    if (e?.target.closest('a,button')) return
    setEditing(true)
    requestAnimationFrame(() => {
      const el = bodyRef.current
      if (!el) return
      el.focus({ preventScroll: true })
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }

  const finish = () => {
    commit()
    setEditing(false)
    document.activeElement?.blur()
  }

  const onToggle = (line) => {
    const next = toggleCheckLine(latest.current.content, line)
    change({ content: next })
    commit()
  }

  const saveState = pending > 0 ? (online ? 'שומר…' : 'שמור במכשיר, יסונכרן כשתהיה רשת') : 'נשמר'

  return (
    <div className="screen item-screen">
      <NavBar
        onBack={() => {
          commit()
          goBack(topic ? `/t/${topic.id}` : '/')
        }}
        backLabel={topic ? `חזרה ל${topic.name}` : 'חזרה'}
        title={
          topic && (
            <button type="button" className="crumb" onClick={() => setMoving(true)} aria-label={`נושא: ${topic.name}. לחץ להעברה`}>
              <TopicIcon topic={topic} size={22} radius={7} />
              <span>{topic.name}</span>
              <ChevronDown size={14} />
            </button>
          )
        }
        right={
          editing ? (
            <button type="button" className="pill-btn" onClick={finish}>
              סיום
            </button>
          ) : (
            <>
              <button
                type="button"
                className={'icon-btn' + (item.pinned ? ' active' : '')}
                aria-label={item.pinned ? 'בטל נעיצה' : 'נעץ'}
                aria-pressed={item.pinned}
                onClick={() => {
                  updateItem(id, { pinned: !item.pinned })
                  toast(item.pinned ? 'הנעיצה בוטלה' : 'ננעץ בראש הנושא')
                }}
              >
                {item.pinned ? <Pin size={21} fill="currentColor" /> : <Pin size={21} />}
              </button>
              <button type="button" className="icon-btn" aria-label="אפשרויות" onClick={() => setMenu(true)}>
                <Ellipsis size={22} />
              </button>
            </>
          )
        }
      />

      <article className={'note' + (editing ? ' editing' : '')}>
        {editing ? (
          <>
            <textarea
              ref={titleRef}
              className="note-title-input"
              dir="auto"
              rows={1}
              placeholder="כותרת"
              value={title}
              maxLength={300}
              enterKeyHint="next"
              onChange={(e) => change({ title: e.target.value.replace(/\n/g, ' ') })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  bodyRef.current?.focus()
                }
              }}
            />
            <textarea
              ref={bodyRef}
              className="note-body-input"
              dir="auto"
              placeholder="כתוב כאן… רעיונות, קישורים, רשימות"
              value={content}
              onChange={(e) => change({ content: e.target.value })}
              onKeyDown={(e) => handleListEnter(e, (v) => change({ content: v }))}
              onBlur={commit}
            />
          </>
        ) : (
          <div onClick={startEditing} className="note-view">
            {title.trim() && (
              <h1 className="note-title" dir="auto">
                {title}
              </h1>
            )}
            {content.trim() ? (
              <ContentView content={content} onToggle={onToggle} />
            ) : (
              <p className="muted">אין תוכן. הקש כדי לכתוב.</p>
            )}
          </div>
        )}
        <div className="note-meta" title={fullDate(item.updated_at)}>
          {savedFlash ? (
            <span className="saved">
              <Check size={13} /> {online ? 'נשמר' : 'נשמר במכשיר'}
            </span>
          ) : (
            <span>
              עודכן {timeAgo(item.updated_at)}
              {pending > 0 && ` · ${saveState}`}
            </span>
          )}
          <span>נוצר {fullDate(item.created_at)}</span>
        </div>
      </article>

      {editing && <FormatBar target={bodyRef} onChange={(v) => change({ content: v })} />}

      <Menu
        open={menu}
        onClose={() => setMenu(false)}
        actions={[
          { label: 'ערוך', icon: Pencil, run: () => startEditing() },
          { label: 'העבר לנושא', icon: FolderInput, run: () => setMoving(true) },
          {
            label: 'העתק טקסט',
            icon: Copy,
            run: () => {
              const text = [title, content].filter((s) => s.trim()).join('\n\n')
              navigator.clipboard?.writeText(text).then(
                () => toast('הועתק'),
                () => toast('לא ניתן להעתיק'),
              )
            },
          },
          item.pinned
            ? { label: 'בטל נעיצה', icon: PinOff, run: () => updateItem(id, { pinned: false }) }
            : { label: 'נעץ', icon: Pin, run: () => updateItem(id, { pinned: true }) },
          {
            label: 'מחק',
            icon: Trash2,
            danger: true,
            run: () => {
              dirty.current = false
              latest.current = { title: 'x', content: '' } // prevent discard-on-leave
              deleteItem(id)
              goBack(topic ? `/t/${topic.id}` : '/')
            },
          },
        ]}
      />
      <MoveSheet
        open={moving}
        onClose={() => setMoving(false)}
        currentId={item.topic_id}
        onPick={(tid) => {
          setMoving(false)
          if (tid === item.topic_id) return
          commit()
          updateItem(id, { topic_id: tid })
          const t = topics.find((x) => x.id === tid)
          toast(`הועבר ל״${t?.name}״`)
        }}
      />
    </div>
  )
}

// Continue "- " / "- [ ] " / "1. " lists on Enter; Enter on an empty bullet ends the list.
function handleListEnter(e, set) {
  if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
  const el = e.currentTarget
  const { selectionStart: s, selectionEnd: end, value } = el
  if (s !== end) return
  const lineStart = value.lastIndexOf('\n', s - 1) + 1
  const line = value.slice(lineStart, s)
  const m = line.match(/^(\s*)([-*•]\s+\[[ xX]\]\s|[-*•]\s|(\d+)[.)]\s)/)
  if (!m) return
  e.preventDefault()
  if (line.trim() === m[0].trim()) {
    const v = value.slice(0, lineStart) + value.slice(s)
    flushSync(() => set(v))
    el.setSelectionRange(lineStart, lineStart)
    return
  }
  let prefix = m[1] + m[2]
  if (m[3]) prefix = m[1] + (Number(m[3]) + 1) + m[2].slice(m[3].length)
  prefix = prefix.replace(/\[[xX]\]/, '[ ]')
  const v = value.slice(0, s) + '\n' + prefix + value.slice(s)
  flushSync(() => set(v))
  const pos = s + 1 + prefix.length
  el.setSelectionRange(pos, pos)
}

function FormatBar({ target, onChange }) {
  const linePrefix = (prefix, re) => {
    const el = target.current
    if (!el) return
    const { selectionStart: s, value } = el
    const lineStart = value.lastIndexOf('\n', s - 1) + 1
    const lineEnd = value.indexOf('\n', s)
    const line = value.slice(lineStart, lineEnd < 0 ? undefined : lineEnd)
    let next
    let delta
    const existing = line.match(re)
    if (existing) {
      next = line.slice(existing[0].length)
      delta = -existing[0].length
    } else {
      const stripped = line.replace(/^([-*•]\s+\[[ xX]\]\s|[-*•]\s|#{1,3}\s)/, '')
      next = prefix + stripped
      delta = next.length - line.length
    }
    const v = value.slice(0, lineStart) + next + value.slice(lineStart + line.length)
    flushSync(() => onChange(v))
    const pos = Math.max(lineStart, s + delta)
    el.focus()
    el.setSelectionRange(pos, pos)
  }
  const wrap = (mark) => {
    const el = target.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e, value } = el
    const sel = value.slice(s, e)
    const v = value.slice(0, s) + mark + sel + mark + value.slice(e)
    flushSync(() => onChange(v))
    el.focus()
    el.setSelectionRange(s + mark.length, e + mark.length)
  }
  // preventDefault on pointerdown keeps the textarea focused (and the keyboard up).
  const keep = (e) => e.preventDefault()
  return (
    <div className="format-bar" role="toolbar" aria-label="עיצוב טקסט" onPointerDown={keep} onMouseDown={keep}>
      <button type="button" aria-label="רשימת משימות" onClick={() => linePrefix('- [ ] ', /^[-*•]\s+\[[ xX]\]\s/)}>
        <ListChecks size={21} />
      </button>
      <button type="button" aria-label="רשימה" onClick={() => linePrefix('- ', /^[-*•]\s(?!\[)/)}>
        <List size={21} />
      </button>
      <button type="button" aria-label="כותרת" onClick={() => linePrefix('## ', /^#{1,3}\s/)}>
        <Heading size={21} />
      </button>
      <button type="button" aria-label="מודגש" onClick={() => wrap('**')}>
        <Bold size={21} />
      </button>
      <button type="button" aria-label="קוד" onClick={() => wrap('`')}>
        <Code size={21} />
      </button>
    </div>
  )
}

export function MoveSheet({ open, onClose, currentId, onPick }) {
  const { topics, items } = useStore()
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const sorted = sortTopics(topics, topicStats(items), 'recent')
    const n = normalize(q.trim())
    return n ? sorted.filter((t) => normalize(t.name).includes(n)) : sorted
  }, [topics, items, q])
  useEffect(() => {
    if (open) setQ('')
  }, [open])
  return (
    <Sheet open={open} onClose={onClose} label="העבר לנושא" className="move-sheet">
      <div className="sheet-head">
        <button type="button" className="text-btn" onClick={onClose}>
          ביטול
        </button>
        <div className="sheet-title">העבר לנושא</div>
        <span className="sheet-head-spacer" />
      </div>
      {topics.length > 6 && (
        <label className="search-field in-sheet">
          <Search size={17} />
          <input type="search" dir="auto" placeholder="חיפוש נושא" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && (
            <button type="button" className="icon-btn tiny" aria-label="נקה" onClick={() => setQ('')}>
              <X size={14} />
            </button>
          )}
        </label>
      )}
      <div className="move-list">
        {list.map((t) => (
          <button key={t.id} type="button" className={'move-row' + (t.id === currentId ? ' current' : '')} onClick={() => onPick(t.id)}>
            <TopicIcon topic={t} size={34} />
            <span dir="auto">{t.name}</span>
            {t.id === currentId && <Check size={18} className="check" />}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
