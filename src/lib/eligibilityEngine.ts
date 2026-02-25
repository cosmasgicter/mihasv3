/**
 * Eligibility Engine (Canonical Module)
 *
 * Single source of truth for all eligibility assessment logic.
 * Performs local-only eligibility assessment using Zambian ECZ grading rules
 * and regulatory guidelines. All checks are advisory — students can always
 * proceed with their application regardless of eligibility status.
 *
 * Consolidated from: eligibility.ts, detailedEligibilityScoring.ts, eligibilityScoringEngine.ts
 */

// ─── Grade Constants ───────────────────────────────────────────────────────────

export const ZAMBIAN_GRADE_SCALE = {
  DISTINCTION: 1,
  MERIT: 2,
  CREDIT: 6,
  PASS: 7,
  FAIL: 9,
} as const

export const GRADE_DESCRIPTIONS: Record<number, string> = {
  1: 'Distinction (1)',
  2: 'Merit (2)',
  3: 'Very Good (3)',
  4: 'Good (4)',
  5: 'Satisfactory (5)',
  6: 'Credit (6)',
  7: 'Pass (7)',
  8: 'Weak Pass (8)',
  9: 'Fail (9)',
}

// ─── Shared Types ──────────────────────────────────────────────────────────────

export interface SubjectGrade {
  subject_id?: string
  subject_name: string
  grade: number
}

export interface StudentGrades {
  english?: number
  mathematics?: number
  biology?: number
  chemistry?: number
  physics?: number
  science?: number
  agriculturalScience?: number
  geography?: number
  civicEducation?: number
  religiousEducation?: number
  otherSubjects?: number[]
}

export interface EligibilityResult {
  eligible: boolean
  message: string
  score: number
  regulatoryBody?: string
  recommendations?: string[]
  missingSubjects?: string[]
  weakGrades?: Array<{ subject: string; grade: number; required: number }>
  canProceed: boolean
  competitivenessLevel?: 'Highly Competitive' | 'Competitive' | 'Minimum' | 'Not Eligible'
  matchedRequirements?: string[]
  alternativePathways?: string[]
}

export interface EnhancedEligibilityResult {
  overallScore: number
  status: 'eligible' | 'not_eligible' | 'conditional'
  breakdown: {
    subjectCount: number
    gradeAverage: number
    coreSubjects: number
    totalWeighted: number
  }
  missingRequirements: Array<{
    type: string
    description: string
    severity: string
    suggestion: string
  }>
  recommendations?: string[]
  alternativePathways?: Array<{ name: string }>
  canProceed: boolean
  regulatoryBody?: string
}

export interface EligibilityRule {
  id: string
  program_id: string
  rule_name: string
  rule_type: 'subject_count' | 'grade_average' | 'specific_subject' | 'composite'
  condition_json: any
  weight: number
  is_active: boolean
}

export interface EligibilityAssessment {
  id?: string
  application_id: string
  program_id: string
  overall_score: number
  eligibility_status: 'eligible' | 'not_eligible' | 'conditional' | 'under_review'
  detailed_breakdown: EligibilityBreakdown
  missing_requirements: MissingRequirement[]
  recommendations: string[]
  assessor_notes?: string
}

export interface EligibilityBreakdown {
  subject_count_score: number
  grade_average_score: number
  core_subjects_score: number
  total_weighted_score: number
  requirements_met: number
  total_requirements: number
}

export interface MissingRequirement {
  type: 'subject' | 'grade' | 'document' | 'prerequisite'
  description: string
  severity: 'critical' | 'major' | 'minor'
  suggestion: string
}

export interface RegulatoryGuideline {
  id: string
  regulatory_body: string
  guideline_type: string
  requirement_text: string
  compliance_level: 'mandatory' | 'recommended' | 'optional'
  verification_required: boolean
}

// ─── Grade Parsing ─────────────────────────────────────────────────────────────

function parseGrades(grades: SubjectGrade[]): StudentGrades {
  const parsed: StudentGrades = {}

  grades.forEach(g => {
    const name = g.subject_name.toLowerCase()
    if (name.includes('english')) parsed.english = g.grade
    else if (name.includes('math')) parsed.mathematics = g.grade
    else if (name.includes('biology')) parsed.biology = g.grade
    else if (name.includes('chemistry')) parsed.chemistry = g.grade
    else if (name.includes('physics')) parsed.physics = g.grade
    else if (name.includes('science')) parsed.science = g.grade
    else if (name.includes('agricultural')) parsed.agriculturalScience = g.grade
    else if (name.includes('geography')) parsed.geography = g.grade
    else if (name.includes('civic')) parsed.civicEducation = g.grade
    else if (name.includes('religious')) parsed.religiousEducation = g.grade
    else {
      if (!parsed.otherSubjects) parsed.otherSubjects = []
      parsed.otherSubjects.push(g.grade)
    }
  })

  return parsed
}

