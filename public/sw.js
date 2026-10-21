// App-shell cache: the app opens instantly and works offline. Data goes straight to
// Supabase (never cached here); the app keeps its own on-device copy.
const CACHE = 'nexus-v1'
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
