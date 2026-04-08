/**
 * PageLoadingFallback Component
 * 
 * Lightweight skeleton fallback for Suspense boundaries during route transitions.
 * 
 * @requirements 5.1, 5.2 - Fast page loading
 */

import { Skeleton } from './skeleton'

export interface PageLoadingFallbackProps {
  /** Optional message to display */
  message?: string
}

/**
 * Minimal loading fallback for lazy-loaded pages
 * 
 * @example
 * ```tsx
 * <Suspense fallback={<PageLoadingFallback />}>
 *   <LazyPage />
 * </Suspense>
 * ```
 */
export function PageLoadingFallback({ message }: PageLoadingFallbackProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-4 px-4 text-center" role="status" aria-label="Loading page">
        <Skeleton className="mx-auto h-10 w-10 rounded-full" />
        <Skeleton className="mx-auto h-6 w-2/3" />
        <Skeleton className="mx-auto h-4 w-1/2" />
        {message && (
          <p className="mt-3 text-sm text-muted-foreground">{message}</p>
        )}
      </div>
    </div>
  )
}

/**
 * Compact loading fallback for smaller sections
 */
export function CompactLoadingFallback() {
  return (
    <div className="flex items-center justify-center p-8">
      <Skeleton className="h-6 w-24" role="status" aria-label="Loading" />
    </div>
  )
}

export default PageLoadingFallback
