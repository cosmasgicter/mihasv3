/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<unknown> }

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

registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365
      })
    ]
  })
)

// Enhanced offline-first caching strategies
registerRoute(
  ({ url }) => /https:\/\/.*\.supabase\.co\/rest\/v1\//i.test(url.href),
  new NetworkFirst({
    cacheName: 'supabase-api-cache',
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 5 // 5 minutes for API responses
      })
    ]
  })
)

// Cache application data for offline access
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 10 // 10 minutes
      })
    ]
  })
)

// Cache static application shell
registerRoute(
  ({ url }) => url.pathname.startsWith('/'),
  new NetworkFirst({
    cacheName: 'pages-cache',
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 60 * 60 * 24 // 24 hours
      })
    ]
  })
)

registerRoute(
  ({ url }) => /https:\/\/.*\.supabase\.co\/auth\//i.test(url.href),
  new NetworkOnly()
)

registerRoute(
  ({ url }) => /https:\/\/.*\.supabase\.co\/storage\/v1\//i.test(url.href),
  new CacheFirst({
    cacheName: 'supabase-storage-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 * 7
      })
    ]
  })
)

registerRoute(
  ({ request }) => request.destination === 'document',
  new NetworkFirst({
    cacheName: 'pages-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 60 * 60 * 24
      })
    ]
  })
)

registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 30
      })
    ]
  })
)

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
