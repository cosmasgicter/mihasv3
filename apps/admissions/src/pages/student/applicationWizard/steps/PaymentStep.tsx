import { useCallback, useEffect, useState } from 'react'
import { CheckCircle, CreditCard, RefreshCw, XCircle, Clock } from 'lucide-react'
import type { UseFormReturn } from 'react-hook-form'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { SectionCard } from '@/components/ui/SectionCard'
import { Skeleton } from '@/components/ui/skeleton'
import { animateClasses } from '@/lib/animations'
import { apiClient } from '@/services/client'
import { useFeeResolver } from '@/hooks/useFeeResolver'
import { useLencoWidget } from '@/hooks/useLencoWidget'
import { usePaymentStatus } from '@/hooks/usePaymentStatus'
import type { WizardFormData } from '../types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaymentStepProps {
  title: string
  form: UseFormReturn<WizardFormData>
  applicationId: string | null
  applicationNumber: string | null
}

interface InitiateResponse {
  payment_id: string
  reference: string
  amount: string
  currency: string
  lenco_public_key: string
}

interface VerifyResponse {
  status: string
}

type PaymentStatus = 'idle' | 'initiating' | 'pending' | 'successful' | 'failed'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number, currency: string): string {
  if (currency === 'ZMW') return `K${amount.toFixed(2)}`
  if (currency === 'USD') return `$${amount.toFixed(2)}`
  return `${currency} ${amount.toFixed(2)}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PaymentStep = ({ title, form, applicationId }: PaymentStepProps) => {
  const { watch } = form
  const programCode = watch('program') || ''
  const nationality = watch('nationality') || ''
  const country = watch('country') || ''

  const { fee, isLoading: feeLoading, error: feeError } = useFeeResolver(programCode, nationality, country)
  const { openWidget, isLoading: widgetLoading, isScriptLoaded } = useLencoWidget()
  const { status: polledStatus, refetch: refetchStatus } = usePaymentStatus(applicationId || '')

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [initiateError, setInitiateError] = useState<string | null>(null)

  // Sync polled status into local state
  useEffect(() => {
    if (polledStatus === 'successful') {
      setPaymentStatus('successful')
      setStatusMessage('Payment confirmed.')
    } else if (polledStatus === 'failed') {
      setPaymentStatus('failed')
      setStatusMessage('Payment failed. You can retry.')
    } else if (polledStatus === 'pending' && paymentStatus === 'idle') {
      setPaymentStatus('pending')
      setStatusMessage('Payment is being confirmed\u2026')
    }
  }, [polledStatus, paymentStatus])

  const handlePayNow = useCallback(async () => {
    if (!applicationId) {
      setInitiateError('Application not found. Please go back to step 1.')
      return
    }
    setInitiateError(null)
    setPaymentStatus('initiating')
    setStatusMessage(null)

    try {
      const data = await apiClient.request<InitiateResponse>(
        '/payments/initiate/',
        { method: 'POST', body: JSON.stringify({ application_id: applicationId }) },
      )
      if (!data) throw new Error('No response from payment service')

      const { payment_id, reference, amount, currency, lenco_public_key } = data
      const fullName = watch('full_name') || ''
      const nameParts = fullName.trim().split(/\s+/)
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || firstName
      const email = watch('email') || ''
      const phone = watch('phone') || ''

      openWidget({
        publicKey: lenco_public_key,
        reference,
        amount: parseFloat(amount),
        currency,
        customerEmail: email,
        customerFirstName: firstName,
        customerLastName: lastName,
        customerPhone: phone || undefined,
        onSuccess: async () => {
          setPaymentStatus('pending')
          setStatusMessage('Verifying payment\u2026')
          try {
            const verifyPath = `/payments/${encodeURIComponent(payment_id)}/verify/`
            const v = await apiClient.request<VerifyResponse>(verifyPath, { method: 'POST' })
            if (v?.status === 'successful') {
              setPaymentStatus('successful')
              setStatusMessage('Payment confirmed.')
            } else if (v?.status === 'failed') {
              setPaymentStatus('failed')
              setStatusMessage('Payment could not be verified. You can retry.')
            } else {
              setPaymentStatus('pending')
              setStatusMessage('Payment is being confirmed. You can proceed \u2014 we will update the status automatically.')
            }
          } catch {
            setPaymentStatus('pending')
            setStatusMessage('Payment is being confirmed. You can proceed \u2014 we will update the status automatically.')
          }
        },
        onConfirmationPending: () => {
          setPaymentStatus('pending')
          setStatusMessage('Payment is being confirmed. You can proceed \u2014 we will update the status automatically.')
        },
        onClose: () => {
          if (paymentStatus !== 'successful' && paymentStatus !== 'pending') {
            setPaymentStatus('idle')
            setStatusMessage('Payment not completed. You can retry when ready.')
          }
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initiate payment'
      setInitiateError(message)
      setPaymentStatus('idle')
    }
  }, [applicationId, openWidget, watch, paymentStatus])

  const canPay = isScriptLoaded && fee != null && !feeLoading && paymentStatus !== 'successful' && paymentStatus !== 'initiating'

  return (
    <SectionCard
      title={title}
      description="Complete your application fee payment to proceed."
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
          <AlertDescription className="text-muted-foreground">
            {statusMessage || 'Your payment could not be processed. Please try again.'}
          </AlertDescription>
        </Alert>
      )}

      {paymentStatus === 'pending' && (
        <Alert variant="info" className={animateClasses.scaleIn}>
          <AlertTitle className="flex items-center gap-2 text-foreground">
            <Clock className="h-4 w-4" />Payment pending
          </AlertTitle>
          <AlertDescription className="space-y-2 text-muted-foreground">
            <p>{statusMessage || 'Your payment is being confirmed. This usually takes a few seconds.'}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => refetchStatus()}>
              <RefreshCw className="mr-1 h-3 w-3" />Check status
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {initiateError && (
        <Alert variant="destructive">
          <AlertTitle className="text-foreground">Payment error</AlertTitle>
          <AlertDescription className="text-muted-foreground">{initiateError}</AlertDescription>
        </Alert>
      )}

      {!isScriptLoaded && !widgetLoading && (
        <Alert variant="warning">
          <AlertTitle className="text-foreground">Payment widget unavailable</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            The payment widget could not be loaded. Please check your connection and refresh the page.
          </AlertDescription>
        </Alert>
      )}

      {/* Pay Now / Retry button */}
      {paymentStatus !== 'successful' && (
        <Button
          type="button"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!canPay}
          loading={paymentStatus === 'initiating' || widgetLoading}
          onClick={handlePayNow}
          data-testid="pay-now-button"
        >
          {paymentStatus === 'initiating' ? 'Preparing payment\u2026' : paymentStatus === 'failed' ? 'Retry payment' : 'Pay now'}
        </Button>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Payments are processed securely by Lenco. Your card details are never stored on our servers.
      </p>
      </fieldset>
    </SectionCard>
  )
}

export default PaymentStep
