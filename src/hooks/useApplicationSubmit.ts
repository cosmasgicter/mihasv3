import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { applicationService } from '@/services/applications'
import { notificationService } from '@/services/notifications'
import { apiClient } from '@/services/client'

interface WizardFormData {
  full_name: string
  nrc_number?: string
  passport_number?: string
  date_of_birth: string
  sex: string
  phone: string
  email: string
  residence_town: string
  next_of_kin_name?: string
  next_of_kin_phone?: string
  program: string
  intake: string
  payment_method?: string
  payer_name?: string
  payer_phone?: string
  amount?: number
  paid_at?: string
  momo_ref?: string
}

interface NotificationData {
  applicationId: string
  userId: string
  email: string
  fullName: string
  applicationNumber: string
  program: string
}

/**
 * Triggers submission notifications via the notification service.
 * Errors are handled gracefully and don't fail the submission.
 */
export async function triggerSubmissionNotifications(data: NotificationData): Promise<{
  success: boolean
  emailQueueSuccess: boolean
  inAppSuccess: boolean
  emailNotificationSuccess: boolean
  errors: string[]
}> {
  const { applicationId, userId, email, fullName, applicationNumber, program } = data
  const errors: string[] = []
  let emailQueueSuccess = false
  let inAppSuccess = false
  let emailNotificationSuccess = false

  // 1. Send notification via notificationService (handles email queue + in-app)
  try {
    const sent = await notificationService.send({
      to: userId,
      subject: '✅ Application Submitted Successfully - MIHAS',
      message: `Your application #${applicationNumber} for ${program} has been submitted and is now under review.`,
    })
    emailQueueSuccess = sent
    inAppSuccess = sent
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('Failed to send notification:', err)
    errors.push(`Notification: ${errorMessage}`)
  }

  // 2. Fire-and-forget email notification tracking
  try {
    await apiClient.request('/notifications?action=send', {
      method: 'POST',
      body: JSON.stringify({
        application_id: applicationId,
        recipient_email: email,
        subject: '✅ Application Submitted Successfully - MIHAS',
        body: `Application #${applicationNumber} for ${program} submitted successfully.`,
        status: 'pending'
      })
    })
    emailNotificationSuccess = true
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('Failed to create email notification tracking:', err)
    errors.push(`Email notification tracking: ${errorMessage}`)
  }

  return {
    success: emailQueueSuccess || inAppSuccess || emailNotificationSuccess,
    emailQueueSuccess,
    inAppSuccess,
    emailNotificationSuccess,
    errors
  }
}

// Retry helper for large file uploads
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (i === maxRetries - 1) throw error
      const delay = baseDelay * Math.pow(2, i)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error('Max retries exceeded')
}

/**
 * Consolidated application submission hook.
 * Provides submit logic with retry, cache invalidation, and notification handling.
 * Submit button should be disabled while `loading` is true to prevent duplicate submissions.
 */
export function useApplicationSubmit() {
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const submitApplication = async (data: WizardFormData, applicationId: string, popUrl: string) => {
    try {
      setLoading(true)
      setError('')

      // Verify user authentication via cookie-based session
      const sessionData = await apiClient.request<{ user?: { id: string; role?: string } }>('/api/auth?action=session')
      const user = sessionData?.user
      
      if (!user) {
        throw new Error('Authentication session expired. Please sign in again.')
      }

      // Prepare update data
      const updateData = {
        payment_method: data.payment_method || 'MTN Money',
        payer_name: data.payer_name || null,
        payer_phone: data.payer_phone || null,
        amount: data.amount || 153,
        paid_at: data.paid_at ? new Date(data.paid_at).toISOString() : null,
        momo_ref: data.momo_ref || null,
        pop_url: popUrl,
        status: 'submitted',
        submitted_at: new Date().toISOString()
      }

      // Update the application via applicationService with retry logic
      const updatedApp = await retryWithBackoff(
        () => applicationService.update(applicationId, updateData)
      )
      
      if (!updatedApp) {
        throw new Error('Application not found or access denied')
      }

      // Invalidate all application queries immediately
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
        queryClient.invalidateQueries({ queryKey: ['application-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['application_drafts'] }),
        queryClient.refetchQueries({ queryKey: ['applications'] })
      ])

      // Trigger submission notifications (non-blocking)
      try {
        const notificationResult = await triggerSubmissionNotifications({
          applicationId,
          userId: user.id,
          email: data.email,
          fullName: data.full_name,
          applicationNumber: updatedApp.application_number || applicationId.slice(0, 8).toUpperCase(),
          program: data.program
        })

        if (notificationResult.errors.length > 0) {
          console.warn('Some notifications failed to send:', notificationResult.errors)
        }
      } catch (notificationError) {
        console.error('Failed to trigger submission notifications:', notificationError)
      }

      // Dispatch custom event to trigger dashboard refresh
      window.dispatchEvent(new CustomEvent('applicationCreated'))

      setSuccess(true)
      
    } catch (error) {
      console.error('Error submitting application:', error)
      
      let errorMessage = 'Failed to submit application'
      
      if (error instanceof Error) {
        if (error.message?.includes('auth') || error.message?.includes('JWT') || error.message?.includes('session')) {
          errorMessage = 'Authentication error. Please sign in again and try submitting.'
        } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.'
        } else if (error.message?.includes('403') || error.message?.includes('permission')) {
          errorMessage = 'Permission denied. Please ensure you are signed in and try again.'
        } else {
          errorMessage = error.message
        }
      }
      
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return { submitApplication, loading, error, success }
}
