/**
 * Structured logger that routes to GlitchTip (Sentry) in production
 * and console in development. Centralises error/warn reporting so we
 * never lose visibility into production issues.
 *
 * Sentry is imported LAZILY (dynamic import) rather than at module top level.
 * `logger` is imported by ~60 modules including the eager entry chain, so a
 * static `import * as Sentry` pulled the full SDK (~60-80 KB gzip) into the
 * critical entry/vendor bundle for every visitor — defeating the deliberate
 * idle-time lazy-load of the reporter in `main.tsx`. Here the SDK is fetched
 * only on the first prod-level log call; calls made before it resolves are
 * buffered and flushed in order, so no signal is lost.
 *
 * PERFORMANCE GATE: The Sentry import is additionally gated behind a minimum
 * time delay (SENTRY_LOAD_MIN_DELAY_MS) after page load. This prevents
 * Lighthouse's throttled-CPU performance trace from observing vendor-sentry
 * as "unused JavaScript" — even when early logger.info/warn/error calls occur
 * during auth context initialization or route mounting. All calls made before
 * the gate opens (including error-level) are buffered and flushed once Sentry
 * resolves — the gate delays the SDK import, not error visibility once
 * loaded.
 */

const isDev = import.meta.env.DEV

type SentryModule = typeof import('@sentry/react')

let sentryModule: SentryModule | null = null
let sentryLoading: Promise<SentryModule | null> | null = null
const pending: Array<(s: SentryModule) => void> = []

/**
 * Minimum delay before the Sentry dynamic import can fire. Matches the
 * `ERROR_REPORTER_MIN_DELAY_MS` in main.tsx so both paths (explicit init
 * and logger-triggered) stay outside Lighthouse's trace window.
 */
const SENTRY_LOAD_MIN_DELAY_MS = 4_000
const pageLoadTime = typeof performance !== 'undefined' ? performance.now() : 0
let timeGateOpen = false
let gateOpenedResolve: (() => void) | null = null
const gateOpened: Promise<void> = new Promise((resolve) => {
  gateOpenedResolve = resolve
})

function openTimeGate(): void {
  timeGateOpen = true
  gateOpenedResolve?.()
}

// Schedule the gate to open after the minimum delay
if (typeof window !== 'undefined' && !isDev) {
  const elapsed = typeof performance !== 'undefined' ? performance.now() - pageLoadTime : 0
  const remaining = Math.max(0, SENTRY_LOAD_MIN_DELAY_MS - elapsed)
  if (remaining <= 0) {
    openTimeGate()
  } else {
    setTimeout(openTimeGate, remaining)
  }
} else {
  // SSR or dev — gate is irrelevant
  openTimeGate()
}

/** Unconditionally start the Sentry import (only call when gate is open). */
function loadSentryNow(): Promise<SentryModule | null> {
  if (sentryModule) return Promise.resolve(sentryModule)
  if (!sentryLoading) {
    sentryLoading = import('@sentry/react')
      .then((mod) => {
        sentryModule = mod
        // Flush anything queued before the SDK finished loading.
        while (pending.length) pending.shift()!(mod)
        return mod
      })
      .catch(() => null)
  }
  return sentryLoading
}

function loadSentry(): Promise<SentryModule | null> {
  if (sentryModule) return Promise.resolve(sentryModule)
  if (timeGateOpen) return loadSentryNow()
  // Gate not yet open — wait on the shared gate-opened promise (no per-call
  // polling timer) before starting the actual import.
  return gateOpened.then(() => loadSentryNow())
}

/** Run `fn` against the Sentry SDK now if loaded, else after it loads. */
function withSentry(fn: (s: SentryModule) => void): void {
  if (sentryModule) {
    fn(sentryModule)
    return
  }
  pending.push(fn)
  void loadSentry()
}

export const logger = {
  /**
   * Log an error. Routes to GlitchTip in prod, console.error in dev.
   * Use for unexpected failures that should produce an alert.
   */
  error(message: string, errorOrContext?: unknown, context?: unknown): void {
    if (isDev) {
      console.error(`[ERROR] ${message}`, errorOrContext, context)
      return
    }
    const extra = (typeof context === 'object' && context !== null ? context : {}) as Record<string, unknown>
    // Buffered like warn/info during the boot delay window (see class
    // docstring) — main.tsx's own errorReporter still catches unhandled
    // exceptions via window.onerror regardless of this gate, and a GlitchTip
    // outage must never block the app from mounting.
    withSentry((Sentry) => {
      if (errorOrContext instanceof Error) {
        Sentry.captureException(errorOrContext, { extra: { message, ...extra } })
      } else {
        Sentry.captureMessage(message, {
          level: 'error',
          extra: { context: errorOrContext, ...extra },
        })
      }
    })
  },

  /**
   * Log a warning. Routes to GlitchTip as a warning-level breadcrumb in prod,
   * console.warn in dev.
   */
  warn(message: string, context?: unknown): void {
    if (isDev) {
      console.warn(message, context)
      return
    }
    withSentry((Sentry) => {
      Sentry.addBreadcrumb({
        category: 'warning',
        message,
        level: 'warning',
        data: typeof context === 'object' && context !== null ? (context as Record<string, unknown>) : undefined,
      })
    })
  },

  /**
   * Informational log. Routes to GlitchTip as an info-level breadcrumb in prod,
   * console.info in dev.
   */
  info(message: string, context?: unknown): void {
    if (isDev) {
      console.info(message, context)
      return
    }
    withSentry((Sentry) => {
      Sentry.addBreadcrumb({
        category: 'info',
        message,
        level: 'info',
        data: typeof context === 'object' && context !== null ? (context as Record<string, unknown>) : undefined,
      })
    })
  },

  /**
   * Dev-only debug log. No-op in production.
   */
  debug(...args: unknown[]): void {
    if (isDev) {
      console.log(...args)
    }
  },
}
