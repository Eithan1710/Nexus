import { useMemo } from 'react'
import { Search, Plus, Settings, ChevronLeft, CloudOff, Sparkles, Pin, Ellipsis } from 'lucide-react'
import { useStore } from '../store'
import { navigate } from '../router'
import { openTopicEditor, focusKeyboardProxy } from '../ui'
import TopicIcon from '../components/TopicIcon'
import useTopicActions from '../components/TopicActions'
import { greeting, timeAgo, countLabel } from '../lib/format'
import { topicStats, sortTopics, hasNews } from '../lib/topics'
import { colorVars } from '../lib/colors'

export default function Home() {
  const { topics, items, prefs, status, online, pending } = useStore()
  const stats = useMemo(() => topicStats(items), [items])
  const ordered = useMemo(() => sortTopics(topics, stats, prefs.topicOrder), [topics, stats, prefs.topicOrder])

  return (
    <div className="screen home">
      <header className="home-head">
        <div>
          <div className="eyebrow">{greeting()}</div>
          <h1 className="home-title">הידע שלי</h1>
        </div>
        <div className="head-actions">
          {(!online || pending > 0) && (
            <span className="sync-badge" title={online ? 'מסנכרן…' : 'לא מקוון, השינויים נשמרים במכשיר'}>
              {online ? <span className="spinner" /> : <CloudOff size={16} />}
            </span>
          )}
          <button type="button" className="icon-btn" aria-label="הגדרות" onClick={() => navigate('/settings')}>
            <Settings size={22} />
          </button>
        </div>
      </header>

      <button type="button" className="search-pill" onClick={() => {
          focusKeyboardProxy()
          navigate('/search')
        }}
        aria-label="חיפוש בידע שלי">
        <Search size={18} />
        <span>חיפוש בידע שלי</span>
      </button>

      {status === 'loading' && !topics.length ? (
        <div className="topic-grid">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="topic-tile skeleton" />
          ))}
        </div>
      ) : topics.length === 0 ? (
        <EmptyHome />
      ) : (
        <>
          <div className="section-head">
            <h2>
              הנושאים שלי <span className="count">{topics.length}</span>
            </h2>
            <button type="button" className="text-btn" onClick={() => openTopicEditor()}>
              <Plus size={18} /> נושא חדש
            </button>
          </div>
          <div className="topic-grid">
            {ordered.map((t) => (
              <TopicTile key={t.id} topic={t} stat={stats.get(t.id)} />
            ))}
          </div>
          {topics.length > 1 && (
            <button type="button" className="all-topics-row subtle" onClick={() => navigate('/topics')}>
              <span>סידור נושאים</span>
              <ChevronLeft size={18} className="chev" />
            </button>
          )}
        </>
      )}
    </div>
  )
}

function EmptyHome() {
  return (
    <div className="empty home-empty">
      <div className="empty-art" aria-hidden="true">
        <Sparkles size={34} />
      </div>
      <h2>מקום אחד לכל מה שחשוב לך לזכור</h2>
      <p>פתח נושא לכל תחום שמעסיק אותך: פרויקט, תחביב, או דברים שלמדת. אחר כך פשוט זרוק לשם רעיונות.</p>
      <button type="button" className="primary-btn" onClick={() => openTopicEditor()}>
        <Plus size={20} /> צור את הנושא הראשון
      </button>
      <div className="examples">
        {['רעיונות לאתר', 'כושר ותזונה', 'תכנות ו-AI', 'התפתחות אישית'].map((n) => (
          <button key={n} type="button" className="example-chip" onClick={() => openTopicEditor({ presetName: n })}>
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

function TopicTile({ topic: t, stat: s }) {
  const actions = useTopicActions(t)
  return (
    <div className="topic-tile" style={colorVars(t.color)}>
      <button type="button" className="tile-hit" onClick={() => navigate(`/t/${t.id}`)} aria-label={t.name} />
      <div className="tile-top">
        <TopicIcon topic={t} size={40} />
        <span className="tile-badges">
          {hasNews(t, s) && <span className="news-dot" aria-label="יש חדש" />}
          {t.pinned && <Pin size={14} className="tile-pin" aria-label="נעוץ" />}
        </span>
        <button type="button" className="tile-more" aria-label={`פעולות עבור ${t.name}`} aria-haspopup="menu" onClick={actions.open}>
          <Ellipsis size={18} />
        </button>
      </div>
      <div className="tile-name" dir="auto">
        {t.name}
      </div>
      <div className="tile-meta">
        {countLabel(s?.count || 0)}
        {s?.lastUpdate && <> · {timeAgo(s.lastUpdate)}</>}
      </div>
      {actions.elements}
    </div>
  )
}
