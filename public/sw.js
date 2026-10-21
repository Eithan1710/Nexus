// App-shell cache: the app opens instantly and works offline. Data goes straight to
// Supabase (never cached here); the app keeps its own on-device copy.
const CACHE = 'nexus-v2'
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png']

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const c = await caches.open(CACHE)
      await c.addAll(SHELL)
      // Also cache the current build's JS/CSS so the first offline launch works.
      const html = await (await fetch('./index.html', { cache: 'no-store' })).text()
      const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1])
      await c.addAll(assets)
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return

  // Pages: network first so updates land, cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    )
    return
  }

  // Hashed build assets never change: cache first.
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})

// ---------- reminders: Web Push ----------
// The server sends { title, body, tag, url, id }. Shown even when no Nexus tab is open.

const PUSH_FN = 'https://kjfihzskaqcboeejnkak.supabase.co/functions/v1/nx-reminders'

self.addEventListener('push', (e) => {
  let data = {}
  try {
    data = e.data ? e.data.json() : {}
  } catch {
    data = { body: e.data ? e.data.text() : '' }
  }
  const show = self.registration.showNotification(data.title || 'תזכורת', {
    body: data.body || '',
    tag: data.tag || 'nx-reminder',
    renotify: true,
    lang: 'he',
    dir: 'rtl',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    timestamp: data.ts || Date.now(),
    data: { url: data.url || './', id: data.id || null },
  })
  // Let an open app refresh its list right away.
  const tell = self.clients.matchAll({ type: 'window' }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'nx-push', id: data.id || null })))
  e.waitUntil(Promise.all([show, tell]))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href
  e.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const app = windows.find((c) => c.url.startsWith(self.registration.scope))
      if (app) {
        await app.focus()
        app.postMessage({ type: 'nx-open', url })
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})

// The browser rotated the subscription: register the new one in place of the old.
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil(
    (async () => {
      const old = e.oldSubscription
      const key = old?.options?.applicationServerKey
      const sub = e.newSubscription || (key && (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })))
      if (!old || !sub) return
      await fetch(PUSH_FN, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'resubscribe', oldEndpoint: old.endpoint, subscription: sub.toJSON() }),
      })
    })(),
  )
})
