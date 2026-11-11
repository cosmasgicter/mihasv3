/**
 * How a refused fee quote is shown to a student — one place, both surfaces.
 *
 * Admissions-v2 task 8.1 (requirement **R12.6**: the UI shows the server amount,
 * the quote expiry, the provider state, and a **recovery action**). The wizard
 * payment step and the student payment page both have to answer the same five
 * quote refusals, so they share this block rather than each inventing wording:
 *
 * | stable code                   | recovery       | affordance          |
 * |-------------------------------|----------------|---------------------|
 * | `QUOTE_EXPIRED`               | refresh_quote  | Refresh fee button  |
 * | `QUOTE_INVALID`               | refresh_quote  | Refresh fee button  |
 * | `QUOTE_NOT_FOUND`             | refresh_quote  | Refresh fee button  |
 * | `QUOTE_CONFIGURATION_CHANGED` | refresh_quote  | Refresh fee button  |
 * | `QUOTE_ALREADY_REDEEMED`      | check_status   | guidance only       |
 *
 * `FEE_NOT_CONFIGURED` / `FEE_AMBIGUOUS` map to `contact_support`: a school's fee
 * setup is not something the student can retry their way out of, so no button is
 * offered — only the honest reason. An unnamed failure (no stable code, e.g. the
 * network dropped) gets a plain "Try again".
 *
 * There is deliberately **no amount** in this component. A refused quote means the
 * UI has no server-authored price, and the answer to that is a stated reason — not
 * a placeholder fee (finding STU-08).
 */

import { PAYMENT_NEXT_ACTION_COPY } from '@/lib/paymentNextActions'
import type { FeeQuoteError } from '@/hooks/useFeeQuote'

interface FeeQuoteRefusalProps {
  error: FeeQuoteError
  /** Re-request the quote. Only wired to actions where re-pricing is the fix. */
  onRefresh: () => void
  className?: string
}

/** Recovery actions the student can act on from the payment surface itself. */
const RETRYABLE_HERE = new Set(['refresh_quote', 'unavailable'])

export function FeeQuoteRefusal({ error, onRefresh, className }: FeeQuoteRefusalProps) {
  const recovery = error.recovery
  // An unnamed failure is retryable (it may just have been the network); a named
  // one is retryable only when re-pricing or waiting is genuinely the fix.
  const canRetryHere = recovery === null ? error.code === null : RETRYABLE_HERE.has(recovery)
  const guidance = recovery ? PAYMENT_NEXT_ACTION_COPY[recovery].guidance : null

  return (
    <div className={`space-y-2 ${className ?? ''}`.trim()} role="alert" data-testid="fee-quote-refusal">
      <p className="text-base sm:text-sm text-destructive" data-testid="fee-quote-error">
        {error.message}
      </p>
      {canRetryHere ? (
        <button
          type="button"
          className="min-h-touch text-base sm:text-sm font-medium text-primary underline"
          onClick={onRefresh}
          data-testid="fee-quote-retry"
        >
          {error.recoveryLabel ?? 'Try again'}
        </button>
      ) : (
        guidance && (
          <p className="text-base sm:text-sm text-muted-foreground" data-testid="fee-quote-guidance">
            {guidance}
          </p>
        )
      )}
    </div>
  )
}
