import { useCallback, useEffect, useState } from 'react'

import { apiClient, buildQueryString } from '@/services/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedFee {
  amount: number
  currency: string
  residency_category?: string
  source?: string
}

interface FeeResolveResponse {
  amount: string
  currency: string
  residency_category: string
  source: string
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Resolves the application fee for a given program and student residency.
 *
 * Calls `GET /api/v1/payments/resolve-fee/` whenever `programCode`,
 * `nationality`, or `country` changes.
 */
export function useFeeResolver(
  programCode: string,
  nationality?: string,
  country?: string
) {
  const [fee, setFee] = useState<ResolvedFee | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolveCount, setResolveCount] = useState(0)

  useEffect(() => {
    // Nothing to resolve without a program
    if (!programCode) {
      setFee(null)
      setError(null)
      return
    }

    let cancelled = false
    let retryTimeout: ReturnType<typeof setTimeout> | undefined

    const resolve = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const params: Record<string, string> = { program_code: programCode }
        if (nationality) params.nationality = nationality
        if (country) params.country = country

        const data = await apiClient.request<FeeResolveResponse>(
          `/payments/resolve-fee/${buildQueryString(params)}`
        )

        if (cancelled) return

        if (data) {
          setFee({
            amount: parseFloat(data.amount),
            currency: data.currency,
            residency_category: data.residency_category,
            source: data.source,
          })
        } else {
          setFee(null)
          setError('Unable to determine fee')
        }
      } catch (err) {
        if (cancelled) return
        const message =
          err instanceof Error ? err.message : 'Unable to determine fee'
        setError(message)
        setFee(null)

        // Single automatic retry after 2 seconds
        retryTimeout = setTimeout(() => {
          if (!cancelled) setResolveCount(c => c + 1)
        }, 2000)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    resolve()

    return () => {
      cancelled = true
      if (retryTimeout) clearTimeout(retryTimeout)
    }
  }, [programCode, nationality, country, resolveCount])

  const retry = useCallback(() => setResolveCount(c => c + 1), [])

  return { fee, isLoading, error, retry }
}
