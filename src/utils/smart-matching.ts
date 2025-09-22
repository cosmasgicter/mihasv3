// Smart application matching service for program recommendations

import { GradeCalculator } from './smart-features'

export interface StudentProfile {
  grades: { subject: string; grade: number }[]
  interests?: string[]
  careerGoals?: string[]
  location?: string
  financialSituation?: 'excellent' | 'good' | 'fair' | 'poor'
  studyPreference?: 'practical' | 'theoretical' | 'mixed'
  workExperience?: string[]
}

export interface ProgramMatch {
  programId: string
  programName: string
  institution: string
  matchScore: number
  eligibilityScore: number
  recommendationLevel: 'highly-recommended' | 'recommended' | 'possible' | 'not-suitable'
  strengths: string[]
  concerns: string[]
  requirements: {
    academic: boolean
    financial: boolean
    practical: boolean
  }
  careerOutlook: {
    employmentRate: number
    averageSalary: string
    growthProspects: 'excellent' | 'good' | 'fair' | 'limited'
  }
}

export class SmartMatchingService {
  private readonly PROGRAM_DATA = {
    'clinical-medicine': {
      name: 'Diploma in Clinical Medicine',
      institution: 'KATC',
      description: 'Train as a Clinical Officer in primary healthcare',
      duration: '3 years',
      practicalComponent: 0.7, // 70% practical
      theoreticalComponent: 0.3, // 30% theoretical
      careerOutlook: {
        employmentRate: 85,
        averageSalary: 'K8,000 - K15,000',
        growthProspects: 'good' as const
      },
      relevantInterests: ['healthcare', 'medicine', 'helping people', 'science'],
      careerPaths: ['Clinical Officer', 'Health Center Manager', 'Public Health Officer'],
      workEnvironments: ['Hospitals', 'Health Centers', 'Clinics', 'Public Health Departments'],
      financialRequirement: 'fair' // Moderate fees
    },
    'environmental-health': {
      name: 'Diploma in Environmental Health',
      institution: 'KATC',
      description: 'Protect communities through environmental health practices',
      duration: '3 years',
      practicalComponent: 0.6,
      theoreticalComponent: 0.4,
      careerOutlook: {
        employmentRate: 75,
        averageSalary: 'K6,000 - K12,000',
        growthProspects: 'excellent' as const
      },
      relevantInterests: ['environment', 'public health', 'community service', 'science'],
      careerPaths: ['Environmental Health Officer', 'Public Health Inspector', 'Water Quality Officer'],
      workEnvironments: ['Government Agencies', 'NGOs', 'Mining Companies', 'Water Authorities'],
      financialRequirement: 'fair'
    },
    'registered-nursing': {
      name: 'Diploma in Registered Nursing',
      institution: 'MIHAS',
      description: 'Comprehensive nursing education for patient care',
      duration: '4 years',
      practicalComponent: 0.8,
      theoreticalComponent: 0.2,
      careerOutlook: {
        employmentRate: 90,
        averageSalary: 'K7,000 - K18,000',
        growthProspects: 'excellent' as const
      },
      relevantInterests: ['healthcare', 'nursing', 'patient care', 'medicine'],
      careerPaths: ['Registered Nurse', 'Ward Sister', 'Nursing Supervisor', 'Community Health Nurse'],
      workEnvironments: ['Hospitals', 'Clinics', 'Community Health Centers', 'Private Practice'],
      financialRequirement: 'good' // Higher fees but good prospects
    }
  }

  async getSmartRecommendations(profile: StudentProfile): Promise<ProgramMatch[]> {
    const matches: ProgramMatch[] = []

    for (const [programId, programData] of Object.entries(this.PROGRAM_DATA)) {
      const eligibility = GradeCalculator.calculateEligibility(
        profile.grades,
        programId as any
      )

      const matchScore = this.calculateMatchScore(profile, programId, programData)
      const recommendationLevel = this.getRecommendationLevel(eligibility, matchScore)
      const { strengths, concerns } = this.analyzeMatch(profile, programData, eligibility)

      matches.push({
        programId,
        programName: programData.name,
        institution: programData.institution,
        matchScore,
        eligibilityScore: eligibility.percentage,
        recommendationLevel,
        strengths,
        concerns,
        requirements: {
          academic: eligibility.eligible,
          financial: this.checkFinancialRequirement(profile, programData),
          practical: this.checkPracticalSuitability(profile, programData)
        },
        careerOutlook: programData.careerOutlook
      })
    }

    // Sort by overall recommendation (eligibility + match score)
    return matches.sort((a, b) => {
      const scoreA = (a.eligibilityScore * 0.6) + (a.matchScore * 0.4)
      const scoreB = (b.eligibilityScore * 0.6) + (b.matchScore * 0.4)
      return scoreB - scoreA
    })
  }

  private calculateMatchScore(
    profile: StudentProfile,
    programId: string,
    programData: any
  ): number {
    let score = 0
    let maxScore = 0

    // Interest alignment (30% weight)
    const interestScore = this.calculateInterestAlignment(profile.interests || [], programData.relevantInterests)
    score += interestScore * 30
    maxScore += 30

    // Study preference alignment (25% weight)
    const studyScore = this.calculateStudyPreferenceAlignment(profile.studyPreference, programData)
    score += studyScore * 25
    maxScore += 25

    // Career goals alignment (25% weight)
    const careerScore = this.calculateCareerGoalsAlignment(profile.careerGoals || [], programData.careerPaths)
    score += careerScore * 25
    maxScore += 25

    // Location and accessibility (10% weight)
    const locationScore = this.calculateLocationScore(profile.location, programData.institution)
    score += locationScore * 10
    maxScore += 10

    // Work experience relevance (10% weight)
    const experienceScore = this.calculateExperienceRelevance(profile.workExperience || [], programData)
    score += experienceScore * 10
    maxScore += 10

    return Math.round((score / maxScore) * 100)
  }

