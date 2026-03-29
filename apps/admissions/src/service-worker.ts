/// <reference lib="webworker" />

import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { registerRoute, setCatchHandler } from 'workbox-routing'
import { NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<unknown> }

type ManifestEntry = {
  revision?: string | null
  url?: string
}

const hashVersion = (value: string): string => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

const resolveManifestFingerprint = (manifest: Array<unknown>): string | null => {
  const revisions = manifest
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return null
      }

      const { revision, url } = entry as ManifestEntry
      if (typeof revision === 'string' && revision.trim().length > 0) {
        return revision
      }

      return typeof url === 'string' ? url : null
    })
    .filter((revision): revision is string => Boolean(revision))

  if (revisions.length === 0) {
    return null
  }

  return hashVersion(revisions.join('|'))
}

// Capture the manifest once — workbox injectManifest replaces this single reference.
// The vite-plugin-pwa globPatterns ('**/*.{js,css,html,ico,png,svg,webp}') ensure
// ALL built assets are precached, including:
//   - Wizard-related JS chunks (lazy-loaded via React.lazy)
//   - Critical CSS bundles
//   - index.html (SPA shell) and offline.html fallback
// This guarantees the Application Wizard works offline after the initial load.
const WB_MANIFEST = self.__WB_MANIFEST

// Cache version for invalidation on deployment.
// Uses VITE_APP_VERSION when provided, otherwise derives from the generated Workbox manifest.
const APP_VERSION = import.meta.env.VITE_APP_VERSION?.trim() || resolveManifestFingerprint(WB_MANIFEST) || 'dev'
const CACHE_VERSION = `v${APP_VERSION}`
const CACHE_PREFIX = 'mihas-app'
const LEGACY_CACHE_PREFIXES = ['mihas-v2-cache']

// Cache bucket names
const STATIC_CACHE = 'static-v1'
const API_CACHE = `${CACHE_PREFIX}-api-${CACHE_VERSION}`

// Cache limits: 50MB total budget, 100 entries per bucket
const MAX_ENTRIES_PER_BUCKET = 100
const CACHE_BUDGET_BYTES = 50 * 1024 * 1024 // 50MB

// Offline fallback asset used when image requests fail
const IMAGE_FALLBACK_URL = '/images/placeholder.svg'

// Suppress extension-related errors in service worker
self.addEventListener('error', (event) => {
  const message = event.message || ''
  if (
    message.includes('Could not establish connection') ||
    message.includes('Receiving end does not exist') ||
    message.includes('Extension context invalidated') ||
    message.includes('chrome-extension://') ||
    message.includes('Private Access Token challenge')
  ) {
    event.preventDefault()
    return
  }
})

clientsClaim()

precacheAndRoute(WB_MANIFEST)
cleanupOutdatedCaches()

// ============================================================================
// CACHE BUDGET ENFORCEMENT
// ============================================================================

/**
 * Enforce total cache budget across all buckets.
 * Evicts LRU entries from the largest cache when total exceeds CACHE_BUDGET_BYTES.
 */
const enforceCacheBudget = async (): Promise<void> => {
  try {
    const estimate = await navigator.storage?.estimate?.()
    if (!estimate?.usage || estimate.usage <= CACHE_BUDGET_BYTES) return

    const cacheNames = await caches.keys()
    const ownCaches = cacheNames.filter(
      (name) => name.startsWith(CACHE_PREFIX) || name === STATIC_CACHE
    )

    // Find the largest cache and evict oldest entries
    let largestCache = ''
    let largestSize = 0
    for (const name of ownCaches) {
      const cache = await caches.open(name)
      const keys = await cache.keys()
      if (keys.length > largestSize) {
        largestSize = keys.length
        largestCache = name
      }
    }

    if (largestCache && largestSize > 0) {
      const cache = await caches.open(largestCache)
      const keys = await cache.keys()
      // Evict oldest 10% of entries (LRU approximation)
      const evictCount = Math.max(1, Math.floor(keys.length * 0.1))
      for (let i = 0; i < evictCount; i++) {
        await cache.delete(keys[i])
      }
    }
  } catch {
    // Storage estimate not available — skip budget enforcement
  }
}


const imageFallbackResponse = async (): Promise<Response> => {
  const fallbackResponse = await caches.match(IMAGE_FALLBACK_URL)
  if (fallbackResponse) {
    return fallbackResponse
  }

  try {
    return await fetch(IMAGE_FALLBACK_URL)
  } catch {
    return new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', {
      headers: { 'Content-Type': 'image/svg+xml' }
    })
  }
}

