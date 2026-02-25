/**
 * Alternative Pathway Identification Engine
 * 
 * Identifies bridging programs and additional requirements for students
 * who don't meet direct entry requirements. Creates pathway recommendation
 * engine and generates personalized improvement plans.
 * 
 * Requirements: 7.4 - Identify bridging programs and additional requirements
 * for students, create pathway recommendation engine, and generate
 * personalized improvement plans.
 */

import { SubjectGrade } from '@/lib/eligibilityEngine'
import { regulatoryEngine } from '@/lib/regulatoryGuidelines'

export interface AlternativePathway {
  id: string
  name: string
  type: 'foundation' | 'certificate' | 'diploma' | 'bridging' | 'mature_entry' | 'work_experience'
  description: string
  
  // Entry requirements
  minimumRequirements: {
    grade12Required: boolean
    minimumGrade: number // Minimum grade average required
    specificSubjects?: Array<{
      subject: string
      minimumGrade: number
    }>
    ageRequirement?: number
    workExperienceYears?: number
    otherRequirements?: string[]
  }
  
  // Program details
  duration: {
    months: number
    fullTime: boolean
    partTimeAvailable: boolean
  }
  
  // Progression details
  leadsTo: {
    programs: string[]
    directEntry: boolean
    additionalRequirements?: string[]
    creditTransfer?: boolean
  }
  
  // Practical information
  availability: {
    intakes: string[] // e.g., ['January', 'September']
    locations: string[]
    onlineAvailable: boolean
  }
  
  costs: {
    tuitionFee: number
    currency: string
    additionalCosts?: string[]
  }
  
  // Success metrics
  successRate: {
    completionRate: number
    progressionRate: number // % who progress to target program
  }
  
  // Suitability scoring
  suitabilityScore?: number
  reasonsForRecommendation?: string[]
  potentialChallenges?: string[]
}

export interface PersonalizedImprovementPlan {
  studentId: string
  targetProgram: string
  currentStatus: {
    overallScore: number
    eligibilityStatus: string
    majorGaps: string[]
  }
  
  recommendedPathways: Array<{
    pathway: AlternativePathway
    suitabilityScore: number
    timeToTarget: string
    estimatedCost: number
    keyBenefits: string[]
    considerations: string[]
  }>
  
  shortTermActions: Array<{
    action: string
    timeframe: string
    priority: 'high' | 'medium' | 'low'
    estimatedCost?: number
    expectedOutcome: string
  }>
  
  longTermStrategy: {
    preferredPathway: string
    milestones: Array<{
      milestone: string
      targetDate: string
      requirements: string[]
    }>
    totalTimeframe: string
    totalEstimatedCost: number
  }
  
  supportResources: {
    counselingServices: string[]
    financialAid: string[]
    studySupport: string[]
    careerGuidance: string[]
  }
  
  reviewSchedule: {
    nextReviewDate: Date
    reviewFrequency: string
    triggerEvents: string[]
  }
}

export class AlternativePathwayEngine {
  
