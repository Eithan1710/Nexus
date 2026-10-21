import { createRoot } from 'react-dom/client'
import App from './App'
import { initAuth, refresh } from './store'
import { navigate } from './router'
import './styles.css'

initAuth()
createRoot(document.getElementById('root')).render(<App />)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('sw', e))
  })
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    // A tapped notification while the app was already open: go to that reminder.
    if (e.data?.type === 'nx-open') {
      const hash = new URL(e.data.url).hash
      if (hash && hash !== location.hash) navigate(hash.slice(1))
    }
    if (e.data?.type === 'nx-push') refresh()
  })
}
