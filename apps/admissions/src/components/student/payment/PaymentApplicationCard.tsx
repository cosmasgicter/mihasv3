/**
 * One submitted application's payment state, and the one thing to do about it.
 *
 * Admissions-v2 task 8.3 (**R12.3**, R12.4, R12.6), findings STU-08 / STU-09 /
 * STU-24.
 *
 * This is the post-submission half of the payment ownership split. The wizard owns
 * pre-submission pay-or-defer; this card owns everything after submission —
 * deferred, failed, expired, pending recovery, paid — plus that application's
 * payment history. It renders the **server's** vocabulary: the amount comes from
 * the canonical payment row or the held fee quote, and the wait state comes from
 * the server-derived `phase` (task 8.2), never from a client guess.
 *
 * Two behaviours worth naming, because their absence was the finding:
 *
 * - **A pending payment is not a disabled button.** Before this task, arriving here
 *   with a payment already open rendered no recovery affordance at all — the
 *   application read "Awaiting Review" and offered nothing. Now the same situation
 *   names who is being waited on and offers a status re-check.
 * - **`provider_processing` never offers a retry.** A second collection request
 *   against a provider that is still working is how a student gets charged twice.
 *   Re-sending is offered only for a spent `action_required` budget, where the
 *   student was never prompted and the service mints a fresh provider reference on
 *   the same row.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, CreditCard, Mail, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DownloadReceiptButton } from '@/components/student/DownloadReceiptButton'
import { FeeQuoteRefusal } from '@/components/student/FeeQuoteRefusal'
import { PaymentForm } from '@/components/student/PaymentForm'
import { useFeeQuote } from '@/hooks/useFeeQuote'
import { usePaymentStatus } from '@/hooks/usePaymentStatus'
import { PAYMENT_ERROR_COPY } from '@/lib/paymentErrorCodes'
import { PAYMENT_NEXT_ACTION_COPY } from '@/lib/paymentNextActions'
import { resolvePaymentRecovery } from '@/lib/paymentRecovery'
import type { CanonicalPaymentServiceStatus } from '@/lib/paymentStatus'
import { formatServerAmount } from '@/lib/serverAmount'
import type { TenantSupportContact } from '@/lib/tenantSupport'
import type { PaymentRow } from '@/services/payments'

// ---------------------------------------------------------------------------
// Server shapes this card reads
// ---------------------------------------------------------------------------

/** A canonical payment row as served by `GET /api/v1/payments/`. */
export type PaymentRecord = PaymentRow

export interface PaymentApplicationSummary {
  id: string
  status: string
  payment_status: string | null
  program: string | null
  application_number?: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  created_at: string
  last_payment_audit_notes?: string | null
}

const CANONICAL_ROW_STATUSES: readonly CanonicalPaymentServiceStatus[] = [
  'pending',
  'deferred',
  'successful',
  'failed',
  'expired',
  'force_approved',
]

/** Narrow a server status string to the canonical payment-row vocabulary. */
function asCanonicalRowStatus(value: string | null | undefined): CanonicalPaymentServiceStatus | null {
  const candidate = (value ?? '').trim().toLowerCase()
  return (CANONICAL_ROW_STATUSES as readonly string[]).includes(candidate)
    ? (candidate as CanonicalPaymentServiceStatus)
    : null
}

/** Most recent payment row first. The server sorts too; this is order-independent. */
export function newestFirst(records: PaymentRecord[]): PaymentRecord[] {
  return [...records].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  )
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

/**
 * Render a ledger amount exactly as the server recorded it (task 8.1, R12.1) —
 * no re-quantising, no assumed currency, no invented zero.
 */
function formatLedgerAmount(
  amount: number | string | null | undefined,
  currency: string | null,
): string {
  const raw = typeof amount === 'number' ? String(amount) : amount
  return formatServerAmount(raw, currency)
}

function formatApplicationStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Status tone for a history row. Colour is always paired with the label. */
function historyRowTone(status: string): 'success' | 'destructive' | 'warning' | 'neutral' {
  switch (asCanonicalRowStatus(status)) {
    case 'successful':
    case 'force_approved':
      return 'success'
    case 'failed':
      return 'destructive'
    case 'expired':
      return 'warning'
    case 'deferred':
      return 'neutral'
    default:
      return 'warning'
  }
}

function historyRowLabel(status: string): string {
  switch (asCanonicalRowStatus(status)) {
    case 'successful':
      return 'Paid'
    case 'force_approved':
      return 'Recorded by admissions'
    case 'failed':
      return 'Failed'
    case 'expired':
      return 'Expired'
    case 'deferred':
      return 'Deferred'
    case 'pending':
      return 'In progress'
    default:
      return 'Unknown'
  }
}

/**
 * The support affordance, resolved from tenant context.
 *
 * `href` is either the tenant's own admissions inbox or the in-app contact route
 * — never a hardcoded address (STU-24). `Button asChild` keeps it a real anchor.
 */
