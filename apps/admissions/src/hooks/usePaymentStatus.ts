import { useCallback, useEffect, useRef, useState } from 'react'

import { apiClient } from '@/services/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaymentStatusValue = 'pending' | 'successful' | 'failed' | null

interface PaymentRecord {
  status: string
  [key: string]: unknown
}

interface PaymentListResponse {
  results?: PaymentRecord[]
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Constants (exported for testing)
// ---------------------------------------------------------------------------

export const INITIAL_INTERVAL = 5_000
export const BACKOFF_FACTOR = 1.5
export const MAX_INTERVAL = 60_000
export const MAX_POLL_COUNT = 30

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function normalizePaymentStatusValue(status?: string | null): PaymentStatusValue {
  switch (status?.toLowerCase()) {
    case 'pending':
    case 'pending_review':
      return 'pending'
    case 'successful':
    case 'verified':
    case 'paid':
    case 'force_approved':
      return 'successful'
    case 'failed':
    case 'rejected':
      return 'failed'
    default:
      return null
  }
}

/**
 * Polls the backend for the latest payment status of an application.
 *
 * Uses exponential backoff: starts at 2 s, multiplies by 1.5 each poll,
 * caps at 30 s. Polling stops on `'successful'` or `'failed'`. A manual
 * `refetch()` resets the interval back to 2 s.
 */
export function usePaymentStatus(applicationId: string, applicationPaymentStatus?: string | null) {
  const [status, setStatus] = useState<PaymentStatusValue>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef(INITIAL_INTERVAL)
  const statusRef = useRef<PaymentStatusValue>(null)
  const pollCountRef = useRef(0)
  const mountedRef = useRef(true)
  const failCountRef = useRef(0)

  useEffect(() => () => { mountedRef.current = false }, [])

  const updateStatus = useCallback((nextStatus: PaymentStatusValue) => {
    if (!mountedRef.current) return
    statusRef.current = nextStatus
    setStatus(nextStatus)
  }, [])

  useEffect(() => {
    const normalized = normalizePaymentStatusValue(applicationPaymentStatus)
    if (normalized === 'successful') {
      updateStatus('successful')
    }
  }, [applicationPaymentStatus, updateStatus])

  // Keep statusRef in sync so the scheduling closure always sees the latest value
  useEffect(() => {
    statusRef.current = status
  }, [status])

  const fetchStatus = useCallback(async () => {
    if (!applicationId) return

    try {
      const data = await apiClient.request<PaymentListResponse | PaymentRecord[]>(
        `/payments/?application_id=${encodeURIComponent(applicationId)}`
      )

      if (!data) return

      const applicationStatus = normalizePaymentStatusValue(applicationPaymentStatus)
      if (applicationStatus === 'successful') {
        updateStatus('successful')
        return
      }

      // The response may be a paginated envelope or a plain array
      const records: PaymentRecord[] = Array.isArray(data)
        ? data
        : (data as PaymentListResponse).results ?? []

      if (records.length === 0) {
        updateStatus(applicationStatus)
        return
      }

      // Pick the most recent payment (backend sorts by created_at desc)
      const latest = records[0]
      const normalized = normalizePaymentStatusValue(latest?.status)
      if (normalized) {
        updateStatus(normalized)
      }
      failCountRef.current = 0
    } catch {
      failCountRef.current += 1
    }
  }, [applicationId, applicationPaymentStatus, updateStatus])

  const clearPending = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const scheduleNext = useCallback(() => {
    // Stop polling on terminal statuses or after max attempts
    if (statusRef.current === 'successful' || statusRef.current === 'failed') return
    if (pollCountRef.current >= MAX_POLL_COUNT) return
    if (failCountRef.current >= 5) return  // Stop polling after 5 consecutive failures

    timeoutRef.current = setTimeout(async () => {
      if (!mountedRef.current) return
      pollCountRef.current += 1
      await fetchStatus()
      if (!mountedRef.current) return
      // Grow the interval with backoff, capped at MAX_INTERVAL
      intervalRef.current = Math.min(intervalRef.current * BACKOFF_FACTOR, MAX_INTERVAL)
      scheduleNext()
    }, intervalRef.current)
  }, [fetchStatus])

  const refetch = useCallback(() => {
    // Reset backoff and poll count on manual refetch
    intervalRef.current = INITIAL_INTERVAL
    pollCountRef.current = 0
    clearPending()
    return fetchStatus().then(() => {
      scheduleNext()
    })
  }, [fetchStatus, clearPending, scheduleNext])

  // Start / stop polling based on applicationId and status
  useEffect(() => {
    if (!applicationId) return

    clearPending()
    intervalRef.current = INITIAL_INTERVAL
    pollCountRef.current = 0

    // Initial fetch, then start the backoff chain
    fetchStatus().then(() => {
      scheduleNext()
    })

    return () => {
      clearPending()
    }
  }, [applicationId, clearPending, fetchStatus, scheduleNext])

  // Stop polling when status becomes terminal
  useEffect(() => {
    if (status === 'successful' || status === 'failed') {
      clearPending()
    }
  }, [status, clearPending])

  return { status, refetch, setStatus: updateStatus }
}
