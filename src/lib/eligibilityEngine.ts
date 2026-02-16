// @ts-nocheck
/**
 * Eligibility Engine
 * 
 * @deprecated This module uses the deprecated Supabase stub.
 * TODO: Migrate to API endpoints when eligibility engine is reactivated.
 */
import { apiClient } from '@/services/client'
import type { EnhancedEligibilityResult, SubjectGrade as LegacySubjectGrade } from './eligibility'
import { checkEnhancedEligibility } from './eligibility'
import { regulatoryEngine } from './regulatoryGuidelines'
import { 
  detailedEligibilityScoringEngine, 
  type DetailedEligibilityAssessment 
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
  
  async assessEligibility(
    applicationId: string,
    programId: string,
    grades: SubjectGrade[]
  ): Promise<EligibilityAssessment> {

    if (!isSupabaseConfigured) {
      return this.assessWithLocalRules(applicationId, programId, grades)
    }

    // Get eligibility rules for the program
    const rules = await this.getEligibilityRules(programId)
    const guidelines = await this.getRegulatoryGuidelines(programId)
    
    // Calculate scores for each rule type
    const breakdown = await this.calculateDetailedBreakdown(programId, grades, rules)
    
    // Determine missing requirements
    const missingRequirements = await this.identifyMissingRequirements(programId, grades, guidelines)
    
    // Generate recommendations
    const recommendations = await this.generateRecommendations(programId, grades, missingRequirements)
    
    // Calculate overall score and status
    const overallScore = this.calculateOverallScore(breakdown, rules)
    const status = this.determineEligibilityStatus(overallScore, missingRequirements)
    
    const assessment: EligibilityAssessment = {
      application_id: applicationId,
      program_id: programId,
      overall_score: overallScore,
      eligibility_status: status,
      detailed_breakdown: breakdown,
      missing_requirements: missingRequirements,
      recommendations
    }

    // Save assessment to database
    await this.saveAssessment(assessment)

    return assessment
  }

  /**
   * Calculate detailed eligibility assessment with comprehensive scoring breakdown
   */
  async calculateDetailedEligibilityAssessment(
    applicationId: string,
    programId: string,
    grades: SubjectGrade[]
  ): Promise<DetailedEligibilityAssessment> {
    
    // Get program name for detailed assessment
    const programName = await this.getProgramName(programId)
    
    // Use the detailed scoring engine
    return await detailedEligibilityScoringEngine.calculateDetailedAssessment(
      applicationId,
      programId,
      programName,
      grades
    )
  }

  /**
   * Get program name from database or resolve from ID
   */
  private async getProgramName(programId: string): Promise<string> {
    if (!isSupabaseConfigured) {
      return this.resolveProgramName(programId) || 'Unknown Program'
    }

    try {
      const { data, error } = await supabase
        .from('programs')
        .select('name')
        .eq('id', programId)
        .single()
      
      if (error || !data) {
        return this.resolveProgramName(programId) || 'Unknown Program'
      }
      
      return data.name
    } catch (error) {
      return this.resolveProgramName(programId) || 'Unknown Program'
    }
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
          total_requirements: 0
        },
        missing_requirements: [{
          type: 'prerequisite',
          description: 'Program not recognised in offline eligibility rules',
          severity: 'minor',
          suggestion: 'Please sync with the admissions portal to load the latest requirements'
        }],
        recommendations: ['Unable to determine eligibility without program configuration']
      }
    }

    const enhancedResult = await checkEnhancedEligibility(
      resolvedProgramName,
      grades as LegacySubjectGrade[]
    )

    return this.transformEnhancedResult(
      applicationId,
      programId,
      enhancedResult
    )
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
      result.missingRequirements.filter(req => req.severity === 'critical').length === 0
    ]

    const detailed_breakdown: EligibilityBreakdown = {
      subject_count_score: result.breakdown.subjectCount,
      grade_average_score: result.breakdown.gradeAverage,
      core_subjects_score: result.breakdown.coreSubjects,
      total_weighted_score: result.breakdown.totalWeighted,
      requirements_met: requirementChecks.filter(Boolean).length,
      total_requirements: totalRequirements
    }

    const recommendations = [...(result.recommendations || [])]

    if (result.alternativePathways && result.alternativePathways.length > 0) {
      const pathwaySummary = result.alternativePathways
        .map(pathway => pathway.name)
        .join(', ')
      recommendations.push(`Consider alternative pathways: ${pathwaySummary}`)
    }

    return {
      application_id: applicationId,
      program_id: programId,
      overall_score: result.overallScore,
      eligibility_status: result.status,
      detailed_breakdown,
      missing_requirements: result.missingRequirements as MissingRequirement[],
      recommendations
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
      'cmed': 'Clinical Medicine',
      'environmental health': 'Environmental Health',
      'diploma in environmental health': 'Environmental Health',
      'environmental-health': 'Environmental Health',
      'environmental_health': 'Environmental Health',
      'envh': 'Environmental Health',
      'registered nursing': 'Registered Nursing',
      'diploma in registered nursing': 'Registered Nursing',
      'registered-nursing': 'Registered Nursing',
      'registered_nursing': 'Registered Nursing',
      'rn': 'Registered Nursing'
    }

    return programAliasMap[normalized] || null
  }

  private async getEligibilityRules(programId: string): Promise<EligibilityRule[]> {
    const { data, error } = await supabase
      .from('eligibility_rules')
      .select('*')
      .eq('program_id', programId)
      .eq('is_active', true)
    
    if (error) throw error
    return data || []
  }

  private async getRegulatoryGuidelines(programId: string): Promise<RegulatoryGuideline[]> {
    const { data, error } = await supabase
      .from('regulatory_guidelines')
      .select('*')
      .eq('program_id', programId)
      .gte('expiry_date', new Date().toISOString().split('T')[0])
    
    if (error) throw error
    return data || []
  }

  private async calculateDetailedBreakdown(
    programId: string,
    grades: SubjectGrade[],
    rules: EligibilityRule[]
  ): Promise<EligibilityBreakdown> {
    
    // Subject count score
    const subjectCountRule = rules.find(r => r.rule_type === 'subject_count')
    const subjectCountScore = subjectCountRule 
      ? this.calculateSubjectCountScore(grades, subjectCountRule.condition_json)
      : 0

    // Grade average score
    const gradeAverageScore = this.calculateGradeAverageScore(grades)

    // Core subjects score
    const coreSubjectsRule = rules.find(r => r.rule_type === 'specific_subject')
    const coreSubjectsScore = coreSubjectsRule
      ? await this.calculateCoreSubjectsScore(grades, coreSubjectsRule.condition_json)
      : 0

    // Total weighted score
    const totalWeightedScore = this.calculateWeightedScore([
      { score: subjectCountScore, weight: subjectCountRule?.weight || 1 },
      { score: gradeAverageScore, weight: 1 },
      { score: coreSubjectsScore, weight: coreSubjectsRule?.weight || 2 }
    ])

    return {
      subject_count_score: subjectCountScore,
      grade_average_score: gradeAverageScore,
      core_subjects_score: coreSubjectsScore,
      total_weighted_score: totalWeightedScore,
      requirements_met: rules.filter(r => this.isRuleMet(r, grades)).length,
      total_requirements: rules.length
    }
  }

  private calculateSubjectCountScore(grades: SubjectGrade[], conditions: any): number {
    const { min_subjects, grade_threshold } = conditions
    const qualifyingSubjects = grades.filter(g => g.grade <= grade_threshold).length
    return Math.min(100, (qualifyingSubjects / min_subjects) * 100)
  }

  private calculateGradeAverageScore(grades: SubjectGrade[]): number {
    if (grades.length === 0) return 0
    const average = grades.reduce((sum, g) => sum + g.grade, 0) / grades.length
    return Math.min(100, ((10 - average) / 9) * 100) // 1 is best, 9 is worst in Zambian system
  }

  private async calculateCoreSubjectsScore(grades: SubjectGrade[], conditions: any): Promise<number> {
    const { required_subjects, min_grade } = conditions
    let score = 0
    const totalRequired = required_subjects.length

    for (const requiredSubject of required_subjects) {
      const grade = grades.find(g => 
        g.subject_name.toLowerCase().includes(requiredSubject.toLowerCase())
      )
      
      if (grade && grade.grade <= min_grade) {
        score += ((10 - grade.grade) / 9) * 100 // Convert to percentage
      }
    }

    return totalRequired > 0 ? score / totalRequired : 0
  }

  private calculateWeightedScore(scores: { score: number; weight: number }[]): number {
    const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0)
    const weightedSum = scores.reduce((sum, s) => sum + (s.score * s.weight), 0)
    return totalWeight > 0 ? weightedSum / totalWeight : 0
  }

  private async identifyMissingRequirements(
    programId: string,
    grades: SubjectGrade[],
    guidelines: RegulatoryGuideline[]
  ): Promise<MissingRequirement[]> {
    const missing: MissingRequirement[] = []

    // Check regulatory compliance first
    const { data: program } = await supabase
      .from('programs')
      .select('code')
      .eq('id', programId)
      .single()

    if (program) {
      try {
        const compliance = regulatoryEngine.checkCompliance(program.code, { grades })
        
        compliance.violations.forEach(violation => {
          missing.push({
            type: 'prerequisite',
            description: violation,
            severity: 'critical',
            suggestion: `Ensure compliance with regulatory requirement: ${violation}`
          })
        })
      } catch (error) {
      }
    }

    // Get course requirements
    const { data: requirements } = await supabase
      .from('course_requirements')
      .select(`
        *,
        subjects (name)
      `)
      .eq('program_id', programId)
      .eq('is_mandatory', true)

    // Check missing mandatory subjects
    for (const req of requirements || []) {
      const hasSubject = grades.some(g => 
        g.subject_name.toLowerCase().includes(req.subjects.name.toLowerCase())
      )
      
      if (!hasSubject) {
        missing.push({
          type: 'subject',
          description: `Missing mandatory subject: ${req.subjects.name}`,
          severity: 'critical',
          suggestion: `Add ${req.subjects.name} to your subject selection`
        })
      } else {
        const grade = grades.find(g => 
          g.subject_name.toLowerCase().includes(req.subjects.name.toLowerCase())
        )
        
        if (grade && grade.grade > req.minimum_grade) {
          missing.push({
            type: 'grade',
            description: `Grade ${grade.grade} in ${req.subjects.name} is below required ${req.minimum_grade}`,
            severity: 'major',
            suggestion: `Improve grade in ${req.subjects.name} to at least ${req.minimum_grade}`
          })
        }
      }
    }

    return missing
  }

  private async generateRecommendations(
    programId: string,
    grades: SubjectGrade[],
    missingRequirements: MissingRequirement[]
  ): Promise<string[]> {
    const recommendations: string[] = []

    // Always remind students they can proceed
    if (missingRequirements.length > 0) {
      recommendations.push('You can still submit your application - the admissions committee will review your case')
    }

    // Critical missing requirements
    const criticalMissing = missingRequirements.filter(r => r.severity === 'critical')
    if (criticalMissing.length > 0) {
      recommendations.push('Note the following requirements for your reference:')
      criticalMissing.forEach(req => recommendations.push(req.suggestion))
    }

    // Grade improvements
    const lowGrades = grades.filter(g => g.grade > 6)
    if (lowGrades.length > 0) {
      recommendations.push('Consider retaking exams to improve grades in: ' + 
        lowGrades.map(g => g.subject_name).join(', '))
    }

    // Alternative pathways
    const { data: pathways } = await supabase
      .from('alternative_pathways')
      .select('*')
      .eq('program_id', programId)
      .eq('is_active', true)

    if (pathways && pathways.length > 0 && missingRequirements.length > 0) {
      recommendations.push('Alternative pathways available: Foundation program or Certificate program')
    }

    if (recommendations.length === 0) {
      recommendations.push('All requirements met - proceed with confidence!')
    }

    return recommendations
  }

  private calculateOverallScore(breakdown: EligibilityBreakdown, _rules: EligibilityRule[]): number {
    return breakdown.total_weighted_score
  }

  private determineEligibilityStatus(
    score: number,
    missingRequirements: MissingRequirement[]
  ): 'eligible' | 'not_eligible' | 'conditional' | 'under_review' {
    // IMPORTANT: Never block applications - always allow students to proceed
    // Status is advisory only for admissions committee review
    
    const criticalMissing = missingRequirements.filter(r => r.severity === 'critical')
    
    if (criticalMissing.length > 0) {
      return 'conditional' // Changed from 'not_eligible' to allow proceeding
    }
    
    if (score >= 80) {
      return missingRequirements.length === 0 ? 'eligible' : 'conditional'
    }
    
    if (score >= 60) {
      return 'conditional'
    }
    
    return 'conditional' // Changed from 'not_eligible' to allow proceeding
  }

  private isRuleMet(rule: EligibilityRule, grades: SubjectGrade[]): boolean {
    switch (rule.rule_type) {
      case 'subject_count': {
        const { min_subjects, grade_threshold } = rule.condition_json
        return grades.filter(g => g.grade <= grade_threshold).length >= min_subjects
      }
      
      case 'specific_subject': {
        const { required_subjects, min_grade } = rule.condition_json
        return required_subjects.every((subject: string) =>
          grades.some(g => 
            g.subject_name.toLowerCase().includes(subject.toLowerCase()) && 
            g.grade <= min_grade
          )
        )
      }
      
      default:
        return false
    }
  }

  private async saveAssessment(assessment: EligibilityAssessment): Promise<void> {
    if (!isSupabaseConfigured) {
      return
    }

    const { error } = await supabase
      .from('eligibility_assessments')
      .upsert({
        ...assessment,
        detailed_breakdown: JSON.stringify(assessment.detailed_breakdown),
        missing_requirements: JSON.stringify(assessment.missing_requirements),
        recommendations: JSON.stringify(assessment.recommendations)
      })
    
    if (error) throw error
  }

  async getAssessmentHistory(applicationId: string): Promise<EligibilityAssessment[]> {
    if (!isSupabaseConfigured) {
      return []
    }

    const { data, error } = await supabase
      .from('eligibility_assessments')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    
    return (data || []).map(d => ({
      ...d,
      detailed_breakdown: JSON.parse(d.detailed_breakdown || '{}'),
      missing_requirements: JSON.parse(d.missing_requirements || '[]'),
      recommendations: JSON.parse(d.recommendations || '[]')
    }))
  }

  async submitAppeal(
    applicationId: string,
    assessmentId: string,
    appealReason: string,
    supportingDocuments: any[]
  ): Promise<void> {
    if (!isSupabaseConfigured) {
      throw new Error('Appeals require a live connection to the admissions database')
    }

    const { error } = await supabase
      .from('eligibility_appeals')
      .insert({
        application_id: applicationId,
        assessment_id: assessmentId,
        appeal_reason: appealReason,
        supporting_documents: JSON.stringify(supportingDocuments)
      })
    
    if (error) throw error
  }
}

export const eligibilityEngine = new EligibilityEngine()