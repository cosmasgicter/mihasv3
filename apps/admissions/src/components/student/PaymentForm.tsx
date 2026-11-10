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
import { PAYMENT_WAITING_STATES, type PaymentPhase } from '@/lib/paymentStatus'
import { PAYMENT_RECOVERY_PRESENTATION } from '@/lib/paymentRecovery'
import { generateIdempotencyKey } from '@/lib/paymentStatus'
import { initiateMobileMoney, verifyPayment } from '@/services/payments'
import { usePaymentRecoveryStore } from '@/stores/paymentRecoveryStore'
import { normalizeZambianMsisdn } from '@/lib/zambianMsisdn'
import { formatServerAmount, isNonZeroServerAmount } from '@/lib/serverAmount'
import { toError } from '@/lib/toError'

type PaymentMethod = 'mobile-money' | 'card'
const PAYMENT_VERIFY_INTERVAL_MS = 10000
const PAYMENT_VERIFY_MAX_ATTEMPTS = 12
const PAYMENT_VERIFY_MAX_ERRORS = 2

/** Extract only digits from a phone string */
function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, '')
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

export { normalizeZambianMsisdn } from '@/lib/zambianMsisdn'

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
 /**
 * Server-authored canonical fee (after any waiver), exactly as the fee quote
 * sent it. A decimal string — never a number the client derived (R12.1).
 */
 baseAmount: string
 /** Server-authored customer-borne provider fee from the fee quote. */
 providerFee?: string | null
 /**
 * Server-authored total the student will be charged. The client never computes
 * this: finding STU-08 was a hardcoded 1% multiplication in this component.
 */
 totalAmount?: string | null
 currency: string
  phone?: string
  fullName?: string
  email?: string
  polledStatus?: 'pending' | 'successful' | 'failed' | null
  onPaymentStatusChange?: (status: 'pending' | 'successful' | 'failed' | 'deferred' | null) => void
  onPaymentStatusRefresh?: () => Promise<void>
  onSuccess?: () => void
  /** External inflight signal — disables initiate buttons when true (R14.1). */
  inflight?: boolean
  /** External pending payment id — disables initiate buttons while set (R14.1). */
  pendingPaymentId?: string | null
 /**
 * Server-derived phase of the pending payment (task 8.2, STU-09):
 * `action_required` means the student has a prompt to approve on their handset;
 * `provider_processing` means the request is with the provider and there is
 * nothing for them to do. When absent, the form falls back to describing the
 * payment method, which is what it did before the phase existed.
 */
 paymentPhase?: PaymentPhase | null
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
 baseAmount,
 providerFee = null,
 totalAmount = null,
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
 paymentPhase = null,
}: PaymentFormProps) {
  const normalizedPhone = normalizeZambianMsisdn(initialPhone)
 // The charged amount is whatever the server quoted. When the caller has no
 // provider-fee breakdown, the base amount is displayed as-is — the client never
 // adds an assumed transaction fee on top (finding STU-08).
 const chargedAmountLabel = formatServerAmount(totalAmount ?? baseAmount, currency)
 const includesProviderFee = isNonZeroServerAmount(providerFee)
 const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mobile-money')
  const [momoPhone, setMomoPhone] = useState(() => formatPhone(initialPhone))
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
const isPaymentFailed = paymentStatus === 'failed'|| polledStatus === 'failed'/**
 * A payment that is already open, recovered from outside this component
 * instance — the recovery store after a refresh, or the server's own payment
 * record when the student arrives at `/student/payment`(task 8.3, R12.3).
 */
 const hasRecoveredPending = Boolean(pendingPaymentId) && !isPaymentSuccessful && !isPaymentFailed
 /**
 * Task 8.3 (STU-24, R12.6): a pending payment is pending whether or not this
 * component instance is the one that started it. Before this task the wait
 * panel only rendered when `activePendingMethod` was set, so a refreshed page —
 * or the payment page reached from the dashboard — fell through to the method
 * picker with its initiate button disabled and nothing stating why or when it
 * would work again. That is an indefinite disabled control. Now the same
 * situation renders the wait state, which says who is being waited on and
 * offers a status re-check instead of a dead button.
 */
 const isPaymentPending =
 !isPaymentSuccessful &&
 !isPaymentFailed &&
 (hasRecoveredPending ||
 ((paymentStatus === 'pending' || polledStatus === 'pending') && activePendingMethod !== null))

  const syncPendingPayment = useCallback(async (paymentIdOverride?: string | null) => {
 // A recovered payment id is as verifiable as one this instance created: the
 // verify endpoint is keyed on the payment, not on the method or the tab.
 const paymentId = paymentIdOverride || activeMomoPaymentId
 || pendingPaymentId

    if (paymentId) {
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
        if (normalized === 'deferred') {
          // The server says the fee was deferred (another tab or device): there
          // is no payment left to wait on, so stop polling and drop the entry.
          clearInterval(pollRef.current)
          setActivePendingMethod(null)
          setActiveMomoPaymentId(null)
          paymentRecoveryStore.clear(applicationId)
          onPaymentStatusChange?.('deferred')
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
  }, [activeMomoPaymentId, applicationId, onPaymentStatusChange, onPaymentStatusRefresh, paymentRecoveryStore, pendingPaymentId])

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
    const digits = momoPhone.replace(/\D/g, '')
    if (!digits) return null
    if (digits.length > 0 && digits.length < 9) return 'Enter a valid phone number (e.g. 0977 123 456)'
    if (digits.length > 12) return 'Phone number is too long'
    return null
  })()

  const handleMomoPayment = useCallback(async () => {
    const normalized = normalizeZambianMsisdn(momoPhone)
    if (!normalized) {
      setMomoError('Please enter a valid phone number.')
      return
    }
 setMomoLoading(true)
    setMomoError(null)
    setActivePendingMethod('mobile-money')
    try {
 // Provider network routing is server-authored (task 8.1, design §10.2). The
 // client validates the MSISDN format and sends nothing else: it does not
 // guess Airtel/MTN from a prefix, and it cannot default an unrecognised
 // number onto a network. An unsupported prefix comes back as the stable
 // PROVIDER_UNAVAILABLE code from the backend, which owns the mapping.
 const data = await initiateMobileMoney(
        { application_id: applicationId, phone: normalized },
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
      const msg = toError(error).message || 'Failed to initiate payment'
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
 isNonZeroServerAmount(totalAmount ?? baseAmount) &&
    !isPaymentSuccessful &&
    !isPaymentPending &&
    !inflight &&
    !pendingPaymentId

  // ── Success State ──
  if (isPaymentSuccessful) {
    return (
      <div className="space-y-4" data-testid="payment-form">
        <div className={`relative overflow-hidden rounded-lg border-2 border-green-500/30 bg-green-50 p-8 text-center ${animateClasses.scaleIn}`}>
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
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success text-success-foreground" style={{ animation: 'success-pop 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
            <CheckCircle className="h-8 w-8" />
          </div>
          <p className="text-xl font-bold text-green-700">Payment confirmed!</p>
          <p className="mt-1 text-lg font-semibold text-green-600">{chargedAmountLabel}</p>
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
    const isMobileMoneyPending = activePendingMethod !== 'card'// Task 8.3: whether this component instance is the one that started the
 // payment. When it is not (a refresh, or the payment page opened from the
 // dashboard) the method is not known locally, so nothing is claimed about a
 // handset prompt unless the server's phase says so.
 const startedHere = activePendingMethod !== null
 // Task 8.2 / STU-09: a pending payment is two situations, not one. When the
 // server told us the provider has issued the customer prompt, the student is
 // the one holding the queue and the steps below are actionable. When the
 // request is still with the provider, they are not — showing "enter your PIN"// for a prompt that never arrived, and offering a retry that could double-
 // charge, is the bug.
 const waiting =
 paymentPhase === 'action_required'|| paymentPhase === 'provider_processing'? PAYMENT_WAITING_STATES[paymentPhase]
 : null
 const studentMustAct = waiting ? waiting.studentActionable : startedHere && isMobileMoneyPending
 // Retry is offered only once the wait budget for *this* phase is spent.
 const retryAfterSeconds = waiting ? waiting.timeoutSeconds : 30
 // No phase and no local attempt: say only what is known — an attempt is open
 // and being checked. One sentence, shared with the payment page so the two
 // surfaces cannot describe the same wait differently.
 const recoveredWait = PAYMENT_RECOVERY_PRESENTATION.awaiting_provider
 return (
      <div className="space-y-4" data-testid="payment-form">
        <div
 className={`rounded-lg border border-primary/30 bg-primary/5 p-6 text-center ${animateClasses.scaleIn}`}
 data-testid="payment-pending-panel" data-payment-phase={paymentPhase ?? 'unknown'}
 >
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10" style={{ animation: 'pending-pulse 2s ease-in-out infinite' }}>
            {studentMustAct ? <Smartphone className="h-10 w-10 text-primary" /> : <CreditCard className="h-10 w-10 text-primary" />}
          </div>
          <p className="text-lg font-bold text-foreground">
 {waiting
 ? waiting.title
 : !startedHere
 ? recoveredWait.label
 : isMobileMoneyPending
 ? 'Check your phone' : 'Confirming your payment'}
 </p>
          <p className="mt-1 text-sm text-muted-foreground">
 {waiting ? (
 waiting.body
 ) : !startedHere ? (
 recoveredWait.detail
 ) : isMobileMoneyPending
              ? (
 <>Approve the payment of <span className="font-semibold text-foreground">{chargedAmountLabel}</span>{includesProviderFee ? '(includes the transaction fee)': ''}</>
 ) : (
 <>We are confirming your card payment of <span className="font-semibold text-foreground">{chargedAmountLabel}</span>.</>
 )}
          </p>

          {studentMustAct && (
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

          {pendingElapsed >= retryAfterSeconds && (
            <p className="mt-4 text-sm text-muted-foreground" data-testid="payment-pending-timeout">
 {waiting ? waiting.onTimeout : 'Taking too long?'}{' '}
 {studentMustAct && (
 <button type="button" className="font-medium text-primary underline" onClick={handleRetry}>
                Try again
              </button>
 )}
 </p>
          )}

          <Button type="button" variant="outline" size="sm" className="mt-4 min-h-touch" onClick={async () => { await syncPendingPayment() }}>
            <RefreshCw className="mr-1 h-3 w-3" />{studentMustAct ? "I've approved — check now" : 'Check payment now'}
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
            <WifiOff className="mx-auto mb-3 h-10 w-10 text-destructive" />
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
            <p className="mt-1 text-xs text-muted-foreground">Instant · No card needed</p>
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
            <p className="mt-1 text-xs text-muted-foreground">Secure card payment</p>
          </div>
        </button>
      </div>

      {/* Mobile Money Form */}
      {paymentMethod === 'mobile-money' && (
        <div className="space-y-4 rounded-lg border border-border bg-card/50 p-5">
          <div className="flex flex-wrap items-center gap-2" aria-label="Supported mobile money networks">
            <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
              Airtel Money
            </span>
            <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2.5 py-1 text-xs font-semibold text-yellow-700">
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
 setMomoPhone(formatPhone(raw))
                  setMomoError(null)
 }}
                placeholder="0977 123 456"
                className={`w-full h-12 pl-10 pr-4 rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all ${
                  phoneValidationError || momoError ? 'border-destructive' : 'border-border'}`}
              />
 </div>
            {(phoneValidationError || momoError) && (
              <p className="mt-1.5 text-xs text-destructive">{momoError || phoneValidationError}</p>
            )}
 {/* No client-side operator badge: the network is derived server-side
 (task 8.1, design §10.2). A prefix the platform does not support is
 answered by the backend, not guessed here. */}
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
            {momoLoading ? 'Sending payment request…' : `Pay ${chargedAmountLabel}`}
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
              <Button type="button" variant="outline" size="sm" className="mt-3 min-h-touch" onClick={retryWidgetLoad}>
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
            {cardPaymentStatus === 'initiating' ? 'Preparing…' : `Pay ${chargedAmountLabel} by card`}
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
