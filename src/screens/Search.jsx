import { useEffect, useMemo, useRef, useState, useDeferredValue } from 'react'
import { Search as SearchIcon, X, ChevronRight, ChevronLeft } from 'lucide-react'
import { useStore } from '../store'
import { goBack, navigate } from '../router'
import ItemRow from '../components/ItemRow'
import TopicIcon from '../components/TopicIcon'
import { searchItems, searchTopics } from '../lib/search'
import { countLabel } from '../lib/format'
import { topicStats } from '../lib/topics'

export default function Search() {
  const { items, topics } = useStore()
  const [q, setQ] = useState(() => sessionStorage.getItem('nx-q') || '')
  const deferred = useDeferredValue(q)
  const inputRef = useRef(null)
  const topicsById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics])
  const stats = useMemo(() => topicStats(items), [items])

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    sessionStorage.setItem('nx-q', q)
  }, [q])

  const topicHits = useMemo(() => searchTopics(topics, deferred).slice(0, 6), [topics, deferred])
  const itemHits = useMemo(() => searchItems(items, topicsById, deferred, 150), [items, topicsById, deferred])
  const has = deferred.trim()

  return (
    <div className="screen search-screen">
      <div className="search-bar">
        <button type="button" className="back-btn" aria-label="חזרה" onClick={() => goBack('/')}>
          <ChevronRight size={26} />
        </button>
        <label className="search-field big">
          <SearchIcon size={18} />
          <input
            ref={inputRef}
            type="search"
            dir="auto"
            placeholder="חיפוש בידע שלי"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            enterKeyHint="search"
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur()
                const first = itemHits[0]
                if (first && (e.metaKey || e.ctrlKey)) navigate(`/i/${first.item.id}`)
              }
              if (e.key === 'Escape') q ? setQ('') : goBack('/')
            }}
          />
          {q && (
            <button
              type="button"
              className="icon-btn tiny"
              aria-label="נקה חיפוש"
              onClick={() => {
                setQ('')
                inputRef.current?.focus()
              }}
            >
              <X size={15} />
            </button>
          )}
        </label>
      </div>

      {!has ? (
        <div className="empty small search-hint">
          <p>חפש בכותרות, בתוכן ובשמות הנושאים. עברית ואנגלית.</p>
          <p className="muted">{countLabel(items.length)} ב־{topics.length} נושאים</p>
        </div>
      ) : (
        <>
          {topicHits.length > 0 && (
            <>
              <div className="section-head small">
                <h2>נושאים</h2>
              </div>
              <div className="list-card">
                {topicHits.map((t) => (
                  <button key={t.id} type="button" className="move-row" onClick={() => navigate(`/t/${t.id}`)}>
                    <TopicIcon topic={t} size={34} />
                    <span dir="auto">{t.name}</span>
                    <span className="muted small">{countLabel(stats.get(t.id)?.count || 0)}</span>
                    <ChevronLeft size={18} className="chev" />
                  </button>
                ))}
              </div>
            </>
          )}
          {itemHits.length > 0 && (
            <>
              <div className="section-head small">
                <h2>פריטים · {itemHits.length >= 150 ? '150+' : itemHits.length}</h2>
              </div>
              <div className="list-card">
                {itemHits.map((r) => (
                  <ItemRow key={r.item.id} item={r.item} topic={topicsById.get(r.item.topic_id)} showTopic excerpt={r.excerpt} />
                ))}
              </div>
            </>
          )}
          {!topicHits.length && !itemHits.length && (
            <div className="empty small">
              <div className="empty-art" aria-hidden="true">
                <SearchIcon size={30} />
              </div>
              <h2>לא מצאנו את ״{deferred.trim()}״</h2>
              <p>נסה מילה אחרת או חלק ממילה.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
