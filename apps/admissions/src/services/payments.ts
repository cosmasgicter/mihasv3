/**
 * Payment-endpoint service wrappers.
 *
 * Task 36.3 of the payment-hardening spec. Thin TypeScript wrappers over
 * the shared `apiClient` that add the `idempotency-key` header to every
 * payment-initiation call. Hardened envelope typing (`{success, data,
 * error: {code, message}}`) is shared with the backend stable-code
 * catalogue via `@/lib/paymentErrorCodes`.
 *
 * The underlying `apiClient.request` helper already handles CSRF,
 * cookie-based auth, and envelope unwrapping. These wrappers exist so
 * the wizard can pass an idempotency key without duplicating the client
 * setup everywhere.
 *
 * Requirements: R14.1, R15.1, R15.2.
 */

import { apiClient } from './client'
import type { PaymentStableCode } from '@/lib/paymentErrorCodes'
import type { PaymentNextAction } from '@/lib/paymentNextActions'

/** Shape of a payment-endpoint success envelope. */
export interface PaymentInitiateData {
  payment_id: string | null
  reference: string
  amount: string
  currency: string
  status?: string
  next_action?: PaymentNextAction | null
  lenco_public_key?: string
  lenco_status?: string
  lenco_reference?: string
  provider_status?: string
  operator?: string | null
  masked_phone?: string | null
}

/** Shape of a payment-endpoint failure envelope. */
export interface PaymentErrorEnvelope {
  code: PaymentStableCode | string
  message: string
  details?: Record<string, unknown>
}

export type PaymentInitiateResponse =
  | { success: true; data: PaymentInitiateData }
  | { success: false; error: PaymentErrorEnvelope; data?: Partial<PaymentInitiateData> }

export interface InitiateOptions {
  /** Opaque idempotency key emitted per-submission. See R14.1. */
  idempotencyKey?: string
}

function _buildHeaders(options?: InitiateOptions): Record<string, string> | undefined {
  if (!options?.idempotencyKey) {
    return undefined
  }
  return { 'idempotency-key': options.idempotencyKey }
}

/**
 * Initiate a card payment (Lenco widget).
 *
 * The server returns the widget config when successful and a stable
 * error code on failure. When `idempotencyKey` is supplied it is
 * forwarded as an `idempotency-key` header so replays are de-duped by
 * the backend `@idempotent` decorator.
 */
export async function initiatePayment(
  request: { application_id: string },
  options?: InitiateOptions,
): Promise<PaymentInitiateData> {
  return apiClient.request('/payments/initiate/', {
    method: 'POST',
    headers: _buildHeaders(options),
    body: JSON.stringify(request),
  }) as Promise<PaymentInitiateData>
}

/**
 * Initiate a mobile-money collection via Lenco.
 *
 * Only `application_id` and `phone` are sent to the backend — `operator`
 * is derived server-side from the MSISDN (see ADR in the design doc).
 * The `idempotency-key` header guards against double-submission.
 */
export async function initiateMobileMoney(
  request: { application_id: string; phone: string },
  options?: InitiateOptions,
): Promise<PaymentInitiateData> {
  return apiClient.request('/payments/mobile-money/', {
    method: 'POST',
    headers: _buildHeaders(options),
    body: JSON.stringify(request),
  }) as Promise<PaymentInitiateData>
}

/**
 * Verify a pending payment via the Lenco status endpoint. The backend
 * returns a stable code under `data.code` (`PAYMENT_CONFIRMED`,
 * `PAYMENT_PENDING`, `PROVIDER_UNAVAILABLE`, etc.).
 */
export async function verifyPayment(paymentId: string): Promise<PaymentInitiateData> {
  return apiClient.request(`/payments/${encodeURIComponent(paymentId)}/verify/`, {
    method: 'POST',
  }) as Promise<PaymentInitiateData>
}
