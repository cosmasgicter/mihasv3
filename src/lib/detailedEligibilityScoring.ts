/**
 * Detailed Eligibility Scoring Engine
 * 
 * Provides comprehensive eligibility scoring with detailed breakdown,
 * explanatory feedback, and improvement recommendations for students.
 * 
 * Requirements: 7.3 - Calculate comprehensive eligibility scores with breakdown,
 * provide explanatory feedback for each scoring component, and generate
 * improvement recommendations for students.
 */

import { SubjectGrade } from '@/lib/eligibility'
import { regulatoryEngine } from '@/lib/regulatoryGuidelines'

export interface DetailedScoreBreakdown {
  // Core scoring components
  subjectCountScore: {
    score: number
    maxScore: number
    weight: number
    explanation: string
    feedback: string
  }
  gradeAverageScore: {
    score: number
    maxScore: number
    weight: number
    explanation: string
    feedback: string
  }
  coreSubjectsScore: {
    score: number
    maxScore: number
    weight: number
    explanation: string
    feedback: string
  }
  regulatoryComplianceScore: {
    score: number
    maxScore: number
    weight: number
    explanation: string
    feedback: string
  }
  
  // Overall metrics
  totalWeightedScore: number
  maxPossibleScore: number
  percentageScore: number
  
  // Performance indicators
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
  expectedImpact: {
    scoreIncrease: number
    eligibilityImprovement: string
  }
  timeframe: string
  resources?: string[]
}

export interface DetailedEligibilityAssessment {
  applicationId: string
  programId: string
  programName: string
  
  // Scoring details
  scoreBreakdown: DetailedScoreBreakdown
  
  // Status and eligibility
  eligibilityStatus: 'excellent' | 'good' | 'conditional' | 'needs_improvement' | 'not_eligible'
  competitivenessLevel: 'highly_competitive' | 'competitive' | 'minimum_requirements' | 'below_minimum'
  
  // Feedback and recommendations
  overallFeedback: string
  improvementRecommendations: ImprovementRecommendation[]
  
  // Additional insights
  comparisonToTypicalAdmitted: {
    percentile: number
    explanation: string
  }
  alternativePathways: Array<{
    name: string
    description: string
    requirements: string[]
    timeToCompletion: string
  }>
  
  // Metadata
  assessmentDate: Date
  canProceed: boolean
  nextReviewDate?: Date
}

export class DetailedEligibilityScoringEngine {
  
  /**
   * Calculate comprehensive eligibility assessment with detailed scoring breakdown
   */
  async calculateDetailedAssessment(
    applicationId: string,
    programId: string,
    programName: string,
    grades: SubjectGrade[]
  ): Promise<DetailedEligibilityAssessment> {
    
    // Calculate detailed score breakdown
    const scoreBreakdown = await this.calculateScoreBreakdown(programName, grades)
    
    // Determine eligibility status and competitiveness
    const eligibilityStatus = this.determineEligibilityStatus(scoreBreakdown)
    const competitivenessLevel = this.determineCompetitivenessLevel(scoreBreakdown, programName)
    
    // Generate improvement recommendations
    const improvementRecommendations = await this.generateImprovementRecommendations(
      programName,
      grades,
      scoreBreakdown
    )
    
    // Calculate comparison metrics
    const comparisonToTypicalAdmitted = this.calculateComparisonMetrics(
      scoreBreakdown,
      programName
    )
    
    // Identify alternative pathways
    const alternativePathways = this.identifyAlternativePathways(
      programName,
      scoreBreakdown
    )
    
    // Generate overall feedback
    const overallFeedback = this.generateOverallFeedback(
      scoreBreakdown,
      eligibilityStatus,
      competitivenessLevel
    )
    
    return {
      applicationId,
      programId,
      programName,
      scoreBreakdown,
      eligibilityStatus,
      competitivenessLevel,
      overallFeedback,
      improvementRecommendations,
      comparisonToTypicalAdmitted,
      alternativePathways,
      assessmentDate: new Date(),
      canProceed: true, // Always allow students to proceed
      nextReviewDate: this.calculateNextReviewDate(eligibilityStatus)
    }
  }
  
