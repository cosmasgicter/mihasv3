// Detailed Eligibility Scoring Engine with Comprehensive Breakdown
import { ZambianGradeValidator, GradeScorer } from './gradeValidation'
import { regulatoryComplianceChecker } from './regulatoryComplianceChecker'
import type { SubjectGrade } from './eligibilityEngine'

export interface ScoringComponent {
  name: string
  description: string
  weight: number
  max_score: number
  actual_score: number
  percentage: number
  status: 'excellent' | 'good' | 'satisfactory' | 'needs_improvement' | 'critical'
  feedback: string
  improvement_suggestions: string[]
}

export interface DetailedEligibilityScore {
  application_id: string
  program_code: string
  program_name: string
  overall_score: number
  overall_percentage: number
  eligibility_status: 'highly_eligible' | 'eligible' | 'conditionally_eligible' | 'not_eligible'
  competitiveness_level: 'Highly Competitive' | 'Competitive' | 'Minimum' | 'Not Competitive'
  
  // Detailed scoring components
  components: {
    academic_performance: ScoringComponent
    subject_requirements: ScoringComponent
    grade_quality: ScoringComponent
    regulatory_compliance: ScoringComponent
    competitiveness_factors: ScoringComponent
  }
  
  // Summary metrics
  total_weighted_score: number
  max_possible_score: number
  strengths: string[]
  weaknesses: string[]
  critical_issues: string[]
  improvement_recommendations: string[]
  
  // Additional context
  grade_statistics: {
    total_subjects: number
    credit_subjects: number
    average_grade: number
    best_grade: number
    worst_grade: number
    gpa: number
  }
  
  calculated_at: string
}

export interface ScoringWeights {
  academic_performance: number
  subject_requirements: number
  grade_quality: number
  regulatory_compliance: number
  competitiveness_factors: number
}

// Default scoring weights (can be customized per program)
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  academic_performance: 0.25,    // 25% - Overall academic achievement
  subject_requirements: 0.30,    // 30% - Meeting specific subject requirements
  grade_quality: 0.20,          // 20% - Quality of grades achieved
  regulatory_compliance: 0.15,   // 15% - Compliance with regulatory requirements
  competitiveness_factors: 0.10  // 10% - Additional competitive advantages
}

// Program-specific scoring weights
export const PROGRAM_SCORING_WEIGHTS: Record<string, ScoringWeights> = {
  'DCM': { // Clinical Medicine - highly competitive
    academic_performance: 0.20,
    subject_requirements: 0.35,
    grade_quality: 0.25,
    regulatory_compliance: 0.15,
    competitiveness_factors: 0.05
  },
  'DRN': { // Registered Nursing - balanced approach
    academic_performance: 0.25,
    subject_requirements: 0.30,
    grade_quality: 0.20,
    regulatory_compliance: 0.15,
    competitiveness_factors: 0.10
  },
  'DEH': { // Environmental Health - practical focus
    academic_performance: 0.30,
    subject_requirements: 0.25,
    grade_quality: 0.20,
    regulatory_compliance: 0.15,
    competitiveness_factors: 0.10
  }
}

export class EligibilityScoringEngine {
  
