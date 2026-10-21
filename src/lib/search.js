// Normalize Hebrew/English text for matching: case, niqqud, final letters, punctuation.
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }

export function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[֑-ׇ̀-ͯ]/g, '')
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/[״"׳'`]/g, '')
}

export function tokens(q) {
  return normalize(q).split(/\s+/).filter(Boolean)
}

const cache = new Map()

function indexed(item) {
  const hit = cache.get(item.id)
  if (hit && hit.title === item.title && hit.content === item.content) return hit
  const entry = { title: item.title, content: item.content, nTitle: normalize(item.title), nContent: normalize(item.content) }
  cache.set(item.id, entry)
  return entry
}

// Returns [{ item, score, excerpt: { before, match, after } | null }], best first.
export function searchItems(items, topicsById, q, limit = 200) {
  const toks = tokens(q)
  if (!toks.length) return []
  const out = []
  for (const item of items) {
    const ix = indexed(item)
    const nTopic = normalize(topicsById.get(item.topic_id)?.name)
    let score = 0
    let ok = true
    for (const t of toks) {
      const inTitle = ix.nTitle.includes(t)
      const inContent = ix.nContent.includes(t)
      const inTopic = nTopic.includes(t)
      if (!inTitle && !inContent && !inTopic) { ok = false; break }
      score += (inTitle ? 6 : 0) + (inContent ? 2 : 0) + (inTopic ? 1 : 0)
      if (ix.nTitle.startsWith(t)) score += 3
    }
    if (!ok) continue
    const age = (Date.now() - new Date(item.updated_at).getTime()) / 86400000
    score += Math.max(0, 2 - age / 30)
    out.push({ item, score, excerpt: excerpt(item.content, ix.nContent, toks) })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, limit)
}

export function searchTopics(topics, q) {
  const toks = tokens(q)
  if (!toks.length) return []
  return topics.filter((t) => {
    const n = normalize(t.name)
    return toks.every((k) => n.includes(k))
  })
}

// Normalization keeps string length 1:1 for Hebrew/Latin except stripped marks, so map
// positions back by scanning; good enough for display.
function excerpt(content, nContent, toks) {
  if (!content) return null
  let pos = -1
  let len = 0
  for (const t of toks) {
    const p = nContent.indexOf(t)
    if (p >= 0 && (pos < 0 || p < pos)) { pos = p; len = t.length }
  }
  const flat = content.replace(/\s+/g, ' ')
  if (pos < 0) return { before: flat.slice(0, 140), match: '', after: '' }
  // Map normalized offset to the original by normalizing growing prefixes.
  const nFlat = normalize(flat)
  const p2 = nFlat.indexOf(nContent.substr(pos, len).replace(/\s+/g, ' '))
  const start = p2 >= 0 ? p2 : 0
  const from = Math.max(0, start - 50)
  const realLen = p2 >= 0 ? len : 0
  return {
    before: (from > 0 ? '…' : '') + flat.slice(from, start),
    match: flat.slice(start, start + realLen),
    after: flat.slice(start + realLen, start + realLen + 110),
  }
}
