/**
 * useAdminOfficialDocuments — admin-facing official-document panel hook.
 *
 * Spec: `multi-tenant-beanola-remediation` Phase 10 (Document UI states),
 * Requirement 17.4 / 17.5. This is the single seam the admin application-detail
 * document panel uses to drive official-document generation and listing through
 * the backend (`services/officialDocuments.ts`):
 *
 *   - R17.4: an operator "Generate" action queues the backend Official_Document
 *     (`POST /api/v1/applications/{id}/official-documents/{type}/`) and then
 *     surfaces the returned status (`queued → generating → ready/failed`); the
 *     latest Official_Document per type is listed
 *     (`GET /api/v1/applications/{id}/official-documents/`).
 *   - R17.5: the list + generate calls funnel through the backend's
 *     `AccessScopeService` scope path, which 404-masks out-of-scope school staff
 *     and lets super-admins through globally. The UI therefore consumes only
 *     backend-scoped data and never presents a cross-tenant affordance.
 *
 * No client-side official PDF generation happens here (R17.6) — the document an
 * operator queues, views, and downloads is always the authoritative
 * tenant-branded backend record.
 *
 * @module useAdminOfficialDocuments
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { toError } from '@/lib/toError'
import {
  OFFICIAL_DOC_MAX_POLLS,
  OFFICIAL_DOC_POLL_INTERVAL_MS,
  deriveOfficialDocumentUiState,
  type OfficialDocumentUiState,
} from '@/hooks/useOfficialDocument'
import {
  officialDocumentService,
  type OfficialDocumentGenerationStatus,
  type OfficialDocumentStatus,
  type OfficialDocumentType,
} from '@/services/officialDocuments'

/** The official-document types an operator can generate for an application. */
export const ADMIN_OFFICIAL_DOCUMENT_TYPES: ReadonlyArray<{
  type: OfficialDocumentType
  label: string
}> = [
  { type: 'application_slip', label: 'Application slip' },
  { type: 'acceptance_letter', label: 'Acceptance letter' },
  { type: 'conditional_offer', label: 'Conditional offer' },
  { type: 'payment_receipt', label: 'Payment receipt' },
  { type: 'finance_receipt', label: 'Finance receipt' },
]

/** Per-type row the admin panel renders (R17.4). */
export interface AdminOfficialDocumentRow {
  type: OfficialDocumentType
  label: string
  /** The latest backend record for this type, or `null` when none exists yet. */
  latest: OfficialDocumentStatus | null
  /** The mapped UI state — drives the badge + action label. */
  uiState: OfficialDocumentUiState
  /** True while a generate/poll request for this type is in flight. */
  isBusy: boolean
}

export interface UseAdminOfficialDocumentsResult {
  /** One row per generatable document type, latest-status first. */
  rows: AdminOfficialDocumentRow[]
  /** True while the initial list is loading. */
  isLoading: boolean
  /** Last list-load error message, or `null`. */
  loadError: string | null
  /** True while any generate/poll request is in flight. */
  isBusy: boolean
  /** Queue (or ensure current) the backend document, then poll to readiness. */
  generate: (documentType: OfficialDocumentType) => Promise<boolean>
  /** Download the stored backend record for a `ready` document. */
  download: (documentType: OfficialDocumentType) => Promise<boolean>
  /** Re-fetch the latest official documents from the backend. */
  refresh: () => Promise<void>
}

/**
 * Drive backend official-document listing + generation for one application from
 * the admin application-detail panel.
 */
export function useAdminOfficialDocuments(applicationId: string): UseAdminOfficialDocumentsResult {
  const [latestByType, setLatestByType] = useState<Record<string, OfficialDocumentStatus>>({})
  const [statusByType, setStatusByType] = useState<Record<string, OfficialDocumentGenerationStatus>>({})
  const [inflightType, setInflightType] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

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

  const refresh = useCallback(async () => {
    if (!applicationId) return
    try {
      const documents = await officialDocumentService.listOfficialDocuments(applicationId)
      if (!mountedRef.current) return
      const next: Record<string, OfficialDocumentStatus> = {}
      for (const document of documents) {
        next[document.document_type] = document
      }
      setLatestByType(next)
      setLoadError(null)
    } catch (err) {
      if (mountedRef.current) {
        setLoadError(toError(err).message || 'Unable to load official documents')
      }
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [applicationId])

  useEffect(() => {
    setIsLoading(true)
    void refresh()
  }, [refresh])

  const pollUntilSettled = useCallback(
    async (documentType: OfficialDocumentType): Promise<OfficialDocumentGenerationStatus> => {
      for (let attempt = 0; attempt < OFFICIAL_DOC_MAX_POLLS; attempt += 1) {
        await new Promise<void>((resolve) => {
          pollTimerRef.current = setTimeout(() => resolve(), OFFICIAL_DOC_POLL_INTERVAL_MS)
        })
        if (!mountedRef.current) return 'queued'

        const payload = await officialDocumentService.getOfficialDocument(applicationId, documentType)
        const next = payload?.status ?? 'failed'
        if (mountedRef.current) {
          setStatusByType((prev) => ({ ...prev, [documentType]: next }))
        }
        if (next === 'ready' || next === 'failed') return next
      }
      return 'failed'
    },
    [applicationId],
  )

  const generate = useCallback(
    async (documentType: OfficialDocumentType): Promise<boolean> => {
      if (inflightType) return false
      setInflightType(documentType)
      setLoadError(null)
      try {
        const generated = await officialDocumentService.generateOfficialDocument(applicationId, documentType)
        let current: OfficialDocumentGenerationStatus = generated?.status ?? 'failed'
        if (mountedRef.current) {
          setStatusByType((prev) => ({ ...prev, [documentType]: current }))
        }

        if (current === 'queued') {
          current = await pollUntilSettled(documentType)
        }

        // Always reconcile with the authoritative backend list afterwards so
        // the panel reflects the stored record (R17.4), not a transient guess.
        await refresh()
        return current === 'ready'
      } catch (err) {
        if (mountedRef.current) {
          setStatusByType((prev) => ({ ...prev, [documentType]: 'failed' }))
          setLoadError(toError(err).message || 'Unable to generate the document')
        }
        return false
      } finally {
        if (mountedRef.current) setInflightType(null)
      }
    },
    [applicationId, inflightType, pollUntilSettled, refresh],
  )

  const download = useCallback(
    async (documentType: OfficialDocumentType): Promise<boolean> => {
      try {
        await officialDocumentService.downloadOfficialDocument(applicationId, documentType)
        return true
      } catch (err) {
        if (mountedRef.current) {
          setLoadError(toError(err).message || 'Unable to download the document')
        }
        return false
      }
    },
    [applicationId],
  )

  const rows = useMemo<AdminOfficialDocumentRow[]>(() => {
    return ADMIN_OFFICIAL_DOCUMENT_TYPES.map(({ type, label }) => {
      const latest = latestByType[type] ?? null
      const inflight = inflightType === type
      // A stored ready record wins; otherwise fall back to the live poll status.
      const backendStatus: OfficialDocumentGenerationStatus | null =
        latest?.status ?? statusByType[type] ?? null
      return {
        type,
        label,
        latest,
        uiState: deriveOfficialDocumentUiState(inflight, backendStatus),
        isBusy: inflight,
      }
    })
  }, [inflightType, latestByType, statusByType])

  return {
    rows,
    isLoading,
    loadError,
    isBusy: inflightType !== null,
    generate,
    download,
    refresh,
  }
}