  /**
   * Calculates comprehensive eligibility score with detailed breakdown
   */
  calculateDetailedScore(
    applicationId: string,
    programCode: string,
    grades: SubjectGrade[],
    additionalData?: any
  ): DetailedEligibilityScore {
    
    const weights = PROGRAM_SCORING_WEIGHTS[programCode] || DEFAULT_SCORING_WEIGHTS
    const programName = this.getProgramName(programCode)
    
    // Calculate grade statistics
    const gradeStats = this.calculateGradeStatistics(grades)
    
    // Calculate individual scoring components
    const academicPerformance = this.calculateAcademicPerformance(grades, weights.academic_performance)
    const subjectRequirements = this.calculateSubjectRequirements(programCode, grades, weights.subject_requirements)
    const gradeQuality = this.calculateGradeQuality(grades, weights.grade_quality)
    const regulatoryCompliance = this.calculateRegulatoryCompliance(programCode, grades, additionalData, weights.regulatory_compliance)
    const competitivenessFactors = this.calculateCompetitivenessFactors(grades, additionalData, weights.competitiveness_factors)
    
    // Calculate overall scores
    const totalWeightedScore = 
      academicPerformance.actual_score +
      subjectRequirements.actual_score +
      gradeQuality.actual_score +
      regulatoryCompliance.actual_score +
      competitivenessFactors.actual_score
    
    const maxPossibleScore = 
      academicPerformance.max_score +
      subjectRequirements.max_score +
      gradeQuality.max_score +
      regulatoryCompliance.max_score +
      competitivenessFactors.max_score
    
    const overallPercentage = maxPossibleScore > 0 ? (totalWeightedScore / maxPossibleScore) * 100 : 0
    
    // Determine eligibility status and competitiveness
    const eligibilityStatus = this.determineEligibilityStatus(overallPercentage, [
      academicPerformance, subjectRequirements, gradeQuality, regulatoryCompliance, competitivenessFactors
    ])
    
    const competitivenessLevel = GradeScorer.determineCompetitivenessLevel(grades.map(g => g.grade))
    
    // Collect insights
    const strengths = this.identifyStrengths([
      academicPerformance, subjectRequirements, gradeQuality, regulatoryCompliance, competitivenessFactors
    ])
    
    const weaknesses = this.identifyWeaknesses([
      academicPerformance, subjectRequirements, gradeQuality, regulatoryCompliance, competitivenessFactors
    ])
    
    const criticalIssues = this.identifyCriticalIssues([
      academicPerformance, subjectRequirements, gradeQuality, regulatoryCompliance, competitivenessFactors
    ])
    
    const improvementRecommendations = this.generateImprovementRecommendations([
      academicPerformance, subjectRequirements, gradeQuality, regulatoryCompliance, competitivenessFactors
    ], grades)
    
    return {
      application_id: applicationId,
      program_code: programCode,
      program_name: programName,
      overall_score: Math.round(totalWeightedScore),
      overall_percentage: Math.round(overallPercentage),
      eligibility_status: eligibilityStatus,
      competitiveness_level: competitivenessLevel,
      
      components: {
        academic_performance: academicPerformance,
        subject_requirements: subjectRequirements,
        grade_quality: gradeQuality,
        regulatory_compliance: regulatoryCompliance,
        competitiveness_factors: competitivenessFactors
      },
      
      total_weighted_score: Math.round(totalWeightedScore),
      max_possible_score: Math.round(maxPossibleScore),
      strengths,
      weaknesses,
      critical_issues: criticalIssues,
      improvement_recommendations: improvementRecommendations,
      
      grade_statistics: gradeStats,
      calculated_at: new Date().toISOString()
    }
  }
  /**
   * Calculates academic performance component score
   */
  private calculateAcademicPerformance(grades: SubjectGrade[], weight: number): ScoringComponent {
    const maxScore = weight * 100
    const stats = ZambianGradeValidator.getGradeStatistics(grades.map(g => g.grade))
    
    let score = 0
    let feedback = ''
    let status: ScoringComponent['status'] = 'needs_improvement'
    const suggestions: string[] = []
    
    if (grades.length === 0) {
      feedback = 'No grades provided'
      suggestions.push('Add your O-Level results to calculate academic performance')
    } else {
      // Base score from GPA (higher is better in point system)
      const gpaScore = (stats.gpa / 9) * 100 // Convert to percentage
      
      // Bonus for having many subjects
      const subjectBonus = Math.min(20, (stats.count / 7) * 20) // Up to 20% bonus for 7+ subjects
      
      // Penalty for failing grades
      const failPenalty = (stats.failCount / stats.count) * 30
      
      score = Math.max(0, Math.min(100, gpaScore + subjectBonus - failPenalty))
      
      // Determine status and feedback
      if (score >= 85) {
        status = 'excellent'
        feedback = `Outstanding academic performance with ${stats.count} subjects and GPA of ${stats.gpa.toFixed(1)}`
      } else if (score >= 70) {
        status = 'good'
        feedback = `Strong academic performance with ${stats.count} subjects and GPA of ${stats.gpa.toFixed(1)}`
      } else if (score >= 55) {
        status = 'satisfactory'
        feedback = `Adequate academic performance with ${stats.count} subjects and GPA of ${stats.gpa.toFixed(1)}`
        suggestions.push('Consider improving grades in weaker subjects')
      } else {
        status = 'needs_improvement'
        feedback = `Academic performance needs improvement with ${stats.count} subjects and GPA of ${stats.gpa.toFixed(1)}`
        suggestions.push('Focus on improving overall grades')
        if (stats.failCount > 0) {
          suggestions.push(`Retake ${stats.failCount} failing subject(s)`)
        }
      }
      
      if (stats.count < 5) {
        suggestions.push(`Add ${5 - stats.count} more subjects to meet minimum requirements`)
      }
    }
    
    return {
      name: 'Academic Performance',
      description: 'Overall academic achievement based on GPA and number of subjects',
      weight,
      max_score: maxScore,
      actual_score: (score / 100) * maxScore,
      percentage: Math.round(score),
      status,
      feedback,
      improvement_suggestions: suggestions
    }
  }

