import { useCallback } from 'react'

/**
 * Module-level cache tracking which import functions have already been called.
 * Uses a Set of the import function references to avoid duplicate dynamic imports.
 */
const prefetchedCache = new Set<() => Promise<unknown>>()

/**
 * Returns `{ onMouseEnter, onFocus }` event handlers that trigger a dynamic
 * `import()` for the target route chunk on hover or focus.
 *
 * Cache-aware: once an import function has been called, subsequent triggers
 * are no-ops — the browser module cache handles the rest.
 *
 * Usage:
 * ```tsx
 * const prefetch = usePrefetch(() => import('@/pages/Dashboard'))
 * <Link to="/dashboard" {...prefetch}>Dashboard</Link>
 * ```
 *
 * @param importFn - A function returning a dynamic `import()` promise for the route chunk
 */
export function usePrefetch(importFn: () => Promise<unknown>): {
  onMouseEnter: () => void
  onFocus: () => void
} {
  const trigger = useCallback(() => {
    if (prefetchedCache.has(importFn)) return
    prefetchedCache.add(importFn)
    // Fire-and-forget — errors are silently swallowed since this is
    // a best-effort optimisation; the real import happens on navigation.
    importFn().catch(() => {
      // Remove from cache on failure so a retry is possible
      prefetchedCache.delete(importFn)
    })
  }, [importFn])

  return { onMouseEnter: trigger, onFocus: trigger }
}
