// Regulatory Guidelines for Health Professional Councils of Zambia
export interface RegulatoryGuideline {
  id: string
  regulatory_body: 'HPCZ' | 'NMCZ' | 'ECZ'
  program_code: string
  program_name: string
  guideline_type: 'admission' | 'academic' | 'clinical' | 'professional'
  requirement_text: string
  compliance_level: 'mandatory' | 'recommended' | 'optional'
  verification_required: boolean
  effective_date: string
  expiry_date?: string
  last_updated: string
}

export interface ComplianceCheck {
  guideline_id: string
  application_id: string
  compliance_status: 'compliant' | 'non_compliant' | 'pending_verification'
  verification_notes?: string
  verified_by?: string
  verified_at?: string
}

// HPCZ Guidelines for Health Programs (Based on official HPCZ requirements)
export const HPCZ_GUIDELINES: RegulatoryGuideline[] = [
  {
    id: 'hpcz-001',
    regulatory_body: 'HPCZ',
    program_code: 'DCM',
    program_name: 'Diploma in Clinical Medicine',
    guideline_type: 'admission',
    requirement_text: 'Minimum of 5 O-Level credits (grades 1-6) including English, Mathematics, Biology, Chemistry, and Physics',
    compliance_level: 'mandatory',
    verification_required: true,
    effective_date: '2024-01-01',
    last_updated: '2025-01-23'
  },
  {
    id: 'hpcz-002',
    regulatory_body: 'HPCZ',
    program_code: 'DCM',
    program_name: 'Diploma in Clinical Medicine',
    guideline_type: 'academic',
    requirement_text: 'Core science subjects (Biology, Chemistry, Physics) must have minimum grade 6 (credit level)',
    compliance_level: 'mandatory',
    verification_required: true,
    effective_date: '2024-01-01',
    last_updated: '2025-01-23'
  },
  {
    id: 'hpcz-003',
    regulatory_body: 'HPCZ',
    program_code: 'DCM',
    program_name: 'Diploma in Clinical Medicine',
    guideline_type: 'professional',
    requirement_text: 'Medical fitness certificate and good conduct required before enrollment',
    compliance_level: 'mandatory',
    verification_required: true,
    effective_date: '2024-01-01',
    last_updated: '2025-01-23'
  },
  {
    id: 'hpcz-004',
    regulatory_body: 'HPCZ',
    program_code: 'DEH',
    program_name: 'Diploma in Environmental Health',
    guideline_type: 'admission',
    requirement_text: 'Minimum of 5 O-Level credits (grades 1-6) including English, Mathematics, Biology, and Chemistry',
    compliance_level: 'mandatory',
    verification_required: true,
    effective_date: '2024-01-01',
    last_updated: '2025-01-23'
  },
  {
    id: 'hpcz-005',
    regulatory_body: 'HPCZ',
    program_code: 'DEH',
    program_name: 'Diploma in Environmental Health',
    guideline_type: 'academic',
    requirement_text: 'Geography, Agricultural Science, or Physics is highly recommended',
    compliance_level: 'recommended',
    verification_required: false,
    effective_date: '2024-01-01',
    last_updated: '2025-01-23'
  },
  {
    id: 'hpcz-006',
    regulatory_body: 'HPCZ',
    program_code: 'DEH',
    program_name: 'Diploma in Environmental Health',
    guideline_type: 'academic',
    requirement_text: 'Biology and Chemistry must have minimum grade 6 (credit level)',
    compliance_level: 'mandatory',
    verification_required: true,
    effective_date: '2024-01-01',
    last_updated: '2025-01-23'
  }
]

