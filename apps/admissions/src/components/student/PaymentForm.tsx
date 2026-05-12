/**
 * Reusable payment form with mobile money + card widget toggle.
 * Used by both PaymentStep (wizard) and Payment.tsx (standalone page).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle, CreditCard, RefreshCw, Smartphone, Phone, Check, Loader2, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { animateClasses } from '@/lib/animations'
import { useApplicationPaymentAction } from '@/hooks/useApplicationPaymentAction'
import { normalizePaymentStatusValue } from '@/hooks/usePaymentStatus'
import { generateIdempotencyKey } from '@/lib/paymentStatus'
import { initiateMobileMoney, verifyPayment } from '@/services/payments'
import { usePaymentRecoveryStore } from '@/stores/paymentRecoveryStore'

type PaymentMethod = 'mobile-money' | 'card'
type MomoOperator = 'airtel' | 'mtn' | null

/** Transaction fee rate charged by the payment gateway (1%) */
const TRANSACTION_FEE_RATE = 0.01
const PAYMENT_VERIFY_INTERVAL_MS = 10000
const PAYMENT_VERIFY_MAX_ATTEMPTS = 12
const PAYMENT_VERIFY_MAX_ERRORS = 2

function detectOperator(phone: string): MomoOperator {
  const digits = phone.replace(/[\s\-+]/g, '')
  const local = digits.startsWith('260') ? digits.slice(3) : digits
  // MTN: 096x, 076x
  if (/^0?96/.test(local) || /^0?76/.test(local)) return 'mtn'
  // Airtel: 097x, 077x
  if (/^0?97/.test(local) || /^0?77/.test(local)) return 'airtel'
  // Zamtel: 095x, 075x — route via Airtel gateway (Zamtel not separately supported)
  if (/^0?95/.test(local) || /^0?75/.test(local)) return 'airtel'
  if (local.length >= 4) return 'airtel'
  return null
}

/** Format phone as user types: 0977 123 456 */
/** Format phone for display: 0977 123 456 */
function formatPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  // Strip country code to get local 10-digit format for display
  if (digits.startsWith('260') && digits.length >= 12) {
    digits = '0' + digits.slice(3)
  }
  digits = digits.slice(0, 10)
  if (digits.length <= 4) return digits
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
}

export { normalizeZambianPhone } from '@/lib/phoneNormalization'
import { normalizeZambianPhone, phoneDigits } from '@/lib/phoneNormalization'