  private pathwayDatabase: AlternativePathway[] = [
    {
      id: 'foundation-health-sciences',
      name: 'Foundation Program in Health Sciences',
      type: 'foundation',
      description: 'A comprehensive preparatory program designed to strengthen academic foundation for health science programs',
      minimumRequirements: {
        grade12Required: true,
        minimumGrade: 7, // Pass level
        specificSubjects: [
          { subject: 'English', minimumGrade: 7 },
          { subject: 'Mathematics', minimumGrade: 7 }
        ]
      },
      duration: {
        months: 12,
        fullTime: true,
        partTimeAvailable: false
      },
      leadsTo: {
        programs: ['Registered Nursing', 'Clinical Medicine', 'Environmental Health'],
        directEntry: true,
        creditTransfer: true
      },
      availability: {
        intakes: ['January', 'September'],
        locations: ['Main Campus'],
        onlineAvailable: false
      },
      costs: {
        tuitionFee: 15000,
        currency: 'ZMW',
        additionalCosts: ['Books and materials', 'Laboratory fees']
      },
      successRate: {
        completionRate: 85,
        progressionRate: 78
      }
    },
    {
      id: 'certificate-nursing-assistant',
      name: 'Certificate in Nursing Assistant',
      type: 'certificate',
      description: 'Entry-level nursing program that provides pathway to registered nursing',
      minimumRequirements: {
        grade12Required: true,
        minimumGrade: 8, // Weak pass level
        specificSubjects: [
          { subject: 'English', minimumGrade: 7 }
        ]
      },
      duration: {
        months: 18,
        fullTime: true,
        partTimeAvailable: true
      },
      leadsTo: {
        programs: ['Registered Nursing'],
        directEntry: false,
        additionalRequirements: ['2 years work experience', 'Employer recommendation'],
        creditTransfer: true
      },
      availability: {
        intakes: ['January', 'May', 'September'],
        locations: ['Main Campus', 'Regional Centers'],
        onlineAvailable: true
      },
      costs: {
        tuitionFee: 12000,
        currency: 'ZMW',
        additionalCosts: ['Uniform and equipment', 'Clinical placement fees']
      },
      successRate: {
        completionRate: 92,
        progressionRate: 65
      }
    },
    {
      id: 'diploma-community-health',
      name: 'Diploma in Community Health',
      type: 'diploma',
      description: 'Comprehensive health program with pathways to degree programs',
      minimumRequirements: {
        grade12Required: true,
        minimumGrade: 6, // Credit level
        specificSubjects: [
          { subject: 'English', minimumGrade: 6 },
          { subject: 'Mathematics', minimumGrade: 7 },
          { subject: 'Biology', minimumGrade: 7 }
        ]
      },
      duration: {
        months: 36,
        fullTime: true,
        partTimeAvailable: false
      },
      leadsTo: {
        programs: ['Environmental Health', 'Public Health'],
        directEntry: true,
        creditTransfer: true
      },
      availability: {
        intakes: ['January'],
        locations: ['Main Campus'],
        onlineAvailable: false
      },
      costs: {
        tuitionFee: 25000,
        currency: 'ZMW',
        additionalCosts: ['Field work expenses', 'Research project costs']
      },
      successRate: {
        completionRate: 88,
        progressionRate: 72
      }
    },
    {
      id: 'bridging-science',
      name: 'Science Bridging Program',
      type: 'bridging',
      description: 'Intensive program to strengthen science background for health programs',
      minimumRequirements: {
        grade12Required: true,
        minimumGrade: 6,
        specificSubjects: [
          { subject: 'English', minimumGrade: 6 },
          { subject: 'Mathematics', minimumGrade: 6 }
        ]
      },
      duration: {
        months: 6,
        fullTime: true,
        partTimeAvailable: false
      },
      leadsTo: {
        programs: ['Clinical Medicine', 'Registered Nursing'],
        directEntry: true,
        additionalRequirements: ['Pass bridging exams with 70%+']
      },
      availability: {
        intakes: ['March', 'August'],
        locations: ['Main Campus'],
        onlineAvailable: false
      },
      costs: {
        tuitionFee: 8000,
        currency: 'ZMW',
        additionalCosts: ['Laboratory materials', 'Examination fees']
      },
      successRate: {
        completionRate: 75,
        progressionRate: 82
      }
    },
    {
      id: 'mature-entry',
      name: 'Mature Entry Assessment',
      type: 'mature_entry',
      description: 'Alternative entry route for mature students with life experience',
      minimumRequirements: {
        grade12Required: false,
        minimumGrade: 9, // Any grade
        ageRequirement: 25,
        workExperienceYears: 3,
        otherRequirements: ['Interview', 'Portfolio of experience', 'References']
      },
      duration: {
        months: 1, // Assessment period
        fullTime: false,
        partTimeAvailable: true
      },
      leadsTo: {
        programs: ['All programs'],
        directEntry: true,
        additionalRequirements: ['Pass assessment interview', 'Demonstrate competency']
      },
      availability: {
        intakes: ['Ongoing'],
        locations: ['All campuses'],
        onlineAvailable: true
      },
      costs: {
        tuitionFee: 500,
        currency: 'ZMW',
        additionalCosts: ['Assessment fees']
      },
      successRate: {
        completionRate: 95,
        progressionRate: 60
      }
    },
    {
      id: 'work-experience-entry',
      name: 'Work Experience Recognition',
      type: 'work_experience',
      description: 'Recognition of prior learning for healthcare workers',
      minimumRequirements: {
        grade12Required: true,
        minimumGrade: 8,
        workExperienceYears: 5,
        otherRequirements: ['Healthcare sector experience', 'Employer certification', 'Skills assessment']
      },
      duration: {
        months: 3, // Assessment and preparation
        fullTime: false,
        partTimeAvailable: true
      },
      leadsTo: {
        programs: ['Registered Nursing', 'Environmental Health'],
        directEntry: false,
        additionalRequirements: ['Skills demonstration', 'Competency assessment'],
        creditTransfer: true
      },
      availability: {
        intakes: ['Quarterly'],
        locations: ['Main Campus', 'Regional Centers'],
        onlineAvailable: true
      },
      costs: {
        tuitionFee: 2000,
        currency: 'ZMW',
        additionalCosts: ['Assessment fees', 'Portfolio preparation']
      },
      successRate: {
        completionRate: 90,
        progressionRate: 85
      }
    }
  ]
  
