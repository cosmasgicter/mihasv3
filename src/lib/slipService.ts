import { generateApplicationSlip, persistSlip, type ApplicationSlipData } from './applicationSlip'
import { sanitizeForLog } from './security'
import { supabase } from './supabase'

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
    toast?.showInfo?.('Generating slip', 'Preparing your official application slip...')
    const blob = await generateApplicationSlip(data)

    let uploadError: string | undefined
    let documentId: string | undefined
    let publicUrl: string | undefined
    let path: string | undefined

    try {
      const uploadResult = await persistSlip(data.application_number, blob, data.userId)
      if (!uploadResult.success) {
        uploadError = uploadResult.error || 'Unable to store application slip'
        console.warn('Application slip persistence reported failure:', sanitizeForLog(uploadError))
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
          const payload = {
            to: data.email,
            subject: options.subject || 'Your MIHAS application slip',
            template: 'application-slip',
            data: {
              applicantName: data.full_name || data.email,
              applicationNumber: data.application_number,
              trackingCode: data.public_tracking_code,
              status: data.status,
              slipUrl: publicUrl,
              programName: data.program_name || '',
              paymentStatus: data.payment_status || 'pending_review'
            }
          }

          const { error } = await supabase.functions.invoke('send-email', {
            body: payload
          })

          if (error) {
            emailError = error.message || 'Failed to send slip email'
            console.error('Application slip email invocation failed:', sanitizeForLog(emailError))
            toast?.showError?.('Email not sent', 'We could not email your slip. Please download it manually.')
          } else {
            toast?.showSuccess?.('Email sent', 'We emailed a copy of your application slip.')
          }
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
    toast?.showError?.('Something went wrong', 'We could not generate your application slip. Please try again.')
    return { error: message }
  }
}
