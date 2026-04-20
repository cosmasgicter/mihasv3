/**
 * Session Hardening — centralized session recovery state and diagnostics.
 *
 * Provides:
 * - Auth failure deduplication (single onAuthFailure dispatch per cascade)
 * - Session recovery state tracking
 * - User-facing diagnostic messages
 * - Non-auth 403 classification (INSUFFICIENT_PERMISSIONS ≠ logout)
 *
 * @module sessionHardening
 */

// ─── Diagnostic Messages ───────────────────────────────────────────────────────

export const SESSION_MESSAGES = {
  RECONNECTING: 'Reconnecting your session…',
  PROGRESS_SAVED: 'Your progress is saved on this device while we reconnect.',
  NETWORK_ISSUE: 'Connection issue. We will retry automatically.',
  PERMISSION_DENIED: 'Permission denied for this action, but you are still signed in.',
  SESSION_EXPIRED: 'Your session expired. We saved your progress. Please sign in again to continue.',
  PAYMENT_PENDING: 'Payment is still being verified. Do not start another payment unless prompted.',
} as const

// ─── Error Classification ──────────────────────────────────────────────────────

/** Error codes that are NOT auth failures and must NOT trigger logout */
const NON_AUTH_ERROR_CODES = new Set([
  'INSUFFICIENT_PERMISSIONS',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'PAYMENT_REQUIRED',
  'PAYMENT_FAILED',
  'PAYMENT_PENDING',
  'DOCUMENT_ERROR',
  'DOCUMENT_INVALID',
  'UPLOAD_FAILED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
])

/** Check if a 403 response is a permission denial (not an auth failure) */
export function isPermissionDenial(status: number, errorCode?: string): boolean {
  if (status !== 403) return false
  // Only TOKEN_EXPIRED and CSRF codes are auth-related 403s
  if (errorCode === 'TOKEN_EXPIRED') return false
  if (errorCode === 'CSRF_VALIDATION_FAILED' || errorCode === 'CSRF_INVALID' || errorCode === 'CSRF_MISSING') return false
  return true
}

/** Check if an error code represents a non-auth business error */
export function isNonAuthError(errorCode?: string): boolean {
  if (!errorCode) return false
  return NON_AUTH_ERROR_CODES.has(errorCode)
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

// ─── Session Recovery State ────────────────────────────────────────────────────

export type SessionRecoveryState = 'idle' | 'recovering' | 'failed'

let recoveryState: SessionRecoveryState = 'idle'
const recoveryListeners = new Set<(state: SessionRecoveryState) => void>()

export function getSessionRecoveryState(): SessionRecoveryState {
  return recoveryState
}

export function setSessionRecoveryState(state: SessionRecoveryState): void {
  recoveryState = state
  recoveryListeners.forEach(fn => fn(state))
}

export function onSessionRecoveryChange(fn: (state: SessionRecoveryState) => void): () => void {
  recoveryListeners.add(fn)
  return () => { recoveryListeners.delete(fn) }
}

// ─── Auth Recovery Event ───────────────────────────────────────────────────────

/** Dispatch when auth recovery succeeds (refresh worked) — autosave can resume */
export function dispatchAuthRecovered(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mihas:auth-recovered'))
  }
}
