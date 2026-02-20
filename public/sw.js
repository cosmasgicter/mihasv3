// Legacy service worker retired.
// Source of truth is now src/service-worker.ts generated via vite-plugin-pwa.
// This no-op worker exists only as a migration safety placeholder.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