/**
 * Wraps a cached API response with X-From-Cache: true header so the frontend
 * can display an "offline data" indicator when serving stale data.
 */
const addFromCacheHeader = (response: Response): Response => {
  const headers = new Headers(response.headers)
  headers.set('X-From-Cache', 'true')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}


// ============================================================================
// STATIC ASSETS — StaleWhileRevalidate with cache name `static-v1`
// ============================================================================

// Google Fonts
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({
    cacheName: STATIC_CACHE,
    plugins: [
      new ExpirationPlugin({
        maxEntries: MAX_ENTRIES_PER_BUCKET,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
        purgeOnQuotaError: true
      }),
      new CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
)

// All images — StaleWhileRevalidate into static-v1
registerRoute(
  ({ request }) => request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: STATIC_CACHE,
    plugins: [
      new ExpirationPlugin({
        maxEntries: MAX_ENTRIES_PER_BUCKET,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        purgeOnQuotaError: true
      }),
      new CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  }),
  'GET'
)

// CSS and JavaScript bundles — StaleWhileRevalidate into static-v1
registerRoute(
  ({ request, url }) => {
    if (url.origin !== self.location.origin) return false
    return request.destination === 'style' || request.destination === 'script'
  },
  new StaleWhileRevalidate({
    cacheName: STATIC_CACHE,
    plugins: [
      new ExpirationPlugin({
        maxEntries: MAX_ENTRIES_PER_BUCKET,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
        purgeOnQuotaError: true
      }),
      new CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
)

// Fonts — StaleWhileRevalidate into static-v1
registerRoute(
  ({ request }) => request.destination === 'font',
  new StaleWhileRevalidate({
    cacheName: STATIC_CACHE,
    plugins: [
      new ExpirationPlugin({
        maxEntries: MAX_ENTRIES_PER_BUCKET,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
        purgeOnQuotaError: true
      }),
      new CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
)


// ============================================================================
// AUTH ENDPOINTS — NetworkOnly (never cache auth)
// ============================================================================

registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/api/auth') ||
    url.pathname.startsWith('/auth/'),
  new NetworkOnly()
)


// ============================================================================
// API RESPONSES — NetworkFirst with 5s timeout, fallback to cache
// Cached responses include X-From-Cache: true header for offline indicator
// ============================================================================

// All non-auth API endpoints — NetworkFirst with 5s timeout
registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/applications') ||
    url.pathname.startsWith('/notifications') ||
    url.pathname.startsWith('/admin/') ||
    url.pathname.startsWith('/documents/') ||
    url.pathname.startsWith('/payments/') ||
    url.pathname.startsWith('/catalog'),
  {
    handle: async ({ request, event }) => {
      const networkFirst = new NetworkFirst({
        cacheName: API_CACHE,
        networkTimeoutSeconds: 5,
        plugins: [
          new ExpirationPlugin({
            maxEntries: MAX_ENTRIES_PER_BUCKET,
            maxAgeSeconds: 60 * 60 * 24, // 24 hours
            purgeOnQuotaError: true
          }),
          new CacheableResponsePlugin({ statuses: [0, 200] })
        ]
      })

      const response = await networkFirst.handle({ request, event: event as ExtendableEvent })

      // If the response came from cache (offline), tag it with X-From-Cache
      // Workbox NetworkFirst returns the cached response when the network fails.
      // We detect this by checking if the response headers lack typical fresh indicators
      // or by checking if the response was already in cache before the request.
      const cache = await caches.open(API_CACHE)
      const cachedResponse = await cache.match(request)
      if (cachedResponse && response && response.headers.get('date') === cachedResponse.headers.get('date')) {
        return addFromCacheHeader(response)
      }

      return response
    }
  }
)

// HTML Documents — NetworkFirst with 5s timeout (app shell)
registerRoute(
  ({ request }) => request.destination === 'document',
  new NetworkFirst({
    cacheName: STATIC_CACHE,
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({
        maxEntries: MAX_ENTRIES_PER_BUCKET,
        maxAgeSeconds: 60 * 60, // 1 hour
        purgeOnQuotaError: true
      }),
      new CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
)

// Non-critical resources — StaleWhileRevalidate into static-v1
registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/generate/') ||
    url.pathname.startsWith('/interview/'),
  new StaleWhileRevalidate({
    cacheName: STATIC_CACHE,
    plugins: [
      new ExpirationPlugin({
        maxEntries: MAX_ENTRIES_PER_BUCKET,
        maxAgeSeconds: 60 * 60 * 24, // 24 hours
        purgeOnQuotaError: true
      }),
      new CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
)

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

// Clean up old cache versions on activation and enforce cache budget
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      console.log(`[Service Worker] Activating with cache version: ${CACHE_VERSION}`)
      
      const cacheNames = await caches.keys()
      const oldCaches = cacheNames.filter((name) => {
        const isLegacyCache = LEGACY_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix))
        const isCurrentPrefixOutdated = name.startsWith(CACHE_PREFIX) && !name.includes(CACHE_VERSION)
        // Keep static-v1 across versions (it's version-independent)
        const isStaticCache = name === STATIC_CACHE
        return (isLegacyCache || isCurrentPrefixOutdated) && !isStaticCache
      })
      
      if (oldCaches.length > 0) {
        console.log(`[Service Worker] Deleting ${oldCaches.length} old cache(s):`, oldCaches)
        await Promise.all(
          oldCaches.map(cacheName => {
            console.log('[Service Worker] Deleting old cache:', cacheName)
            return caches.delete(cacheName)
          })
        )
      } else {
        console.log('[Service Worker] No old caches to delete')
      }

      // Enforce 50MB total cache budget
      await enforceCacheBudget()
      
      // Notify clients about cache update
      const clients = await self.clients.matchAll()
      if (clients.length > 0) {
        console.log(`[Service Worker] Notifying ${clients.length} client(s) about cache update`)
        clients.forEach(client => {
          client.postMessage({
            type: 'cache-updated',
            version: CACHE_VERSION,
            appVersion: APP_VERSION
          })
        })
      }
    })()
  )
})

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[Service Worker] Received SKIP_WAITING message')
    self.skipWaiting()
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({
      version: CACHE_VERSION,
      appVersion: APP_VERSION
    })
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      (async () => {
        const cacheNames = await caches.keys()
        await Promise.all(
          cacheNames
            .filter((name) =>
              name.startsWith(CACHE_PREFIX) ||
              LEGACY_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix))
            )
            .map(name => caches.delete(name))
        )
        console.log('[Service Worker] All caches cleared')
        event.ports[0]?.postMessage({ success: true })
      })()
    )
  }
})

