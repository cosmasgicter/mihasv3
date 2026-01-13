/**
 * Eligibility Appeals Hook
 * 
 * React hook for managing eligibility appeals in the application system.
 * Provides functionality for students to submit appeals and administrators to manage them.
 */

import { useState, useEffect, useCallback } from 'react'
import { eligibilityAppealsService, type AppealsServiceOptions } from '@/services/eligibilityAppealsService'
import type { EligibilityAppeal, AppealsDashboardMetrics, AppealDecisionAuditTrail } from '@/lib/eligibilityAppealsEngine'

export interface UseEligibilityAppealsOptions extends AppealsServiceOptions {
  autoLoad?: boolean
  refreshInterval?: number
}

export interface UseEligibilityAppealsReturn {
  // Data
  appeals: EligibilityAppeal[]
  currentAppeal: EligibilityAppeal | null
  dashboardMetrics: AppealsDashboardMetrics | null
  auditTrail: AppealDecisionAuditTrail | null
  
  // Loading states
  isLoading: boolean
  isSubmitting: boolean
  isUpdating: boolean
  
  // Error states
  error: string | null
  submitError: string | null
  updateError: string | null
  
  // Actions
  submitAppeal: (
    applicationId: string,
    studentId: string,
    appealData: {
      appealType: EligibilityAppeal['appealType']
      appealReason: string
      supportingEvidence: EligibilityAppeal['supportingEvidence']
      requestedChanges: EligibilityAppeal['requestedChanges']
      originalAssessment: EligibilityAppeal['originalAssessment']
    }
  ) => Promise<EligibilityAppeal | null>
  
  loadAppeal: (appealId: string) => Promise<void>
  loadStudentAppeals: (studentId: string, filters?: any) => Promise<void>
  loadDashboardAppeals: (filters?: any, pagination?: any) => Promise<void>
  loadDashboardMetrics: () => Promise<void>
  loadAuditTrail: (appealId: string) => Promise<void>
  
  assignAppeal: (appealId: string, reviewerId: string, assignedBy: string) => Promise<boolean>
  updateStatus: (appealId: string, newStatus: EligibilityAppeal['status'], updatedBy: string, notes?: string) => Promise<boolean>
  makeDecision: (appealId: string, decision: EligibilityAppeal['decision'], decisionMadeBy: string) => Promise<boolean>
  addEvidence: (appealId: string, evidence: EligibilityAppeal['supportingEvidence'][0], addedBy: string) => Promise<boolean>
  
  // Utility functions
  refreshData: () => Promise<void>
  clearErrors: () => void
  resetState: () => void
}

