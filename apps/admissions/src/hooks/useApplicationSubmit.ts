import { useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { applicationService } from '@/services/applications'
import { logger } from '@/lib/logger'
import { generateIdempotencyKey } from '@/lib/paymentStatus'

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
}

/**
 * Consolidated application submission hook with double-submit prevention.
 *
 * - Uses `useRef` for `isSubmitting` to avoid stale closures
 * - Generates a `crypto.randomUUID()` idempotency key retained across retries
 * - On submit: checks isSubmitting ref, sets it true, and calls the dedicated submit endpoint
 * - On success: resets state and generates a new idempotency key
 * - On failure: re-enables button and rotates the idempotency key so retry is user-controlled
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

  // Idempotency key for the current user-controlled submission attempt.
  const idempotencyKeyRef = useRef<string>(generateIdempotencyKey())

  /**
   * Reset the idempotency key (called on successful submission only).
   */
  const resetIdempotencyKey = useCallback(() => {
    idempotencyKeyRef.current = generateIdempotencyKey()
  }, [])

  const submitApplication = useCallback(async (data: WizardFormData, applicationId: string) => {
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

      // Submit through the dedicated backend endpoint so payment/document checks
      // and double-submit protection are enforced server-side.
      const cleanId = applicationId.replace(/^applications-/, '')
      const response = await applicationService.submit(cleanId, {
        headers: {
          'Idempotency-Key': idempotencyKeyRef.current,
        },
      })
      if (!response?.id) {
        throw new Error('Application not found or access denied')
      }
      const updatedApp = response

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

      // Dispatch the submission event expected by the dashboard/UI.
      window.dispatchEvent(new CustomEvent('applicationSubmitted', {
        detail: {
          applicationId: updatedApp.id,
          status: 'submitted',
          submittedAt: updatedApp.submitted_at ?? new Date().toISOString(),
          paymentStatus: updatedApp.payment_status ?? null,
        }
      }))

      setSuccess(true)

      // On success: generate a new idempotency key for any future submissions
      resetIdempotencyKey()

    } catch (error) {
      logger.error('Error submitting application:', error)

      let errorMessage = 'Failed to submit application'

      if (error instanceof Error) {
        const errorCode = (error as Error & { data?: { code?: string }; code?: string })?.data?.code || (error as Error & { code?: string }).code
        if (error.message?.includes('auth') || error.message?.includes('JWT') || error.message?.includes('session')) {
          errorMessage = 'Authentication error. Please sign in again and try submitting.'
        } else if (errorCode === 'IDEMPOTENCY_PENDING') {
          errorMessage = 'Your submission is still being processed. Please refresh your application status before trying again.'
        } else if (errorCode === 'ALREADY_SUBMITTED') {
          errorMessage = 'This application has already been submitted.'
        } else if (error.message?.includes('network') || error.message?.includes('fetch') || error.message?.includes('Failed to fetch')) {
          errorMessage = 'Network error. Please refresh your application status before trying again.'
        } else if (error.message?.includes('403') || error.message?.includes('permission')) {
          errorMessage = 'Permission denied. Please ensure you are signed in and try again.'
        } else {
          errorMessage = error.message
        }
      }

      // NOTE: On error, we reset the idempotency key. Submit is never auto-retried;
      // a user-controlled retry must start from a fresh status check and payload.
      resetIdempotencyKey()
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
