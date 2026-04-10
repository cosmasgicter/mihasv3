import type { ApplicationSlipData } from './applicationSlip'
import { importWithChunkRecovery } from '@/lib/lazyImportRecovery'
import { logger } from '@/lib/logger'
import { sanitizeForLog } from './security'

export interface SlipServiceOptions {
  sendEmail?: boolean
  subject?: string
  toast?: {
    showSuccess?: (title: string, message?: string) => void
    showError?: (title: string, message?: string) => void
    showInfo?: (title: string, message?: string) => void
    showWarning?: (title: string, message?: string) => void
  }
}

export interface SlipServiceResult {
  blob?: Blob
  publicUrl?: string
  path?: string
  documentId?: string
  emailed?: boolean
  queuedId?: string
  fallbackDownloadUrl?: string
  uploadError?: string
  emailError?: string
  error?: string
}

export async function createApplicationSlip(
  data: ApplicationSlipData,
  options: SlipServiceOptions = {}
): Promise<SlipServiceResult> {
  const toast = options.toast
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : ''

  try {
    const [{ generateApplicationSlip }, { persistSlip }] = await Promise.all([
      importWithChunkRecovery(() => import('./applicationSlipPdf'), {
        guardKey: 'wizard-slip-pdf',
        recoveryMessage: 'A newer version of the slip generator is loading. Please wait a moment and try again.',
      }),
      importWithChunkRecovery(() => import('./applicationSlipStorage'), {
        guardKey: 'wizard-slip-storage',
        recoveryMessage: 'A newer version of the slip storage tools is loading. Please wait a moment and try again.',
      }),
    ])

    // Always generate locally with jsPDF
    const blob = await generateApplicationSlip(data).catch(err => {
      console.error('Slip generation error:', err)
      throw new Error(`Failed to generate PDF: ${err.message || 'Unknown error'}`)
    })

    let uploadError: string | undefined
    let documentId: string | undefined
    let publicUrl: string | undefined
    let path: string | undefined

    try {
      logger.info('[slipService] Attempting to persist slip for:', data.application_number)
      const uploadResult = await persistSlip(data.application_number, blob, data.userId, data.application_id)
      logger.info('[slipService] Persist result:', uploadResult)
      if (!uploadResult.success) {
        uploadError = uploadResult.error || 'Unable to store application slip'
        console.error('[slipService] Upload failed:', uploadError)
        toast?.showWarning?.('Slip not stored', 'We could not store your slip automatically. You can still download it below.')
      } else {
        publicUrl = uploadResult.publicUrl
        documentId = uploadResult.documentId
        path = uploadResult.path
        if (publicUrl) {
          toast?.showSuccess?.('Slip ready', 'Your application slip has been saved successfully.')
        }
      }
    } catch (storageError) {
      uploadError = storageError instanceof Error ? storageError.message : 'Failed to persist application slip'
      console.error('Application slip storage error:', sanitizeForLog(uploadError))
      toast?.showWarning?.('Storage issue', 'We could not store your slip automatically. You can still download it below.')
    }

    let emailError: string | undefined
    let emailed = false
    let queuedId: string | undefined
    let fallbackDownloadUrl: string | undefined
    if (options.sendEmail) {
      fallbackDownloadUrl = publicUrl || (appOrigin ? `${appOrigin}/student/status` : '/student/status')
      if (!data.email) {
        emailError = 'Missing applicant email address'
        toast?.showError?.('Email not sent', 'No email address was available to send the application slip.')
      } else {
        emailError = 'Application slip email delivery is not implemented in the Django backend yet'
      }
    }

    return {
      blob,
      publicUrl,
      path,
      documentId,
      emailed,
      queuedId,
      fallbackDownloadUrl,
      uploadError,
      emailError
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create application slip'
    console.error('Application slip generation failed:', sanitizeForLog(message))
    return { error: message }
  }
}
