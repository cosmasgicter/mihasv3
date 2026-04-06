/**
 * Frontend error reporter — captures unhandled errors and promise rejections,
 * batches them with a 5-second debounce, and POSTs to the backend error
 * monitoring endpoint.
 *
 * Uses raw `fetch` instead of `apiClient` because errors can fire before
 * auth / CSRF infrastructure is initialized.
 */

import { getApiBaseUrl } from './apiConfig'

interface ErrorPayload {
  message: string
  stack_trace?: string
  url: string
  user_agent: string
  context?: Record<string, unknown>
}

const BATCH_DELAY_MS = 5_000

let buffer: ErrorPayload[] = []
let timer: ReturnType<typeof setTimeout> | null = null

function getAppVersion(): string {
  try {
    return import.meta.env.VITE_APP_VERSION ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

function enqueue(payload: ErrorPayload): void {
  buffer.push(payload)

  if (timer !== null) return
  timer = setTimeout(flush, BATCH_DELAY_MS)
}

function flush(): void {
  timer = null
  if (buffer.length === 0) return

  const batch = buffer
  buffer = []

  const body = JSON.stringify(
    batch.length === 1
      ? batch[0]
      : { errors: batch },
  )

  try {
    fetch(`${getApiBaseUrl()}/api/v1/errors/report/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch((err) => {
      console.error('[ErrorReporter] POST failed:', err)
    })
  } catch (err) {
    console.error('[ErrorReporter] fetch threw:', err)
  }
}

function buildPayload(
  message: string,
  stack?: string,
  extra?: Record<string, unknown>,
): ErrorPayload {
  return {
    message,
    stack_trace: stack,
    url: window.location.href,
    user_agent: navigator.userAgent,
    context: {
      app_version: getAppVersion(),
      ...extra,
    },
  }
}

function handleWindowError(
  event: string | Event,
  source?: string,
  lineno?: number,
  colno?: number,
  error?: Error,
): void {
  const message =
    error?.message ??
    (typeof event === 'string' ? event : 'Unknown error')

  enqueue(
    buildPayload(message, error?.stack, {
      source,
      lineno,
      colno,
    }),
  )
}

function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : 'Unhandled promise rejection'

  const stack = reason instanceof Error ? reason.stack : undefined

  enqueue(buildPayload(message, stack, { type: 'unhandledrejection' }))
}

/**
 * Report an error directly (e.g. from an error boundary).
 * Enqueues the error into the batch buffer for delivery to the backend.
 */
export function reportError(
  error: Error,
  extra?: Record<string, unknown>,
): void {
  enqueue(buildPayload(error.message, error.stack, extra))
}

/**
 * Activate the global error reporter. Call once at app startup.
 * Respects `VITE_ERROR_REPORT_ENABLED` — does nothing when disabled.
 */
export function initErrorReporter(): void {
  if (typeof window === 'undefined') return
  if (import.meta.env.VITE_ERROR_REPORT_ENABLED === 'false') return

  window.onerror = handleWindowError
  window.addEventListener('unhandledrejection', handleUnhandledRejection)
}
