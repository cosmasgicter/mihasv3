/**
 * Official-document service — backend is the single source of official PDFs.
 *
 * Spec: `multi-tenant-beanola-remediation` — Phase 3 (Official-document
 * consolidation), Requirement 7. Consumes the student-safe backend endpoints
 * implemented in task 8.2 (`backend/apps/applications/official_document_views.py`):
 *
 *   POST /api/v1/applications/{id}/official-documents/{document_type}/  generate/ensure current
 *   GET  /api/v1/applications/{id}/official-documents/                  list latest per type
 *   GET  /api/v1/applications/{id}/official-documents/{document_type}/  status + download_url
 *
 * All three return the `{"success": true, "data": ...}` envelope, which
 * `apiClient.request` unwraps to the inner `data` for callers. The data shape
 * is `OfficialDocumentStatus` (mirrors the backend envelope exactly).
 *
 * These functions replace the client-side `@/lib/pdf` generators for *official*
 * downloads (R7.1): what a student receives must match the authoritative,
 * tenant-branded backend record, never a locally rendered blob.
 *
 * @module officialDocuments
 */

import { logApiError } from '@/lib/apiErrorLogger'
import { apiClient } from './client'

/** Official-document types the backend surface serves (mirrors `_DOCUMENT_TASK_NAMES`). */
export type OfficialDocumentType =
  | 'application_slip'
  | 'acceptance_letter'
  | 'conditional_offer'
  | 'payment_receipt'
  | 'finance_receipt'

/**
 * Backend generation status for an official document.
 *
 * `not_requested` was added by admissions-v2 task 10.4 (R13.11, STU-18) and it is
 * the important one: pre-10.4 the backend reported `queued` for a document that
 * had never been requested and for one whose enqueue had failed, so the client
 * polled work nothing had recorded. `queued` now means a committed durable job
 * exists; `not_requested` means there is nothing to poll and the caller should
 * POST.
 */
export type OfficialDocumentGenerationStatus =
  | 'ready'
  | 'queued'
  | 'failed'
  | 'setup_required'
  | 'not_requested'

/** The durable job's state, as the backend publishes it. */
export type OfficialDocumentJobState =
  | 'pending'
  | 'dispatched'
  | 'succeeded'
  | 'failed'
  | 'none'

/** The committed durable generation job (R13.11). */
export interface OfficialDocumentJob {
  state: OfficialDocumentJobState
  attempts: number
  requested_at: string | null
  settled_at: string | null
  error_code: string | null
  /** True when the job will not change without a new request. */
  terminal: boolean
  /** True when *this* requester retrying would plausibly change the outcome. */
  can_retry: boolean
}

/** Per-channel delivery record for an emailed official document (R13.4). */
export interface OfficialDocumentDelivery {
  category: string
  kind?: string
  channels: Record<string, { used: boolean; reason?: string }>
}

/**
 * The official-document status envelope returned by the backend (R5.1, R5.9).
 *
 * Matches the `data` payload built by `official_document_views._build_envelope`
 * field-for-field: `document_id` and the timestamp/version/institution fields
 * are nullable; `download_url` and `task_id` are present only when applicable.
 */
export interface OfficialDocumentStatus {
  document_id: string | null
  document_type: OfficialDocumentType | string
  status: OfficialDocumentGenerationStatus
  /** Stored backend file URL — present only when the document is `ready`. */
  download_url?: string
  generated_at: string | null
  template_version: number | null
  institution_id: string | null
  /** Async poll reference — present only on the queued generate path. */
  task_id?: string
  /** Stable backend setup/failure code, present for failed/setup-required states. */
  error_code?: string
  /** True when the tenant profile/template/assets must be configured first. */
  setup_required?: boolean
  /**
   * True when the artifact is served under the read-existing policy: the
   * document the platform issued, not a claim that it reflects today's
   * application state (R13.11, design §11.3).
   */
  historical?: boolean
  /** The committed durable job behind this status. */
  job?: OfficialDocumentJob
  /** Server-decided: whether this requester may usefully retry. */
  can_retry?: boolean
  /** Present on the email response only. */
  delivery?: OfficialDocumentDelivery
}

const SERVICE = 'official-documents'

function applicationDocumentsBase(applicationId: string): string {
  return `/applications/${encodeURIComponent(applicationId)}/official-documents/`
}

function applicationDocumentPath(applicationId: string, documentType: OfficialDocumentType | string): string {
  return `${applicationDocumentsBase(applicationId)}${encodeURIComponent(documentType)}/`
}

/**
 * Trigger an authorized browser download for a resolved official-document URL.
 *
 * Mirrors the existing authorized-file download pattern used across the app
 * (`useApplicationSlip`/`DocumentButtons`): create an anchor, click it, and clean
 * up. No-ops outside a DOM (SSR/tests).
 */