// GNC (General Nursing Council) / NMCZ Guidelines for Nursing Programs
export const NMCZ_GUIDELINES: RegulatoryGuideline[] = [
  {
    id: 'nmcz-001',
    regulatory_body: 'NMCZ',
    program_code: 'DRN',
    program_name: 'Diploma in Registered Nursing',
    guideline_type: 'admission',
    requirement_text: 'Minimum of 5 O-Level credits (grades 1-6) including English, Mathematics, Biology, and Chemistry or Physics',
    compliance_level: 'mandatory',
    verification_required: true,
    effective_date: '2024-01-01',
    last_updated: '2025-01-23'
  },
  {
    id: 'nmcz-002',
    regulatory_body: 'NMCZ',
    program_code: 'DRN',
    program_name: 'Diploma in Registered Nursing',
    guideline_type: 'academic',
    requirement_text: 'English and Mathematics must have minimum grade 6 (credit level)',
    compliance_level: 'mandatory',
    verification_required: true,
    effective_date: '2024-01-01',
    last_updated: '2025-01-23'
  },
  {
    id: 'nmcz-003',
    regulatory_body: 'NMCZ',
    program_code: 'DRN',
    program_name: 'Diploma in Registered Nursing',
    guideline_type: 'academic',
    requirement_text: 'Biology must have minimum grade 6 (credit level)',
    compliance_level: 'mandatory',
    verification_required: true,
    effective_date: '2024-01-01',
    last_updated: '2025-01-23'
  },
  {
    id: 'nmcz-004',
    regulatory_body: 'NMCZ',
    program_code: 'DRN',
    program_name: 'Diploma in Registered Nursing',
    guideline_type: 'professional',
    requirement_text: 'Medical fitness certificate, police clearance, and good conduct certificate required before enrollment',
    compliance_level: 'mandatory',
    verification_required: true,
    effective_date: '2024-01-01',
    last_updated: '2025-01-23'
  },
  {
    id: 'nmcz-005',
    regulatory_body: 'NMCZ',
    program_code: 'DRN',
    program_name: 'Diploma in Registered Nursing',
    guideline_type: 'admission',
    requirement_text: 'Minimum age of 18 years at time of enrollment',
    compliance_level: 'mandatory',
    verification_required: true,
    effective_date: '2024-01-01',
    last_updated: '2025-01-23'
  }
]

// ECZ Guidelines for Education Programs
export const ECZ_GUIDELINES: RegulatoryGuideline[] = [
  {
    id: 'ecz-001',
    regulatory_body: 'ECZ',
    program_code: 'TEACH',
    program_name: 'Teacher Education',
    guideline_type: 'admission',
    requirement_text: 'Minimum of 5 O-Level credits including English and Mathematics with grades 1-6',
    compliance_level: 'mandatory',
    verification_required: true,
    effective_date: '2024-01-01',
    last_updated: '2024-01-01'
  },
  {
    id: 'ecz-002',
    regulatory_body: 'ECZ',
    program_code: 'TEACH',
    program_name: 'Teacher Education',
    guideline_type: 'professional',
    requirement_text: 'Teaching subjects must align with O-Level subject combinations',
    compliance_level: 'mandatory',
    verification_required: true,
    effective_date: '2024-01-01',
    last_updated: '2024-01-01'
  }
]

export const ALL_GUIDELINES = [
  ...HPCZ_GUIDELINES,
  ...NMCZ_GUIDELINES,
  ...ECZ_GUIDELINES
]

export class RegulatoryComplianceEngine {
  
  async searchGuidelines(query: string, filters?: {
    regulatory_body?: string
    program_code?: string
    compliance_level?: string
  }): Promise<RegulatoryGuideline[]> {
    try {
      const { apiClient } = await import('@/services/client')
      const params = new URLSearchParams()
      params.set('type', 'regulatory_guidelines')
      if (query.trim()) params.set('search', query.trim())
      if (filters?.regulatory_body) params.set('regulatory_body', filters.regulatory_body)
      if (filters?.program_code) params.set('program_code', filters.program_code)
      if (filters?.compliance_level) params.set('compliance_level', filters.compliance_level)
      
      const result = await apiClient.request<{ data?: RegulatoryGuideline[] }>(
        `/catalog?${params.toString()}`
      )
      
      return result?.data ?? []
    } catch (error) {
      console.error('Error searching guidelines:', error)
      return this.searchGuidelinesLocal(query, filters)
    }
  }
  