// ─── Program-Specific Eligibility Checks ───────────────────────────────────────

function checkNursingEligibility(grades: StudentGrades): EligibilityResult {
  const matched: string[] = []
  const missing: string[] = []
  const recommendations: string[] = []
  const weakGrades: Array<{ subject: string; grade: number; required: number }> = []

  if (grades.english && grades.english <= 6) {
    matched.push(`English: Grade ${grades.english}`)
    if (grades.english > 5) weakGrades.push({ subject: 'English', grade: grades.english, required: 5 })
  } else missing.push('English')

  if (grades.mathematics && grades.mathematics <= 6) {
    matched.push(`Mathematics: Grade ${grades.mathematics}`)
    if (grades.mathematics > 5) weakGrades.push({ subject: 'Mathematics', grade: grades.mathematics, required: 5 })
  } else missing.push('Mathematics')

  if (grades.biology && grades.biology <= 6) {
    matched.push(`Biology: Grade ${grades.biology}`)
    if (grades.biology > 4) weakGrades.push({ subject: 'Biology', grade: grades.biology, required: 4 })
  } else if (grades.science && grades.science <= 6) {
    matched.push(`Science: Grade ${grades.science}`)
  } else missing.push('Biology or Science')

  const totalCredits = [grades.english, grades.mathematics, grades.biology || grades.science, grades.chemistry, grades.physics, grades.geography, grades.civicEducation, grades.religiousEducation, ...(grades.otherSubjects || [])].filter(g => g && g <= 6).length

  if (totalCredits < 5) missing.push(`${5 - totalCredits} more credit(s)`)

  let competitiveness: EligibilityResult['competitivenessLevel'] = 'Not Eligible'
  if (missing.length === 0) {
    const avgGrade = ((grades.english || 9) + (grades.mathematics || 9) + (grades.biology || grades.science || 9)) / 3
    if (avgGrade <= 3) competitiveness = 'Highly Competitive'
    else if (avgGrade <= 5) competitiveness = 'Competitive'
    else competitiveness = 'Minimum'

    if (competitiveness === 'Minimum') {
      recommendations.push('Grades 1-5 significantly improve admission chances')
    }
    recommendations.push('Medical fitness and character references required')
  }

  const score = missing.length === 0 ? Math.round((1 - (weakGrades.length / 3)) * 100) : Math.round((matched.length / 5) * 100)

  return {
    eligible: missing.length === 0,
    message: missing.length === 0 ? `✓ Meets GNC/NMCZ requirements` : `Missing: ${missing.join(', ')}`,
    score,
    regulatoryBody: 'GNC/NMCZ',
    recommendations,
    missingSubjects: missing,
    weakGrades,
    canProceed: true,
    competitivenessLevel: competitiveness,
    matchedRequirements: matched,
    alternativePathways: missing.length > 0 ? ['Certificate in Nursing Upgrade', 'Mature Entry (25+ years)'] : undefined
  }
}

