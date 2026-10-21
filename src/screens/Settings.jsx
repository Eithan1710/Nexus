import { Sun, Moon, Monitor, Download, FileText, LogOut, RefreshCw } from 'lucide-react'
import { useStore, setPref, signOut, exportData, refresh, flush, toast } from '../store'
import { goBack } from '../router'
import { NavBar } from './Topic'
import { itemTitle } from '../lib/format'

const THEMES = [
  ['system', 'מערכת', Monitor],
  ['light', 'בהיר', Sun],
  ['dark', 'כהה', Moon],
]
const ORDERS = [
  ['recent', 'לפי שימוש'],
  ['manual', 'ידני'],
  ['alpha', 'א–ב'],
]

function download(name, text, type) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const stamp = () => new Date().toISOString().slice(0, 10)

export default function Settings() {
  const { prefs, email, topics, items, pending, online } = useStore()

  const exportJson = () => download(`nexus-backup-${stamp()}.json`, JSON.stringify(exportData(), null, 2), 'application/json')
  const exportMd = () => {
    const out = [`# הידע שלי\n\nיוצא ב־${new Date().toLocaleString('he-IL')}\n`]
    for (const t of topics) {
      out.push(`\n## ${t.name}\n`)
      for (const it of items.filter((i) => i.topic_id === t.id).sort((a, b) => b.updated_at.localeCompare(a.updated_at))) {
        out.push(`\n### ${itemTitle(it)}\n\n${it.title?.trim() ? it.content : it.content.split('\n').slice(1).join('\n')}\n`)
      }
    }
    download(`nexus-${stamp()}.md`, out.join(''), 'text/markdown')
  }

  return (
    <div className="screen settings-screen">
      <NavBar onBack={() => goBack('/')} title="הגדרות" />

      <div className="section-head small">
        <h2>מראה</h2>
      </div>
      <div className="segmented big" role="radiogroup" aria-label="מראה">
        {THEMES.map(([k, label, Icon]) => (
          <button key={k} type="button" role="radio" aria-checked={prefs.theme === k} className={prefs.theme === k ? 'on' : ''} onClick={() => setPref('theme', k)}>
            <Icon size={18} /> {label}
          </button>
        ))}
      </div>

      <div className="section-head small">
        <h2>סדר הנושאים בבית</h2>
      </div>
      <div className="segmented big" role="radiogroup" aria-label="סדר נושאים">
        {ORDERS.map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={prefs.topicOrder === k} className={prefs.topicOrder === k ? 'on' : ''} onClick={() => setPref('topicOrder', k)}>
            {label}
          </button>
        ))}
      </div>
      <p className="hint">נושאים נעוצים תמיד ראשונים. בסדר ידני אפשר לגרור ב״כל הנושאים״ ← ״סידור״.</p>

      <div className="section-head small">
        <h2>גיבוי</h2>
      </div>
      <div className="list-card">
        <button type="button" className="settings-row" onClick={exportJson}>
          <Download size={20} />
          <span>ייצוא גיבוי מלא (JSON)</span>
        </button>
        <button type="button" className="settings-row" onClick={exportMd}>
          <FileText size={20} />
          <span>ייצוא כטקסט קריא (Markdown)</span>
        </button>
        <button
          type="button"
          className="settings-row"
          onClick={async () => {
            await flush()
            await refresh()
            toast(online ? 'מסונכרן' : 'אין חיבור לרשת. השינויים שמורים במכשיר.')
          }}
        >
          <RefreshCw size={20} />
          <span>סנכרן עכשיו</span>
          <span className="muted small end">{pending ? `${pending} ממתינים` : 'הכול מסונכרן'}</span>
        </button>
      </div>

      <div className="section-head small">
        <h2>חשבון</h2>
      </div>
      <div className="list-card">
        <div className="settings-row static">
          <span className="muted">מחובר בתור</span>
          <span className="end" dir="auto">
            {email || 'אורח'}
          </span>
        </div>
        <button type="button" className="settings-row danger" onClick={signOut}>
          <LogOut size={20} />
          <span>התנתקות</span>
        </button>
      </div>
      <p className="hint center">
        {topics.length} נושאים · {items.length} פריטים · המידע שלך פרטי ושמור בענן
      </p>
    </div>
  )
}
