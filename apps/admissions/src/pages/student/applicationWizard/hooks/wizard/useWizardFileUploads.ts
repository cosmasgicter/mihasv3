import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { logApiError } from '@/lib/apiErrorLogger'
import { toError } from '@/lib/toError'
import { logger } from '@/lib/logger'
import { apiClient } from '@/services/client'
import { isApplicationMissingError } from '@/lib/applicationSession'
import { selectLatestDocumentByType, type UploadedApplicationDocument } from '../../lib/documentSelection'

export interface UseWizardFileUploadsParams {
  applicationId: string | null
  baseHandleResultSlipUpload: (
    event: React.ChangeEvent<HTMLInputElement>,
    onSuccess: (file: File, url: string, documentId?: string) => Promise<void>
  ) => void
  baseHandleExtraKycUpload: (
    event: React.ChangeEvent<HTMLInputElement>,
    onSuccess: (file: File, url: string) => Promise<void>
  ) => void
  baseHandleResultSlipFile: (file: File | null) => void
  baseHandleExtraKycFile: (file: File | null) => void
  updateApplication: { mutateAsync: (args: { id: string; data: Record<string, unknown> }) => Promise<unknown> }
  persistLocalDraftSnapshot: () => unknown
  clearStaleApplicationReference: (staleApplicationId: string, message?: string) => void
  showInfo: (title: string, message?: string) => void
  showSuccess: (message: string) => void
  showWarning: (message: string) => void
  setOcrDocumentId: (id: string | null) => void
  startOcrPollingRef: React.MutableRefObject<((documentId?: string | null) => void) | null>
}

export function useWizardFileUploads(params: UseWizardFileUploadsParams) {
  const {
    applicationId,
    baseHandleResultSlipUpload,
    baseHandleExtraKycUpload,
    baseHandleResultSlipFile,
    baseHandleExtraKycFile,
    updateApplication,
    persistLocalDraftSnapshot,
    clearStaleApplicationReference,
    showInfo,
    showSuccess,
    showWarning,
    setOcrDocumentId,
    startOcrPollingRef,
  } = params
  const queryClient = useQueryClient()

  const handleResultSlipUpload = useCallback((file: File | null) => {
    if (!file) {
      baseHandleResultSlipFile(null)
      return
    }

    baseHandleResultSlipUpload({ target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>, async (_uploadedFile, url, uploadedDocumentId) => {
      if (!applicationId) return
      
      showInfo('Processing document...', 'Extracting grades from your result slip')
      persistLocalDraftSnapshot()

      const persistResultSlipUrl = async () => {
        try {
          await updateApplication.mutateAsync({ id: applicationId, data: { result_slip_url: url } })
          queryClient.invalidateQueries({ queryKey: ['applications'] })
          return true
        } catch (error) {
          if (isApplicationMissingError(error)) {
            clearStaleApplicationReference(
              applicationId,
              'Your online draft was no longer available. The selected file is still on this device; continue from Basic Information to refresh the draft.'
            )
            return false
          }
          throw error
        }
      }
      
      try {
        // Result slip uploaded -- persist URL and trigger OCR extraction
        const persisted = await persistResultSlipUrl()
        if (!persisted) return

        // Trigger backend OCR extraction (async Celery task)
        try {
          let resultSlipDocId = uploadedDocumentId
          if (!resultSlipDocId) {
            const docs = await apiClient.request<{ results?: UploadedApplicationDocument[] } | UploadedApplicationDocument[]>(
              `/applications/${applicationId}/documents/`
            )
            const docList = Array.isArray(docs) ? docs : (docs?.results ?? [])
            resultSlipDocId = selectLatestDocumentByType(docList, 'result_slip')?.id
          }

          if (resultSlipDocId) {
            // Fire OCR extraction -- this is async (Celery task), don't await completion
            apiClient.request(`/documents/${resultSlipDocId}/extract/`, { method: 'POST' }).catch((err) => logger.warn('OCR extraction request failed', toError(err)))
            // Start polling for AI grade extraction results
            setOcrDocumentId(resultSlipDocId)
            startOcrPollingRef.current?.(resultSlipDocId)
            showInfo('Analyzing your result slip...', 'AI is extracting grades \u2014 they will auto-populate shortly.')
          }
        } catch {
          // Non-critical -- OCR is a convenience, not a requirement
          showSuccess('Result slip uploaded successfully.')
        }
      } catch (e) {
        if (isApplicationMissingError(e)) {
          clearStaleApplicationReference(
            applicationId,
            'Your online draft was no longer available. The selected file is still on this device; continue from Basic Information to refresh the draft.'
          )
          return
        }
        logger.error('Auto-fill error:', e)
        showWarning('Auto-fill failed. Please enter grades manually.')
        await persistResultSlipUrl()
      }
    })
  }, [applicationId, baseHandleResultSlipFile, baseHandleResultSlipUpload, clearStaleApplicationReference, persistLocalDraftSnapshot, queryClient, showInfo, showSuccess, showWarning, updateApplication, setOcrDocumentId, startOcrPollingRef])

  const handleExtraKycUpload = useCallback((file: File | null) => {
    if (!file) {
      baseHandleExtraKycFile(null)
      return
    }

    baseHandleExtraKycUpload(
      { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>,
      async (_uploadedFile, url) => {
        if (!applicationId) return

        persistLocalDraftSnapshot()

        try {
          await updateApplication.mutateAsync({ id: applicationId, data: { extra_kyc_url: url } })
          queryClient.invalidateQueries({ queryKey: ['applications'] })
        } catch (error) {
          if (isApplicationMissingError(error)) {
            clearStaleApplicationReference(
              applicationId,
              'Your online draft was no longer available. The selected file is still on this device; continue from Basic Information to refresh the draft.'
            )
            return
          }

          logApiError('application-wizard', `PATCH /applications/${applicationId}/`, error)
          showWarning('Identity document uploaded. Refresh the application if it does not appear immediately.')
        }
      }
    )
  }, [applicationId, baseHandleExtraKycFile, baseHandleExtraKycUpload, clearStaleApplicationReference, persistLocalDraftSnapshot, queryClient, showWarning, updateApplication])

  return {
    handleResultSlipUpload,
    handleExtraKycUpload,
  }
}
