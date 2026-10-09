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

import { apiClient, buildQueryString } from './client'
import type { PaymentStableCode } from '@/lib/paymentErrorCodes'
import type { PaymentNextAction } from '@/lib/paymentNextActions'
import type { PaymentPhase } from '@/lib/paymentStatus'

/**
 * Wire shape of `POST/GET /api/v1/payments/quote/` (design §10.1).
 *
 * Admissions-v2 task 8.1. Every amount is the decimal **string** the server
 * authored, so no client can lose precision re-parsing it and no client needs to
 * compute a total. `bearer` names who carries the provider fee, `expires_at` is
 * the server-stated hold, and `signature` binds the numbers to the server that
 * issued them.
 */
export interface FeeQuote {
  quote_id: string
  application_id: string
  configuration_version: string | null
  fee_configuration_version: string
  fee_type: string
  /** Canonical application fee after any waiver, as sent by the server. */
  base_amount: string
  /** Customer-borne provider fee from the server-side policy. */
  provider_fee: string
  /** What the student will be charged. Server-computed. */
  total_amount: string
  currency: string
  bearer: string
  residency_category: string
  waiver_applied: boolean
  status: string
  expires_at: string | null
  signature: string
  signature_version: number
}

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
 * Sends `application_id` and `phone` only. Provider/network routing is
 * **server-authored** (admissions-v2 task 8.1, design §10.2): the backend
 * normalises the MSISDN and derives the operator itself, and it ignores any
 * client-supplied `operator`. The client no longer guesses a network from a
 * prefix — an unsupported number comes back as the stable `PROVIDER_UNAVAILABLE`
 * code with a named recovery action.
 *
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

// ---------------------------------------------------------------------------
// Payment ledger reads (admissions-v2 task 8.3)
// ---------------------------------------------------------------------------

/**
 * One canonical payment row, as `GET /api/v1/payments/` serves it.
 *
 * `status` is the canonical ledger status and `phase` is the server's answer to
 * *who is being waited on* (task 8.2). Both are read, never derived client-side;
 * `phase_timeout_seconds` is the server's UI wait budget for that phase.
 */
export interface PaymentRow {
  id: string
  application_id: string
  status: string
  amount: number | string | null
  currency: string | null
  created_at: string
  transaction_reference?: string | null
  phase?: PaymentPhase | null
  phase_timeout_seconds?: number | null
  /**
   * Both optional and both served by `PaymentSerializer` (`backend/apps/documents/
   * serializers.py`, `Meta.fields`). Declared for the receipt-preview callers task
   * 13.6 remediation L12 moved onto this reader; nothing derived from them.
   */
  payment_method?: string | null
  updated_at?: string
}

interface PaymentListEnvelope {
  results?: PaymentRow[]
  [key: string]: unknown
}

/**
 * Read the payment rows out of a `GET /api/v1/payments/` response.
 *
 * **One reader for one endpoint** (task 12.2, R14.5, findings API-02 / REL-01).
 * This function's own docstring used to claim the unwrapping "lives in one
 * place"; it did not — `hooks/usePaymentStatus.ts` carried a byte-equivalent
 * fourth-branch copy of it over the same endpoint. That copy is gone and the
 * hook calls this. Two copies of a permissive reader is how one of them keeps a
 * branch the other drops.
 *
 * `PaymentListView` paginates with `StandardPagination` (`page_size = 20`, so
 * `paginate_queryset` never declines), which makes the unwrapped payload
 * `{page, pageSize, totalCount, results}`. The bare-array branch is kept for the
 * view's own un-paginated `return Response({"success": True, "data": …})` tail.
 *
 * Deleted, with why each was unreachable:
 *
 * - `.payments` — a domain-keyed list `PaymentListView` has never had.
 * - `.data` and `.data.results` — a **second** envelope. `apiClient.request`
 *   unwraps exactly one `{success, data}` level, so these required
 *   `{success, data: {data: […]}}`.
 *
 * Zero first-party callers of the deleted branches
 * (`scripts/v1_surface_telemetry.py`, surface `normalizer.payments.row_sniff`).
 */
export function normalizePaymentRows(
  payload: PaymentListEnvelope | PaymentRow[] | null | undefined,
): PaymentRow[] {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  if (Array.isArray(payload.results)) return payload.results
  return []
}

