// Enhanced Regulatory Compliance Checker for HPCZ, GNC/NMCZ, and ECZ
import { ZambianGradeValidator } from './gradeValidation'
import type { SubjectGrade } from './eligibilityEngine'

export interface RegulatoryBody {
  code: 'HPCZ' | 'NMCZ' | 'ECZ'
  name: string
  description: string
  website: string
  contact: string
}

export interface ProgramRequirement {
  id: string
  regulatory_body: string
  program_code: string
  program_name: string
  requirement_type: 'subject' | 'grade' | 'document' | 'age' | 'medical' | 'character'
  requirement_text: string
  validation_rule: string
  compliance_level: 'mandatory' | 'recommended' | 'optional'
  penalty_level: 'critical' | 'major' | 'minor'
  verification_method: 'automatic' | 'manual' | 'document_review'
  effective_date: string
  expiry_date?: string
}

export interface ComplianceResult {
  requirement_id: string
  requirement_text: string
  compliance_status: 'compliant' | 'non_compliant' | 'partial' | 'pending_verification'
  compliance_score: number // 0-100
  violation_details?: string
  recommendation: string
  verification_required: boolean
  regulatory_body: string
}

export interface ComplianceReport {
  application_id: string
  program_code: string
  overall_compliance: 'compliant' | 'non_compliant' | 'conditional'
  overall_score: number
  regulatory_bodies: string[]
  total_requirements: number
  compliant_requirements: number
  critical_violations: number
  major_violations: number
  minor_violations: number
  results: ComplianceResult[]
  recommendations: string[]
  next_steps: string[]
  generated_at: string
}

export const REGULATORY_BODIES: Record<string, RegulatoryBody> = {
  HPCZ: {
    code: 'HPCZ',
    name: 'Health Professions Council of Zambia',
    description: 'Regulates health professions including Clinical Medicine and Environmental Health',
    website: 'https://hpcz.org.zm',
    contact: 'info@hpcz.org.zm'
  },
  NMCZ: {
    code: 'NMCZ',
    name: 'Nurses and Midwives Council of Zambia',
    description: 'Regulates nursing and midwifery professions',
    website: 'https://nmcz.org.zm',
    contact: 'info@nmcz.org.zm'
  },
  ECZ: {
    code: 'ECZ',
    name: 'Examinations Council of Zambia',
    description: 'Manages national examinations and certification',
    website: 'https://ecz.org.zm',
    contact: 'info@ecz.org.zm'
  }
}

