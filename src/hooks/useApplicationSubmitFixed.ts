import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

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
 * Triggers submission notifications by inserting into email_queue, 
 * in_app_notifications, and email_notifications tables.
 * Errors are handled gracefully and don't fail the submission.
 * 
 * @param data - The notification data containing application details
 * @returns Object with success status and any errors encountered
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

  const submittedAt = new Date().toISOString()
  const applicationUrl = `https://mihasv3.pages.dev/student/application/${applicationId}`

  // 1. Insert into email_queue table with template data
  try {
    const { error: emailQueueError } = await supabase
      .from('email_queue')
      .insert({
        to_email: email,
        subject: '✅ Application Submitted Successfully - MIHAS',
        template: 'application_submitted',
        template_data: {
          studentName: fullName,
          applicationNumber: applicationNumber,
          program: program,
          applicationUrl: applicationUrl,
          submittedAt: submittedAt
        },
        priority: 'high',
        status: 'pending',
        scheduled_for: submittedAt,
        created_at: submittedAt
      })

    if (emailQueueError) {
      console.error('Failed to queue email:', emailQueueError)
      errors.push(`Email queue: ${emailQueueError.message}`)
    } else {
      emailQueueSuccess = true
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('Failed to queue email:', err)
    errors.push(`Email queue: ${errorMessage}`)
  }

  // 2. Insert into in_app_notifications table
  try {
    const { error: inAppError } = await supabase
      .from('in_app_notifications')
      .insert({
        user_id: userId,
        title: '✅ Application Submitted Successfully',
        content: `Your application #${applicationNumber} for ${program} has been submitted and is now under review.`,
        type: 'success',
        action_url: `/student/application/${applicationId}`,
        read: false
      })

    if (inAppError) {
      console.error('Failed to create in-app notification:', inAppError)
      errors.push(`In-app notification: ${inAppError.message}`)
    } else {
      inAppSuccess = true
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('Failed to create in-app notification:', err)
    errors.push(`In-app notification: ${errorMessage}`)
  }

  // 3. Insert into email_notifications table for tracking
  try {
    const { error: emailNotifError } = await supabase
      .from('email_notifications')
      .insert({
        application_id: applicationId,
        recipient_email: email,
        subject: '✅ Application Submitted Successfully - MIHAS',
        body: `Application #${applicationNumber} for ${program} submitted successfully. Your application is now under review.`,
        status: 'pending'
      })

    if (emailNotifError) {
      console.error('Failed to create email notification tracking:', emailNotifError)
      errors.push(`Email notification tracking: ${emailNotifError.message}`)
    } else {
      emailNotificationSuccess = true
    }
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

export function useApplicationSubmitFixed() {
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const submitApplication = async (data: WizardFormData, applicationId: string, popUrl: string) => {
    try {
      setLoading(true)
      setError('')

      // Verify user authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
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

      // Update the application with retry logic
      const { data: updatedApp, error: updateError } = await retryWithBackoff(
        () => supabase
          .from('applications')
          .update(updateData)
          .eq('id', applicationId)
          .eq('user_id', user.id)
          .select()
          .single()
      )
      
      if (updateError) {
        console.error('Database update error:', updateError)
        throw new Error(updateError.message || 'Failed to update application')
      }

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

      // Trigger submission notifications (non-blocking - errors don't fail submission)
      // This inserts into email_queue, in_app_notifications, and email_notifications tables
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
        // Log but don't fail the submission - notifications are non-critical
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
        } else if (error.message?.includes('RLS') || error.message?.includes('policy')) {
          errorMessage = 'Access denied. Please sign in with the correct account and try again.'
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