  /**
   * Calculates subject requirements component score
   */
  private calculateSubjectRequirements(programCode: string, grades: SubjectGrade[], weight: number): ScoringComponent {
    const maxScore = weight * 100
    const requiredSubjects = this.getRequiredSubjects(programCode)
    
    let score = 0
    let feedback = ''
    let status: ScoringComponent['status'] = 'needs_improvement'
    const suggestions: string[] = []
    
    if (requiredSubjects.length === 0) {
      score = 100
      status = 'excellent'
      feedback = 'No specific subject requirements defined'
    } else {
      let metRequirements = 0
      const missingSubjects: string[] = []
      const weakSubjects: Array<{ subject: string; grade: number; required: number }> = []
      
      for (const required of requiredSubjects) {
        const grade = this.findSubjectGrade(grades, required.subject)
        
        if (!grade) {
          missingSubjects.push(required.subject)
        } else if (grade.grade <= required.maxGrade) {
          metRequirements++
          if (grade.grade > required.preferredGrade) {
            weakSubjects.push({
              subject: required.subject,
              grade: grade.grade,
              required: required.preferredGrade
            })
          }
        } else {
          missingSubjects.push(`${required.subject} (grade too low: ${grade.grade})`)
        }
      }
      
      score = (metRequirements / requiredSubjects.length) * 100
      
      // Determine status and feedback
      if (score === 100 && weakSubjects.length === 0) {
        status = 'excellent'
        feedback = `All ${requiredSubjects.length} subject requirements met with strong grades`
      } else if (score >= 80) {
        status = 'good'
        feedback = `${metRequirements}/${requiredSubjects.length} subject requirements met`
        if (weakSubjects.length > 0) {
          suggestions.push(`Improve grades in: ${weakSubjects.map(w => w.subject).join(', ')}`)
        }
      } else if (score >= 60) {
        status = 'satisfactory'
        feedback = `${metRequirements}/${requiredSubjects.length} subject requirements met`
        suggestions.push('Meet remaining subject requirements for better eligibility')
      } else {
        status = 'critical'
        feedback = `Only ${metRequirements}/${requiredSubjects.length} subject requirements met`
        if (missingSubjects.length > 0) {
          suggestions.push(`Add or improve: ${missingSubjects.join(', ')}`)
        }
      }
    }
    
    return {
      name: 'Subject Requirements',
      description: 'Compliance with program-specific subject requirements',
      weight,
      max_score: maxScore,
      actual_score: (score / 100) * maxScore,
      percentage: Math.round(score),
      status,
      feedback,
      improvement_suggestions: suggestions
    }
  }

