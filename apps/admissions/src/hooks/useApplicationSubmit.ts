import { useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
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
  country?: string
  nationality?: string
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
 * Submission notifications are still being migrated to Django.
 * This remains a non-blocking no-op so submission itself can complete cleanly.
 */
export async function triggerSubmissionNotifications(data: NotificationData): Promise<{
  success: boolean
  emailQueueSuccess: boolean
  inAppSuccess: boolean
  emailNotificationSuccess: boolean
  errors: string[]
}> {
  void data
  const errors: string[] = []
  const emailQueueSuccess = false
  const inAppSuccess = false
  const emailNotificationSuccess = false

  // The Django backend only exposes admin-only notification/email send routes.
  // Student self-service submission cannot call those endpoints directly yet.

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
 * Generate a unique idempotency key for submission deduplication.
 * Uses crypto.randomUUID() when available, falls back to a timestamp-based key.
 */
function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Consolidated application submission hook with double-submit prevention.
 *
 * - Uses `useRef` for `isSubmitting` to avoid stale closures
 * - Generates a `crypto.randomUUID()` idempotency key stored in state
 * - On submit: checks isSubmitting ref, sets it true, disables button, calls API with idempotency key header
 * - On success: resets state and generates a new idempotency key
 * - On network failure: re-enables button but preserves the same idempotency key for retry
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */
export function useApplicationSubmit() {
  const queryClient = useQueryClient()
  const { user: authUser } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Ref-based submitting flag to avoid stale closures (Req 3.2)
  const isSubmittingRef = useRef(false)

  // Idempotency key: generated once, preserved across retries on network failure (Req 3.3, 3.5)
  const idempotencyKeyRef = useRef<string>(generateIdempotencyKey())

  /**
   * Reset the idempotency key (called on successful submission only).
   */
  const resetIdempotencyKey = useCallback(() => {
    idempotencyKeyRef.current = generateIdempotencyKey()
  }, [])

  const submitApplication = useCallback(async (data: WizardFormData, applicationId: string, popUrl: string) => {
    // Double-click guard: ignore if already submitting (Req 3.1, 3.2)
    if (isSubmittingRef.current) {
      return
    }

    isSubmittingRef.current = true
    try {
      setLoading(true)
      setError('')

      // Verify user authentication via useAuth() — the single source of truth.
      // ApiClient handles 401 refresh transparently on subsequent requests.
      if (!authUser?.id) {
        throw new Error('Authentication session expired. Please sign in again.')
      }

      const user = authUser

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

      // Submit with idempotency key header for server-side deduplication (Req 3.3)
      const cleanId = applicationId.replace(/^applications-/, '')
      const updatedApp = await retryWithBackoff(
        () => apiClient.request<{ id: string; application_number?: string }>(`/applications?id=${cleanId}`, {
          method: 'PATCH',
          body: JSON.stringify(updateData),
          headers: {
            'X-Idempotency-Key': idempotencyKeyRef.current,
          },
        }),
        3,
        1000
      )

      if (!updatedApp) {
        throw new Error('Application not found or access denied')
      }

      // Invalidate all application queries immediately
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
        queryClient.invalidateQueries({ queryKey: ['application-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['application_drafts'] }),
        queryClient.invalidateQueries({ queryKey: ['student-dashboard-polling'] }),
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

      // On success: generate a new idempotency key for any future submissions
      resetIdempotencyKey()

    } catch (error) {
      console.error('Error submitting application:', error)

      let errorMessage = 'Failed to submit application'

      if (error instanceof Error) {
        if (error.message?.includes('auth') || error.message?.includes('JWT') || error.message?.includes('session')) {
          errorMessage = 'Authentication error. Please sign in again and try submitting.'
        } else if (error.message?.includes('network') || error.message?.includes('fetch') || error.message?.includes('Failed to fetch')) {
          // Network failure: re-enable button but keep same idempotency key (Req 3.5)
          errorMessage = 'Network error. Please check your connection and try again.'
        } else if (error.message?.includes('403') || error.message?.includes('permission')) {
          errorMessage = 'Permission denied. Please ensure you are signed in and try again.'
        } else {
          errorMessage = error.message
        }
      }

      // NOTE: On error, we do NOT reset the idempotency key.
      // This ensures retries use the same key for server-side deduplication (Req 3.5).
      setError(errorMessage)
    } finally {
      isSubmittingRef.current = false
      setLoading(false)
    }
  }, [queryClient, resetIdempotencyKey])

  return {
    submitApplication,
    loading,
    error,
    success,
    /** Current idempotency key — exposed for testing */
    idempotencyKey: idempotencyKeyRef.current,
  }
}
