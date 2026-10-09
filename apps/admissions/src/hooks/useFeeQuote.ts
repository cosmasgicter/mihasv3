/**
 * Server-authored fee quote — the only money the payment UI is allowed to show.
 *
 * Task 8.1 of `.kiro/specs/admissions-v2-canonical-rebuild/`. The backend mints an
 * expiring, signed quote from the canonical offering, residency, fee schedule, and
 * its own provider-fee policy; this hook fetches it through the payments domain
 * service and hands the numbers to the UI verbatim.
 *
 * What this hook deliberately does **not** do (finding STU-08, requirement R12.1):
 * - no percentage arithmetic (the 1% `TRANSACTION_FEE_RATE` is gone from the app),
 * - no total computation (`total_amount` is server-authored),
 * - no fallback/default amount (there is no K150/USD 20 here or anywhere),
 * - no rounding or currency maths (amounts stay strings until formatted).
 *
 * Requirements: R12.1 (server-authored expiring quote, no client arithmetic),
 * R12.2 (`FEE_NOT_CONFIGURED` fails closed — never a substituted amount),
 * R12.6 (the UI shows server amounts, quote expiry, and a recovery action).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

import { createFeeQuote, readFeeQuote, type FeeQuote } from '@/services/payments'
import { isPaymentStableCode, PAYMENT_ERROR_COPY, type PaymentStableCode } from '@/lib/paymentErrorCodes'
import {
  PAYMENT_NEXT_ACTION_COPY,
  recoveryActionForStableCode,
  type PaymentNextAction,
} from '@/lib/paymentNextActions'

export type { FeeQuote } from '@/services/payments'

export interface FeeQuoteError {
  /** Stable backend code when the failure was a named one. */
  code: PaymentStableCode | null
  message: string
  /**
   * Named recovery step for this refusal (R12.6). `refresh_quote` for the four
   * re-priceable quote codes, `check_status` for a spent quote,
   * `contact_support` when a school's fee configuration is the problem.
   */
  recovery: PaymentNextAction | null
  /** User-facing label for `recovery`, ready to put on the button. */
  recoveryLabel: string | null
}

interface FeeQuoteState {
  quote: FeeQuote | null
  isLoading: boolean
  error: FeeQuoteError | null
}

/** Parse a stable payment code out of an apiClient error, when present. */
function readStableCode(error: unknown): PaymentStableCode | null {
  const candidate = (error as { code?: unknown } | null)?.code
  return isPaymentStableCode(candidate) ? candidate : null
}

function toQuoteError(error: unknown): FeeQuoteError {
  const code = readStableCode(error)
  const recovery = recoveryActionForStableCode(code)
  const recoveryLabel = recovery ? PAYMENT_NEXT_ACTION_COPY[recovery].label : null
  if (code) {
    return { code, message: PAYMENT_ERROR_COPY[code].body, recovery, recoveryLabel }
  }
  const message =
    error instanceof Error && error.message
      ? error.message
      : 'We could not prepare the fee. Please try again.'
  return { code: null, message, recovery: null, recoveryLabel: null }
}

export interface UseFeeQuoteOptions {
  /**
   * Read the live quote (`GET`) before minting a new one (`POST`).
   *
   * Admissions-v2 task 8.3. The recovery surface — `/student/payment` — is
   * reached *after* a price was already held, often by a student who refreshed or
   * came back later, so it asks the server what the current quote is instead of
   * re-pricing on sight. `QUOTE_NOT_FOUND` (no live quote) is the one refusal that
   * falls through to minting; every other refusal is reported as-is, because a
   * quote the server calls invalid is not something to paper over with a second
   * request.
   *
   * The wizard leaves this off: it is the surface where the price is first minted.
   */
  preferExisting?: boolean
}

/**
 * Request (or re-request) the live fee quote for an application.
 *
 * `applicationId` may be null while the wizard has not created the draft yet; the
 * hook stays idle rather than inventing an amount.
 */
export function useFeeQuote(applicationId: string | null, options: UseFeeQuoteOptions = {}) {
  const { preferExisting = false } = options
  const [state, setState] = useState<FeeQuoteState>({
    quote: null,
    isLoading: false,
    error: null,
  })
  const [refreshCount, setRefreshCount] = useState(0)

  useEffect(() => {
    if (!applicationId) {
      setState({ quote: null, isLoading: false, error: null })
      return
    }

    let cancelled = false
    setState((prev) => ({ ...prev, isLoading: true, error: null }))

    // An explicit refresh always mints: the student asked for the current price.
    const request =
      preferExisting && refreshCount === 0
        ? readFeeQuote(applicationId).catch((error: unknown) => {
            if (readStableCode(error) === 'QUOTE_NOT_FOUND') {
              return createFeeQuote(applicationId)
            }
            throw error
          })
        : createFeeQuote(applicationId)

    request
      .then((data) => {
        if (cancelled) return
        setState({ quote: data ?? null, isLoading: false, error: null })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        // Fail closed: no quote means no amount is displayed and no payment can
        // be started. There is no default to fall back to (R12.2).
        setState({ quote: null, isLoading: false, error: toQuoteError(error) })
      })

    return () => {
      cancelled = true
    }
  }, [applicationId, preferExisting, refreshCount])

  const refresh = useCallback(() => setRefreshCount((c) => c + 1), [])

  /** True once the server-stated expiry has passed (R12.6 — show, don't guess). */
  const isExpired = useMemo(() => {
    const expiresAt = state.quote?.expires_at
    if (!expiresAt) return false
    const expiry = Date.parse(expiresAt)
    return Number.isFinite(expiry) ? expiry <= Date.now() : false
  }, [state.quote?.expires_at])

  return {
    quote: state.quote,
    isLoading: state.isLoading,
    error: state.error,
    isExpired,
    refresh,
  }
}
