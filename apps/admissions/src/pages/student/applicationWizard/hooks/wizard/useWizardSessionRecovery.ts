import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { extractAuthUser } from '@/lib/authSession'
import { authService } from '@/services/auth'
import {
  getCachedAuthUser,
  shouldRedirectToSignIn,
  hasRecentWizardRedirectGuard,
  WIZARD_AUTH_REDIRECT_GUARD_KEY,
  WIZARD_SESSION_GRACE_MS,
  SESSION_EXPIRED_BANNER,
} from './wizardControllerUtils'

interface UseWizardSessionRecoveryParams {
  authLoading: boolean
  user: { id?: string } | null | undefined
  currentStepKey: string
  setError: (updater: string | ((current: string) => string)) => void
  preserveDraftBeforeAuthRedirect: () => void
}

/**
 * Handles session expiry detection and auth recovery for the wizard.
 * If recovery fails, redirects to sign-in with draft preserved.
 */
export function useWizardSessionRecovery({
  authLoading,
  user,
  currentStepKey,
  setError,
  preserveDraftBeforeAuthRedirect,
}: UseWizardSessionRecoveryParams) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const authRecoveryInFlightRef = useRef(false)

  useEffect(() => {
    if (authLoading) return

    if (user) {
      authRecoveryInFlightRef.current = false
      setError(current => (current === SESSION_EXPIRED_BANNER ? '' : current))
      try {
        sessionStorage.removeItem(WIZARD_AUTH_REDIRECT_GUARD_KEY)
      } catch {
        // best effort guard cleanup
      }
      return
    }

    if (authRecoveryInFlightRef.current) return
    authRecoveryInFlightRef.current = true

    let cancelled = false
    let graceTimer: ReturnType<typeof setTimeout> | null = null

    const recoverSessionThenMaybeRedirect = async () => {
      setError(current => current || SESSION_EXPIRED_BANNER)
      await new Promise<void>(resolve => {
        graceTimer = setTimeout(resolve, WIZARD_SESSION_GRACE_MS)
      })

      if (cancelled) return

      const readCachedUser = () =>
        getCachedAuthUser(queryClient.getQueryData<{ user?: { id?: string } }>(['auth', 'session']))

      const cachedBeforeChecks = readCachedUser()
      if (cachedBeforeChecks) {
        setError(current => (current === SESSION_EXPIRED_BANNER ? '' : current))
        authRecoveryInFlightRef.current = false
        return
      }

      let sessionRecheckFailed = true
      try {
        const sessionResult = await authService.session()
        const sessionUser = extractAuthUser(sessionResult)
        if (sessionUser) {
          queryClient.setQueryData(['auth', 'session'], { user: sessionUser })
          sessionRecheckFailed = false
        }
      } catch {
        sessionRecheckFailed = true
      }

      if (cancelled) return

      let tokenRefreshFailed = true
      if (sessionRecheckFailed) {
        try {
          await authService.refresh()
          const refreshedSession = await authService.session()
          const refreshedUser = extractAuthUser(refreshedSession)
          if (refreshedUser) {
            queryClient.setQueryData(['auth', 'session'], { user: refreshedUser })
            tokenRefreshFailed = false
            sessionRecheckFailed = false
          }
        } catch {
          tokenRefreshFailed = true
        }
      }

      const cachedAfterChecks = readCachedUser()
      const shouldRedirect = shouldRedirectToSignIn({
        sessionRecheckFailed,
        tokenRefreshFailed,
        cachedUser: cachedAfterChecks,
      })

      if (cancelled || !shouldRedirect) {
        setError(current => (current === SESSION_EXPIRED_BANNER ? '' : current))
        authRecoveryInFlightRef.current = false
        return
      }

      const now = Date.now()
      let rawGuard: string | null = null
      try {
        rawGuard = sessionStorage.getItem(WIZARD_AUTH_REDIRECT_GUARD_KEY)
      } catch {
        rawGuard = null
      }
      if (hasRecentWizardRedirectGuard(rawGuard, now)) {
        setError(SESSION_EXPIRED_BANNER)
        authRecoveryInFlightRef.current = false
        return
      }

      preserveDraftBeforeAuthRedirect()
      try {
        sessionStorage.setItem(WIZARD_AUTH_REDIRECT_GUARD_KEY, JSON.stringify({ createdAt: now }))
      } catch {
        // best effort loop guard
      }
      const redirectTarget = `/student/application-wizard?step=${encodeURIComponent(currentStepKey)}`
      navigate(`/auth/signin?redirect=${encodeURIComponent(redirectTarget)}`, {
        replace: true,
        state: {
          from: {
            pathname: '/student/application-wizard',
            search: `?step=${encodeURIComponent(currentStepKey)}`,
            hash: '',
          },
        },
      })
    }

    recoverSessionThenMaybeRedirect().finally(() => {
      if (!cancelled) authRecoveryInFlightRef.current = false
    })

    return () => {
      cancelled = true
      authRecoveryInFlightRef.current = false
      if (graceTimer) clearTimeout(graceTimer)
    }
  }, [authLoading, currentStepKey, navigate, preserveDraftBeforeAuthRedirect, queryClient, user, setError])
}
