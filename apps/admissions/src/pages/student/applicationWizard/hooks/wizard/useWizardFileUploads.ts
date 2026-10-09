import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toError } from '@/lib/toError'
import { logger } from '@/lib/logger'
import { documentService } from '@/services/documents'
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
  persistLocalDraftSnapshot: () => unknown
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
    persistLocalDraftSnapshot,
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

      try {
        // The upload command already committed the document version and the
        // application URL projection. A second application PATCH here used to
        // race autosave and could overwrite a newer answer version.
        void url
        queryClient.invalidateQueries({ queryKey: ['applications'] })

        // Trigger backend OCR extraction (async Celery task)
        try {
          let resultSlipDocId = uploadedDocumentId
          if (!resultSlipDocId) {
            const docList = (await documentService.listByApplication(
              applicationId,
            )) as UploadedApplicationDocument[]
            resultSlipDocId = selectLatestDocumentByType(docList, 'result_slip')?.id
          }

          if (resultSlipDocId) {
            // Fire OCR extraction -- this is async (Celery task), don't await completion
            documentService
              .extract({ documentId: resultSlipDocId })
              .catch((err) => logger.warn('OCR extraction request failed', toError(err)))
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
        logger.error('Auto-fill error:', e)
        showWarning('Auto-fill failed. Please enter grades manually.')
      }
    })
  }, [applicationId, baseHandleResultSlipFile, baseHandleResultSlipUpload, persistLocalDraftSnapshot, queryClient, showInfo, showSuccess, showWarning, setOcrDocumentId, startOcrPollingRef])

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
        void url
        queryClient.invalidateQueries({ queryKey: ['applications'] })
      }
    )
  }, [applicationId, baseHandleExtraKycFile, baseHandleExtraKycUpload, persistLocalDraftSnapshot, queryClient])

  return {
    handleResultSlipUpload,
    handleExtraKycUpload,
  }
}
