/**
 * Structured logger that routes to GlitchTip (Sentry) in production
 * and console in development. Centralises error/warn reporting so we
 * never lose visibility into production issues.
 */
import * as Sentry from '@sentry/react'

const isDev = import.meta.env.DEV

export const logger = {
  /**
   * Log an error. Routes to GlitchTip in prod, console.error in dev.
   * Use for unexpected failures that should produce an alert.
   */
  error(message: string, errorOrContext?: unknown, context?: unknown): void {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.error(`[ERROR] ${message}`, errorOrContext, context)
      return
    }
    const extra = (typeof context === 'object' && context !== null ? context : {}) as Record<string, unknown>
    if (errorOrContext instanceof Error) {
      Sentry.captureException(errorOrContext, { extra: { message, ...extra } })
    } else {
      Sentry.captureMessage(message, {
        level: 'error',
        extra: { context: errorOrContext, ...extra },
      })
    }
  },

  /**
   * Log a warning. Routes to GlitchTip as a warning-level breadcrumb in prod,
   * console.warn in dev.
   */
  warn(message: string, context?: unknown): void {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.warn(message, context)
      return
    }
    Sentry.addBreadcrumb({
      category: 'warning',
      message,
      level: 'warning',
      data: typeof context === 'object' && context !== null ? (context as Record<string, unknown>) : undefined,
    })
  },

  /**
   * Informational log. Routes to GlitchTip as an info-level breadcrumb in prod,
   * console.info in dev.
   */
  info(message: string, context?: unknown): void {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.info(message, context)
      return
    }
    Sentry.addBreadcrumb({
      category: 'info',
      message,
      level: 'info',
      data: typeof context === 'object' && context !== null ? (context as Record<string, unknown>) : undefined,
    })
  },

  /**
   * Dev-only debug log. No-op in production.
   */
  debug(...args: unknown[]): void {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.log(...args)
    }
  },
}
