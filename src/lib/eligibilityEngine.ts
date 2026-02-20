/**
 * Eligibility Engine
 *
 * Performs local-only eligibility assessment using Zambian ECZ grading rules
 * and regulatory guidelines. All checks are advisory — students can always
 * proceed with their application regardless of eligibility status.
 *
 * Supabase paths removed — this module no longer depends on any remote
 * eligibility_rules or eligibility_assessments tables.
 */
import type { EnhancedEligibilityResult, SubjectGrade as LegacySubjectGrade } from './eligibility'
import { checkEnhancedEligibility } from './eligibility'
import {
  detailedEligibilityScoringEngine,
  type DetailedEligibilityAssessment,
} from './detailedEligibilityScoring'

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

export interface SubjectGrade {
  subject_id: string
  subject_name: string
  grade: number
}

export interface RegulatoryGuideline {
  id: string
  regulatory_body: string
  guideline_type: string
  requirement_text: string
  compliance_level: 'mandatory' | 'recommended' | 'optional'
  verification_required: boolean
}

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

  /**
   * Calculate detailed eligibility assessment with comprehensive scoring breakdown
   */
  async calculateDetailedEligibilityAssessment(
    applicationId: string,
    programId: string,
    grades: SubjectGrade[]
  ): Promise<DetailedEligibilityAssessment> {
    const programName = this.resolveProgramName(programId) || 'Unknown Program'

    return await detailedEligibilityScoringEngine.calculateDetailedAssessment(
      applicationId,
      programId,
      programName,
      grades
    )
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

    const enhancedResult = await checkEnhancedEligibility(
      resolvedProgramName,
      grades as LegacySubjectGrade[]
    )

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
