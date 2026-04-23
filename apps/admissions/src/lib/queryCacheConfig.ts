/**
 * Centralized React Query cache configuration
 * Defines cache profiles for different query types
 */

/**
 * 429-aware retry: never retry rate-limited responses.
 * For other errors, retry up to `maxRetries` times.
 */
function retryExcept429(maxRetries: number) {
  return (failureCount: number, error: unknown): boolean => {
    const status = (error as { status?: number })?.status
    if (status === 429) return false
    return failureCount < maxRetries
  }
}

export const QUERY_CACHE_CONFIG = {
  /** Dashboard stats, application lists — moderate freshness */
  critical: {
    staleTime: 30_000,        // 30 seconds
    gcTime: 5 * 60_000,       // 5 minutes
    refetchOnWindowFocus: true,
    retry: retryExcept429(2),
  },
  /** Catalog data (programs, intakes, subjects) — rarely changes */
  static: {
    staleTime: 10 * 60_000,   // 10 minutes
    gcTime: 30 * 60_000,      // 30 minutes
    refetchOnWindowFocus: false,
    retry: retryExcept429(1),
  },
  /** Polling queries — controlled interval */
  polling: {
    staleTime: 30_000,        // 30 seconds
    refetchInterval: 60_000,  // 1 minute minimum
    refetchOnWindowFocus: false,
  },
} as const

export type CacheProfile = keyof typeof QUERY_CACHE_CONFIG
