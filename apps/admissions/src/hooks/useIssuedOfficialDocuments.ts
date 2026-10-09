/**
 * What the platform has already issued for one application — asked, not derived.
 *
 * admissions-v2 task 10.4 — R13.11, R13.2; finding **STU-18** (*"Existing
 * documents are hidden after terminal status"*).
 *
 * The backend now runs two policies (design §11.3), and this hook exists because
 * only one of them is knowable in the browser:
 *
 * * **issuance** — *may a new artifact be created from today's application
 *   state?* That is a pure function of status and payment, so
 *   {@link isOfficialDocumentOffered} mirrors it exactly and the UI can answer it
 *   without a request;
 * * **read-existing** — *did the platform already issue a lawful artifact?* That
 *   is a fact about stored rows and their retention state. The client cannot
 *   compute it, so it must ask.
 *
 * Before task 10.4 the student surface had only the first policy, so it applied
 * the issuance answer to both questions — and a terminal application
 * (`enrolled`, `rejected`, `withdrawn`, `expired`, `enrollment_expired`) was
 * offered nothing at all. `enrolled` is the sharpest case: the student who
 * accepted their place, the successful outcome, lost the ability to re-read the
 * offer letter that got them there.
 *
 * `GET /api/v1/applications/{id}/official-documents/` is the answer, and it is
 * the *server's*: it publishes only types it has something to say about, it marks
 * a read-existing artifact `historical: true`, and it is already scoped and
 * 404-masked. This hook adds no rule — it records which types came back ready.
 *
 * Failure is deliberately quiet. A student reading their own application must not
 * be blocked by a list read that could not resolve; the issuance-gated actions
 * still render, and the historical ones simply do not appear. That is the same
 * "absent, not empty, and never a 500" choice task 10.3 made for the enrollment
 * readiness.
 *
 * @module useIssuedOfficialDocuments
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  officialDocumentService,
  type OfficialDocumentStatus,
  type OfficialDocumentType,
} from '@/services/officialDocuments'

export interface UseIssuedOfficialDocumentsResult {
  /**
   * The types the platform reports as downloadable right now, keyed by type.
   * Empty until the read resolves, and empty when it cannot.
   */
  issued: Readonly<Record<string, OfficialDocumentStatus>>
  /**
   * Whether a stored artifact of this type is available to read — the server's
   * answer, not a client rule.
   */
  isIssued: (documentType: OfficialDocumentType | string) => boolean
  /**
   * Whether the available artifact is being served under the read-existing
   * policy: the document the platform issued, not a claim that it reflects
   * today's application state.
   */
  isHistorical: (documentType: OfficialDocumentType | string) => boolean
  /** True while the first read is outstanding. */
  isLoading: boolean
  /** Re-ask, e.g. after a generation settles. */
  refresh: () => Promise<void>
}

const EMPTY: Readonly<Record<string, OfficialDocumentStatus>> = Object.freeze({})

export function useIssuedOfficialDocuments(
  applicationId: string | null | undefined,
): UseIssuedOfficialDocumentsResult {
  const [issued, setIssued] = useState<Readonly<Record<string, OfficialDocumentStatus>>>(EMPTY)
  const [isLoading, setIsLoading] = useState(Boolean(applicationId))
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!applicationId) {
      setIssued(EMPTY)
      setIsLoading(false)
      return
    }
    try {
      const rows = await officialDocumentService.listOfficialDocuments(applicationId)
      if (!mountedRef.current) return
      const next: Record<string, OfficialDocumentStatus> = {}
      for (const row of rows) {
        // Only a `ready` row names something the student can actually open. A
        // `queued` or `failed` row belongs to the action's own state, which the
        // per-type hook already owns; recording it here would give the surface
        // two sources for one answer.
        if (row?.status === 'ready' && row.document_type) {
          next[row.document_type] = row
        }
      }
      setIssued(Object.keys(next).length > 0 ? next : EMPTY)
    } catch {
      // Quiet by design — see the module docstring. The issuance-gated actions
      // are unaffected.
      if (mountedRef.current) setIssued(EMPTY)
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [applicationId])

  useEffect(() => {
    setIsLoading(Boolean(applicationId))
    void refresh()
  }, [applicationId, refresh])

  return useMemo(
    () => ({
      issued,
      isIssued: (documentType) => Boolean(issued[documentType as string]),
      isHistorical: (documentType) =>
        Boolean(issued[documentType as string]?.historical),
      isLoading,
      refresh,
    }),
    [issued, isLoading, refresh],
  )
}

export default useIssuedOfficialDocuments
