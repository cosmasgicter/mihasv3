// @ts-nocheck
/**
 * Detailed Eligibility Service
 * 
 * Service layer for integrating detailed eligibility scoring with the application system.
 * Provides methods to calculate, store, and retrieve detailed eligibility assessments.
 */

import { eligibilityEngine } from '@/lib/eligibilityEngine'
import { 
  detailedEligibilityScoringEngine,
  type DetailedEligibilityAssessment,
  type ImprovementRecommendation
} from '@/lib/detailedEligibilityScoring'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { SubjectGrade } from '@/lib/eligibility'

export interface EligibilityServiceOptions {
  includeDetailedBreakdown?: boolean
  includeRecommendations?: boolean
  includeAlternativePathways?: boolean
}

export class DetailedEligibilityService {
  
  /**
   * Calculate detailed eligibility assessment for an application
   */
  async calculateDetailedAssessment(
    applicationId: string,
    programId: string,
    grades: SubjectGrade[],
    options: EligibilityServiceOptions = {}
  ): Promise<DetailedEligibilityAssessment> {
    
    const {
      includeDetailedBreakdown = true,
      includeRecommendations = true,
      includeAlternativePathways = true
    } = options
    
    try {
      // Calculate the detailed assessment
      const assessment = await eligibilityEngine.calculateDetailedEligibilityAssessment(
        applicationId,
        programId,
        grades
      )
      
      // Filter results based on options
      if (!includeRecommendations) {
        assessment.improvementRecommendations = []
      }
      
      if (!includeAlternativePathways) {
        assessment.alternativePathways = []
      }
      
      // Save to database if configured
      if (isSupabaseConfigured) {
        await this.saveDetailedAssessment(assessment)
      }
      
      return assessment
      
    } catch (error) {
      console.error('Error calculating detailed eligibility assessment:', error)
      
      // Fallback to basic assessment
      return this.createFallbackAssessment(applicationId, programId, grades)
    }
  }
  
  /**
   * Get detailed assessment history for an application
   */
  async getAssessmentHistory(applicationId: string): Promise<DetailedEligibilityAssessment[]> {
    if (!isSupabaseConfigured) {
      return []
    }
    
    try {
      const { data, error } = await supabase
        .from('detailed_eligibility_assessments')
        .select('*')
        .eq('application_id', applicationId)
        .order('assessment_date', { ascending: false })
      
      if (error) throw error
      
      return (data || []).map(this.parseStoredAssessment)
      
    } catch (error) {
      console.error('Error fetching assessment history:', error)
      return []
    }
  }
  
  /**
   * Get the latest detailed assessment for an application
   */
  async getLatestAssessment(applicationId: string): Promise<DetailedEligibilityAssessment | null> {
    const history = await this.getAssessmentHistory(applicationId)
    return history.length > 0 ? history[0] : null
  }
  
  /**
   * Track improvement recommendation actions
   */
  async trackRecommendationAction(
    applicationId: string,
    recommendation: ImprovementRecommendation,
    action: 'viewed' | 'started' | 'completed' | 'dismissed'
  ): Promise<void> {
    if (!isSupabaseConfigured) {
      return
    }
    
    try {
      await supabase
        .from('recommendation_actions')
        .insert({
          application_id: applicationId,
          recommendation_category: recommendation.category,
          recommendation_title: recommendation.title,
          action_type: action,
          action_date: new Date().toISOString()
        })
    } catch (error) {
      console.error('Error tracking recommendation action:', error)
    }
  }
  
  /**
   * Get recommendation action history
   */
  async getRecommendationActions(applicationId: string): Promise<any[]> {
    if (!isSupabaseConfigured) {
      return []
    }
    
    try {
      const { data, error } = await supabase
        .from('recommendation_actions')
        .select('*')
        .eq('application_id', applicationId)
        .order('action_date', { ascending: false })
      
      if (error) throw error
      return data || []
      
    } catch (error) {
      console.error('Error fetching recommendation actions:', error)
      return []
    }
  }
  
