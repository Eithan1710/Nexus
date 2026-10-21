// Muted, distinguishable topic colors. Each entry is [light, dark].
export const TOPIC_COLORS = {
  indigo: ['#5b5bd6', '#8b8cf5'],
  blue: ['#2d7ad6', '#6aa8f0'],
  teal: ['#0f8f86', '#4cc4b9'],
  green: ['#2f8f46', '#62c27a'],
  amber: ['#c27c0e', '#e7ab45'],
  orange: ['#d9622b', '#f2905f'],
  rose: ['#d23f5f', '#f07890'],
  purple: ['#8e44ad', '#c084e0'],
  brown: ['#94693f', '#c99c6f'],
  slate: ['#5a6878', '#9aa7b6'],
}

export const COLOR_KEYS = Object.keys(TOPIC_COLORS)

export function colorVars(key) {
  const [light, dark] = TOPIC_COLORS[key] || TOPIC_COLORS.indigo
  return { '--tc-light': light, '--tc-dark': dark }
}

export function nextColor(topics) {
  const used = new Map(COLOR_KEYS.map((k) => [k, 0]))
  for (const t of topics) if (used.has(t.color)) used.set(t.color, used.get(t.color) + 1)
  let best = COLOR_KEYS[0]
  for (const k of COLOR_KEYS) if (used.get(k) < used.get(best)) best = k
  return best
}
