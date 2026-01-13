import { describe, it, expect } from 'vitest'
import {
  RegulatoryComplianceChecker,
  regulatoryComplianceChecker,
  checkProgramCompliance,
  generateComplianceReport,
  getAvailablePrograms,
  validateProgramCode,
  REGULATORY_BODIES,
  PROGRAM_REQUIREMENTS
} from '../regulatoryComplianceChecker'

describe('RegulatoryComplianceChecker', () => {
  const mockApplicationData = {
    application_id: 'test-app-001',
    grades: [
      { subject_id: '1', subject_name: 'English Language', grade: 5 },
      { subject_id: '2', subject_name: 'Mathematics', grade: 4 },
      { subject_id: '3', subject_name: 'Biology', grade: 3 },
      { subject_id: '4', subject_name: 'Chemistry', grade: 4 },
      { subject_id: '5', subject_name: 'Physics', grade: 5 },
      { subject_id: '6', subject_name: 'Geography', grade: 6 }
    ],
    age: 19,
    documents: ['medical_certificate.pdf', 'conduct_certificate.pdf']
  }

  describe('getRequirementsForProgram', () => {
    it('should return requirements for Clinical Medicine', () => {
      const requirements = regulatoryComplianceChecker.getRequirementsForProgram('DCM')
      expect(requirements.length).toBeGreaterThan(0)
      expect(requirements.every(req => req.program_code === 'DCM')).toBe(true)
      expect(requirements.some(req => req.regulatory_body === 'HPCZ')).toBe(true)
    })

    it('should return requirements for Registered Nursing', () => {
      const requirements = regulatoryComplianceChecker.getRequirementsForProgram('DRN')
      expect(requirements.length).toBeGreaterThan(0)
      expect(requirements.every(req => req.program_code === 'DRN')).toBe(true)
      expect(requirements.some(req => req.regulatory_body === 'NMCZ')).toBe(true)
    })

    it('should return empty array for invalid program code', () => {
      const requirements = regulatoryComplianceChecker.getRequirementsForProgram('INVALID')
      expect(requirements).toHaveLength(0)
    })
  })

  describe('getMandatoryRequirements', () => {
    it('should return only mandatory requirements', () => {
      const requirements = regulatoryComplianceChecker.getMandatoryRequirements('DCM')
      expect(requirements.length).toBeGreaterThan(0)
      expect(requirements.every(req => req.compliance_level === 'mandatory')).toBe(true)
    })
  })

  describe('checkCompliance', () => {
    it('should check compliance for Clinical Medicine with good grades', () => {
      const report = regulatoryComplianceChecker.checkCompliance('DCM', mockApplicationData)
      
      expect(report.program_code).toBe('DCM')
      expect(report.overall_score).toBeGreaterThan(0)
      expect(report.results.length).toBeGreaterThan(0)
      expect(report.regulatory_bodies).toContain('HPCZ')
      expect(report.generated_at).toBeDefined()
    })

    it('should identify violations with poor grades', () => {
      const poorGradesData = {
        ...mockApplicationData,
        grades: [
          { subject_id: '1', subject_name: 'English Language', grade: 8 }, // Poor grade
          { subject_id: '2', subject_name: 'Mathematics', grade: 9 }, // Fail
          { subject_id: '3', subject_name: 'Biology', grade: 7 } // Just pass
        ]
      }

      const report = regulatoryComplianceChecker.checkCompliance('DCM', poorGradesData)
      
      expect(report.overall_compliance).toBe('non_compliant')
      expect(report.critical_violations).toBeGreaterThan(0)
      expect(report.recommendations.length).toBeGreaterThan(0)
    })

    it('should handle missing subjects', () => {
      const missingSubjectsData = {
        ...mockApplicationData,
        grades: [
          { subject_id: '1', subject_name: 'English Language', grade: 5 },
          { subject_id: '2', subject_name: 'Geography', grade: 6 }
          // Missing Mathematics, Biology, Chemistry
        ]
      }

      const report = regulatoryComplianceChecker.checkCompliance('DCM', missingSubjectsData)
      
      expect(report.critical_violations).toBeGreaterThan(0)
      expect(report.recommendations.some(r => r.includes('Mathematics'))).toBe(true)
      expect(report.recommendations.some(r => r.includes('Biology'))).toBe(true)
    })

    it('should handle age requirements for nursing', () => {
      const underageData = {
        ...mockApplicationData,
        age: 17 // Under 18
      }

      const report = regulatoryComplianceChecker.checkCompliance('DRN', underageData)
      
      const ageResult = report.results.find(r => r.requirement_text.includes('18 years'))
      expect(ageResult?.compliance_status).toBe('non_compliant')
    })

    it('should handle document requirements', () => {
      const noDocumentsData = {
        ...mockApplicationData,
        documents: []
      }

      const report = regulatoryComplianceChecker.checkCompliance('DRN', noDocumentsData)
      
      const documentResults = report.results.filter(r => r.verification_required)
      expect(documentResults.length).toBeGreaterThan(0)
      expect(documentResults.some(r => r.compliance_status === 'pending_verification')).toBe(true)
    })
  })

  describe('generateDetailedReport', () => {
    it('should generate detailed report with regulatory body info', () => {
      const report = regulatoryComplianceChecker.generateDetailedReport('DCM', mockApplicationData)
      
      expect(report.regulatory_body_info).toBeDefined()
      expect(report.program_info).toBeDefined()
      expect(report.program_info.code).toBe('DCM')
      expect(report.regulatory_body_info.length).toBeGreaterThan(0)
      expect(report.regulatory_body_info[0]).toHaveProperty('name')
      expect(report.regulatory_body_info[0]).toHaveProperty('website')
    })
  })

  describe('getAvailablePrograms', () => {
    it('should return list of available programs', () => {
      const programs = regulatoryComplianceChecker.getAvailablePrograms()
      
      expect(programs.length).toBeGreaterThan(0)
      expect(programs[0]).toHaveProperty('code')
      expect(programs[0]).toHaveProperty('name')
      expect(programs[0]).toHaveProperty('regulatory_body')
      expect(programs[0]).toHaveProperty('requirement_count')
      
      // Should include our test programs
      expect(programs.some(p => p.code === 'DCM')).toBe(true)
      expect(programs.some(p => p.code === 'DRN')).toBe(true)
      expect(programs.some(p => p.code === 'DEH')).toBe(true)
    })
  })

  describe('validation methods', () => {
    it('should validate program codes correctly', () => {
      expect(regulatoryComplianceChecker.isValidProgramCode('DCM')).toBe(true)
      expect(regulatoryComplianceChecker.isValidProgramCode('DRN')).toBe(true)
      expect(regulatoryComplianceChecker.isValidProgramCode('DEH')).toBe(true)
      expect(regulatoryComplianceChecker.isValidProgramCode('INVALID')).toBe(false)
    })

    it('should get regulatory body info', () => {
      const hpcz = regulatoryComplianceChecker.getRegulatoryBodyInfo('HPCZ')
      expect(hpcz).toBeDefined()
      expect(hpcz?.name).toBe('Health Professions Council of Zambia')
      expect(hpcz?.website).toBeDefined()

      const invalid = regulatoryComplianceChecker.getRegulatoryBodyInfo('INVALID')
      expect(invalid).toBeUndefined()
    })
  })

  describe('searchRequirements', () => {
    it('should search requirements by text', () => {
      const results = regulatoryComplianceChecker.searchRequirements('English')
      expect(results.length).toBeGreaterThan(0)
      expect(results.every(r => 
        r.requirement_text.toLowerCase().includes('english') ||
        r.program_name.toLowerCase().includes('english')
      )).toBe(true)
    })

    it('should search by regulatory body', () => {
      const results = regulatoryComplianceChecker.searchRequirements('HPCZ')
      expect(results.length).toBeGreaterThan(0)
      expect(results.every(r => r.regulatory_body === 'HPCZ')).toBe(true)
    })
  })
})
describe('Convenience functions', () => {
  it('should export working convenience functions', () => {
    expect(typeof checkProgramCompliance).toBe('function')
    expect(typeof generateComplianceReport).toBe('function')
    expect(typeof getAvailablePrograms).toBe('function')
    expect(typeof validateProgramCode).toBe('function')
  })

  it('should work when called directly', () => {
    const report = checkProgramCompliance('DCM', mockApplicationData)
    expect(report.program_code).toBe('DCM')

    const detailedReport = generateComplianceReport('DCM', mockApplicationData)
    expect(detailedReport.regulatory_body_info).toBeDefined()

    const programs = getAvailablePrograms()
    expect(programs.length).toBeGreaterThan(0)

    expect(validateProgramCode('DCM')).toBe(true)
    expect(validateProgramCode('INVALID')).toBe(false)
  })
})

