import { useCallback, useEffect, useState } from 'react'
import { CreditCard, Clock, Zap } from 'lucide-react'
import type { UseFormReturn } from 'react-hook-form'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert'
import { SectionCard } from '@/components/ui/SectionCard'
import { Skeleton } from '@/components/ui'
import { animateClasses } from '@/lib/animations'
import { deferPayment, devBypassPayment } from '@/services/payments'
import { useFeeQuote } from '@/hooks/useFeeQuote'
import { PaymentForm } from '@/components/student/PaymentForm'
import { FeeQuoteRefusal } from '@/components/student/FeeQuoteRefusal'
import { isPaymentResolvedForProgress, type PaymentPhase } from '@/lib/paymentStatus'
import { PAYMENT_ERROR_COPY } from '@/lib/paymentErrorCodes'
import { PAYMENT_NEXT_ACTION_COPY } from '@/lib/paymentNextActions'
import { formatExpiryTime, formatServerAmount, isNonZeroServerAmount } from '@/lib/serverAmount'
import { usePaymentRecoveryStore } from '@/stores/paymentRecoveryStore'
import type { WizardFormData } from '../types'
interface PaymentStepProps {
  title: string
  form: UseFormReturn<WizardFormData>
  applicationId: string | null
  applicationNumber: string | null
  polledStatus?: 'pending' | 'successful' | 'failed' | 'deferred'| null
 /** Server-derived phase of the pending payment (task 8.2, STU-09). */
 paymentPhase?: PaymentPhase | null
  onPaymentStatusChange?: (status: 'pending' | 'successful' | 'failed' | 'deferred' | null) => void
  onPaymentStatusRefresh?: () => Promise<void>
}

