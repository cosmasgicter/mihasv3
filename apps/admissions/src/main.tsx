import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import {
  consumeAutoReloadGuard,
  performReload,
  resolveBuildKey,
  logReloadEvent,
  incrementReloadReasonCounter,
} from '@/lib/reloadControl'
import { evaluateChunkAutoReloadPolicy } from '@/lib/chunkAutoReloadPolicy'
import { initErrorReporter } from '@/lib/errorReporter'

// Initialize connection manager to suppress extension errors
import { connectionManager } from '@/lib/connectionFix'

// Activate the global error reporter (respects VITE_ERROR_REPORT_ENABLED)
initErrorReporter()

const CHUNK_RELOAD_LAST_TS_KEY = 'mihas_chunk_reload_ts_v2'
const CHUNK_RELOAD_COUNT_KEY = 'mihas_chunk_reload_count_v2'
const CHUNK_RELOAD_ROUTE_KEY = 'mihas_chunk_reload_route_v2'
const CHUNK_RELOAD_MAX_PER_SESSION = 1
const CHUNK_RELOAD_COOLDOWN_MS = 120_000

// Handle stale chunk errors after deployment (must run before app mounts)
// When a new build deploys, old hashed chunks no longer exist on the CDN.
// Browsers with a cached index.html still reference old chunk names, causing
// MIME type errors (HTML served instead of JS) or fetch failures.
if (typeof window !== 'undefined') {
  const buildKey = resolveBuildKey()
  let lastActivityAt = Date.now()

  const markActivity = () => {
    lastActivityAt = Date.now()
  }

  ;['pointerdown', 'keydown', 'touchstart', 'focus'].forEach((eventName) => {
    window.addEventListener(eventName, markActivity, true)
  })

  const canAttemptChunkAutoReload = (reason: 'chunk_preload_error' | 'chunk_import_error' | 'chunk_mime_error') => {
    const now = Date.now()
    const currentRoute = window.location.pathname
    const reloadCount = Number.parseInt(sessionStorage.getItem(CHUNK_RELOAD_COUNT_KEY) ?? '0', 10) || 0
    const lastTs = Number.parseInt(sessionStorage.getItem(CHUNK_RELOAD_LAST_TS_KEY) ?? '0', 10) || 0
    const lastRoute = sessionStorage.getItem(CHUNK_RELOAD_ROUTE_KEY) ?? null

    const decision = evaluateChunkAutoReloadPolicy({
      now,
      lastReloadAt: lastTs,
      reloadCount,
      maxPerSession: CHUNK_RELOAD_MAX_PER_SESSION,
      cooldownMs: CHUNK_RELOAD_COOLDOWN_MS,
      route: currentRoute,
      lastActivityAt,
    })

    if (decision.allow) {
      return true
    }

    incrementReloadReasonCounter(reason, 'blocked')
    logReloadEvent({
      reason,
      mode: 'auto',
      buildKey,
      details: {
        ignored: true,
        cause: `chunk-${decision.cause}`,
        currentRoute,
        lastRoute,
        ...(decision.context ?? {}),
      },
    })

    return false
  }

  const doAutoReload = (reason: 'chunk_preload_error' | 'chunk_import_error' | 'chunk_mime_error', details: Record<string, unknown>) => {
    const fingerprint = typeof details.message === 'string' && details.message
      ? details.message.slice(0, 200)
      : 'unknown'

    if (!canAttemptChunkAutoReload(reason)) {
      return
    }

    if (!consumeAutoReloadGuard({ reason, buildKey, details, fingerprint })) {
      return
    }

    sessionStorage.setItem(CHUNK_RELOAD_LAST_TS_KEY, String(Date.now()))
    sessionStorage.setItem(CHUNK_RELOAD_ROUTE_KEY, window.location.pathname)
    sessionStorage.setItem(CHUNK_RELOAD_COUNT_KEY, String((Number.parseInt(sessionStorage.getItem(CHUNK_RELOAD_COUNT_KEY) ?? '0', 10) || 0) + 1))

    performReload({
      reason,
      mode: 'auto',
      buildKey,
      details: {
        ...details,
        route: window.location.pathname,
      },
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

  // Unregister any leftover service workers from the removed PWA setup.
  // This ensures existing users don't keep serving stale cached data.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister()
      }
    }).catch(() => {})
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Remove the preloader after React mounts (Requirement 2.2)
if (typeof window !== 'undefined') {
  // Clear the slow-load timeout so the message never appears after mount
  if ((window as unknown as Record<string, unknown>).__preloaderTimeout) {
    clearTimeout((window as unknown as Record<string, unknown>).__preloaderTimeout as number)
  }

  const preloader = document.getElementById('preloader')
  if (preloader) {
    preloader.classList.add('fade-out')
    setTimeout(() => {
      preloader.remove()
    }, 180)
  }
}
