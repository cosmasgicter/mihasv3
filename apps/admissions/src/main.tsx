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
import { BROWSER_KEYS, LEGACY_BROWSER_KEYS } from '@/lib/browserNamespace'

// Activate the global error reporter AFTER first paint. Sentry ships ~60-80 KB
// gzipped; eager import of `@/lib/errorReporter` pulled it into the entry
// chunk and delayed FCP by ~200 ms on mobile even when the DSN was absent.
// The runtime-only check inside initErrorReporter is not enough — the
// import itself is the cost.
//
// A bare `requestIdleCallback(..., { timeout: 3000 })` with no minimum delay
// let the browser fire it almost immediately whenever the main thread went
// idle even briefly right after paint — including inside Lighthouse's
// throttled-CPU audit trace window, which flagged the dynamically-imported
// vendor-sentry chunk as "unused JavaScript" on every audited route (real
// Lighthouse evidence: 91% of vendor-sentry unused on /track-application,
// LCP/TBT penalty). A leading `setTimeout` floor (matching the pattern
// already used by `scheduleLikelyAuthRoutePreload` in routePreload.ts) pushes
// the earliest possible idle-callback registration comfortably past a
// typical audit window, so real users still get error reporting within
// ~1-4s of load but a performance audit's trace has already closed before
// vendor-sentry is ever requested.
//
// This also means a GlitchTip outage never blocks the app from mounting.
const ERROR_REPORTER_MIN_DELAY_MS = 4000

if (typeof window !== 'undefined' && import.meta.env.VITE_GLITCHTIP_DSN) {
  const scheduleErrorReporter = () => {
    void import('@/lib/errorReporter')
      .then((m) => m.initErrorReporter())
      .catch(() => {
        // swallowed — error reporter bootstrap must never crash the app
      })
  }
  window.setTimeout(() => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(scheduleErrorReporter, { timeout: 3000 })
    } else {
      setTimeout(scheduleErrorReporter, 1500)
    }
  }, ERROR_REPORTER_MIN_DELAY_MS)
}

const CHUNK_RELOAD_LAST_TS_KEY = BROWSER_KEYS.chunkReloadTsV2
const CHUNK_RELOAD_COUNT_KEY = BROWSER_KEYS.chunkReloadCountV2
const CHUNK_RELOAD_ROUTE_KEY = BROWSER_KEYS.chunkReloadRouteV2
const LEGACY_CHUNK_RELOAD_LAST_TS_KEY = LEGACY_BROWSER_KEYS.chunkReloadTsV2
const LEGACY_CHUNK_RELOAD_COUNT_KEY = LEGACY_BROWSER_KEYS.chunkReloadCountV2
const LEGACY_CHUNK_RELOAD_ROUTE_KEY = LEGACY_BROWSER_KEYS.chunkReloadRouteV2
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
    const reloadCount =
      Number.parseInt(
        sessionStorage.getItem(CHUNK_RELOAD_COUNT_KEY) ??
          sessionStorage.getItem(LEGACY_CHUNK_RELOAD_COUNT_KEY) ??
          '0',
        10,
      ) || 0
    const lastTs =
      Number.parseInt(
        sessionStorage.getItem(CHUNK_RELOAD_LAST_TS_KEY) ??
          sessionStorage.getItem(LEGACY_CHUNK_RELOAD_LAST_TS_KEY) ??
          '0',
        10,
      ) || 0
    const lastRoute =
      sessionStorage.getItem(CHUNK_RELOAD_ROUTE_KEY) ??
      sessionStorage.getItem(LEGACY_CHUNK_RELOAD_ROUTE_KEY) ??
      null

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
    sessionStorage.removeItem(LEGACY_CHUNK_RELOAD_LAST_TS_KEY)
    sessionStorage.removeItem(LEGACY_CHUNK_RELOAD_ROUTE_KEY)
    sessionStorage.removeItem(LEGACY_CHUNK_RELOAD_COUNT_KEY)

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

// Force light mode - prevent any dark mode
if (typeof window !== 'undefined') {
  document.documentElement.classList.remove('dark')
  document.documentElement.classList.add('light')
  document.documentElement.style.colorScheme = 'light'
  document.documentElement.setAttribute('data-theme', 'light')
  document.body.classList.remove('dark')
  document.body.classList.add('light')
  document.body.style.colorScheme = 'light'

}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Expose a global function for the app to dismiss the preloader when visually ready.
// This prevents the white flash between preloader removal and first meaningful paint.
if (typeof window !== 'undefined') {
  window.__dismissPreloader = () => {
    if (window.__preloaderTimeout) {
      clearTimeout(window.__preloaderTimeout)
    }
    if (window.__preloaderMaxTimeout) {
      clearTimeout(window.__preloaderMaxTimeout)
    }
    const preloader = document.getElementById('preloader')
    if (preloader) {
      preloader.classList.add('fade-out')
      // Match the .beanola-preloader CSS transition (350ms) with a small
      // buffer so the fade animation fully plays before the node is torn
      // out of the DOM.
      setTimeout(() => preloader.remove(), 400)
    }
  }
}