// Comprehensive program requirements database
export const PROGRAM_REQUIREMENTS: ProgramRequirement[] = [
  // HPCZ - Clinical Medicine Requirements
  {
    id: 'hpcz-dcm-001',
    regulatory_body: 'HPCZ',
    program_code: 'DCM',
    program_name: 'Diploma in Clinical Medicine',
    requirement_type: 'subject',
    requirement_text: 'Must have English Language with minimum grade 6 (Credit)',
    validation_rule: 'english_grade <= 6',
    compliance_level: 'mandatory',
    penalty_level: 'critical',
    verification_method: 'automatic',
    effective_date: '2024-01-01'
  },
  {
    id: 'hpcz-dcm-002',
    regulatory_body: 'HPCZ',
    program_code: 'DCM',
    program_name: 'Diploma in Clinical Medicine',
    requirement_type: 'subject',
    requirement_text: 'Must have Mathematics with minimum grade 6 (Credit)',
    validation_rule: 'mathematics_grade <= 6',
    compliance_level: 'mandatory',
    penalty_level: 'critical',
    verification_method: 'automatic',
    effective_date: '2024-01-01'
  },
  {
    id: 'hpcz-dcm-003',
    regulatory_body: 'HPCZ',
    program_code: 'DCM',
    program_name: 'Diploma in Clinical Medicine',
    requirement_type: 'subject',
    requirement_text: 'Must have Biology with minimum grade 6 (Credit) - MANDATORY',
    validation_rule: 'biology_grade <= 6',
    compliance_level: 'mandatory',
    penalty_level: 'critical',
    verification_method: 'automatic',
    effective_date: '2024-01-01'
  },
  {
    id: 'hpcz-dcm-004',
    regulatory_body: 'HPCZ',
    program_code: 'DCM',
    program_name: 'Diploma in Clinical Medicine',
    requirement_type: 'subject',
    requirement_text: 'Must have Chemistry with minimum grade 6 (Credit) OR Physics with minimum grade 6',
    validation_rule: 'chemistry_grade <= 6 OR physics_grade <= 6',
    compliance_level: 'mandatory',
    penalty_level: 'critical',
    verification_method: 'automatic',
    effective_date: '2024-01-01'
  },
  {
    id: 'hpcz-dcm-005',
    regulatory_body: 'HPCZ',
    program_code: 'DCM',
    program_name: 'Diploma in Clinical Medicine',
    requirement_type: 'grade',
    requirement_text: 'Must have minimum 5 O-Level credits (grades 1-6)',
    validation_rule: 'credit_count >= 5',
    compliance_level: 'mandatory',
    penalty_level: 'critical',
    verification_method: 'automatic',
    effective_date: '2024-01-01'
  },
  {
    id: 'hpcz-dcm-006',
    regulatory_body: 'HPCZ',
    program_code: 'DCM',
    program_name: 'Diploma in Clinical Medicine',
    requirement_type: 'medical',
    requirement_text: 'Medical fitness certificate required before enrollment',
    validation_rule: 'medical_certificate_provided',
    compliance_level: 'mandatory',
    penalty_level: 'critical',
    verification_method: 'document_review',
    effective_date: '2024-01-01'
  },
  {
    id: 'hpcz-dcm-007',
    regulatory_body: 'HPCZ',
    program_code: 'DCM',
    program_name: 'Diploma in Clinical Medicine',
    requirement_type: 'character',
    requirement_text: 'Good conduct certificate required',
    validation_rule: 'conduct_certificate_provided',
    compliance_level: 'mandatory',
    penalty_level: 'major',
    verification_method: 'document_review',
    effective_date: '2024-01-01'
  },

  // HPCZ - Environmental Health Requirements
  {
    id: 'hpcz-deh-001',
    regulatory_body: 'HPCZ',
    program_code: 'DEH',
    program_name: 'Diploma in Environmental Health',
    requirement_type: 'subject',
    requirement_text: 'Must have English Language with minimum grade 6 (Credit)',
    validation_rule: 'english_grade <= 6',
    compliance_level: 'mandatory',
    penalty_level: 'critical',
    verification_method: 'automatic',
    effective_date: '2024-01-01'
  },
  {
    id: 'hpcz-deh-002',
    regulatory_body: 'HPCZ',
    program_code: 'DEH',
    program_name: 'Diploma in Environmental Health',
    requirement_type: 'subject',
    requirement_text: 'Must have Mathematics with minimum grade 6 (Credit)',
    validation_rule: 'mathematics_grade <= 6',
    compliance_level: 'mandatory',
    penalty_level: 'critical',
    verification_method: 'automatic',
    effective_date: '2024-01-01'
  },
  {
    id: 'hpcz-deh-003',
    regulatory_body: 'HPCZ',
    program_code: 'DEH',
    program_name: 'Diploma in Environmental Health',
    requirement_type: 'subject',
    requirement_text: 'Must have Biology with minimum grade 6 (Credit)',
    validation_rule: 'biology_grade <= 6',
    compliance_level: 'mandatory',
    penalty_level: 'critical',
    verification_method: 'automatic',
    effective_date: '2024-01-01'
  },
  {
    id: 'hpcz-deh-004',
    regulatory_body: 'HPCZ',
    program_code: 'DEH',
    program_name: 'Diploma in Environmental Health',
    requirement_type: 'subject',
    requirement_text: 'Must have Chemistry with minimum grade 6 (Credit)',
    validation_rule: 'chemistry_grade <= 6',
    compliance_level: 'mandatory',
    penalty_level: 'critical',
    verification_method: 'automatic',
    effective_date: '2024-01-01'
  },
  {
    id: 'hpcz-deh-005',
    regulatory_body: 'HPCZ',
    program_code: 'DEH',
    program_name: 'Diploma in Environmental Health',
    requirement_type: 'subject',
    requirement_text: 'Geography, Agricultural Science, or Physics is highly recommended',
    validation_rule: 'geography_grade <= 6 OR agricultural_science_grade <= 6 OR physics_grade <= 6',
    compliance_level: 'recommended',
    penalty_level: 'minor',
    verification_method: 'automatic',
    effective_date: '2024-01-01'
  },
  // NMCZ - Registered Nursing Requirements
  {
    id: 'nmcz-drn-001',
    regulatory_body: 'NMCZ',
    program_code: 'DRN',
    program_name: 'Diploma in Registered Nursing',
    requirement_type: 'subject',
    requirement_text: 'Must have English Language with minimum grade 6 (Credit)',
    validation_rule: 'english_grade <= 6',
    compliance_level: 'mandatory',
    penalty_level: 'critical',
    verification_method: 'automatic',
    effective_date: '2024-01-01'
  },
  {
    id: 'nmcz-drn-002',
    regulatory_body: 'NMCZ',
    program_code: 'DRN',
    program_name: 'Diploma in Registered Nursing',
    requirement_type: 'subject',
    requirement_text: 'Must have Mathematics with minimum grade 6 (Credit)',
    validation_rule: 'mathematics_grade <= 6',
    compliance_level: 'mandatory',
    penalty_level: 'critical',
    verification_method: 'automatic',
    effective_date: '2024-01-01'
  },
  {
    id: 'nmcz-drn-003',
    regulatory_body: 'NMCZ',
    program_code: 'DRN',
    program_name: 'Diploma in Registered Nursing',
    requirement_type: 'subject',
    requirement_text: 'Must have Biology with minimum grade 6 (Credit)',
    validation_rule: 'biology_grade <= 6',
    compliance_level: 'mandatory',
    penalty_level: 'critical',
    verification_method: 'automatic',
    effective_date: '2024-01-01'
  },
  {
    id: 'nmcz-drn-004',
    regulatory_body: 'NMCZ',
    program_code: 'DRN',
    program_name: 'Diploma in Registered Nursing',
    requirement_type: 'subject',
    requirement_text: 'Must have Chemistry OR Physics with minimum grade 6 (Credit)',
    validation_rule: 'chemistry_grade <= 6 OR physics_grade <= 6',
    compliance_level: 'mandatory',
    penalty_level: 'critical',
    verification_method: 'automatic',
    effective_date: '2024-01-01'
  },
  {
    id: 'nmcz-drn-005',
    regulatory_body: 'NMCZ',
    program_code: 'DRN',
    program_name: 'Diploma in Registered Nursing',
    requirement_type: 'grade',
    requirement_text: 'Must have minimum 5 O-Level credits (grades 1-6)',
    validation_rule: 'credit_count >= 5',
    compliance_level: 'mandatory',
    penalty_level: 'critical',
    verification_method: 'automatic',
    effective_date: '2024-01-01'
  },
  {
    id: 'nmcz-drn-006',
    regulatory_body: 'NMCZ',
    program_code: 'DRN',
    program_name: 'Diploma in Registered Nursing',
    requirement_type: 'age',
    requirement_text: 'Must be at least 18 years old at time of enrollment',
    validation_rule: 'age >= 18',
    compliance_level: 'mandatory',
    penalty_level: 'critical',
    verification_method: 'document_review',
    effective_date: '2024-01-01'
  },
  {
    id: 'nmcz-drn-007',
    regulatory_body: 'NMCZ',
    program_code: 'DRN',
    program_name: 'Diploma in Registered Nursing',
    requirement_type: 'medical',
    requirement_text: 'Medical fitness certificate required before enrollment',
    validation_rule: 'medical_certificate_provided',
    compliance_level: 'mandatory',
    penalty_level: 'critical',
    verification_method: 'document_review',
    effective_date: '2024-01-01'
  },
  {
    id: 'nmcz-drn-008',
    regulatory_body: 'NMCZ',
    program_code: 'DRN',
    program_name: 'Diploma in Registered Nursing',
    requirement_type: 'character',
    requirement_text: 'Police clearance certificate and good conduct certificate required',
    validation_rule: 'police_clearance_provided AND conduct_certificate_provided',
    compliance_level: 'mandatory',
    penalty_level: 'major',
    verification_method: 'document_review',
    effective_date: '2024-01-01'
  }
]

