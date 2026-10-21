import { useEffect, useMemo, useState } from 'react'
import { Search, X, Check } from 'lucide-react'
import Sheet from './Sheet'
import TopicIcon from './TopicIcon'
import { useStore } from '../store'
import { normalize } from '../lib/search'
import { sortTopics, topicStats } from '../lib/topics'

export default function MoveSheet({ open, onClose, currentId, onPick }) {
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
