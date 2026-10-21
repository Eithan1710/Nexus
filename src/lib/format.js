const rtf = new Intl.RelativeTimeFormat('he', { numeric: 'auto' })
const dateFmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' })
const dateYearFmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
const fullFmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function timeAgo(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 45) return 'עכשיו'
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute')
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour')
  const days = Math.round(diff / 86400)
  if (days < 7) return rtf.format(-days, 'day')
  return d.getFullYear() === new Date().getFullYear() ? dateFmt.format(d) : dateYearFmt.format(d)
}

export function fullDate(iso) {
  return iso ? fullFmt.format(new Date(iso)) : ''
}

export function greeting() {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'בוקר טוב'
  if (h >= 12 && h < 17) return 'צהריים טובים'
  if (h >= 17 && h < 22) return 'ערב טוב'
  return 'לילה טוב'
}

export function countLabel(n) {
  if (n === 0) return 'ריק'
  if (n === 1) return 'פריט אחד'
  return `${n} פריטים`
}

// Display title of an item: its title, or the first meaningful line of its content.
export function itemTitle(item) {
  if (item.title?.trim()) return item.title.trim()
  const line = (item.content || '').split('\n').find((l) => l.trim())
  return line ? stripMarks(line).slice(0, 120) : 'פריט ללא כותרת'
}

// Preview text: content without the line used as the display title.
export function itemPreview(item) {
  const lines = (item.content || '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('```'))
  if (!item.title?.trim()) lines.shift()
  return lines.map(stripMarks).join(' · ').slice(0, 220)
}

export function stripMarks(s) {
  return s
    .replace(/^#{1,3}\s+/, '')
    .replace(/^[-*•]\s+\[( |x|X)\]\s+/, '')
    .replace(/^[-*•]\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16),
  )
}