export class RegulatoryComplianceChecker {
  
  /**
   * Gets all requirements for a specific program
   */
  getRequirementsForProgram(programCode: string): ProgramRequirement[] {
    return PROGRAM_REQUIREMENTS.filter(req => req.program_code === programCode)
  }

  /**
   * Gets mandatory requirements only
   */
  getMandatoryRequirements(programCode: string): ProgramRequirement[] {
    return this.getRequirementsForProgram(programCode)
      .filter(req => req.compliance_level === 'mandatory')
  }

  /**
   * Performs comprehensive compliance check for a program
   */
  checkCompliance(
    programCode: string,
    applicationData: {
      grades: SubjectGrade[]
      age?: number
      documents?: string[]
      [key: string]: any
    }
  ): ComplianceReport {
    const requirements = this.getRequirementsForProgram(programCode)
    const results: ComplianceResult[] = []
    const recommendations: string[] = []
    const nextSteps: string[] = []

    let compliantCount = 0
    let criticalViolations = 0
    let majorViolations = 0
    let minorViolations = 0

    // Process each requirement
    for (const requirement of requirements) {
      const result = this.evaluateRequirement(requirement, applicationData)
      results.push(result)

      if (result.compliance_status === 'compliant') {
        compliantCount++
      } else {
        // Count violations by severity
        if (requirement.penalty_level === 'critical') criticalViolations++
        else if (requirement.penalty_level === 'major') majorViolations++
        else minorViolations++

        // Add recommendations
        if (result.recommendation) {
          recommendations.push(result.recommendation)
        }
      }
    }

    // Determine overall compliance
    let overallCompliance: 'compliant' | 'non_compliant' | 'conditional'
    if (criticalViolations === 0 && majorViolations === 0) {
      overallCompliance = minorViolations === 0 ? 'compliant' : 'conditional'
    } else if (criticalViolations === 0) {
      overallCompliance = 'conditional'
    } else {
      overallCompliance = 'non_compliant'
    }

    // Calculate overall score
    const totalScore = results.reduce((sum, r) => sum + r.compliance_score, 0)
    const overallScore = requirements.length > 0 ? Math.round(totalScore / requirements.length) : 0

    // Generate next steps
    if (criticalViolations > 0) {
      nextSteps.push('Address critical violations before proceeding with application')
    }
    if (majorViolations > 0) {
      nextSteps.push('Resolve major compliance issues for better admission chances')
    }
    if (results.some(r => r.verification_required)) {
      nextSteps.push('Submit required documents for manual verification')
    }
    if (overallCompliance === 'compliant') {
      nextSteps.push('All regulatory requirements met - proceed with confidence')
    }

    return {
      application_id: applicationData.application_id || 'unknown',
      program_code: programCode,
      overall_compliance: overallCompliance,
      overall_score: overallScore,
      regulatory_bodies: [...new Set(requirements.map(r => r.regulatory_body))],
      total_requirements: requirements.length,
      compliant_requirements: compliantCount,
      critical_violations: criticalViolations,
      major_violations: majorViolations,
      minor_violations: minorViolations,
      results,
      recommendations: [...new Set(recommendations)],
      next_steps: nextSteps,
      generated_at: new Date().toISOString()
    }
  }
  /**
   * Evaluates a single requirement against application data
   */
  private evaluateRequirement(
    requirement: ProgramRequirement,
    applicationData: any
  ): ComplianceResult {
    const result: ComplianceResult = {
      requirement_id: requirement.id,
      requirement_text: requirement.requirement_text,
      compliance_status: 'non_compliant',
      compliance_score: 0,
      recommendation: '',
      verification_required: requirement.verification_method !== 'automatic',
      regulatory_body: requirement.regulatory_body
    }

    try {
      switch (requirement.requirement_type) {
        case 'subject':
          return this.evaluateSubjectRequirement(requirement, applicationData, result)
        case 'grade':
          return this.evaluateGradeRequirement(requirement, applicationData, result)
        case 'age':
          return this.evaluateAgeRequirement(requirement, applicationData, result)
        case 'document':
        case 'medical':
        case 'character':
          return this.evaluateDocumentRequirement(requirement, applicationData, result)
        default:
          result.compliance_status = 'pending_verification'
          result.compliance_score = 50
          result.recommendation = 'Manual verification required'
          return result
      }
    } catch (error) {
      result.compliance_status = 'pending_verification'
      result.compliance_score = 0
      result.violation_details = `Error evaluating requirement: ${error}`
      result.recommendation = 'Contact admissions office for clarification'
      return result
    }
  }

