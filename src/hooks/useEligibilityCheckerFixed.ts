import { useState, useEffect, useCallback } from 'react'
import { checkEligibility } from '../lib/eligibility'

interface SubjectGrade {
  subject_id: string
  subject_name: string
  grade: number
}

interface UseEligibilityCheckerProps {
  applicationId: string
  programId: string
  programName?: string
  grades: SubjectGrade[]
  enabled?: boolean
}

interface EligibilityResult {
  eligible: boolean
  message: string
  score?: number
  recommendations?: string[]
}

interface UseEligibilityCheckerReturn {
  assessment: EligibilityResult | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useEligibilityCheckerFixed({
  applicationId,
  programId,
  programName,
  grades,
  enabled = true
}: UseEligibilityCheckerProps): UseEligibilityCheckerReturn {
  const [assessment, setAssessment] = useState<EligibilityResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkEligibilityLocal = useCallback(async () => {
    if (!enabled || !programName || grades.length === 0) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Use the local eligibility checker
      const result = checkEligibility(programName, grades)
      setAssessment(result)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to check eligibility'
      setError(errorMessage)
      console.error('Eligibility check failed:', err)
      
      // Provide fallback assessment
      setAssessment({
        eligible: true,
        message: 'Unable to verify eligibility at this time. You may proceed with your application.',
        recommendations: ['Please consult with admissions for specific requirements']
      })
    } finally {
      setLoading(false)
    }
  }, [enabled, programName, grades])

  const refresh = useCallback(async () => {
    await checkEligibilityLocal()
  }, [checkEligibilityLocal])

  // Auto-check eligibility when dependencies change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      checkEligibilityLocal()
    }, 500) // Debounce for 500ms

    return () => clearTimeout(timeoutId)
  }, [checkEligibilityLocal])

  return {
    assessment,
    loading,
    error,
    refresh
  }
}