import { useCallback, useEffect, useRef, useState } from 'react'

import { apiClient } from '@/services/client'
import { useLencoWidget } from '@/hooks/useLencoWidget'
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
}

interface VerifyResponse {
  status: string
}

const PAYMENT_ERROR_STORAGE_PREFIX = 'mihas:payment-initiation-error:'
const PAYMENT_INITIATE_RETRY_DELAYS_MS = [500, 1_500]

function splitFullName(fullName?: string | null) {
  const nameParts = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  const firstName = nameParts[0] || ''
  const lastName = nameParts.slice(1).join(' ') || firstName

  return { firstName, lastName }
}

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
  } catch {
    // Storage failures should not block payment recovery UI.
  }
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
  const { openWidget, isLoading: widgetLoading, isScriptLoaded } = useLencoWidget()
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

  const startPayment = useCallback(async () => {
    if (initiatingRef.current || paymentStatusRef.current === 'initiating') {
      return
    }

    if (!applicationId) {
      setInitiateError('Please save your application before proceeding to payment.')
      return
    }

    if (isOffline()) {
      setInitiateError('You appear to be offline. Check your connection and retry payment.')
      return
    }

    if (!isScriptLoaded) {
      setInitiateError('Payment widget is still loading. Please wait a moment and try again.')
      return
    }

    initiatingRef.current = true
    setInitiateError(null)
    updatePaymentStatus('initiating')

    try {
      const data = await withPaymentInitiationRetry(() =>
        apiClient.request<InitiateResponse>(
          '/payments/initiate/',
          { method: 'POST', body: JSON.stringify({ application_id: applicationId }) },
        ),
      )

      if (!data) {
        throw new Error('No response from payment service')
      }

      const { payment_id, reference, amount, currency, lenco_public_key } = data
      const paymentAmount = Number.parseFloat(amount)
      if (!lenco_public_key || !Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        throw new Error('Payment service returned incomplete payment details')
      }

      const customer = getCustomerDetails()
      const { firstName, lastName } = splitFullName(customer.fullName)

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
          updatePaymentStatus('pending', 'Verifying payment...')
          initiatingRef.current = false

          try {
            const verifyPath = `/payments/${encodeURIComponent(payment_id)}/verify/`
            const result = await apiClient.request<VerifyResponse>(verifyPath, { method: 'POST' })
            const normalizedStatus = normalizePaymentStatusValue(result?.status)

            if (normalizedStatus === 'successful') {
              setInitiateError(null)
              updatePaymentStatus('successful', 'Payment confirmed.')
              onPaymentStatusChange?.('successful')
              await refreshStatus()
              return
            }

            if (normalizedStatus === 'failed') {
              updatePaymentStatus('failed', 'Payment could not be verified. You can retry.')
              onPaymentStatusChange?.('failed')
              await refreshStatus()
              return
            }

            updatePaymentStatus('pending', 'Payment is being confirmed. Stay on this page until confirmation finishes.')
            onPaymentStatusChange?.('pending')
            void refreshStatus()
          } catch {
            updatePaymentStatus('pending', 'Payment is being confirmed. Stay on this page until confirmation finishes.')
            onPaymentStatusChange?.('pending')
            void refreshStatus()
          }
        },
        onConfirmationPending: () => {
          initiatingRef.current = false
          updatePaymentStatus('pending', 'Payment is being confirmed. Stay on this page until confirmation finishes.')
          onPaymentStatusChange?.('pending')
          void refreshStatus()
        },
        onClose: () => {
          initiatingRef.current = false
          const latestStatus = paymentStatusRef.current
          if (latestStatus !== 'successful' && latestStatus !== 'pending') {
            updatePaymentStatus('idle', 'Payment not completed. You can retry when ready.')
          }
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initiate payment'
      setInitiateError(message)
      updatePaymentStatus('idle')
      initiatingRef.current = false
    }
  }, [
    applicationId,
    getCustomerDetails,
    isScriptLoaded,
    onPaymentStatusChange,
    openWidget,
    refreshStatus,
    setInitiateError,
    updatePaymentStatus,
  ])

  return {
    paymentStatus,
    statusMessage,
    initiateError,
    widgetLoading,
    isScriptLoaded,
    startPayment,
    updatePaymentStatus,
    setInitiateError,
  }
}
