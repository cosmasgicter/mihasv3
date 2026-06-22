import { useCallback, useEffect, useRef, useState } from 'react'

import { normalizePaymentStatus } from '@/lib/paymentStatus'
import { apiClient } from '@/services/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaymentStatusValue = 'pending' | 'successful' | 'failed' | 'deferred' | null

interface PaymentRecord {
  id?: string
  status: string
  created_at?: string
  [key: string]: unknown
}

interface PaymentListResponse {
  data?: PaymentRecord[] | { results?: PaymentRecord[] }
  results?: PaymentRecord[]
  payments?: PaymentRecord[]
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Constants (exported for testing)
// ---------------------------------------------------------------------------

export const INITIAL_INTERVAL = 5_000
export const BACKOFF_FACTOR = 1.5
export const MAX_INTERVAL = 60_000
export const MAX_POLL_COUNT = 30

/** Polling-exceeded-timeout threshold (R14.3). Default 120s. */
export const POLL_TIMEOUT_MS =
  typeof import.meta !== 'undefined' &&
  import.meta.env?.VITE_PAYMENT_POLL_TIMEOUT_MS
    ? Number(import.meta.env.VITE_PAYMENT_POLL_TIMEOUT_MS) || 120_000
    : 120_000

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function normalizePaymentStatusValue(status?: string | null): PaymentStatusValue {
  switch (normalizePaymentStatus(status)) {
    case 'pending_review':
      return 'pending'
    case 'verified':
      return 'successful'
    case 'deferred':
      return 'deferred'
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
  const [pollingExceededTimeout, setPollingExceededTimeout] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef(INITIAL_INTERVAL)
  const statusRef = useRef<PaymentStatusValue>(null)
  const pollCountRef = useRef(0)
  const mountedRef = useRef(true)
  const failCountRef = useRef(0)
  const requestIdRef = useRef(0)
  const inFlightRef = useRef(false)
  const startedAtRef = useRef<number | null>(null)

  useEffect(() => () => { mountedRef.current = false }, [])

  const updateStatus = useCallback((nextStatus: PaymentStatusValue) => {
    if (!mountedRef.current) return
    statusRef.current = nextStatus
    setStatus(nextStatus)
  }, [])

  useEffect(() => {
    const normalized = normalizePaymentStatusValue(applicationPaymentStatus)
    if (normalized === 'successful' || normalized === 'deferred') {
      updateStatus(normalized)
    }
  }, [applicationPaymentStatus, updateStatus])

  // Keep statusRef in sync so the scheduling closure always sees the latest value
  useEffect(() => {
    statusRef.current = status
  }, [status])

  const normalizeRecords = useCallback((payload: PaymentListResponse | PaymentRecord[] | null | undefined): PaymentRecord[] => {
    if (Array.isArray(payload)) return payload
    if (!payload || typeof payload !== 'object') return []
    if (Array.isArray(payload.results)) return payload.results
    if (Array.isArray(payload.payments)) return payload.payments
    if (Array.isArray(payload.data)) return payload.data
    if (payload.data && typeof payload.data === 'object' && Array.isArray(payload.data.results)) return payload.data.results
    return []
  }, [])

  const fetchStatus = useCallback(async () => {
    if (!applicationId || inFlightRef.current) return
    inFlightRef.current = true
    const requestId = ++requestIdRef.current

    try {
      const data = await apiClient.request<PaymentListResponse | PaymentRecord[]>(
        `/payments/?application_id=${encodeURIComponent(applicationId)}`
      )

      if (!mountedRef.current || requestId !== requestIdRef.current) return
      if (!data) return

      const applicationStatus = normalizePaymentStatusValue(applicationPaymentStatus)
      if (applicationStatus === 'successful') {
        updateStatus('successful')
        return
      }

      const records = normalizeRecords(data).sort((left, right) => {
        const leftTime = typeof left.created_at === 'string' ? new Date(left.created_at).getTime() : 0
        const rightTime = typeof right.created_at === 'string' ? new Date(right.created_at).getTime() : 0
        return rightTime - leftTime
      })

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
      if (mountedRef.current) {
        setLastUpdated(Date.now())
      }
    } catch {
      failCountRef.current += 1
    } finally {
      inFlightRef.current = false
    }
  }, [applicationId, applicationPaymentStatus, normalizeRecords, updateStatus])

  const clearPending = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const scheduleNext = useCallback(() => {
    // Stop polling on terminal statuses or after max attempts
    if (statusRef.current === 'successful' || statusRef.current === 'failed' || statusRef.current === 'deferred') return
    if (pollCountRef.current >= MAX_POLL_COUNT) return
    if (failCountRef.current >= 5) return  // Stop polling after 5 consecutive failures

    // R14.3 — when polling has exceeded POLL_TIMEOUT_MS on a pending row,
    // flip `pollingExceededTimeout` to true and stop background polling.
    // Never transition `status` to `failed`.
    if (
      statusRef.current === 'pending' &&
      startedAtRef.current !== null &&
      Date.now() - startedAtRef.current > POLL_TIMEOUT_MS
    ) {
      if (mountedRef.current) {
        setPollingExceededTimeout(true)
      }
      return
    }

    timeoutRef.current = setTimeout(async () => {
      if (!mountedRef.current) return
      // Terminal-status guard: stop if status resolved between schedule and fire
      if (statusRef.current === 'successful' || statusRef.current === 'failed' || statusRef.current === 'deferred') return
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
    // Clear the polling-timeout flag; the user explicitly asked for a re-check.
    if (mountedRef.current) {
      setPollingExceededTimeout(false)
    }
    startedAtRef.current = Date.now()
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
    startedAtRef.current = Date.now()
    setPollingExceededTimeout(false)

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
    if (status === 'successful' || status === 'failed' || status === 'deferred') {
      clearPending()
    }
  }, [status, clearPending])

  return {
    status,
    refetch,
    setStatus: updateStatus,
    pollingExceededTimeout,
    lastUpdated,
  }
}
