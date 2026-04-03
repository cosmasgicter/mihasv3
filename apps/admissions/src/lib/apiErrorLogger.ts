/**
 * Structured API error logging utility.
 *
 * Every service-layer catch block and component error handler should call
 * `logApiError` so that failures are visible in the browser console with
 * consistent diagnostic fields (context, endpoint, status, message).
 *
 * This function is intentionally defensive — it must never throw regardless
 * of the shape of the `error` argument.
 */
export function logApiError(context: string, endpoint: string, error: unknown): void {
  try {
    const status = (error as { status?: number })?.status
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[${context}] API error — ${endpoint}`, { status, message, error })
  } catch {
    // Last-resort guard: if even the logging above somehow throws
    // (e.g. a Proxy that traps property access), swallow silently.
    // The contract is: this function never throws.
  }
}
