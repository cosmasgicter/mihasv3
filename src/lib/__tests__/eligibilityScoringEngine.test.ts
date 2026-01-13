import { describe, it, expect, beforeEach } from 'vitest'
import {
  EligibilityScoringEngine,
  eligibilityScoringEngine,
  calculateDetailedEligibilityScore,
  generateScoringSummary,
  compareEligibilityScores,
  DEFAULT_SCORING_WEIGHTS,
  PROGRAM_SCORING_WEIGHTS,
  type DetailedEligibilityScore,
  type ScoringComponent
} from '../eligibilityScoringEngine'
import type { SubjectGrade } from '../eligibilityEngine'

describe('EligibilityScoringEngine', () => {
  // Test data for different scenarios
  const excellentGrades: SubjectGrade[] = [
    { subject_id: '1', subject_name: 'English Language', grade: 2 },
    { subject_id: '2', subject_name: 'Mathematics', grade: 1 },
    { subject_id: '3', subject_name: 'Biology', grade: 1 },
    { subject_id: '4', subject_name: 'Chemistry', grade: 2 },
    { subject_id: '5', subject_name: 'Physics', grade: 3 },
    { subject_id: '6', subject_name: 'Geography', grade: 4 },
    { subject_id: '7', subject_name: 'History', grade: 3 }
  ]

  const goodGrades: SubjectGrade[] = [
    { subject_id: '1', subject_name: 'English Language', grade: 4 },
    { subject_id: '2', subject_name: 'Mathematics', grade: 5 },
    { subject_id: '3', subject_name: 'Biology', grade: 3 },
    { subject_id: '4', subject_name: 'Chemistry', grade: 4 },
    { subject_id: '5', subject_name: 'Physics', grade: 6 },
    { subject_id: '6', subject_name: 'Geography', grade: 5 }
  ]

  const poorGrades: SubjectGrade[] = [
    { subject_id: '1', subject_name: 'English Language', grade: 7 },
    { subject_id: '2', subject_name: 'Mathematics', grade: 8 },
    { subject_id: '3', subject_name: 'Biology', grade: 6 },
    { subject_id: '4', subject_name: 'Chemistry', grade: 9 }
  ]

  const additionalData = {
    application_date: '2024-01-15',
    application_deadline: '2024-03-31',
    extracurricular_activities: ['Student Council', 'Debate Club'],
    work_experience: true,
    volunteer_experience: true
  }

  describe('calculateDetailedScore', () => {
    it('should calculate comprehensive eligibility score with all components', () => {
      const score = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-001',
        'DCM',
        excellentGrades,
        additionalData
      )

      // Verify basic structure
      expect(score.application_id).toBe('test-app-001')
      expect(score.program_code).toBe('DCM')
      expect(score.program_name).toBe('Diploma in Clinical Medicine')
      expect(score.overall_score).toBeGreaterThan(0)
      expect(score.overall_percentage).toBeGreaterThan(0)
      expect(score.eligibility_status).toBeOneOf(['highly_eligible', 'eligible', 'conditionally_eligible', 'not_eligible'])
      expect(score.competitiveness_level).toBeOneOf(['Highly Competitive', 'Competitive', 'Minimum', 'Not Competitive'])

      // Verify all components are present
      expect(score.components).toHaveProperty('academic_performance')
      expect(score.components).toHaveProperty('subject_requirements')
      expect(score.components).toHaveProperty('grade_quality')
      expect(score.components).toHaveProperty('regulatory_compliance')
      expect(score.components).toHaveProperty('competitiveness_factors')

      // Verify component structure
      Object.values(score.components).forEach(component => {
        expect(component).toHaveProperty('name')
        expect(component).toHaveProperty('description')
        expect(component).toHaveProperty('weight')
        expect(component).toHaveProperty('max_score')
        expect(component).toHaveProperty('actual_score')
        expect(component).toHaveProperty('percentage')
        expect(component).toHaveProperty('status')
        expect(component).toHaveProperty('feedback')
        expect(component).toHaveProperty('improvement_suggestions')
        expect(component.percentage).toBeGreaterThanOrEqual(0)
        expect(component.percentage).toBeLessThanOrEqual(100)
      })

      // Verify grade statistics
      expect(score.grade_statistics).toHaveProperty('total_subjects')
      expect(score.grade_statistics).toHaveProperty('credit_subjects')
      expect(score.grade_statistics).toHaveProperty('average_grade')
      expect(score.grade_statistics).toHaveProperty('best_grade')
      expect(score.grade_statistics).toHaveProperty('worst_grade')
      expect(score.grade_statistics).toHaveProperty('gpa')

      // Verify arrays
      expect(Array.isArray(score.strengths)).toBe(true)
      expect(Array.isArray(score.weaknesses)).toBe(true)
      expect(Array.isArray(score.critical_issues)).toBe(true)
      expect(Array.isArray(score.improvement_recommendations)).toBe(true)
    })

    it('should handle excellent grades appropriately', () => {
      const score = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-002',
        'DCM',
        excellentGrades,
        additionalData
      )

      expect(score.eligibility_status).toBeOneOf(['highly_eligible', 'eligible'])
      expect(score.competitiveness_level).toBeOneOf(['Highly Competitive', 'Competitive'])
      expect(score.overall_percentage).toBeGreaterThan(70)
      expect(score.components.academic_performance.status).toBeOneOf(['excellent', 'good'])
      expect(score.components.grade_quality.status).toBeOneOf(['excellent', 'good'])
    })

    it('should handle poor grades appropriately', () => {
      const score = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-003',
        'DCM',
        poorGrades
      )

      expect(score.eligibility_status).toBeOneOf(['conditionally_eligible', 'not_eligible'])
      expect(score.overall_percentage).toBeLessThan(70)
      expect(score.improvement_recommendations.length).toBeGreaterThan(0)
      expect(score.critical_issues.length + score.weaknesses.length).toBeGreaterThan(0)
    })

    it('should use program-specific weights for DCM', () => {
      const score = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-004',
        'DCM',
        goodGrades
      )

      const dcmWeights = PROGRAM_SCORING_WEIGHTS['DCM']
      expect(score.components.academic_performance.weight).toBe(dcmWeights.academic_performance)
      expect(score.components.subject_requirements.weight).toBe(dcmWeights.subject_requirements)
      expect(score.components.grade_quality.weight).toBe(dcmWeights.grade_quality)
      expect(score.components.regulatory_compliance.weight).toBe(dcmWeights.regulatory_compliance)
      expect(score.components.competitiveness_factors.weight).toBe(dcmWeights.competitiveness_factors)
    })

    it('should use default weights for unknown programs', () => {
      const score = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-005',
        'UNKNOWN',
        goodGrades
      )

      expect(score.components.academic_performance.weight).toBe(DEFAULT_SCORING_WEIGHTS.academic_performance)
      expect(score.components.subject_requirements.weight).toBe(DEFAULT_SCORING_WEIGHTS.subject_requirements)
      expect(score.components.grade_quality.weight).toBe(DEFAULT_SCORING_WEIGHTS.grade_quality)
      expect(score.components.regulatory_compliance.weight).toBe(DEFAULT_SCORING_WEIGHTS.regulatory_compliance)
      expect(score.components.competitiveness_factors.weight).toBe(DEFAULT_SCORING_WEIGHTS.competitiveness_factors)
    })

    it('should handle empty grades gracefully', () => {
      const score = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-006',
        'DCM',
        []
      )

      expect(score.overall_score).toBe(0)
      expect(score.overall_percentage).toBe(0)
      expect(score.eligibility_status).toBe('not_eligible')
      expect(score.grade_statistics.total_subjects).toBe(0)
      expect(score.improvement_recommendations.length).toBeGreaterThan(0)
    })
  })

  describe('Academic Performance Component', () => {
    it('should score excellent academic performance highly', () => {
      const score = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-007',
        'DCM',
        excellentGrades
      )

      const academicComponent = score.components.academic_performance
      expect(academicComponent.status).toBeOneOf(['excellent', 'good'])
      expect(academicComponent.percentage).toBeGreaterThan(70)
      expect(academicComponent.feedback).toContain('performance')
    })

    it('should penalize poor academic performance', () => {
      const score = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-008',
        'DCM',
        poorGrades
      )

      const academicComponent = score.components.academic_performance
      expect(academicComponent.status).toBeOneOf(['needs_improvement', 'satisfactory'])
      expect(academicComponent.improvement_suggestions.length).toBeGreaterThan(0)
    })
  })

  describe('Subject Requirements Component', () => {
    it('should identify missing required subjects', () => {
      const incompleteGrades: SubjectGrade[] = [
        { subject_id: '1', subject_name: 'English Language', grade: 4 },
        { subject_id: '2', subject_name: 'Mathematics', grade: 5 }
        // Missing Biology and Chemistry for DCM
      ]

      const score = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-009',
        'DCM',
        incompleteGrades
      )

      const subjectComponent = score.components.subject_requirements
      expect(subjectComponent.status).toBeOneOf(['critical', 'needs_improvement'])
      expect(subjectComponent.percentage).toBeLessThan(100)
      expect(subjectComponent.improvement_suggestions.length).toBeGreaterThan(0)
    })

    it('should reward meeting all subject requirements', () => {
      const score = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-010',
        'DCM',
        excellentGrades
      )

      const subjectComponent = score.components.subject_requirements
      expect(subjectComponent.status).toBeOneOf(['excellent', 'good'])
      expect(subjectComponent.percentage).toBeGreaterThan(80)
    })
  })

  describe('Grade Quality Component', () => {
    it('should reward high-quality grades', () => {
      const score = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-011',
        'DCM',
        excellentGrades
      )

      const qualityComponent = score.components.grade_quality
      expect(qualityComponent.status).toBeOneOf(['excellent', 'good'])
      expect(qualityComponent.percentage).toBeGreaterThan(70)
      expect(qualityComponent.feedback).toContain('grade quality')
    })

    it('should identify poor grade quality', () => {
      const score = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-012',
        'DCM',
        poorGrades
      )

      const qualityComponent = score.components.grade_quality
      expect(qualityComponent.status).toBeOneOf(['needs_improvement', 'satisfactory'])
      expect(qualityComponent.improvement_suggestions.length).toBeGreaterThan(0)
    })
  })

  describe('Competitiveness Factors Component', () => {
    it('should reward additional competitive factors', () => {
      const score = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-013',
        'DCM',
        excellentGrades,
        additionalData
      )

      const competitivenessComponent = score.components.competitiveness_factors
      expect(competitivenessComponent.percentage).toBeGreaterThan(50)
      expect(competitivenessComponent.feedback).toContain('competitive')
    })

    it('should handle lack of competitive factors', () => {
      const score = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-014',
        'DCM',
        goodGrades,
        {} // No additional data
      )

      const competitivenessComponent = score.components.competitiveness_factors
      expect(competitivenessComponent.percentage).toBeLessThan(80)
      expect(competitivenessComponent.improvement_suggestions.length).toBeGreaterThan(0)
    })
  })

  describe('generateSummaryReport', () => {
    it('should generate a readable summary report', () => {
      const score = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-015',
        'DCM',
        excellentGrades,
        additionalData
      )

      const summary = eligibilityScoringEngine.generateSummaryReport(score)
      
      expect(summary).toContain('ELIGIBILITY ASSESSMENT SUMMARY')
      expect(summary).toContain('Program: Diploma in Clinical Medicine')
      expect(summary).toContain('Overall Score:')
      expect(summary).toContain('Status:')
      expect(summary).toContain('Competitiveness:')
      expect(summary).toContain('COMPONENT BREAKDOWN:')
      
      if (score.strengths.length > 0) {
        expect(summary).toContain('STRENGTHS:')
      }
      
      if (score.improvement_recommendations.length > 0) {
        expect(summary).toContain('IMPROVEMENT RECOMMENDATIONS:')
      }
    })
  })

  describe('compareScores', () => {
    it('should compare two eligibility scores correctly', () => {
      const score1 = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-016',
        'DCM',
        poorGrades
      )

      const score2 = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-017',
        'DCM',
        excellentGrades,
        additionalData
      )

      const comparison = eligibilityScoringEngine.compareScores(score1, score2)

      expect(comparison.overall_improvement).toBeGreaterThan(0)
      expect(comparison.summary).toContain('Improved by')
      expect(comparison.status_change).toContain('→')
      expect(Object.keys(comparison.component_improvements)).toHaveLength(5)
    })

    it('should handle identical scores', () => {
      const score1 = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-018',
        'DCM',
        goodGrades
      )

      const score2 = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-019',
        'DCM',
        goodGrades
      )

      const comparison = eligibilityScoringEngine.compareScores(score1, score2)

      expect(comparison.overall_improvement).toBe(0)
      expect(comparison.summary).toContain('No overall change')
    })
  })

  describe('Convenience Functions', () => {
    it('should export working convenience functions', () => {
      const score = calculateDetailedEligibilityScore(
        'test-app-020',
        'DCM',
        excellentGrades,
        additionalData
      )

      expect(score).toBeDefined()
      expect(score.application_id).toBe('test-app-020')

      const summary = generateScoringSummary(score)
      expect(summary).toContain('ELIGIBILITY ASSESSMENT SUMMARY')

      const score2 = calculateDetailedEligibilityScore(
        'test-app-021',
        'DCM',
        poorGrades
      )

      const comparison = compareEligibilityScores(score2, score)
      expect(comparison).toBeDefined()
      expect(comparison.overall_improvement).toBeGreaterThan(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle invalid program codes gracefully', () => {
      const score = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-022',
        'INVALID_PROGRAM',
        goodGrades
      )

      expect(score.program_name).toContain('INVALID_PROGRAM')
      expect(score.overall_score).toBeGreaterThanOrEqual(0)
    })

    it('should handle grades with missing subject names', () => {
      const invalidGrades: SubjectGrade[] = [
        { subject_id: '1', subject_name: '', grade: 4 },
        { subject_id: '2', subject_name: 'Mathematics', grade: 5 }
      ]

      const score = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-023',
        'DCM',
        invalidGrades
      )

      expect(score).toBeDefined()
      expect(score.overall_score).toBeGreaterThanOrEqual(0)
    })

    it('should handle extreme grade values', () => {
      const extremeGrades: SubjectGrade[] = [
        { subject_id: '1', subject_name: 'English Language', grade: 1 },
        { subject_id: '2', subject_name: 'Mathematics', grade: 9 },
        { subject_id: '3', subject_name: 'Biology', grade: 1 },
        { subject_id: '4', subject_name: 'Chemistry', grade: 9 }
      ]

      const score = eligibilityScoringEngine.calculateDetailedScore(
        'test-app-024',
        'DCM',
        extremeGrades
      )

      expect(score).toBeDefined()
      expect(score.grade_statistics.best_grade).toBe(1)
      expect(score.grade_statistics.worst_grade).toBe(9)
    })
  })

  describe('Property-Based Testing Requirements', () => {
    // These tests validate the correctness properties from the design document
    
    it('Property 29: Detailed Eligibility Scoring - should provide detailed scoring breakdown and explanatory feedback for any eligibility calculation', () => {
      // Test with various grade combinations
      const testCases = [excellentGrades, goodGrades, poorGrades]
      
      testCases.forEach((grades, index) => {
        const score = eligibilityScoringEngine.calculateDetailedScore(
          `property-test-${index}`,
          'DCM',
          grades,
          additionalData
        )

        // Verify detailed scoring breakdown is provided
        expect(score.components).toBeDefined()
        expect(Object.keys(score.components)).toHaveLength(5)
        
        // Verify each component has explanatory feedback
        Object.values(score.components).forEach(component => {
          expect(component.feedback).toBeDefined()
          expect(component.feedback.length).toBeGreaterThan(0)
          expect(component.description).toBeDefined()
          expect(component.description.length).toBeGreaterThan(0)
        })

        // Verify overall scoring breakdown
        expect(score.overall_score).toBeGreaterThanOrEqual(0)
        expect(score.overall_percentage).toBeGreaterThanOrEqual(0)
        expect(score.overall_percentage).toBeLessThanOrEqual(100)
        expect(score.total_weighted_score).toBeGreaterThanOrEqual(0)
        expect(score.max_possible_score).toBeGreaterThan(0)
      })
    })

    it('Property 29: Improvement Recommendations - should generate improvement recommendations for students for any eligibility calculation', () => {
      // Test with poor grades to ensure recommendations are generated
      const score = eligibilityScoringEngine.calculateDetailedScore(
        'improvement-test',
        'DCM',
        poorGrades
      )

      // Verify improvement recommendations are provided
      expect(score.improvement_recommendations).toBeDefined()
      expect(Array.isArray(score.improvement_recommendations)).toBe(true)
      expect(score.improvement_recommendations.length).toBeGreaterThan(0)

      // Verify each component provides improvement suggestions when needed
      Object.values(score.components).forEach(component => {
        expect(component.improvement_suggestions).toBeDefined()
        expect(Array.isArray(component.improvement_suggestions)).toBe(true)
        
        if (component.status === 'needs_improvement' || component.status === 'critical') {
          expect(component.improvement_suggestions.length).toBeGreaterThan(0)
        }
      })

      // Verify recommendations are actionable (contain specific guidance)
      score.improvement_recommendations.forEach(recommendation => {
        expect(recommendation).toBeDefined()
        expect(recommendation.length).toBeGreaterThan(10) // Reasonable length for actionable advice
      })
    })
  })
})