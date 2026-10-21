// Per-topic counts and activity, computed once per render of the item list.
export function topicStats(items) {
  const stats = new Map()
  for (const it of items) {
    let s = stats.get(it.topic_id)
    if (!s) stats.set(it.topic_id, (s = { count: 0, lastUpdate: null }))
    s.count++
    if (!s.lastUpdate || it.updated_at > s.lastUpdate) s.lastUpdate = it.updated_at
  }
  return stats
}

const t = (iso) => (iso ? new Date(iso).getTime() : 0)

export function activityTime(topic, stat) {
  return Math.max(t(topic.last_opened_at), t(stat?.lastUpdate), t(topic.created_at))
}

// A topic "has news" when something was saved into it after it was last opened.
export function hasNews(topic, stat) {
  return !!stat?.lastUpdate && t(stat.lastUpdate) > t(topic.last_opened_at) + 2000
}

export function sortTopics(topics, stats, order) {
  const list = [...topics]
  const cmp = {
    recent: (a, b) => activityTime(b, stats.get(b.id)) - activityTime(a, stats.get(a.id)),
    manual: (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
    alpha: (a, b) => a.name.localeCompare(b.name, 'he'),
  }[order] || ((a, b) => 0)
  list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || cmp(a, b))
  return list
}
