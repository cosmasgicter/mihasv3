import { useCallback, useEffect, useRef, useState } from 'react'

import { useLencoWidget } from '@/hooks/useLencoWidget'
import { normalizePaymentStatusValue } from '@/hooks/usePaymentStatus'
import { generateIdempotencyKey } from '@/lib/paymentStatus'
import { initiatePayment, verifyPayment } from '@/services/payments'
import { usePaymentRecoveryStore } from '@/stores/paymentRecoveryStore'
import { toError } from '@/lib/toError'
import { BROWSER_KEYS, LEGACY_BROWSER_KEYS, getStorageItemWithLegacyFallback } from '@/lib/browserNamespace'

export type PaymentActionStatus = 'idle' | 'initiating' | 'pending' | 'successful' | 'failed'

export interface PaymentCustomerDetails {
  fullName?: string | null
  email?: string | null
  phone?: string | null
}

interface UseApplicationPaymentActionOptions {
  applicationId: string | null
  getCustomerDetails: () => PaymentCustomerDetails
  onPaymentStatusChange?: (status: 'pending' | 'successful' | 'failed' | null) => void
  onPaymentStatusRefresh?: () => Promise<void> | void
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

const PAYMENT_ERROR_STORAGE_PREFIX = BROWSER_KEYS.paymentErrorPrefix
const LEGACY_PAYMENT_ERROR_STORAGE_PREFIX = LEGACY_BROWSER_KEYS.paymentErrorPrefix
const PAYMENT_INITIATE_RETRY_DELAYS_MS = [500, 1_500]

function splitFullName(fullName?: string | null) {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || parts[0] || '' }
}

function paymentErrorStorageKey(applicationId: string | null) {
  return applicationId ? `${PAYMENT_ERROR_STORAGE_PREFIX}${applicationId}` : null
}

function readPersistedPaymentError(applicationId: string | null) {
  const key = paymentErrorStorageKey(applicationId)
  if (!key || typeof window === 'undefined') return null
  try {
    const legacyKey = applicationId ? `${LEGACY_PAYMENT_ERROR_STORAGE_PREFIX}${applicationId}` : null
    return getStorageItemWithLegacyFallback(window.sessionStorage, key, legacyKey ? [legacyKey] : [])
  } catch { return null }
}

function persistPaymentError(applicationId: string | null, message: string | null) {
  const key = paymentErrorStorageKey(applicationId)
  if (!key || typeof window === 'undefined') return
  try {
    if (message) window.sessionStorage.setItem(key, message)
    else window.sessionStorage.removeItem(key)
    if (applicationId) {
      window.sessionStorage.removeItem(`${LEGACY_PAYMENT_ERROR_STORAGE_PREFIX}${applicationId}`)
    }
  } catch {}
}

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function isRetryableError(error: unknown) {
  if (isOffline()) return false
  if (error instanceof TypeError) return true
  if (!(error instanceof Error)) return false
  const m = error.message.toLowerCase()
  return m.includes('network') || m.includes('failed to fetch') || m.includes('timeout') ||
    m.includes('temporarily unavailable') || m.includes('internal server error') ||
    m.includes('bad gateway') || m.includes('service unavailable') || m.includes('gateway timeout')
}

async function withRetry<T>(op: () => Promise<T>): Promise<T> {
  let last: unknown
  for (let i = 0; i <= PAYMENT_INITIATE_RETRY_DELAYS_MS.length; i++) {
    try { return await op() } catch (e) {
      last = e
      if (i >= PAYMENT_INITIATE_RETRY_DELAYS_MS.length || !isRetryableError(e)) throw e
      await new Promise(r => setTimeout(r, PAYMENT_INITIATE_RETRY_DELAYS_MS[i]))
    }
  }
  throw last
}

