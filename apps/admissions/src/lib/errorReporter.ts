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
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
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