  private calculateInterestAlignment(interests: string[], relevantInterests: string[]): number {
    if (interests.length === 0) return 0.5 // Neutral score if no interests provided

    const normalizedInterests = interests.map(i => i.toLowerCase().trim())
    const normalizedRelevant = relevantInterests.map(i => i.toLowerCase().trim())

    let matches = 0
    for (const interest of normalizedInterests) {
      for (const relevant of normalizedRelevant) {
        if (interest.includes(relevant) || relevant.includes(interest)) {
          matches++
          break
        }
      }
    }

    return matches / Math.max(interests.length, relevantInterests.length)
  }

  private calculateStudyPreferenceAlignment(
    preference: string | undefined,
    programData: any
  ): number {
    if (!preference) return 0.7 // Neutral score

    const practicalWeight = programData.practicalComponent
    const theoreticalWeight = programData.theoreticalComponent

    switch (preference) {
      case 'practical':
        return practicalWeight
      case 'theoretical':
        return theoreticalWeight
      case 'mixed':
        return Math.min(practicalWeight, theoreticalWeight) * 2 // Balanced is good
      default:
        return 0.5
    }
  }

  private calculateCareerGoalsAlignment(goals: string[], careerPaths: string[]): number {
    if (goals.length === 0) return 0.5 // Neutral score

    const normalizedGoals = goals.map(g => g.toLowerCase().trim())
    const normalizedPaths = careerPaths.map(p => p.toLowerCase().trim())

    let matches = 0
    for (const goal of normalizedGoals) {
      for (const path of normalizedPaths) {
        if (goal.includes(path) || path.includes(goal)) {
          matches++
          break
        }
      }
    }

    return matches / Math.max(goals.length, careerPaths.length)
  }

  private calculateLocationScore(location: string | undefined, institution: string): number {
    // Simplified location scoring - can be enhanced with actual geographical data
    if (!location) return 0.8 // Neutral score
    
    // For now, just return a good score since both institutions are in Zambia
    return 0.9
  }

  private calculateExperienceRelevance(experience: string[], programData: any): number {
    if (experience.length === 0) return 0.5 // Neutral score

    const relevantFields = [...programData.relevantInterests, ...programData.workEnvironments.map((env: string) => env.toLowerCase())]
    const normalizedExperience = experience.map(e => e.toLowerCase().trim())

    let relevantCount = 0
    for (const exp of normalizedExperience) {
      for (const field of relevantFields) {
        if (exp.includes(field) || field.includes(exp)) {
          relevantCount++
          break
        }
      }
    }

    return relevantCount / experience.length
  }

  private getRecommendationLevel(
    eligibility: any,
    matchScore: number
  ): 'highly-recommended' | 'recommended' | 'possible' | 'not-suitable' {
    if (!eligibility.eligible) {
      return 'not-suitable'
    }

    const combinedScore = (eligibility.percentage * 0.6) + (matchScore * 0.4)

    if (combinedScore >= 80) return 'highly-recommended'
    if (combinedScore >= 65) return 'recommended'
    if (combinedScore >= 50) return 'possible'
    return 'not-suitable'
  }

  private analyzeMatch(
    profile: StudentProfile,
    programData: any,
    eligibility: any
  ): { strengths: string[]; concerns: string[] } {
    const strengths: string[] = []
    const concerns: string[] = []

    // Academic strengths/concerns
    if (eligibility.eligible) {
      strengths.push('Meets all academic requirements')
    } else {
      concerns.push('Does not meet minimum academic requirements')
    }

    if (eligibility.percentage >= 80) {
      strengths.push('Strong academic performance')
    } else if (eligibility.percentage < 60) {
      concerns.push('Borderline academic performance')
    }

    // Missing subjects
    if (eligibility.missing.length > 0) {
      concerns.push(`Missing required subjects: ${eligibility.missing.join(', ')}`)
    }

    // Financial considerations
    if (profile.financialSituation) {
      if (profile.financialSituation === 'poor' && programData.financialRequirement === 'good') {
        concerns.push('Program fees may be challenging given financial situation')
      } else if (profile.financialSituation === 'excellent') {
        strengths.push('Strong financial capacity for program completion')
      }
    }

    // Career outlook
    if (programData.careerOutlook.employmentRate >= 85) {
      strengths.push('Excellent employment prospects after graduation')
    }

    if (programData.careerOutlook.growthProspects === 'excellent') {
      strengths.push('Excellent career growth potential')
    }

    return { strengths, concerns }
  }

  private checkFinancialRequirement(profile: StudentProfile, programData: any): boolean {
    if (!profile.financialSituation) return true // Assume okay if not specified

    const financialLevel = {
      'poor': 1,
      'fair': 2,
      'good': 3,
      'excellent': 4
    }[profile.financialSituation]

    const requiredLevel = {
      'fair': 2,
      'good': 3,
      'excellent': 4
    }[programData.financialRequirement] || 2

    return financialLevel >= requiredLevel
  }

  private checkPracticalSuitability(profile: StudentProfile, programData: any): boolean {
    if (!profile.studyPreference) return true

    // If student prefers theoretical but program is highly practical, flag concern
    if (profile.studyPreference === 'theoretical' && programData.practicalComponent > 0.7) {
      return false
    }

    return true
  }
}

// Export singleton instance
export const smartMatchingService = new SmartMatchingService()
