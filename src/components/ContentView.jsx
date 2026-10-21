import { Fragment } from 'react'
import { Check } from 'lucide-react'

const URL_RE = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?"'״׳)\]]|www\.[^\s<>()]+[^\s<>().,;:!?"'״׳)\]])/g
const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`)/g

function linkify(text, keyBase) {
  const parts = text.split(URL_RE)
  return parts.map((p, i) => {
    if (i % 2 === 1) {
      const href = p.startsWith('http') ? p : 'https://' + p
      let label = p.replace(/^https?:\/\/(www\.)?/, '')
      if (label.length > 48) label = label.slice(0, 45) + '…'
      return (
        <a key={keyBase + i} href={href} target="_blank" rel="noopener noreferrer" className="link" dir="ltr" onClick={(e) => e.stopPropagation()}>
          {label}
        </a>
      )
    }
    return <Fragment key={keyBase + i}>{p}</Fragment>
  })
}

export function Inline({ text }) {
  const parts = text.split(INLINE_RE)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={i}>{linkify(p.slice(2, -2), i + '-')}</strong>
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return <code key={i} dir="ltr">{p.slice(1, -1)}</code>
    return <Fragment key={i}>{linkify(p, i + '-')}</Fragment>
  })
}

export function parseBlocks(content) {
  const lines = (content || '').split('\n')
  const blocks = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim().startsWith('```')) {
      const start = i
      const body = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++])
      blocks.push({ type: 'code', text: body.join('\n'), line: start })
      continue
    }
    let m
    if ((m = line.match(/^\s*[-*•]\s+\[( |x|X)\]\s?(.*)$/))) blocks.push({ type: 'check', done: m[1] !== ' ', text: m[2], line: i })
    else if ((m = line.match(/^(#{1,3})\s+(.*)$/))) blocks.push({ type: 'h', level: m[1].length, text: m[2], line: i })
    else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) blocks.push({ type: 'bullet', text: m[1], line: i })
    else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))) blocks.push({ type: 'num', n: m[1], text: m[2], line: i })
    else if ((m = line.match(/^>\s?(.*)$/))) blocks.push({ type: 'quote', text: m[1], line: i })
    else if (!line.trim()) blocks.push({ type: 'gap', line: i })
    else blocks.push({ type: 'p', text: line, line: i })
  }
  return blocks
}

export function toggleCheckLine(content, lineIndex) {
  const lines = content.split('\n')
  const line = lines[lineIndex]
  lines[lineIndex] = line.replace(/\[( |x|X)\]/, (m, c) => (c === ' ' ? '[x]' : '[ ]'))
  return lines.join('\n')
}

export default function ContentView({ content, onToggle }) {
  const blocks = parseBlocks(content)
  return (
    <div className="content">
      {blocks.map((b, idx) => {
        switch (b.type) {
          case 'code':
            return (
              <pre key={idx} dir="ltr">
                <code>{b.text}</code>
              </pre>
            )
          case 'check':
            return (
              <div key={idx} className={'c-check' + (b.done ? ' done' : '')} dir="auto">
                <button
                  type="button"
                  className="checkbox"
                  aria-label={b.done ? 'סמן כלא בוצע' : 'סמן כבוצע'}
                  aria-pressed={b.done}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggle?.(b.line)
                  }}
                >
                  {b.done && <Check size={14} strokeWidth={3} />}
                </button>
                <span>
                  <Inline text={b.text} />
                </span>
              </div>
            )
          case 'h':
            return (
              <div key={idx} className={'c-h c-h' + b.level} dir="auto" role="heading" aria-level={b.level + 1}>
                <Inline text={b.text} />
              </div>
            )
          case 'bullet':
            return (
              <div key={idx} className="c-li" dir="auto">
                <span className="dot" aria-hidden="true" />
                <span>
                  <Inline text={b.text} />
                </span>
              </div>
            )
          case 'num':
            return (
              <div key={idx} className="c-li" dir="auto">
                <span className="num">{b.n}.</span>
                <span>
                  <Inline text={b.text} />
                </span>
              </div>
            )
          case 'quote':
            return (
              <div key={idx} className="c-quote" dir="auto">
                <Inline text={b.text} />
              </div>
            )
          case 'gap':
            return <div key={idx} className="c-gap" />
          default:
            return (
              <p key={idx} dir="auto">
                <Inline text={b.text} />
              </p>
            )
        }
      })}
    </div>
  )
}
