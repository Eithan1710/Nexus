import { useState } from 'react'
import { Mail, Lock, Sparkles } from 'lucide-react'
import { supabase } from '../supabase'

const ERRORS = {
  'Invalid login credentials': 'האימייל או הסיסמה שגויים',
  'User already registered': 'כבר קיים חשבון עם האימייל הזה. נסה להתחבר.',
  'Email not confirmed': 'צריך לאשר את האימייל. בדוק את תיבת הדואר.',
  'Password should be at least 6 characters.': 'הסיסמה צריכה לכלול לפחות 6 תווים',
}

function translate(msg) {
  for (const [k, v] of Object.entries(ERRORS)) if (msg?.includes(k)) return v
  if (/fetch|network/i.test(msg || '')) return 'אין חיבור לרשת'
  return msg || 'משהו השתבש, נסה שוב'
}

const redirect = () => location.origin + location.pathname

export default function Auth() {
  const [mode, setMode] = useState('in') // in | up | reset
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirect() } })
        if (error) throw error
        if (!data.session) setMsg({ ok: true, text: 'שלחנו לך מייל לאישור החשבון. אחרי האישור אפשר להתחבר.' })
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect() })
        if (error) throw error
        setMsg({ ok: true, text: 'אם החשבון קיים, נשלח אליו קישור לאיפוס סיסמה.' })
      }
    } catch (err) {
      setMsg({ ok: false, text: translate(err.message) })
    } finally {
      setBusy(false)
    }
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
        {mode !== 'reset' && (
          <div className="segmented" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'in'} className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>
              התחברות
            </button>
            <button type="button" role="tab" aria-selected={mode === 'up'} className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>
              הרשמה
            </button>
          </div>
        )}
        {mode === 'reset' && <h2 className="auth-sub">איפוס סיסמה</h2>}

        <label className="input-row">
          <Mail size={18} />
          <input type="email" dir="ltr" placeholder="אימייל" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== 'reset' && (
          <label className="input-row">
            <Lock size={18} />
            <input
              type="password"
              dir="ltr"
              placeholder="סיסמה"
              autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}

        {msg && <div className={'auth-msg' + (msg.ok ? ' ok' : '')}>{msg.text}</div>}

        <button type="submit" className="primary-btn wide" disabled={busy}>
          {busy ? <span className="spinner light" /> : mode === 'in' ? 'כניסה' : mode === 'up' ? 'יצירת חשבון' : 'שלח קישור'}
        </button>

        {mode === 'in' && (
          <button type="button" className="text-btn center" onClick={() => setMode('reset')}>
            שכחתי סיסמה
          </button>
        )}
        {mode === 'reset' && (
          <button type="button" className="text-btn center" onClick={() => setMode('in')}>
            חזרה להתחברות
          </button>
        )}
      </form>
    </div>
  )
}

export function NewPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  return (
    <div className="auth">
      <form
        className="auth-card"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          const { error } = await supabase.auth.updateUser({ password })
          setBusy(false)
          if (error) setErr(translate(error.message))
          else onDone()
        }}
      >
        <h2 className="auth-sub">בחר סיסמה חדשה</h2>
        <label className="input-row">
          <Lock size={18} />
          <input type="password" dir="ltr" placeholder="סיסמה חדשה" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {err && <div className="auth-msg">{err}</div>}
        <button type="submit" className="primary-btn wide" disabled={busy}>
          שמור סיסמה
        </button>
      </form>
    </div>
  )
}