  private evaluateSubjectRequirement(
    requirement: ProgramRequirement,
    applicationData: any,
    result: ComplianceResult
  ): ComplianceResult {
    const grades = applicationData.grades || []
    const rule = requirement.validation_rule

    // Parse subject requirements from validation rule
    if (rule.includes('english_grade')) {
      const englishGrade = this.findSubjectGrade(grades, 'english')
      const requiredGrade = this.extractGradeFromRule(rule, 'english_grade')
      
      if (!englishGrade) {
        result.violation_details = 'English Language subject not found'
        result.recommendation = 'Add English Language to your subject selection'
        result.compliance_score = 0
      } else if (englishGrade.grade > requiredGrade) {
        result.violation_details = `English grade ${englishGrade.grade} does not meet minimum requirement of ${requiredGrade}`
        result.recommendation = `Improve English grade to at least ${requiredGrade} (${this.getGradeDescription(requiredGrade)})`
        result.compliance_score = Math.max(0, 100 - ((englishGrade.grade - requiredGrade) * 20))
      } else {
        result.compliance_status = 'compliant'
        result.compliance_score = 100
        result.recommendation = 'English requirement met'
      }
    }

    if (rule.includes('mathematics_grade')) {
      const mathGrade = this.findSubjectGrade(grades, 'mathematics')
      const requiredGrade = this.extractGradeFromRule(rule, 'mathematics_grade')
      
      if (!mathGrade) {
        result.violation_details = 'Mathematics subject not found'
        result.recommendation = 'Add Mathematics to your subject selection'
        result.compliance_score = 0
      } else if (mathGrade.grade > requiredGrade) {
        result.violation_details = `Mathematics grade ${mathGrade.grade} does not meet minimum requirement of ${requiredGrade}`
        result.recommendation = `Improve Mathematics grade to at least ${requiredGrade} (${this.getGradeDescription(requiredGrade)})`
        result.compliance_score = Math.max(0, 100 - ((mathGrade.grade - requiredGrade) * 20))
      } else {
        result.compliance_status = 'compliant'
        result.compliance_score = 100
        result.recommendation = 'Mathematics requirement met'
      }
    }

    if (rule.includes('biology_grade')) {
      const bioGrade = this.findSubjectGrade(grades, 'biology')
      const requiredGrade = this.extractGradeFromRule(rule, 'biology_grade')
      
      if (!bioGrade) {
        result.violation_details = 'Biology subject not found'
        result.recommendation = 'Add Biology to your subject selection'
        result.compliance_score = 0
      } else if (bioGrade.grade > requiredGrade) {
        result.violation_details = `Biology grade ${bioGrade.grade} does not meet minimum requirement of ${requiredGrade}`
        result.recommendation = `Improve Biology grade to at least ${requiredGrade} (${this.getGradeDescription(requiredGrade)})`
        result.compliance_score = Math.max(0, 100 - ((bioGrade.grade - requiredGrade) * 20))
      } else {
        result.compliance_status = 'compliant'
        result.compliance_score = 100
        result.recommendation = 'Biology requirement met'
      }
    }

    // Handle OR conditions (e.g., Chemistry OR Physics)
    if (rule.includes(' OR ')) {
      const orConditions = rule.split(' OR ')
      let anyMet = false
      let bestScore = 0
      let bestRecommendation = ''

      for (const condition of orConditions) {
        if (condition.includes('chemistry_grade')) {
          const chemGrade = this.findSubjectGrade(grades, 'chemistry')
          const requiredGrade = this.extractGradeFromRule(condition, 'chemistry_grade')
          
          if (chemGrade && chemGrade.grade <= requiredGrade) {
            anyMet = true
            bestScore = 100
            bestRecommendation = 'Chemistry requirement met'
            break
          } else if (chemGrade) {
            bestScore = Math.max(bestScore, 100 - ((chemGrade.grade - requiredGrade) * 20))
            bestRecommendation = `Improve Chemistry grade to at least ${requiredGrade}`
          }
        }

        if (condition.includes('physics_grade')) {
          const physGrade = this.findSubjectGrade(grades, 'physics')
          const requiredGrade = this.extractGradeFromRule(condition, 'physics_grade')
          
          if (physGrade && physGrade.grade <= requiredGrade) {
            anyMet = true
            bestScore = 100
            bestRecommendation = 'Physics requirement met'
            break
          } else if (physGrade) {
            bestScore = Math.max(bestScore, 100 - ((physGrade.grade - requiredGrade) * 20))
            bestRecommendation = `Improve Physics grade to at least ${requiredGrade}`
          }
        }
      }

      if (anyMet) {
        result.compliance_status = 'compliant'
        result.compliance_score = 100
        result.recommendation = bestRecommendation
      } else {
        result.compliance_score = bestScore
        result.recommendation = bestRecommendation || 'Add Chemistry or Physics to your subject selection'
        result.violation_details = 'Neither Chemistry nor Physics meets the requirement'
      }
    }

    return result
  }