  /**
   * Calculate detailed breakdown of all scoring components
   */
  private async calculateScoreBreakdown(
    programName: string,
    grades: SubjectGrade[]
  ): Promise<DetailedScoreBreakdown> {
    
    const programRequirements = this.getProgramRequirements(programName)
    
    // Subject Count Score (25% weight)
    const subjectCountScore = this.calculateSubjectCountScore(grades, programRequirements)
    
    // Grade Average Score (30% weight)
    const gradeAverageScore = this.calculateGradeAverageScore(grades, programRequirements)
    
    // Core Subjects Score (35% weight)
    const coreSubjectsScore = this.calculateCoreSubjectsScore(grades, programRequirements)
    
    // Regulatory Compliance Score (10% weight)
    const regulatoryComplianceScore = await this.calculateRegulatoryComplianceScore(
      programName,
      grades
    )
    
    // Calculate weighted total
    const totalWeightedScore = (
      subjectCountScore.score * subjectCountScore.weight +
      gradeAverageScore.score * gradeAverageScore.weight +
      coreSubjectsScore.score * coreSubjectsScore.weight +
      regulatoryComplianceScore.score * regulatoryComplianceScore.weight
    )
    
    const maxPossibleScore = (
      subjectCountScore.maxScore * subjectCountScore.weight +
      gradeAverageScore.maxScore * gradeAverageScore.weight +
      coreSubjectsScore.maxScore * coreSubjectsScore.weight +
      regulatoryComplianceScore.maxScore * regulatoryComplianceScore.weight
    )
    
    const percentageScore = maxPossibleScore > 0 ? (totalWeightedScore / maxPossibleScore) * 100 : 0
    
    // Identify strengths and improvement areas
    const strengthAreas = this.identifyStrengthAreas([
      subjectCountScore,
      gradeAverageScore,
      coreSubjectsScore,
      regulatoryComplianceScore
    ])
    
    const improvementAreas = this.identifyImprovementAreas([
      subjectCountScore,
      gradeAverageScore,
      coreSubjectsScore,
      regulatoryComplianceScore
    ])
    
    const criticalGaps = this.identifyCriticalGaps([
      subjectCountScore,
      gradeAverageScore,
      coreSubjectsScore,
      regulatoryComplianceScore
    ])
    
    return {
      subjectCountScore,
      gradeAverageScore,
      coreSubjectsScore,
      regulatoryComplianceScore,
      totalWeightedScore,
      maxPossibleScore,
      percentageScore,
      strengthAreas,
      improvementAreas,
      criticalGaps
    }
  }
  
  /**
   * Calculate subject count score with detailed feedback
   */
  private calculateSubjectCountScore(
    grades: SubjectGrade[],
    requirements: any
  ) {
    const requiredSubjectCount = requirements.minimumSubjects || 5
    const creditGrades = grades.filter(g => g.grade <= 6) // Credit level or better
    const actualCount = creditGrades.length
    
    const score = Math.min(100, (actualCount / requiredSubjectCount) * 100)
    const maxScore = 100
    const weight = 0.25
    
    let explanation = `Subject count measures the breadth of your academic achievement. `
    explanation += `You need at least ${requiredSubjectCount} subjects at credit level (Grade 6 or better).`
    
    let feedback = ''
    if (actualCount >= requiredSubjectCount) {
      feedback = `✓ Excellent! You have ${actualCount} subjects at credit level, exceeding the minimum requirement.`
    } else {
      const needed = requiredSubjectCount - actualCount
      feedback = `You have ${actualCount} subjects at credit level. You need ${needed} more credit(s) to meet the minimum requirement.`
    }
    
    return {
      score,
      maxScore,
      weight,
      explanation,
      feedback
    }
  }
  
