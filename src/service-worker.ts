/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<unknown> }

// Cache version for invalidation on deployment
// Uses VITE_APP_VERSION from environment, falls back to package.json version
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0'
const CACHE_VERSION = `v${APP_VERSION}`
const CACHE_PREFIX = 'mihas-app'

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
self.skipWaiting()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()


// ============================================================================
// STATIC ASSETS - CacheFirst Strategy
// ============================================================================

// Google Fonts - Cache first with long expiration
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new CacheFirst({
    cacheName: `${CACHE_PREFIX}-google-fonts-${CACHE_VERSION}`,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
        purgeOnQuotaError: true
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
)

// Images - Cache first with 30-day expiration
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: `${CACHE_PREFIX}-images-${CACHE_VERSION}`,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        purgeOnQuotaError: true
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
)

// CSS and JavaScript - Cache first with 7-day expiration
registerRoute(
  ({ request }) => 
    request.destination === 'style' || 
    request.destination === 'script',
  new CacheFirst({
    cacheName: `${CACHE_PREFIX}-assets-${CACHE_VERSION}`,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
        purgeOnQuotaError: true
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
)

// Fonts - Cache first with long expiration
registerRoute(
  ({ request }) => request.destination === 'font',
  new CacheFirst({
    cacheName: `${CACHE_PREFIX}-fonts-${CACHE_VERSION}`,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
        purgeOnQuotaError: true
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
)

// Supabase Storage - Cache first for uploaded files
registerRoute(
  ({ url }) => /https:\/\/.*\.supabase\.co\/storage\/v1\//i.test(url.href),
  new CacheFirst({
    cacheName: `${CACHE_PREFIX}-supabase-storage-${CACHE_VERSION}`,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
        purgeOnQuotaError: true
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
)

// ============================================================================
// API RESPONSES - NetworkFirst Strategy
// ============================================================================

// Supabase REST API - Network first with 5-minute cache fallback
registerRoute(
  ({ url }) => /https:\/\/.*\.supabase\.co\/rest\/v1\//i.test(url.href),
  new NetworkFirst({
    cacheName: `${CACHE_PREFIX}-supabase-api-${CACHE_VERSION}`,
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 5, // 5 minutes
        purgeOnQuotaError: true
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
)

// Cloudflare Functions API - Network Only for high volatility
// High volatility endpoints (applications, realtime)
registerRoute(
  ({ url }) => 
    url.pathname.startsWith('/api/applications') ||
    url.pathname.startsWith('/applications') ||
    url.pathname.startsWith('/notifications'),
  new NetworkOnly({
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
)

// Medium volatility endpoints (user data, profiles)
registerRoute(
  ({ url }) => 
    url.pathname.startsWith('/api/users') ||
    url.pathname.startsWith('/api/profiles'),
  new NetworkFirst({
    cacheName: `${CACHE_PREFIX}-api-medium-volatility-${CACHE_VERSION}`,
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 15, // 15 minutes (matches React Query config)
        purgeOnQuotaError: true
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
)

// Low volatility endpoints (analytics, reports, catalog)
registerRoute(
  ({ url }) => 
    url.pathname.startsWith('/api/analytics') ||
    url.pathname.startsWith('/analytics') ||
    url.pathname.startsWith('/catalog') ||
    url.pathname.startsWith('/api/catalog'),
  new NetworkFirst({
    cacheName: `${CACHE_PREFIX}-api-low-volatility-${CACHE_VERSION}`,
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 30, // 30 minutes (matches React Query config)
        purgeOnQuotaError: true
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
)

// Generic API fallback - Network first with 10-minute cache
registerRoute(
  ({ url }) => 
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/admin/') ||
    url.pathname.startsWith('/documents/') ||
    url.pathname.startsWith('/payments/'),
  new NetworkFirst({
    cacheName: `${CACHE_PREFIX}-api-generic-${CACHE_VERSION}`,
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 10, // 10 minutes
        purgeOnQuotaError: true
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
)

// ============================================================================
// SPECIAL CASES
// ============================================================================

// Auth endpoints - Network only (never cache)
registerRoute(
  ({ url }) => 
    /https:\/\/.*\.supabase\.co\/auth\//i.test(url.href) ||
    url.pathname.startsWith('/auth/'),
  new NetworkOnly()
)

// HTML Documents - Network first with 24-hour cache fallback
registerRoute(
  ({ request }) => request.destination === 'document',
  new NetworkFirst({
    cacheName: `${CACHE_PREFIX}-pages-${CACHE_VERSION}`,
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 60 * 60 * 24, // 24 hours
        purgeOnQuotaError: true
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
)

// Stale-while-revalidate for non-critical resources
registerRoute(
  ({ url }) => 
    url.pathname.startsWith('/generate/') ||
    url.pathname.startsWith('/interview/'),
  new StaleWhileRevalidate({
    cacheName: `${CACHE_PREFIX}-swr-${CACHE_VERSION}`,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 60 * 60 * 24, // 24 hours
        purgeOnQuotaError: true
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
)

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

// Clean up old cache versions on activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      console.log(`[Service Worker] Activating with cache version: ${CACHE_VERSION}`)
      
      const cacheNames = await caches.keys()
      const oldCaches = cacheNames.filter(
        name => name.startsWith(CACHE_PREFIX) && !name.includes(CACHE_VERSION)
      )
      
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
            .filter(name => name.startsWith(CACHE_PREFIX))
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