  private evaluateGradeRequirement(
    requirement: ProgramRequirement,
    applicationData: any,
    result: ComplianceResult
  ): ComplianceResult {
    const grades = applicationData.grades || []
    const rule = requirement.validation_rule

    if (rule.includes('credit_count')) {
      const requiredCredits = this.extractNumberFromRule(rule, 'credit_count')
      const creditGrades = grades.filter((g: SubjectGrade) => 
        ZambianGradeValidator.isCreditLevel(g.grade)
      )
      
      if (creditGrades.length >= requiredCredits) {
        result.compliance_status = 'compliant'
        result.compliance_score = 100
        result.recommendation = `Credit requirement met (${creditGrades.length}/${requiredCredits})`
      } else {
        const deficit = requiredCredits - creditGrades.length
        result.violation_details = `Only ${creditGrades.length} credits found, need ${requiredCredits}`
        result.recommendation = `Improve ${deficit} more subject(s) to credit level (grade 6 or better)`
        result.compliance_score = Math.round((creditGrades.length / requiredCredits) * 100)
      }
    }

    return result
  }

  private evaluateAgeRequirement(
    requirement: ProgramRequirement,
    applicationData: any,
    result: ComplianceResult
  ): ComplianceResult {
    const age = applicationData.age
    const rule = requirement.validation_rule

    if (rule.includes('age >=')) {
      const requiredAge = this.extractNumberFromRule(rule, 'age')
      
      if (age === undefined || age === null) {
        result.compliance_status = 'pending_verification'
        result.compliance_score = 50
        result.recommendation = 'Age verification required - provide birth certificate'
        result.verification_required = true
      } else if (age >= requiredAge) {
        result.compliance_status = 'compliant'
        result.compliance_score = 100
        result.recommendation = 'Age requirement met'
      } else {
        result.violation_details = `Age ${age} is below minimum requirement of ${requiredAge}`
        result.recommendation = `Must be at least ${requiredAge} years old at enrollment`
        result.compliance_score = 0
      }
    }

    return result
  }