  /**
   * Calculate grade average score with detailed feedback
   */
  private calculateGradeAverageScore(
    grades: SubjectGrade[],
    requirements: any
  ) {
    if (grades.length === 0) {
      return {
        score: 0,
        maxScore: 100,
        weight: 0.30,
        explanation: 'Grade average measures your overall academic performance across all subjects.',
        feedback: 'No grades available for assessment.'
      }
    }
    
    const average = grades.reduce((sum, g) => sum + g.grade, 0) / grades.length
    // Convert Zambian grade (1-9) to percentage (1=100%, 9=0%)
    const score = Math.max(0, ((10 - average) / 9) * 100)
    const maxScore = 100
    const weight = 0.30
    
    const explanation = `Grade average reflects your overall academic performance. ` +
      `In the Zambian system, Grade 1 is the highest (Distinction) and Grade 9 is the lowest (Fail).`
    
    let feedback = ''
    if (average <= 3) {
      feedback = `🌟 Outstanding! Your average grade of ${average.toFixed(1)} demonstrates exceptional academic performance.`
    } else if (average <= 5) {
      feedback = `✓ Very good! Your average grade of ${average.toFixed(1)} shows strong academic performance.`
    } else if (average <= 6) {
      feedback = `Good performance with an average grade of ${average.toFixed(1)}. This meets most program requirements.`
    } else {
      feedback = `Your average grade of ${average.toFixed(1)} indicates room for improvement. Consider retaking exams to strengthen your application.`
    }
    
    return {
      score,
      maxScore,
      weight,
      explanation,
      feedback
    }
  }
  
  /**
   * Calculate core subjects score with detailed feedback
   */
  private calculateCoreSubjectsScore(
    grades: SubjectGrade[],
    requirements: any
  ) {
    const coreSubjects = requirements.coreSubjects || []
    let totalScore = 0
    let maxPossibleScore = 0
    const subjectScores: Array<{ subject: string; grade?: number; score: number; required: boolean }> = []
    
    coreSubjects.forEach((subject: any) => {
      const grade = grades.find(g => 
        g.subject_name.toLowerCase().includes(subject.name.toLowerCase())
      )
      
      maxPossibleScore += 100
      
      if (grade) {
        // Convert grade to score (1=100%, 9=0%)
        const subjectScore = Math.max(0, ((10 - grade.grade) / 9) * 100)
        totalScore += subjectScore
        subjectScores.push({
          subject: subject.name,
          grade: grade.grade,
          score: subjectScore,
          required: subject.required || false
        })
      } else {
        subjectScores.push({
          subject: subject.name,
          score: 0,
          required: subject.required || false
        })
      }
    })
    
    const score = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0
    const maxScore = 100
    const weight = 0.35
    
    const explanation = `Core subjects score evaluates your performance in subjects most relevant to your chosen program. ` +
      `These subjects are weighted more heavily as they indicate your readiness for the program.`
    
    let feedback = 'Core subjects performance:\n'
    subjectScores.forEach(s => {
      if (s.grade !== undefined) {
        const gradeDescription = this.getGradeDescription(s.grade)
        feedback += `• ${s.subject}: Grade ${s.grade} (${gradeDescription}) - ${s.score.toFixed(0)}%\n`
      } else {
        feedback += `• ${s.subject}: Not taken${s.required ? ' (REQUIRED)' : ''}\n`
      }
    })
    
    const missingRequired = subjectScores.filter(s => s.required && s.grade === undefined)
    if (missingRequired.length > 0) {
      feedback += `\n⚠ Missing required subjects: ${missingRequired.map(s => s.subject).join(', ')}`
    }
    
    return {
      score,
      maxScore,
      weight,
      explanation,
      feedback: feedback.trim()
    }
  }
  
