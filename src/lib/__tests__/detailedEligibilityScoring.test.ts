/**
 * Tests for Detailed Eligibility Scoring Engine
 * 
 * Tests the comprehensive eligibility scoring system including:
 * - Score breakdown calculations
 * - Improvement recommendations
 * - Alternative pathway identification
 * - Feedback generation
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { detailedEligibilityScoringEngine } from '../detailedEligibilityScoring'
import type { SubjectGrade } from '../eligibility'

describe('DetailedEligibilityScoringEngine', () => {
  
  const mockApplicationId = 'test-app-123'
  const mockProgramId = 'prog-456'
  
  const excellentGrades: SubjectGrade[] = [
    { subject_name: 'English', grade: 2 },
    { subject_name: 'Mathematics', grade: 2 },
    { subject_name: 'Biology', grade: 1 },
    { subject_name: 'Chemistry', grade: 2 },
    { subject_name: 'Physics', grade: 3 },
    { subject_name: 'Geography', grade: 3 }
  ]
  
  const averageGrades: SubjectGrade[] = [
    { subject_name: 'English', grade: 5 },
    { subject_name: 'Mathematics', grade: 6 },
    { subject_name: 'Biology', grade: 5 },
    { subject_name: 'Chemistry', grade: 6 },
    { subject_name: 'Physics', grade: 7 }
  ]
  
  const poorGrades: SubjectGrade[] = [
    { subject_name: 'English', grade: 7 },
    { subject_name: 'Mathematics', grade: 8 },
    { subject_name: 'Biology', grade: 8 },
    { subject_name: 'Chemistry', grade: 9 }
  ]

  describe('calculateDetailedAssessment', () => {
    
    it('should calculate excellent assessment for high-performing student', async () => {
      const assessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Clinical Medicine',
        excellentGrades
      )
      
      expect(assessment).toBeDefined()
      expect(assessment.applicationId).toBe(mockApplicationId)
      expect(assessment.programId).toBe(mockProgramId)
      expect(assessment.programName).toBe('Clinical Medicine')
      
      // Should have excellent status for high grades
      expect(assessment.eligibilityStatus).toBe('excellent')
      expect(assessment.competitivenessLevel).toBe('highly_competitive')
      
      // Score should be high
      expect(assessment.scoreBreakdown.percentageScore).toBeGreaterThan(80)
      
      // Should have strengths identified
      expect(assessment.scoreBreakdown.strengthAreas.length).toBeGreaterThan(0)
      
      // Should have minimal critical gaps
      expect(assessment.scoreBreakdown.criticalGaps.length).toBe(0)
      
      // Should allow proceeding
      expect(assessment.canProceed).toBe(true)
    })
    
    it('should calculate conditional assessment for average student', async () => {
      const assessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Registered Nursing',
        averageGrades
      )
      
      expect(assessment.eligibilityStatus).toBeOneOf(['good', 'conditional'])
      expect(assessment.competitivenessLevel).toBeOneOf(['competitive', 'minimum_requirements'])
      
      // Score should be moderate
      expect(assessment.scoreBreakdown.percentageScore).toBeGreaterThan(50)
      expect(assessment.scoreBreakdown.percentageScore).toBeLessThan(90)
      
      // Should have some improvement recommendations
      expect(assessment.improvementRecommendations.length).toBeGreaterThan(0)
      
      // Should still allow proceeding
      expect(assessment.canProceed).toBe(true)
    })
    
    it('should calculate needs improvement assessment for poor grades', async () => {
      const assessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Environmental Health',
        poorGrades
      )
      
      expect(assessment.eligibilityStatus).toBeOneOf(['needs_improvement', 'not_eligible'])
      expect(assessment.competitivenessLevel).toBe('below_minimum')
      
      // Score should be low
      expect(assessment.scoreBreakdown.percentageScore).toBeLessThan(60)
      
      // Should have critical gaps
      expect(assessment.scoreBreakdown.criticalGaps.length).toBeGreaterThan(0)
      
      // Should have many improvement recommendations
      expect(assessment.improvementRecommendations.length).toBeGreaterThan(2)
      
      // Should have alternative pathways
      expect(assessment.alternativePathways.length).toBeGreaterThan(0)
      
      // Should still allow proceeding (non-blocking design)
      expect(assessment.canProceed).toBe(true)
    })
  })
  
  describe('score breakdown components', () => {
    
    it('should calculate subject count score correctly', async () => {
      const assessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Clinical Medicine',
        excellentGrades
      )
      
      const subjectCountScore = assessment.scoreBreakdown.subjectCountScore
      
      expect(subjectCountScore.score).toBeGreaterThan(0)
      expect(subjectCountScore.maxScore).toBe(100)
      expect(subjectCountScore.weight).toBe(0.25)
      expect(subjectCountScore.explanation).toContain('Subject count measures')
      expect(subjectCountScore.feedback).toBeDefined()
    })
    
    it('should calculate grade average score correctly', async () => {
      const assessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Clinical Medicine',
        averageGrades
      )
      
      const gradeAverageScore = assessment.scoreBreakdown.gradeAverageScore
      
      expect(gradeAverageScore.score).toBeGreaterThan(0)
      expect(gradeAverageScore.maxScore).toBe(100)
      expect(gradeAverageScore.weight).toBe(0.30)
      expect(gradeAverageScore.explanation).toContain('Grade average reflects')
      expect(gradeAverageScore.feedback).toBeDefined()
    })
    
    it('should calculate core subjects score correctly', async () => {
      const assessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Clinical Medicine',
        excellentGrades
      )
      
      const coreSubjectsScore = assessment.scoreBreakdown.coreSubjectsScore
      
      expect(coreSubjectsScore.score).toBeGreaterThan(0)
      expect(coreSubjectsScore.maxScore).toBe(100)
      expect(coreSubjectsScore.weight).toBe(0.35)
      expect(coreSubjectsScore.explanation).toContain('Core subjects score evaluates')
      expect(coreSubjectsScore.feedback).toBeDefined()
    })
    
    it('should calculate regulatory compliance score', async () => {
      const assessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Clinical Medicine',
        excellentGrades
      )
      
      const regulatoryScore = assessment.scoreBreakdown.regulatoryComplianceScore
      
      expect(regulatoryScore.score).toBeGreaterThanOrEqual(0)
      expect(regulatoryScore.maxScore).toBe(100)
      expect(regulatoryScore.weight).toBe(0.10)
      expect(regulatoryScore.explanation).toContain('Regulatory compliance')
      expect(regulatoryScore.feedback).toBeDefined()
    })
  })
  
  describe('improvement recommendations', () => {
    
    it('should generate grade improvement recommendations for low grades', async () => {
      const assessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Clinical Medicine',
        poorGrades
      )
      
      const gradeImprovementRecs = assessment.improvementRecommendations.filter(
        rec => rec.category === 'grade_improvement'
      )
      
      expect(gradeImprovementRecs.length).toBeGreaterThan(0)
      
      const rec = gradeImprovementRecs[0]
      expect(rec.priority).toBe('high')
      expect(rec.title).toContain('Improve Grades')
      expect(rec.actionSteps.length).toBeGreaterThan(0)
      expect(rec.expectedImpact.scoreIncrease).toBeGreaterThan(0)
      expect(rec.timeframe).toBeDefined()
    })
    
    it('should generate subject addition recommendations for missing subjects', async () => {
      const incompleteGrades: SubjectGrade[] = [
        { subject_name: 'English', grade: 5 },
        { subject_name: 'Mathematics', grade: 6 }
        // Missing core subjects for Clinical Medicine
      ]
      
      const assessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Clinical Medicine',
        incompleteGrades
      )
      
      const subjectAdditionRecs = assessment.improvementRecommendations.filter(
        rec => rec.category === 'subject_addition'
      )
      
      expect(subjectAdditionRecs.length).toBeGreaterThan(0)
      
      const rec = subjectAdditionRecs[0]
      expect(rec.priority).toBe('high')
      expect(rec.title).toContain('Missing Core Subjects')
      expect(rec.actionSteps.length).toBeGreaterThan(0)
    })
    
    it('should generate alternative pathway recommendations for low scores', async () => {
      const assessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Clinical Medicine',
        poorGrades
      )
      
      const pathwayRecs = assessment.improvementRecommendations.filter(
        rec => rec.category === 'alternative_pathway'
      )
      
      expect(pathwayRecs.length).toBeGreaterThan(0)
      
      const rec = pathwayRecs[0]
      expect(rec.title).toContain('Alternative Entry Routes')
      expect(rec.actionSteps.length).toBeGreaterThan(0)
    })
  })
  
  describe('alternative pathways', () => {
    
    it('should identify alternative pathways for low-scoring students', async () => {
      const assessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Clinical Medicine',
        poorGrades
      )
      
      expect(assessment.alternativePathways.length).toBeGreaterThan(0)
      
      const pathway = assessment.alternativePathways[0]
      expect(pathway.name).toBeDefined()
      expect(pathway.description).toBeDefined()
      expect(pathway.requirements).toBeDefined()
      expect(pathway.timeToCompletion).toBeDefined()
    })
    
    it('should not suggest pathways for excellent students', async () => {
      const assessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Clinical Medicine',
        excellentGrades
      )
      
      // Excellent students may have fewer or no alternative pathways suggested
      expect(assessment.alternativePathways.length).toBeLessThanOrEqual(2)
    })
  })
  
  describe('feedback generation', () => {
    
    it('should generate appropriate feedback for different performance levels', async () => {
      const excellentAssessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Clinical Medicine',
        excellentGrades
      )
      
      expect(excellentAssessment.overallFeedback).toContain('Excellent')
      expect(excellentAssessment.overallFeedback).toContain('competitive')
      
      const poorAssessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Clinical Medicine',
        poorGrades
      )
      
      expect(poorAssessment.overallFeedback).toContain('improvement')
      expect(poorAssessment.overallFeedback).toContain('can still apply')
    })
    
    it('should always remind students they can proceed', async () => {
      const assessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Clinical Medicine',
        poorGrades
      )
      
      expect(assessment.overallFeedback).toContain('can')
      expect(assessment.canProceed).toBe(true)
    })
  })
  
  describe('comparison metrics', () => {
    
    it('should calculate comparison percentiles', async () => {
      const assessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Clinical Medicine',
        excellentGrades
      )
      
      expect(assessment.comparisonToTypicalAdmitted.percentile).toBeGreaterThanOrEqual(1)
      expect(assessment.comparisonToTypicalAdmitted.percentile).toBeLessThanOrEqual(99)
      expect(assessment.comparisonToTypicalAdmitted.explanation).toBeDefined()
    })
  })
  
  describe('program-specific requirements', () => {
    
    it('should handle different program requirements correctly', async () => {
      const nursingAssessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Registered Nursing',
        excellentGrades
      )
      
      const clinicalAssessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Clinical Medicine',
        excellentGrades
      )
      
      const environmentalAssessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Environmental Health',
        excellentGrades
      )
      
      // All should be valid assessments
      expect(nursingAssessment.programName).toBe('Registered Nursing')
      expect(clinicalAssessment.programName).toBe('Clinical Medicine')
      expect(environmentalAssessment.programName).toBe('Environmental Health')
      
      // Core subjects feedback should be different for different programs
      expect(nursingAssessment.scoreBreakdown.coreSubjectsScore.feedback)
        .not.toBe(clinicalAssessment.scoreBreakdown.coreSubjectsScore.feedback)
    })
  })
  
  describe('edge cases', () => {
    
    it('should handle empty grades array', async () => {
      const assessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Clinical Medicine',
        []
      )
      
      expect(assessment).toBeDefined()
      expect(assessment.canProceed).toBe(true)
      expect(assessment.improvementRecommendations.length).toBeGreaterThan(0)
    })
    
    it('should handle unknown program names', async () => {
      const assessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Unknown Program',
        excellentGrades
      )
      
      expect(assessment).toBeDefined()
      expect(assessment.programName).toBe('Unknown Program')
      expect(assessment.canProceed).toBe(true)
    })
    
    it('should handle invalid grade values gracefully', async () => {
      const invalidGrades: SubjectGrade[] = [
        { subject_name: 'English', grade: 0 }, // Invalid grade
        { subject_name: 'Mathematics', grade: 10 }, // Invalid grade
        { subject_name: 'Biology', grade: 5 } // Valid grade
      ]
      
      const assessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Clinical Medicine',
        invalidGrades
      )
      
      expect(assessment).toBeDefined()
      expect(assessment.canProceed).toBe(true)
    })
  })
  
  describe('assessment metadata', () => {
    
    it('should include proper assessment metadata', async () => {
      const assessment = await detailedEligibilityScoringEngine.calculateDetailedAssessment(
        mockApplicationId,
        mockProgramId,
        'Clinical Medicine',
        excellentGrades
      )
      
      expect(assessment.assessmentDate).toBeInstanceOf(Date)
      expect(assessment.assessmentDate.getTime()).toBeLessThanOrEqual(Date.now())
      expect(assessment.canProceed).toBe(true)
      
      // Next review date should be set for certain statuses
      if (assessment.eligibilityStatus === 'needs_improvement' || assessment.eligibilityStatus === 'not_eligible') {
        expect(assessment.nextReviewDate).toBeInstanceOf(Date)
      }
    })
  })
})