describe('Constants and data structures', () => {
  it('should have valid regulatory bodies', () => {
    expect(REGULATORY_BODIES.HPCZ).toBeDefined()
    expect(REGULATORY_BODIES.NMCZ).toBeDefined()
    expect(REGULATORY_BODIES.ECZ).toBeDefined()
    
    expect(REGULATORY_BODIES.HPCZ.name).toBe('Health Professions Council of Zambia')
    expect(REGULATORY_BODIES.NMCZ.name).toBe('Nurses and Midwives Council of Zambia')
    expect(REGULATORY_BODIES.ECZ.name).toBe('Examinations Council of Zambia')
  })

  it('should have valid program requirements', () => {
    expect(PROGRAM_REQUIREMENTS.length).toBeGreaterThan(0)
    
    // Check structure of requirements
    const firstReq = PROGRAM_REQUIREMENTS[0]
    expect(firstReq).toHaveProperty('id')
    expect(firstReq).toHaveProperty('regulatory_body')
    expect(firstReq).toHaveProperty('program_code')
    expect(firstReq).toHaveProperty('program_name')
    expect(firstReq).toHaveProperty('requirement_type')
    expect(firstReq).toHaveProperty('requirement_text')
    expect(firstReq).toHaveProperty('validation_rule')
    expect(firstReq).toHaveProperty('compliance_level')
    expect(firstReq).toHaveProperty('penalty_level')
    expect(firstReq).toHaveProperty('verification_method')
    expect(firstReq).toHaveProperty('effective_date')
  })

  it('should have requirements for all major programs', () => {
    const dcmReqs = PROGRAM_REQUIREMENTS.filter(r => r.program_code === 'DCM')
    const drnReqs = PROGRAM_REQUIREMENTS.filter(r => r.program_code === 'DRN')
    const dehReqs = PROGRAM_REQUIREMENTS.filter(r => r.program_code === 'DEH')
    
    expect(dcmReqs.length).toBeGreaterThan(0)
    expect(drnReqs.length).toBeGreaterThan(0)
    expect(dehReqs.length).toBeGreaterThan(0)
    
    // Check that each program has mandatory requirements
    expect(dcmReqs.some(r => r.compliance_level === 'mandatory')).toBe(true)
    expect(drnReqs.some(r => r.compliance_level === 'mandatory')).toBe(true)
    expect(dehReqs.some(r => r.compliance_level === 'mandatory')).toBe(true)
  })
})