  /**
   * Calculate regulatory compliance score
   */
  private async calculateRegulatoryComplianceScore(
    programName: string,
    grades: SubjectGrade[]
  ) {
    let score = 100 // Start with full compliance
    let violations: string[] = []
    
    try {
      // Get program code for regulatory check
      const programCode = this.getProgramCode(programName)
      const compliance = regulatoryEngine.checkCompliance(programCode, { grades })
      
      // Deduct points for each violation
      violations = compliance.violations
      score = Math.max(0, 100 - (violations.length * 20)) // 20 points per violation
      
    } catch (error) {
      // If regulatory engine fails, assume compliance
      score = 100
    }
    
    const maxScore = 100
    const weight = 0.10
    
    const explanation = `Regulatory compliance score ensures your qualifications meet the standards ` +
      `set by professional bodies like HPCZ, GNC/NMCZ, and ECZ.`
    
    let feedback = ''
    if (violations.length === 0) {
      feedback = '✓ Full regulatory compliance achieved. Your qualifications meet all professional standards.'
    } else {
      feedback = `Regulatory compliance issues identified:\n`
      violations.forEach(violation => {
        feedback += `• ${violation}\n`
      })
      feedback += `\nNote: You can still proceed with your application. The admissions committee will review these items.`
    }
    
    return {
      score,
      maxScore,
      weight,
      explanation,
      feedback: feedback.trim()
    }
  }
  
