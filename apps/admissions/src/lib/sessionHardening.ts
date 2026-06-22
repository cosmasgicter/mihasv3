/**
 * Session Hardening — centralized auth failure deduplication and classification.
 *
 * Provides:
 * - Auth failure deduplication (single onAuthFailure dispatch per cascade)
 * - Non-auth 403 classification (INSUFFICIENT_PERMISSIONS ≠ logout)
 * - Auth recovery event for autosave resume
 * - Session-expired message constant
 *
 * @module sessionHardening
 */
import { BROWSER_EVENTS } from '@/lib/browserNamespace'

// ─── Diagnostic Messages ───────────────────────────────────────────────────────

export const SESSION_MESSAGES = {
  SESSION_EXPIRED: 'Your session expired. We saved your progress. Please sign in again to continue.',
} as const

// ─── Error Classification ──────────────────────────────────────────────────────

/** Check if a 403 response is a permission denial (not an auth failure) */
export function isPermissionDenial(status: number, errorCode?: string): boolean {
  if (status !== 403) return false
  // CSRF codes are the only non-permission-denial 403s
  if (errorCode === 'CSRF_VALIDATION_FAILED' || errorCode === 'CSRF_INVALID' || errorCode === 'CSRF_MISSING') return false
  return true
}

// ─── Auth Failure Deduplication ────────────────────────────────────────────────

let lastAuthFailureTime = 0
const AUTH_FAILURE_DEBOUNCE_MS = 3000

/**
 * Returns true if an auth failure dispatch should proceed.
 * Prevents multiple concurrent 401s from triggering parallel onAuthFailure cascades.
 */
export function shouldDispatchAuthFailure(): boolean {
  const now = Date.now()
  if (now - lastAuthFailureTime < AUTH_FAILURE_DEBOUNCE_MS) return false
  lastAuthFailureTime = now
  return true
}

/** Reset the auth failure debounce (e.g., after successful login) */
export function resetAuthFailureDebounce(): void {
  lastAuthFailureTime = 0
}

// ─── Auth Recovery Event ───────────────────────────────────────────────────────

/** Dispatch when auth recovery succeeds (refresh worked) — autosave can resume */
export function dispatchAuthRecovered(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BROWSER_EVENTS.authRecovered))
  }
}
