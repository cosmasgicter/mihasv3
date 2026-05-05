import { useEffect, useRef } from 'react'
import { env } from '@/lib/env'

/**
 * Re-validates the user session when the browser tab regains visibility.
 *
 * Checks `GET /api/v1/auth/session/` at most once every 30 seconds.
 * If the session is no longer valid (non-2xx response), calls `onInvalid`
 * so the consumer can redirect to sign-in. Network errors are silently
 * ignored — the user may simply be offline.
 */
export function useVisibilityRevalidation(onInvalid: () => void) {
  const lastCheckRef = useRef(0)

  useEffect(() => {
    const handler = async () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastCheckRef.current < 30_000) return // throttle 30s
      lastCheckRef.current = Date.now()

      try {
        const res = await fetch(`${env.apiBaseUrl}/api/v1/auth/session/`, {
          credentials: 'include',
        })
        if (!res.ok) onInvalid()
      } catch {
        // Network error — don't invalidate, user may be offline
      }
    }

    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [onInvalid])
}
