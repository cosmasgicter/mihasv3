import { useCallback, useEffect, useRef } from 'react'
import { CheckCircle, CreditCard, RefreshCw, XCircle, Clock, ExternalLink } from 'lucide-react'
import type { UseFormReturn } from 'react-hook-form'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { SectionCard } from '@/components/ui/SectionCard'
import { Skeleton } from '@/components/ui'
import { animateClasses } from '@/lib/animations'
import { useFeeResolver } from '@/hooks/useFeeResolver'
import { useApplicationPaymentAction } from '@/hooks/useApplicationPaymentAction'
import type { WizardFormData } from '../types'

interface PaymentStepProps {
  title: string
  form: UseFormReturn<WizardFormData>
  applicationId: string | null
  applicationNumber: string | null
  polledStatus?: 'pending' | 'successful' | 'failed' | null
  onPaymentStatusChange?: (status: 'pending' | 'successful' | 'failed' | null) => void
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
  const retryRef = useRef<HTMLButtonElement>(null)

  const getCustomerDetails = useCallback(() => ({
    fullName: watch('full_name') || '',
    email: watch('email') || '',
    phone: watch('phone') || '',
  }), [watch])

  const {
    paymentStatus,
    statusMessage,
    initiateError,
    startPayment,
    updatePaymentStatus,
    setInitiateError,
  } = useApplicationPaymentAction({
    applicationId,
    getCustomerDetails,
    onPaymentStatusChange,
    onPaymentStatusRefresh,
  })

  useEffect(() => {
    if (paymentStatus === 'failed') retryRef.current?.focus()
  }, [paymentStatus])

  useEffect(() => {
    if (polledStatus === 'successful') {
      updatePaymentStatus('successful', 'Payment confirmed.')
    } else if (polledStatus === 'failed') {
      updatePaymentStatus('failed', 'Payment failed. You can retry.')
    } else if (polledStatus === 'pending' && paymentStatus === 'idle') {
      updatePaymentStatus('pending', 'Payment is being confirmed…')
    }
  }, [paymentStatus, polledStatus, updatePaymentStatus])

  const handlePayNow = useCallback(async () => {
    if (!applicationId) {
      setInitiateError('Please save your application before proceeding to payment. Go back to Step 1 and ensure your details are saved.')
      return
    }
    await startPayment()
  }, [applicationId, setInitiateError, startPayment])

  const canPay = fee != null && !feeLoading && (paymentStatus === 'idle' || paymentStatus === 'failed')

  // Check if statusMessage is a URL (popup-blocked fallback)
  const isPaymentUrl = statusMessage?.startsWith('https://')

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
        <div className="rounded-xl border border-border bg-card p-4">
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
                <p className="mt-1 text-2xl font-bold text-foreground">{formatCurrency(fee.amount, fee.currency)}</p>
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

        {/* Status alerts */}
        {paymentStatus === 'successful' && (
          <Alert variant="success" className={animateClasses.scaleIn}>
            <AlertTitle className="flex items-center gap-2 text-foreground">
              <CheckCircle className="h-4 w-4" />Payment successful
            </AlertTitle>
            <AlertDescription className="text-muted-foreground">
              {statusMessage || 'Your payment has been confirmed. You can proceed to the next step.'}
            </AlertDescription>
          </Alert>
        )}

        {paymentStatus === 'failed' && (
          <Alert variant="destructive" className={animateClasses.scaleIn}>
            <AlertTitle className="flex items-center gap-2 text-foreground">
              <XCircle className="h-4 w-4" />Payment failed
            </AlertTitle>
            <AlertDescription className="space-y-3 text-muted-foreground">
              <p className="font-semibold text-destructive">
                {statusMessage || 'Your payment could not be processed.'}
              </p>
              <p className="text-sm">
                You can retry the payment or contact support at ***REMOVED*** if the issue persists.
              </p>
              <Button ref={retryRef} type="button" variant="outline" size="sm" onClick={handlePayNow} data-testid="retry-payment-button">
                <RefreshCw className="mr-1 h-3 w-3" />Retry payment
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {initiateError && initiateError.includes('maximum number of payment attempts') && (
          <Alert variant="destructive" className={animateClasses.scaleIn}>
            <AlertTitle className="flex items-center gap-2 text-foreground">
              <XCircle className="h-4 w-4" />Payment attempts exhausted
            </AlertTitle>
            <AlertDescription className="text-muted-foreground">
              <p>You've reached the maximum number of payment attempts. Please contact support at ***REMOVED*** for assistance.</p>
            </AlertDescription>
          </Alert>
        )}

        {paymentStatus === 'pending' && (
          <Alert variant="info" className={animateClasses.scaleIn}>
            <AlertTitle className="flex items-center gap-2 text-foreground">
              <Clock className="h-4 w-4" />Payment in progress
            </AlertTitle>
            <AlertDescription className="space-y-3 text-muted-foreground">
              {isPaymentUrl ? (
                <>
                  <p>Your browser blocked the payment tab. Click below to open it manually:</p>
                  <a
                    href={statusMessage!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <ExternalLink className="h-4 w-4" />Open payment page
                  </a>
                </>
              ) : (
                <p>{statusMessage || 'Complete payment in the new tab, then return here. Your status will update automatically.'}</p>
              )}
              <Button type="button" variant="outline" size="sm" onClick={async () => { await onPaymentStatusRefresh?.() }}>
                <RefreshCw className="mr-1 h-3 w-3" />Check status
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {initiateError && !initiateError.includes('maximum number of payment attempts') && (
          <Alert variant="destructive">
            <AlertTitle className="text-foreground">Payment error</AlertTitle>
            <AlertDescription className="text-muted-foreground">{initiateError}</AlertDescription>
          </Alert>
        )}

        {/* Pay Now button */}
        {paymentStatus !== 'successful' && (
          <>
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={!canPay}
              loading={paymentStatus === 'initiating'}
              onClick={handlePayNow}
              data-testid="pay-now-button"
            >
              {paymentStatus === 'initiating'
                ? 'Preparing payment…'
                : paymentStatus === 'pending'
                  ? 'Waiting for confirmation…'
                  : paymentStatus === 'failed'
                    ? 'Retry payment'
                    : 'Pay now'}
            </Button>
            {!canPay && paymentStatus !== 'initiating' && (
              <p className="text-center text-sm text-muted-foreground" data-testid="pay-disabled-hint">
                {feeLoading
                  ? 'Please wait — your application fee is being calculated.'
                  : fee == null
                    ? 'Select a program to calculate your application fee before paying.'
                    : paymentStatus === 'pending'
                      ? 'Your payment is being confirmed. Please wait for the result.'
                      : 'Payment is not available right now. Please try again shortly.'}
              </p>
            )}
          </>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Payments are processed securely by Lenco. Your card details are never stored on our servers.
        </p>
      </fieldset>
    </SectionCard>
  )
}

export default PaymentStep
