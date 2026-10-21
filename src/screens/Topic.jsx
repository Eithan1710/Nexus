import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, Ellipsis, Search, X, Pin, Plus, ArrowUpDown } from 'lucide-react'
import { useStore, touchTopic } from '../store'
import { goBack, navigate } from '../router'
import { openCapture } from '../ui'
import TopicIcon from '../components/TopicIcon'
import ItemRow from '../components/ItemRow'
import Menu from '../components/Menu'
import useTopicActions from '../components/TopicActions'
import { countLabel } from '../lib/format'
import { searchItems } from '../lib/search'
import { colorVars } from '../lib/colors'
import useScrolled from '../lib/useScrolled'

const SORTS = { updated: 'עודכנו לאחרונה', created: 'נוצרו לאחרונה' }

export default function Topic({ id }) {
  const { topics, items, status } = useStore()
  const topic = topics.find((t) => t.id === id)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState(() => sessionStorage.getItem('nx-sort') || 'updated')
  const [sortAnchor, setSortAnchor] = useState(null)
  const closeSort = useCallback(() => setSortAnchor(null), [])
  const actions = useTopicActions(topic, { onDeleted: () => navigate('/', { replace: true }) })
  const scrolled = useScrolled(60)

  // Mark as opened on enter and on leave, so things saved while here don't count as news.
  useEffect(() => {
    if (!topic) return
    touchTopic(id)
    return () => touchTopic(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!topic])

  const mine = useMemo(() => items.filter((i) => i.topic_id === id), [items, id])
  const topicsById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics])

  const results = useMemo(() => (query.trim() ? searchItems(mine, topicsById, query) : null), [mine, topicsById, query])

  const sorted = useMemo(() => {
    const key = sort === 'created' ? 'created_at' : 'updated_at'
    return [...mine].sort((a, b) => b[key].localeCompare(a[key]))
  }, [mine, sort])
  const pinned = sorted.filter((i) => i.pinned)
  const others = sorted.filter((i) => !i.pinned)

  if (!topic) {
    return (
      <div className="screen">
        <NavBar onBack={() => goBack('/')} />
        {status === 'loading' ? null : (
          <div className="empty">
            <h2>הנושא לא נמצא</h2>
            <p>ייתכן שהוא נמחק.</p>
            <button type="button" className="primary-btn" onClick={() => navigate('/', { replace: true })}>
              חזרה לבית
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="screen topic-screen" style={colorVars(topic.color)}>
      <NavBar
        onBack={() => goBack('/')}
        title={scrolled ? topic.name : ''}
        right={
          <button type="button" className="icon-btn" aria-label="אפשרויות נושא" aria-haspopup="menu" onClick={actions.open}>
            <Ellipsis size={22} />
          </button>
        }
      />

      <header className="topic-head">
        <TopicIcon topic={topic} size={56} />
        <div className="topic-head-text">
          <h1 dir="auto">{topic.name}</h1>
          <div className="muted">{countLabel(mine.length)}</div>
        </div>
      </header>

      {mine.length > 0 && (
        <div className="topic-tools">
          <label className="search-field">
            <Search size={17} />
            <input
              type="search"
              dir="auto"
              placeholder={`חיפוש ב${topic.name}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              enterKeyHint="search"
            />
            {query && (
              <button type="button" className="icon-btn tiny" aria-label="נקה חיפוש" onClick={() => setQuery('')}>
                <X size={15} />
              </button>
            )}
          </label>
          <button type="button" className="icon-btn soft" aria-label={`מיון: ${SORTS[sort]}`} aria-haspopup="menu" onClick={(e) => setSortAnchor(e.currentTarget.getBoundingClientRect())}>
            <ArrowUpDown size={19} />
          </button>
        </div>
      )}

      {results ? (
        results.length ? (
          <div className="list-card">
            {results.map((r) => (
              <ItemRow key={r.item.id} item={r.item} excerpt={r.excerpt} />
            ))}
          </div>
        ) : (
          <div className="empty small">
            <p>לא נמצא שום דבר עם ״{query.trim()}״ בנושא הזה.</p>
            <button type="button" className="text-btn" onClick={() => navigate('/search')}>
              חיפוש בכל הנושאים
            </button>
          </div>
        )
      ) : mine.length === 0 ? (
        <div className="empty">
          <div className="empty-art" aria-hidden="true">
            <TopicIcon topic={topic} size={64} />
          </div>
          <h2>אין כאן עדיין מידע</h2>
          <p>רעיון, קישור, רשימת משימות או משהו שלמדת. כל מה שקשור ל{topic.name} נכנס לכאן.</p>
          <button type="button" className="primary-btn" onClick={() => openCapture(topic.id)}>
            <Plus size={20} /> הוסף רעיון ראשון
          </button>
        </div>
      ) : (
        <>
          {pinned.length > 0 && (
            <>
              <div className="section-head small">
                <h2>
                  <Pin size={14} /> נעוצים
                </h2>
              </div>
              <div className="list-card">
                {pinned.map((it) => (
                  <ItemRow key={it.id} item={it} />
                ))}
              </div>
            </>
          )}
          {others.length > 0 && (
            <>
              <div className="section-head small">
                <h2>{pinned.length ? 'כל השאר' : SORTS[sort]}</h2>
              </div>
              <div className="list-card">
                {others.map((it) => (
                  <ItemRow key={it.id} item={it} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {actions.elements}
      <Menu
        anchor={sortAnchor}
        onClose={closeSort}
        title="מיון"
        actions={Object.entries(SORTS).map(([k, label]) => ({
          label,
          checked: k === sort,
          run: () => {
            setSort(k)
            sessionStorage.setItem('nx-sort', k)
          },
        }))}
      />
    </div>
  )
}

export function NavBar({ onBack, backLabel = 'חזרה', title = '', right = null, children }) {
  return (
    <div className="navbar">
      <div className="navbar-inner">
        {onBack ? (
          <button type="button" className="back-btn" onClick={onBack} aria-label={backLabel}>
            <ChevronRight size={26} />
          </button>
        ) : (
          <span />
        )}
        <div className="navbar-title" dir="auto">
          {title}
        </div>
        <div className="navbar-right">{right}</div>
      </div>
      {children}
    </div>
  )
}
