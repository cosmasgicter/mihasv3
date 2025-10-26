import { describe, it, expect } from 'vitest'
import { gradeCalculator, calculateBestFivePoints, sanitizeGradeValue, getGradeLabel } from '@/utils/grades'
import { formatDate, cn } from '@/lib/utils'

describe('Utility Functions', () => {

  describe('Grade Calculator', () => {
    it('calculates total and average correctly', () => {
      const grades = [{ grade: 2 }, { grade: 3 }, { grade: 4 }]
      const result = gradeCalculator.calculate(grades)
      expect(result.total).toBe(9)
      expect(result.average).toBeCloseTo(3, 1)
    })

    it('handles empty grades', () => {
      const result = gradeCalculator.calculate([])
      expect(result.total).toBe(0)
      expect(result.average).toBe(0)
    })

    it('calculates best five points correctly', () => {
      const grades = [2, 3, 4, 5, 6, 7, 8]
      const points = calculateBestFivePoints(grades)
      expect(points).toBe(20) // 2+3+4+5+6 = 20
    })

    it('sanitizes grade values', () => {
      expect(sanitizeGradeValue(2)).toBe(2)
      expect(sanitizeGradeValue('3')).toBe(3)
      expect(sanitizeGradeValue(10)).toBe(0)
      expect(sanitizeGradeValue('invalid')).toBe(0)
    })

    it('returns correct grade labels', () => {
      expect(getGradeLabel(1)).toBe('Distinction')
      expect(getGradeLabel(2)).toBe('Merit')
      expect(getGradeLabel(6)).toBe('Pass')
      expect(getGradeLabel(9)).toBe('Fail')
    })
  })

  describe('Date Formatting', () => {
    it('formats dates correctly', () => {
      const date = '2025-01-25T10:30:00Z'
      const formatted = formatDate(date)
      expect(formatted).toContain('Jan')
      expect(formatted).toContain('2025')
    })

    it('handles invalid dates', () => {
      const formatted = formatDate('invalid')
      expect(formatted).toBe('Invalid date')
    })
  })

  describe('Class Name Utility', () => {
    it('merges class names correctly', () => {
      const result = cn('base', 'extra')
      expect(result).toContain('base')
      expect(result).toContain('extra')
    })

    it('handles conditional classes', () => {
      const result = cn('base', false && 'hidden', 'visible')
      expect(result).toContain('base')
      expect(result).toContain('visible')
      expect(result).not.toContain('hidden')
    })
  })
})