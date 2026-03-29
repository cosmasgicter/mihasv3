/**
 * PageLoadingFallback Component
 * 
 * Lightweight loading indicator for Suspense boundaries during route transitions.
 * Uses CSS-only animations and minimal DOM for fast rendering.
 * 
 * @requirements 5.1, 5.2 - Fast page loading
 */

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
      <div className="text-center">
        <div 
          className="h-8 w-8 mx-auto border-2 border-primary border-t-transparent rounded-full animate-spin"
          role="status"
          aria-label="Loading page"
        />
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
      <div 
        className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin"
        role="status"
        aria-label="Loading"
      />
    </div>
  )
}

export default PageLoadingFallback
