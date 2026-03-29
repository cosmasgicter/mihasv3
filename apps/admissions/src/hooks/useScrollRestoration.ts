import { useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Module-level Map storing scroll positions keyed by route pathname.
 * Persists across component re-mounts but not across full page reloads.
 */
const scrollPositions = new Map<string, number>()

/**
 * Preserves and restores `window.scrollY` across route navigations.
 *
 * When the route changes, the current scroll position is saved for the
 * leaving route. On arrival at a route that has a stored position, the
 * window scrolls back to that position; otherwise it scrolls to top.
 *
 * A throttled scroll listener (via requestAnimationFrame) continuously
 * tracks the current scroll position so the saved value is always fresh,
 * even if the user scrolled after the last navigation.
 *
 * Designed to integrate with the router wrapper so that BottomNavigation
 * tab switches restore the user's previous scroll position.
 *
 * @param _key - Optional namespace key (reserved for future use; current
 *               implementation keys by `location.pathname`)
 *
 * Requirements: 4.6, 11.6
 */
export function useScrollRestoration(_key?: string): void {
  const { pathname } = useLocation()
  const prevPathRef = useRef<string>(pathname)
  const rafRef = useRef<number | null>(null)

  // Throttled scroll position tracker using requestAnimationFrame
  const handleScroll = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      scrollPositions.set(prevPathRef.current, window.scrollY)
      rafRef.current = null
    })
  }, [])

  // Attach/detach the throttled scroll listener
  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [handleScroll])

  useEffect(() => {
    const prevPath = prevPathRef.current

    // Save scroll position for the route we're leaving
    if (prevPath !== pathname) {
      scrollPositions.set(prevPath, window.scrollY)
    }

    // Restore saved position for the new route, or scroll to top
    const saved = scrollPositions.get(pathname)
    if (saved !== undefined) {
      window.scrollTo(0, saved)
    } else {
      window.scrollTo(0, 0)
    }

    prevPathRef.current = pathname
  }, [pathname])
}

/**
 * Exported for testing — returns the internal scroll position map.
 * @internal
 */
export function _getScrollPositions(): Map<string, number> {
  return scrollPositions
}