export function useEligibilityAppeals(
  options: UseEligibilityAppealsOptions = {}
): UseEligibilityAppealsReturn {
  
  const {
    autoLoad = false,
    refreshInterval,
    ...serviceOptions
  } = options
  
  // State management
  const [appeals, setAppeals] = useState<EligibilityAppeal[]>([])
  const [currentAppeal, setCurrentAppeal] = useState<EligibilityAppeal | null>(null)
  const [dashboardMetrics, setDashboardMetrics] = useState<AppealsDashboardMetrics | null>(null)
  const [auditTrail, setAuditTrail] = useState<AppealDecisionAuditTrail | null>(null)
  
  // Loading states
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  
  // Error states
  const [error, setError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  
  // Context for refreshing
  const [currentContext, setCurrentContext] = useState<{
    type?: 'student' | 'dashboard' | 'single'
    studentId?: string
    appealId?: string
    filters?: any
    pagination?: any
  }>({})
  
  /**
   * Submit a new appeal
   */
  const submitAppeal = useCallback(async (
    applicationId: string,
    studentId: string,
    appealData: {
      appealType: EligibilityAppeal['appealType']
      appealReason: string
      supportingEvidence: EligibilityAppeal['supportingEvidence']
      requestedChanges: EligibilityAppeal['requestedChanges']
      originalAssessment: EligibilityAppeal['originalAssessment']
    }
  ): Promise<EligibilityAppeal | null> => {
    setIsSubmitting(true)
    setSubmitError(null)
    
    try {
      const appeal = await eligibilityAppealsService.submitAppeal(
        applicationId,
        studentId,
        appealData
      )
      
      if (appeal) {
        // Add to appeals list if we're showing student appeals
        if (currentContext.type === 'student' && currentContext.studentId === studentId) {
          setAppeals(prev => [appeal, ...prev])
        }
        
        setCurrentAppeal(appeal)
      }
      
      return appeal
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit appeal'
      setSubmitError(errorMessage)
      console.error('Error submitting appeal:', error)
      return null
    } finally {
      setIsSubmitting(false)
    }
  }, [currentContext])
  
  /**
   * Load a specific appeal
   */
  const loadAppeal = useCallback(async (appealId: string) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await eligibilityAppealsService.getAppealDetails(appealId, serviceOptions)
      
      setCurrentAppeal(result.appeal)
      setCurrentContext({ type: 'single', appealId })
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load appeal'
      setError(errorMessage)
      console.error('Error loading appeal:', error)
    } finally {
      setIsLoading(false)
    }
  }, [serviceOptions])
  
  /**
   * Load appeals for a student
   */
  const loadStudentAppeals = useCallback(async (studentId: string, filters?: any) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const studentAppeals = await eligibilityAppealsService.getStudentAppeals(studentId, filters)
      
      setAppeals(studentAppeals)
      setCurrentContext({ type: 'student', studentId, filters })
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load student appeals'
      setError(errorMessage)
      console.error('Error loading student appeals:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])
  
  /**
   * Load appeals for dashboard
   */
  const loadDashboardAppeals = useCallback(async (filters?: any, pagination?: any) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await eligibilityAppealsService.getAppealsForDashboard(filters, pagination)
      
      setAppeals(result.appeals)
      setCurrentContext({ type: 'dashboard', filters, pagination })
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load dashboard appeals'
      setError(errorMessage)
      console.error('Error loading dashboard appeals:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])
  
  /**
   * Load dashboard metrics
   */
  const loadDashboardMetrics = useCallback(async () => {
    try {
      const metrics = await eligibilityAppealsService.getDashboardMetrics()
      setDashboardMetrics(metrics)
    } catch (error) {
      console.error('Error loading dashboard metrics:', error)
    }
  }, [])
  
  /**
   * Load audit trail for an appeal
   */
  const loadAuditTrail = useCallback(async (appealId: string) => {
    try {
      const trail = await eligibilityAppealsService.getAppealDetails(appealId, { includeAuditTrail: true })
      setAuditTrail(trail.auditTrail || null)
    } catch (error) {
      console.error('Error loading audit trail:', error)
    }
  }, [])
  
  /**
   * Assign appeal to reviewer
   */
  const assignAppeal = useCallback(async (
    appealId: string,
    reviewerId: string,
    assignedBy: string
  ): Promise<boolean> => {
    setIsUpdating(true)
    setUpdateError(null)
    
    try {
      const success = await eligibilityAppealsService.assignAppeal(appealId, reviewerId, assignedBy)
      
      if (success) {
        // Update the appeal in our state
        setAppeals(prev => prev.map(appeal => 
          appeal.id === appealId 
            ? { ...appeal, assignedReviewer: reviewerId, status: 'under_review' }
            : appeal
        ))
        
        if (currentAppeal?.id === appealId) {
          setCurrentAppeal(prev => prev ? {
            ...prev,
            assignedReviewer: reviewerId,
            status: 'under_review'
          } : null)
        }
      }
      
      return success
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to assign appeal'
      setUpdateError(errorMessage)
      console.error('Error assigning appeal:', error)
      return false
    } finally {
      setIsUpdating(false)
    }
  }, [currentAppeal])
  
  /**
   * Update appeal status
   */
  const updateStatus = useCallback(async (
    appealId: string,
    newStatus: EligibilityAppeal['status'],
    updatedBy: string,
    notes?: string
  ): Promise<boolean> => {
    setIsUpdating(true)
    setUpdateError(null)
    
    try {
      const success = await eligibilityAppealsService.updateAppealStatus(
        appealId,
        newStatus,
        updatedBy,
        notes
      )
      
      if (success) {
        // Update the appeal in our state
        setAppeals(prev => prev.map(appeal => 
          appeal.id === appealId 
            ? { ...appeal, status: newStatus, reviewerNotes: notes, lastUpdatedAt: new Date() }
            : appeal
        ))
        
        if (currentAppeal?.id === appealId) {
          setCurrentAppeal(prev => prev ? {
            ...prev,
            status: newStatus,
            reviewerNotes: notes,
            lastUpdatedAt: new Date()
          } : null)
        }
      }
      
      return success
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update appeal status'
      setUpdateError(errorMessage)
      console.error('Error updating appeal status:', error)
      return false
    } finally {
      setIsUpdating(false)
    }
  }, [currentAppeal])
  
  /**
   * Make decision on appeal
   */
  const makeDecision = useCallback(async (
    appealId: string,
    decision: EligibilityAppeal['decision'],
    decisionMadeBy: string
  ): Promise<boolean> => {
    setIsUpdating(true)
    setUpdateError(null)
    
    try {
      const success = await eligibilityAppealsService.makeDecision(
        appealId,
        decision,
        decisionMadeBy
      )
      
      if (success) {
        const newStatus = decision.outcome === 'approved' ? 'approved' : 'rejected'
        
        // Update the appeal in our state
        setAppeals(prev => prev.map(appeal => 
          appeal.id === appealId 
            ? { 
                ...appeal, 
                status: newStatus, 
                decision,
                actualResolutionDate: new Date(),
                lastUpdatedAt: new Date()
              }
            : appeal
        ))
        
        if (currentAppeal?.id === appealId) {
          setCurrentAppeal(prev => prev ? {
            ...prev,
            status: newStatus,
            decision,
            actualResolutionDate: new Date(),
            lastUpdatedAt: new Date()
          } : null)
        }
      }
      
      return success
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to make decision'
      setUpdateError(errorMessage)
      console.error('Error making decision:', error)
      return false
    } finally {
      setIsUpdating(false)
    }
  }, [currentAppeal])
  
  /**
   * Add supporting evidence
   */
  const addEvidence = useCallback(async (
    appealId: string,
    evidence: EligibilityAppeal['supportingEvidence'][0],
    addedBy: string
  ): Promise<boolean> => {
    setIsUpdating(true)
    setUpdateError(null)
    
    try {
      const success = await eligibilityAppealsService.addSupportingEvidence(
        appealId,
        evidence,
        addedBy
      )
      
      if (success) {
        // Update the appeal in our state
        setAppeals(prev => prev.map(appeal => 
          appeal.id === appealId 
            ? { 
                ...appeal, 
                supportingEvidence: [...appeal.supportingEvidence, { ...evidence, uploadedAt: new Date() }],
                lastUpdatedAt: new Date()
              }
            : appeal
        ))
        
        if (currentAppeal?.id === appealId) {
          setCurrentAppeal(prev => prev ? {
            ...prev,
            supportingEvidence: [...prev.supportingEvidence, { ...evidence, uploadedAt: new Date() }],
            lastUpdatedAt: new Date()
          } : null)
        }
      }
      
      return success
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add evidence'
      setUpdateError(errorMessage)
      console.error('Error adding evidence:', error)
      return false
    } finally {
      setIsUpdating(false)
    }
  }, [currentAppeal])
  
  /**
   * Refresh data based on current context
   */
  const refreshData = useCallback(async () => {
    if (currentContext.type === 'student' && currentContext.studentId) {
      await loadStudentAppeals(currentContext.studentId, currentContext.filters)
    } else if (currentContext.type === 'dashboard') {
      await loadDashboardAppeals(currentContext.filters, currentContext.pagination)
      await loadDashboardMetrics()
    } else if (currentContext.type === 'single' && currentContext.appealId) {
      await loadAppeal(currentContext.appealId)
    }
  }, [currentContext, loadStudentAppeals, loadDashboardAppeals, loadDashboardMetrics, loadAppeal])
  
  /**
   * Clear all error states
   */
  const clearErrors = useCallback(() => {
    setError(null)
    setSubmitError(null)
    setUpdateError(null)
  }, [])
  
  /**
   * Reset all state
   */
  const resetState = useCallback(() => {
    setAppeals([])
    setCurrentAppeal(null)
    setDashboardMetrics(null)
    setAuditTrail(null)
    setIsLoading(false)
    setIsSubmitting(false)
    setIsUpdating(false)
    clearErrors()
    setCurrentContext({})
  }, [clearErrors])
  
  // Auto-refresh effect
  useEffect(() => {
    if (refreshInterval && currentContext.type) {
      const interval = setInterval(refreshData, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [refreshInterval, currentContext.type, refreshData])
  
  // Auto-load effect
  useEffect(() => {
    if (autoLoad && currentContext.type) {
      refreshData()
    }
  }, [autoLoad, currentContext.type, refreshData])
  
  return {
    // Data
    appeals,
    currentAppeal,
    dashboardMetrics,
    auditTrail,
    
    // Loading states
    isLoading,
    isSubmitting,
    isUpdating,
    
    // Error states
    error,
    submitError,
    updateError,
    
    // Actions
    submitAppeal,
    loadAppeal,
    loadStudentAppeals,
    loadDashboardAppeals,
    loadDashboardMetrics,
    loadAuditTrail,
    assignAppeal,
    updateStatus,
    makeDecision,
    addEvidence,
    
    // Utilities
    refreshData,
    clearErrors,
    resetState
  }
}

/**
 * Simplified hook for student appeals
 */
export function useStudentAppeals(
  studentId?: string,
  options: UseEligibilityAppealsOptions = {}
) {
  const {
    appeals,
    isLoading,
    error,
    submitAppeal,
    loadStudentAppeals,
    addEvidence
  } = useEligibilityAppeals(options)
  
  useEffect(() => {
    if (studentId) {
      loadStudentAppeals(studentId)
    }
  }, [studentId, loadStudentAppeals])
  
  return {
    appeals,
    isLoading,
    error,
    submitAppeal: (
      applicationId: string,
      appealData: Parameters<typeof submitAppeal>[2]
    ) => studentId ? submitAppeal(applicationId, studentId, appealData) : Promise.resolve(null),
    addEvidence: (appealId: string, evidence: Parameters<typeof addEvidence>[1]) => 
      studentId ? addEvidence(appealId, evidence, studentId) : Promise.resolve(false),
    reload: () => studentId ? loadStudentAppeals(studentId) : Promise.resolve()
  }
}

/**
 * Simplified hook for admin appeals dashboard
 */
export function useAppealsManagement(
  options: UseEligibilityAppealsOptions = {}
) {
  const {
    appeals,
    dashboardMetrics,
    isLoading,
    error,
    loadDashboardAppeals,
    loadDashboardMetrics,
    assignAppeal,
    updateStatus,
    makeDecision
  } = useEligibilityAppeals(options)
  
  useEffect(() => {
    loadDashboardAppeals()
    loadDashboardMetrics()
  }, [loadDashboardAppeals, loadDashboardMetrics])
  
  return {
    appeals,
    metrics: dashboardMetrics,
    isLoading,
    error,
    assignAppeal,
    updateStatus,
    makeDecision,
    reload: () => {
      loadDashboardAppeals()
      loadDashboardMetrics()
    },
    loadWithFilters: loadDashboardAppeals
  }
}