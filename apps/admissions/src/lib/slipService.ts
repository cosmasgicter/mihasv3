import type { ApplicationSlipData } from './applicationSlip'
import { importWithChunkRecovery } from '@/lib/lazyImportRecovery'
import { logger } from '@/lib/logger'
import { sanitizeForLog } from './security'
import { toError } from '@/lib/toError'

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
      importWithChunkRecovery(() => import('@/lib/pdf'), {
        guardKey: 'wizard-slip-pdf',
        recoveryMessage: 'A newer version of the slip generator is loading. Please wait a moment and try again.',
      }),
      importWithChunkRecovery(() => import('./applicationSlipStorage'), {
        guardKey: 'wizard-slip-storage',
        recoveryMessage: 'A newer version of the slip storage tools is loading. Please wait a moment and try again.',
      }),
    ])

    // Always generate locally via @react-pdf/renderer
    const blob = await generateApplicationSlip(data).catch((err: unknown) => {
      logger.error('Slip generation error:', err)
      const message = toError(err).message
      throw new Error(`Failed to generate PDF: ${message}`)
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
        logger.error('[slipService] Upload failed:', uploadError)
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
      uploadError = toError(storageError).message || 'Failed to persist application slip'
      logger.error('Application slip storage error:', sanitizeForLog(uploadError))
      toast?.showWarning?.('Storage issue', 'We could not store your slip automatically. You can still download it below.')
    }

    /*
      admissions-v2 task 10.6 (R13.5, finding **API-04**): this function no longer
      emails anything.

      It used to POST the deprecated `/applications/{id}/email-slip/` route, which
      task 10.6 removed after two measurements of zero production call sites. It
      is not repointed at the canonical official-document email either, and that
      is deliberate: emailing an official document is a *backend* command with
      stored provenance and a delivery record (task 10.4), and this module renders
      the slip in the browser. Wiring a client-rendered PDF into the canonical
      email would put an unfingerprinted artifact into the official pipeline.

      Callers who want the slip emailed use
      `services/officialDocuments.ts::emailOfficialDocument`. `sendEmail` is
      answered honestly — the request is declined with a reason rather than
      silently ignored — because a caller that believes it queued an email and did
      not is worse than one that is told no.
    */
    const emailed = false
    const queuedId: string | undefined = undefined
    let emailError: string | undefined
    let fallbackDownloadUrl: string | undefined
    if (options.sendEmail) {
      fallbackDownloadUrl = publicUrl || (appOrigin ? `${appOrigin}/student/status` : '/student/status')
      emailError = 'Slip email is handled by the official-document service'
      logger.warn('[slipService] sendEmail is no longer supported here; use officialDocuments.emailOfficialDocument')
      toast?.showWarning?.('Email not sent', 'You can still download your slip below.')
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
    const message = toError(error).message || 'Failed to create application slip'
    logger.error('Application slip generation failed:', sanitizeForLog(message))
    return { error: message }
  }
}
