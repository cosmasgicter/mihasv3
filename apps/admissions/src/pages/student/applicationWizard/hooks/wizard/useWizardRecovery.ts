/**
 * useWizardRecovery — Phase 6 wizard hook.
 *
 * Owns the wizard's "graceful failure" surfaces:
 * - Detect a stale or deleted draft on mount and clear local state.
 * - Detect an expired session and surface the recovery banner.
 * - Auto-redirect to sign-in when both session recheck and refresh fail.
 * - Provide a `clearAllDraftData` escape hatch for force-resets.
 *
 * Stream 8 of canonical-truth program. Decision A6 — Phase 6 of 6.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

import { authService } from '@/services/auth'
import { extractAuthUser } from '@/lib/authSession'
import { clearAllDraftData, isDraftDeleted, clearDraftDeletedFlag } from '@/lib/draftManager'
import {
  applicationSessionManager,
  clearStaleApplicationDraftReference,
  isApplicationMissingError,
} from '@/lib/applicationSession'
import { logger } from '@/lib/logger'
import { safeJsonParse } from '@/lib/utils'

const WIZARD_AUTH_REDIRECT_GUARD_KEY = 'mihas:wizard-auth-redirect-guard'

export interface UseWizardRecoveryOptions {
  /** Authenticated user from useAuth(); null when signed out. */
  user: { id?: string } | null | undefined
  /** Application ID currently associated with the wizard. */
  applicationId: string | null
  /** Setter to clear the application ID when a stale draft reference is detected. */
  setApplicationId: (next: string | null) => void
  /** Optional callback when a session-expired banner should be shown. */
  onSessionExpired?: () => void
}

export interface UseWizardRecoveryResult {
  /** True while a recovery / session re-check is in flight. */
  recoveryInFlight: boolean
  /** Drop all local draft state (used by "Start over"). */
  clearAllDrafts: () => void
  /** Clear a stale `applicationId` if the backend says it doesn't exist. */
  clearStaleApplicationReference: () => void
  /** Attempt a session re-check + token refresh. Resolves true if recovered. */
  recoverSession: () => Promise<boolean>
}

export function useWizardRecovery(
  options: UseWizardRecoveryOptions
): UseWizardRecoveryResult {
  const { user, applicationId, setApplicationId, onSessionExpired } = options
  const navigate = useNavigate()
  const location = useLocation()
  const [recoveryInFlight, setRecoveryInFlight] = useState(false)
  const recoveryRef = useRef(false)

  // On mount, check the deleted-draft flag and reset state if set.
  useEffect(() => {
    if (isDraftDeleted()) {
      clearAllDraftData()
      clearDraftDeletedFlag()
      setApplicationId(null)
    }
  }, [setApplicationId])

  // Watch for stale applicationId references — application missing errors
  // are detected by the wizard controller and bubbled up via this clear call.
  const clearStaleApplicationReference = useCallback(() => {
    if (!applicationId) return
    clearStaleApplicationDraftReference(applicationId)
    setApplicationId(null)
  }, [applicationId, setApplicationId])

  const clearAllDrafts = useCallback(() => {
    clearAllDraftData()
    setApplicationId(null)
  }, [setApplicationId])

  const recoverSession = useCallback(async (): Promise<boolean> => {
    if (recoveryRef.current) return false
    recoveryRef.current = true
    setRecoveryInFlight(true)

    try {
      const session = await authService.session()
      const recovered = extractAuthUser(session) !== null
      if (!recovered) {
        // Try one token refresh as a last-ditch effort.
        try {
          await authService.refresh()
          const after = await authService.session()
          return extractAuthUser(after) !== null
        } catch {
          // Both recheck and refresh failed.
          onSessionExpired?.()
          // Set a guard so we don't loop on redirect.
          try {
            sessionStorage.setItem(
              WIZARD_AUTH_REDIRECT_GUARD_KEY,
              JSON.stringify({ createdAt: Date.now() })
            )
          } catch {
            // sessionStorage unavailable — proceed without guard.
          }
          navigate('/auth/signin', {
            state: { from: location, sessionExpired: true },
            replace: true,
          })
          return false
        }
      }
      return true
    } catch (err) {
      logger.warn('useWizardRecovery session recheck failed', err)
      return false
    } finally {
      recoveryRef.current = false
      setRecoveryInFlight(false)
    }
  }, [navigate, location, onSessionExpired])

  return {
    recoveryInFlight,
    clearAllDrafts,
    clearStaleApplicationReference,
    recoverSession,
  }
}

/**
 * Helper used by both hook and tests: did the wizard recently redirect to
 * sign-in? Used to short-circuit recovery loops.
 */
export function hasRecentWizardRedirectGuard(rawGuardValue: string | null, now: number): boolean {
  if (!rawGuardValue) return false
  const guard = safeJsonParse<{ createdAt?: number } | null>(rawGuardValue, null)
  if (!guard?.createdAt || typeof guard.createdAt !== 'number') return false
  return now - guard.createdAt < 15_000
}

export const WIZARD_AUTH_REDIRECT_GUARD_KEY_EXPORTED = WIZARD_AUTH_REDIRECT_GUARD_KEY

// Re-exported helpers for parity with the legacy useWizardController.ts
// (which exports them so external callers can introspect session state).
export { applicationSessionManager, isApplicationMissingError }
