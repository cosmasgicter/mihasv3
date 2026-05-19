import { useState, useEffect, useCallback } from 'react'
import {
  checkEligibility,
  eligibilityEngine,
  type CurriculumType,
  type EligibilityAssessment,
  type EligibilityResult,
  type SubjectGrade,
} from '@/lib/eligibilityEngine'
import { logger } from '@/lib/logger'

interface UseEligibilityCheckerProps {
  applicationId: string
  programId: string
  programName?: string
  grades: SubjectGrade[]
  curriculum?: CurriculumType
  enabled?: boolean
}

interface UseEligibilityCheckerReturn {
  assessment: EligibilityResult | null
  detailedAssessment: EligibilityAssessment | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  submitAppeal: (reason: string, documents?: unknown[]) => Promise<void>
}

/**
 * Consolidated eligibility checker hook.
 *
 * When `programName` is provided the fast local `checkEligibility` path is
 * used (no async engine overhead). Falls back to the engine class when only
 * `programId` is available.
 *
 * On any failure the hook returns an advisory fallback so the student is
 * never blocked (Requirement 8.4).
 */
export function useEligibilityChecker({
  applicationId,
  programId,
  programName,
  grades,
  curriculum,
  enabled = true,
}: UseEligibilityCheckerProps): UseEligibilityCheckerReturn {
  const [assessment, setAssessment] = useState<EligibilityResult | null>(null)
  const [detailedAssessment, setDetailedAssessment] = useState<EligibilityAssessment | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runCheck = useCallback(async () => {
    if (!enabled || grades.length === 0) return
    if (!programName && !programId) return

    setLoading(true)
    setError(null)

    try {
      // Fast path: use programName directly with the local checker
      if (programName) {
        const result = checkEligibility(programName, grades, curriculum)
        setAssessment(result)
      }

      // Also run the engine assessment when applicationId + programId are available
      if (applicationId && programId) {
        const engineResult = await eligibilityEngine.assessEligibility(
          applicationId,
          programId,
          grades
        )
        setDetailedAssessment(engineResult)

        // If we didn't get a result from the fast path, derive one from the engine
        if (!programName) {
          setAssessment({
            eligible: engineResult.eligibility_status === 'eligible',
            message:
              engineResult.eligibility_status === 'eligible'
                ? '✓ Meets requirements'
                : engineResult.missing_requirements.map((r) => r.description).join('; ') ||
                  'Requirements not fully met',
            score: engineResult.overall_score,
            canProceed: true,
            recommendations: engineResult.recommendations,
          })
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to check eligibility'
      setError(errorMessage)
      logger.error('Eligibility check failed:', err)

      // Provide advisory fallback so the student is never blocked
      setAssessment({
        eligible: true,
        message:
          'Unable to verify eligibility at this time. You may proceed with your application.',
        score: 0,
        canProceed: true,
        recommendations: ['Please consult with admissions for specific requirements'],
      })
    } finally {
      setLoading(false)
    }
  }, [applicationId, programId, programName, grades, curriculum, enabled])

  const refresh = useCallback(async () => {
    await runCheck()
  }, [runCheck])

  const submitAppeal = useCallback(
    async (reason: string, documents: unknown[] = []) => {
      if (!detailedAssessment?.id) {
        throw new Error('No assessment available for appeal')
      }

      try {
        await eligibilityEngine.submitAppeal(applicationId, detailedAssessment.id, reason, documents)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to submit appeal'
        throw new Error(errorMessage)
      }
    },
    [applicationId, detailedAssessment]
  )

  // Auto-check eligibility when dependencies change (debounced 500ms)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      runCheck()
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [runCheck])

  return {
    assessment,
    detailedAssessment,
    loading,
    error,
    refresh,
    submitAppeal,
  }
}
