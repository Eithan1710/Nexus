import { Pin, Ellipsis } from 'lucide-react'
import TopicIcon from './TopicIcon'
import useItemActions from './ItemActions'
import { itemTitle, itemPreview, timeAgo } from '../lib/format'
import { navigate } from '../router'

export default function ItemRow({ item, topic, showTopic = false, excerpt = null }) {
  const title = itemTitle(item)
  const preview = excerpt ? null : itemPreview(item)
  const actions = useItemActions(item)
  return (
    <div className="item-row">
      <button type="button" className="item-row-main" onClick={() => navigate(`/i/${item.id}`)}>
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
      <button type="button" className="row-more" aria-label={`פעולות עבור ${title}`} aria-haspopup="menu" onClick={actions.open}>
        <Ellipsis size={20} />
      </button>
      {actions.elements}
    </div>
  )
}
