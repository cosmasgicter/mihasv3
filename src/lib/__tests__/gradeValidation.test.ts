import { describe, it, expect } from 'vitest'
import {
  ZambianGradeValidator,
  GradeConverter,
  GradeScorer,
  ZAMBIAN_GRADE_SYSTEM,
  validateGrade,
  validateSubjectGrades,
  calculateCompetitivenessScore,
  determineCompetitivenessLevel
} from '../gradeValidation'

describe('ZambianGradeValidator', () => {
  describe('validateGrade', () => {
    it('should validate numeric grades 1-9', () => {
      for (let grade = 1; grade <= 9; grade++) {
        const result = ZambianGradeValidator.validateGrade(grade)
        expect(result.isValid).toBe(true)
        expect(result.grade).toBe(grade)
        expect(result.errors).toHaveLength(0)
      }
    })

    it('should reject grades outside 1-9 range', () => {
      const invalidGrades = [0, 10, -1, 15]
      invalidGrades.forEach(grade => {
        const result = ZambianGradeValidator.validateGrade(grade)
        expect(result.isValid).toBe(false)
        expect(result.errors.length).toBeGreaterThan(0)
      })
    })

    it('should convert letter grades to numeric', () => {
      const letterGrades = [
        { input: 'A+', expected: 1 },
        { input: 'A', expected: 2 },
        { input: 'B+', expected: 3 },
        { input: 'B', expected: 4 },
        { input: 'C+', expected: 5 },
        { input: 'C', expected: 6 },
        { input: 'D', expected: 7 },
        { input: 'E', expected: 8 },
        { input: 'F', expected: 9 }
      ]

      letterGrades.forEach(({ input, expected }) => {
        const result = ZambianGradeValidator.validateGrade(input)
        expect(result.isValid).toBe(true)
        expect(result.grade).toBe(expected)
      })
    })

    it('should handle case-insensitive letter grades', () => {
      const result1 = ZambianGradeValidator.validateGrade('a+')
      const result2 = ZambianGradeValidator.validateGrade('A+')
      
      expect(result1.isValid).toBe(true)
      expect(result2.isValid).toBe(true)
      expect(result1.grade).toBe(result2.grade)
    })

    it('should reject null and undefined', () => {
      const nullResult = ZambianGradeValidator.validateGrade(null)
      const undefinedResult = ZambianGradeValidator.validateGrade(undefined)
      
      expect(nullResult.isValid).toBe(false)
      expect(undefinedResult.isValid).toBe(false)
    })

    it('should reject decimal grades', () => {
      const result = ZambianGradeValidator.validateGrade(5.5)
      expect(result.isValid).toBe(false)
      expect(result.errors[0]).toContain('whole number')
    })

    it('should add warnings for poor grades', () => {
      const failResult = ZambianGradeValidator.validateGrade(9)
      expect(failResult.warnings.length).toBeGreaterThan(0)
      expect(failResult.warnings[0]).toContain('failing')

      const weakResult = ZambianGradeValidator.validateGrade(8)
      expect(weakResult.warnings.length).toBeGreaterThan(0)
      expect(weakResult.warnings[0]).toContain('weak pass')
    })
  })

  describe('validateSubjectGrades', () => {
    it('should validate multiple subjects', () => {
      const subjects = [
        { subject: 'Mathematics', grade: 3 },
        { subject: 'English', grade: 'B+' },
        { subject: 'Biology', grade: 2 }
      ]

      const results = ZambianGradeValidator.validateSubjectGrades(subjects)
      
      expect(results).toHaveLength(3)
      expect(results[0].validation.isValid).toBe(true)
      expect(results[1].validation.isValid).toBe(true)
      expect(results[2].validation.isValid).toBe(true)
      expect(results[1].normalizedGrade).toBe(3) // B+ = 3
    })
  })

  describe('utility methods', () => {
    it('should correctly identify credit level grades', () => {
      expect(ZambianGradeValidator.isCreditLevel(1)).toBe(true)
      expect(ZambianGradeValidator.isCreditLevel(6)).toBe(true)
      expect(ZambianGradeValidator.isCreditLevel(7)).toBe(false)
      expect(ZambianGradeValidator.isCreditLevel(9)).toBe(false)
    })

    it('should correctly identify passing grades', () => {
      expect(ZambianGradeValidator.isPassingGrade(1)).toBe(true)
      expect(ZambianGradeValidator.isPassingGrade(7)).toBe(true)
      expect(ZambianGradeValidator.isPassingGrade(8)).toBe(false)
      expect(ZambianGradeValidator.isPassingGrade(9)).toBe(false)
    })

    it('should calculate GPA correctly', () => {
      const grades = [1, 2, 3] // A+, A, B+
      const gpa = ZambianGradeValidator.calculateGPA(grades)
      
      // Points: 9, 8, 7 = 24/3 = 8
      expect(gpa).toBe(8)
    })

    it('should generate grade statistics', () => {
      const grades = [1, 2, 6, 7, 9] // A+, A, C, D, F
      const stats = ZambianGradeValidator.getGradeStatistics(grades)
      
      expect(stats.count).toBe(5)
      expect(stats.creditCount).toBe(3) // grades 1, 2, 6
      expect(stats.passCount).toBe(4) // grades 1, 2, 6, 7
      expect(stats.failCount).toBe(1) // grade 9
      expect(stats.best).toBe(1)
      expect(stats.worst).toBe(9)
    })
  })
})
describe('GradeConverter', () => {
  describe('percentageToGrade', () => {
    it('should convert percentages to correct grades', () => {
      expect(GradeConverter.percentageToGrade(95)).toBe(1) // A+
      expect(GradeConverter.percentageToGrade(85)).toBe(2) // A
      expect(GradeConverter.percentageToGrade(77)).toBe(3) // B+
      expect(GradeConverter.percentageToGrade(72)).toBe(4) // B
      expect(GradeConverter.percentageToGrade(67)).toBe(5) // C+
      expect(GradeConverter.percentageToGrade(55)).toBe(6) // C
      expect(GradeConverter.percentageToGrade(45)).toBe(7) // D
      expect(GradeConverter.percentageToGrade(37)).toBe(8) // E
      expect(GradeConverter.percentageToGrade(25)).toBe(9) // F
    })
  })

  describe('gpaToGrade', () => {
    it('should convert GPA to approximate grades', () => {
      expect(GradeConverter.gpaToGrade(3.8)).toBe(1) // A+
      expect(GradeConverter.gpaToGrade(3.5)).toBe(2) // A
      expect(GradeConverter.gpaToGrade(3.1)).toBe(3) // B+
      expect(GradeConverter.gpaToGrade(2.8)).toBe(4) // B
      expect(GradeConverter.gpaToGrade(2.5)).toBe(5) // C+
      expect(GradeConverter.gpaToGrade(2.1)).toBe(6) // C
      expect(GradeConverter.gpaToGrade(1.8)).toBe(7) // D
      expect(GradeConverter.gpaToGrade(1.2)).toBe(8) // E
      expect(GradeConverter.gpaToGrade(0.5)).toBe(9) // F
    })
  })

  describe('internationalLetterToGrade', () => {
    it('should convert international letter grades', () => {
      expect(GradeConverter.internationalLetterToGrade('A+')).toBe(1)
      expect(GradeConverter.internationalLetterToGrade('A')).toBe(2)
      expect(GradeConverter.internationalLetterToGrade('A-')).toBe(3)
      expect(GradeConverter.internationalLetterToGrade('B+')).toBe(3)
      expect(GradeConverter.internationalLetterToGrade('B')).toBe(4)
      expect(GradeConverter.internationalLetterToGrade('B-')).toBe(5)
      expect(GradeConverter.internationalLetterToGrade('C+')).toBe(5)
      expect(GradeConverter.internationalLetterToGrade('C')).toBe(6)
      expect(GradeConverter.internationalLetterToGrade('C-')).toBe(7)
      expect(GradeConverter.internationalLetterToGrade('D')).toBe(7)
      expect(GradeConverter.internationalLetterToGrade('F')).toBe(9)
    })

    it('should return null for invalid letters', () => {
      expect(GradeConverter.internationalLetterToGrade('X')).toBe(null)
      expect(GradeConverter.internationalLetterToGrade('Z+')).toBe(null)
    })
  })
})

