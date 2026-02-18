const CACHE_NAME = 'mihas-v2-cache'
const OFFLINE_URL = '/offline.html'
const IMAGE_FALLBACK_URL = '/images/placeholder.svg'

const CACHE_URLS = [
  '/',
  '/offline.html',
  '/images/logos/katc-logo.png',
  '/images/logos/mihas-logo.png',
  '/images/placeholder.svg'
]

/**
 * Check if a request URL scheme is cacheable (http or https only)
 * Filters out chrome-extension://, file://, data:, and other unsupported schemes
 * @param {Request} request - The request to validate
 * @returns {boolean} - True if the request can be cached
 */
function isCacheableRequest(request) {
  try {
    const url = new URL(request.url)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch (e) {
    // Invalid URL, not cacheable
    return false
  }
}

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
  // Skip non-cacheable requests (chrome-extension://, file://, etc.)
  if (!isCacheableRequest(event.request)) {
    return
  }

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
        // Only cache GET requests with cacheable URL schemes and full responses (not 206 partial)
        const canCache = event.request.method === 'GET' && 
                         isCacheableRequest(event.request) && 
                         fetchResponse.status === 200
        
        if (canCache) {
          return caches.open(CACHE_NAME).then((cache) => {
            try {
              cache.put(event.request, fetchResponse.clone())
            } catch (e) {
              // Silently ignore cache errors (e.g., quota exceeded, invalid URL)
              console.debug('Service worker cache error:', e.message)
            }
            return fetchResponse
          })
        }
        return fetchResponse
      })
    }).catch(() => {
      if (event.request.destination === 'image') {
        return caches.match(IMAGE_FALLBACK_URL).then((fallbackResponse) => fallbackResponse || new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', { headers: { 'Content-Type': 'image/svg+xml' } }))
      }
    })
  )
})
