import { createRoot } from 'react-dom/client'
import App from './App'
import { initAuth } from './store'
import './styles.css'

initAuth()
createRoot(document.getElementById('root')).render(<App />)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('sw', e))
  })
}
