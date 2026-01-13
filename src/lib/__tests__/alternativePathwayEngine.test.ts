/**
 * Alternative Pathway Engine Tests
 * 
 * Tests for the alternative pathway identification engine including:
 * - Pathway identification and suitability scoring
 * - Personalized improvement plan generation
 * - Pathway recommendation logic
 * - Integration with eligibility requirements
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { alternativePathwayEngine } from '@/lib/alternativePathwayEngine'
import type { SubjectGrade } from '@/lib/eligibility'

describe('AlternativePathwayEngine', () => {
  
  const mockApplicationId = 'test-app-123'
  const mockStudentId = 'test-student-456'
  
  // Mock grade data for different scenarios
  const excellentGrades: SubjectGrade[] = [
    { subject_name: 'English', grade: 2 },
    { subject_name: 'Mathematics', grade: 2 },
    { subject_name: 'Biology', grade: 1 },
    { subject_name: 'Chemistry', grade: 2 },
    { subject_name: 'Physics', grade: 3 }
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
    { subject_name: 'Chemistry', grade: 9 },
    { subject_name: 'Physics', grade: 9 }
  ]
  
  const incompleteGrades: SubjectGrade[] = [
    { subject_name: 'English', grade: 6 },
    { subject_name: 'Mathematics', grade: 7 }
    // Missing core subjects for most programs
  ]
  
  describe('pathway identification', () => {
    
    it('should identify suitable pathways for excellent students', async () => {
      const pathways = await alternativePathwayEngine.identifyPathways(
        'Registered Nursing',
        excellentGrades,
        20, // Young student
        0   // No work experience
      )
      
      expect(pathways.length).toBeGreaterThan(0)
      
      // Excellent students should have high suitability scores
      const topPathway = pathways[0]
      expect(topPathway.suitabilityScore).toBeGreaterThan(70)
      expect(topPathway.reasonsForRecommendation).toBeDefined()
      expect(topPathway.reasonsForRecommendation!.length).toBeGreaterThan(0)
    })
    
    it('should identify more pathways for struggling students', async () => {
      const pathways = await alternativePathwayEngine.identifyPathways(
        'Clinical Medicine',
        poorGrades,
        19,
        0
      )
      
      expect(pathways.length).toBeGreaterThan(0)
      
      // Should include foundation and bridging programs
      const pathwayTypes = pathways.map(p => p.type)
      expect(pathwayTypes).toContain('foundation')
      expect(pathwayTypes.some(type => ['bridging', 'certificate'].includes(type))).toBe(true)
    })
    
    it('should consider age for mature entry pathways', async () => {
      const pathways = await alternativePathwayEngine.identifyPathways(
        'Environmental Health',
        averageGrades,
        28, // Mature student
        5   // Work experience
      )
      
      expect(pathways.length).toBeGreaterThan(0)
      
      // Should include mature entry option
      const matureEntryPathway = pathways.find(p => p.type === 'mature_entry')
      expect(matureEntryPathway).toBeDefined()
      expect(matureEntryPathway!.suitabilityScore).toBeGreaterThan(50)
    })
    
    it('should consider work experience for work-based pathways', async () => {
      const pathways = await alternativePathwayEngine.identifyPathways(
        'Registered Nursing',
        averageGrades,
        30,
        6 // Significant work experience
      )
      
      expect(pathways.length).toBeGreaterThan(0)
      
      // Should include work experience recognition
      const workPathway = pathways.find(p => p.type === 'work_experience')
      expect(workPathway).toBeDefined()
      expect(workPathway!.suitabilityScore).toBeGreaterThan(60)
    })
    
    it('should handle missing core subjects appropriately', async () => {
      const pathways = await alternativePathwayEngine.identifyPathways(
        'Clinical Medicine',
        incompleteGrades,
        20,
        0
      )
      
      expect(pathways.length).toBeGreaterThan(0)
      
      // Should recommend foundation or bridging programs
      const foundationPathway = pathways.find(p => p.type === 'foundation')
      expect(foundationPathway).toBeDefined()
      expect(foundationPathway!.potentialChallenges).toContain('Need to improve 2 subject(s)')
    })
    
    it('should return pathways sorted by suitability score', async () => {
      const pathways = await alternativePathwayEngine.identifyPathways(
        'Registered Nursing',
        averageGrades,
        22,
        1
      )
      
      expect(pathways.length).toBeGreaterThan(1)
      
      // Should be sorted by suitability score (highest first)
      for (let i = 1; i < pathways.length; i++) {
        expect(pathways[i-1].suitabilityScore).toBeGreaterThanOrEqual(pathways[i].suitabilityScore!)
      }
    })
  })
  
  describe('improvement plan generation', () => {
    
    it('should generate comprehensive plan for struggling students', async () => {
      const plan = await alternativePathwayEngine.generateImprovementPlan(
        mockStudentId,
        'Clinical Medicine',
        poorGrades,
        35, // Low overall score
        'needs_improvement',
        20,
        0,
        false // No financial constraints
      )
      
      expect(plan).toBeDefined()
      expect(plan!.studentId).toBe(mockStudentId)
      expect(plan!.targetProgram).toBe('Clinical Medicine')
      
      // Should have current status
      expect(plan!.currentStatus.overallScore).toBe(35)
      expect(plan!.currentStatus.eligibilityStatus).toBe('needs_improvement')
      expect(plan!.currentStatus.majorGaps.length).toBeGreaterThan(0)
      
      // Should have pathway recommendations
      expect(plan!.recommendedPathways.length).toBeGreaterThan(0)
      expect(plan!.recommendedPathways[0].pathway.type).toMatch(/foundation|bridging|certificate/)
      
      // Should have short-term actions
      expect(plan!.shortTermActions.length).toBeGreaterThan(0)
      const gradeImprovementAction = plan!.shortTermActions.find(a => 
        a.action.includes('Retake') || a.action.includes('subjects')
      )
      expect(gradeImprovementAction).toBeDefined()
      expect(gradeImprovementAction!.priority).toBe('high')
      
      // Should have long-term strategy
      expect(plan!.longTermStrategy.preferredPathway).toBeDefined()
      expect(plan!.longTermStrategy.milestones.length).toBeGreaterThan(0)
      expect(plan!.longTermStrategy.totalTimeframe).toMatch(/\d+\s+(year|years)/)
      
      // Should have support resources
      expect(plan!.supportResources.counselingServices.length).toBeGreaterThan(0)
      expect(plan!.supportResources.studySupport.length).toBeGreaterThan(0)
      
      // Should have review schedule
      expect(plan!.reviewSchedule.nextReviewDate).toBeInstanceOf(Date)
      expect(plan!.reviewSchedule.reviewFrequency).toBeDefined()
    })
    
    it('should generate simpler plan for good students', async () => {
      const plan = await alternativePathwayEngine.generateImprovementPlan(
        mockStudentId,
        'Registered Nursing',
        averageGrades,
        72, // Good overall score
        'good',
        21,
        0,
        false
      )
      
      expect(plan).toBeDefined()
      expect(plan!.currentStatus.overallScore).toBe(72)
      expect(plan!.currentStatus.eligibilityStatus).toBe('good')
      
      // Should have fewer major gaps
      expect(plan!.currentStatus.majorGaps.length).toBeLessThan(3)
      
      // Should have fewer short-term actions
      expect(plan!.shortTermActions.length).toBeLessThan(4)
      
      // Should have shorter timeframe
      expect(plan!.longTermStrategy.totalTimeframe).toMatch(/1-2|2-3/)
    })
    
    it('should consider financial constraints in recommendations', async () => {
      const plan = await alternativePathwayEngine.generateImprovementPlan(
        mockStudentId,
        'Environmental Health',
        averageGrades,
        55,
        'conditional',
        23,
        2,
        true // Financial constraints
      )
      
      expect(plan).toBeDefined()
      
      // Should include financial aid resources
      expect(plan!.supportResources.financialAid).toContain('Emergency financial assistance')
      expect(plan!.supportResources.financialAid).toContain('Work-study programs')
      
      // Should consider cost in pathway recommendations
      const costConsiderations = plan!.recommendedPathways.flatMap(rp => rp.considerations)
      const hasCostConsideration = costConsiderations.some(c => 
        c.includes('cost') || c.includes('financial')
      )
      expect(hasCostConsideration).toBe(true)
    })
    
    it('should recommend mature entry for older students', async () => {
      const plan = await alternativePathwayEngine.generateImprovementPlan(
        mockStudentId,
        'Registered Nursing',
        averageGrades,
        60,
        'conditional',
        27, // Mature age
        4,  // Work experience
        false
      )
      
      expect(plan).toBeDefined()
      
      // Should include mature entry pathway
      const maturePathway = plan!.recommendedPathways.find(rp => 
        rp.pathway.type === 'mature_entry'
      )
      expect(maturePathway).toBeDefined()
      expect(maturePathway!.suitabilityScore).toBeGreaterThan(50)
    })
    
    it('should set appropriate review schedules based on status', async () => {
      // Test for needs improvement status
      const strugglingPlan = await alternativePathwayEngine.generateImprovementPlan(
        mockStudentId,
        'Clinical Medicine',
        poorGrades,
        30,
        'needs_improvement',
        20,
        0
      )
      
      expect(strugglingPlan!.reviewSchedule.reviewFrequency).toBe('Every 3 months')
      
      // Test for good status
      const goodPlan = await alternativePathwayEngine.generateImprovementPlan(
        mockStudentId,
        'Clinical Medicine',
        averageGrades,
        75,
        'good',
        20,
        0
      )
      
      expect(goodPlan!.reviewSchedule.reviewFrequency).toBe('Every 6 months')
    })
  })
  
  describe('pathway suitability scoring', () => {
    
    it('should score pathways higher when they lead to target program', async () => {
      const nursingPathways = await alternativePathwayEngine.identifyPathways(
        'Registered Nursing',
        averageGrades,
        22,
        0
      )
      
      expect(nursingPathways.length).toBeGreaterThan(0)
      
      // All returned pathways should lead to nursing
      nursingPathways.forEach(pathway => {
        expect(pathway.leadsTo.programs.some(program => 
          program.toLowerCase().includes('nursing')
        )).toBe(true)
        expect(pathway.suitabilityScore).toBeGreaterThan(30) // Base score for leading to target
      })
    })
    
    it('should consider grade requirements in scoring', async () => {
      const pathways = await alternativePathwayEngine.identifyPathways(
        'Clinical Medicine',
        excellentGrades,
        20,
        0
      )
      
      expect(pathways.length).toBeGreaterThan(0)
      
      // Excellent grades should result in high suitability scores
      const topPathway = pathways[0]
      expect(topPathway.suitabilityScore).toBeGreaterThan(80)
      expect(topPathway.reasonsForRecommendation).toContain('Meets grade requirements')
    })
    
    it('should penalize pathways for unmet requirements', async () => {
      const pathways = await alternativePathwayEngine.identifyPathways(
        'Clinical Medicine',
        poorGrades,
        18, // Below mature entry age
        0   // No work experience
      )
      
      expect(pathways.length).toBeGreaterThan(0)
      
      // Should have challenges listed for poor grades
      pathways.forEach(pathway => {
        if (pathway.potentialChallenges && pathway.potentialChallenges.length > 0) {
          expect(pathway.potentialChallenges.some(challenge => 
            challenge.includes('improvement') || challenge.includes('need')
          )).toBe(true)
        }
      })
    })
    
    it('should bonus score for high success rates', async () => {
      const pathways = await alternativePathwayEngine.identifyPathways(
        'Environmental Health',
        averageGrades,
        22,
        0
      )
      
      expect(pathways.length).toBeGreaterThan(0)
      
      // Find pathways with high success rates
      const highSuccessPathways = pathways.filter(p => 
        p.successRate.completionRate >= 85 || p.successRate.progressionRate >= 75
      )
      
      expect(highSuccessPathways.length).toBeGreaterThan(0)
      
      // These should have bonus points reflected in reasons
      highSuccessPathways.forEach(pathway => {
        const hasSuccessReason = pathway.reasonsForRecommendation?.some(reason =>
          reason.includes('completion rate') || reason.includes('progression rate')
        )
        expect(hasSuccessReason).toBe(true)
      })
    })
  })
  
  describe('major gap identification', () => {
    
    it('should identify overall score gaps', async () => {
      const plan = await alternativePathwayEngine.generateImprovementPlan(
        mockStudentId,
        'Clinical Medicine',
        poorGrades,
        25, // Very low score
        'not_eligible',
        20,
        0
      )
      
      expect(plan!.currentStatus.majorGaps).toContain(
        'Overall academic performance needs significant improvement'
      )
    })
    
    it('should identify missing required subjects', async () => {
      const plan = await alternativePathwayEngine.generateImprovementPlan(
        mockStudentId,
        'Clinical Medicine',
        incompleteGrades, // Missing Biology and Chemistry
        45,
        'needs_improvement',
        20,
        0
      )
      
      const missingSubjectGaps = plan!.currentStatus.majorGaps.filter(gap =>
        gap.includes('Missing required subject')
      )
      
      expect(missingSubjectGaps.length).toBeGreaterThan(0)
      expect(missingSubjectGaps.some(gap => gap.includes('Biology'))).toBe(true)
      expect(missingSubjectGaps.some(gap => gap.includes('Chemistry'))).toBe(true)
    })
    
    it('should identify grade improvement needs', async () => {
      const lowBiologyGrades: SubjectGrade[] = [
        { subject_name: 'English', grade: 5 },
        { subject_name: 'Mathematics', grade: 6 },
        { subject_name: 'Biology', grade: 8 }, // Poor biology grade
        { subject_name: 'Chemistry', grade: 6 }
      ]
      
      const plan = await alternativePathwayEngine.generateImprovementPlan(
        mockStudentId,
        'Registered Nursing',
        lowBiologyGrades,
        55,
        'conditional',
        20,
        0
      )
      
      const gradeGaps = plan!.currentStatus.majorGaps.filter(gap =>
        gap.includes('grade needs improvement')
      )
      
      expect(gradeGaps.length).toBeGreaterThan(0)
      expect(gradeGaps.some(gap => gap.includes('Biology'))).toBe(true)
    })
    
    it('should identify grade average issues', async () => {
      const belowCreditGrades: SubjectGrade[] = [
        { subject_name: 'English', grade: 7 },
        { subject_name: 'Mathematics', grade: 7 },
        { subject_name: 'Biology', grade: 8 },
        { subject_name: 'Chemistry', grade: 7 },
        { subject_name: 'Physics', grade: 8 }
      ]
      
      const plan = await alternativePathwayEngine.generateImprovementPlan(
        mockStudentId,
        'Environmental Health',
        belowCreditGrades,
        40,
        'needs_improvement',
        20,
        0
      )
      
      expect(plan!.currentStatus.majorGaps).toContain(
        'Grade average below credit level'
      )
    })
  })
  
  describe('short-term action generation', () => {
    
    it('should prioritize grade improvement actions', async () => {
      const plan = await alternativePathwayEngine.generateImprovementPlan(
        mockStudentId,
        'Clinical Medicine',
        poorGrades,
        30,
        'needs_improvement',
        20,
        0
      )
      
      const gradeActions = plan!.shortTermActions.filter(action =>
        action.action.includes('Retake') || action.action.includes('subjects')
      )
      
      expect(gradeActions.length).toBeGreaterThan(0)
      expect(gradeActions[0].priority).toBe('high')
      expect(gradeActions[0].timeframe).toMatch(/6-12 months/)
      expect(gradeActions[0].estimatedCost).toBeGreaterThan(0)
    })
    
    it('should include pathway application actions', async () => {
      const plan = await alternativePathwayEngine.generateImprovementPlan(
        mockStudentId,
        'Registered Nursing',
        averageGrades,
        55,
        'conditional',
        20,
        0
      )
      
      const applicationActions = plan!.shortTermActions.filter(action =>
        action.action.includes('Apply for')
      )
      
      expect(applicationActions.length).toBeGreaterThan(0)
      expect(applicationActions[0].priority).toBe('medium')
      expect(applicationActions[0].timeframe).toMatch(/1-3 months/)
    })
    
    it('should include support-seeking actions', async () => {
      const plan = await alternativePathwayEngine.generateImprovementPlan(
        mockStudentId,
        'Environmental Health',
        poorGrades,
        35,
        'needs_improvement',
        20,
        0
      )
      
      const supportActions = plan!.shortTermActions.filter(action =>
        action.action.includes('counseling') || action.action.includes('support')
      )
      
      expect(supportActions.length).toBeGreaterThan(0)
      expect(supportActions[0].priority).toBe('medium')
    })
    
    it('should sort actions by priority', async () => {
      const plan = await alternativePathwayEngine.generateImprovementPlan(
        mockStudentId,
        'Clinical Medicine',
        poorGrades,
        30,
        'needs_improvement',
        20,
        0
      )
      
      const actions = plan!.shortTermActions
      expect(actions.length).toBeGreaterThan(1)
      
      // Should be sorted by priority (high first)
      let lastPriorityValue = 3 // high = 3
      actions.forEach(action => {
        const priorityValue = action.priority === 'high' ? 3 : action.priority === 'medium' ? 2 : 1
        expect(priorityValue).toBeLessThanOrEqual(lastPriorityValue)
        lastPriorityValue = priorityValue
      })
    })
  })
  
  describe('edge cases and error handling', () => {
    
    it('should handle empty grades gracefully', async () => {
      const pathways = await alternativePathwayEngine.identifyPathways(
        'Registered Nursing',
        [], // No grades
        20,
        0
      )
      
      expect(pathways).toBeDefined()
      expect(Array.isArray(pathways)).toBe(true)
      // Should still return some pathways (foundation programs, etc.)
      expect(pathways.length).toBeGreaterThan(0)
    })
    
    it('should handle unknown program names', async () => {
      const pathways = await alternativePathwayEngine.identifyPathways(
        'Unknown Program',
        averageGrades,
        20,
        0
      )
      
      expect(pathways).toBeDefined()
      expect(Array.isArray(pathways)).toBe(true)
      // Should return general pathways
    })
    
    it('should handle extreme age values', async () => {
      const pathways = await alternativePathwayEngine.identifyPathways(
        'Registered Nursing',
        averageGrades,
        60, // Very mature student
        10
      )
      
      expect(pathways).toBeDefined()
      expect(pathways.length).toBeGreaterThan(0)
      
      // Should include mature entry
      const maturePathway = pathways.find(p => p.type === 'mature_entry')
      expect(maturePathway).toBeDefined()
    })
    
    it('should handle missing optional parameters', async () => {
      const pathways = await alternativePathwayEngine.identifyPathways(
        'Clinical Medicine',
        averageGrades
        // No age or work experience provided
      )
      
      expect(pathways).toBeDefined()
      expect(pathways.length).toBeGreaterThan(0)
    })
  })
})