  /**
   * Calculates grade quality component score
   */
  private calculateGradeQuality(grades: SubjectGrade[], weight: number): ScoringComponent {
    const maxScore = weight * 100
    const gradeValues = grades.map(g => g.grade)
    
    let score = 0
    let feedback = ''
    let status: ScoringComponent['status'] = 'needs_improvement'
    const suggestions: string[] = []
    
    if (gradeValues.length === 0) {
      feedback = 'No grades to evaluate'
      suggestions.push('Add your grades to assess quality')
    } else {
      const stats = ZambianGradeValidator.getGradeStatistics(gradeValues)
      
      // Score based on grade distribution
      const distinctionCount = gradeValues.filter(g => g <= 2).length
      const meritCount = gradeValues.filter(g => g <= 4).length
      const creditCount = stats.creditCount
      
      // Calculate quality score
      const distinctionBonus = (distinctionCount / gradeValues.length) * 40
      const meritBonus = (meritCount / gradeValues.length) * 30
      const creditBonus = (creditCount / gradeValues.length) * 30
      
      score = Math.min(100, distinctionBonus + meritBonus + creditBonus)
      
      // Determine status and feedback
      if (distinctionCount >= 3) {
        status = 'excellent'
        feedback = `Exceptional grade quality with ${distinctionCount} distinction(s) and ${creditCount} credit(s)`
      } else if (meritCount >= 3) {
        status = 'good'
        feedback = `Good grade quality with ${meritCount} merit/good grade(s) and ${creditCount} credit(s)`
      } else if (creditCount >= 5) {
        status = 'satisfactory'
        feedback = `Satisfactory grade quality with ${creditCount} credit-level grades`
        suggestions.push('Aim for more distinction and merit grades for competitive advantage')
      } else {
        status = 'needs_improvement'
        feedback = `Grade quality needs improvement - only ${creditCount} credit-level grades`
        suggestions.push('Focus on achieving more grades at credit level (6) or better')
        if (stats.failCount > 0) {
          suggestions.push(`Retake ${stats.failCount} failing subject(s)`)
        }
      }
    }
    
    return {
      name: 'Grade Quality',
      description: 'Quality and distribution of grades achieved',
      weight,
      max_score: maxScore,
      actual_score: (score / 100) * maxScore,
      percentage: Math.round(score),
      status,
      feedback,
      improvement_suggestions: suggestions
    }
  }
  /**
   * Calculates regulatory compliance component score
   */
  private calculateRegulatoryCompliance(
    programCode: string,
    grades: SubjectGrade[],
    additionalData: any,
    weight: number
  ): ScoringComponent {
    const maxScore = weight * 100
    
    let score = 100 // Start with perfect score
    let feedback = ''
    let status: ScoringComponent['status'] = 'excellent'
    const suggestions: string[] = []
    
    try {
      const complianceReport = regulatoryComplianceChecker.checkCompliance(programCode, {
        grades,
        ...additionalData
      })
      
      score = complianceReport.overall_score
      
      // Determine status based on compliance
      if (complianceReport.overall_compliance === 'compliant') {
        status = 'excellent'
        feedback = `Fully compliant with all ${complianceReport.regulatory_bodies.join(', ')} requirements`
      } else if (complianceReport.overall_compliance === 'conditional') {
        if (complianceReport.critical_violations === 0) {
          status = 'good'
          feedback = `Mostly compliant with ${complianceReport.major_violations} major and ${complianceReport.minor_violations} minor issues`
        } else {
          status = 'satisfactory'
          feedback = `Conditional compliance with ${complianceReport.critical_violations} critical issues`
        }
      } else {
        status = 'critical'
        feedback = `Non-compliant with ${complianceReport.critical_violations} critical violations`
      }
      
      // Add specific recommendations
      suggestions.push(...complianceReport.recommendations.slice(0, 3)) // Limit to top 3
      
    } catch (error) {
      score = 50
      status = 'needs_improvement'
      feedback = 'Unable to verify regulatory compliance'
      suggestions.push('Contact admissions office for compliance verification')
    }
    
    return {
      name: 'Regulatory Compliance',
      description: 'Compliance with regulatory body requirements (HPCZ, NMCZ, ECZ)',
      weight,
      max_score: maxScore,
      actual_score: (score / 100) * maxScore,
      percentage: Math.round(score),
      status,
      feedback,
      improvement_suggestions: suggestions
    }
  }