function checkClinicalMedicineEligibility(grades: StudentGrades): EligibilityResult {
  const matched: string[] = []
  const missing: string[] = []
  const recommendations: string[] = []
  const weakGrades: Array<{ subject: string; grade: number; required: number }> = []

  if (grades.english && grades.english <= 6) {
    matched.push(`English: Grade ${grades.english}`)
    if (grades.english > 4) weakGrades.push({ subject: 'English', grade: grades.english, required: 4 })
  } else missing.push('English')

  if (grades.mathematics && grades.mathematics <= 6) {
    matched.push(`Mathematics: Grade ${grades.mathematics}`)
    if (grades.mathematics > 4) weakGrades.push({ subject: 'Mathematics', grade: grades.mathematics, required: 4 })
  } else missing.push('Mathematics')

  if (grades.biology && grades.biology <= 6) {
    matched.push(`Biology: Grade ${grades.biology} (MANDATORY)`)
    if (grades.biology > 3) weakGrades.push({ subject: 'Biology', grade: grades.biology, required: 3 })
  } else missing.push('Biology (MANDATORY)')

  if (grades.chemistry && grades.chemistry <= 6) {
    matched.push(`Chemistry: Grade ${grades.chemistry}`)
    if (grades.chemistry > 4) weakGrades.push({ subject: 'Chemistry', grade: grades.chemistry, required: 4 })
  } else if (grades.physics && grades.physics <= 6) {
    matched.push(`Physics: Grade ${grades.physics}`)
    recommendations.push('Chemistry preferred over Physics')
  } else if (grades.science && grades.science <= 6) {
    matched.push(`Science: Grade ${grades.science}`)
    recommendations.push('Chemistry strongly preferred over General Science')
  } else missing.push('Chemistry/Physics/Science')

  const totalCredits = [grades.english, grades.mathematics, grades.biology, grades.chemistry, grades.physics, grades.science, ...(grades.otherSubjects || [])].filter(g => g && g <= 6).length

  if (totalCredits < 5) missing.push(`${5 - totalCredits} more credit(s)`)

  let competitiveness: EligibilityResult['competitivenessLevel'] = 'Not Eligible'
  if (missing.length === 0) {
    const avgGrade = ((grades.english || 9) + (grades.mathematics || 9) + (grades.biology || 9) + (grades.chemistry || grades.science || 9)) / 4
    if (avgGrade <= 3 && grades.biology && grades.biology <= 3) competitiveness = 'Highly Competitive'
    else if (avgGrade <= 5) competitiveness = 'Competitive'
    else competitiveness = 'Minimum'

    if (competitiveness === 'Minimum') {
      recommendations.push('Clinical Medicine is highly competitive - consider retaking to improve grades')
      recommendations.push('Biology Grade 3 or better strongly recommended')
    }
  }

  const score = missing.length === 0 ? Math.round((1 - (weakGrades.length / 4)) * 100) : Math.round((matched.length / 5) * 100)

  return {
    eligible: missing.length === 0,
    message: missing.length === 0 ? `✓ Meets HPCZ requirements` : `Missing: ${missing.join(', ')}`,
    score,
    regulatoryBody: 'HPCZ',
    recommendations,
    missingSubjects: missing,
    weakGrades,
    canProceed: true,
    competitivenessLevel: competitiveness,
    matchedRequirements: matched,
    alternativePathways: missing.length > 0 ? ['A-Level Entry', 'Pre-Medical Sciences'] : undefined
  }
}

function checkEnvironmentalHealthEligibility(grades: StudentGrades): EligibilityResult {
  const matched: string[] = []
  const missing: string[] = []
  const recommendations: string[] = []
  const weakGrades: Array<{ subject: string; grade: number; required: number }> = []

  if (grades.english && grades.english <= 6) {
    matched.push(`English: Grade ${grades.english}`)
    if (grades.english > 5) weakGrades.push({ subject: 'English', grade: grades.english, required: 5 })
  } else missing.push('English')

  if (grades.mathematics && grades.mathematics <= 6) {
    matched.push(`Mathematics: Grade ${grades.mathematics}`)
    if (grades.mathematics > 4) {
      weakGrades.push({ subject: 'Mathematics', grade: grades.mathematics, required: 4 })
      recommendations.push('Mathematics Grade 4 or better preferred for competitive institutions')
    }
  } else missing.push('Mathematics')

  const hasScience = (grades.biology && grades.biology <= 6) || (grades.science && grades.science <= 6) || (grades.chemistry && grades.chemistry <= 6) || (grades.agriculturalScience && grades.agriculturalScience <= 6)

  if (hasScience) {
    if (grades.biology && grades.biology <= 6) matched.push(`Biology: Grade ${grades.biology}`)
    if (grades.chemistry && grades.chemistry <= 6) matched.push(`Chemistry: Grade ${grades.chemistry}`)
    if (grades.science && grades.science <= 6) matched.push(`Science: Grade ${grades.science}`)
    if (grades.agriculturalScience && grades.agriculturalScience <= 6) matched.push(`Agricultural Science: Grade ${grades.agriculturalScience}`)
  } else missing.push('Biology/Chemistry/Science')

  const scienceCount = [grades.biology, grades.chemistry, grades.physics].filter(g => g && g <= 6).length
  if (scienceCount < 2) recommendations.push('Two science subjects (Biology + Chemistry) strengthen application')
  if (grades.geography && grades.geography <= 6) recommendations.push('Geography is particularly relevant')

  const totalCredits = [grades.english, grades.mathematics, grades.biology, grades.science, grades.chemistry, grades.physics, grades.agriculturalScience, grades.geography, ...(grades.otherSubjects || [])].filter(g => g && g <= 6).length

  if (totalCredits < 5) missing.push(`${5 - totalCredits} more credit(s)`)

  let competitiveness: EligibilityResult['competitivenessLevel'] = 'Not Eligible'
  if (missing.length === 0) {
    const avgGrade = ((grades.english || 9) + (grades.mathematics || 9) + (grades.biology || grades.science || 9)) / 3
    if (avgGrade <= 4 && scienceCount >= 2) competitiveness = 'Highly Competitive'
    else if (avgGrade <= 5) competitiveness = 'Competitive'
    else competitiveness = 'Minimum'
  }

  const score = missing.length === 0 ? Math.round((1 - (weakGrades.length / 3)) * 100) : Math.round((matched.length / 5) * 100)

  return {
    eligible: missing.length === 0,
    message: missing.length === 0 ? `✓ Meets HPCZ requirements` : `Missing: ${missing.join(', ')}`,
    score,
    regulatoryBody: 'HPCZ',
    recommendations,
    missingSubjects: missing,
    weakGrades,
    canProceed: true,
    competitivenessLevel: competitiveness,
    matchedRequirements: matched,
    alternativePathways: missing.length > 0 ? ['Certificate Holder Entry', 'Diploma in Related Field'] : undefined
  }
}

