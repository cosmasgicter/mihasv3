/**
 * useWizardSubmission — Phase 5 wizard hook (scaffold).
 *
 * Owns the application submission flow:
 * - Final RHF validation pass.
 * - Confirmation and inflight-operation guards.
 * - Caller-supplied `submit` callback for the actual API call.
 * - Typed error surfacing via the canonical error-code catalog.
 *
 * This is a Phase 5 scaffold. The next-sprint PR wires it into
 * useWizardController, replacing the inline handleSubmitApplication block.
 *
 * Stream 8 of canonical-truth program. Decision A6 — Phase 5 of 6.
 */

import { useCallback, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'

import { ERROR_CODE_MESSAGES, getErrorMessageForCode } from '@/lib/errorMessages'

import type { WizardFormData } from '../../types'
import type { SubmittedApplicationSummary } from '../useApplicationSlip'

export interface UseWizardSubmissionOptions {
  form: UseFormReturn<WizardFormData>
  /** Whether the user has confirmed the submission (final checkbox). */
  confirmSubmission: boolean
  /** Whether the wizard is mid-payment / mid-upload (block submission). */
  blockedByInflightOperation?: boolean
  /**
   * Caller-supplied submit function. Throw with `{ code, message }` to
   * surface a typed error via the canonical catalog.
   */
  submitter: () => Promise<SubmittedApplicationSummary>
}

export interface UseWizardSubmissionResult {
  loading: boolean
  error: string
  setError: (msg: string) => void
  submittedApplication: SubmittedApplicationSummary | null
  success: boolean
  /** Submit the application. Resolves with the summary on success, null otherwise. */
  submit: () => Promise<SubmittedApplicationSummary | null>
}

export function useWizardSubmission(
  options: UseWizardSubmissionOptions
): UseWizardSubmissionResult {
  const {
    form,
    confirmSubmission,
    blockedByInflightOperation = false,
    submitter,
  } = options

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submittedApplication, setSubmittedApplication] =
    useState<SubmittedApplicationSummary | null>(null)
  const [success, setSuccess] = useState(false)

  const submit = useCallback(async (): Promise<SubmittedApplicationSummary | null> => {
    if (loading) return null

    if (!confirmSubmission) {
      setError(
        ERROR_CODE_MESSAGES.CONFIRM_SUBMISSION_REQUIRED ??
          'Please confirm your submission before continuing.'
      )
      return null
    }
    if (blockedByInflightOperation) {
      setError(
        'Please wait for the current operation to finish before submitting.'
      )
      return null
    }

    // Final RHF validation pass.
    const valid = await form.trigger()
    if (!valid) {
      setError(
        ERROR_CODE_MESSAGES.VALIDATION_ERROR ?? 'Please review the form for errors.'
      )
      return null
    }

    setLoading(true)
    setError('')
    try {
      const result = await submitter()
      setSubmittedApplication(result)
      setSuccess(true)
      return result
    } catch (err) {
      const code = (err as { code?: string }).code
      const fallback = err instanceof Error ? err.message : 'Submission failed'
      const msg = getErrorMessageForCode(code, fallback) || fallback
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [
    blockedByInflightOperation,
    confirmSubmission,
    form,
    loading,
    submitter,
  ])

  return {
    loading,
    error,
    setError,
    submittedApplication,
    success,
    submit,
  }
}
