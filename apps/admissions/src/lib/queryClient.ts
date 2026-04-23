import { QueryClient } from '@tanstack/react-query'

/**
 * Never retry on 429 (Too Many Requests) — retrying immediately makes
 * the rate-limit storm worse. For other errors, fall back to the
 * per-query `retry` count.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = (error as { status?: number })?.status
  if (status === 429) return false
  // Default: retry once (failureCount starts at 0 after first failure)
  return failureCount < 1
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: true,
      refetchInterval: false,
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      networkMode: 'online',
    },
  },
})