function triggerUrlDownload(url: string): void {
  if (typeof document === 'undefined') return
  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const officialDocumentService = {
  /**
   * Generate (or ensure the current version of) an official document (R5.1).
   *
   * Backend idempotency lives in the Current_Official_Version + fingerprint
   * lifecycle, so calling this repeatedly never forces a duplicate render: a
   * `ready` status is returned when a current version already exists, otherwise
   * a `queued` status the caller can poll via `getOfficialDocument`.
   */
  generateOfficialDocument: async (
    applicationId: string,
    documentType: OfficialDocumentType | string,
  ): Promise<OfficialDocumentStatus | null> => {
    const endpoint = applicationDocumentPath(applicationId, documentType)
    try {
      return await apiClient.request<OfficialDocumentStatus>(endpoint, { method: 'POST' })
    } catch (err) {
      logApiError(SERVICE, endpoint, err)
      throw err
    }
  },

  /** List the latest official document per type for an application (R5.1). */
  listOfficialDocuments: async (applicationId: string): Promise<OfficialDocumentStatus[]> => {
    const endpoint = applicationDocumentsBase(applicationId)
    try {
      const result = await apiClient.request<OfficialDocumentStatus[]>(endpoint, { method: 'GET' })
      return result ?? []
    } catch (err) {
      logApiError(SERVICE, endpoint, err)
      throw err
    }
  },

  /** Read the backend generation status + download URL for one document (R7.2). */
  getOfficialDocument: async (
    applicationId: string,
    documentType: OfficialDocumentType | string,
  ): Promise<OfficialDocumentStatus | null> => {
    const endpoint = applicationDocumentPath(applicationId, documentType)
    try {
      return await apiClient.request<OfficialDocumentStatus>(endpoint, { method: 'GET' })
    } catch (err) {
      logApiError(SERVICE, endpoint, err)
      throw err
    }
  },

  /**
   * Download a `ready` official document via its authorized backend URL (R7.3).
   *
   * Resolves the authoritative status first (so the caller always downloads the
   * stored backend record, never a local blob), then triggers a browser
   * download from the `download_url` the backend reports. Throws when the
   * document is not yet `ready` or carries no download URL so the UI can keep
   * surfacing `Queued`/`Generating`/`Failed` states.
   */
  downloadOfficialDocument: async (
    applicationId: string,
    documentType: OfficialDocumentType | string,
  ): Promise<void> => {
    const endpoint = applicationDocumentPath(applicationId, documentType)
    try {
      const statusPayload = await apiClient.request<OfficialDocumentStatus>(endpoint, { method: 'GET' })
      const downloadUrl = statusPayload?.download_url
      if (!statusPayload || statusPayload.status !== 'ready' || !downloadUrl) {
        throw new Error('Official document is not ready for download yet')
      }
      triggerUrlDownload(downloadUrl)
    } catch (err) {
      logApiError(SERVICE, endpoint, err)
      throw err
    }
  },

  /**
   * Email the backend-stored official document — never a local blob (R7.4).
   *
   * admissions-v2 task 10.4 (R13.5, finding API-04) closed the gap this function
   * used to declare. There is now one canonical email route for **every**
   * document type::
   *
   *   POST /applications/{id}/official-documents/{document_type}/email/
   *
   * so the "only the application slip has a backend email endpoint" refusal —
   * which meant a student could download an acceptance letter but not have it
   * emailed — is gone.
   *
   * Task 10.4 left the legacy `/email-slip/` route in place as a thin proxy onto
   * this one for the measured window R13.5 requires. Task **10.6** closed that
   * window: zero production call sites, measured twice, and the route, its view
   * and its two serializers are **removed**. This is now the only way an official
   * document is emailed.
   *
   * The recipient is the applicant's own account address. `email` is accepted
   * for callers that want to be explicit and is validated by the backend against
   * the owner's address; an official record is not redirectable.
   */
  emailOfficialDocument: async (
    applicationId: string,
    documentType: OfficialDocumentType | string,
    email?: string,
  ): Promise<OfficialDocumentStatus | null> => {
    const endpoint = `${applicationDocumentPath(applicationId, documentType)}email/`
    try {
      return await apiClient.request<OfficialDocumentStatus>(endpoint, {
        method: 'POST',
        body: JSON.stringify(email ? { email } : {}),
      })
    } catch (err) {
      logApiError(SERVICE, endpoint, err)
      throw err
    }
  },
}

export const {
  generateOfficialDocument,
  listOfficialDocuments,
  getOfficialDocument,
  downloadOfficialDocument,
  emailOfficialDocument,
} = officialDocumentService