const PaymentStep = ({
  title,
  form,
  applicationId,
  polledStatus = null,
 paymentPhase = null,
 onPaymentStatusChange,
  onPaymentStatusRefresh,
}: PaymentStepProps) => {
  const { watch } = form

 // Task 8.1 (R12.1/R12.6): the amounts, provider fee, currency, bearer,
 // residency, and expiry all come from the server-authored quote. This step
 // computes no percentage, no total, and has no fallback fee — a missing fee
 // configuration shows the server's reason instead of an invented number.

  const {
 quote,
 isLoading: quoteLoading,
 error: quoteError,
 isExpired: quoteExpired,
 refresh: refreshQuote,
 } = useFeeQuote(applicationId)
 const quoteUsable = quote !== null && !quoteExpired
 const expiryLabel = formatExpiryTime(quote?.expires_at)

  const [deferring, setDeferring] = useState(false)
  const [deferred, setDeferred] = useState(false)
  const [deferError, setDeferError] = useState<string | null>(null)
  const [deferConfirm, setDeferConfirm] = useState(false)
  const [devBypassing, setDevBypassing] = useState(false)
  const [devBypassError, setDevBypassError] = useState<string | null>(null)

  // Recovery store integration. Unconditional since admissions-v2 task 8.2:
 // a student who refreshes mid-payment always gets their pending payment back,
 // because "did the build set VITE_PAYMENT_HARDENING_UI?" is not an acceptable
 // answer to "where did my payment go?".
 const recoveryStore = usePaymentRecoveryStore()
  const recoveredEntry = applicationId
      ? recoveryStore.get(applicationId)
      : null

  // When a pending payment is recorded in the recovery store, disable
  // new initiation attempts and surface the existing payment_id.
  const pendingPaymentIdFromRecovery = recoveredEntry?.payment_id ?? null

  const isPaymentSettledForWizard = isPaymentResolvedForProgress(polledStatus)

  // Sync local deferred state from polled status (e.g. when navigating back)
  useEffect(() => {
    if (polledStatus === 'deferred') setDeferred(true)
  }, [polledStatus])

  const handleDefer = useCallback(async () => {
    if (!applicationId) return
    if (!deferConfirm) {
      setDeferConfirm(true)
      return
    }
    setDeferring(true)
    setDeferError(null)
    try {
      await deferPayment(applicationId)
      setDeferred(true)
      onPaymentStatusChange?.('deferred')
    } catch (err) {
      setDeferError(err instanceof Error ? err.message : 'Failed to defer payment')
    } finally {
      setDeferring(false)
    }
  }, [applicationId, onPaymentStatusChange, deferConfirm])

  const handleDevBypass = useCallback(async () => {
    if (!applicationId) return
    setDevBypassing(true)
    setDevBypassError(null)
    try {
      await devBypassPayment(applicationId)
      onPaymentStatusChange?.('successful')
    } catch (err) {
      setDevBypassError(err instanceof Error ? err.message : 'Dev bypass failed')
    } finally {
      setDevBypassing(false)
    }
  }, [applicationId, onPaymentStatusChange])

  useEffect(() => {
    if (polledStatus === 'successful' && !deferred) setDeferred(false)
  }, [polledStatus, deferred])

  const showDevBypass = import.meta.env.DEV && import.meta.env.VITE_PAYMENT_DEV_BYPASS === 'true' && !isPaymentSettledForWizard

  return (
    <SectionCard
      title={title}
      description="Pay the application fee to continue."
      icon={<CreditCard className="h-5 w-5" />}
      className={animateClasses.fadeIn}
      contentClassName="space-y-6"
      data-testid="payment-step"
    >
      <fieldset className="border-none p-0 m-0 space-y-6">
        <legend className="sr-only">Payment</legend>

        {/* Fee display — every value below is rendered exactly as the server sent it */}
        <div className="rounded-lg border border-border bg-card p-5" data-testid="fee-quote-panel">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Application fee</p>
              {quoteLoading ? (
                <div className="mt-2 space-y-2" role="status" aria-label="Preparing fee">
                  <Skeleton className="h-7 w-32" />
                  <Skeleton className="h-4 w-40" />
                </div>
              ) : quoteError ? (
 <FeeQuoteRefusal error={quoteError} onRefresh={refreshQuote} className="mt-1"/>
              ) : quote ? (
                <>
                  <p className="mt-1 text-2xl font-bold text-foreground" data-testid="fee-quote-total">
 {formatServerAmount(quote.total_amount, quote.currency)}
 </p>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
 <div className="flex justify-between gap-6">
 <span>Application fee</span>
 <span>{formatServerAmount(quote.base_amount, quote.currency)}</span>
 </div>
 {isNonZeroServerAmount(quote.provider_fee) && (
 <div className="flex justify-between gap-6">
 <span>Transaction fee</span>
 <span>{formatServerAmount(quote.provider_fee, quote.currency)}</span>
 </div>
 )}
 <div className="flex justify-between gap-6 border-t border-border pt-1 font-semibold text-foreground">
 <span>Total charged</span>
 <span>{formatServerAmount(quote.total_amount, quote.currency)}</span>
                  </div>
 {quote.waiver_applied && (
 <p className="pt-1">A fee waiver has been applied to your application.</p>
 )}
 </div>
 {quoteExpired ? (
 <div className="mt-3 space-y-1" role="status">
 <p className="text-sm text-foreground" data-testid="fee-quote-expired">
 {PAYMENT_ERROR_COPY.QUOTE_EXPIRED.body}
 </p>
 <button
 type="button" className="min-h-touch text-sm font-medium text-primary underline" onClick={refreshQuote}
 data-testid="fee-quote-refresh">
 {PAYMENT_NEXT_ACTION_COPY.refresh_quote.label}
 </button>
 </div>
 ) : expiryLabel ? (
 <p className="mt-3 text-xs text-muted-foreground" data-testid="fee-quote-expiry">
 This price is held until {expiryLabel}.
 </p>
 ) : null}
 </>
              ) : (
 /* No quote yet, and therefore no price. The step says so rather
 than showing a placeholder amount (finding STU-08). */
 <p className="mt-1 text-sm text-muted-foreground" data-testid="fee-quote-unavailable">
 Save your a pplication to see the fee for your programme.
 </p>
              )}
            </div>
            {quote?.residency_category && (
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium capitalize text-muted-foreground">
                {quote.residency_category}
              </span>
            )}
          </div>
        </div>

        {/* Deferred state */}
        {deferred && (
          <Alert variant="info" className={animateClasses.scaleIn}>
            <AlertTitle className="flex items-center gap-2 text-foreground">
              <Clock className="h-4 w-4" />Payment deferred
            </AlertTitle>
            <AlertDescription className="text-muted-foreground">
              You can pay anytime from the payment page. Proceed to submit your application.
            </AlertDescription>
          </Alert>
        )}

        {/* Payment form — only reachable with a live, unexpired server quote */}
        {!deferred && quoteUsable && quote && applicationId && (
          <PaymentForm
            applicationId={applicationId}
 baseAmount={quote.base_amount}
 providerFee={quote.provider_fee}
 totalAmount={quote.total_amount}
 currency={quote.currency}
            phone={watch('phone') || ''}
            fullName={watch('full_name') || ''}
            email={watch('email') || ''}
            polledStatus={polledStatus === 'deferred' ? null : polledStatus}
            onPaymentStatusChange={onPaymentStatusChange}
            onPaymentStatusRefresh={onPaymentStatusRefresh}
            pendingPaymentId={pendingPaymentIdFromRecovery}
 paymentPhase={paymentPhase}
 />
        )}

        {/* Pay Later — visible card option */}
        {!isPaymentSettledForWizard && !deferred && quote && applicationId && (
          <div className="space-y-2">
            {deferError && <p className="text-sm text-destructive text-center">{deferError}</p>}

            {!deferConfirm ? (
              <button
                type="button"
                className="w-full rounded-lg border-2 border-dashed border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                onClick={handleDefer}
                data-testid="pay-later-button"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Pay Later</p>
                    <p className="text-xs text-muted-foreground">Can't pay right now? Submit your application and pay anytime from the payment page.</p>
                  </div>
                </div>
              </button>
            ) : (
              <div className={`rounded-lg border-2 border-primary/30 bg-primary/5 p-4 ${animateClasses.scaleIn}`}>
                <p className="text-sm text-foreground">You can submit now and pay anytime from the payment page.</p>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    className="min-h-touch rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                    onClick={() => setDeferConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="min-h-touch rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    disabled={deferring}
                    onClick={handleDefer}
                  >
                    {deferring ? 'Deferring…' : 'Yes, pay later'}
                  </button>
 </div>
 </div>
 )}
 </div>
            )}
 {/* Dev payment bypass — only in development with VITE_PAYMENT_DEV_BYPASS=true */}
        {showDevBypass && applicationId && (
          <div className="space-y-2">
            {devBypassError && <p className="text-sm text-destructive text-center">{devBypassError}</p>}
            <button
              type="button"
              className="w-full rounded-lg border-2 border-dashed border-orange-400 bg-orange-50 p-4 text-left transition-colors hover:border-orange-500 hover:bg-orange-100 disabled:opacity-50"
              onClick={handleDevBypass}
              disabled={devBypassing}
              data-testid="dev-bypass-button"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100">
                  <Zap className="h-5 w-5 text-orange-700" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-orange-700">
                    {devBypassing ? 'Simulating…' : 'Simulate Payment (Dev)'}
                  </p>
                  <p className="text-xs text-orange-600/70">Bypass Lenco gateway — dev only, tree-shaken from production builds.</p>
 </div>
 </div>
 </button>
          </div>
        )}
      </fieldset>
    </SectionCard>
  )
}

export default PaymentStep
