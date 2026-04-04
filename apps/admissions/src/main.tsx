import React from 'react'
import ReactDOM from 'react-dom/client'
import { z } from 'zod'
import App from './App'
import './index.css'

// Disable Zod v4 JIT compilation to eliminate the need for 'unsafe-eval' in CSP.
// Zod v4 uses `new Function()` for JIT-compiled object schema parsing, which
// requires 'unsafe-eval' in Content-Security-Policy. Setting jitless: true
// bypasses the JIT path entirely, using the standard interpreter instead.
// The performance difference is negligible for client-side form validation.
z.config({ jitless: true })
import {
  consumeAutoReloadGuard,
  performReload,
  resolveBuildKey,
  logReloadEvent,
  incrementReloadReasonCounter,
} from '@/lib/reloadControl'
import { registerSW } from 'virtual:pwa-register'
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
const CACHE_RESET_STORAGE_KEY = 'mihas_runtime_cache_reset'
const CACHE_RESET_VERSION = 'post-qa-2026-04-02'

async function runOneTimeRuntimeCacheReset(): Promise<boolean> {
  if (typeof window === 'undefined' || !import.meta.env.PROD) {
    return false
  }

  try {
    if (localStorage.getItem(CACHE_RESET_STORAGE_KEY) === CACHE_RESET_VERSION) {
      return false
    }

    const registrations = 'serviceWorker' in navigator
      ? await navigator.serviceWorker.getRegistrations()
      : []
    const cacheKeys = 'caches' in window ? await caches.keys() : []

    await Promise.all([
      ...registrations.map((registration) => registration.unregister()),
      ...cacheKeys.map((cacheKey) => caches.delete(cacheKey)),
    ])

    localStorage.setItem(CACHE_RESET_STORAGE_KEY, CACHE_RESET_VERSION)

    const url = new URL(window.location.href)
    url.searchParams.set('_cache_reset', CACHE_RESET_VERSION)
    window.location.replace(url.toString())
    return true
  } catch (error) {
    console.warn('[PWA] One-time runtime cache reset failed:', error)
    return false
  }
}

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
  
  // Register vite-plugin-pwa service worker and retire legacy /sw.js registrations
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    setTimeout(() => {
      runOneTimeRuntimeCacheReset()
        .then((didReset) => {
          if (didReset) {
            return
          }

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
        })
        .catch((error) => {
          console.warn('[PWA] Runtime cache reset bootstrap failed:', error)
        })
    }, 3000)
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
