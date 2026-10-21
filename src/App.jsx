import { useEffect, useLayoutEffect } from 'react'
import { Plus } from 'lucide-react'
import { useStore } from './store'
import { useRoute, getDirection, savedScroll } from './router'
import { openCapture } from './ui'
import Home from './screens/Home'
import Topic from './screens/Topic'
import Item from './screens/Item'
import Search from './screens/Search'
import Topics from './screens/Topics'
import Settings from './screens/Settings'
import Auth from './screens/Auth'
import QuickCapture from './components/QuickCapture'
import TopicEditor from './components/TopicEditor'
import Toast from './components/Toast'

function useTheme(theme) {
  useEffect(() => {
    const root = document.documentElement
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      root.dataset.theme = dark ? 'dark' : 'light'
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f0f12' : '#f6f5f2')
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

// Exposes the on-screen keyboard height as --kb so sheets and toolbars sit above it.
function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      root.style.setProperty('--kb', kb + 'px')
      root.classList.toggle('kb-open', kb > 120)
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
}

export default function App() {
  const { authReady, userId, prefs, topics } = useStore()
  const route = useRoute()
  useTheme(prefs.theme)
  useKeyboardInset()

  useLayoutEffect(() => {
    const dir = getDirection()
    window.scrollTo(0, dir === 'pop' ? savedScroll(route.path) : 0)
  }, [route.path])

  if (!authReady) return <div className="boot" />
  if (!userId) return <Auth />

  let screen
  let fab = true
  let fabTopic = null
  switch (route.name) {
    case 'topic':
      screen = <Topic id={route.id} />
      fabTopic = route.id
      break
    case 'item':
      screen = <Item key={route.id} id={route.id} isNew={route.isNew} />
      fab = false
      break
    case 'search':
      screen = <Search />
      fab = false
      break
    case 'topics':
      screen = <Topics />
      break
    case 'settings':
      screen = <Settings />
      fab = false
      break
    default:
      screen = <Home />
  }

  return (
    <>
      <main key={route.path} className={'page anim-' + getDirection()}>
        {screen}
      </main>
      {fab && topics.length > 0 && (
        <div className="fab-wrap">
          <button type="button" className="fab" onClick={() => openCapture(fabTopic)}>
            <Plus size={22} strokeWidth={2.5} />
            <span>הוסף רעיון</span>
          </button>
        </div>
      )}
      <QuickCapture />
      <TopicEditor />
      <Toast />
    </>
  )
}
