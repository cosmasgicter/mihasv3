import { useState, useEffect, useCallback } from 'react'
import {
  checkEligibility,
  eligibilityEngine,
  type CurriculumType,
  type EligibilityAssessment,
  type EligibilityResult,
  type SubjectGrade,
} from '@/lib/eligibilityEngine'

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
  submitAppeal: (reason: string, documents?: any[]) => Promise<void>
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
      console.error('Eligibility check failed:', err)

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
    async (reason: string, documents: any[] = []) => {
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

// Hook for getting eligibility metrics
export function useEligibilityMetrics(programId?: string) {
  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadMetrics = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const mockMetrics = {
        totalApplications: 150,
        eligibleCount: 89,
        conditionalCount: 34,
        notEligibleCount: 27,
        averageScore: 72.5,
        eligibilityRate: 82.0,
      }

      setMetrics(mockMetrics)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load metrics'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [programId])

  useEffect(() => {
    loadMetrics()
  }, [loadMetrics])

  return { metrics, loading, error, refresh: loadMetrics }
}

// Hook for managing eligibility rules
export function useEligibilityRules(programId?: string) {
  const [rules, setRules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadRules = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      setRules([])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load rules'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [programId])

  const createRule = useCallback(
    async (ruleData: any) => {
      try {
        await loadRules()
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : 'Failed to create rule')
      }
    },
    [loadRules]
  )

  const updateRule = useCallback(
    async (ruleId: string, ruleData: any) => {
      try {
        await loadRules()
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : 'Failed to update rule')
      }
    },
    [loadRules]
  )

  const deleteRule = useCallback(
    async (ruleId: string) => {
      try {
        await loadRules()
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : 'Failed to delete rule')
      }
    },
    [loadRules]
  )

  useEffect(() => {
    loadRules()
  }, [loadRules])

  return { rules, loading, error, createRule, updateRule, deleteRule, refresh: loadRules }
}
