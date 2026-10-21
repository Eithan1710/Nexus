import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Pin, Ellipsis, ListChecks, List, Heading, Bold, Code, Check, ChevronDown } from 'lucide-react'
import { useStore, updateItem, discardItem, toast } from '../store'
import { goBack, navigate } from '../router'
import { NavBar } from './Topic'
import TopicIcon from '../components/TopicIcon'
import ContentView, { toggleCheckLine } from '../components/ContentView'
import useItemActions from '../components/ItemActions'
import { timeAgo, fullDate } from '../lib/format'

export default function Item({ id, isNew, startEditing: startInEdit }) {
  const { items, topics, status, pending, online } = useStore()
  const item = items.find((i) => i.id === id)
  const topic = item && topics.find((t) => t.id === item.topic_id)

  const [title, setTitle] = useState(item?.title || '')
  const [content, setContent] = useState(item?.content || '')
  const [editing, setEditing] = useState(isNew || startInEdit || (item && !item.content && !item.title))
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

  const editRef = useRef(null)
  const actions = useItemActions(item, {
    onEdit: () => editRef.current?.(),
    onBeforeChange: () => commit(),
    onDeleted: () => {
      dirty.current = false
      latest.current = { title: 'x', content: '' } // prevent discard-on-leave
      goBack(topic ? `/t/${topic.id}` : '/')
    },
  })

  useLayoutEffect(() => {
    if ((isNew || startInEdit) && item) requestAnimationFrame(() => bodyRef.current?.focus())
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

  editRef.current = startEditing

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
            <button type="button" className="crumb" onClick={actions.startMove} aria-label={`נושא: ${topic.name}. לחץ להעברה`}>
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
              <button type="button" className="icon-btn" aria-label="אפשרויות" onClick={actions.open}>
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

      {actions.elements}
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
  const m = line.match(/^(\s*)([-*•]\s+\[[ xX✓]\]\s|[-*•]\s|(\d+)[.)]\s)/)
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
  prefix = prefix.replace(/\[[xX✓]\]/, '[ ]')
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
      const stripped = line.replace(/^([-*•]\s+\[[ xX✓]\]\s|[-*•]\s|#{1,3}\s)/, '')
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
      <button type="button" aria-label="רשימת משימות" onClick={() => linePrefix('- [ ] ', /^[-*•]\s+\[[ xX✓]\]\s/)}>
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
