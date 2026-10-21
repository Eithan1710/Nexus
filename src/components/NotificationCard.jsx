import { BellRing, BellOff, Share, SquarePlus, TriangleAlert, Check, RefreshCw } from 'lucide-react'
import { usePush, enablePush, disablePush, sendTestPush, checkPush, isIOS } from '../lib/push'
import { toast } from '../store'

const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

// Notification status for this device, with the one action that moves it forward.
// variant 'banner' (Reminders screen: hidden once notifications work) or 'full' (Settings).
export default function NotificationCard({ variant = 'full' }) {
  const { status, busy, devices, error } = usePush()
  if (variant === 'banner' && (status === 'on' || status === 'checking')) return null

  const test = async () => {
    try {
      const r = await sendTestPush()
      if (r.sent > 0) toast('נשלחה התראת בדיקה. היא אמורה להופיע בעוד כמה שניות.', null, 5000)
      else {
        toast('השרת לא הצליח לשלוח למכשיר הזה. נסה לכבות ולהפעיל מחדש.', null, 6000)
        checkPush()
      }
    } catch {
      toast('אין חיבור לשרת. נסה שוב בעוד רגע.')
    }
  }

  let body
  switch (status) {
    case 'checking':
      body = (
        <Row icon={<span className="spinner" />} title="בודק התראות…" />
      )
      break
    case 'on':
      body = (
        <>
          <Row icon={<Check size={20} />} tone="ok" title="התראות פעילות במכשיר הזה" text={devices > 1 ? `תזכורות יישלחו ל־${devices} מכשירים` : 'תזכורות יגיעו גם כשהאתר סגור'} />
          <div className="nc-actions">
            <button type="button" className="example-chip" onClick={test}>
              שלח התראת בדיקה
            </button>
            <button type="button" className="text-btn small" disabled={busy} onClick={disablePush}>
              כבה במכשיר הזה
            </button>
          </div>
        </>
      )
      break
    case 'off':
      body = (
        <>
          <Row icon={<BellOff size={20} />} tone="warn" title="התראות כבויות במכשיר הזה" text="בלי התראות, תזכורות לא יקפצו כשהאתר סגור." />
          <div className="nc-actions">
            <button type="button" className="primary-btn" disabled={busy} onClick={enablePush}>
              {busy ? <span className="spinner light" /> : <BellRing size={18} />} הפעל התראות
            </button>
          </div>
        </>
      )
      break
    case 'denied':
      body = (
        <Row
          icon={<BellOff size={20} />}
          tone="bad"
          title="ההתראות חסומות"
          text={
            isIOS
              ? 'פתח הגדרות ← הודעות ← הידע שלי, הפעל ״אפשר הודעות״ וחזור לכאן.'
              : isAndroid
                ? 'הקש על סמל המנעול ליד הכתובת ← הרשאות ← התראות ← אפשר. אם האתר מותקן: הגדרות האפליקציה ← התראות.'
                : 'לחץ על סמל המנעול ליד הכתובת, אפשר התראות לאתר הזה, ורענן את הדף.'
          }
          action={
            <button type="button" className="icon-btn soft" aria-label="בדוק שוב" onClick={checkPush}>
              <RefreshCw size={18} />
            </button>
          }
        />
      )
      break
    case 'needs-install':
      body = (
        <>
          <Row icon={<BellOff size={20} />} tone="warn" title="באייפון, התראות עובדות מהאפליקציה שעל מסך הבית" />
          <ol className="nc-steps">
            <li>
              הקש על <Share size={15} className="inline-icon" /> שיתוף בתחתית Safari
            </li>
            <li>
              בחר <SquarePlus size={15} className="inline-icon" /> ״הוסף למסך הבית״
            </li>
            <li>פתח את ״הידע שלי״ ממסך הבית והפעל כאן התראות</li>
          </ol>
          <p className="hint">נדרש iOS 16.4 ומעלה.</p>
        </>
      )
      break
    case 'unverified':
      body = <Row icon={<TriangleAlert size={20} />} tone="warn" title="אין חיבור, לא ניתן לוודא שההתראות פעילות" text="נבדוק שוב כשהחיבור יחזור." />
      break
    case 'error':
      body = (
        <>
          <Row
            icon={<TriangleAlert size={20} />}
            tone="bad"
            title="לא הצלחנו להפעיל התראות"
            text={error === 'sw' ? 'שירות הרקע של האתר לא נטען. רענן את הדף ונסה שוב.' : 'ייתכן שאין חיבור, או שהדפדפן חסם את ההרשמה. נסה שוב.'}
          />
          <div className="nc-actions">
            <button type="button" className="primary-btn" disabled={busy} onClick={enablePush}>
              נסה שוב
            </button>
          </div>
        </>
      )
      break
    default:
      body = <Row icon={<BellOff size={20} />} tone="bad" title="הדפדפן הזה לא תומך בהתראות" text="נסה Chrome, Edge, Firefox, או את האפליקציה שעל מסך הבית באייפון." />
  }
  return <div className={'notif-card ' + variant}>{body}</div>
}

function Row({ icon, title, text, tone = '', action = null }) {
  return (
    <div className={'nc-row ' + tone}>
      <span className="nc-icon">{icon}</span>
      <div className="nc-text">
        <div className="nc-title">{title}</div>
        {text && <div className="nc-sub">{text}</div>}
      </div>
      {action}
    </div>
  )
}
