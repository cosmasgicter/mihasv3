/**
 * Rate-limit copy and `Retry-After` parsing (SJR task 3.11, clause 2.16, design R3-d).
 *
 * One source for what a student reads when the platform refuses a request for
 * going over a budget, so every journey surface says when to retry instead of
 * showing an empty catalogue or list.
 */

/** `Retry-After` is untrusted input: it is clamped to this range. */
export const RETRY_AFTER_MAX_SECONDS = 3600

/**
 * Parse a `Retry-After` header value: integer seconds, or an HTTP date converted
 * to seconds from `now`. Invalid values give `null`; valid ones clamp to 0-3600.
 */
export function parseRetryAfterSeconds(
  value: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  let seconds: number
  if (/^\d+$/.test(trimmed)) {
    seconds = Number(trimmed)
  } else {
    const at = Date.parse(trimmed)
    if (Number.isNaN(at)) return null
    seconds = Math.ceil((at - now) / 1000)
  }
  if (!Number.isFinite(seconds)) return null
  return Math.min(Math.max(seconds, 0), RETRY_AFTER_MAX_SECONDS)
}

/** "Too many requests right now. Try again in about N minutes." (N rounded up, minimum 1). */
export function rateLimitMessage(retryAfterSeconds: number | null | undefined): string {
  if (typeof retryAfterSeconds !== 'number' || !Number.isFinite(retryAfterSeconds)) {
    return 'Too many requests right now. Try again in a few minutes.'
  }
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
  return `Too many requests right now. Try again in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`
}

/** True when an error from the API client is a rate-limit refusal. */
export function isRateLimitedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const record = error as { code?: unknown; status?: unknown }
  return record.code === 'RATE_LIMITED' || record.status === 429
}

/** Seconds to wait carried by a client error, or `null` when unknown. */
export function retryAfterOf(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const value = (error as { retryAfterSeconds?: unknown }).retryAfterSeconds
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** The message to show for an error: rate-limit copy when limited, else its own message. */
export function messageForError(error: unknown, fallback: string): string {
  if (isRateLimitedError(error)) return rateLimitMessage(retryAfterOf(error))
  return error instanceof Error && error.message ? error.message : fallback
}