function SupportLink({ support }: { support: TenantSupportContact }) {
  return (
    <Button asChild variant="outline" size="sm" className="min-h-touch">
      <a href={support.href} data-testid="payment-support-action" data-support-kind={support.kind}>
        <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
        {support.label}
      </a>
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export interface PaymentApplicationCardProps {
  app: PaymentApplicationSummary
  records: PaymentRecord[]
  /** True when the student arrived here for this application specifically. */
  isSelected: boolean
  /** Where a student is sent when they need a person — resolved from tenant context. */
  support: TenantSupportContact
  /** Re-read applications + payment rows after anything moves. */
  onPaymentRefresh: () => Promise<void>
}

export function PaymentApplicationCard({
  app,
  records,
  isSelected,
  support,
  onPaymentRefresh,
}: PaymentApplicationCardProps) {
  const ordered = newestFirst(records)
  const latestRecord = ordered[0]
  const recordStatus = asCanonicalRowStatus(latestRecord?.status)

  // Poll only while a row is genuinely open. `usePaymentStatus('')` is inert, so
  // a settled application costs no requests.
  const shouldPoll = recordStatus === 'pending'
  const {
    status: polledStatus,
    phase: polledPhase,
    pollingExceededTimeout,
    refetch,
  } = usePaymentStatus(shouldPoll ? app.id : '', app.payment_status)

  // What the student did in this session, reported by PaymentForm.
  // 'deferred' is a server-confirmed result PaymentForm now reports (SJR task 3.24).
  const [sessionStatus, setSessionStatus] = useState<'pending' | 'successful' | 'failed' | 'deferred' | null>(null)
  const [payFormOpen, setPayFormOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(isSelected)
  const stateBlockRef = useRef<HTMLDivElement>(null)

  // Precedence: this session's outcome, then the poller, then the stored row.
  // Every one of the three is a server answer; none is computed here.
  const latestPaymentStatus: CanonicalPaymentServiceStatus | null =
    asCanonicalRowStatus(sessionStatus) ?? asCanonicalRowStatus(polledStatus) ?? recordStatus

  const recovery = resolvePaymentRecovery({
    latestPaymentStatus,
    phase: polledPhase ?? latestRecord?.phase ?? null,
    applicationPaymentStatus: app.payment_status,
    pollingExceededTimeout,
  })
  const { presentation } = recovery

  // The fee quote is only requested when the student is actually about to pay.
  // `preferExisting` reads the held price back first, so a refresh mid-recovery
  // shows the same amount instead of silently re-pricing (task 8.3).
  const {
    quote,
    isLoading: quoteLoading,
    error: quoteError,
    isExpired: quoteExpired,
    refresh: refreshQuote,
  } = useFeeQuote(payFormOpen ? app.id : null, { preferExisting: true })
  const quoteUsable = quote !== null && !quoteExpired

  // Focus the state block when the situation changes under the student's feet, so
  // a screen-reader user is not left reading a state that no longer exists.
  const previousState = useRef(recovery.uiState)
  useEffect(() => {
    if (previousState.current !== recovery.uiState) {
      previousState.current = recovery.uiState
      stateBlockRef.current?.focus()
    }
  }, [recovery.uiState])

  const handleCheckStatus = useCallback(async () => {
    await refetch()
    await onPaymentRefresh()
  }, [refetch, onPaymentRefresh])

  const handlePaid = useCallback(async () => {
    setPayFormOpen(false)
    await onPaymentRefresh()
  }, [onPaymentRefresh])

  // The amount shown: the ledger row when money has moved or is moving, else the
  // held quote once the student opens the form. Never a third source (R12.1).
  const ledgerAmount = latestRecord ? formatLedgerAmount(latestRecord.amount, latestRecord.currency) : ''
  const displayedAmount = ledgerAmount || (quote ? formatServerAmount(quote.total_amount, quote.currency) : '')

  const isFailureState =
    recovery.uiState === 'retry_with_different_number' ||
    recovery.uiState === 'max_attempts_reached' ||
    recovery.uiState === 'needs_admin_followup'

  return (
    <article
      className="min-w-0 space-y-4 border-b border-border/45 pb-6 last:border-b-0 last:pb-0"
      data-testid="payment-application"
      data-application-id={app.id}
      data-payment-ui-state={recovery.uiState}
      data-payment-phase={recovery.phase ?? 'none'}
    >
      {/* Identity + status */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-base font-semibold text-foreground">
            {app.program || 'Application'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {app.application_number ? `${app.application_number} · ` : ''}
            {formatApplicationStatus(app.status)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span data-testid="payment-state-badge">
            <StatusBadge label={presentation.label} tone={presentation.tone} size="md" />
          </span>
          {displayedAmount && (
            <span className="font-mono text-sm font-semibold text-foreground" data-testid="payment-amount">
              {/* The ledger records the application fee the school is owed. The
                  provider adds its own customer-borne fee at collection time, so
                  this is not necessarily the figure the handset showed — naming
                  the number keeps it from reading as an unexplained discrepancy,
                  and costs no arithmetic. */}
              <span className="sr-only">Application fee </span>
              {displayedAmount}
            </span>
          )}
        </div>
      </div>

      {/* What is true right now, and the one thing to do about it */}
      <div
        ref={stateBlockRef}
        tabIndex={-1}
        role={isFailureState ? 'alert' : 'status'}
        aria-live={isFailureState ? 'assertive' : 'polite'}
        className="space-y-3 rounded-lg bg-muted px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="payment-state-detail"
      >
        <p className="text-sm text-foreground">{presentation.detail}</p>

        {/* The spent wait budget, described for the phase it was spent in. */}
        {recovery.timeoutNotice && (
          <p className="text-sm text-muted-foreground" data-testid="payment-wait-timeout">
            {recovery.timeoutNotice}
          </p>
        )}

        {/* An admissions note on a rejected payment is the reason, so it is shown. */}
        {app.last_payment_audit_notes && isFailureState && (
          <p className="text-sm text-foreground">
            <span className="font-semibold">Admissions note:</span> {app.last_payment_audit_notes}
          </p>
        )}

        {!payFormOpen && (
          <div className="flex flex-wrap items-center gap-2">
            {presentation.action === 'pay' && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="min-h-touch"
                onClick={() => setPayFormOpen(true)}
                data-testid="payment-pay-action"
              >
                <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
                {presentation.actionLabel}
              </Button>
            )}

            {presentation.action === 'check_status' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-touch"
                onClick={() => void handleCheckStatus()}
                data-testid="payment-check-status"
              >
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                {presentation.actionLabel}
              </Button>
            )}

            {/* Only ever offered for a spent action_required budget. */}
            {recovery.resendAvailable && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-touch"
                onClick={() => setPayFormOpen(true)}
                data-testid="payment-resend-prompt"
              >
                Send the prompt again
              </Button>
            )}

            {presentation.action === 'receipt' && (
              <DownloadReceiptButton
                applicationId={app.id}
                paymentStatus={app.payment_status ?? 'successful'}
                unavailableFallback={<SupportLink support={support} />}
              />
            )}

            {presentation.action === 'support' && <SupportLink support={support} />}
          </div>
        )}
      </div>

      {/* Inline payment — reachable only with a live, unexpired server quote */}
      {payFormOpen && (
        <div className="space-y-3" data-testid="payment-inline-form">
          {quoteLoading && (
            <p className="text-sm text-muted-foreground" role="status">
              Preparing your fee…
            </p>
          )}
          {quoteError && <FeeQuoteRefusal error={quoteError} onRefresh={refreshQuote} />}
          {quote && quoteExpired && (
            <div className="space-y-1" role="status">
              <p className="text-sm text-foreground" data-testid="payment-quote-expired">
                {PAYMENT_ERROR_COPY.QUOTE_EXPIRED.body}
              </p>
              <button
                type="button"
                className="min-h-touch text-sm font-medium text-primary underline"
                onClick={refreshQuote}
                data-testid="payment-quote-refresh"
              >
                {PAYMENT_NEXT_ACTION_COPY.refresh_quote.label}
              </button>
            </div>
          )}
          {quoteUsable && quote && (
            <PaymentForm
              applicationId={app.id}
              baseAmount={quote.base_amount}
              providerFee={quote.provider_fee}
              totalAmount={quote.total_amount}
              currency={quote.currency}
              phone={app.phone ?? ''}
              fullName={app.full_name ?? ''}
              email={app.email ?? ''}
              polledStatus={sessionStatus === 'deferred' ? null : sessionStatus}
              paymentPhase={recovery.phase}
              onPaymentStatusChange={setSessionStatus}
              onPaymentStatusRefresh={onPaymentRefresh}
              onSuccess={handlePaid}
            />
          )}
          <button
            type="button"
            className="min-h-touch text-sm font-medium text-muted-foreground underline"
            onClick={() => setPayFormOpen(false)}
            data-testid="payment-close-form"
          >
            Not now
          </button>
        </div>
      )}

      {/* History — every attempt the server recorded for this application */}
      {ordered.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            className="inline-flex min-h-touch items-center gap-1 text-sm font-medium text-foreground"
            onClick={() => setHistoryOpen((open) => !open)}
            aria-expanded={historyOpen}
            data-testid="payment-history-toggle"
          >
            {historyOpen ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
            Payment history ({ordered.length})
          </button>
          {historyOpen && (
            <ul className="divide-y divide-border/45" data-testid="payment-history">
              {ordered.map((record) => (
                <li
                  key={record.id}
                  className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                  data-payment-row-status={record.status}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge label={historyRowLabel(record.status)} tone={historyRowTone(record.status)} />
                    <span className="font-mono font-medium text-foreground">
                      {formatLedgerAmount(record.amount, record.currency) || '—'}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">{formatTimestamp(record.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {ordered.length === 0 && (
        <p className="text-sm text-muted-foreground">No payment attempts recorded for this application yet.</p>
      )}
    </article>
  )
}
