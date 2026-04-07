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
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 10_000 // 10 seconds

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Polls the backend for the latest payment status of an application.
 *
 * Polling is active only while the status is `'pending'`. Once the status
 * resolves to `'successful'` or `'failed'`, polling stops automatically.
 */
export function usePaymentStatus(applicationId: string) {
  const [status, setStatus] = useState<PaymentStatusValue>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!applicationId) return

    try {
      const data = await apiClient.request<PaymentListResponse | PaymentRecord[]>(
        `/payments/?application_id=${encodeURIComponent(applicationId)}`
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

      // Pick the most recent payment (last in list, or first — backend sorts by created_at desc)
      const latest = records[0]
      const normalized = latest?.status?.toLowerCase() as PaymentStatusValue
      if (normalized === 'successful' || normalized === 'failed' || normalized === 'pending') {
        setStatus(normalized)
      }
    } catch {
      // Swallow — polling is best-effort
    }
  }, [applicationId])

  // Start / stop polling based on current status
  useEffect(() => {
    if (!applicationId) return

    // Initial fetch
    fetchStatus()

    // Only poll while status is pending (or unknown / null)
    if (status === 'successful' || status === 'failed') {
      return
    }

    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [applicationId, status, fetchStatus])

  return { status, refetch: fetchStatus }
}