// ============================================================================
// PUSH NOTIFICATIONS
// ============================================================================

function normalizeNotificationPayload(event: PushEvent) {
  if (!event.data) {
    return {}
  }

  try {
    return event.data.json()
  } catch (error) {
    const text = event.data.text()
    return { body: text }
  }
}

self.addEventListener('push', event => {
  const payload = normalizeNotificationPayload(event)

  const title = typeof payload.title === 'string' ? payload.title : 'Notification'
  const body = typeof payload.body === 'string' ? payload.body : undefined
  const icon = typeof payload.icon === 'string' ? payload.icon : undefined
  const badge = typeof payload.badge === 'string' ? payload.badge : undefined

  const data = typeof payload.data === 'object' && payload.data !== null ? payload.data : {}
  const targetUrl =
    typeof payload.url === 'string'
      ? payload.url
      : typeof data.url === 'string'
        ? data.url
        : undefined

  const options: NotificationOptions = {
    body,
    icon,
    badge,
    data: {
      ...data,
      url: targetUrl
    }
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()

  const notificationData = (event.notification.data || {}) as { 
    url?: string
    notificationId?: string
    userId?: string
  }
  
  // Track notification click
  if (notificationData.notificationId) {
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'notification-click',
          notificationId: notificationData.notificationId,
          action: event.action || 'default'
        })
      })
    })
  }

  const targetUrl = notificationData.url || '/'

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      })

      // Try to focus existing window with the target URL
      for (const client of windowClients) {
        if ('focus' in client && client.url === targetUrl) {
          return client.focus()
        }
      }

      // If no existing window, open new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }

      return undefined
    })()
  )
})

self.addEventListener('notificationclose', event => {
  const notificationData = (event.notification.data || {}) as { 
    notificationId?: string
  }
  
  // Track notification dismissal
  if (notificationData.notificationId) {
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'notification-close',
          notificationId: notificationData.notificationId
        })
      })
    })
  }
})


setCatchHandler(async ({ request }) => {
  if (request.destination === 'image') {
    return imageFallbackResponse()
  }

  // For navigation/document requests that fail (e.g. offline), serve the
  // precached offline page.  matchPrecache looks up the revisioned entry
  // created by precacheAndRoute, which is more reliable than a plain
  // caches.match against the un-revisioned URL.
  if (request.destination === 'document') {
    const offlinePage = await matchPrecache('/offline.html')
    return offlinePage || Response.error()
  }

  return Response.error()
})