  /**
   * Calculates competitiveness factors component score
   */
  private calculateCompetitivenessFactors(
    grades: SubjectGrade[],
    additionalData: any,
    weight: number
  ): ScoringComponent {
    const maxScore = weight * 100
    const gradeValues = grades.map(g => g.grade)
    
    let score = 0
    let feedback = ''
    let status: ScoringComponent['status'] = 'satisfactory'
    const suggestions: string[] = []
    
    // Factor 1: Extra subjects beyond minimum (up to 30 points)
    const extraSubjectsBonus = Math.min(30, Math.max(0, (grades.length - 5) * 5))
    
    // Factor 2: Consistency in performance (up to 25 points)
    let consistencyBonus = 0
    if (gradeValues.length > 0) {
      const stats = ZambianGradeValidator.getGradeStatistics(gradeValues)
      const range = stats.worst! - stats.best!
      consistencyBonus = Math.max(0, 25 - (range * 3)) // Penalty for large grade range
    }
    
    // Factor 3: Leadership/extracurricular activities (up to 20 points)
    let extracurricularBonus = 0
    if (additionalData?.extracurricular_activities) {
      extracurricularBonus = Math.min(20, additionalData.extracurricular_activities.length * 5)
    }
    
    // Factor 4: Work experience/volunteering (up to 15 points)
    let experienceBonus = 0
    if (additionalData?.work_experience || additionalData?.volunteer_experience) {
      experienceBonus = 15
    }
    
    // Factor 5: Early application bonus (up to 10 points)
    let earlyApplicationBonus = 0
    if (additionalData?.application_date) {
      const appDate = new Date(additionalData.application_date)
      const deadline = new Date(additionalData.application_deadline || '2024-12-31')
      const daysEarly = Math.floor((deadline.getTime() - appDate.getTime()) / (1000 * 60 * 60 * 24))
      if (daysEarly > 30) earlyApplicationBonus = 10
      else if (daysEarly > 14) earlyApplicationBonus = 5
    }
    
    score = extraSubjectsBonus + consistencyBonus + extracurricularBonus + experienceBonus + earlyApplicationBonus
    
    // Determine status and feedback
    if (score >= 80) {
      status = 'excellent'
      feedback = 'Strong competitive advantages identified'
    } else if (score >= 60) {
      status = 'good'
      feedback = 'Good competitive positioning'
    } else if (score >= 40) {
      status = 'satisfactory'
      feedback = 'Some competitive advantages present'
    } else {
      status = 'needs_improvement'
      feedback = 'Limited competitive advantages'
      suggestions.push('Consider adding extracurricular activities or work experience')
    }
    
    // Add specific suggestions
    if (grades.length < 7) {
      suggestions.push('Consider taking additional O-Level subjects')
    }
    if (consistencyBonus < 15) {
      suggestions.push('Work on achieving more consistent grades across subjects')
    }
    if (extracurricularBonus === 0) {
      suggestions.push('Participate in leadership or community activities')
    }
    
    return {
      name: 'Competitiveness Factors',
      description: 'Additional factors that enhance competitiveness',
      weight,
      max_score: maxScore,
      actual_score: (score / 100) * maxScore,
      percentage: Math.round(score),
      status,
      feedback,
      improvement_suggestions: suggestions
    }
  }

  // Helper methods
  private calculateGradeStatistics(grades: SubjectGrade[]) {
    const gradeValues = grades.map(g => g.grade)
    const stats = ZambianGradeValidator.getGradeStatistics(gradeValues)
    
    return {
      total_subjects: stats.count,
      credit_subjects: stats.creditCount,
      average_grade: Math.round(stats.average * 10) / 10,
      best_grade: stats.best || 0,
      worst_grade: stats.worst || 0,
      gpa: Math.round(stats.gpa * 10) / 10
    }
  }

