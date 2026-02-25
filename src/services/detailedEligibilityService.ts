// @ts-nocheck
/**
 * Detailed Eligibility Service
 * 
 * Service layer for integrating detailed eligibility scoring with the application system.
 * Provides methods to calculate, store, and retrieve detailed eligibility assessments.
 * 
 * Migrated from Supabase to API client.
 */

import { eligibilityEngine, type SubjectGrade } from '@/lib/eligibilityEngine'
import { apiClient } from '@/services/client'

// Re-define the detailed types locally since the detailed scoring engine is removed.
// The service keeps its public API shape for backward compatibility.
export interface DetailedScoreBreakdown {
  subjectCountScore: { score: number; maxScore: number; weight: number; explanation: string; feedback: string }
  gradeAverageScore: { score: number; maxScore: number; weight: number; explanation: string; feedback: string }
  coreSubjectsScore: { score: number; maxScore: number; weight: number; explanation: string; feedback: string }
  regulatoryComplianceScore: { score: number; maxScore: number; weight: number; explanation: string; feedback: string }
  totalWeightedScore: number
  maxPossibleScore: number
  percentageScore: number
  strengthAreas: string[]
  improvementAreas: string[]
  criticalGaps: string[]
}

export interface ImprovementRecommendation {
  category: 'grade_improvement' | 'subject_addition' | 'regulatory_compliance' | 'alternative_pathway'
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  actionSteps: string[]
  expectedImpact: { scoreIncrease: number; eligibilityImprovement: string }
  timeframe: string
  resources?: string[]
}