  /**
   * Identify suitable alternative pathways for a student
   */
  async identifyPathways(
    targetProgram: string,
    currentGrades: SubjectGrade[],
    studentAge?: number,
    workExperience?: number
  ): Promise<AlternativePathway[]> {
    
    const suitablePathways: Array<AlternativePathway & { suitabilityScore: number }> = []
    
    for (const pathway of this.pathwayDatabase) {
      const suitability = this.calculatePathwaySuitability(
        pathway,
        targetProgram,
        currentGrades,
        studentAge,
        workExperience
      )
      
      if (suitability.score > 0) {
        suitablePathways.push({
          ...pathway,
          suitabilityScore: suitability.score,
          reasonsForRecommendation: suitability.reasons,
          potentialChallenges: suitability.challenges
        })
      }
    }
    
    // Sort by suitability score (highest first)
    return suitablePathways
      .sort((a, b) => b.suitabilityScore - a.suitabilityScore)
      .slice(0, 5) // Return top 5 pathways
  }
  
  /**
   * Generate personalized improvement plan
   */
  async generateImprovementPlan(
    studentId: string,
    targetProgram: string,
    currentGrades: SubjectGrade[],
    overallScore: number,
    eligibilityStatus: string,
    studentAge?: number,
    workExperience?: number,
    financialConstraints?: boolean
  ): Promise<PersonalizedImprovementPlan> {
    
    // Identify major gaps
    const majorGaps = this.identifyMajorGaps(targetProgram, currentGrades, overallScore)
    
    // Get suitable pathways
    const pathways = await this.identifyPathways(
      targetProgram,
      currentGrades,
      studentAge,
      workExperience
    )
    
    // Create pathway recommendations with detailed analysis
    const recommendedPathways = pathways.map(pathway => ({
      pathway,
      suitabilityScore: pathway.suitabilityScore || 0,
      timeToTarget: this.calculateTimeToTarget(pathway, targetProgram),
      estimatedCost: this.calculateTotalCost(pathway),
      keyBenefits: this.identifyKeyBenefits(pathway, majorGaps),
      considerations: this.identifyConsiderations(pathway, financialConstraints)
    }))
    
    // Generate short-term actions
    const shortTermActions = this.generateShortTermActions(
      currentGrades,
      majorGaps,
      recommendedPathways[0]?.pathway
    )
    
    // Create long-term strategy
    const longTermStrategy = this.createLongTermStrategy(
      targetProgram,
      recommendedPathways[0]?.pathway,
      shortTermActions
    )
    
    // Identify support resources
    const supportResources = this.identifySupportResources(
      eligibilityStatus,
      financialConstraints
    )
    
    // Set review schedule
    const reviewSchedule = this.createReviewSchedule(eligibilityStatus)
    
    return {
      studentId,
      targetProgram,
      currentStatus: {
        overallScore,
        eligibilityStatus,
        majorGaps
      },
      recommendedPathways,
      shortTermActions,
      longTermStrategy,
      supportResources,
      reviewSchedule
    }
  }
  
