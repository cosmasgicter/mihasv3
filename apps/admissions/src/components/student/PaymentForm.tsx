/**
 * Reusable payment form with mobile money + card widget toggle.
 * Used by both PaymentStep (wizard) and Payment.tsx (standalone page).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle, CreditCard, RefreshCw, Smartphone, Phone, Check, Loader2, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { animateClasses } from '@/lib/animations'
import { apiClient } from '@/services/client'
import { useApplicationPaymentAction } from '@/hooks/useApplicationPaymentAction'

type PaymentMethod = 'mobile-money' | 'card'
type MomoOperator = 'airtel' | 'mtn' | null

function detectOperator(phone: string): MomoOperator {
  const digits = phone.replace(/[\s\-+]/g, '')
  const local = digits.startsWith('260') ? digits.slice(3) : digits
  if (/^0?9[67]/.test(local) || /^0?7[67]/.test(local)) return 'mtn'
  if (/^0?9[7]/.test(local) || /^0?7[7]/.test(local)) return 'airtel'
  if (local.length >= 4) return 'airtel'
  return null
}

/** Format phone as user types: 0977 123 456 */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 4) return digits
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
}

function phoneDigits(formatted: string): string {
  return formatted.replace(/\D/g, '')
}

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

function classifyError(error: string): { message: string; type: 'network' | 'rate_limit' | 'failed' } {
  const lower = error.toLowerCase()
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('timeout') || lower.includes('connection'))
    return { message: 'Check your connection and try again.', type: 'network' }
  if (lower.includes('rate') || lower.includes('too many') || lower.includes('429'))
    return { message: 'Too many attempts. Please wait a moment.', type: 'rate_limit' }
  return { message: "The payment didn't go through. You can try again or use a different method.", type: 'failed' }
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
  const [momoPhone, setMomoPhone] = useState(() => formatPhone(initialPhone))
  const [momoOperator, setMomoOperator] = useState<MomoOperator>(() => detectOperator(initialPhone))
  const [momoLoading, setMomoLoading] = useState(false)
  const [momoError, setMomoError] = useState<string | null>(null)
  const [momoStatus, setMomoStatus] = useState<'idle' | 'pending' | 'successful' | 'failed'>('idle')
  const [pendingElapsed, setPendingElapsed] = useState(0)
  const retryRef = useRef<HTMLButtonElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval>>()

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

  // Auto-poll every 10s while pending
  useEffect(() => {
    if (isPaymentPending) {
      setPendingElapsed(0)
      pollRef.current = setInterval(() => {
        setPendingElapsed(prev => prev + 10)
        onPaymentStatusRefresh?.()
      }, 10000)
      return () => clearInterval(pollRef.current)
    }
    return () => clearInterval(pollRef.current)
  }, [isPaymentPending, onPaymentStatusRefresh])

  // Auto-advance on success
  useEffect(() => {
    if (isPaymentSuccessful) {
      const t = setTimeout(() => onSuccess?.(), 2000)
      return () => clearTimeout(t)
    }
  }, [isPaymentSuccessful, onSuccess])

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

  const phoneValidationError = (() => {
    const digits = phoneDigits(momoPhone)
    if (!digits) return null
    if (digits.length > 0 && digits.length < 10) return 'Enter a 10-digit phone number (e.g. 0977 123 456)'
    if (digits.length > 10) return 'Phone number is too long'
    return null
  })()

  const handleMomoPayment = useCallback(async () => {
    const digits = phoneDigits(momoPhone)
    if (!digits || digits.length < 10) {
      setMomoError('Please enter a valid 10-digit phone number.')
      return
    }
    setMomoLoading(true)
    setMomoError(null)
    try {
      const data = await apiClient.request<MobileMoneyResponse>('/payments/mobile-money/', {
        method: 'POST',
        body: JSON.stringify({ application_id: applicationId, phone: digits, operator: momoOperator || 'airtel' }),
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
      const msg = error instanceof Error ? error.message : 'Failed to initiate payment'
      setMomoError(msg)
      setMomoStatus('failed')
    } finally {
      setMomoLoading(false)
    }
  }, [applicationId, momoPhone, momoOperator, onPaymentStatusChange])

  const handleRetry = useCallback(() => {
    setMomoStatus('idle')
    setMomoError(null)
    updateCardPaymentStatus('idle')
    setCardInitiateError(null)
  }, [updateCardPaymentStatus, setCardInitiateError])

  const canPay = amount > 0 && !isPaymentSuccessful && !isPaymentPending

  // ── Success State ──
  if (isPaymentSuccessful) {
    return (
      <div className="space-y-4" data-testid="payment-form">
        <div className={`relative overflow-hidden rounded-2xl border-2 border-green-500/30 bg-green-50 dark:bg-green-950/20 p-8 text-center ${animateClasses.scaleIn}`}>
          {/* CSS confetti */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            {Array.from({ length: 12 }).map((_, i) => (
              <span
                key={i}
                className="absolute block h-2 w-2 rounded-full opacity-0"
                style={{
                  left: `${10 + (i * 7) % 80}%`,
                  top: '-8px',
                  backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'][i % 6],
                  animation: `confetti-fall 1.5s ease-out ${i * 0.08}s forwards`,
                }}
              />
            ))}
          </div>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white" style={{ animation: 'success-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>
            <CheckCircle className="h-8 w-8" />
          </div>
          <p className="text-xl font-bold text-green-700 dark:text-green-400">Payment confirmed!</p>
          <p className="mt-1 text-lg font-semibold text-green-600 dark:text-green-500">{formatCurrency(amount, currency)}</p>
          <p className="mt-3 text-sm text-muted-foreground">Continuing to next step…</p>
        </div>
        <style>{`
          @keyframes confetti-fall {
            0% { opacity: 1; transform: translateY(0) rotate(0deg) scale(1); }
            100% { opacity: 0; transform: translateY(180px) rotate(720deg) scale(0.3); }
          }
          @keyframes success-pop {
            0% { transform: scale(0); opacity: 0; }
            60% { transform: scale(1.15); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    )
  }

  // ── Pending State ──
  if (isPaymentPending) {
    return (
      <div className="space-y-4" data-testid="payment-form">
        <div className={`rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center ${animateClasses.scaleIn}`}>
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10" style={{ animation: 'pending-pulse 2s ease-in-out infinite' }}>
            <Smartphone className="h-10 w-10 text-primary" />
          </div>
          <p className="text-lg font-bold text-foreground">Check your phone</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Approve the payment of <span className="font-semibold text-foreground">{formatCurrency(amount, currency)}</span>
          </p>

          <div className="mx-auto mt-6 max-w-xs space-y-3 text-left">
            {['Open your phone', 'Enter your PIN', 'Confirm the payment'].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                <span className="text-sm text-foreground">{step}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Checking automatically…
          </div>

          {pendingElapsed >= 30 && (
            <p className="mt-4 text-sm text-muted-foreground">
              Taking too long?{' '}
              <button type="button" className="font-medium text-primary underline" onClick={handleRetry}>
                Try again
              </button>
            </p>
          )}

          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={async () => { await onPaymentStatusRefresh?.() }}>
            <RefreshCw className="mr-1 h-3 w-3" />I've approved — check now
          </Button>
        </div>
        <style>{`
          @keyframes pending-pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.08); opacity: 0.8; }
          }
        `}</style>
      </div>
    )
  }

  // ── Failed State ──
  if (isPaymentFailed) {
    const errorInfo = classifyError(momoError || cardStatusMessage || '')
    return (
      <div className="space-y-4" data-testid="payment-form">
        <div className={`rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center ${animateClasses.scaleIn}`}>
          {errorInfo.type === 'network' ? (
            <WifiOff className="mx-auto mb-3 h-10 w-10 text-destructive/70" />
          ) : (
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <CreditCard className="h-6 w-6 text-destructive" />
            </div>
          )}
          <p className="text-lg font-bold text-foreground">Payment unsuccessful</p>
          <p className="mt-2 text-sm text-muted-foreground">{errorInfo.message}</p>
          <Button ref={retryRef} type="button" variant="outline" size="default" className="mt-5" onClick={handleRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />Try again
          </Button>
        </div>
      </div>
    )
  }

  // ── Method Selection + Form ──
  return (
    <div className="space-y-5" data-testid="payment-form">
      {/* Method cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setPaymentMethod('mobile-money')}
          className={`relative flex items-start gap-4 rounded-2xl border-2 p-5 text-left transition-all ${
            paymentMethod === 'mobile-money'
              ? 'border-primary bg-primary/5'
              : 'border-dashed border-border bg-card text-muted-foreground hover:border-primary/40'
          }`}
        >
          {paymentMethod === 'mobile-money' && (
            <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
              <Check className="h-3 w-3" />
            </span>
          )}
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${paymentMethod === 'mobile-money' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
            <Smartphone className="h-6 w-6" />
          </div>
          <div>
            <p className={`font-semibold ${paymentMethod === 'mobile-money' ? 'text-foreground' : ''}`}>Mobile Money</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Pay with Airtel or MTN mobile money</p>
            <p className="mt-1 text-xs text-muted-foreground/70">Instant · No card needed</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setPaymentMethod('card')}
          className={`relative flex items-start gap-4 rounded-2xl border-2 p-5 text-left transition-all ${
            paymentMethod === 'card'
              ? 'border-primary bg-primary/5'
              : 'border-dashed border-border bg-card text-muted-foreground hover:border-primary/40'
          }`}
        >
          {paymentMethod === 'card' && (
            <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
              <Check className="h-3 w-3" />
            </span>
          )}
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${paymentMethod === 'card' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
            <CreditCard className="h-6 w-6" />
          </div>
          <div>
            <p className={`font-semibold ${paymentMethod === 'card' ? 'text-foreground' : ''}`}>Card</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Pay with Visa or Mastercard</p>
            <p className="mt-1 text-xs text-muted-foreground/70">Secure card payment</p>
          </div>
        </button>
      </div>

      {/* Mobile Money Form */}
      {paymentMethod === 'mobile-money' && (
        <div className="space-y-4 rounded-2xl border border-border bg-card/50 p-5">
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
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^\d\s]/g, '')
                  const formatted = formatPhone(raw)
                  setMomoPhone(formatted)
                  setMomoError(null)
                  const d = phoneDigits(formatted)
                  if (d.length >= 4) setMomoOperator(detectOperator(d))
                  else setMomoOperator(null)
                }}
                placeholder="0977 123 456"
                className={`w-full h-12 pl-10 rounded-xl border bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all ${
                  phoneValidationError || momoError ? 'border-destructive pr-4' : 'border-border pr-4'
                } ${momoOperator ? 'pr-28' : 'pr-4'}`}
              />
              {momoOperator && phoneDigits(momoPhone).length >= 4 && (
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  momoOperator === 'airtel' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                }`}>
                  {momoOperator === 'airtel' ? 'Airtel Money' : 'MTN MoMo'}
                </span>
              )}
            </div>
            {(phoneValidationError || momoError) && (
              <p className="mt-1.5 text-xs text-destructive">{momoError || phoneValidationError}</p>
            )}
          </div>

          <Button
            type="button"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!canPay || momoLoading || !!phoneValidationError || phoneDigits(momoPhone).length < 10}
            loading={momoLoading}
            onClick={handleMomoPayment}
            data-testid="pay-momo-button"
          >
            {momoLoading ? 'Sending payment request…' : `Pay ${formatCurrency(amount, currency)}`}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            You'll receive a prompt on your phone to approve the payment.
          </p>
        </div>
      )}

      {/* Card Payment */}
      {paymentMethod === 'card' && (
        <div className="space-y-4 rounded-2xl border border-border bg-card/50 p-5">
          {!isScriptLoaded && !widgetLoading && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
              <p className="text-muted-foreground">{widgetLoadError || 'The card payment module is loading…'}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={retryWidgetLoad}>
                <RefreshCw className="mr-2 h-3 w-3" />Retry
              </Button>
            </div>
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

      <p className="text-center text-xs text-muted-foreground">
        Payments are processed securely by Lenco.
      </p>
    </div>
  )
}
