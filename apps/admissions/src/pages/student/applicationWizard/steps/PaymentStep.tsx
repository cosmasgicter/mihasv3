import { useCallback, useEffect, useState } from 'react'
import { CreditCard, Clock } from 'lucide-react'
import type { UseFormReturn } from 'react-hook-form'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert'
import { SectionCard } from '@/components/ui/SectionCard'
import { Skeleton } from '@/components/ui'
import { animateClasses } from '@/lib/animations'
import { apiClient } from '@/services/client'
import { useFeeResolver } from '@/hooks/useFeeResolver'
import { PaymentForm } from '@/components/student/PaymentForm'
import type { WizardFormData } from '../types'

interface PaymentStepProps {
  title: string
  form: UseFormReturn<WizardFormData>
  applicationId: string | null
  applicationNumber: string | null
  polledStatus?: 'pending' | 'successful' | 'failed' | 'deferred' | null
  onPaymentStatusChange?: (status: 'pending' | 'successful' | 'failed' | 'deferred' | null) => void
  onPaymentStatusRefresh?: () => Promise<void>
}

function formatCurrency(amount: number, currency: string): string {
  if (currency === 'ZMW') return `K${amount.toFixed(2)}`
  if (currency === 'USD') return `$${amount.toFixed(2)}`
  return `${currency} ${amount.toFixed(2)}`
}

const PaymentStep = ({
  title,
  form,
  applicationId,
  polledStatus = null,
  onPaymentStatusChange,
  onPaymentStatusRefresh,
}: PaymentStepProps) => {
  const { watch } = form
  const programCode = watch('program') || ''
  const nationality = watch('nationality') || ''
  const country = watch('country') || ''

  const { fee, isLoading: feeLoading, error: feeError } = useFeeResolver(programCode, nationality, country)

  const [deferring, setDeferring] = useState(false)
  const [deferred, setDeferred] = useState(false)
  const [deferError, setDeferError] = useState<string | null>(null)
  const [deferConfirm, setDeferConfirm] = useState(false)

  const isPaymentSettledForWizard = polledStatus === 'successful' || polledStatus === 'deferred'

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
      await apiClient.request('/payments/defer/', {
        method: 'POST',
        body: JSON.stringify({ application_id: applicationId }),
      })
      setDeferred(true)
      onPaymentStatusChange?.('deferred')
    } catch (err) {
      setDeferError(err instanceof Error ? err.message : 'Failed to defer payment')
    } finally {
      setDeferring(false)
    }
  }, [applicationId, onPaymentStatusChange, deferConfirm])

  useEffect(() => {
    if (polledStatus === 'successful' && !deferred) setDeferred(false)
  }, [polledStatus, deferred])

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

        {/* Fee display */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Application fee</p>
              {feeLoading ? (
                <div className="mt-2 space-y-2" role="status" aria-label="Resolving fee">
                  <Skeleton className="h-7 w-32" />
                  <Skeleton className="h-4 w-40" />
                </div>
              ) : feeError ? (
                <p className="mt-1 text-sm text-destructive">{feeError}</p>
              ) : fee ? (
                <>
                  <p className="mt-1 text-2xl font-bold text-foreground">{formatCurrency(fee.amount, fee.currency)}</p>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between"><span>Application fee</span><span>{formatCurrency(fee.amount, fee.currency)}</span></div>
                    <div className="flex justify-between"><span>Transaction fee (1%)</span><span>{formatCurrency(fee.amount * 0.01, fee.currency)}</span></div>
                    <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground"><span>Total charged</span><span>{formatCurrency(fee.amount * 1.01, fee.currency)}</span></div>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Select a program to see the fee</p>
              )}
            </div>
            {fee?.residency_category && (
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium capitalize text-muted-foreground">
                {fee.residency_category}
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
              You can pay anytime from your dashboard. Proceed to submit your application.
            </AlertDescription>
          </Alert>
        )}

        {/* Payment form */}
        {!deferred && fee && applicationId && (
          <PaymentForm
            applicationId={applicationId}
            amount={fee.amount}
            currency={fee.currency}
            phone={watch('phone') || ''}
            fullName={watch('full_name') || ''}
            email={watch('email') || ''}
            polledStatus={polledStatus === 'deferred' ? null : polledStatus}
            onPaymentStatusChange={onPaymentStatusChange}
            onPaymentStatusRefresh={onPaymentStatusRefresh}
          />
        )}

        {/* Pay Later — text link, not a big button */}
        {!isPaymentSettledForWizard && !deferred && fee && applicationId && (
          <div className="pt-2 text-center space-y-2">
            {deferError && <p className="text-sm text-destructive">{deferError}</p>}

            {!deferConfirm ? (
              <button
                type="button"
                className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors disabled:opacity-50"
                disabled={deferring}
                onClick={handleDefer}
                data-testid="pay-later-button"
              >
                <span className="font-medium text-foreground">Pay Later</span>: Can't pay right now? You can pay later from your dashboard
              </button>
            ) : (
              <div className={`rounded-xl border border-border bg-card/50 p-4 ${animateClasses.scaleIn}`}>
                <p className="text-sm text-foreground">You can submit now and pay anytime from your dashboard.</p>
                <div className="mt-3 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={() => setDeferConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
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
      </fieldset>
    </SectionCard>
  )
}

export default PaymentStep