describe('Edge cases and error handling', () => {
  it('should handle empty application data', () => {
    const emptyData = { grades: [] }
    const report = regulatoryComplianceChecker.checkCompliance('DCM', emptyData)
    
    expect(report.overall_compliance).toBe('non_compliant')
    expect(report.critical_violations).toBeGreaterThan(0)
    expect(report.recommendations.length).toBeGreaterThan(0)
  })

  it('should handle malformed grade data', () => {
    const malformedData = {
      grades: [
        { subject_name: 'English', grade: 'invalid' }, // Invalid grade
        { subject_name: 'Mathematics' }, // Missing grade
        { grade: 5 } // Missing subject name
      ]
    }
    
    // Should not throw error
    expect(() => {
      regulatoryComplianceChecker.checkCompliance('DCM', malformedData)
    }).not.toThrow()
  })

  it('should handle missing age data for age-sensitive programs', () => {
    const noAgeData = {
      grades: mockApplicationData.grades
      // age is undefined
    }
    
    const report = regulatoryComplianceChecker.checkCompliance('DRN', noAgeData)
    const ageResult = report.results.find(r => r.requirement_text.includes('18 years'))
    
    expect(ageResult?.compliance_status).toBe('pending_verification')
    expect(ageResult?.verification_required).toBe(true)
  })

  it('should handle unknown program codes gracefully', () => {
    const report = regulatoryComplianceChecker.checkCompliance('UNKNOWN', mockApplicationData)
    
    expect(report.program_code).toBe('UNKNOWN')
    expect(report.total_requirements).toBe(0)
    expect(report.overall_compliance).toBe('compliant') // No requirements to violate
  })
})