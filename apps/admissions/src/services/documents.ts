import { logApiError } from '@/lib/apiErrorLogger'
import { apiClient } from './client'

export const documentService = {
  /**
   * Extract text from an uploaded document via Celery.
   *
   * `force` re-runs an extraction that already produced a result — the student pressed
   * "try again" on an unhelpful read. It is the one flag the endpoint takes, and it is
   * sent only when asked for, so an ordinary first extraction's request is byte-for-byte
   * what it was. Added by task 13.6 remediation L12, which moved the wizard's OCR retry
   * off the raw client onto this service; the endpoint already accepted it.
   */
  extract: async (data: { documentId?: string; force?: boolean }) => {
    if (!data.documentId) {
      throw new Error('Document extraction requires an uploaded document ID')
    }

    const endpoint = `/documents/${encodeURIComponent(data.documentId)}/extract/`
    try {
      const result = await apiClient.request(endpoint, {
        method: 'POST',
        ...(data.force
          ? {
              body: JSON.stringify({ force: true }),
              headers: { 'Content-Type': 'application/json' },
            }
          : {})
      })
      return result ?? null
    } catch (err) {
      logApiError('documents', endpoint, err)
      throw err
    }
  },

  /**
   * Read one document's metadata contract, including the deterministic
   * extraction block (admissions-v2 task 7.5, R11.4) when a read has produced
   * candidates. Errors are surfaced to the caller: the wizard's assistance hook
   * treats a failure as "no suggestion", never as a blocked upload.
   */
  getInfo: async <T = unknown>(documentId: string, options: { retries?: number } = {}) => {
    const endpoint = `/documents/${encodeURIComponent(documentId)}/info/`
    try {
      const result = await apiClient.request<T>(endpoint, {
        method: 'GET',
        ...(options.retries !== undefined ? { retries: options.retries } : {}),
      })
      return result ?? null
    } catch (err) {
      logApiError('documents', endpoint, err)
      throw err
    }
  },

  /** Get a signed download URL for a document. */
  getSignedUrl: async (documentId: string) => {
    const endpoint = `/documents/${encodeURIComponent(documentId)}/signed-url/`
    try {
      const result = await apiClient.request<{ url: string }>(endpoint, {
        method: 'GET'
      })
      return result ?? null
    } catch (err) {
      logApiError('documents', endpoint, err)
      throw err
    }
  },

  /**
   * List documents belonging to a specific application.
   *
   * Tolerates both shapes the endpoint can serve — a bare array and a paginated
   * `{results: […]}` envelope — because `apiClient.request` unwraps exactly one
   * `{success, data}` level and `ApplicationDocumentListView` paginates. Task 13.6
   * remediation L12 folded the second branch in here when it moved the wizard's copy of
   * this read off the raw client: the wizard needed `results`, so a reader that returned
   * `[]` for it would have been a silent behaviour change rather than a relocation.
   */
  listByApplication: async (applicationId: string) => {
    const endpoint = `/applications/${encodeURIComponent(applicationId)}/documents/`
    try {
      const result = await apiClient.request<{ results?: unknown[] } | unknown[]>(endpoint, {
        method: 'GET'
      })
      if (Array.isArray(result)) return result
      if (result && Array.isArray(result.results)) return result.results
      return []
    } catch (err) {
      logApiError('documents', endpoint, err)
      throw err
    }
  },

  /**
   * Remove a document as the application's current evidence.
   *
   * The single transport for the delete command (admissions-v2 task 7.3): the
   * server marks the immutable version non-current with lifecycle `deleted`,
   * appends the removal to verification history, and retains the stored object
   * so prior evidence survives (R11.8). `reason` is recorded on that history
   * entry, so it is worth sending whenever the caller knows one.
   */
  delete: async (documentId: string, options: { reason?: string } = {}) => {
    const endpoint = `/documents/${encodeURIComponent(documentId)}/delete/`
    const reason = options.reason?.trim()
    try {
      return await apiClient.request(endpoint, {
        method: 'DELETE',
        ...(reason ? { body: JSON.stringify({ reason }) } : {})
      })
    } catch (err) {
      logApiError('documents', endpoint, err)
      throw err
    }
  },
}
