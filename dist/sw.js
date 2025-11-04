const CACHE_NAME = 'mihas-v2-cache'
const OFFLINE_URL = '/offline.html'

const CACHE_URLS = [
  '/',
  '/offline.html',
  '/images/logos/katc-logo.png',
  '/images/logos/mihas-logo.png'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CACHE_URLS)
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(OFFLINE_URL)
      })
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchResponse) => {
        return caches.open(CACHE_NAME).then((cache) => {
          if (event.request.method === 'GET') {
            cache.put(event.request, fetchResponse.clone())
          }
          return fetchResponse
        })
      })
    }).catch(() => {
      if (event.request.destination === 'image') {
        return new Response('<svg></svg>', { headers: { 'Content-Type': 'image/svg+xml' } })
      }
    })
  )
})
