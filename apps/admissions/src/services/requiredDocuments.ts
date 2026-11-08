/**
 * Required-document contract service (admissions-v2 task 7.2).
 *
 * Requirements: R11.6-R11.7. Findings: STU-13, STU-19. Design §9.3.
 *
 * One read (`GET /api/v1/applications/{id}/required-documents/`) and one write
 * (the existing multipart upload command) so the upload controls the student
 * sees and the evidence the server stores come from the same contract.
 */
import { logApiError } from '@/lib/apiErrorLogger'
import { rateLimitMessage } from '@/lib/rateLimitCopy'
import {
  parseRequiredDocumentsContract,
  type RequiredDocumentsContract,
} from '@/lib/requiredDocuments'

import { apiClient } from './client'
import { documentService } from './documents'

/** A server refusal carrying the stable code the contract publishes. */
export class RequiredDocumentUploadError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(message: string, code: string, retryable: boolean) {
    super(message)
    this.name = 'RequiredDocumentUploadError'
    this.code = code
    this.retryable = retryable
  }
}

const RETRYABLE_CODES = new Set([
  'CONFIGURATION_UNAVAILABLE',
  'STORAGE_ERROR',
  'RATE_LIMITED',
  'UPLOAD_STALLED',
  'NETWORK_ERROR',
  'DOCUMENT_UPLOAD_IN_PROGRESS',
])

function toUploadError(error: unknown): RequiredDocumentUploadError {
  const record = (error ?? {}) as {
    code?: unknown
    message?: unknown
    status?: unknown
    data?: { code?: unknown }
  }
  // 4xx responses carry `code` directly; 5xx responses are re-thrown raw by the
  // API client so the stable code lives on the parsed envelope instead.
  const envelopeCode = typeof record.data?.code === 'string' ? record.data.code : null
  const code =
    typeof record.code === 'string' ? record.code : (envelopeCode ?? 'UPLOAD_FAILED')
  const retryAfter = (error as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds
  // A rate-limited upload says when to try again (SJR R3-d, clause 2.16).
  const message =
    code === 'RATE_LIMITED'
      ? rateLimitMessage(typeof retryAfter === 'number' ? retryAfter : null)
      : typeof record.message === 'string' && record.message.trim() !== ''
        ? record.message
        : 'Upload failed. Please try again.'
  const status = typeof record.status === 'number' ? record.status : 0
  // A transport error states for itself whether the attempt may be repeated. A
  // rate limit stays manually retryable (the student can try again later); only
  // the hook's automatic retry excludes it.
  const stated = (error as { retryable?: unknown } | null)?.retryable
  if (typeof stated === 'boolean') {
    return new RequiredDocumentUploadError(message, code, stated || code === 'RATE_LIMITED')
  }
  const retryable = RETRYABLE_CODES.has(code) || status === 0 || status >= 500 || status === 429
  return new RequiredDocumentUploadError(message, code, retryable)
}

export const requiredDocumentsService = {
  /**
   * The versioned requirement contract for one application.
   *
   * A 503 `CONFIGURATION_UNAVAILABLE` is surfaced as a retryable error, never
   * flattened into an empty requirement list (R11.6, STU-13).
   */
  get: async (applicationId: string): Promise<RequiredDocumentsContract> => {
    const endpoint = `/applications/${encodeURIComponent(applicationId)}/required-documents/`
    try {
      const raw = await apiClient.request<unknown>(endpoint)
      return parseRequiredDocumentsContract(raw)
    } catch (error) {
      logApiError('required-documents', endpoint, error)
      throw toUploadError(error)
    }
  },

  /**
   * Remove stored evidence for one requirement (admissions-v2 task 7.3, R11.8).
   *
   * Delegates to the canonical delete transport in `@/services/documents` and
   * only adds the stable-code error mapping this surface's state machine reads,
   * so there is still exactly one client path to
   * `DELETE /api/v1/documents/{id}/delete/`.
   */
  remove: async (args: { documentId: string; reason?: string }): Promise<void> => {
    try {
      await documentService.delete(args.documentId, { reason: args.reason })
    } catch (error) {
      throw toUploadError(error)
    }
  },

  /** Upload evidence for one requirement. Returns the stored document id. */
  upload: async (args: {
    applicationId: string
    documentType: string
    file: File
    idempotencyKey: string
    onProgress?: (progress: { loaded: number; total: number }) => void
    signal?: AbortSignal
  }): Promise<{ documentId: string; fileUrl: string | null }> => {
    const formData = new FormData()
    formData.append('file', args.file)
    formData.append('application_id', args.applicationId)
    formData.append('document_type', args.documentType)

    try {
      const result = await apiClient.upload<{ id?: string; file_url?: string }>(
        '/documents/upload/',
        formData,
        {
          idempotencyKey: args.idempotencyKey,
          onProgress: args.onProgress,
          signal: args.signal,
        },
      )
      if (!result?.id) {
        throw new RequiredDocumentUploadError(
          'The upload finished without a stored document. Please try again.',
          'UPLOAD_INCOMPLETE',
          true,
        )
      }
      return { documentId: result.id, fileUrl: result.file_url ?? null }
    } catch (error) {
      if (error instanceof RequiredDocumentUploadError) throw error
      logApiError('required-documents', '/documents/upload/', error)
      throw toUploadError(error)
    }
  },
}
