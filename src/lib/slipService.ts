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
  uploadError?: string
  emailError?: string
  error?: string
}

export async function createApplicationSlip(
  data: ApplicationSlipData,
  options: SlipServiceOptions = {}
): Promise<SlipServiceResult> {
  const toast = options.toast

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
    if (options.sendEmail) {
      if (!data.email) {
        emailError = 'Missing applicant email address'
        toast?.showError?.('Email not sent', 'No email address was available to send the application slip.')
      } else if (!publicUrl) {
        emailError = 'No public URL available for slip'
        toast?.showWarning?.('Email not sent', 'We could not send the slip because the download link was unavailable.')
      } else {
        try {
          await apiClient.request('/api/email?action=send', {
            method: 'POST',
            body: JSON.stringify({
              recipient_email: data.email,
              recipient_name: data.full_name || data.email,
              subject: options.subject || 'Your MIHAS application slip',
              body: `Your MIHAS application slip for ${data.application_number} is ready. Use the secure link in this email to download it.`,
              template_name: 'generic',
              template_data: {
                recipientName: data.full_name || data.email,
                message: `Your application slip for ${data.application_number} is ready. You can download it securely using the button below.`,
                actionUrl: publicUrl
              },
              priority: 3
            }),
            invalidateCache: false
          })

          toast?.showSuccess?.('Email sent', 'We emailed a copy of your application slip.')
        } catch (invokeError) {
          emailError = invokeError instanceof Error ? invokeError.message : 'Failed to trigger slip email'
          console.error('Application slip email trigger error:', sanitizeForLog(emailError))
          toast?.showError?.('Email not sent', 'We could not email your slip. Please download it manually.')
        }
      }
    }

    return {
      blob,
      publicUrl,
      path,
      documentId,
      uploadError,
      emailError
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create application slip'
    console.error('Application slip generation failed:', sanitizeForLog(message))
    return { error: message }
  }
}
