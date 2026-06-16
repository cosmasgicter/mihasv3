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
 */

const isDev = import.meta.env.DEV

type SentryModule = typeof import('@sentry/react')

let sentryModule: SentryModule | null = null
let sentryLoading: Promise<SentryModule | null> | null = null
const pending: Array<(s: SentryModule) => void> = []

function loadSentry(): Promise<SentryModule | null> {
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
