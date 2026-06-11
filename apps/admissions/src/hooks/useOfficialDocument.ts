/**
 * useOfficialDocument — student-facing official-document action hook.
 *
 * Spec: `multi-tenant-beanola-remediation` Phase 3, Requirement 7. This hook is
 * the single seam the student document components use to drive official
 * downloads/email through the backend (`services/officialDocuments.ts`), so the
 * document a student receives is the authoritative tenant-branded backend
 * record — never a locally rendered `@/lib/pdf` blob (R7.1, R7.3, R7.4).
 *
 * It maps the backend generation status to the four UI states the design
 * requires (R7.2):
 *
 *   - `Generating` — the initial generate request is in flight.
 *   - `Queued`     — the backend reported `queued`; we are polling for readiness.
 *   - `Ready`      — the backend reported `ready`; the download has been served.
 *   - `Failed`     — generation failed (or the gate/scope rejected the request);
 *                    a retry affordance is surfaced.
 *
 * The R5 status + payment gates are enforced by the callers (which only render
 * the action when the application status / payment state permits it); the
 * backend additionally 404-masks out-of-scope or not-permitted requests, which
 * this hook degrades to a `Failed` state with a friendly message rather than
 * crashing (R7.5).
 *
 * @module useOfficialDocument
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { toError } from '@/lib/toError'
import {
  officialDocumentService,
  type OfficialDocumentGenerationStatus,
  type OfficialDocumentType,
} from '@/services/officialDocuments'

/** The four UI states the student document surface renders (R7.2). */
export type OfficialDocumentUiState = 'idle' | 'generating' | 'queued' | 'ready' | 'failed'

/** Polling cadence while the backend works through a `queued` document. */
export const OFFICIAL_DOC_POLL_INTERVAL_MS = 3_000
/** Bound on poll attempts so a stuck `queued` document degrades to `failed`. */
export const OFFICIAL_DOC_MAX_POLLS = 20

/**
 * Pure mapper from `{ inflight, backendStatus }` to a UI state.
 *
 * Exported so the gating/UI-state tests (task 10.3) can exercise it directly.
 * Precedence: a known terminal/queued backend status wins over the transient
 * in-flight flag, so polling a `queued` document reads as `Queued` (not a
 * flickering `Generating`); only the very first request — before any backend
 * status is known — reads as `Generating`.
 */
export function deriveOfficialDocumentUiState(
  inflight: boolean,
  backendStatus: OfficialDocumentGenerationStatus | null,
): OfficialDocumentUiState {
  if (backendStatus === 'ready') return 'ready'
  if (backendStatus === 'failed') return inflight ? 'generating' : 'failed'
  if (backendStatus === 'queued') return inflight ? 'queued' : 'queued'
  if (inflight) return 'generating'
  return 'idle'
}

export interface UseOfficialDocumentResult {
  /** The mapped UI state — drives button label / retry affordance. */
  uiState: OfficialDocumentUiState
  /** The raw backend generation status, or `null` before any request. */
  status: OfficialDocumentGenerationStatus | null
  /** True while any generate/poll/email request is in flight. */
  isBusy: boolean
  /** Last error message, or `null`. */
  error: string | null
  /** Generate (ensure current) then download the stored backend document. */
  download: () => Promise<boolean>
  /** Email the backend-stored document to `address` (slip only — see service). */
  email: (address: string) => Promise<boolean>
  /** Clear transient error/state back to idle. */
  reset: () => void
}

/**
 * Drive backend official-document generation, download, and email for one
 * `(applicationId, documentType)` pair.
 */
export function useOfficialDocument(
  applicationId: string,
  documentType: OfficialDocumentType,
): UseOfficialDocumentResult {
  const [status, setStatus] = useState<OfficialDocumentGenerationStatus | null>(null)
  const [inflight, setInflight] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mountedRef = useRef(true)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [])

  const reset = useCallback(() => {
    if (!mountedRef.current) return
    setStatus(null)
    setError(null)
  }, [])

  /**
   * Poll `getOfficialDocument` until the backend reports `ready` or `failed`,
   * or the attempt budget is exhausted. Resolves to the terminal status.
   */
  const pollUntilSettled = useCallback(
    async (): Promise<OfficialDocumentGenerationStatus> => {
      for (let attempt = 0; attempt < OFFICIAL_DOC_MAX_POLLS; attempt += 1) {
        await new Promise<void>((resolve) => {
          pollTimerRef.current = setTimeout(() => resolve(), OFFICIAL_DOC_POLL_INTERVAL_MS)
        })
        if (!mountedRef.current) return 'queued'

        const payload = await officialDocumentService.getOfficialDocument(applicationId, documentType)
        const next = payload?.status ?? 'failed'
        if (mountedRef.current) setStatus(next)
        if (next === 'ready' || next === 'failed') return next
      }
      return 'failed'
    },
    [applicationId, documentType],
  )

  const download = useCallback(async (): Promise<boolean> => {
    if (inflight) return false
    setInflight(true)
    setError(null)
    try {
      const generated = await officialDocumentService.generateOfficialDocument(applicationId, documentType)
      let current: OfficialDocumentGenerationStatus = generated?.status ?? 'failed'
      if (mountedRef.current) setStatus(current)

      if (current === 'queued') {
        current = await pollUntilSettled()
      }

      if (current !== 'ready') {
        if (mountedRef.current) {
          setError('The document could not be generated. Please try again.')
        }
        return false
      }

      // Always pull the authoritative stored record and stream it to the
      // browser — never a local blob (R7.3, R7.4).
      await officialDocumentService.downloadOfficialDocument(applicationId, documentType)
      return true
    } catch (err) {
      if (mountedRef.current) {
        setStatus('failed')
        setError(toError(err).message || 'Unable to download the document')
      }
      return false
    } finally {
      if (mountedRef.current) setInflight(false)
    }
  }, [applicationId, documentType, inflight, pollUntilSettled])

  const email = useCallback(
    async (address: string): Promise<boolean> => {
      if (inflight) return false
      setInflight(true)
      setError(null)
      try {
        // Ensure the backend-stored document exists/current before emailing it,
        // so the email attaches the authoritative record, not a local render.
        const generated = await officialDocumentService.generateOfficialDocument(applicationId, documentType)
        let current: OfficialDocumentGenerationStatus = generated?.status ?? 'failed'
        if (mountedRef.current) setStatus(current)
        if (current === 'queued') {
          current = await pollUntilSettled()
        }
        if (current !== 'ready') {
          if (mountedRef.current) {
            setError('The document is still being prepared. Please try again in a moment.')
          }
          return false
        }

        await officialDocumentService.emailOfficialDocument(applicationId, documentType, address)
        return true
      } catch (err) {
        if (mountedRef.current) {
          setError(toError(err).message || 'Unable to email the document')
        }
        return false
      } finally {
        if (mountedRef.current) setInflight(false)
      }
    },
    [applicationId, documentType, inflight, pollUntilSettled],
  )

  return {
    uiState: deriveOfficialDocumentUiState(inflight, status),
    status,
    isBusy: inflight,
    error,
    download,
    email,
    reset,
  }
}
