// Enhanced Grade Validation System for Zambian Education System
// Implements strict validation for Zambian Grade 12 grading (1=A+ to 9=F)

export const ZAMBIAN_GRADE_SYSTEM = {
  GRADES: {
    1: { symbol: 'A+', description: 'Distinction', points: 9, percentage: '90-100%' },
    2: { symbol: 'A', description: 'Merit', points: 8, percentage: '80-89%' },
    3: { symbol: 'B+', description: 'Very Good', points: 7, percentage: '75-79%' },
    4: { symbol: 'B', description: 'Good', points: 6, percentage: '70-74%' },
    5: { symbol: 'C+', description: 'Satisfactory', points: 5, percentage: '65-69%' },
    6: { symbol: 'C', description: 'Credit', points: 4, percentage: '50-64%' },
    7: { symbol: 'D', description: 'Pass', points: 3, percentage: '40-49%' },
    8: { symbol: 'E', description: 'Weak Pass', points: 2, percentage: '35-39%' },
    9: { symbol: 'F', description: 'Fail', points: 1, percentage: '0-34%' }
  },
  VALID_RANGE: { min: 1, max: 9 },
  CREDIT_THRESHOLD: 6, // Grade 6 (C) and above is considered credit
  PASS_THRESHOLD: 7,   // Grade 7 (D) and above is considered pass
  FAIL_GRADE: 9
} as const

export interface GradeValidationResult {
  isValid: boolean
  grade?: number
  symbol?: string
  description?: string
  points?: number
  errors: string[]
  warnings: string[]
  suggestions: string[]
}

export interface SubjectGradeValidation {
  subject: string
  originalInput: unknown
  validation: GradeValidationResult
  normalizedGrade?: number
}

export class ZambianGradeValidator {
  
  /**
   * Validates a single grade according to Zambian Grade 12 system
   */
  static validateGrade(input: unknown): GradeValidationResult {
    const result: GradeValidationResult = {
      isValid: false,
      errors: [],
      warnings: [],
      suggestions: []
    }

    // Handle null/undefined
    if (input === null || input === undefined) {
      result.errors.push('Grade cannot be empty')
      result.suggestions.push('Enter a grade between 1 (A+) and 9 (F)')
      return result
    }

    // Convert to number if string
    let grade: number
    if (typeof input === 'string') {
      const trimmed = input.trim()
      
      // Handle letter grades (convert to numeric)
      const letterGrade = this.convertLetterToNumeric(trimmed)
      if (letterGrade !== null) {
        grade = letterGrade
      } else {
        const parsed = parseFloat(trimmed)
        if (isNaN(parsed)) {
          result.errors.push(`Invalid grade format: "${input}"`)
          result.suggestions.push('Use numeric grades 1-9 or letter grades A+, A, B+, B, C+, C, D, E, F')
          return result
        }
        grade = parsed
      }
    } else if (typeof input === 'number') {
      grade = input
    } else {
      result.errors.push(`Invalid grade type: ${typeof input}`)
      result.suggestions.push('Grade must be a number between 1-9 or letter grade')
      return result
    }

    // Validate range
    if (!Number.isInteger(grade)) {
      result.errors.push(`Grade must be a whole number, got: ${grade}`)
      result.suggestions.push('Use whole numbers only (1, 2, 3, etc.)')
      return result
    }

    if (grade < ZAMBIAN_GRADE_SYSTEM.VALID_RANGE.min || grade > ZAMBIAN_GRADE_SYSTEM.VALID_RANGE.max) {
      result.errors.push(`Grade ${grade} is outside valid range (1-9)`)
      result.suggestions.push('Zambian grades range from 1 (best) to 9 (worst)')
      return result
    }

    // Valid grade - populate details
    const gradeInfo = ZAMBIAN_GRADE_SYSTEM.GRADES[grade as keyof typeof ZAMBIAN_GRADE_SYSTEM.GRADES]
    result.isValid = true
    result.grade = grade
    result.symbol = gradeInfo.symbol
    result.description = gradeInfo.description
    result.points = gradeInfo.points

    // Add warnings for poor grades
    if (grade === 9) {
      result.warnings.push('This is a failing grade')
      result.suggestions.push('Consider retaking this subject to improve your grade')
    } else if (grade === 8) {
      result.warnings.push('This is a weak pass - may not meet program requirements')
      result.suggestions.push('Consider retaking to achieve at least grade 6 (Credit)')
    } else if (grade === 7) {
      result.warnings.push('This is a basic pass - credit level (grade 6) preferred for competitive programs')
    }

    return result
  }
  /**
   * Converts letter grades to numeric equivalents
   */
  private static convertLetterToNumeric(letter: string): number | null {
    const letterMap: Record<string, number> = {
      'A+': 1, 'a+': 1,
      'A': 2, 'a': 2,
      'B+': 3, 'b+': 3,
      'B': 4, 'b': 4,
      'C+': 5, 'c+': 5,
      'C': 6, 'c': 6,
      'D': 7, 'd': 7,
      'E': 8, 'e': 8,
      'F': 9, 'f': 9
    }
    
    return letterMap[letter] || null
  }