// ─── Public Eligibility Functions ──────────────────────────────────────────────

/**
 * Check eligibility for a given program and set of grades.
 * Returns an advisory result — never blocks the application flow.
 */
export function checkEligibility(programName: string, grades: SubjectGrade[]): EligibilityResult {
  const normalized = programName.toLowerCase().trim()
  const parsed = parseGrades(grades)

  if (normalized.includes('nursing')) return checkNursingEligibility(parsed)
  if (normalized.includes('clinical')) return checkClinicalMedicineEligibility(parsed)
  if (normalized.includes('environmental')) return checkEnvironmentalHealthEligibility(parsed)

  return {
    eligible: false,
    message: 'Program requirements not configured',
    score: 0,
    canProceed: true,
    recommendations: ['Please consult with the institution for specific program requirements']
  }
}

/**
 * Get recommended subjects for a given program.
 */
export function getRecommendedSubjects(programName: string): string[] {
  const normalized = programName.toLowerCase().trim()

  if (normalized.includes('nursing')) {
    return ['English', 'Mathematics', 'Biology', 'Chemistry', 'Physics']
  }
  if (normalized.includes('clinical')) {
    return ['English', 'Mathematics', 'Biology', 'Chemistry', 'Physics']
  }
  if (normalized.includes('environmental')) {
    return ['English', 'Mathematics', 'Biology', 'Chemistry', 'Geography']
  }

  return []
}

/**
 * Enhanced eligibility check that returns a richer result object
 * with breakdown scores and missing requirements detail.
 */
export async function checkEnhancedEligibility(
  programName: string,
  grades: SubjectGrade[]
): Promise<EnhancedEligibilityResult> {
  const result = checkEligibility(programName, grades)

  const missingReqs: EnhancedEligibilityResult['missingRequirements'] = []

  if (result.missingSubjects && result.missingSubjects.length > 0) {
    missingReqs.push({
      type: 'subject',
      description: `Missing required subjects: ${result.missingSubjects.join(', ')}`,
      severity: 'major',
      suggestion: `Add ${result.missingSubjects.join(', ')} to your subject selection`
    })
  }

  if (result.weakGrades && result.weakGrades.length > 0) {
    result.weakGrades.forEach(wg => {
      missingReqs.push({
        type: 'grade',
        description: `${wg.subject}: Grade ${wg.grade} is below required grade ${wg.required}`,
        severity: 'major',
        suggestion: `Improve ${wg.subject} to at least grade ${wg.required} (credit level)`
      })
    })
  }

  if (!result.eligible && missingReqs.length === 0) {
    missingReqs.push({
      type: 'prerequisite',
      description: result.message,
      severity: 'minor',
      suggestion: 'Consult with admissions office for guidance'
    })
  }

  return {
    overallScore: result.score,
    status: result.eligible ? 'eligible' : 'conditional',
    breakdown: {
      subjectCount: grades.length >= 5 ? 100 : (grades.length / 5) * 100,
      gradeAverage: result.score,
      coreSubjects: result.score,
      totalWeighted: result.score
    },
    missingRequirements: missingReqs,
    recommendations: result.recommendations || [],
    canProceed: true,
    regulatoryBody: result.regulatoryBody,
    alternativePathways: !result.eligible ? [
      { name: 'Foundation Program' },
      { name: 'Certificate Program' }
    ] : undefined
  }
}

export const eligibilityCalculator = { calculate: checkEligibility }