export function useApplicationPaymentAction({
  applicationId,
  getCustomerDetails,
  onPaymentStatusChange,
  onPaymentStatusRefresh,
}: UseApplicationPaymentActionOptions) {
  const {
    openWidget,
    isLoading: widgetLoading,
    isScriptLoaded,
    loadError: widgetLoadError,
    retryLoad: retryWidgetLoad,
  } = useLencoWidget()

  const [paymentStatus, setPaymentStatus] = useState<PaymentActionStatus>('idle')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [initiateError, setInitiateErrorState] = useState<string | null>(() => readPersistedPaymentError(applicationId))
  const paymentStatusRef = useRef<PaymentActionStatus>('idle')
  const initiatingRef = useRef(false)
  const mountedRef = useRef(true)
  const paymentAttemptRef = useRef(0)
  const paymentRecoveryStore = usePaymentRecoveryStore()

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => { setInitiateErrorState(readPersistedPaymentError(applicationId)) }, [applicationId])

  const setInitiateError = useCallback((msg: string | null) => {
    if (mountedRef.current) {
      setInitiateErrorState(msg)
    }
    persistPaymentError(applicationId, msg)
  }, [applicationId])

  const updatePaymentStatus = useCallback((status: PaymentActionStatus, message: string | null = null) => {
    paymentStatusRef.current = status
    if (!mountedRef.current) return
    setPaymentStatus(status)
    setStatusMessage(message)
  }, [])

  const refreshStatus = useCallback(async () => { await onPaymentStatusRefresh?.() }, [onPaymentStatusRefresh])

  const startPayment = useCallback(async () => {
    if (initiatingRef.current || paymentStatusRef.current === 'initiating') return
    if (!applicationId) { setInitiateError('Please save your application before proceeding to payment.'); return }
    if (isOffline()) { setInitiateError('You appear to be offline. Check your connection and retry.'); return }
    if (!isScriptLoaded) { setInitiateError('Payment widget is still loading. Please wait and try again.'); return }

    initiatingRef.current = true
    const attemptId = ++paymentAttemptRef.current
    setInitiateError(null)
    updatePaymentStatus('initiating')

    try {
      const data = await withRetry(() =>
        initiatePayment(
          { application_id: applicationId },
          { idempotencyKey: generateIdempotencyKey(applicationId) },
        ) as Promise<InitiateResponse>,
      )

      if (!data) throw new Error('No response from payment service')

      const { payment_id, reference, amount, currency, lenco_public_key } = data
      const paymentAmount = Number.parseFloat(amount)
      if (!lenco_public_key || !Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        throw new Error('Payment service returned incomplete details')
      }

      paymentRecoveryStore.record({
        application_id: applicationId,
        payment_id,
        reference,
        method: 'card',
        initiated_at: Date.now(),
      })

      const customer = getCustomerDetails()
      const { firstName, lastName } = splitFullName(customer.fullName)

      // Set global flag to suppress session revalidation while widget is open

      openWidget({
        publicKey: lenco_public_key,
        reference,
        amount: paymentAmount,
        currency,
        customerEmail: customer.email ?? '',
        customerFirstName: firstName,
        customerLastName: lastName,
        customerPhone: customer.phone || undefined,
        onSuccess: async () => {
          if (!mountedRef.current || attemptId !== paymentAttemptRef.current) return
          updatePaymentStatus('pending', 'Verifying payment…')
          initiatingRef.current = false
          try {
            const result = await verifyPayment(payment_id) as VerifyResponse
            if (!mountedRef.current || attemptId !== paymentAttemptRef.current) return
            const s = normalizePaymentStatusValue(result?.status)
            if (s === 'successful') {
              paymentRecoveryStore.clear(applicationId)
              setInitiateError(null)
              updatePaymentStatus('successful', 'Payment confirmed.')
              onPaymentStatusChange?.('successful')
              await refreshStatus()
            } else if (s === 'failed') {
              paymentRecoveryStore.clear(applicationId)
              updatePaymentStatus('failed', 'Payment could not be verified. You can retry.')
              onPaymentStatusChange?.('failed')
              await refreshStatus()
            } else {
              updatePaymentStatus('pending', 'Payment is being confirmed. Stay on this page.')
              onPaymentStatusChange?.('pending')
              void refreshStatus()
            }
          } catch {
            if (!mountedRef.current || attemptId !== paymentAttemptRef.current) return
            updatePaymentStatus('pending', 'Payment is being confirmed. Stay on this page.')
            onPaymentStatusChange?.('pending')
            void refreshStatus()
          }
        },
        onConfirmationPending: () => {
          if (!mountedRef.current || attemptId !== paymentAttemptRef.current) return
          initiatingRef.current = false
          updatePaymentStatus('pending', 'Payment is being confirmed. Stay on this page.')
          onPaymentStatusChange?.('pending')
          void refreshStatus()
        },
        onClose: () => {
          if (!mountedRef.current || attemptId !== paymentAttemptRef.current) return
          initiatingRef.current = false
          if (paymentStatusRef.current !== 'successful' && paymentStatusRef.current !== 'pending') {
            updatePaymentStatus('idle', 'Payment not completed. You can retry when ready.')
          }
        },
      })
    } catch (error) {
      setInitiateError(toError(error).message || 'Failed to initiate payment')
      updatePaymentStatus('idle')
      initiatingRef.current = false
    }
  }, [applicationId, getCustomerDetails, isScriptLoaded, onPaymentStatusChange, openWidget, refreshStatus, setInitiateError, updatePaymentStatus])

  return {
    paymentStatus,
    statusMessage,
    initiateError,
    widgetLoading,
    isScriptLoaded,
    widgetLoadError,
    retryWidgetLoad,
    startPayment,
    updatePaymentStatus,
    setInitiateError,
  }
}