  /**
   * Calculate pathway suitability score
   */
  private calculatePathwaySuitability(
    pathway: AlternativePathway,
    targetProgram: string,
    currentGrades: SubjectGrade[],
    studentAge?: number,
    workExperience?: number
  ): { score: number; reasons: string[]; challenges: string[] } {
    
    let score = 0
    const reasons: string[] = []
    const challenges: string[] = []
    
    // Check if pathway leads to target program
    const leadsToTarget = pathway.leadsTo.programs.some(program => 
      program.toLowerCase().includes(targetProgram.toLowerCase()) ||
      targetProgram.toLowerCase().includes(program.toLowerCase())
    )
    
    if (!leadsToTarget) {
      return { score: 0, reasons: [], challenges: ['Does not lead to target program'] }
    }
    
    score += 30 // Base score for leading to target
    reasons.push(`Leads to ${targetProgram}`)
    
    // Check grade requirements
    const gradeAverage = currentGrades.length > 0 
      ? currentGrades.reduce((sum, g) => sum + g.grade, 0) / currentGrades.length
      : 9
    
    if (gradeAverage <= pathway.minimumRequirements.minimumGrade) {
      score += 25
      reasons.push('Meets grade requirements')
    } else {
      const gap = gradeAverage - pathway.minimumRequirements.minimumGrade
      if (gap <= 1) {
        score += 15
        reasons.push('Close to grade requirements')
        challenges.push('May need slight grade improvement')
      } else {
        score += 5
        challenges.push('Significant grade improvement needed')
      }
    }
    
    // Check specific subject requirements
    if (pathway.minimumRequirements.specificSubjects) {
      let metSubjects = 0
      let totalSubjects = pathway.minimumRequirements.specificSubjects.length
      
      for (const reqSubject of pathway.minimumRequirements.specificSubjects) {
        const studentGrade = currentGrades.find(g => 
          g.subject_name.toLowerCase().includes(reqSubject.subject.toLowerCase())
        )
        
        if (studentGrade && studentGrade.grade <= reqSubject.minimumGrade) {
          metSubjects++
        }
      }
      
      const subjectScore = (metSubjects / totalSubjects) * 20
      score += subjectScore
      
      if (metSubjects === totalSubjects) {
        reasons.push('Meets all subject requirements')
      } else {
        challenges.push(`Need to improve ${totalSubjects - metSubjects} subject(s)`)
      }
    }
    
    // Check age requirements
    if (pathway.minimumRequirements.ageRequirement) {
      if (studentAge && studentAge >= pathway.minimumRequirements.ageRequirement) {
        score += 15
        reasons.push('Meets age requirement')
      } else {
        challenges.push(`Must be ${pathway.minimumRequirements.ageRequirement}+ years old`)
      }
    } else {
      score += 10 // No age restriction is generally good
    }
    
    // Check work experience requirements
    if (pathway.minimumRequirements.workExperienceYears) {
      if (workExperience && workExperience >= pathway.minimumRequirements.workExperienceYears) {
        score += 10
        reasons.push('Meets work experience requirement')
      } else {
        challenges.push(`Need ${pathway.minimumRequirements.workExperienceYears} years work experience`)
      }
    }
    
    // Bonus for high success rates
    if (pathway.successRate.completionRate >= 85) {
      score += 5
      reasons.push('High completion rate')
    }
    
    if (pathway.successRate.progressionRate >= 75) {
      score += 5
      reasons.push('High progression rate to target programs')
    }
    
    // Bonus for flexible options
    if (pathway.duration.partTimeAvailable) {
      score += 3
      reasons.push('Part-time option available')
    }
    
    if (pathway.availability.onlineAvailable) {
      score += 3
      reasons.push('Online learning available')
    }
    
    return { score: Math.min(100, score), reasons, challenges }
  }
  
  /**
   * Identify major gaps in student's profile
   */
  private identifyMajorGaps(
    targetProgram: string,
    currentGrades: SubjectGrade[],
    overallScore: number
  ): string[] {
    
    const gaps: string[] = []
    
    // Overall score gaps
    if (overallScore < 40) {
      gaps.push('Overall academic performance needs significant improvement')
    } else if (overallScore < 60) {
      gaps.push('Overall academic performance needs improvement')
    }
    
    // Subject-specific gaps
    const requiredSubjects = this.getRequiredSubjects(targetProgram)
    
    for (const required of requiredSubjects) {
      const studentGrade = currentGrades.find(g => 
        g.subject_name.toLowerCase().includes(required.subject.toLowerCase())
      )
      
      if (!studentGrade) {
        gaps.push(`Missing required subject: ${required.subject}`)
      } else if (studentGrade.grade > required.minimumGrade) {
        gaps.push(`${required.subject} grade needs improvement (current: ${studentGrade.grade}, required: ${required.minimumGrade})`)
      }
    }
    
    // Grade average gap
    if (currentGrades.length > 0) {
      const average = currentGrades.reduce((sum, g) => sum + g.grade, 0) / currentGrades.length
      if (average > 6) {
        gaps.push('Grade average below credit level')
      }
    }
    
    return gaps
  }
  