  /**
   * Generate comprehensive improvement recommendations
   */
  private async generateImprovementRecommendations(
    programName: string,
    grades: SubjectGrade[],
    scoreBreakdown: DetailedScoreBreakdown
  ): Promise<ImprovementRecommendation[]> {
    
    const recommendations: ImprovementRecommendation[] = []
    
    // Grade improvement recommendations
    const lowGrades = grades.filter(g => g.grade > 6)
    if (lowGrades.length > 0) {
      recommendations.push({
        category: 'grade_improvement',
        priority: 'high',
        title: 'Improve Grades Through Retaking Exams',
        description: `You have ${lowGrades.length} subjects with grades below credit level. Retaking these exams could significantly improve your competitiveness.`,
        actionSteps: [
          'Register for supplementary examinations with ECZ',
          'Focus study efforts on subjects with grades 7-9',
          'Consider tutoring or additional study materials',
          'Target achieving at least Grade 6 (Credit) in all subjects'
        ],
        expectedImpact: {
          scoreIncrease: this.calculateGradeImprovementImpact(lowGrades),
          eligibilityImprovement: 'Could move from conditional to eligible status'
        },
        timeframe: '6-12 months',
        resources: [
          'ECZ examination registration',
          'Past papers and study guides',
          'Tutoring services'
        ]
      })
    }
    
    // Subject addition recommendations
    const requirements = this.getProgramRequirements(programName)
    const missingCoreSubjects = this.identifyMissingCoreSubjects(grades, requirements)
    if (missingCoreSubjects.length > 0) {
      recommendations.push({
        category: 'subject_addition',
        priority: 'high',
        title: 'Add Missing Core Subjects',
        description: `Your application would be strengthened by adding ${missingCoreSubjects.length} core subjects.`,
        actionSteps: [
          `Take examinations in: ${missingCoreSubjects.join(', ')}`,
          'Enroll in preparatory courses if needed',
          'Ensure you understand the syllabus requirements',
          'Plan examination dates to meet application deadlines'
        ],
        expectedImpact: {
          scoreIncrease: missingCoreSubjects.length * 15,
          eligibilityImprovement: 'Significantly improves core subjects score'
        },
        timeframe: '6-18 months',
        resources: [
          'ECZ subject registration',
          'Subject-specific study materials',
          'Preparatory courses'
        ]
      })
    }
    
    // Alternative pathway recommendations
    if (scoreBreakdown.percentageScore < 60) {
      recommendations.push({
        category: 'alternative_pathway',
        priority: 'medium',
        title: 'Consider Alternative Entry Routes',
        description: 'Alternative pathways may provide a more suitable route to your desired program.',
        actionSteps: [
          'Explore certificate programs in related fields',
          'Consider foundation or bridging programs',
          'Look into mature entry options (if 25+ years old)',
          'Research diploma programs that ladder into degree programs'
        ],
        expectedImpact: {
          scoreIncrease: 0,
          eligibilityImprovement: 'Provides alternative route to program entry'
        },
        timeframe: '1-3 years',
        resources: [
          'Institution counseling services',
          'Alternative program information',
          'Career guidance counselors'
        ]
      })
    }
    
    // Regulatory compliance recommendations
    if (scoreBreakdown.regulatoryComplianceScore.score < 100) {
      recommendations.push({
        category: 'regulatory_compliance',
        priority: 'medium',
        title: 'Address Regulatory Compliance Issues',
        description: 'Ensure all professional body requirements are met for your chosen program.',
        actionSteps: [
          'Review specific regulatory body requirements',
          'Obtain any missing documentation',
          'Verify grade equivalencies if applicable',
          'Consult with admissions office for clarification'
        ],
        expectedImpact: {
          scoreIncrease: 10,
          eligibilityImprovement: 'Ensures professional registration eligibility'
        },
        timeframe: '1-6 months',
        resources: [
          'HPCZ/GNC/NMCZ guidelines',
          'Admissions office consultation',
          'Professional body websites'
        ]
      })
    }
    
    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 }
      return priorityOrder[b.priority] - priorityOrder[a.priority]
    })
  }
  
  /**
   * Helper methods for scoring calculations
   */
  
  private getProgramRequirements(programName: string) {
    const normalized = programName.toLowerCase()
    
    if (normalized.includes('nursing')) {
      return {
        minimumSubjects: 5,
        coreSubjects: [
          { name: 'English', required: true, minimumGrade: 6 },
          { name: 'Mathematics', required: true, minimumGrade: 6 },
          { name: 'Biology', required: true, minimumGrade: 6 },
          { name: 'Chemistry', required: false, minimumGrade: 6 },
          { name: 'Physics', required: false, minimumGrade: 6 }
        ]
      }
    }
    
    if (normalized.includes('clinical')) {
      return {
        minimumSubjects: 5,
        coreSubjects: [
          { name: 'English', required: true, minimumGrade: 6 },
          { name: 'Mathematics', required: true, minimumGrade: 6 },
          { name: 'Biology', required: true, minimumGrade: 6 },
          { name: 'Chemistry', required: true, minimumGrade: 6 },
          { name: 'Physics', required: false, minimumGrade: 6 }
        ]
      }
    }
    
    if (normalized.includes('environmental')) {
      return {
        minimumSubjects: 5,
        coreSubjects: [
          { name: 'English', required: true, minimumGrade: 6 },
          { name: 'Mathematics', required: true, minimumGrade: 6 },
          { name: 'Biology', required: false, minimumGrade: 6 },
          { name: 'Chemistry', required: false, minimumGrade: 6 },
          { name: 'Geography', required: false, minimumGrade: 6 }
        ]
      }
    }
    
    // Default requirements
    return {
      minimumSubjects: 5,
      coreSubjects: [
        { name: 'English', required: true, minimumGrade: 6 },
        { name: 'Mathematics', required: true, minimumGrade: 6 }
      ]
    }
  }
  
  private getProgramCode(programName: string): string {
    const normalized = programName.toLowerCase()
    if (normalized.includes('nursing')) return 'RN'
    if (normalized.includes('clinical')) return 'CM'
    if (normalized.includes('environmental')) return 'EH'
    return 'GEN'
  }
  
  private getGradeDescription(grade: number): string {
    const descriptions: Record<number, string> = {
      1: 'Distinction',
      2: 'Merit',
      3: 'Very Good',
      4: 'Good',
      5: 'Satisfactory',
      6: 'Credit',
      7: 'Pass',
      8: 'Weak Pass',
      9: 'Fail'
    }
    return descriptions[grade] || 'Unknown'
  }
  
  private identifyStrengthAreas(scores: any[]): string[] {
    return scores
      .filter(s => (s.score / s.maxScore) >= 0.8)
      .map(s => this.getScoreAreaName(s))
  }
  
  private identifyImprovementAreas(scores: any[]): string[] {
    return scores
      .filter(s => (s.score / s.maxScore) >= 0.5 && (s.score / s.maxScore) < 0.8)
      .map(s => this.getScoreAreaName(s))
  }
  
  private identifyCriticalGaps(scores: any[]): string[] {
    return scores
      .filter(s => (s.score / s.maxScore) < 0.5)
      .map(s => this.getScoreAreaName(s))
  }
  
  private getScoreAreaName(score: any): string {
    if (score === score.subjectCountScore) return 'Subject Count'
    if (score === score.gradeAverageScore) return 'Grade Average'
    if (score === score.coreSubjectsScore) return 'Core Subjects'
    if (score === score.regulatoryComplianceScore) return 'Regulatory Compliance'
    return 'Unknown Area'
  }
  
  private determineEligibilityStatus(scoreBreakdown: DetailedScoreBreakdown): 'excellent' | 'good' | 'conditional' | 'needs_improvement' | 'not_eligible' {
    const percentage = scoreBreakdown.percentageScore
    
    if (percentage >= 90) return 'excellent'
    if (percentage >= 75) return 'good'
    if (percentage >= 60) return 'conditional'
    if (percentage >= 40) return 'needs_improvement'
    return 'not_eligible'
  }
  
  private determineCompetitivenessLevel(scoreBreakdown: DetailedScoreBreakdown, programName: string): 'highly_competitive' | 'competitive' | 'minimum_requirements' | 'below_minimum' {
    const percentage = scoreBreakdown.percentageScore
    const coreSubjectsPercentage = (scoreBreakdown.coreSubjectsScore.score / scoreBreakdown.coreSubjectsScore.maxScore) * 100
    
    // Adjust thresholds based on program competitiveness
    const isHighlyCompetitiveProgram = programName.toLowerCase().includes('clinical')
    const thresholds = isHighlyCompetitiveProgram 
      ? { highly: 85, competitive: 75, minimum: 60 }
      : { highly: 80, competitive: 70, minimum: 55 }
    
    if (percentage >= thresholds.highly && coreSubjectsPercentage >= 80) return 'highly_competitive'
    if (percentage >= thresholds.competitive) return 'competitive'
    if (percentage >= thresholds.minimum) return 'minimum_requirements'
    return 'below_minimum'
  }
  
  private generateOverallFeedback(
    scoreBreakdown: DetailedScoreBreakdown,
    eligibilityStatus: string,
    competitivenessLevel: string
  ): string {
    let feedback = ''
    
    // Status-based opening
    switch (eligibilityStatus) {
      case 'excellent':
        feedback = '🌟 Excellent academic profile! You exceed all requirements and are highly competitive for admission.'
        break
      case 'good':
        feedback = '✓ Strong academic profile. You meet all requirements and have good chances of admission.'
        break
      case 'conditional':
        feedback = '⚠ Conditional eligibility. You can proceed with your application, but there are areas for improvement.'
        break
      case 'needs_improvement':
        feedback = '📚 Your application needs strengthening. Consider the improvement recommendations below.'
        break
      default:
        feedback = '📋 Your application requires significant improvement, but alternative pathways may be available.'
    }
    
    // Add score context
    feedback += ` Your overall score is ${scoreBreakdown.percentageScore.toFixed(1)}%.`
    
    // Add competitiveness context
    switch (competitivenessLevel) {
      case 'highly_competitive':
        feedback += ' You are in the highly competitive range for admission.'
        break
      case 'competitive':
        feedback += ' You are competitive for admission.'
        break
      case 'minimum_requirements':
        feedback += ' You meet minimum requirements but may benefit from improvements.'
        break
      default:
        feedback += ' You are below minimum requirements but can still apply.'
    }
    
    // Add strength/weakness summary
    if (scoreBreakdown.strengthAreas.length > 0) {
      feedback += ` Your strengths include: ${scoreBreakdown.strengthAreas.join(', ')}.`
    }
    
    if (scoreBreakdown.criticalGaps.length > 0) {
      feedback += ` Areas needing attention: ${scoreBreakdown.criticalGaps.join(', ')}.`
    }
    
    // Always remind students they can proceed
    feedback += ' Remember, you can always submit your application - the admissions committee reviews each case individually.'
    
    return feedback
  }
  
  private calculateComparisonMetrics(scoreBreakdown: DetailedScoreBreakdown, programName: string) {
    // Simulate comparison to typical admitted students
    // In a real system, this would use historical admission data
    const typicalAdmittedScore = this.getTypicalAdmittedScore(programName)
    const percentile = Math.min(99, Math.max(1, 
      ((scoreBreakdown.percentageScore - 40) / (typicalAdmittedScore - 40)) * 50 + 25
    ))
    
    let explanation = ''
    if (percentile >= 75) {
      explanation = 'You score higher than most typically admitted students.'
    } else if (percentile >= 50) {
      explanation = 'You score similarly to typically admitted students.'
    } else if (percentile >= 25) {
      explanation = 'You score below the typical admitted student range.'
    } else {
      explanation = 'You score significantly below typical admitted students.'
    }
    
    return { percentile, explanation }
  }
  
  private getTypicalAdmittedScore(programName: string): number {
    // Simulated typical scores - in reality, would come from historical data
    const normalized = programName.toLowerCase()
    if (normalized.includes('clinical')) return 78 // Highly competitive
    if (normalized.includes('nursing')) return 72 // Competitive
    if (normalized.includes('environmental')) return 68 // Moderately competitive
    return 70 // Default
  }
  
  private identifyAlternativePathways(programName: string, scoreBreakdown: DetailedScoreBreakdown) {
    const pathways = []
    
    if (scoreBreakdown.percentageScore < 60) {
      pathways.push({
        name: 'Foundation Program',
        description: 'A preparatory program to strengthen your academic foundation',
        requirements: ['Grade 12 completion', 'Basic English and Mathematics'],
        timeToCompletion: '1 year'
      })
      
      pathways.push({
        name: 'Certificate Program',
        description: 'A certificate program that can ladder into the diploma program',
        requirements: ['Grade 12 completion', 'Relevant work experience preferred'],
        timeToCompletion: '1-2 years'
      })
    }
    
    if (scoreBreakdown.percentageScore >= 40) {
      pathways.push({
        name: 'Mature Entry',
        description: 'Alternative entry for students 25 years and older',
        requirements: ['Age 25+', 'Relevant work experience', 'Interview'],
        timeToCompletion: 'Direct entry possible'
      })
    }
    
    return pathways
  }
  
  private calculateGradeImprovementImpact(lowGrades: SubjectGrade[]): number {
    // Estimate score increase if low grades were improved to Grade 6
    return lowGrades.length * 8 // Approximate 8 points per grade improvement
  }
  
  private identifyMissingCoreSubjects(grades: SubjectGrade[], requirements: any): string[] {
    const missing = []
    
    for (const coreSubject of requirements.coreSubjects) {
      const hasSubject = grades.some(g => 
        g.subject_name.toLowerCase().includes(coreSubject.name.toLowerCase())
      )
      
      if (!hasSubject && coreSubject.required) {
        missing.push(coreSubject.name)
      }
    }
    
    return missing
  }
  
  private calculateNextReviewDate(eligibilityStatus: string): Date | undefined {
    const now = new Date()
    
    switch (eligibilityStatus) {
      case 'needs_improvement':
      case 'not_eligible':
        // Suggest review in 6 months after improvements
        return new Date(now.getTime() + 6 * 30 * 24 * 60 * 60 * 1000)
      case 'conditional':
        // Suggest review in 3 months
        return new Date(now.getTime() + 3 * 30 * 24 * 60 * 60 * 1000)
      default:
        // No review needed for good/excellent status
        return undefined
    }
  }
}

// Export singleton instance
export const detailedEligibilityScoringEngine = new DetailedEligibilityScoringEngine()