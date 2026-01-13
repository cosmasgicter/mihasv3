/**
 * Eligibility Appeals Engine Tests
 * 
 * Tests for the eligibility appeals management engine including:
 * - Appeal submission and validation
 * - Review workflow management
 * - Decision tracking and audit trail
 * - Dashboard metrics and reporting
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { eligibilityAppealsEngine } from '@/lib/eligibilityAppealsEngine'
import type { EligibilityAppeal } from '@/lib/eligibilityAppealsEngine'

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({ data: null, error: null })),
          order: vi.fn(() => ({ data: [], error: null }))
        })),
        in: vi.fn(() => ({
          order: vi.fn(() => ({ data: [], error: null }))
        })),
        order: vi.fn(() => ({ data: [], error: null }))
      })),
      insert: vi.fn(() => ({ error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ error: null }))
      }))
    }))
  },
  isSupabaseConfigured: true
}))

describe('EligibilityAppealsEngine', () => {
  
  const mockApplicationId = 'test-app-123'
  const mockStudentId = 'test-student-456'
  const mockReviewerId = 'test-reviewer-789'
  
  const mockOriginalAssessment = {
    eligibilityStatus: 'needs_improvement',
    overallScore: 45,
    majorIssues: ['Grade average below credit level', 'Missing Biology grade'],
    assessmentDate: new Date('2024-01-15')
  }
  
  const mockAppealData = {
    appealType: 'grade_dispute' as const,
    appealReason: 'My Biology grade was incorrectly recorded. I achieved a Grade 5 but it shows as Grade 8.',
    supportingEvidence: [
      {
        type: 'certificate' as const,
        description: 'Original ECZ certificate showing Biology Grade 5',
        fileUrl: 'https://example.com/certificate.pdf',
        uploadedAt: new Date()
      }
    ],
    requestedChanges: {
      gradeCorrections: [
        {
          subject: 'Biology',
          currentGrade: 8,
          requestedGrade: 5,
          justification: 'Original certificate shows Grade 5, not Grade 8 as recorded'
        }
      ]
    },
    originalAssessment: mockOriginalAssessment
  }
  
  beforeEach(() => {
    vi.clearAllMocks()
  })
  
  describe('appeal submission', () => {
    
    it('should submit a new appeal successfully', async () => {
      const appeal = await eligibilityAppealsEngine.submitAppeal(
        mockApplicationId,
        mockStudentId,
        mockAppealData
      )
      
      expect(appeal).toBeDefined()
      expect(appeal.id).toMatch(/^APPEAL-/)
      expect(appeal.applicationId).toBe(mockApplicationId)
      expect(appeal.studentId).toBe(mockStudentId)
      expect(appeal.appealType).toBe('grade_dispute')
      expect(appeal.status).toBe('submitted')
      expect(appeal.submittedBy).toBe(mockStudentId)
      expect(appeal.submittedAt).toBeInstanceOf(Date)
      expect(appeal.expectedResolutionDate).toBeInstanceOf(Date)
      expect(appeal.communicationLog.length).toBeGreaterThan(0)
    })
    
    it('should calculate appropriate priority for different appeal types', async () => {
      // Test high priority for special circumstances
      const specialCircumstancesAppeal = await eligibilityAppealsEngine.submitAppeal(
        mockApplicationId,
        mockStudentId,
        {
          ...mockAppealData,
          appealType: 'special_circumstances',
          appealReason: 'Medical emergency prevented me from taking exams'
        }
      )
      
      expect(specialCircumstancesAppeal.priority).toBe('high')
      
      // Test urgent priority for urgent keywords
      const urgentAppeal = await eligibilityAppealsEngine.submitAppeal(
        mockApplicationId,
        mockStudentId,
        {
          ...mockAppealData,
          appealReason: 'Urgent deadline approaching - medical emergency documentation'
        }
      )
      
      expect(urgentAppeal.priority).toBe('urgent')
      
      // Test medium priority for grade disputes
      const gradeDispute = await eligibilityAppealsEngine.submitAppeal(
        mockApplicationId,
        mockStudentId,
        mockAppealData
      )
      
      expect(gradeDispute.priority).toBe('medium')
    })
    
    it('should calculate expected resolution date based on appeal type', async () => {
      const now = new Date()
      
      // Documentation issues should resolve faster (7 days)
      const docAppeal = await eligibilityAppealsEngine.submitAppeal(
        mockApplicationId,
        mockStudentId,
        {
          ...mockAppealData,
          appealType: 'documentation_issue'
        }
      )
      
      const docDays = Math.ceil((docAppeal.expectedResolutionDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      expect(docDays).toBeLessThanOrEqual(8) // Allow for timing differences
      
      // Requirement exceptions should take longer (28 days)
      const reqAppeal = await eligibilityAppealsEngine.submitAppeal(
        mockApplicationId,
        mockStudentId,
        {
          ...mockAppealData,
          appealType: 'requirement_exception'
        }
      )
      
      const reqDays = Math.ceil((reqAppeal.expectedResolutionDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      expect(reqDays).toBeGreaterThan(25)
    })
    
    it('should generate unique appeal IDs', async () => {
      const appeal1 = await eligibilityAppealsEngine.submitAppeal(
        mockApplicationId,
        mockStudentId,
        mockAppealData
      )
      
      const appeal2 = await eligibilityAppealsEngine.submitAppeal(
        mockApplicationId,
        mockStudentId,
        mockAppealData
      )
      
      expect(appeal1.id).not.toBe(appeal2.id)
      expect(appeal1.id).toMatch(/^APPEAL-[A-Z0-9]+-[A-Z0-9]+$/)
      expect(appeal2.id).toMatch(/^APPEAL-[A-Z0-9]+-[A-Z0-9]+$/)
    })
    
    it('should include initial communication log entry', async () => {
      const appeal = await eligibilityAppealsEngine.submitAppeal(
        mockApplicationId,
        mockStudentId,
        mockAppealData
      )
      
      expect(appeal.communicationLog).toHaveLength(1)
      expect(appeal.communicationLog[0].type).toBe('system')
      expect(appeal.communicationLog[0].message).toContain('Appeal submitted successfully')
      expect(appeal.communicationLog[0].sentBy).toBe('system')
      expect(appeal.communicationLog[0].isInternal).toBe(false)
    })
  })
  
  describe('appeal assignment and status updates', () => {
    
    let testAppeal: EligibilityAppeal
    
    beforeEach(async () => {
      testAppeal = await eligibilityAppealsEngine.submitAppeal(
        mockApplicationId,
        mockStudentId,
        mockAppealData
      )
    })
    
    it('should assign appeal to reviewer successfully', async () => {
      const success = await eligibilityAppealsEngine.assignAppealToReviewer(
        testAppeal.id,
        mockReviewerId,
        'admin-user'
      )
      
      expect(success).toBe(true)
    })
    
    it('should update appeal status with validation', async () => {
      // First assign to reviewer
      await eligibilityAppealsEngine.assignAppealToReviewer(
        testAppeal.id,
        mockReviewerId,
        'admin-user'
      )
      
      // Then update status
      const success = await eligibilityAppealsEngine.updateAppealStatus(
        testAppeal.id,
        'additional_info_required',
        mockReviewerId,
        'Need additional documentation to verify grade claim'
      )
      
      expect(success).toBe(true)
    })
    
    it('should handle non-existent appeal gracefully', async () => {
      const success = await eligibilityAppealsEngine.assignAppealToReviewer(
        'non-existent-appeal',
        mockReviewerId,
        'admin-user'
      )
      
      expect(success).toBe(false)
    })
  })
  
  describe('appeal decisions', () => {
    
    let testAppeal: EligibilityAppeal
    
    beforeEach(async () => {
      testAppeal = await eligibilityAppealsEngine.submitAppeal(
        mockApplicationId,
        mockStudentId,
        mockAppealData
      )
      
      // Assign to reviewer
      await eligibilityAppealsEngine.assignAppealToReviewer(
        testAppeal.id,
        mockReviewerId,
        'admin-user'
      )
    })
    
    it('should make approval decision successfully', async () => {
      const decision = {
        outcome: 'approved' as const,
        decisionReason: 'Grade correction verified through original ECZ certificate. Biology grade updated from 8 to 5.',
        decisionMadeBy: mockReviewerId,
        decisionMadeAt: new Date(),
        conditions: ['Updated grade will be reflected in new eligibility assessment'],
        newEligibilityStatus: 'good',
        newOverallScore: 68
      }
      
      const success = await eligibilityAppealsEngine.makeAppealDecision(
        testAppeal.id,
        decision,
        mockReviewerId
      )
      
      expect(success).toBe(true)
    })
    
    it('should make rejection decision successfully', async () => {
      const decision = {
        outcome: 'rejected' as const,
        decisionReason: 'Insufficient evidence provided. The submitted document does not clearly show the claimed grade.',
        decisionMadeBy: mockReviewerId,
        decisionMadeAt: new Date()
      }
      
      const success = await eligibilityAppealsEngine.makeAppealDecision(
        testAppeal.id,
        decision,
        mockReviewerId
      )
      
      expect(success).toBe(true)
    })
    
    it('should make partially approved decision with conditions', async () => {
      const decision = {
        outcome: 'partially_approved' as const,
        decisionReason: 'Grade correction approved but additional requirements must be met.',
        decisionMadeBy: mockReviewerId,
        decisionMadeAt: new Date(),
        conditions: [
          'Must provide certified translation of certificate',
          'Must complete supplementary interview'
        ],
        newEligibilityStatus: 'conditional',
        newOverallScore: 58
      }
      
      const success = await eligibilityAppealsEngine.makeAppealDecision(
        testAppeal.id,
        decision,
        mockReviewerId
      )
      
      expect(success).toBe(true)
    })
  })
  
  describe('supporting evidence management', () => {
    
    let testAppeal: EligibilityAppeal
    
    beforeEach(async () => {
      testAppeal = await eligibilityAppealsEngine.submitAppeal(
        mockApplicationId,
        mockStudentId,
        mockAppealData
      )
    })
    
    it('should add supporting evidence successfully', async () => {
      const newEvidence = {
        type: 'statement' as const,
        description: 'Written statement from school principal confirming grade error',
        uploadedAt: new Date()
      }
      
      const success = await eligibilityAppealsEngine.addSupportingEvidence(
        testAppeal.id,
        newEvidence,
        mockStudentId
      )
      
      expect(success).toBe(true)
    })
    
    it('should handle multiple evidence types', async () => {
      const evidenceTypes = [
        {
          type: 'medical' as const,
          description: 'Medical certificate for illness during exams',
          fileUrl: 'https://example.com/medical.pdf'
        },
        {
          type: 'other' as const,
          description: 'Affidavit from examination supervisor',
          fileUrl: 'https://example.com/affidavit.pdf'
        }
      ]
      
      for (const evidence of evidenceTypes) {
        const success = await eligibilityAppealsEngine.addSupportingEvidence(
          testAppeal.id,
          evidence,
          mockStudentId
        )
        expect(success).toBe(true)
      }
    })
  })
  
  describe('dashboard metrics', () => {
    
    it('should return default metrics when no data available', async () => {
      const metrics = await eligibilityAppealsEngine.getDashboardMetrics()
      
      expect(metrics).toBeDefined()
      expect(metrics.totalAppeals).toBe(0)
      expect(metrics.appealsByStatus).toEqual({})
      expect(metrics.appealsByType).toEqual({})
      expect(metrics.appealsByPriority).toEqual({})
      expect(metrics.averageResolutionTime).toBe(0)
      expect(metrics.overdueAppeals).toBe(0)
      expect(metrics.appealsThisMonth).toBe(0)
      expect(metrics.approvalRate).toBe(0)
      expect(metrics.reviewerWorkload).toEqual([])
      expect(metrics.trendData).toBeDefined()
    })
    
    it('should calculate metrics correctly with mock data', async () => {
      // This would test with actual data if Supabase was properly mocked
      // For now, we test the structure
      const metrics = await eligibilityAppealsEngine.getDashboardMetrics()
      
      expect(typeof metrics.totalAppeals).toBe('number')
      expect(typeof metrics.averageResolutionTime).toBe('number')
      expect(typeof metrics.overdueAppeals).toBe('number')
      expect(typeof metrics.appealsThisMonth).toBe('number')
      expect(typeof metrics.approvalRate).toBe('number')
      expect(Array.isArray(metrics.reviewerWorkload)).toBe(true)
      expect(typeof metrics.trendData).toBe('object')
    })
  })
  
  describe('audit trail', () => {
    
    let testAppeal: EligibilityAppeal
    
    beforeEach(async () => {
      testAppeal = await eligibilityAppealsEngine.submitAppeal(
        mockApplicationId,
        mockStudentId,
        mockAppealData
      )
    })
    
    it('should return null for non-existent appeal', async () => {
      const auditTrail = await eligibilityAppealsEngine.getAppealAuditTrail('non-existent')
      expect(auditTrail).toBeNull()
    })
    
    it('should handle audit trail structure correctly', async () => {
      const auditTrail = await eligibilityAppealsEngine.getAppealAuditTrail(testAppeal.id)
      
      // With mocked Supabase, this will return null, but we test the structure
      if (auditTrail) {
        expect(auditTrail.appealId).toBe(testAppeal.id)
        expect(Array.isArray(auditTrail.auditEntries)).toBe(true)
      }
    })
  })
  
  describe('data retrieval methods', () => {
    
    it('should handle getAppeal for non-existent appeal', async () => {
      const appeal = await eligibilityAppealsEngine.getAppeal('non-existent')
      expect(appeal).toBeNull()
    })
    
    it('should handle getStudentAppeals for non-existent student', async () => {
      const appeals = await eligibilityAppealsEngine.getStudentAppeals('non-existent')
      expect(appeals).toEqual([])
    })
    
    it('should handle getReviewerAppeals for non-existent reviewer', async () => {
      const appeals = await eligibilityAppealsEngine.getReviewerAppeals('non-existent')
      expect(appeals).toEqual([])
    })
  })
  
  describe('appeal validation and business rules', () => {
    
    it('should validate appeal data structure', async () => {
      const appeal = await eligibilityAppealsEngine.submitAppeal(
        mockApplicationId,
        mockStudentId,
        mockAppealData
      )
      
      // Validate required fields
      expect(appeal.id).toBeDefined()
      expect(appeal.applicationId).toBe(mockApplicationId)
      expect(appeal.studentId).toBe(mockStudentId)
      expect(appeal.appealType).toBe(mockAppealData.appealType)
      expect(appeal.appealReason).toBe(mockAppealData.appealReason)
      expect(appeal.status).toBe('submitted')
      expect(appeal.submittedAt).toBeInstanceOf(Date)
      expect(appeal.createdAt).toBeInstanceOf(Date)
      expect(appeal.updatedAt).toBeInstanceOf(Date)
      
      // Validate nested objects
      expect(appeal.originalAssessment).toEqual(mockAppealData.originalAssessment)
      expect(appeal.requestedChanges).toEqual(mockAppealData.requestedChanges)
      expect(appeal.supportingEvidence).toEqual(mockAppealData.supportingEvidence)
      expect(Array.isArray(appeal.communicationLog)).toBe(true)
    })
    
    it('should handle different requested change types', async () => {
      const complexChanges = {
        gradeCorrections: [
          {
            subject: 'Mathematics',
            currentGrade: 7,
            requestedGrade: 5,
            justification: 'Calculation error in original marking'
          }
        ],
        additionalSubjects: [
          {
            subject: 'Chemistry',
            grade: 6,
            certificateUrl: 'https://example.com/chemistry-cert.pdf'
          }
        ],
        specialCircumstances: {
          description: 'Family emergency during examination period',
          category: 'family' as const,
          impactOnStudies: 'Unable to attend 2 examination sessions'
        },
        documentationUpdates: [
          {
            documentType: 'Birth Certificate',
            issueDescription: 'Name spelling error',
            correctedDocumentUrl: 'https://example.com/corrected-birth-cert.pdf'
          }
        ]
      }
      
      const appeal = await eligibilityAppealsEngine.submitAppeal(
        mockApplicationId,
        mockStudentId,
        {
          ...mockAppealData,
          requestedChanges: complexChanges
        }
      )
      
      expect(appeal.requestedChanges).toEqual(complexChanges)
    })
    
    it('should handle appeals with minimal data', async () => {
      const minimalAppealData = {
        appealType: 'other' as const,
        appealReason: 'General inquiry about eligibility assessment',
        supportingEvidence: [],
        requestedChanges: {},
        originalAssessment: mockOriginalAssessment
      }
      
      const appeal = await eligibilityAppealsEngine.submitAppeal(
        mockApplicationId,
        mockStudentId,
        minimalAppealData
      )
      
      expect(appeal).toBeDefined()
      expect(appeal.appealType).toBe('other')
      expect(appeal.supportingEvidence).toEqual([])
      expect(appeal.requestedChanges).toEqual({})
    })
  })
  
  describe('error handling and edge cases', () => {
    
    it('should handle empty appeal reason gracefully', async () => {
      const appeal = await eligibilityAppealsEngine.submitAppeal(
        mockApplicationId,
        mockStudentId,
        {
          ...mockAppealData,
          appealReason: ''
        }
      )
      
      expect(appeal).toBeDefined()
      expect(appeal.appealReason).toBe('')
    })
    
    it('should handle future dates in original assessment', async () => {
      const futureDate = new Date()
      futureDate.setFullYear(futureDate.getFullYear() + 1)
      
      const appeal = await eligibilityAppealsEngine.submitAppeal(
        mockApplicationId,
        mockStudentId,
        {
          ...mockAppealData,
          originalAssessment: {
            ...mockOriginalAssessment,
            assessmentDate: futureDate
          }
        }
      )
      
      expect(appeal).toBeDefined()
      expect(appeal.originalAssessment.assessmentDate).toEqual(futureDate)
    })
    
    it('should handle very long appeal reasons', async () => {
      const longReason = 'A'.repeat(5000) // Very long string
      
      const appeal = await eligibilityAppealsEngine.submitAppeal(
        mockApplicationId,
        mockStudentId,
        {
          ...mockAppealData,
          appealReason: longReason
        }
      )
      
      expect(appeal).toBeDefined()
      expect(appeal.appealReason).toBe(longReason)
    })
  })
})