  /**
   * Generate short-term actionable steps
   */
  private generateShortTermActions(
    currentGrades: SubjectGrade[],
    majorGaps: string[],
    recommendedPathway?: AlternativePathway
  ) {
    const actions = []
    
    // Grade improvement actions
    const lowGrades = currentGrades.filter(g => g.grade > 6)
    if (lowGrades.length > 0) {
      actions.push({
        action: `Retake ${lowGrades.length} subjects with grades below credit level`,
        timeframe: '6-12 months',
        priority: 'high' as const,
        estimatedCost: lowGrades.length * 500,
        expectedOutcome: 'Improve overall grade average and meet minimum requirements'
      })
    }
    
    // Missing subject actions
    const missingSubjects = majorGaps.filter(gap => gap.includes('Missing required subject'))
    if (missingSubjects.length > 0) {
      actions.push({
        action: 'Take missing required subjects',
        timeframe: '6-18 months',
        priority: 'high' as const,
        estimatedCost: missingSubjects.length * 800,
        expectedOutcome: 'Complete all required subjects for program entry'
      })
    }
    
    // Pathway preparation actions
    if (recommendedPathway) {
      actions.push({
        action: `Apply for ${recommendedPathway.name}`,
        timeframe: '1-3 months',
        priority: 'medium' as const,
        estimatedCost: 200,
        expectedOutcome: 'Secure place in alternative pathway program'
      })
      
      if (recommendedPathway.minimumRequirements.otherRequirements) {
        actions.push({
          action: `Prepare additional requirements: ${recommendedPathway.minimumRequirements.otherRequirements.join(', ')}`,
          timeframe: '2-6 months',
          priority: 'medium' as const,
          expectedOutcome: 'Meet all entry requirements for pathway program'
        })
      }
    }
    
    // Study support actions
    actions.push({
      action: 'Seek academic counseling and study support',
      timeframe: '1 month',
      priority: 'medium' as const,
      expectedOutcome: 'Develop effective study strategies and support network'
    })
    
    return actions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 }
      return priorityOrder[b.priority] - priorityOrder[a.priority]
    })
  }
  
  /**
   * Create long-term strategy
   */
  private createLongTermStrategy(
    targetProgram: string,
    recommendedPathway?: AlternativePathway,
    shortTermActions: any[] = []
  ) {
    const milestones = []
    let totalTimeframe = '2-4 years'
    let totalCost = 0
    
    if (recommendedPathway) {
      // Pathway completion milestone
      milestones.push({
        milestone: `Complete ${recommendedPathway.name}`,
        targetDate: new Date(Date.now() + recommendedPathway.duration.months * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        requirements: [
          'Meet all entry requirements',
          'Maintain good academic standing',
          'Complete all coursework and assessments'
        ]
      })
      
      totalCost += recommendedPathway.costs.tuitionFee
      
      // Progression milestone
      if (!recommendedPathway.leadsTo.directEntry) {
        milestones.push({
          milestone: 'Meet progression requirements',
          targetDate: new Date(Date.now() + (recommendedPathway.duration.months + 6) * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          requirements: recommendedPathway.leadsTo.additionalRequirements || []
        })
      }
      
      // Target program entry
      const targetDate = new Date(Date.now() + (recommendedPathway.duration.months + 12) * 30 * 24 * 60 * 60 * 1000)
      milestones.push({
        milestone: `Begin ${targetProgram}`,
        targetDate: targetDate.toISOString().split('T')[0],
        requirements: [
          'Complete pathway program successfully',
          'Meet all progression requirements',
          'Submit application for target program'
        ]
      })
      
      totalTimeframe = `${Math.ceil((recommendedPathway.duration.months + 12) / 12)} years`
    }
    
    // Add costs from short-term actions
    totalCost += shortTermActions.reduce((sum, action) => sum + (action.estimatedCost || 0), 0)
    
    return {
      preferredPathway: recommendedPathway?.name || 'Direct improvement approach',
      milestones,
      totalTimeframe,
      totalEstimatedCost: totalCost
    }
  }
  
  /**
   * Helper methods
   */
  
  private getRequiredSubjects(targetProgram: string) {
    const normalized = targetProgram.toLowerCase()
    
    if (normalized.includes('nursing')) {
      return [
        { subject: 'English', minimumGrade: 6 },
        { subject: 'Mathematics', minimumGrade: 6 },
        { subject: 'Biology', minimumGrade: 6 }
      ]
    }
    
    if (normalized.includes('clinical')) {
      return [
        { subject: 'English', minimumGrade: 6 },
        { subject: 'Mathematics', minimumGrade: 6 },
        { subject: 'Biology', minimumGrade: 6 },
        { subject: 'Chemistry', minimumGrade: 6 }
      ]
    }
    
    if (normalized.includes('environmental')) {
      return [
        { subject: 'English', minimumGrade: 6 },
        { subject: 'Mathematics', minimumGrade: 6 },
        { subject: 'Biology', minimumGrade: 7 }
      ]
    }
    
    return [
      { subject: 'English', minimumGrade: 6 },
      { subject: 'Mathematics', minimumGrade: 6 }
    ]
  }
  
  private calculateTimeToTarget(pathway: AlternativePathway, targetProgram: string): string {
    let months = pathway.duration.months
    
    if (!pathway.leadsTo.directEntry) {
      months += 12 // Additional time for progression requirements
    }
    
    const years = Math.ceil(months / 12)
    return years === 1 ? '1 year' : `${years} years`
  }
  
  private calculateTotalCost(pathway: AlternativePathway): number {
    let cost = pathway.costs.tuitionFee
    
    // Add estimated additional costs
    if (pathway.costs.additionalCosts) {
      cost += pathway.costs.additionalCosts.length * 1000 // Estimate
    }
    
    return cost
  }
  
  private identifyKeyBenefits(pathway: AlternativePathway, majorGaps: string[]): string[] {
    const benefits = []
    
    if (pathway.leadsTo.directEntry) {
      benefits.push('Direct entry to target program upon completion')
    }
    
    if (pathway.leadsTo.creditTransfer) {
      benefits.push('Credits transfer to degree program')
    }
    
    if (pathway.successRate.completionRate >= 85) {
      benefits.push('High success rate among students')
    }
    
    if (pathway.duration.partTimeAvailable) {
      benefits.push('Flexible part-time study options')
    }
    
    if (pathway.availability.onlineAvailable) {
      benefits.push('Online learning components available')
    }
    
    if (majorGaps.some(gap => gap.includes('grade'))) {
      benefits.push('Provides opportunity to strengthen academic foundation')
    }
    
    return benefits
  }
  
  private identifyConsiderations(pathway: AlternativePathway, financialConstraints?: boolean): string[] {
    const considerations = []
    
    if (financialConstraints && pathway.costs.tuitionFee > 15000) {
      considerations.push('Higher cost program - explore financial aid options')
    }
    
    if (!pathway.duration.partTimeAvailable) {
      considerations.push('Full-time commitment required')
    }
    
    if (pathway.availability.intakes.length <= 2) {
      considerations.push('Limited intake opportunities - plan application timing carefully')
    }
    
    if (pathway.successRate.progressionRate < 70) {
      considerations.push('Lower progression rate - ensure strong academic performance')
    }
    
    if (pathway.minimumRequirements.otherRequirements) {
      considerations.push(`Additional requirements: ${pathway.minimumRequirements.otherRequirements.join(', ')}`)
    }
    
    return considerations
  }
  
  private identifySupportResources(eligibilityStatus: string, financialConstraints?: boolean) {
    const resources = {
      counselingServices: [
        'Academic counseling services',
        'Career guidance counselors',
        'Student support services'
      ],
      financialAid: [
        'Government bursary programs',
        'Institution scholarship opportunities',
        'Student loan programs'
      ],
      studySupport: [
        'Tutoring services',
        'Study groups and peer support',
        'Online learning resources',
        'Library and research support'
      ],
      careerGuidance: [
        'Career counseling services',
        'Industry mentorship programs',
        'Professional body guidance'
      ]
    }
    
    if (financialConstraints) {
      resources.financialAid.unshift('Emergency financial assistance')
      resources.financialAid.push('Work-study programs')
    }
    
    if (eligibilityStatus === 'needs_improvement' || eligibilityStatus === 'not_eligible') {
      resources.studySupport.unshift('Intensive academic support programs')
      resources.counselingServices.push('Academic recovery planning')
    }
    
    return resources
  }
  
  private createReviewSchedule(eligibilityStatus: string) {
    const now = new Date()
    let reviewFrequency = 'Every 6 months'
    let nextReviewMonths = 6
    
    if (eligibilityStatus === 'needs_improvement' || eligibilityStatus === 'not_eligible') {
      reviewFrequency = 'Every 3 months'
      nextReviewMonths = 3
    }
    
    return {
      nextReviewDate: new Date(now.getTime() + nextReviewMonths * 30 * 24 * 60 * 60 * 1000),
      reviewFrequency,
      triggerEvents: [
        'Completion of retake examinations',
        'Completion of pathway program',
        'Significant change in circumstances',
        'New program opportunities become available'
      ]
    }
  }
}

// Export singleton instance
export const alternativePathwayEngine = new AlternativePathwayEngine()