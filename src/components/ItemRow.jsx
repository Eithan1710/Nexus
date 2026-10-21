import { Pin } from 'lucide-react'
import TopicIcon from './TopicIcon'
import { itemTitle, itemPreview, timeAgo } from '../lib/format'
import { navigate } from '../router'

export default function ItemRow({ item, topic, showTopic = false, excerpt = null }) {
  const title = itemTitle(item)
  const preview = excerpt ? null : itemPreview(item)
  return (
    <button type="button" className="item-row" onClick={() => navigate(`/i/${item.id}`)}>
      {showTopic && topic && <TopicIcon topic={topic} size={34} />}
      <div className="item-row-body">
        <div className="item-row-title" dir="auto">
          {title}
        </div>
        {excerpt ? (
          <div className="item-row-preview" dir="auto">
            {excerpt.before}
            {excerpt.match && <mark>{excerpt.match}</mark>}
            {excerpt.after}
          </div>
        ) : (
          preview && (
            <div className="item-row-preview" dir="auto">
              {preview}
            </div>
          )
        )}
        <div className="item-row-meta">
          {item.pinned && <Pin size={12} className="pin-mark" aria-label="נעוץ" />}
          {showTopic && topic && <span className="item-row-topic">{topic.name}</span>}
          <span>{timeAgo(item.updated_at)}</span>
        </div>
      </div>
    </button>
  )
}