  /**
   * Compare assessments to show improvement over time
   */
  async compareAssessments(
    currentAssessment: DetailedEligibilityAssessment,
    previousAssessment: DetailedEligibilityAssessment
  ): Promise<{
    scoreImprovement: number
    statusChange: string
    improvedAreas: string[]
    newWeaknesses: string[]
    recommendations: string[]
  }> {
    
    const scoreImprovement = 
      currentAssessment.scoreBreakdown.percentageScore - 
      previousAssessment.scoreBreakdown.percentageScore
    
    const statusChange = currentAssessment.eligibilityStatus !== previousAssessment.eligibilityStatus
      ? `Changed from ${previousAssessment.eligibilityStatus} to ${currentAssessment.eligibilityStatus}`
      : 'No status change'
    
    // Find improved areas
    const improvedAreas: string[] = []
    const currentStrengths = new Set(currentAssessment.scoreBreakdown.strengthAreas)
    const previousStrengths = new Set(previousAssessment.scoreBreakdown.strengthAreas)
    
    currentStrengths.forEach(area => {
      if (!previousStrengths.has(area)) {
        improvedAreas.push(area)
      }
    })
    
    // Find new weaknesses
    const newWeaknesses: string[] = []
    const currentGaps = new Set(currentAssessment.scoreBreakdown.criticalGaps)
    const previousGaps = new Set(previousAssessment.scoreBreakdown.criticalGaps)
    
    currentGaps.forEach(area => {
      if (!previousGaps.has(area)) {
        newWeaknesses.push(area)
      }
    })
    
    // Generate comparison recommendations
    const recommendations: string[] = []
    
    if (scoreImprovement > 0) {
      recommendations.push(`Great progress! Your score improved by ${scoreImprovement.toFixed(1)} points.`)
    } else if (scoreImprovement < 0) {
      recommendations.push(`Your score decreased by ${Math.abs(scoreImprovement).toFixed(1)} points. Review recent changes.`)
    }
    
    if (improvedAreas.length > 0) {
      recommendations.push(`Improved areas: ${improvedAreas.join(', ')}`)
    }
    
    if (newWeaknesses.length > 0) {
      recommendations.push(`New areas needing attention: ${newWeaknesses.join(', ')}`)
    }
    
    return {
      scoreImprovement,
      statusChange,
      improvedAreas,
      newWeaknesses,
      recommendations
    }
  }
  
  /**
   * Generate personalized study plan based on assessment
   */
  async generateStudyPlan(assessment: DetailedEligibilityAssessment): Promise<{
    shortTerm: Array<{ task: string; timeframe: string; priority: 'high' | 'medium' | 'low' }>
    longTerm: Array<{ task: string; timeframe: string; priority: 'high' | 'medium' | 'low' }>
    resources: Array<{ name: string; type: string; url?: string }>
  }> {
    
    const shortTerm: Array<{ task: string; timeframe: string; priority: 'high' | 'medium' | 'low' }> = []
    const longTerm: Array<{ task: string; timeframe: string; priority: 'high' | 'medium' | 'low' }> = []
    const resources: Array<{ name: string; type: string; url?: string }> = []
    
    // Analyze critical gaps for immediate action
    assessment.scoreBreakdown.criticalGaps.forEach(gap => {
      shortTerm.push({
        task: `Address critical gap in ${gap}`,
        timeframe: '1-3 months',
        priority: 'high'
      })
    })
    
    // Analyze improvement areas for medium-term goals
    assessment.scoreBreakdown.improvementAreas.forEach(area => {
      shortTerm.push({
        task: `Improve performance in ${area}`,
        timeframe: '3-6 months',
        priority: 'medium'
      })
    })
    
    // Add long-term goals based on recommendations
    assessment.improvementRecommendations.forEach(rec => {
      if (rec.timeframe.includes('year')) {
        longTerm.push({
          task: rec.title,
          timeframe: rec.timeframe,
          priority: rec.priority
        })
      } else {
        shortTerm.push({
          task: rec.title,
          timeframe: rec.timeframe,
          priority: rec.priority
        })
      }
      
      // Add resources from recommendations
      if (rec.resources) {
        rec.resources.forEach(resource => {
          resources.push({
            name: resource,
            type: 'recommendation'
          })
        })
      }
    })
    
    // Add general resources
    resources.push(
      { name: 'ECZ Past Papers', type: 'study_material' },
      { name: 'Grade 12 Syllabus', type: 'curriculum' },
      { name: 'Tutoring Services', type: 'support' },
      { name: 'Study Groups', type: 'peer_support' }
    )
    
    return { shortTerm, longTerm, resources }
  }
  
  /**
   * Private helper methods
   */
  
