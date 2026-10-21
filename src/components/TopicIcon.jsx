import { topicIcon } from '../lib/icons'
import { colorVars } from '../lib/colors'

export default function TopicIcon({ topic, size = 40, radius }) {
  const Icon = topicIcon(topic?.icon)
  return (
    <span
      className="topic-icon"
      style={{ ...colorVars(topic?.color), width: size, height: size, borderRadius: radius ?? Math.round(size * 0.3) }}
      aria-hidden="true"
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} />
    </span>
  )
}
