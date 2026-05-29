// ---------------------------------------------------------------------------
// UI state matrix (payment-hardening Phase 4, Task 34)
// ---------------------------------------------------------------------------
//
// Pure mapping from backend payment signals to a UI state enum. Used by
// PaymentStep when `VITE_PAYMENT_HARDENING_UI=true`. Deterministic and
// side-effect-free so Property 18 (Task 35.1) can run it under fast-check.

import type { PaymentStableCode } from './paymentErrorCodes'

export type CanonicalPaymentStatus = 'not_paid' | 'pending_review' | 'verified' | 'rejected' | 'deferred'

export function normalizePaymentStatus(paymentStatus?: string | null): CanonicalPaymentStatus {
  switch (paymentStatus) {
    case 'pending':
    case 'pending_review':
      return 'pending_review'
    case 'verified':
    case 'paid':
    case 'successful':
    case 'force_approved':
      return 'verified'
    case 'failed':
    case 'rejected':
      return 'rejected'
    case 'deferred':
      return 'deferred'
    case 'expired':
      return 'not_paid'
    default:
      return 'not_paid'
  }
}

export function requiresStudentPaymentAction(paymentStatus?: string | null) {
  const normalized = normalizePaymentStatus(paymentStatus)
  return normalized === 'not_paid' || normalized === 'rejected'
}

export function isPaymentVerified(paymentStatus?: string | null) {
  return normalizePaymentStatus(paymentStatus) === 'verified'
}

export function getPaymentStatusLabel(paymentStatus?: string | null) {
  switch (normalizePaymentStatus(paymentStatus)) {
    case 'verified':
      return 'Verified'
    case 'rejected':
      return 'Payment Rejected'
    case 'pending_review':
      return 'Awaiting Payment Review'
    case 'deferred':
      return 'Deferred'
    default:
      return 'Awaiting Payment'
  }
}

/** Canonical backend payment status names (mirrors service state machine). */
export type CanonicalPaymentServiceStatus =
  | 'pending'
  | 'deferred'
  | 'successful'
  | 'failed'
  | 'expired'
  | 'force_approved'

/** Every possible UI state the PaymentStep can render. */
export type PaymentUiState =
  | 'idle'
  | 'initiating'
  | 'awaiting_provider'
  | 'still_confirming'
  | 'confirmed'
  | 'already_paid'
  | 'retry_with_different_number'
  | 'unavailable'
  | 'max_attempts_reached'
  | 'sensitive_fields_locked'
  | 'rate_limited'
  | 'needs_admin_followup'
  | 'expired'

export interface DerivePaymentUiStateInput {
  backendStatus: CanonicalPaymentServiceStatus | null
  inflight: boolean
  stableCode: PaymentStableCode | null
  pollingExceededTimeout: boolean
}

/**
 * Deterministic mapping from backend signals to a UI state.
 *
 * Priority order (explicit — matches design §"Frontend UI State Matrix"):
 *   1. Terminal confirmed states short-circuit everything else.
 *   2. Explicit stable-code overrides.
 *   3. Polling timeout on pending → still_confirming (never failed; R14.3).
 *   4. Inflight → initiating.
 *   5. Raw backend status mapping.
 *   6. Default → idle.
 *
 * Pure function — no Date, no Math.random, no I/O.
 */
export function derivePaymentUiState(input: DerivePaymentUiStateInput): PaymentUiState {
  const { backendStatus, inflight, stableCode, pollingExceededTimeout } = input

  // --- 1. Confirmed terminal states ---
  if (backendStatus === 'successful' || backendStatus === 'force_approved') {
    return 'confirmed'
  }

  // --- 2. Explicit stable-code overrides ---
  if (stableCode === 'ALREADY_PAID') {
    return 'already_paid'
  }
  if (stableCode === 'MAX_PAYMENT_ATTEMPTS_EXCEEDED') {
    return 'max_attempts_reached'
  }
  if (stableCode === 'PAYMENT_SENSITIVE_FIELDS_LOCKED') {
    return 'sensitive_fields_locked'
  }
  if (stableCode === 'RATE_LIMITED') {
    return 'rate_limited'
  }
  if (stableCode === 'PROVIDER_UNAVAILABLE' || stableCode === 'PAYMENT_UNAVAILABLE') {
    // PROVIDER_UNAVAILABLE paired with a pending status means we can retry
    // with a different number; when the row already expired, treat it as
    // unavailable.
    if (backendStatus === 'pending' || backendStatus === null) {
      return 'retry_with_different_number'
    }
    return 'unavailable'
  }
  if (
    stableCode === 'AMOUNT_MISMATCH' ||
    stableCode === 'CURRENCY_MISMATCH' ||
    stableCode === 'MISSING_PROVIDER_REFERENCE' ||
    stableCode === 'CANNOT_REVERSE_SUCCESSFUL_PAYMENT' ||
    stableCode === 'OVERRIDE_REASON_REQUIRED' ||
    stableCode === 'RECEIPT_NOT_ELIGIBLE'
  ) {
    return 'needs_admin_followup'
  }

  // --- 3. Polling timeout on pending → still_confirming (R14.3) ---
  if (backendStatus === 'pending' && pollingExceededTimeout) {
    return 'still_confirming'
  }

  // --- 4. Inflight → initiating ---
  if (inflight) {
    return 'initiating'
  }

  // --- 5. Raw backend status mapping ---
  if (backendStatus === 'pending') {
    return 'awaiting_provider'
  }
  if (backendStatus === 'expired') {
    return 'expired'
  }
  if (backendStatus === 'failed') {
    return 'retry_with_different_number'
  }
  if (backendStatus === 'deferred') {
    // Deferred is a valid student-chosen state — we show the idle
    // initiate UI so they can pay at any time.
    return 'idle'
  }

  // --- 6. Default ---
  return 'idle'
}

/** Build-time check: the hardened PaymentStep UI is gated on a Vite flag. */
export function isPaymentHardeningUiEnabled(): boolean {
  try {
    return import.meta.env?.VITE_PAYMENT_HARDENING_UI === 'true'
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Idempotency key (payment-hardening Task 36.1)
// ---------------------------------------------------------------------------

/**
 * Build a unique idempotency key.
 *
 * When `applicationId` is provided the format is `pay-<first8>-<uuid>`.
 * Without an argument the format is a plain UUID (or legacy fallback).
 *
 * Uses `crypto.randomUUID()` when available. On legacy browsers without
 * the `crypto.randomUUID` API, falls back to a `Math.random`-based
 * string — flagged with `LEGACY FALLBACK` so it is easy to grep.
 */
export function generateIdempotencyKey(applicationId?: string): string {
  const prefix = applicationId ? `pay-${applicationId.slice(0, 8)}-` : ''

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}${crypto.randomUUID()}`
  }

  // LEGACY FALLBACK: older browsers without `crypto.randomUUID`. The
  // output is still unique enough for idempotency purposes because the
  // backend keys on `(idempotency_key, actor, method, path, body_hash)`.
  const rand = Math.random().toString(36).slice(2, 14)
  const time = Date.now().toString(36)
  return `${prefix}${time}-${rand}`
}
