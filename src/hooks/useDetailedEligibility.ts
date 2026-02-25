/**
 * useDetailedEligibility Hook
 * 
 * React hook for managing detailed eligibility assessments in components.
 * Provides methods to calculate, track, and display detailed eligibility scoring.
 */

import { useState, useEffect, useCallback } from 'react'
import { detailedEligibilityService, type EligibilityServiceOptions, type DetailedEligibilityAssessment, type ImprovementRecommendation } from '@/services/detailedEligibilityService'
import type { SubjectGrade } from '@/lib/eligibilityEngine'

export interface UseDetailedEligibilityOptions extends EligibilityServiceOptions {
  autoCalculate?: boolean
  trackActions?: boolean
}

export interface UseDetailedEligibilityReturn {
  // Current assessment state
  assessment: DetailedEligibilityAssessment | null
  isLoading: boolean
  error: string | null
  
  // Assessment history
  assessmentHistory: DetailedEligibilityAssessment[]
  
  // Actions
  calculateAssessment: (
    applicationId: string,
    programId: string,
    grades: SubjectGrade[]
  ) => Promise<void>
  
  refreshAssessment: () => Promise<void>
  
  trackRecommendationAction: (
    recommendation: ImprovementRecommendation,
    action: 'viewed' | 'started' | 'completed' | 'dismissed'
  ) => Promise<void>
  
  compareWithPrevious: () => Promise<{
    scoreImprovement: number
    statusChange: string
    improvedAreas: string[]
    newWeaknesses: string[]
    recommendations: string[]
  } | null>
  
  generateStudyPlan: () => Promise<{
    shortTerm: Array<{ task: string; timeframe: string; priority: 'high' | 'medium' | 'low' }>
    longTerm: Array<{ task: string; timeframe: string; priority: 'high' | 'medium' | 'low' }>
    resources: Array<{ name: string; type: string; url?: string }>
  } | null>
  
  // Utility functions
  getScoreImprovement: (previousScore: number) => number
  getStatusColor: (status: string) => string
  getCompetitivenessLevel: () => string
  canProceedWithApplication: () => boolean
}

export function useDetailedEligibility(
  applicationId?: string,
  options: UseDetailedEligibilityOptions = {}
): UseDetailedEligibilityReturn {
  
  const {
    autoCalculate = false,
    trackActions = true,
    includeDetailedBreakdown = true,
    includeRecommendations = true,
    includeAlternativePathways = true
  } = options
  
  // State
  const [assessment, setAssessment] = useState<DetailedEligibilityAssessment | null>(null)
  const [assessmentHistory, setAssessmentHistory] = useState<DetailedEligibilityAssessment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Load assessment history on mount
  useEffect(() => {
    if (applicationId) {
      loadAssessmentHistory()
    }
  }, [applicationId])
  
  const loadAssessmentHistory = useCallback(async () => {
    if (!applicationId) return
    
    try {
      setIsLoading(true)
      const history = await detailedEligibilityService.getAssessmentHistory(applicationId)
      setAssessmentHistory(history)
      
      // Set the latest assessment as current
      if (history.length > 0) {
        setAssessment(history[0])
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assessment history')
    } finally {
      setIsLoading(false)
    }
  }, [applicationId])
  
  const calculateAssessment = useCallback(async (
    appId: string,
    programId: string,
    grades: SubjectGrade[]
  ) => {
    try {
      setIsLoading(true)
      setError(null)
      
      const newAssessment = await detailedEligibilityService.calculateDetailedAssessment(
        appId,
        programId,
        grades,
        {
          includeDetailedBreakdown,
          includeRecommendations,
          includeAlternativePathways
        }
      )
      
      setAssessment(newAssessment)
      
      // Refresh history to include new assessment
      if (appId === applicationId) {
        await loadAssessmentHistory()
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to calculate assessment')
    } finally {
      setIsLoading(false)
    }
  }, [applicationId, includeDetailedBreakdown, includeRecommendations, includeAlternativePathways, loadAssessmentHistory])
  
  const refreshAssessment = useCallback(async () => {
    if (applicationId) {
      await loadAssessmentHistory()
    }
  }, [applicationId, loadAssessmentHistory])
  
  const trackRecommendationAction = useCallback(async (
    recommendation: ImprovementRecommendation,
    action: 'viewed' | 'started' | 'completed' | 'dismissed'
  ) => {
    if (!applicationId || !trackActions) return
    
    try {
      await detailedEligibilityService.trackRecommendationAction(
        applicationId,
        recommendation,
        action
      )
    } catch (err) {
      console.error('Failed to track recommendation action:', err)
    }
  }, [applicationId, trackActions])
  
  const compareWithPrevious = useCallback(async () => {
    if (!assessment || assessmentHistory.length < 2) {
      return null
    }
    
    try {
      const previousAssessment = assessmentHistory[1] // Second most recent
      return await detailedEligibilityService.compareAssessments(assessment, previousAssessment)
    } catch (err) {
      console.error('Failed to compare assessments:', err)
      return null
    }
  }, [assessment, assessmentHistory])
  
  const generateStudyPlan = useCallback(async () => {
    if (!assessment) return null
    
    try {
      return await detailedEligibilityService.generateStudyPlan(assessment)
    } catch (err) {
      console.error('Failed to generate study plan:', err)
      return null
    }
  }, [assessment])
  
  // Utility functions
  const getScoreImprovement = useCallback((previousScore: number): number => {
    if (!assessment) return 0
    return assessment.scoreBreakdown.percentageScore - previousScore
  }, [assessment])
  
  const getStatusColor = useCallback((status: string): string => {
    switch (status) {
      case 'excellent': return 'text-green-700 bg-green-50 border-green-200'
      case 'good': return 'text-blue-700 bg-blue-50 border-blue-200'
      case 'conditional': return 'text-yellow-700 bg-yellow-50 border-yellow-200'
      case 'needs_improvement': return 'text-orange-700 bg-orange-50 border-orange-200'
      case 'not_eligible': return 'text-red-700 bg-red-50 border-red-200'
      default: return 'text-muted-foreground bg-gray-50 border-gray-200'
    }
  }, [])
  
  const getCompetitivenessLevel = useCallback((): string => {
    if (!assessment) return 'Unknown'
    return assessment.competitivenessLevel.replace('_', ' ').toUpperCase()
  }, [assessment])
  
  const canProceedWithApplication = useCallback((): boolean => {
    return assessment?.canProceed !== false // Default to true if no assessment
  }, [assessment])
  
  return {
    // State
    assessment,
    isLoading,
    error,
    assessmentHistory,
    
    // Actions
    calculateAssessment,
    refreshAssessment,
    trackRecommendationAction,
    compareWithPrevious,
    generateStudyPlan,
    
    // Utilities
    getScoreImprovement,
    getStatusColor,
    getCompetitivenessLevel,
    canProceedWithApplication
  }
}

export default useDetailedEligibility