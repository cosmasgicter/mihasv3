/**
 * Frontend error reporter — initializes GlitchTip (Sentry-compatible) browser SDK
 * for automatic error capture and reporting.
 *
 * Replaces the previous custom batch-and-POST reporter. GlitchTip captures
 * window.onerror, unhandled rejections, and console errors automatically
 * once initialized.
 */

import * as Sentry from '@sentry/react'

/**
 * In-memory dedup + volume guard so a single repeating error (or an error
 * loop) cannot flood the GlitchTip free-tier ingest endpoint and trigger
 * HTTP 429 on `…/envelope/`. State is per page-load; resets on reload.
 */
const MAX_EVENTS_PER_SESSION = 25
const DEDUP_WINDOW_MS = 60_000
let sessionEventCount = 0
const recentSignatures = new Map<string, number>()

function eventSignature(event: Sentry.ErrorEvent): string {
  const ex = event.exception?.values?.[0]
  const type = ex?.type ?? event.message ?? 'unknown'
  const top = ex?.stacktrace?.frames?.at(-1)
  const loc = top ? `${top.filename ?? ''}:${top.lineno ?? ''}` : ''
  return `${type}|${loc}`
}

/**
 * Activate the global error reporter. Call once at app startup.
 * Respects `VITE_GLITCHTIP_DSN` — does nothing when the DSN is absent.
 */
export function initErrorReporter(): void {
  if (typeof window === 'undefined') return

  const dsn = import.meta.env.VITE_GLITCHTIP_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION ?? 'unknown',
    // ── GlitchTip free-tier quota: ERRORS ONLY ──────────────────────────────
    // The 429s on `…/envelope/` were release-health *session* envelopes
    // (captureSession/sendSession) and performance *transaction* envelopes —
    // neither of which beforeSend/sampleRate gate. We do not use GlitchTip's
    // release-health or performance dashboards, so both envelope sources are
    // turned off entirely. Only sampled + deduped + capped error events are
    // sent, which is all we consume.
    //
    // In Sentry JS v8+ there is no `autoSessionTracking` option — session
    // tracking is owned solely by the `BrowserSession` integration, and
    // performance by `BrowserTracing`. Dropping both integrations below (plus
    // tracesSampleRate: 0) eliminates every non-error envelope at the source.
    tracesSampleRate: 0,               // no performance transaction envelopes
    integrations: (defaults) =>
      defaults.filter(
        (integration) =>
          integration.name !== 'BrowserSession' &&
          integration.name !== 'BrowserTracing',
      ),
    sampleRate: 0.25,
    sendDefaultPii: false,
    // Drop browser-extension / network noise that adds no signal but burns quota.
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications.',
      'Non-Error promise rejection captured',
      'Failed to fetch',
      'NetworkError when attempting to fetch resource.',
      'Load failed',
      'AbortError',
    ],
    beforeSend(event) {
      // Hard cap per page-load so an error loop can never flood ingest.
      if (sessionEventCount >= MAX_EVENTS_PER_SESSION) return null

      // Dedup identical errors within a rolling window.
      const sig = eventSignature(event)
      const now = Date.now()
      const last = recentSignatures.get(sig)
      if (last !== undefined && now - last < DEDUP_WINDOW_MS) return null

      recentSignatures.set(sig, now)
      // Prune old signatures to bound memory.
      if (recentSignatures.size > 100) {
        for (const [k, t] of recentSignatures) {
          if (now - t > DEDUP_WINDOW_MS) recentSignatures.delete(k)
        }
      }
      sessionEventCount += 1
      return event
    },
  })
}

/**
 * Report an error directly (e.g. from an error boundary).
 */
export function reportError(
  error: Error,
  extra?: Record<string, unknown>,
): void {
  Sentry.captureException(error, { extra })
}