  private getProgramName(programCode: string): string {
    const programNames: Record<string, string> = {
      'DCM': 'Diploma in Clinical Medicine',
      'DRN': 'Diploma in Registered Nursing',
      'DEH': 'Diploma in Environmental Health',
      'DPC': 'Diploma in Psychosocial Counselling'
    }
    return programNames[programCode] || `Program ${programCode}`
  }

  private getRequiredSubjects(programCode: string): Array<{
    subject: string
    maxGrade: number
    preferredGrade: number
  }> {
    const requirements: Record<string, Array<{ subject: string; maxGrade: number; preferredGrade: number }>> = {
      'DCM': [
        { subject: 'english', maxGrade: 6, preferredGrade: 4 },
        { subject: 'mathematics', maxGrade: 6, preferredGrade: 4 },
        { subject: 'biology', maxGrade: 6, preferredGrade: 3 },
        { subject: 'chemistry', maxGrade: 6, preferredGrade: 4 }
      ],
      'DRN': [
        { subject: 'english', maxGrade: 6, preferredGrade: 5 },
        { subject: 'mathematics', maxGrade: 6, preferredGrade: 5 },
        { subject: 'biology', maxGrade: 6, preferredGrade: 4 }
      ],
      'DEH': [
        { subject: 'english', maxGrade: 6, preferredGrade: 5 },
        { subject: 'mathematics', maxGrade: 6, preferredGrade: 4 },
        { subject: 'biology', maxGrade: 6, preferredGrade: 4 },
        { subject: 'chemistry', maxGrade: 6, preferredGrade: 5 }
      ]
    }
    
    return requirements[programCode] || []
  }

  private findSubjectGrade(grades: SubjectGrade[], subjectName: string): SubjectGrade | undefined {
    return grades.find(g => 
      g.subject_name.toLowerCase().includes(subjectName.toLowerCase())
    )
  }
  private determineEligibilityStatus(
    overallPercentage: number,
    components: ScoringComponent[]
  ): 'highly_eligible' | 'eligible' | 'conditionally_eligible' | 'not_eligible' {
    const criticalComponents = components.filter(c => c.status === 'critical')
    const needsImprovementComponents = components.filter(c => c.status === 'needs_improvement')
    
    if (criticalComponents.length > 0) {
      return 'not_eligible'
    }
    
    if (overallPercentage >= 85 && needsImprovementComponents.length === 0) {
      return 'highly_eligible'
    }
    
    if (overallPercentage >= 70 && needsImprovementComponents.length <= 1) {
      return 'eligible'
    }
    
    if (overallPercentage >= 50) {
      return 'conditionally_eligible'
    }
    
    return 'not_eligible'
  }

  private identifyStrengths(components: ScoringComponent[]): string[] {
    const strengths: string[] = []
    
    components.forEach(component => {
      if (component.status === 'excellent') {
        strengths.push(`${component.name}: ${component.feedback}`)
      } else if (component.status === 'good' && component.percentage >= 80) {
        strengths.push(`${component.name}: Strong performance (${component.percentage}%)`)
      }
    })
    
    return strengths
  }

  private identifyWeaknesses(components: ScoringComponent[]): string[] {
    const weaknesses: string[] = []
    
    components.forEach(component => {
      if (component.status === 'needs_improvement') {
        weaknesses.push(`${component.name}: ${component.feedback}`)
      } else if (component.status === 'satisfactory' && component.percentage < 70) {
        weaknesses.push(`${component.name}: Below optimal performance (${component.percentage}%)`)
      }
    })
    
    return weaknesses
  }

  private identifyCriticalIssues(components: ScoringComponent[]): string[] {
    const criticalIssues: string[] = []
    
    components.forEach(component => {
      if (component.status === 'critical') {
        criticalIssues.push(`${component.name}: ${component.feedback}`)
      }
    })
    
    return criticalIssues
  }