interface MobileMoneyResponse {
  payment_id: string
  reference: string
  amount: string
  currency: string
  lenco_status: string
  operator: string
  masked_phone: string
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
  /** External inflight signal — disables initiate buttons when true (R14.1). */
  inflight?: boolean
  /** External pending payment id — disables initiate buttons while set (R14.1). */
  pendingPaymentId?: string | null
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
  if (lower.includes('maximum payment attempts') || lower.includes('max_payment_attempts'))
    return { message: 'You have reached the maximum number of payment attempts. Please contact support or try again later.', type: 'rate_limit' }
  if (lower.includes('insufficient') || lower.includes('balance'))
    return { message: 'Insufficient funds. Please top up your account and try again.', type: 'failed' }
  if (lower.includes('provider error') || lower.includes('provider_error'))
    return { message: 'The mobile money provider could not process your payment. Please try again or use a different payment method.', type: 'failed' }
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
  inflight = false,
  pendingPaymentId = null,
}: PaymentFormProps) {
  const normalizedPhone = normalizeZambianPhone(initialPhone)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mobile-money')
  const [momoPhone, setMomoPhone] = useState(() => formatPhone(initialPhone))
  const [momoOperator, setMomoOperator] = useState<MomoOperator>(() => detectOperator(initialPhone))
  const [momoLoading, setMomoLoading] = useState(false)
  const [momoError, setMomoError] = useState<string | null>(null)
  const [momoStatus, setMomoStatus] = useState<'idle' | 'pending' | 'successful' | 'failed'>('idle')
  const [pendingElapsed, setPendingElapsed] = useState(0)
  const [activePendingMethod, setActivePendingMethod] = useState<PaymentMethod | null>(null)
  const [activeMomoPaymentId, setActiveMomoPaymentId] = useState<string | null>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval>>()
  const pollErrorCountRef = useRef(0)
  const pollAttemptCountRef = useRef(0)
  const paymentRecoveryStore = usePaymentRecoveryStore()

  const getCustomerDetails = useCallback(() => ({ fullName, email, phone: normalizedPhone }), [fullName, email, normalizedPhone])

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
  const isPaymentPending = (paymentStatus === 'pending' || polledStatus === 'pending') && activePendingMethod !== null
  const isPaymentFailed = paymentStatus === 'failed' || polledStatus === 'failed'

  const syncPendingPayment = useCallback(async (paymentIdOverride?: string | null) => {
    const paymentId = paymentIdOverride || activeMomoPaymentId
    const pendingMethod = paymentIdOverride ? 'mobile-money' : activePendingMethod

    if (pendingMethod === 'mobile-money' && paymentId) {
      pollAttemptCountRef.current += 1

      if (pollAttemptCountRef.current > PAYMENT_VERIFY_MAX_ATTEMPTS) {
        clearInterval(pollRef.current)
        setMomoStatus('pending')
        setMomoError('We could not confirm this payment automatically yet. Please check again in a moment.')
        onPaymentStatusChange?.('pending')
        return
      }

      try {
        const verification = await verifyPayment(paymentId)

        pollErrorCountRef.current = 0
        const normalized = normalizePaymentStatusValue(verification?.status ?? null)
        if (normalized === 'successful') {
          clearInterval(pollRef.current)
          setMomoStatus('successful')
          setActivePendingMethod(null)
          setActiveMomoPaymentId(null)
          paymentRecoveryStore.clear(applicationId)
          onPaymentStatusChange?.('successful')
          return
        }
        if (normalized === 'failed') {
          clearInterval(pollRef.current)
          setMomoStatus('failed')
          setActivePendingMethod(null)
          setActiveMomoPaymentId(null)
          paymentRecoveryStore.clear(applicationId)
          onPaymentStatusChange?.('failed')
          return
        }
        if (normalized === 'pending') {
          setMomoStatus('pending')
          onPaymentStatusChange?.('pending')
        }
      } catch {
        pollErrorCountRef.current += 1
        if (pollErrorCountRef.current >= PAYMENT_VERIFY_MAX_ERRORS) {
          clearInterval(pollRef.current)
          setMomoStatus('pending')
          setMomoError('Unable to verify payment status right now. Please try again in a moment.')
          onPaymentStatusChange?.('pending')
          return
        }
      }
    }

    try {
      await onPaymentStatusRefresh?.()
    } catch {
      // Ignore refresh errors — the verify call above is the primary check.
    }
  }, [activeMomoPaymentId, activePendingMethod, applicationId, onPaymentStatusChange, onPaymentStatusRefresh, paymentRecoveryStore])

  // Auto-poll every 10s while pending
  useEffect(() => {
    if (isPaymentPending) {
      setPendingElapsed(0)
      pollAttemptCountRef.current = 0
      pollErrorCountRef.current = 0
      pollRef.current = setInterval(() => {
        setPendingElapsed(prev => prev + PAYMENT_VERIFY_INTERVAL_MS / 1000)
        void syncPendingPayment()
      }, PAYMENT_VERIFY_INTERVAL_MS)
      return () => clearInterval(pollRef.current)
    }
    return () => clearInterval(pollRef.current)
  }, [isPaymentPending, syncPendingPayment])

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
      setActivePendingMethod(null)
      setActiveMomoPaymentId(null)
    } else if (polledStatus === 'failed' && momoStatus === 'pending') {
      setMomoStatus('failed')
      setActivePendingMethod(null)
      setActiveMomoPaymentId(null)
    }
  }, [polledStatus, momoStatus, updateCardPaymentStatus])

  const phoneValidationError = (() => {
    const digits = phoneDigits(momoPhone)
    if (!digits) return null
    if (digits.length > 0 && digits.length < 9) return 'Enter a valid phone number (e.g. 0977 123 456)'
    if (digits.length > 12) return 'Phone number is too long'
    return null
  })()

  const handleMomoPayment = useCallback(async () => {
    const normalized = normalizeZambianPhone(momoPhone)
    if (!normalized || normalized.length < 12) {
      setMomoError('Please enter a valid phone number.')
      return
    }
    const operator = detectOperator(momoPhone)
    if (!operator) {
      setMomoError('Unable to detect mobile money operator. Please check your number.')
      return
    }
    setMomoLoading(true)
    setMomoError(null)
    setActivePendingMethod('mobile-money')
    try {
      const data = await initiateMobileMoney(
        { application_id: applicationId, phone: normalized, operator },
        { idempotencyKey: generateIdempotencyKey(applicationId) },
      ) as MobileMoneyResponse
      if (!data) throw new Error('No response from payment service')
      setActiveMomoPaymentId(data.payment_id || null)
      if (data.payment_id) {
        paymentRecoveryStore.record({
          application_id: applicationId,
          payment_id: data.payment_id,
          reference: data.reference,
          method: 'mobile_money',
          initiated_at: Date.now(),
        })
      }
      if ((data as MobileMoneyResponse).status === 'already_paid') {
        setMomoStatus('successful')
        setActivePendingMethod(null)
        paymentRecoveryStore.clear(applicationId)
        onPaymentStatusChange?.('successful')
        return
      }
      const initiatedStatus = normalizePaymentStatusValue(data.status || data.lenco_status || null)
      if (initiatedStatus === 'successful') {
        setMomoStatus('successful')
        setActivePendingMethod(null)
        paymentRecoveryStore.clear(applicationId)
        onPaymentStatusChange?.('successful')
        return
      }
      if (initiatedStatus === 'failed') {
        setMomoStatus('failed')
        setActivePendingMethod(null)
        paymentRecoveryStore.clear(applicationId)
        onPaymentStatusChange?.('failed')
        return
      }
      setMomoStatus('pending')
      onPaymentStatusChange?.('pending')
      setTimeout(() => {
        void syncPendingPayment(data.payment_id)
      }, 1500)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to initiate payment'
      setMomoError(msg)
      setMomoStatus('failed')
      setActivePendingMethod(null)
      setActiveMomoPaymentId(null)
    } finally {
      setMomoLoading(false)
    }
  }, [applicationId, momoPhone, onPaymentStatusChange, paymentRecoveryStore, syncPendingPayment])

  const handleRetry = useCallback(() => {
    setMomoStatus('idle')
    setMomoError(null)
    setActivePendingMethod(null)
    setActiveMomoPaymentId(null)
    pollErrorCountRef.current = 0
    pollAttemptCountRef.current = 0
    updateCardPaymentStatus('idle')
    setCardInitiateError(null)
  }, [updateCardPaymentStatus, setCardInitiateError])

  const handleCardPayment = useCallback(() => {
    setActivePendingMethod('card')
    void startCardPayment()
  }, [startCardPayment])

  const canPay =
    amount > 0 &&
    !isPaymentSuccessful &&
    !isPaymentPending &&
    !inflight &&
    !pendingPaymentId

  // ── Success State ──
  if (isPaymentSuccessful) {
    return (
      <div className="space-y-4" data-testid="payment-form">
        <div className={`relative overflow-hidden rounded-lg border-2 border-green-500/30 bg-green-50 dark:bg-green-950/20 p-8 text-center ${animateClasses.scaleIn}`}>
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
    const isMobileMoneyPending = activePendingMethod !== 'card'
    return (
      <div className="space-y-4" data-testid="payment-form">
        <div className={`rounded-lg border border-primary/30 bg-primary/5 p-6 text-center ${animateClasses.scaleIn}`}>
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10" style={{ animation: 'pending-pulse 2s ease-in-out infinite' }}>
            {isMobileMoneyPending ? <Smartphone className="h-10 w-10 text-primary" /> : <CreditCard className="h-10 w-10 text-primary" />}
          </div>
          <p className="text-lg font-bold text-foreground">{isMobileMoneyPending ? 'Check your phone' : 'Confirming your payment'}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isMobileMoneyPending
              ? <>Approve the payment of <span className="font-semibold text-foreground">{formatCurrency(amount * (1 + TRANSACTION_FEE_RATE), currency)}</span> (includes 1% transaction fee)</>
              : <>We are confirming your card payment of <span className="font-semibold text-foreground">{formatCurrency(amount * (1 + TRANSACTION_FEE_RATE), currency)}</span>.</>}
          </p>

          {isMobileMoneyPending && (
            <div className="mx-auto mt-6 max-w-xs space-y-3 text-left">
              {['Open your phone', 'Enter your PIN', 'Confirm the payment'].map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                  <span className="text-sm text-foreground">{step}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Checking automatically…
          </div>

          {momoError && (
            <p className="mt-3 text-sm text-muted-foreground">{momoError}</p>
          )}

          {pendingElapsed >= 30 && (
            <p className="mt-4 text-sm text-muted-foreground">
              Taking too long?{' '}
              <button type="button" className="font-medium text-primary underline" onClick={handleRetry}>
                Try again
              </button>
            </p>
          )}

          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={async () => { await syncPendingPayment() }}>
            <RefreshCw className="mr-1 h-3 w-3" />{isMobileMoneyPending ? "I've approved — check now" : 'Check payment now'}
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
        <div className={`rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center ${animateClasses.scaleIn}`}>
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
          className={`relative flex items-start gap-4 rounded-lg border-2 p-5 text-left transition-all ${
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
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${paymentMethod === 'mobile-money' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
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
          className={`relative flex items-start gap-4 rounded-lg border-2 p-5 text-left transition-all ${
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
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${paymentMethod === 'card' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
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
        <div className="space-y-4 rounded-lg border border-border bg-card/50 p-5">
          <div className="flex flex-wrap items-center gap-2" aria-label="Supported mobile money networks">
            <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
              Airtel Money
            </span>
            <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2.5 py-1 text-xs font-semibold text-yellow-700 dark:border-yellow-900/40 dark:bg-yellow-950/30 dark:text-yellow-300">
              MTN MoMo
            </span>
          </div>

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
                className={`w-full h-12 pl-10 rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all ${
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
            disabled={!canPay || momoLoading || !!phoneValidationError || phoneDigits(momoPhone).length < 9}
            loading={momoLoading}
            onClick={handleMomoPayment}
            data-testid="pay-momo-button"
          >
            {momoLoading ? 'Sending payment request…' : `Pay ${formatCurrency(amount * (1 + TRANSACTION_FEE_RATE), currency)}`}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            You'll receive a prompt on your phone to approve the payment.
          </p>
        </div>
      )}

      {/* Card Payment */}
      {paymentMethod === 'card' && (
        <div className="space-y-4 rounded-lg border border-border bg-card/50 p-5">
          {!isScriptLoaded && !widgetLoading && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm">
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
            onClick={handleCardPayment}
            data-testid="pay-card-button"
          >
            {cardPaymentStatus === 'initiating' ? 'Preparing…' : `Pay ${formatCurrency(amount * (1 + TRANSACTION_FEE_RATE), currency)} by card`}
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
