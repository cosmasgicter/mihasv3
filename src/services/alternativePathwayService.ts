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
import type { SubjectGrade } from '@/lib/eligibility'

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
   */
  async getImprovementPlanHistory(applicationId: string): Promise<PersonalizedImprovementPlan[]> {
    try {
      const result = await apiClient.request<{ data: any[] }>(
        `/applications/${applicationId}?action=improvement-plans`
      )
      
      return result?.data?.map(this.parseImprovementPlan) || []
    } catch (error) {
      console.error('Error fetching improvement plan history:', error)
      return []
    }
  }
  
  /**
   * Get pathway recommendations history
   */
  async getPathwayRecommendationsHistory(applicationId: string): Promise<AlternativePathway[]> {
    try {
      const result = await apiClient.request<{ data: any[] }>(
        `/applications/${applicationId}?action=pathway-recommendations`
      )
      
      return result?.data?.map(this.parsePathwayRecommendation) || []
    } catch (error) {
      console.error('Error fetching pathway recommendations:', error)
      return []
    }
  }
  
  /**
   * Update improvement plan progress
   */
  async updatePlanProgress(
    applicationId: string,
    planId: string,
    completedActions: string[],
    notes?: string
  ): Promise<boolean> {
    try {
      await apiClient.request(`/applications/${applicationId}?action=update-plan-progress`, {
        method: 'POST',
        body: JSON.stringify({
          planId,
          completedActions,
          notes,
          updatedAt: new Date().toISOString()
        })
      })
      
      return true
    } catch (error) {
      console.error('Error updating plan progress:', error)
      return false
    }
  }
  
  /**
   * Get pathway success statistics
   */
  async getPathwayStatistics(pathwayId: string): Promise<{
    totalStudents: number
    completionRate: number
    progressionRate: number
    averageTimeToCompletion: number
  } | null> {
    try {
      const result = await apiClient.request<{
        totalStudents: number
        completionRate: number
        progressionRate: number
        averageTimeToCompletion: number
      }>(`/admin?action=pathway-statistics&pathwayId=${encodeURIComponent(pathwayId)}`)
      
      return result || null
    } catch (error) {
      console.error('Error fetching pathway statistics:', error)
      return null
    }
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
  
  private async storePathwayRecommendations(
    applicationId: string,
    pathways: AlternativePathway[]
  ): Promise<void> {
    try {
      const records = pathways.map(pathway => ({
        application_id: applicationId,
        pathway_id: pathway.id,
        pathway_name: pathway.name,
        pathway_type: pathway.type,
        suitability_score: pathway.suitabilityScore || 0,
        reasons_for_recommendation: pathway.reasonsForRecommendation || [],
        potential_challenges: pathway.potentialChallenges || [],
        pathway_data: pathway,
        created_at: new Date().toISOString()
      }))
      
      await apiClient.request(`/applications/${applicationId}?action=store-pathway-recommendations`, {
        method: 'POST',
        body: JSON.stringify({ records })
      })
    } catch (error) {
      console.error('Error storing pathway recommendations:', error)
    }
  }
  
  private async storeImprovementPlan(
    applicationId: string,
    plan: PersonalizedImprovementPlan
  ): Promise<void> {
    try {
      await apiClient.request(`/applications/${applicationId}?action=store-improvement-plan`, {
        method: 'POST',
        body: JSON.stringify({
          student_id: plan.studentId,
          target_program: plan.targetProgram,
          current_status: plan.currentStatus,
          recommended_pathways: plan.recommendedPathways,
          short_term_actions: plan.shortTermActions,
          long_term_strategy: plan.longTermStrategy,
          support_resources: plan.supportResources,
          review_schedule: plan.reviewSchedule,
          plan_data: plan,
          created_at: new Date().toISOString()
        })
      })
    } catch (error) {
      console.error('Error storing improvement plan:', error)
    }
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
