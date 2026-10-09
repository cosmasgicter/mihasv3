import { useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { logger } from '@/lib/logger'
import { publicTrackingService, type PublicTrackingStatus } from '@/services/publicTracking'
import {
  isTrackingSecret,
  normalizeSearchTerm,
  validateSearchTerm,
} from '../utils/trackerUtils'

/**
 * The public tracking contract (admissions-v2 task 10.5, R13.12 / R14, STU-22).
 *
 * These are exactly the fields `ApplicationTrackingSerializer` publishes — no
 * more. Before 10.5 this interface also declared `feedback_summary`,
 * `admin_feedback`, `admin_feedback_date` and `public_tracking_code`, and the page
 * rendered a "Message from Admissions" panel from two of them. The backend has
 * never sent those, which is the only reason an unauthenticated page was not
 * publishing internal reviewer notes. They are gone from both sides.
 */
export type PublicApplicationStatus = PublicTrackingStatus

/** The stable error codes `ApplicationTrackView` answers with. */
export type TrackerErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_FORMAT'
  | 'TRACKING_SECRET_REQUIRED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UNKNOWN'

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('status' in error)) return undefined
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}

/** The server's stable code, when the client transport surfaced it. */
function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const direct = (error as { code?: unknown }).code
  if (typeof direct === 'string') return direct
  const data = (error as { data?: { code?: unknown } }).data
  if (data && typeof data.code === 'string') return data.code
  return undefined
}

/**
 * User-facing copy per stable code. The server sends a message too; this map is
 * what the page shows when the transport gave us the code but not the body, and
 * it keeps the "an application number is not a credential" explanation in one
 * place rather than inline at the call site.
 */
const TRACKER_ERROR_COPY: Record<TrackerErrorCode, string> = {
  VALIDATION_ERROR: 'Enter the tracking link issued to you.',
  INVALID_FORMAT:
    'That is not a tracking link. A tracking link looks like TRK-4KP2M9XT-9QW3RT7VZ2KDN8YH6JF4.',
  TRACKING_SECRET_REQUIRED:
    'That looks like an application number, which no longer opens public tracking. Sign in and choose "Get tracking link" on your application, then use that link here.',
  NOT_FOUND:
    'That tracking link is not valid. It may have been replaced by a newer one — sign in to get the current link.',
  RATE_LIMITED:
    'Too many tracking attempts from this connection. Please wait a few minutes and try again with your tracking link.',
  UNKNOWN: 'An error occurred while searching. Please try again.',
}

function resolveErrorCode(error: unknown): TrackerErrorCode {
  const code = getErrorCode(error)
  if (
    code === 'VALIDATION_ERROR' ||
    code === 'INVALID_FORMAT' ||
    code === 'TRACKING_SECRET_REQUIRED' ||
    code === 'NOT_FOUND'
  ) {
    return code
  }
  const status = getErrorStatus(error)
  if (status === 429) return 'RATE_LIMITED'
  if (status === 404) return 'NOT_FOUND'
  // A 400 with no code the client could read: the only 400 a well-formed
  // tracking link can produce is a format refusal.
  if (status === 400) return 'INVALID_FORMAT'
  return 'UNKNOWN'
}

export const useApplicationTracker = () => {
  const [searchParams] = useSearchParams()
  const [searchTerm, setSearchTerm] = useState('')
  const [application, setApplication] = useState<PublicApplicationStatus | null>(null)
  /**
   * The secret the current result was opened with. The share link is built from
   * this and nothing else, so a shared URL carries the random token and no PII
   * (STU-22). It is deliberately not persisted anywhere.
   */
  const [resolvedCode, setResolvedCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorCode, setErrorCode] = useState<TrackerErrorCode | null>(null)
  const [searched, setSearched] = useState(false)

  const fail = useCallback((code: TrackerErrorCode) => {
    setErrorCode(code)
    setError(TRACKER_ERROR_COPY[code])
  }, [])

  const searchApplication = useCallback(
    async (term: string) => {
      const normalizedTerm = normalizeSearchTerm(term)
      if (!normalizedTerm) {
        fail('VALIDATION_ERROR')
        return
      }
      if (!validateSearchTerm(normalizedTerm)) {
        fail('INVALID_FORMAT')
        return
      }
      // Recognising an application number in the browser is a courtesy, not the
      // boundary: the server refuses it either way. Answering here saves an
      // unauthenticated round trip and states the reason in the same words.
      if (!isTrackingSecret(normalizedTerm)) {
        setApplication(null)
        setResolvedCode(null)
        setSearched(true)
        fail('TRACKING_SECRET_REQUIRED')
        return
      }
      try {
        setLoading(true)
        setError('')
        setErrorCode(null)
        setApplication(null)
        setResolvedCode(null)
        const data = await publicTrackingService.track(normalizedTerm)
        if (!data) {
          setSearched(true)
          fail('NOT_FOUND')
          return
        }
        setApplication({
          application_number: data.application_number ?? null,
          status: data.status ?? 'submitted',
          program_name: data.program_name ?? null,
          intake_name: data.intake_name ?? null,
          institution: data.institution ?? null,
          submitted_at: data.submitted_at ?? null,
          updated_at: data.updated_at ?? null,
        })
        setResolvedCode(normalizedTerm)
        setSearched(true)
      } catch (error: unknown) {
        logger.error('Error searching application:', error)
        setSearched(true)
        fail(resolveErrorCode(error))
      } finally {
        setLoading(false)
      }
    },
    [fail],
  )

  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) return
    const normalizedCode = normalizeSearchTerm(code)
    if (!validateSearchTerm(normalizedCode)) {
      fail('INVALID_FORMAT')
      return
    }
    setSearchTerm(normalizedCode)
    searchApplication(normalizedCode)
  }, [searchParams, searchApplication, fail])

  return {
    searchTerm,
    setSearchTerm,
    application,
    setApplication,
    resolvedCode,
    loading,
    error,
    errorCode,
    setError,
    searched,
    setSearched,
    searchApplication,
  }
}
