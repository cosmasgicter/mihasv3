/**
 * The one place a route guard tries the refresh cookie before it sends a
 * visitor to Sign in (student-journey-repair R8-a, clause 2.41).
 *
 * The bootstrap session read deliberately never refreshes, so public pages
 * never POST /auth/refresh/. A guarded route is different: a student whose
 * 30-minute access token expired while the tab slept still holds a valid
 * 7-day refresh cookie, so each guard makes one attempt per mount.
 *
 * Sign-out must never trigger a restore: the logout POST is not awaited, so a
 * guard that saw the cleared session could otherwise refresh with a still-valid
 * cookie and sign the user straight back in. `suppressSessionRestore()` is
 * called first by sign-out, the cross-tab logout and the auth-failure callback;
 * `allowSessionRestore()` by a successful sign-in or a session read with a user.
 */
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/services/client'
import { logger } from '@/lib/logger'
import { SESSION_QUERY_KEY } from './authQueries'

export type SessionRestoreStatus = 'idle' | 'restoring' | 'done'

let restoreSuppressed = false

export function suppressSessionRestore(): void {
  restoreSuppressed = true
}

export function allowSessionRestore(): void {
  restoreSuppressed = false
}

export function useSessionRestoreOnce(sessionSettledUnauthenticated: boolean): SessionRestoreStatus {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<SessionRestoreStatus>('idle')
  const attemptedRef = useRef(false)

  useEffect(() => {
    if (!sessionSettledUnauthenticated || attemptedRef.current || status !== 'idle') return
    attemptedRef.current = true
    if (restoreSuppressed) {
      setStatus('done')
      return
    }
    setStatus('restoring')
    void (async () => {
      let restored = false
      try {
        restored = await apiClient.refreshAuthSession()
        if (restored) {
          await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
        }
      } catch {
        restored = false
      }
      logger.info('[auth] session restore', { outcome: restored ? 'restored' : 'failed' })
      setStatus('done')
    })()
  }, [sessionSettledUnauthenticated, status, queryClient])

  if (sessionSettledUnauthenticated && status === 'idle' && !restoreSuppressed && !attemptedRef.current) {
    // First render of a settled-unauthenticated guard: report restoring now so
    // the guard shows the skeleton instead of redirecting for one frame.
    return 'restoring'
  }
  if (sessionSettledUnauthenticated && status === 'idle' && restoreSuppressed) {
    return 'done'
  }
  return status
}