  private async saveDetailedAssessment(assessment: DetailedEligibilityAssessment): Promise<void> {
    try {
      const { error } = await supabase
        .from('detailed_eligibility_assessments')
        .upsert({
          application_id: assessment.applicationId,
          program_id: assessment.programId,
          program_name: assessment.programName,
          overall_score: assessment.scoreBreakdown.percentageScore,
          eligibility_status: assessment.eligibilityStatus,
          competitiveness_level: assessment.competitivenessLevel,
          score_breakdown: JSON.stringify(assessment.scoreBreakdown),
          improvement_recommendations: JSON.stringify(assessment.improvementRecommendations),
          alternative_pathways: JSON.stringify(assessment.alternativePathways),
          overall_feedback: assessment.overallFeedback,
          comparison_percentile: assessment.comparisonToTypicalAdmitted.percentile,
          assessment_date: assessment.assessmentDate.toISOString(),
          next_review_date: assessment.nextReviewDate?.toISOString(),
          can_proceed: assessment.canProceed
        })
      
      if (error) throw error
      
    } catch (error) {
      console.error('Error saving detailed assessment:', error)
      throw error
    }
  }
  
  private parseStoredAssessment(data: any): DetailedEligibilityAssessment {
    return {
      applicationId: data.application_id,
      programId: data.program_id,
      programName: data.program_name,
      scoreBreakdown: JSON.parse(data.score_breakdown || '{}'),
      eligibilityStatus: data.eligibility_status,
      competitivenessLevel: data.competitiveness_level,
      overallFeedback: data.overall_feedback,
      improvementRecommendations: JSON.parse(data.improvement_recommendations || '[]'),
      comparisonToTypicalAdmitted: {
        percentile: data.comparison_percentile || 50,
        explanation: data.comparison_explanation || 'No comparison data available'
      },
      alternativePathways: JSON.parse(data.alternative_pathways || '[]'),
      assessmentDate: new Date(data.assessment_date),
      canProceed: data.can_proceed !== false,
      nextReviewDate: data.next_review_date ? new Date(data.next_review_date) : undefined
    }
  }
  
  private createFallbackAssessment(
    applicationId: string,
    programId: string,
    grades: SubjectGrade[]
  ): DetailedEligibilityAssessment {
    // Create a basic assessment when detailed calculation fails
    const basicScore = grades.length >= 5 ? 60 : 40
    
    return {
      applicationId,
      programId,
      programName: 'Unknown Program',
      scoreBreakdown: {
        subjectCountScore: {
          score: basicScore,
          maxScore: 100,
          weight: 0.25,
          explanation: 'Basic subject count assessment',
          feedback: 'Unable to perform detailed analysis'
        },
        gradeAverageScore: {
          score: basicScore,
          maxScore: 100,
          weight: 0.30,
          explanation: 'Basic grade average assessment',
          feedback: 'Unable to perform detailed analysis'
        },
        coreSubjectsScore: {
          score: basicScore,
          maxScore: 100,
          weight: 0.35,
          explanation: 'Basic core subjects assessment',
          feedback: 'Unable to perform detailed analysis'
        },
        regulatoryComplianceScore: {
          score: 100,
          maxScore: 100,
          weight: 0.10,
          explanation: 'Regulatory compliance assumed',
          feedback: 'Unable to verify compliance'
        },
        totalWeightedScore: basicScore,
        maxPossibleScore: 100,
        percentageScore: basicScore,
        strengthAreas: [],
        improvementAreas: [],
        criticalGaps: []
      },
      eligibilityStatus: 'conditional',
      competitivenessLevel: 'minimum_requirements',
      overallFeedback: 'Unable to perform detailed assessment. Please ensure all required information is provided.',
      improvementRecommendations: [{
        category: 'grade_improvement',
        priority: 'medium',
        title: 'Complete Application Information',
        description: 'Provide complete grade and program information for detailed assessment.',
        actionSteps: ['Verify all grades are entered correctly', 'Ensure program selection is accurate'],
        expectedImpact: {
          scoreIncrease: 0,
          eligibilityImprovement: 'Enables detailed assessment'
        },
        timeframe: 'Immediate'
      }],
      comparisonToTypicalAdmitted: {
        percentile: 50,
        explanation: 'Unable to compare without detailed assessment'
      },
      alternativePathways: [],
      assessmentDate: new Date(),
      canProceed: true
    }
  }
}

// Export singleton instance
export const detailedEligibilityService = new DetailedEligibilityService()