  searchGuidelinesLocal(query: string, filters?: {
    regulatory_body?: string
    program_code?: string
    compliance_level?: string
  }): RegulatoryGuideline[] {
    let results = ALL_GUIDELINES
    
    // Apply filters
    if (filters?.regulatory_body) {
      results = results.filter(g => g.regulatory_body === filters.regulatory_body)
    }
    
    if (filters?.program_code) {
      results = results.filter(g => g.program_code === filters.program_code)
    }
    
    if (filters?.compliance_level) {
      results = results.filter(g => g.compliance_level === filters.compliance_level)
    }
    
    // Apply text search
    if (query.trim()) {
      const searchTerm = query.toLowerCase()
      results = results.filter(g => 
        g.program_name.toLowerCase().includes(searchTerm) ||
        g.requirement_text.toLowerCase().includes(searchTerm) ||
        g.regulatory_body.toLowerCase().includes(searchTerm) ||
        g.guideline_type.toLowerCase().includes(searchTerm)
      )
    }
    
    return results
  }
  
  getGuidelinesForProgram(programCode: string): RegulatoryGuideline[] {
    return ALL_GUIDELINES.filter(g => g.program_code === programCode)
  }
  
  getMandatoryGuidelines(programCode: string): RegulatoryGuideline[] {
    return this.getGuidelinesForProgram(programCode)
      .filter(g => g.compliance_level === 'mandatory')
  }
  
  checkCompliance(
    programCode: string,
    applicationData: any
  ): { compliant: boolean; violations: string[]; recommendations: string[] } {
    const guidelines = this.getMandatoryGuidelines(programCode)
    const violations: string[] = []
    const recommendations: string[] = []
    
    for (const guideline of guidelines) {
      const isCompliant = this.evaluateGuideline(guideline, applicationData)
      
      if (!isCompliant) {
        violations.push(guideline.requirement_text)
        recommendations.push(`Ensure compliance with: ${guideline.requirement_text}`)
      }
    }
    
    return {
      compliant: violations.length === 0,
      violations,
      recommendations
    }
  }
  
  private evaluateGuideline(guideline: RegulatoryGuideline, applicationData: any): boolean {
    // Basic compliance checking logic
    // This would be expanded based on specific guideline requirements
    
    if (guideline.guideline_type === 'admission') {
      // Check if required subjects are present with appropriate grades
      const grades = applicationData.grades || []
      
      if (guideline.requirement_text.includes('English')) {
        const englishGrade = grades.find((g: any) => 
          g.subject_name.toLowerCase().includes('english')
        )
        if (!englishGrade || englishGrade.grade > 6) return false
      }
      
      if (guideline.requirement_text.includes('Mathematics')) {
        const mathGrade = grades.find((g: any) => 
          g.subject_name.toLowerCase().includes('mathematics')
        )
        if (!mathGrade || mathGrade.grade > 6) return false
      }
      
      if (guideline.requirement_text.includes('Biology')) {
        const bioGrade = grades.find((g: any) => 
          g.subject_name.toLowerCase().includes('biology')
        )
        if (!bioGrade || bioGrade.grade > 6) return false
      }
    }
    
    return true
  }
  
  generateComplianceReport(programCode: string, applicationData: any) {
    const guidelines = this.getGuidelinesForProgram(programCode)
    const compliance = this.checkCompliance(programCode, applicationData)
    
    return {
      program_code: programCode,
      total_guidelines: guidelines.length,
      mandatory_guidelines: guidelines.filter(g => g.compliance_level === 'mandatory').length,
      compliance_status: compliance.compliant ? 'compliant' : 'non_compliant',
      violations: compliance.violations,
      recommendations: compliance.recommendations,
      regulatory_bodies: [...new Set(guidelines.map(g => g.regulatory_body))],
      last_checked: new Date().toISOString()
    }
  }
}

export const regulatoryEngine = new RegulatoryComplianceEngine()