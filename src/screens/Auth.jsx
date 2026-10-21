import { useState } from 'react'
import { User, Lock, Sparkles } from 'lucide-react'
import { supabase } from '../supabase'

// Accounts are created by hand (no sign-up). A username maps to an internal Supabase email,
// and the typed password is namespaced before it is sent.
export function usernameToEmail(username) {
  const hex = Array.from(new TextEncoder().encode(username.trim().normalize('NFC')), (b) => b.toString(16).padStart(2, '0')).join('')
  return `u-${hex}@users.nexus.local`
}
const toPassword = (p) => `nexus:${p}`

function translate(msg) {
  if (/invalid login credentials/i.test(msg || '')) return 'שם המשתמש או הסיסמה שגויים'
  if (/fetch|network/i.test(msg || '')) return 'אין חיבור לרשת'
  return msg || 'משהו השתבש, נסה שוב'
}

export default function Auth() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password: toPassword(password) })
    setBusy(false)
    if (error) setError(translate(error.message))
  }

  return (
    <div className="auth">
      <div className="auth-brand">
        <div className="auth-logo" aria-hidden="true">
          <Sparkles size={30} />
        </div>
        <h1>הידע שלי</h1>
        <p>כל הרעיונות, הקישורים והדברים שלמדת. במקום אחד.</p>
      </div>

      <form className="auth-card" onSubmit={submit}>
        <label className="input-row">
          <User size={18} />
          <input type="text" dir="auto" placeholder="שם משתמש" autoComplete="username" autoCapitalize="none" required value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="input-row">
          <Lock size={18} />
          <input type="password" dir="ltr" placeholder="סיסמה" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="auth-msg">{error}</div>}
        <button type="submit" className="primary-btn wide" disabled={busy}>
          {busy ? <span className="spinner light" /> : 'כניסה'}
        </button>
      </form>
    </div>
  )
}