export interface DetailedEligibilityAssessment {
  applicationId: string
  programId: string
  programName: string
  scoreBreakdown: DetailedScoreBreakdown
  eligibilityStatus: 'excellent' | 'good' | 'conditional' | 'needs_improvement' | 'not_eligible'
  competitivenessLevel: 'highly_competitive' | 'competitive' | 'minimum_requirements' | 'below_minimum'
  overallFeedback: string
  improvementRecommendations: ImprovementRecommendation[]
  comparisonToTypicalAdmitted: { percentile: number; explanation: string }
  alternativePathways: Array<{ name: string; description: string; requirements: string[]; timeToCompletion: string }>
  assessmentDate: Date
  canProceed: boolean
  nextReviewDate?: Date
}

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
      includeRecommendations = true,
      includeAlternativePathways = true
    } = options
    
    try {
      // Use the consolidated eligibility engine for assessment
      const engineResult = await eligibilityEngine.assessEligibility(
        applicationId,
        programId,
        grades
      )

      const assessment = this.buildDetailedFromEngine(applicationId, programId, engineResult)
      
      // Filter results based on options
      if (!includeRecommendations) {
        assessment.improvementRecommendations = []
      }
      
      if (!includeAlternativePathways) {
        assessment.alternativePathways = []
      }
      
      // Save to database (fire-and-forget)
      this.saveDetailedAssessment(assessment).catch(() => {})
      
      return assessment
      
    } catch (error) {
      console.error('Error calculating detailed eligibility assessment:', error)
      
      // Fallback to basic assessment
      return this.createFallbackAssessment(applicationId, programId, grades)
    }
  }
  
  /**
   * Get detailed assessment history for an application
   * TODO: Backend endpoint /api/applications?action=eligibility-assessments does not exist yet.
   */
  async getAssessmentHistory(_applicationId: string): Promise<DetailedEligibilityAssessment[]> {
    // No backend endpoint exists for eligibility assessment history.
    // Return empty array until the endpoint is implemented.
    return []
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
   * TODO: Backend endpoint /api/applications?action=track-recommendation does not exist yet.
   */
  async trackRecommendationAction(
    _applicationId: string,
    _recommendation: ImprovementRecommendation,
    _action: 'viewed' | 'started' | 'completed' | 'dismissed'
  ): Promise<void> {
    // No backend endpoint exists for tracking recommendation actions.
    // Silently no-op until the endpoint is implemented.
  }
  
  /**
   * Get recommendation action history
   * TODO: Backend endpoint /api/applications?action=recommendation-actions does not exist yet.
   */
  async getRecommendationActions(_applicationId: string): Promise<any[]> {
    // No backend endpoint exists for recommendation action history.
    // Return empty array until the endpoint is implemented.
    return []
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

  private buildDetailedFromEngine(
    applicationId: string,
    programId: string,
    engineResult: import('@/lib/eligibilityEngine').EligibilityAssessment
  ): DetailedEligibilityAssessment {
    const bd = engineResult.detailed_breakdown
    const pct = bd.total_weighted_score

    const mkScore = (score: number, label: string) => ({
      score,
      maxScore: 100,
      weight: 0.25,
      explanation: label,
      feedback: score >= 60 ? `✓ ${label} meets requirements` : `${label} needs improvement`,
    })

    const statusMap: Record<string, DetailedEligibilityAssessment['eligibilityStatus']> = {
      eligible: 'good',
      not_eligible: 'not_eligible',
      conditional: 'conditional',
      under_review: 'needs_improvement',
    }

    return {
      applicationId,
      programId,
      programName: programId,
      scoreBreakdown: {
        subjectCountScore: mkScore(bd.subject_count_score, 'Subject Count'),
        gradeAverageScore: mkScore(bd.grade_average_score, 'Grade Average'),
        coreSubjectsScore: mkScore(bd.core_subjects_score, 'Core Subjects'),
        regulatoryComplianceScore: mkScore(100, 'Regulatory Compliance'),
        totalWeightedScore: pct,
        maxPossibleScore: 100,
        percentageScore: pct,
        strengthAreas: [],
        improvementAreas: [],
        criticalGaps: engineResult.missing_requirements
          .filter(r => r.severity === 'critical')
          .map(r => r.description),
      },
      eligibilityStatus: statusMap[engineResult.eligibility_status] ?? 'conditional',
      competitivenessLevel: pct >= 80 ? 'competitive' : pct >= 60 ? 'minimum_requirements' : 'below_minimum',
      overallFeedback: engineResult.recommendations.join('. ') || 'Assessment complete.',
      improvementRecommendations: engineResult.missing_requirements.map(r => ({
        category: 'grade_improvement' as const,
        priority: r.severity === 'critical' ? 'high' as const : 'medium' as const,
        title: r.description,
        description: r.suggestion,
        actionSteps: [r.suggestion],
        expectedImpact: { scoreIncrease: 10, eligibilityImprovement: 'Improves eligibility' },
        timeframe: '6-12 months',
      })),
      comparisonToTypicalAdmitted: { percentile: 50, explanation: 'Comparison data not available' },
      alternativePathways: [],
      assessmentDate: new Date(),
      canProceed: true,
    }
  }

  // TODO: Backend endpoint /api/applications?action=save-eligibility-assessment does not exist yet.
  private async saveDetailedAssessment(_assessment: DetailedEligibilityAssessment): Promise<void> {
    // No-op: endpoint not implemented in backend. Assessment data is not persisted.
  }
  
  private parseStoredAssessment(data: any): DetailedEligibilityAssessment {
    return {
      applicationId: data.application_id,
      programId: data.program_id,
      programName: data.program_name,
      scoreBreakdown: typeof data.score_breakdown === 'string' ? JSON.parse(data.score_breakdown) : (data.score_breakdown || {}),
      eligibilityStatus: data.eligibility_status,
      competitivenessLevel: data.competitiveness_level,
      overallFeedback: data.overall_feedback,
      improvementRecommendations: typeof data.improvement_recommendations === 'string' ? JSON.parse(data.improvement_recommendations) : (data.improvement_recommendations || []),
      comparisonToTypicalAdmitted: {
        percentile: data.comparison_percentile || 50,
        explanation: data.comparison_explanation || 'No comparison data available'
      },
      alternativePathways: typeof data.alternative_pathways === 'string' ? JSON.parse(data.alternative_pathways) : (data.alternative_pathways || []),
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
