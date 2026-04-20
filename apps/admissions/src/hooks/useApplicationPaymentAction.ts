import { useCallback, useEffect, useRef, useState } from 'react'

import { apiClient } from '@/services/client'
import { normalizePaymentStatusValue } from '@/hooks/usePaymentStatus'

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
  payment_url: string
}

interface VerifyResponse {
  status: string
}

const PAYMENT_ERROR_STORAGE_PREFIX = 'mihas:payment-initiation-error:'
const PAYMENT_ID_STORAGE_KEY = 'mihas:pending-payment-id'
const PAYMENT_INITIATE_RETRY_DELAYS_MS = [500, 1_500]

function paymentErrorStorageKey(applicationId: string | null) {
  return applicationId ? `${PAYMENT_ERROR_STORAGE_PREFIX}${applicationId}` : null
}

function readPersistedPaymentError(applicationId: string | null) {
  const key = paymentErrorStorageKey(applicationId)
  if (!key || typeof window === 'undefined') return null
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function persistPaymentError(applicationId: string | null, message: string | null) {
  const key = paymentErrorStorageKey(applicationId)
  if (!key || typeof window === 'undefined') return
  try {
    if (message) {
      window.sessionStorage.setItem(key, message)
    } else {
      window.sessionStorage.removeItem(key)
    }
  } catch {}
}

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function isRetryablePaymentInitiationError(error: unknown) {
  if (isOffline()) return false
  if (error instanceof TypeError) return true
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('timeout') ||
    message.includes('temporarily unavailable') ||
    message.includes('api error: internal server error') ||
    message.includes('api error: bad gateway') ||
    message.includes('api error: service unavailable') ||
    message.includes('api error: gateway timeout')
  )
}

async function withPaymentInitiationRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= PAYMENT_INITIATE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt >= PAYMENT_INITIATE_RETRY_DELAYS_MS.length || !isRetryablePaymentInitiationError(error)) {
        throw error
      }
      await new Promise((resolve) => window.setTimeout(resolve, PAYMENT_INITIATE_RETRY_DELAYS_MS[attempt]))
    }
  }
  throw lastError
}

export function useApplicationPaymentAction({
  applicationId,
  getCustomerDetails,
  onPaymentStatusChange,
  onPaymentStatusRefresh,
}: UseApplicationPaymentActionOptions) {
  const [paymentStatus, setPaymentStatus] = useState<PaymentActionStatus>('idle')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [initiateError, setInitiateErrorState] = useState<string | null>(() => readPersistedPaymentError(applicationId))
  const paymentStatusRef = useRef<PaymentActionStatus>('idle')
  const initiatingRef = useRef(false)

  useEffect(() => {
    setInitiateErrorState(readPersistedPaymentError(applicationId))
  }, [applicationId])

  const setInitiateError = useCallback((message: string | null) => {
    setInitiateErrorState(message)
    persistPaymentError(applicationId, message)
  }, [applicationId])

  const updatePaymentStatus = useCallback((status: PaymentActionStatus, message: string | null = null) => {
    paymentStatusRef.current = status
    setPaymentStatus(status)
    setStatusMessage(message)
  }, [])

  const refreshStatus = useCallback(async () => {
    await onPaymentStatusRefresh?.()
  }, [onPaymentStatusRefresh])

  // Check if returning from payment tab
  useEffect(() => {
    const handleFocus = async () => {
      if (paymentStatusRef.current !== 'pending') return
      const paymentId = localStorage.getItem(PAYMENT_ID_STORAGE_KEY)
      if (!paymentId) return

      try {
        const verifyPath = `/payments/${encodeURIComponent(paymentId)}/verify/`
        const result = await apiClient.request<VerifyResponse>(verifyPath, { method: 'POST' })
        const normalizedStatus = normalizePaymentStatusValue(result?.status)

        if (normalizedStatus === 'successful') {
          localStorage.removeItem(PAYMENT_ID_STORAGE_KEY)
          setInitiateError(null)
          updatePaymentStatus('successful', 'Payment confirmed.')
          onPaymentStatusChange?.('successful')
          await refreshStatus()
        } else if (normalizedStatus === 'failed') {
          localStorage.removeItem(PAYMENT_ID_STORAGE_KEY)
          updatePaymentStatus('failed', 'Payment could not be verified. You can retry.')
          onPaymentStatusChange?.('failed')
          await refreshStatus()
        }
        // If still pending, keep polling
      } catch {
        // Silently retry on next focus
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [onPaymentStatusChange, refreshStatus, setInitiateError, updatePaymentStatus])

  const startPayment = useCallback(async () => {
    if (initiatingRef.current || paymentStatusRef.current === 'initiating') return

    if (!applicationId) {
      setInitiateError('Please save your application before proceeding to payment.')
      return
    }

    if (isOffline()) {
      setInitiateError('You appear to be offline. Check your connection and retry payment.')
      return
    }

    initiatingRef.current = true
    setInitiateError(null)
    updatePaymentStatus('initiating')

    try {
      const customer = getCustomerDetails()
      const data = await withPaymentInitiationRetry(() =>
        apiClient.request<InitiateResponse>(
          '/payments/initiate/',
          {
            method: 'POST',
            body: JSON.stringify({
              application_id: applicationId,
              customer_email: customer.email || '',
              customer_name: customer.fullName || '',
              customer_phone: customer.phone || '',
            }),
          },
        ),
      )

      if (!data) throw new Error('No response from payment service')

      const { payment_id, payment_url } = data

      if (!payment_url) throw new Error('Payment service did not return a payment URL')

      // Store payment_id so we can verify when user returns
      localStorage.setItem(PAYMENT_ID_STORAGE_KEY, payment_id)

      // Open payment in new tab
      const paymentTab = window.open(payment_url, '_blank')
      if (!paymentTab) {
        // Popup blocked — fall back to same-window redirect
        setInitiateError(null)
        updatePaymentStatus('pending', 'Payment page could not open in a new tab. Click the link below to pay.')
        setStatusMessage(payment_url) // Store URL for manual link
        onPaymentStatusChange?.('pending')
        initiatingRef.current = false
        return
      }

      updatePaymentStatus('pending', 'Payment opened in a new tab. Complete payment there, then return here.')
      onPaymentStatusChange?.('pending')
      initiatingRef.current = false
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initiate payment'
      setInitiateError(message)
      updatePaymentStatus('idle')
      initiatingRef.current = false
    }
  }, [applicationId, getCustomerDetails, onPaymentStatusChange, setInitiateError, updatePaymentStatus])

  return {
    paymentStatus,
    statusMessage,
    initiateError,
    startPayment,
    updatePaymentStatus,
    setInitiateError,
  }
}
