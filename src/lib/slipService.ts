import { generateApplicationSlip, persistSlip, type ApplicationSlipData } from './applicationSlip'
import { logger } from '@/lib/logger'
import { sanitizeForLog } from './security'
import { apiClient } from '@/services/client'

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

function extractErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback

  if (typeof error === 'string') {
    return error.trim() || fallback
  }

  if (error instanceof Error) {
    return error.message?.trim() || fallback
  }

  if (typeof error === 'object') {
    const unknownError = error as Record<string, unknown>
    for (const key of ['reason', 'error', 'message', 'detail']) {
      const value = unknownError[key]
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
  }

  return fallback
}

export async function createApplicationSlip(
  data: ApplicationSlipData,
  options: SlipServiceOptions = {}
): Promise<SlipServiceResult> {
  const toast = options.toast
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : ''

  try {
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
      logger.log('[slipService] Attempting to persist slip for:', data.application_number)
      const uploadResult = await persistSlip(data.application_number, blob, data.userId)
      logger.log('[slipService] Persist result:', uploadResult)
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
      if (!data.email) {
        emailError = 'Missing applicant email address'
        toast?.showError?.('Email not sent', 'No email address was available to send the application slip.')
      } else {
        try {
          const applicationId = data.application_id?.trim()
          if (!applicationId) {
            throw new Error('Missing application ID required for slip email delivery')
          }

          const emailResponse = await apiClient.request<{
            emailed?: boolean
            queuedId?: string
            fallbackDownloadUrl?: string
          }>('/api/applications?action=email-slip', {
            method: 'POST',
            body: JSON.stringify({
              applicationId,
              recipientEmail: data.email,
              ...(publicUrl ? { slipUrl: publicUrl } : {}),
              ...(documentId ? { slipDocumentReference: documentId } : {}),
            }),
            invalidateCache: false,
          })

          emailed = emailResponse?.emailed === true
          queuedId = emailResponse?.queuedId
          fallbackDownloadUrl = emailResponse?.fallbackDownloadUrl || publicUrl || (appOrigin ? `${appOrigin}/student/status` : '/student/status')
        } catch (invokeError) {
          emailError = extractErrorMessage(invokeError, 'Failed to trigger slip email')
          fallbackDownloadUrl = publicUrl || (appOrigin ? `${appOrigin}/student/status` : '/student/status')
          console.error('Application slip email trigger error:', sanitizeForLog(emailError))
        }
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