  private generateImprovementRecommendations(
    components: ScoringComponent[],
    grades: SubjectGrade[]
  ): string[] {
    const recommendations: string[] = []
    
    // Collect all suggestions from components
    components.forEach(component => {
      if (component.improvement_suggestions.length > 0) {
        recommendations.push(...component.improvement_suggestions)
      }
    })
    
    // Add general recommendations based on grade analysis
    const gradeRecommendations = GradeScorer.generateImprovementRecommendations(grades.map(g => g.grade))
    recommendations.push(...gradeRecommendations)
    
    // Remove duplicates and limit to most important
    const uniqueRecommendations = [...new Set(recommendations)]
    return uniqueRecommendations.slice(0, 8) // Limit to top 8 recommendations
  }

  /**
   * Generates a summary report for easy consumption
   */
  generateSummaryReport(score: DetailedEligibilityScore): string {
    const lines: string[] = []
    
    lines.push(`ELIGIBILITY ASSESSMENT SUMMARY`)
    lines.push(`Program: ${score.program_name}`)
    lines.push(`Overall Score: ${score.overall_score}/${score.max_possible_score} (${score.overall_percentage}%)`)
    lines.push(`Status: ${score.eligibility_status.replace('_', ' ').toUpperCase()}`)
    lines.push(`Competitiveness: ${score.competitiveness_level}`)
    lines.push('')
    
    lines.push('COMPONENT BREAKDOWN:')
    Object.values(score.components).forEach(component => {
      lines.push(`• ${component.name}: ${component.percentage}% (${component.status})`)
    })
    lines.push('')
    
    if (score.strengths.length > 0) {
      lines.push('STRENGTHS:')
      score.strengths.forEach(strength => lines.push(`• ${strength}`))
      lines.push('')
    }
    
    if (score.critical_issues.length > 0) {
      lines.push('CRITICAL ISSUES:')
      score.critical_issues.forEach(issue => lines.push(`• ${issue}`))
      lines.push('')
    }
    
    if (score.improvement_recommendations.length > 0) {
      lines.push('IMPROVEMENT RECOMMENDATIONS:')
      score.improvement_recommendations.slice(0, 5).forEach(rec => lines.push(`• ${rec}`))
    }
    
    return lines.join('\n')
  }

  /**
   * Compares two eligibility scores
   */
  compareScores(score1: DetailedEligibilityScore, score2: DetailedEligibilityScore): {
    overall_improvement: number
    component_improvements: Record<string, number>
    status_change: string
    summary: string
  } {
    const overallImprovement = score2.overall_percentage - score1.overall_percentage
    
    const componentImprovements: Record<string, number> = {}
    Object.keys(score1.components).forEach(key => {
      const comp1 = score1.components[key as keyof typeof score1.components]
      const comp2 = score2.components[key as keyof typeof score2.components]
      componentImprovements[key] = comp2.percentage - comp1.percentage
    })
    
    const statusChange = score1.eligibility_status === score2.eligibility_status 
      ? 'No change' 
      : `${score1.eligibility_status} → ${score2.eligibility_status}`
    
    const summary = overallImprovement > 0 
      ? `Improved by ${overallImprovement.toFixed(1)} percentage points`
      : overallImprovement < 0 
        ? `Decreased by ${Math.abs(overallImprovement).toFixed(1)} percentage points`
        : 'No overall change'
    
    return {
      overall_improvement: overallImprovement,
      component_improvements: componentImprovements,
      status_change: statusChange,
      summary
    }
  }
}

// Export singleton instance
export const eligibilityScoringEngine = new EligibilityScoringEngine()

// Export convenience functions
export const calculateDetailedEligibilityScore = (
  applicationId: string,
  programCode: string,
  grades: SubjectGrade[],
  additionalData?: any
) => eligibilityScoringEngine.calculateDetailedScore(applicationId, programCode, grades, additionalData)

export const generateScoringSummary = (score: DetailedEligibilityScore) =>
  eligibilityScoringEngine.generateSummaryReport(score)

export const compareEligibilityScores = (score1: DetailedEligibilityScore, score2: DetailedEligibilityScore) =>
  eligibilityScoringEngine.compareScores(score1, score2)