describe('GradeScorer', () => {
  describe('calculateCompetitivenessScore', () => {
    it('should calculate high scores for excellent grades', () => {
      const excellentGrades = [1, 1, 2, 2, 3] // Mostly distinctions
      const score = GradeScorer.calculateCompetitivenessScore(excellentGrades)
      expect(score).toBeGreaterThan(80)
    })

    it('should calculate low scores for poor grades', () => {
      const poorGrades = [7, 8, 8, 9, 9] // Mostly fails and weak passes
      const score = GradeScorer.calculateCompetitivenessScore(poorGrades)
      expect(score).toBeLessThan(30)
    })

    it('should return 0 for empty grades', () => {
      const score = GradeScorer.calculateCompetitivenessScore([])
      expect(score).toBe(0)
    })
  })

  describe('determineCompetitivenessLevel', () => {
    it('should classify excellent grades as highly competitive', () => {
      const excellentGrades = [1, 1, 2, 2, 3]
      const level = GradeScorer.determineCompetitivenessLevel(excellentGrades)
      expect(level).toBe('Highly Competitive')
    })

    it('should classify good grades as competitive', () => {
      const goodGrades = [3, 4, 4, 5, 5]
      const level = GradeScorer.determineCompetitivenessLevel(goodGrades)
      expect(level).toBe('Competitive')
    })

    it('should classify adequate grades as minimum', () => {
      const adequateGrades = [5, 6, 6, 6, 6]
      const level = GradeScorer.determineCompetitivenessLevel(adequateGrades)
      expect(level).toBe('Minimum')
    })

    it('should classify poor grades as not competitive', () => {
      const poorGrades = [7, 8, 8, 9]
      const level = GradeScorer.determineCompetitivenessLevel(poorGrades)
      expect(level).toBe('Not Competitive')
    })

    it('should require at least 5 subjects for competitive levels', () => {
      const fewGrades = [1, 1, 2] // Only 3 subjects, even if excellent
      const level = GradeScorer.determineCompetitivenessLevel(fewGrades)
      expect(level).toBe('Not Competitive')
    })
  })

  describe('generateImprovementRecommendations', () => {
    it('should recommend adding subjects if less than 5', () => {
      const fewGrades = [1, 2, 3]
      const recommendations = GradeScorer.generateImprovementRecommendations(fewGrades)
      expect(recommendations.some(r => r.includes('Add 2 more subjects'))).toBe(true)
    })

    it('should recommend retaking failing subjects', () => {
      const gradesWithFails = [1, 2, 6, 9, 9]
      const recommendations = GradeScorer.generateImprovementRecommendations(gradesWithFails)
      expect(recommendations.some(r => r.includes('Retake 2 failing'))).toBe(true)
    })

    it('should recommend improving to credit level', () => {
      const lowGrades = [7, 7, 7, 7, 7]
      const recommendations = GradeScorer.generateImprovementRecommendations(lowGrades)
      expect(recommendations.some(r => r.includes('credit level'))).toBe(true)
    })
  })
})

describe('Exported functions', () => {
  it('should export convenience functions', () => {
    expect(typeof validateGrade).toBe('function')
    expect(typeof validateSubjectGrades).toBe('function')
    expect(typeof calculateCompetitivenessScore).toBe('function')
    expect(typeof determineCompetitivenessLevel).toBe('function')
  })

  it('should work as expected when called directly', () => {
    const result = validateGrade(5)
    expect(result.isValid).toBe(true)
    expect(result.grade).toBe(5)

    const score = calculateCompetitivenessScore([1, 2, 3, 4, 5])
    expect(score).toBeGreaterThan(0)

    const level = determineCompetitivenessLevel([1, 2, 3, 4, 5])
    expect(['Highly Competitive', 'Competitive', 'Minimum', 'Not Competitive']).toContain(level)
  })
})