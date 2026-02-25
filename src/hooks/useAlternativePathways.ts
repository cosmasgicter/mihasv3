/**
 * Alternative Pathways Hook
 * 
 * React hook for managing alternative pathway identification and improvement plans
 * in the application system.
 */

import { useState, useEffect, useCallback } from 'react'
import { alternativePathwayService, type PathwayServiceOptions } from '@/services/alternativePathwayService'
import type { AlternativePathway, PersonalizedImprovementPlan } from '@/lib/alternativePathwayEngine'
import type { SubjectGrade } from '@/lib/eligibilityEngine'

export interface UseAlternativePathwaysOptions extends PathwayServiceOptions {
  autoLoad?: boolean
  studentAge?: number
  workExperience?: number
  financialConstraints?: boolean
}

export interface UseAlternativePathwaysReturn {
  // Pathway data
  pathways: AlternativePathway[]
  improvementPlan: PersonalizedImprovementPlan | null
  pathwayHistory: AlternativePathway[]
  planHistory: PersonalizedImprovementPlan[]
  
  // Loading states
  isLoadingPathways: boolean
  isLoadingPlan: boolean
  isLoadingHistory: boolean
  
  // Error states
  pathwaysError: string | null
  planError: string | null
  historyError: string | null
  
  // Actions
  loadPathways: (
    applicationId: string,
    targetProgram: string,
    grades: SubjectGrade[]
  ) => Promise<void>
  
  generatePlan: (
    studentId: string,
    applicationId: string,
    targetProgram: string,
    grades: SubjectGrade[],
    overallScore: number,
    eligibilityStatus: string
  ) => Promise<void>
  
  loadHistory: (applicationId: string) => Promise<void>
  
  updatePlanProgress: (
    applicationId: string,
    planId: string,
    completedActions: string[],
    notes?: string
  ) => Promise<boolean>
  
  searchPathways: (criteria: {
    targetProgram?: string
    pathwayType?: string
    maxDuration?: number
    maxCost?: number
    onlineAvailable?: boolean
    partTimeAvailable?: boolean
  }) => Promise<AlternativePathway[]>
  
  // Utility functions
  refreshData: () => Promise<void>
  clearErrors: () => void
}

