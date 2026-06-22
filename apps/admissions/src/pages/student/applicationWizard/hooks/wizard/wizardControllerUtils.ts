import { safeJsonParse } from '@/lib/utils'
import { sanitizeInput } from '@/lib/security'
import { normalizePhoneNumberInput } from '../../types'
import { AuthenticationError } from '@/services/client'
import { BROWSER_KEYS } from '@/lib/browserNamespace'
import type { Intake } from '@/types/database'
import type { WizardIntake } from '../../types'

// ── Constants ──

export const WIZARD_AUTH_REDIRECT_GUARD_KEY = BROWSER_KEYS.wizardAuthRedirectGuard
export const WIZARD_SESSION_GRACE_MS = 5000
export const IDENTITY_DOCUMENT_TYPES = new Set(['extra_kyc', 'nrc', 'passport'])
export const SESSION_EXPIRED_BANNER = 'Your session expired. We saved your progress. Please sign in again to continue.'

// ── Types ──

export type SessionCacheShape = { user?: { id?: string } | null } | null | undefined

export type ResolvedIntakeIdentity = {
  id: string
  name: string
  label: string
}

export type SaveDraftOptions = {
  syncServer?: boolean
}

// ── Pure helpers ──

export function createGradeRowId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `grade-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function normalizeServerUploadedFiles(documents: unknown[]): Record<string, boolean> {
  return documents.reduce<Record<string, boolean>>(
    (acc, document) => {
      if (!document || typeof document !== 'object') {
        return acc
      }

      const record = document as { document_type?: unknown; verification_status?: unknown }
      const documentType = typeof record.document_type === 'string' ? record.document_type : ''
      const verificationStatus = typeof record.verification_status === 'string' ? record.verification_status : ''
      if (verificationStatus === 'deleted') {
        return acc
      }

      if (documentType === 'result_slip') {
        acc.result_slip = true
      }
      if (IDENTITY_DOCUMENT_TYPES.has(documentType)) {
        acc.extra_kyc = true
      }

      return acc
    },
    { result_slip: false, extra_kyc: false }
  )
}

export const getCachedAuthUser = (sessionCache: SessionCacheShape) => sessionCache?.user ?? null

export const shouldRedirectToSignIn = ({
  sessionRecheckFailed,
  tokenRefreshFailed,
  cachedUser,
}: {
  sessionRecheckFailed: boolean
  tokenRefreshFailed: boolean
  cachedUser: { id?: string } | null
}) => sessionRecheckFailed && tokenRefreshFailed && !cachedUser

export const hasRecentWizardRedirectGuard = (rawGuardValue: string | null, now: number): boolean => {
  if (!rawGuardValue) return false
  const guard = safeJsonParse<{ createdAt?: number } | null>(rawGuardValue, null)
  if (!guard?.createdAt || typeof guard.createdAt !== 'number') return false
  return now - guard.createdAt < 15_000
}

export const buildWizardIntakeDisplayName = (intake: Intake & { year?: number }) => {
  const normalizedName = intake.name?.trim() || ''
  const yearString = Number.isFinite(intake.year) ? String(intake.year) : ''
  const includesYear = yearString && normalizedName.includes(yearString)
  const nameWithYear = includesYear ? normalizedName : `${normalizedName} ${yearString}`.trim()
  return (nameWithYear || normalizedName || yearString || 'Upcoming Intake').trim()
}

export const resolveWizardIntakeIdentity = (
  availableIntakes: WizardIntake[],
  value?: string | null
): ResolvedIntakeIdentity | null => {
  const trimmed = value?.trim() || ''
  if (!trimmed) return null

  const toResolvedIdentity = (intake: WizardIntake): ResolvedIntakeIdentity => {
    const canonicalName = intake.name?.trim() || intake.displayName?.trim() || ''
    const displayLabel = intake.displayName?.trim() || canonicalName
    return {
      id: intake.id,
      name: canonicalName,
      label: displayLabel,
    }
  }

  const byId = availableIntakes.find(intake => intake.id === trimmed)
  if (byId) return toResolvedIdentity(byId)

  const byDisplayName = availableIntakes.find(intake => intake.displayName?.trim() === trimmed)
  if (byDisplayName) return toResolvedIdentity(byDisplayName)

  const byName = availableIntakes.find(intake => intake.name?.trim() === trimmed)
  if (byName) return toResolvedIdentity(byName)

  return null
}

export function sanitizePhoneInput(value: string | undefined | null): string {
  return sanitizeInput(normalizePhoneNumberInput(value || ''))
}

export function isAuthSaveError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError ||
    (error instanceof Error && error.name === 'AuthenticationError')
}
