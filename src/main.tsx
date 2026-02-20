import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import {
  consumeAutoReloadGuard,
  performReload,
  resolveBuildKey
} from '@/lib/reloadControl'
import { registerSW } from 'virtual:pwa-register'

// Initialize connection manager to suppress extension errors
import { connectionManager } from '@/lib/connectionFix'

// Handle stale chunk errors after deployment (must run before app mounts)
// When a new build deploys, old hashed chunks no longer exist on the CDN.
// Browsers with a cached index.html still reference old chunk names, causing
// MIME type errors (HTML served instead of JS) or fetch failures.
if (typeof window !== 'undefined') {
  const buildKey = resolveBuildKey()

  const doAutoReload = (reason: 'chunk_preload_error' | 'chunk_import_error' | 'chunk_mime_error', details: Record<string, unknown>) => {
    const fingerprint = typeof details.message === 'string' && details.message
      ? details.message.slice(0, 200)
      : 'unknown'

    if (!consumeAutoReloadGuard({ reason, buildKey, details, fingerprint })) {
      return
    }

    performReload({
      reason,
      mode: 'auto',
      buildKey,
      details
    })
  }

  // Catch Vite's preload error event (fires for modulepreload link failures)
  window.addEventListener('vite:preloadError', (e) => {
    const event = e as Event & { payload?: { path?: string; message?: string } }
    const message = event.payload?.message || ''
    const path = event.payload?.path || ''
    const looksLikeChunkFailure =
      path.includes('/assets/') ||
      message.includes('dynamically imported module') ||
      message.includes('Unable to preload CSS')

    if (!looksLikeChunkFailure) {
      return
    }

    e.preventDefault()
    doAutoReload('chunk_preload_error', { message, path })
  })

  // Catch dynamic import failures and MIME type errors at the window level
  window.addEventListener('error', (e) => {
    const msg = e.message || ''
    if (
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('MIME type') ||
      msg.includes('Expected a JavaScript module script')
    ) {
      e.preventDefault()
      const reason = msg.includes('MIME type')
        ? 'chunk_mime_error'
        : 'chunk_import_error'
      doAutoReload(reason, {
        message: msg,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno
      })
    }
  }, true)

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as { message?: string } | string
    const message = typeof reason === 'string' ? reason : reason?.message || ''
    if (!message.includes('Failed to fetch dynamically imported module')) {
      return
    }

    e.preventDefault()
    doAutoReload('chunk_import_error', { message, source: 'unhandledrejection' })
  })
}

// Suppress browser extension errors that interfere with the application
if (typeof window !== 'undefined') {
  connectionManager.suppressExtensionErrors()
  
  // Force light mode - prevent any dark mode
  document.documentElement.classList.remove('dark')
  document.documentElement.classList.add('light')
  document.documentElement.style.colorScheme = 'light'
  document.documentElement.setAttribute('data-theme', 'light')
  document.body.classList.remove('dark')
  document.body.classList.add('light')
  document.body.style.colorScheme = 'light'
  
  // Register vite-plugin-pwa service worker and retire legacy /sw.js registrations
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    setTimeout(() => {
      registerSW({
        immediate: true,
        onRegisterError(error) {
          console.error('[PWA] Service worker registration failed:', error)
        }
      })

      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(
          registrations
            .filter((registration) => registration.active?.scriptURL.endsWith('/sw.js'))
            .map((registration) => registration.unregister())
        ))
        .catch(() => {})
    }, 3000)
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