export function useAlternativePathways(
  options: UseAlternativePathwaysOptions = {}
): UseAlternativePathwaysReturn {
  
  const {
    autoLoad = false,
    studentAge,
    workExperience,
    financialConstraints,
    ...serviceOptions
  } = options
  
  // State management
  const [pathways, setPathways] = useState<AlternativePathway[]>([])
  const [improvementPlan, setImprovementPlan] = useState<PersonalizedImprovementPlan | null>(null)
  const [pathwayHistory, setPathwayHistory] = useState<AlternativePathway[]>([])
  const [planHistory, setPlanHistory] = useState<PersonalizedImprovementPlan[]>([])
  
  // Loading states
  const [isLoadingPathways, setIsLoadingPathways] = useState(false)
  const [isLoadingPlan, setIsLoadingPlan] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  
  // Error states
  const [pathwaysError, setPathwaysError] = useState<string | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  
  // Current context for refreshing
  const [currentContext, setCurrentContext] = useState<{
    applicationId?: string
    targetProgram?: string
    grades?: SubjectGrade[]
    studentId?: string
    overallScore?: number
    eligibilityStatus?: string
  }>({})
  
  /**
   * Load alternative pathways for a student
   */
  const loadPathways = useCallback(async (
    applicationId: string,
    targetProgram: string,
    grades: SubjectGrade[]
  ) => {
    setIsLoadingPathways(true)
    setPathwaysError(null)
    
    try {
      const result = await alternativePathwayService.getAlternativePathways(
        applicationId,
        targetProgram,
        grades,
        studentAge,
        workExperience,
        serviceOptions
      )
      
      setPathways(result)
      setCurrentContext(prev => ({
        ...prev,
        applicationId,
        targetProgram,
        grades
      }))
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load pathways'
      setPathwaysError(errorMessage)
      console.error('Error loading pathways:', error)
    } finally {
      setIsLoadingPathways(false)
    }
  }, [studentAge, workExperience, serviceOptions])
  
  /**
   * Generate personalized improvement plan
   */
  const generatePlan = useCallback(async (
    studentId: string,
    applicationId: string,
    targetProgram: string,
    grades: SubjectGrade[],
    overallScore: number,
    eligibilityStatus: string
  ) => {
    setIsLoadingPlan(true)
    setPlanError(null)
    
    try {
      const result = await alternativePathwayService.generateImprovementPlan(
        studentId,
        applicationId,
        targetProgram,
        grades,
        overallScore,
        eligibilityStatus,
        studentAge,
        workExperience,
        financialConstraints,
        serviceOptions
      )
      
      setImprovementPlan(result)
      setCurrentContext(prev => ({
        ...prev,
        studentId,
        applicationId,
        targetProgram,
        grades,
        overallScore,
        eligibilityStatus
      }))
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate improvement plan'
      setPlanError(errorMessage)
      console.error('Error generating improvement plan:', error)
    } finally {
      setIsLoadingPlan(false)
    }
  }, [studentAge, workExperience, financialConstraints, serviceOptions])
  
  /**
   * Load historical data
   */
  const loadHistory = useCallback(async (applicationId: string) => {
    setIsLoadingHistory(true)
    setHistoryError(null)
    
    try {
      const [pathwayHistoryResult, planHistoryResult] = await Promise.all([
        alternativePathwayService.getPathwayRecommendationsHistory(applicationId),
        alternativePathwayService.getImprovementPlanHistory(applicationId)
      ])
      
      setPathwayHistory(pathwayHistoryResult)
      setPlanHistory(planHistoryResult)
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load history'
      setHistoryError(errorMessage)
      console.error('Error loading history:', error)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [])
  
  /**
   * Update improvement plan progress
   */
  const updatePlanProgress = useCallback(async (
    applicationId: string,
    planId: string,
    completedActions: string[],
    notes?: string
  ): Promise<boolean> => {
    try {
      const success = await alternativePathwayService.updatePlanProgress(
        applicationId,
        planId,
        completedActions,
        notes
      )
      
      if (success) {
        // Refresh plan history to show updated progress
        await loadHistory(applicationId)
      }
      
      return success
      
    } catch (error) {
      console.error('Error updating plan progress:', error)
      return false
    }
  }, [loadHistory])
  
  /**
   * Search pathways by criteria
   */
  const searchPathways = useCallback(async (criteria: {
    targetProgram?: string
    pathwayType?: string
    maxDuration?: number
    maxCost?: number
    onlineAvailable?: boolean
    partTimeAvailable?: boolean
  }): Promise<AlternativePathway[]> => {
    try {
      return await alternativePathwayService.searchPathways(criteria)
    } catch (error) {
      console.error('Error searching pathways:', error)
      return []
    }
  }, [])
  
  /**
   * Refresh all data using current context
   */
  const refreshData = useCallback(async () => {
    const promises: Promise<void>[] = []
    
    // Refresh pathways if we have the required context
    if (currentContext.applicationId && currentContext.targetProgram && currentContext.grades) {
      promises.push(loadPathways(
        currentContext.applicationId,
        currentContext.targetProgram,
        currentContext.grades
      ))
    }
    
    // Refresh improvement plan if we have the required context
    if (
      currentContext.studentId &&
      currentContext.applicationId &&
      currentContext.targetProgram &&
      currentContext.grades &&
      currentContext.overallScore !== undefined &&
      currentContext.eligibilityStatus
    ) {
      promises.push(generatePlan(
        currentContext.studentId,
        currentContext.applicationId,
        currentContext.targetProgram,
        currentContext.grades,
        currentContext.overallScore,
        currentContext.eligibilityStatus
      ))
    }
    
    // Refresh history if we have application ID
    if (currentContext.applicationId) {
      promises.push(loadHistory(currentContext.applicationId))
    }
    
    await Promise.all(promises)
  }, [currentContext, loadPathways, generatePlan, loadHistory])
  
  /**
   * Clear all error states
   */
  const clearErrors = useCallback(() => {
    setPathwaysError(null)
    setPlanError(null)
    setHistoryError(null)
  }, [])
  
  // Auto-load data if enabled and context is available
  useEffect(() => {
    if (autoLoad && currentContext.applicationId) {
      refreshData()
    }
  }, [autoLoad, currentContext.applicationId, refreshData])
  
  return {
    // Data
    pathways,
    improvementPlan,
    pathwayHistory,
    planHistory,
    
    // Loading states
    isLoadingPathways,
    isLoadingPlan,
    isLoadingHistory,
    
    // Error states
    pathwaysError,
    planError,
    historyError,
    
    // Actions
    loadPathways,
    generatePlan,
    loadHistory,
    updatePlanProgress,
    searchPathways,
    
    // Utilities
    refreshData,
    clearErrors
  }
}

/**
 * Simplified hook for just getting pathways
 */
export function usePathwayRecommendations(
  applicationId?: string,
  targetProgram?: string,
  grades?: SubjectGrade[],
  options: UseAlternativePathwaysOptions = {}
) {
  const {
    pathways,
    isLoadingPathways,
    pathwaysError,
    loadPathways
  } = useAlternativePathways(options)
  
  useEffect(() => {
    if (applicationId && targetProgram && grades) {
      loadPathways(applicationId, targetProgram, grades)
    }
  }, [applicationId, targetProgram, grades, loadPathways])
  
  return {
    pathways,
    isLoading: isLoadingPathways,
    error: pathwaysError,
    reload: () => {
      if (applicationId && targetProgram && grades) {
        loadPathways(applicationId, targetProgram, grades)
      }
    }
  }
}

/**
 * Simplified hook for improvement plans
 */
export function useImprovementPlan(
  studentId?: string,
  applicationId?: string,
  targetProgram?: string,
  grades?: SubjectGrade[],
  overallScore?: number,
  eligibilityStatus?: string,
  options: UseAlternativePathwaysOptions = {}
) {
  const {
    improvementPlan,
    isLoadingPlan,
    planError,
    generatePlan
  } = useAlternativePathways(options)
  
  useEffect(() => {
    if (
      studentId &&
      applicationId &&
      targetProgram &&
      grades &&
      overallScore !== undefined &&
      eligibilityStatus
    ) {
      generatePlan(
        studentId,
        applicationId,
        targetProgram,
        grades,
        overallScore,
        eligibilityStatus
      )
    }
  }, [studentId, applicationId, targetProgram, grades, overallScore, eligibilityStatus, generatePlan])
  
  return {
    plan: improvementPlan,
    isLoading: isLoadingPlan,
    error: planError,
    regenerate: () => {
      if (
        studentId &&
        applicationId &&
        targetProgram &&
        grades &&
        overallScore !== undefined &&
        eligibilityStatus
      ) {
        generatePlan(
          studentId,
          applicationId,
          targetProgram,
          grades,
          overallScore,
          eligibilityStatus
        )
      }
    }
  }
}