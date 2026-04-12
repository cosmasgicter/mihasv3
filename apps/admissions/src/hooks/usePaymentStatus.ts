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

export const INITIAL_INTERVAL = 2_000
export const BACKOFF_FACTOR = 1.5
export const MAX_INTERVAL = 30_000

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Polls the backend for the latest payment status of an application.
 *
 * Uses exponential backoff: starts at 2 s, multiplies by 1.5 each poll,
 * caps at 30 s. Polling stops on `'successful'` or `'failed'`. A manual
 * `refetch()` resets the interval back to 2 s.
 */
export function usePaymentStatus(applicationId: string) {
  const [status, setStatus] = useState<PaymentStatusValue>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef(INITIAL_INTERVAL)
  const statusRef = useRef<PaymentStatusValue>(null)

  // Keep statusRef in sync so the scheduling closure always sees the latest value
  useEffect(() => {
    statusRef.current = status
  }, [status])

  const fetchStatus = useCallback(async () => {
    if (!applicationId) return

    try {
      const data = await apiClient.request<PaymentListResponse | PaymentRecord[]>(
        `/payments/?application_id=${encodeURIComponent(applicationId)}`,
        { skipCache: true }
      )

      if (!data) return

      // The response may be a paginated envelope or a plain array
      const records: PaymentRecord[] = Array.isArray(data)
        ? data
        : (data as PaymentListResponse).results ?? []

      if (records.length === 0) {
        setStatus(null)
        return
      }

      // Pick the most recent payment (backend sorts by created_at desc)
      const latest = records[0]
      const normalized = latest?.status?.toLowerCase() as PaymentStatusValue
      if (normalized === 'successful' || normalized === 'failed' || normalized === 'pending') {
        setStatus(normalized)
      }
    } catch {
      // Swallow — polling is best-effort
    }
  }, [applicationId])

  const clearPending = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const scheduleNext = useCallback(() => {
    // Stop polling on terminal statuses
    if (statusRef.current === 'successful' || statusRef.current === 'failed') return

    timeoutRef.current = setTimeout(async () => {
      await fetchStatus()
      // Grow the interval with backoff, capped at MAX_INTERVAL
      intervalRef.current = Math.min(intervalRef.current * BACKOFF_FACTOR, MAX_INTERVAL)
      scheduleNext()
    }, intervalRef.current)
  }, [fetchStatus])

  const refetch = useCallback(() => {
    // Reset backoff to initial interval on manual refetch
    intervalRef.current = INITIAL_INTERVAL
    clearPending()
    return fetchStatus().then(() => {
      scheduleNext()
    })
  }, [fetchStatus, clearPending, scheduleNext])

  // Start / stop polling based on applicationId and status
  useEffect(() => {
    if (!applicationId) return

    // Initial fetch, then start the backoff chain
    fetchStatus().then(() => {
      scheduleNext()
    })

    return () => {
      clearPending()
    }
  }, [applicationId])

  // Stop polling when status becomes terminal
  useEffect(() => {
    if (status === 'successful' || status === 'failed') {
      clearPending()
    }
  }, [status, clearPending])

  return { status, refetch }
}
