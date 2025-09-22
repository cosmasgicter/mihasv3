import { useState, useEffect, useCallback } from 'react'
import { eligibilityEngine, EligibilityAssessment, SubjectGrade } from '../lib/eligibilityEngine'

interface UseEligibilityCheckerProps {
  applicationId: string
  programId: string
  grades: SubjectGrade[]
  enabled?: boolean
}

interface UseEligibilityCheckerReturn {
  assessment: EligibilityAssessment | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  submitAppeal: (reason: string, documents?: any[]) => Promise<void>
}

export function useEligibilityChecker({
  applicationId,
  programId,
  grades,
  enabled = true
}: UseEligibilityCheckerProps): UseEligibilityCheckerReturn {
  const [assessment, setAssessment] = useState<EligibilityAssessment | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkEligibility = useCallback(async () => {
    if (!enabled || !applicationId || !programId || grades.length === 0) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await eligibilityEngine.assessEligibility(
        applicationId,
        programId,
        grades
      )
      setAssessment(result)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to check eligibility'
      setError(errorMessage)
      console.error('Eligibility check failed:', err)
    } finally {
      setLoading(false)
    }
  }, [applicationId, programId, grades, enabled])

  const refresh = useCallback(async () => {
    await checkEligibility()
  }, [checkEligibility])

  const submitAppeal = useCallback(async (reason: string, documents: any[] = []) => {
    if (!assessment?.id) {
      throw new Error('No assessment available for appeal')
    }

    try {
      await eligibilityEngine.submitAppeal(
        applicationId,
        assessment.id,
        reason,
        documents
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit appeal'
      throw new Error(errorMessage)
    }
  }, [applicationId, assessment])

  // Auto-check eligibility when dependencies change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      checkEligibility()
    }, 500) // Debounce for 500ms

    return () => clearTimeout(timeoutId)
  }, [checkEligibility])

  return {
    assessment,
    loading,
    error,
    refresh,
    submitAppeal
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
      // This would typically call a metrics API endpoint
      // For now, we'll simulate the data structure
      const mockMetrics = {
        totalApplications: 150,
        eligibleCount: 89,
        conditionalCount: 34,
        notEligibleCount: 27,
        averageScore: 72.5,
        eligibilityRate: 82.0
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

  return {
    metrics,
    loading,
    error,
    refresh: loadMetrics
  }
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
      // This would call the Supabase API to get rules
      // Implementation would go here
      setRules([])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load rules'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [programId])

  const createRule = useCallback(async (ruleData: any) => {
    try {
      // Implementation for creating a new rule
      await loadRules() // Refresh after creation
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to create rule')
    }
  }, [loadRules])

  const updateRule = useCallback(async (ruleId: string, ruleData: any) => {
    try {
      // Implementation for updating a rule
      await loadRules() // Refresh after update
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to update rule')
    }
  }, [loadRules])

  const deleteRule = useCallback(async (ruleId: string) => {
    try {
      // Implementation for deleting a rule
      await loadRules() // Refresh after deletion
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to delete rule')
    }
  }, [loadRules])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  return {
    rules,
    loading,
    error,
    createRule,
    updateRule,
    deleteRule,
    refresh: loadRules
  }
}