/**
 * Read this student's payment rows — the whole ledger, or one application's.
 *
 * The student payment page owns post-submission recovery and history (R12.3), and
 * this is the read it is built on. Ownership is enforced server-side; the client
 * asks only for its own.
 */
export async function listPayments(params: { applicationId?: string } = {}): Promise<PaymentRow[]> {
  const query = params.applicationId
    ? buildQueryString({ application_id: params.applicationId })
    : ''
  const payload = await apiClient.request<PaymentListEnvelope | PaymentRow[]>(`/payments/${query}`)
  return normalizePaymentRows(payload)
}

// ---------------------------------------------------------------------------
// Fee quote — the server-authored money contract (task 8.1)
// ---------------------------------------------------------------------------

/**
 * Mint (or reuse) the expiring fee quote for an application.
 *
 * `POST /api/v1/payments/quote/` takes **only** the application id: the server
 * resolves the canonical offering, residency, fee, provider-fee policy, and
 * configuration version itself. There is no request field through which a client
 * could suggest an amount, and no response path that yields a default one — a
 * missing or ambiguous fee comes back as `FEE_NOT_CONFIGURED` / `FEE_AMBIGUOUS`
 * (R12.1, R12.2).
 */
export async function createFeeQuote(applicationId: string): Promise<FeeQuote> {
  return apiClient.request('/payments/quote/', {
    method: 'POST',
    body: JSON.stringify({ application_id: applicationId }),
  }) as Promise<FeeQuote>
}

/**
 * Read the live quote back without minting a new one.
 *
 * `GET /api/v1/payments/quote/` returns the current unexpired, untampered quote
 * and `QUOTE_NOT_FOUND` when there is none — so a refreshed payment page shows
 * the same held price rather than silently re-pricing.
 */
export async function readFeeQuote(applicationId: string): Promise<FeeQuote> {
  return apiClient.request(
    `/payments/quote/${buildQueryString({ application_id: applicationId })}`,
  ) as Promise<FeeQuote>
}

// ---------------------------------------------------------------------------
// Pay-or-defer, and the receipt read (transports moved here by 13.6 L12)
// ---------------------------------------------------------------------------

/**
 * Defer the application fee and submit without paying it now.
 *
 * `deferred` is a canonical payment status, not a client-side flag: the server records
 * it, submission is allowed against it, and `deferred_payment_reminder_task` chases it
 * later. The wizard owns this decision *before* submission (R12.3); afterwards it
 * belongs to `/student/payment`.
 *
 * Moved out of `applicationWizard/steps/PaymentStep.tsx` by task 13.6 remediation L12 —
 * a step component was issuing the command over the raw client, which the R14.3 rule
 * forbids. Same endpoint, same body, same failure surface.
 */
export async function deferPayment(applicationId: string): Promise<unknown> {
  return apiClient.request('/payments/defer/', {
    method: 'POST',
    body: JSON.stringify({ application_id: applicationId }),
  })
}

/**
 * Local-development shortcut past collection.
 *
 * Kept behind the backend's own guard, not the caller's: `require_not_dev_bypass_in_
 * production` (`backend/apps/common/dev_bypass.py`) answers **404** for every bypass
 * vector under production settings, so this call cannot succeed there however it is
 * reached. Exposed here only so the wizard step does not need the raw client for it.
 */
export async function devBypassPayment(applicationId: string): Promise<unknown> {
  return apiClient.request('/payments/dev-bypass/', {
    method: 'POST',
    body: JSON.stringify({ application_id: applicationId }),
  })
}

/**
 * The server-authored receipt for one payment.
 *
 * Every field is the server's. The dev preview renderers under `src/pages/dev/` read
 * this and lay it out; they compute no money and invent no reference number. Production
 * receipts are backend-rendered official documents (`services/officialDocuments.ts`) —
 * this is the preview contract, and it is read-only by construction.
 */
export interface PaymentReceipt {
  payment_id: string
  amount: string
  currency: string
  status: string
  created_at: string | null
  application_number: string | null
  program: string | null
  applicant_name: string | null
}

/**
 * Read one payment's receipt. Moved here by task 13.6 remediation L12 from the two dev
 * preview hooks that each had their own copy of the same `apiClient.request` call.
 */
export async function readPaymentReceipt(paymentId: string): Promise<PaymentReceipt> {
  return apiClient.request(
    `/payments/${encodeURIComponent(paymentId)}/receipt/`,
  ) as Promise<PaymentReceipt>
}
