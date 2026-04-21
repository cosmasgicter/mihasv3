/**
 * Reusable payment form with mobile money + card widget toggle.
 * Used by both PaymentStep (wizard) and Payment.tsx (standalone page).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle, CreditCard, RefreshCw, XCircle, Clock, Smartphone, Phone } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { animateClasses } from '@/lib/animations'
import { apiClient } from '@/services/client'
import { useApplicationPaymentAction } from '@/hooks/useApplicationPaymentAction'

type PaymentMethod = 'mobile-money' | 'card'
type MomoOperator = 'airtel' | 'mtn'

interface MobileMoneyResponse {
  payment_id: string
  reference: string
  amount: string
  currency: string
  lenco_status: string
  operator: string
  phone: string
  status?: string
}

export interface PaymentFormProps {
  applicationId: string
  amount: number
  currency: string
  phone?: string
  fullName?: string
  email?: string
  polledStatus?: 'pending' | 'successful' | 'failed' | null
  onPaymentStatusChange?: (status: 'pending' | 'successful' | 'failed' | null) => void
  onPaymentStatusRefresh?: () => Promise<void>
  onSuccess?: () => void
}

function formatCurrency(amount: number, currency: string): string {
  if (currency === 'ZMW') return `K${amount.toFixed(2)}`
  if (currency === 'USD') return `$${amount.toFixed(2)}`
  return `${currency} ${amount.toFixed(2)}`
}

export function PaymentForm({
  applicationId,
  amount,
  currency,
  phone: initialPhone = '',
  fullName = '',
  email = '',
  polledStatus = null,
  onPaymentStatusChange,
  onPaymentStatusRefresh,
  onSuccess,
}: PaymentFormProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mobile-money')
  const [momoPhone, setMomoPhone] = useState(initialPhone)
  const [momoOperator, setMomoOperator] = useState<MomoOperator>('airtel')
  const [momoLoading, setMomoLoading] = useState(false)
  const [momoError, setMomoError] = useState<string | null>(null)
  const [momoStatus, setMomoStatus] = useState<'idle' | 'pending' | 'successful' | 'failed'>('idle')
  const retryRef = useRef<HTMLButtonElement>(null)

  const getCustomerDetails = useCallback(() => ({ fullName, email, phone: initialPhone }), [fullName, email, initialPhone])

  const {
    paymentStatus: cardPaymentStatus,
    statusMessage: cardStatusMessage,
    initiateError: cardInitiateError,
    widgetLoading,
    isScriptLoaded,
    widgetLoadError,
    retryWidgetLoad,
    startPayment: startCardPayment,
    updatePaymentStatus: updateCardPaymentStatus,
    setInitiateError: setCardInitiateError,
  } = useApplicationPaymentAction({
    applicationId,
    getCustomerDetails,
    onPaymentStatusChange,
    onPaymentStatusRefresh,
  })

  const paymentStatus = paymentMethod === 'mobile-money' ? momoStatus : cardPaymentStatus
  const isPaymentSuccessful = paymentStatus === 'successful' || polledStatus === 'successful'
  const isPaymentPending = paymentStatus === 'pending' || polledStatus === 'pending'
  const isPaymentFailed = paymentStatus === 'failed' || polledStatus === 'failed'

  useEffect(() => {
    if (paymentStatus === 'failed') retryRef.current?.focus()
  }, [paymentStatus])

  useEffect(() => {
    if (polledStatus === 'successful') {
      setMomoStatus('successful')
      updateCardPaymentStatus('successful', 'Payment confirmed.')
    } else if (polledStatus === 'failed' && momoStatus === 'pending') {
      setMomoStatus('failed')
    }
  }, [polledStatus, momoStatus, updateCardPaymentStatus])

  useEffect(() => {
    if (isPaymentSuccessful) onSuccess?.()
  }, [isPaymentSuccessful, onSuccess])

  const handleMomoPayment = useCallback(async () => {
    const cleanPhone = momoPhone.replace(/\s/g, '')
    if (!cleanPhone || cleanPhone.length < 10) {
      setMomoError('Please enter a valid phone number.')
      return
    }
    setMomoLoading(true)
    setMomoError(null)
    try {
      const data = await apiClient.request<MobileMoneyResponse>('/payments/mobile-money/', {
        method: 'POST',
        body: JSON.stringify({ application_id: applicationId, phone: cleanPhone, operator: momoOperator }),
      })
      if (!data) throw new Error('No response from payment service')
      if ((data as MobileMoneyResponse).status === 'already_paid') {
        setMomoStatus('successful')
        onPaymentStatusChange?.('successful')
        return
      }
      setMomoStatus('pending')
      onPaymentStatusChange?.('pending')
    } catch (error) {
      setMomoError(error instanceof Error ? error.message : 'Failed to initiate payment')
      setMomoStatus('failed')
    } finally {
      setMomoLoading(false)
    }
  }, [applicationId, momoPhone, momoOperator, onPaymentStatusChange])

  const canPay = amount > 0 && !isPaymentSuccessful && !isPaymentPending

  return (
    <div className="space-y-4" data-testid="payment-form">
      {/* Success */}
      {isPaymentSuccessful && (
        <Alert variant="success" className={animateClasses.scaleIn}>
          <AlertTitle className="flex items-center gap-2 text-foreground">
            <CheckCircle className="h-4 w-4" />Payment successful
          </AlertTitle>
          <AlertDescription className="text-muted-foreground">
            Your payment has been confirmed.
          </AlertDescription>
        </Alert>
      )}

      {/* Pending — mobile money */}
      {isPaymentPending && paymentMethod === 'mobile-money' && (
        <Alert variant="info" className={animateClasses.scaleIn}>
          <AlertTitle className="flex items-center gap-2 text-foreground">
            <Smartphone className="h-4 w-4" />Check your phone
          </AlertTitle>
          <AlertDescription className="space-y-3 text-muted-foreground">
            <p className="font-medium text-foreground">
              Approve the payment of {formatCurrency(amount, currency)} on your {momoOperator === 'airtel' ? 'Airtel' : 'MTN'} mobile money.
            </p>
            <p className="text-sm">Open your phone, enter your mobile money PIN when prompted, and confirm the payment.</p>
            <Button type="button" variant="outline" size="sm" onClick={async () => { await onPaymentStatusRefresh?.() }}>
              <RefreshCw className="mr-1 h-3 w-3" />I've approved — check status
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Pending — card */}
      {isPaymentPending && paymentMethod === 'card' && (
        <Alert variant="info" className={animateClasses.scaleIn}>
          <AlertTitle className="flex items-center gap-2 text-foreground">
            <Clock className="h-4 w-4" />Payment pending
          </AlertTitle>
          <AlertDescription className="space-y-2 text-muted-foreground">
            <p>{cardStatusMessage || 'Your payment is being confirmed.'}</p>
            <Button type="button" variant="outline" size="sm" onClick={async () => { await onPaymentStatusRefresh?.() }}>
              <RefreshCw className="mr-1 h-3 w-3" />Check status
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Failed */}
      {isPaymentFailed && (
        <Alert variant="destructive" className={animateClasses.scaleIn}>
          <AlertTitle className="flex items-center gap-2 text-foreground">
            <XCircle className="h-4 w-4" />Payment failed
          </AlertTitle>
          <AlertDescription className="space-y-3 text-muted-foreground">
            <p>{momoError || cardStatusMessage || 'Your payment could not be processed.'}</p>
            <Button ref={retryRef} type="button" variant="outline" size="sm" onClick={() => {
              setMomoStatus('idle')
              setMomoError(null)
              updateCardPaymentStatus('idle')
              setCardInitiateError(null)
            }}>
              <RefreshCw className="mr-1 h-3 w-3" />Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Payment method selection */}
      {!isPaymentSuccessful && !isPaymentPending && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPaymentMethod('mobile-money')}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all min-h-[80px] ${
                paymentMethod === 'mobile-money'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/30'
              }`}
            >
              <Smartphone className="h-6 w-6" />
              <span className="text-sm font-medium">Mobile Money</span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('card')}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all min-h-[80px] ${
                paymentMethod === 'card'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/30'
              }`}
            >
              <CreditCard className="h-6 w-6" />
              <span className="text-sm font-medium">Card</span>
            </button>
          </div>

          {/* Mobile Money Form */}
          {paymentMethod === 'mobile-money' && (
            <div className="space-y-4 rounded-xl border border-border bg-card/50 p-4">
              <div>
                <label htmlFor="momo-phone" className="block text-sm font-medium text-foreground mb-2">
                  Mobile money number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    id="momo-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={momoPhone}
                    onChange={(e) => setMomoPhone(e.target.value)}
                    placeholder="0977 123 456"
                    className="w-full h-12 pl-10 pr-4 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Mobile money provider
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMomoOperator('airtel')}
                    className={`flex items-center justify-center gap-2 rounded-xl border-2 p-3 min-h-[48px] transition-all font-medium ${
                      momoOperator === 'airtel'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-border bg-card text-muted-foreground hover:border-red-300'
                    }`}
                  >
                    Airtel Money
                  </button>
                  <button
                    type="button"
                    onClick={() => setMomoOperator('mtn')}
                    className={`flex items-center justify-center gap-2 rounded-xl border-2 p-3 min-h-[48px] transition-all font-medium ${
                      momoOperator === 'mtn'
                        ? 'border-yellow-500 bg-yellow-50 text-yellow-700'
                        : 'border-border bg-card text-muted-foreground hover:border-yellow-300'
                    }`}
                  >
                    MTN MoMo
                  </button>
                </div>
              </div>

              {momoError && <p className="text-sm text-destructive">{momoError}</p>}

              <Button
                type="button"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={!canPay || momoLoading}
                loading={momoLoading}
                onClick={handleMomoPayment}
                data-testid="pay-momo-button"
              >
                {momoLoading ? 'Sending payment request…' : `Pay ${formatCurrency(amount, currency)} via ${momoOperator === 'airtel' ? 'Airtel' : 'MTN'}`}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                You'll receive a prompt on your phone to approve the payment.
              </p>
            </div>
          )}

          {/* Card Payment */}
          {paymentMethod === 'card' && (
            <div className="space-y-4 rounded-xl border border-border bg-card/50 p-4">
              {!isScriptLoaded && !widgetLoading && (
                <Alert variant="warning">
                  <AlertTitle className="text-foreground">Card payment loading</AlertTitle>
                  <AlertDescription className="space-y-3 text-muted-foreground">
                    <p>{widgetLoadError || 'The card payment module is loading. Please wait.'}</p>
                    <Button type="button" variant="outline" size="sm" onClick={retryWidgetLoad}>
                      <RefreshCw className="mr-2 h-4 w-4" />Retry
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {cardInitiateError && <p className="text-sm text-destructive">{cardInitiateError}</p>}

              <Button
                type="button"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={!canPay || !isScriptLoaded || widgetLoading || cardPaymentStatus === 'initiating'}
                loading={cardPaymentStatus === 'initiating' || widgetLoading}
                onClick={startCardPayment}
                data-testid="pay-card-button"
              >
                {cardPaymentStatus === 'initiating' ? 'Preparing…' : `Pay ${formatCurrency(amount, currency)} by card`}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                A secure payment window will open. Your card details are never stored on our servers.
              </p>
            </div>
          )}
        </>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Payments are processed securely by Lenco.
      </p>
    </div>
  )
}