  private evaluateDocumentRequirement(
    requirement: ProgramRequirement,
    applicationData: any,
    result: ComplianceResult
  ): ComplianceResult {
    // Document requirements require manual verification
    result.compliance_status = 'pending_verification'
    result.compliance_score = 50
    result.verification_required = true
    
    const documents = applicationData.documents || []
    const rule = requirement.validation_rule

    if (rule.includes('medical_certificate')) {
      const hasMedical = documents.some((doc: string) => 
        doc.toLowerCase().includes('medical') || doc.toLowerCase().includes('fitness')
      )
      result.recommendation = hasMedical 
        ? 'Medical certificate uploaded - pending verification'
        : 'Upload medical fitness certificate'
    } else if (rule.includes('conduct_certificate')) {
      const hasConduct = documents.some((doc: string) => 
        doc.toLowerCase().includes('conduct') || doc.toLowerCase().includes('character')
      )
      result.recommendation = hasConduct
        ? 'Conduct certificate uploaded - pending verification'
        : 'Upload good conduct certificate'
    } else if (rule.includes('police_clearance')) {
      const hasPolice = documents.some((doc: string) => 
        doc.toLowerCase().includes('police') || doc.toLowerCase().includes('clearance')
      )
      result.recommendation = hasPolice
        ? 'Police clearance uploaded - pending verification'
        : 'Upload police clearance certificate'
    } else {
      result.recommendation = 'Document verification required'
    }

    return result
  }
  // Helper methods
  private findSubjectGrade(grades: SubjectGrade[], subjectName: string): SubjectGrade | undefined {
    return grades.find(g => 
      g.subject_name.toLowerCase().includes(subjectName.toLowerCase())
    )
  }