  /**
   * Validates multiple subject grades
   */
  static validateSubjectGrades(subjects: Array<{ subject: string; grade: unknown }>): SubjectGradeValidation[] {
    return subjects.map(({ subject, grade }) => ({
      subject,
      originalInput: grade,
      validation: this.validateGrade(grade),
      normalizedGrade: this.validateGrade(grade).isValid ? this.validateGrade(grade).grade : undefined
    }))
  }

  /**
   * Checks if a grade meets credit level (grade 6 or better)
   */
  static isCreditLevel(grade: number): boolean {
    return grade <= ZAMBIAN_GRADE_SYSTEM.CREDIT_THRESHOLD
  }

  /**
   * Checks if a grade is passing (grade 7 or better)
   */
  static isPassingGrade(grade: number): boolean {
    return grade <= ZAMBIAN_GRADE_SYSTEM.PASS_THRESHOLD
  }

  /**
   * Calculates grade point average using Zambian point system
   */
  static calculateGPA(grades: number[]): number {
    if (grades.length === 0) return 0
    
    const totalPoints = grades.reduce((sum, grade) => {
      const gradeInfo = ZAMBIAN_GRADE_SYSTEM.GRADES[grade as keyof typeof ZAMBIAN_GRADE_SYSTEM.GRADES]
      return sum + (gradeInfo?.points || 0)
    }, 0)
    
    return totalPoints / grades.length
  }

  /**
   * Gets grade statistics for a set of grades
   */
  static getGradeStatistics(grades: number[]) {
    if (grades.length === 0) {
      return {
        count: 0,
        average: 0,
        gpa: 0,
        creditCount: 0,
        passCount: 0,
        failCount: 0,
        best: null,
        worst: null
      }
    }

    const creditCount = grades.filter(g => this.isCreditLevel(g)).length
    const passCount = grades.filter(g => this.isPassingGrade(g)).length
    const failCount = grades.filter(g => g === ZAMBIAN_GRADE_SYSTEM.FAIL_GRADE).length
    
    return {
      count: grades.length,
      average: grades.reduce((sum, g) => sum + g, 0) / grades.length,
      gpa: this.calculateGPA(grades),
      creditCount,
      passCount,
      failCount,
      best: Math.min(...grades),
      worst: Math.max(...grades)
    }
  }
}
/**
 * Grade conversion utilities for different input formats
 */
/**
 * Grade interpretation and scoring algorithms
 */
export class GradeScorer {
  
  /**
   * Calculates competitiveness score (0-100) based on grades
   */
  static calculateCompetitivenessScore(grades: number[]): number {
    if (grades.length === 0) return 0
    
    const stats = ZambianGradeValidator.getGradeStatistics(grades)
    
    // Base score from GPA (higher GPA = higher score)
    const gpaScore = (stats.gpa / 9) * 100
    
    // Bonus for having many credit-level grades
    const creditBonus = (stats.creditCount / stats.count) * 20
    
    // Penalty for failing grades
    const failPenalty = (stats.failCount / stats.count) * 30
    
    const finalScore = Math.max(0, Math.min(100, gpaScore + creditBonus - failPenalty))
    return Math.round(finalScore)
  }

  /**
   * Determines competitiveness level based on grades
   */
  static determineCompetitivenessLevel(grades: number[]): 'Highly Competitive' | 'Competitive' | 'Minimum' | 'Not Competitive' {
    const score = this.calculateCompetitivenessScore(grades)
    const stats = ZambianGradeValidator.getGradeStatistics(grades)
    
    // Must have at least 5 subjects and no fails for competitive levels
    if (stats.count < 5 || stats.failCount > 0) {
      return 'Not Competitive'
    }
    
    if (score >= 85 && stats.average <= 3) return 'Highly Competitive'
    if (score >= 70 && stats.average <= 5) return 'Competitive'
    if (score >= 50 && stats.creditCount >= 5) return 'Minimum'
    
    return 'Not Competitive'
  }

  /**
   * Generates improvement recommendations based on grades
   */
  static generateImprovementRecommendations(grades: number[]): string[] {
    const recommendations: string[] = []
    const stats = ZambianGradeValidator.getGradeStatistics(grades)
    
    if (stats.count < 5) {
      recommendations.push(`Add ${5 - stats.count} more subjects to meet minimum requirements`)
    }
    
    if (stats.failCount > 0) {
      recommendations.push(`Retake ${stats.failCount} failing subject(s) to achieve at least grade 7 (Pass)`)
    }
    
    if (stats.creditCount < 5) {
      const needed = 5 - stats.creditCount
      recommendations.push(`Improve ${needed} subject(s) to credit level (grade 6 or better)`)
    }
    
    if (stats.average > 5) {
      recommendations.push('Focus on improving your strongest subjects to grades 1-4 for competitive advantage')
    }
    
    if (stats.best && stats.best > 3) {
      recommendations.push('Aim for at least one distinction (grade 1-2) to stand out')
    }
    
    return recommendations
  }
}

// Export commonly used functions
export const validateGrade = ZambianGradeValidator.validateGrade.bind(ZambianGradeValidator)
export const validateSubjectGrades = ZambianGradeValidator.validateSubjectGrades.bind(ZambianGradeValidator)
export const calculateCompetitivenessScore = GradeScorer.calculateCompetitivenessScore.bind(GradeScorer)
export const determineCompetitivenessLevel = GradeScorer.determineCompetitivenessLevel.bind(GradeScorer)