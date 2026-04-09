import { QueryClient } from '@tanstack/react-query'
import { cacheMonitor } from '@/services/cacheMonitor'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
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

if (import.meta.env.PROD) {
  cacheMonitor.initialize(queryClient)
}
