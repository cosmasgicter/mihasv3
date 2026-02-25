// @ts-nocheck
/**
 * Alternative Pathway Service
 * 
 * Service layer for integrating alternative pathway identification with the application system.
 * Provides methods to identify pathways, generate improvement plans, and manage pathway data.
 * 
 * Migrated from Supabase to API client.
 */

import { alternativePathwayEngine, type AlternativePathway, type PersonalizedImprovementPlan } from '@/lib/alternativePathwayEngine'
import { apiClient } from '@/services/client'
import type { SubjectGrade } from '@/lib/eligibilityEngine'

export interface PathwayServiceOptions {
  includeFinancialAnalysis?: boolean
  includeSupportResources?: boolean
  maxPathways?: number
}

export class AlternativePathwayService {
  
  /**
   * Get alternative pathways for a student
   */
  async getAlternativePathways(
    applicationId: string,
    targetProgram: string,
    grades: SubjectGrade[],
    studentAge?: number,
    workExperience?: number,
    options: PathwayServiceOptions = {}
  ): Promise<AlternativePathway[]> {
    
    const {
      maxPathways = 5
    } = options
    
    try {
      // Get pathways from the engine
      const pathways = await alternativePathwayEngine.identifyPathways(
        targetProgram,
        grades,
        studentAge,
        workExperience
      )
      
      // Store pathway recommendations (fire-and-forget)
      if (pathways.length > 0) {
        this.storePathwayRecommendations(applicationId, pathways.slice(0, maxPathways)).catch(() => {})
      }
      
      return pathways.slice(0, maxPathways)
      
    } catch (error) {
      console.error('Error getting alternative pathways:', error)
      return []
    }
  }
  
  /**
   * Generate personalized improvement plan
   */
  async generateImprovementPlan(
    studentId: string,
    applicationId: string,
    targetProgram: string,
    grades: SubjectGrade[],
    overallScore: number,
    eligibilityStatus: string,
    studentAge?: number,
    workExperience?: number,
    financialConstraints?: boolean,
    options: PathwayServiceOptions = {}
  ): Promise<PersonalizedImprovementPlan | null> {
    
    try {
      // Generate the improvement plan
      const plan = await alternativePathwayEngine.generateImprovementPlan(
        studentId,
        targetProgram,
        grades,
        overallScore,
        eligibilityStatus,
        studentAge,
        workExperience,
        financialConstraints
      )
      
      // Store the plan (fire-and-forget)
      this.storeImprovementPlan(applicationId, plan).catch(() => {})
      
      return plan
      
    } catch (error) {
      console.error('Error generating improvement plan:', error)
      return null
    }
  }
  
  /**
   * Get improvement plan history for a student
   * TODO: Backend endpoint /api/applications?action=improvement-plans does not exist yet.
   */
  async getImprovementPlanHistory(_applicationId: string): Promise<PersonalizedImprovementPlan[]> {
    // No backend endpoint exists for improvement plan history.
    return []
  }
  
  /**
   * Get pathway recommendations history
   * TODO: Backend endpoint /api/applications?action=pathway-recommendations does not exist yet.
   */
  async getPathwayRecommendationsHistory(_applicationId: string): Promise<AlternativePathway[]> {
    // No backend endpoint exists for pathway recommendations history.
    return []
  }
  
  /**
   * Update improvement plan progress
   * TODO: Backend endpoint /api/applications?action=update-plan-progress does not exist yet.
   */
  async updatePlanProgress(
    _applicationId: string,
    _planId: string,
    _completedActions: string[],
    _notes?: string
  ): Promise<boolean> {
    // No backend endpoint exists for updating plan progress.
    return false
  }
  
  /**
   * Get pathway success statistics
   * TODO: Backend endpoint /api/admin?action=pathway-statistics does not exist yet.
   */
  async getPathwayStatistics(_pathwayId: string): Promise<{
    totalStudents: number
    completionRate: number
    progressionRate: number
    averageTimeToCompletion: number
  } | null> {
    // No backend endpoint exists for pathway statistics.
    return null
  }
  
  /**
   * Search pathways by criteria
   */
  async searchPathways(criteria: {
    targetProgram?: string
    pathwayType?: string
    maxDuration?: number
    maxCost?: number
    onlineAvailable?: boolean
    partTimeAvailable?: boolean
  }): Promise<AlternativePathway[]> {
    
    try {
      // Get all pathways and filter based on criteria
      const allPathways = await alternativePathwayEngine.identifyPathways(
        criteria.targetProgram || '',
        [] // Empty grades for general search
      )
      
      return allPathways.filter(pathway => {
        if (criteria.pathwayType && pathway.type !== criteria.pathwayType) {
          return false
        }
        
        if (criteria.maxDuration && pathway.duration.months > criteria.maxDuration) {
          return false
        }
        
        if (criteria.maxCost && pathway.costs.tuitionFee > criteria.maxCost) {
          return false
        }
        
        if (criteria.onlineAvailable && !pathway.availability.onlineAvailable) {
          return false
        }
        
        if (criteria.partTimeAvailable && !pathway.duration.partTimeAvailable) {
          return false
        }
        
        return true
      })
      
    } catch (error) {
      console.error('Error searching pathways:', error)
      return []
    }
  }
  
  /**
   * Private helper methods
   */
  
  // TODO: Backend endpoint /api/applications?action=store-pathway-recommendations does not exist yet.
  private async storePathwayRecommendations(
    _applicationId: string,
    _pathways: AlternativePathway[]
  ): Promise<void> {
    // No-op: endpoint not implemented in backend.
  }
  
  // TODO: Backend endpoint /api/applications?action=store-improvement-plan does not exist yet.
  private async storeImprovementPlan(
    _applicationId: string,
    _plan: PersonalizedImprovementPlan
  ): Promise<void> {
    // No-op: endpoint not implemented in backend.
  }
  
  private parseImprovementPlan(data: any): PersonalizedImprovementPlan {
    return {
      studentId: data.student_id,
      targetProgram: data.target_program,
      currentStatus: typeof data.current_status === 'string' 
        ? JSON.parse(data.current_status) 
        : data.current_status,
      recommendedPathways: typeof data.recommended_pathways === 'string'
        ? JSON.parse(data.recommended_pathways)
        : data.recommended_pathways,
      shortTermActions: typeof data.short_term_actions === 'string'
        ? JSON.parse(data.short_term_actions)
        : data.short_term_actions,
      longTermStrategy: typeof data.long_term_strategy === 'string'
        ? JSON.parse(data.long_term_strategy)
        : data.long_term_strategy,
      supportResources: typeof data.support_resources === 'string'
        ? JSON.parse(data.support_resources)
        : data.support_resources,
      reviewSchedule: typeof data.review_schedule === 'string'
        ? JSON.parse(data.review_schedule)
        : data.review_schedule
    }
  }
  
  private parsePathwayRecommendation(data: any): AlternativePathway {
    return typeof data.pathway_data === 'string'
      ? JSON.parse(data.pathway_data)
      : data.pathway_data
  }
}

// Export singleton instance
export const alternativePathwayService = new AlternativePathwayService()