  private extractGradeFromRule(rule: string, variable: string): number {
    const match = rule.match(new RegExp(`${variable}\\s*<=\\s*(\\d+)`))
    return match ? parseInt(match[1]) : 6 // Default to grade 6 if not found
  }

  private extractNumberFromRule(rule: string, variable: string): number {
    const match = rule.match(new RegExp(`${variable}\\s*>=\\s*(\\d+)`))
    return match ? parseInt(match[1]) : 5 // Default to 5 if not found
  }

  private getGradeDescription(grade: number): string {
    const descriptions: Record<number, string> = {
      1: 'A+ (Distinction)',
      2: 'A (Merit)',
      3: 'B+ (Very Good)',
      4: 'B (Good)',
      5: 'C+ (Satisfactory)',
      6: 'C (Credit)',
      7: 'D (Pass)',
      8: 'E (Weak Pass)',
      9: 'F (Fail)'
    }
    return descriptions[grade] || `Grade ${grade}`
  }

  /**
   * Generates a detailed compliance report with recommendations
   */
  generateDetailedReport(
    programCode: string,
    applicationData: any
  ): ComplianceReport & {
    regulatory_body_info: RegulatoryBody[]
    program_info: {
      code: string
      name: string
      regulatory_bodies: string[]
    }
  } {
    const report = this.checkCompliance(programCode, applicationData)
    const requirements = this.getRequirementsForProgram(programCode)
    
    // Get regulatory body information
    const regulatoryBodyInfo = report.regulatory_bodies.map(body => REGULATORY_BODIES[body])
    
    // Get program information
    const programInfo = {
      code: programCode,
      name: requirements[0]?.program_name || 'Unknown Program',
      regulatory_bodies: report.regulatory_bodies
    }

    return {
      ...report,
      regulatory_body_info: regulatoryBodyInfo,
      program_info: programInfo
    }
  }

  /**
   * Gets all available programs with their regulatory bodies
   */
  getAvailablePrograms(): Array<{
    code: string
    name: string
    regulatory_body: string
    requirement_count: number
  }> {
    const programs = new Map<string, {
      code: string
      name: string
      regulatory_body: string
      requirement_count: number
    }>()

    for (const req of PROGRAM_REQUIREMENTS) {
      const key = req.program_code
      if (!programs.has(key)) {
        programs.set(key, {
          code: req.program_code,
          name: req.program_name,
          regulatory_body: req.regulatory_body,
          requirement_count: 0
        })
      }
      programs.get(key)!.requirement_count++
    }

    return Array.from(programs.values()).sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Validates program code exists
   */
  isValidProgramCode(programCode: string): boolean {
    return PROGRAM_REQUIREMENTS.some(req => req.program_code === programCode)
  }

  /**
   * Gets regulatory body information
   */
  getRegulatoryBodyInfo(bodyCode: string): RegulatoryBody | undefined {
    return REGULATORY_BODIES[bodyCode]
  }

  /**
   * Searches requirements by text
   */
  searchRequirements(query: string): ProgramRequirement[] {
    const searchTerm = query.toLowerCase()
    return PROGRAM_REQUIREMENTS.filter(req =>
      req.program_name.toLowerCase().includes(searchTerm) ||
      req.requirement_text.toLowerCase().includes(searchTerm) ||
      req.regulatory_body.toLowerCase().includes(searchTerm)
    )
  }
}

// Export singleton instance
export const regulatoryComplianceChecker = new RegulatoryComplianceChecker()

// Export convenience functions
export const checkProgramCompliance = (programCode: string, applicationData: any) =>
  regulatoryComplianceChecker.checkCompliance(programCode, applicationData)

export const generateComplianceReport = (programCode: string, applicationData: any) =>
  regulatoryComplianceChecker.generateDetailedReport(programCode, applicationData)

export const getAvailablePrograms = () =>
  regulatoryComplianceChecker.getAvailablePrograms()

export const validateProgramCode = (programCode: string) =>
  regulatoryComplianceChecker.isValidProgramCode(programCode)