// ─── Eligibility Engine Class ──────────────────────────────────────────────────

export class EligibilityEngine {
  /**
   * Assess eligibility using local rules only.
   * All assessment is advisory — never blocks the student.
   */
  async assessEligibility(
    applicationId: string,
    programId: string,
    grades: SubjectGrade[]
  ): Promise<EligibilityAssessment> {
    return this.assessWithLocalRules(applicationId, programId, grades)
  }

  private async assessWithLocalRules(
    applicationId: string,
    programId: string,
    grades: SubjectGrade[]
  ): Promise<EligibilityAssessment> {
    const resolvedProgramName = this.resolveProgramName(programId)

    if (!resolvedProgramName) {
      return {
        application_id: applicationId,
        program_id: programId,
        overall_score: 0,
        eligibility_status: 'under_review',
        detailed_breakdown: {
          subject_count_score: 0,
          grade_average_score: 0,
          core_subjects_score: 0,
          total_weighted_score: 0,
          requirements_met: 0,
          total_requirements: 0,
        },
        missing_requirements: [
          {
            type: 'prerequisite',
            description: 'Program not recognised in offline eligibility rules',
            severity: 'minor',
            suggestion: 'Please sync with the admissions portal to load the latest requirements',
          },
        ],
        recommendations: ['Unable to determine eligibility without program configuration'],
      }
    }

    const enhancedResult = await checkEnhancedEligibility(resolvedProgramName, grades)
    return this.transformEnhancedResult(applicationId, programId, enhancedResult)
  }

  private transformEnhancedResult(
    applicationId: string,
    programId: string,
    result: EnhancedEligibilityResult
  ): EligibilityAssessment {
    const totalRequirements = 4
    const requirementChecks = [
      result.breakdown.subjectCount >= 60,
      result.breakdown.gradeAverage >= 60,
      result.breakdown.coreSubjects >= 60,
      result.missingRequirements.filter((req) => req.severity === 'critical').length === 0,
    ]

    const detailed_breakdown: EligibilityBreakdown = {
      subject_count_score: result.breakdown.subjectCount,
      grade_average_score: result.breakdown.gradeAverage,
      core_subjects_score: result.breakdown.coreSubjects,
      total_weighted_score: result.breakdown.totalWeighted,
      requirements_met: requirementChecks.filter(Boolean).length,
      total_requirements: totalRequirements,
    }

    const recommendations = [...(result.recommendations || [])]

    if (result.alternativePathways && result.alternativePathways.length > 0) {
      const pathwaySummary = result.alternativePathways.map((pathway) => pathway.name).join(', ')
      recommendations.push(`Consider alternative pathways: ${pathwaySummary}`)
    }

    return {
      application_id: applicationId,
      program_id: programId,
      overall_score: result.overallScore,
      eligibility_status: result.status,
      detailed_breakdown,
      missing_requirements: result.missingRequirements as MissingRequirement[],
      recommendations,
    }
  }

  private resolveProgramName(programId: string): string | null {
    if (!programId) return null

    const normalized = programId.toLowerCase().trim()

    const programAliasMap: Record<string, string> = {
      'clinical medicine': 'Clinical Medicine',
      'diploma in clinical medicine': 'Clinical Medicine',
      'clinical-medicine': 'Clinical Medicine',
      'clinical_medicine': 'Clinical Medicine',
      cmed: 'Clinical Medicine',
      'environmental health': 'Environmental Health',
      'diploma in environmental health': 'Environmental Health',
      'environmental-health': 'Environmental Health',
      'environmental_health': 'Environmental Health',
      envh: 'Environmental Health',
      'registered nursing': 'Registered Nursing',
      'diploma in registered nursing': 'Registered Nursing',
      'registered-nursing': 'Registered Nursing',
      'registered_nursing': 'Registered Nursing',
      rn: 'Registered Nursing',
    }

    return programAliasMap[normalized] || null
  }

  /**
   * Assessment history is no longer stored remotely.
   * Returns empty — callers should handle gracefully.
   */
  async getAssessmentHistory(_applicationId: string): Promise<EligibilityAssessment[]> {
    return []
  }

  /**
   * Appeals require a live backend endpoint.
   * This stub informs the caller that the feature is not available offline.
   */
  async submitAppeal(
    _applicationId: string,
    _assessmentId: string,
    _appealReason: string,
    _supportingDocuments: any[]
  ): Promise<void> {
    throw new Error('Appeals require a live connection to the admissions database')
  }
}

export const eligibilityEngine = new EligibilityEngine()
