import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { eligibilityCalculator } from '@/lib/eligibility'
import { gradeCalculator } from '@/utils/grades'
import { duplicateDetection } from '@/utils/duplicate-detection'
import { smartMatching } from '@/utils/smart-matching'

describe('Utility Functions', () => {
  describe('Eligibility Calculator', () => {
    it('calculates eligibility correctly', () => {
      const grades = {
        mathematics: 85,
        english: 78,
        science: 92
      }
      
      const result = eligibilityCalculator.calculate(grades)
      expect(result.eligible).toBe(true)
      expect(result.score).toBeGreaterThan(0)
    })

    it('handles minimum requirements', () => {
      const grades = {
        mathematics: 45,
        english: 40,
        science: 50
      }
      
      const result = eligibilityCalculator.calculate(grades)
      expect(result.eligible).toBe(false)
    })
  })

  describe('Grade Calculator', () => {
    it('converts Zambian grades correctly', () => {
      expect(gradeCalculator.zambianToPercentage('1')).toBe(85)
      expect(gradeCalculator.zambianToPercentage('2')).toBe(75)
      expect(gradeCalculator.zambianToPercentage('9')).toBe(25)
    })

    it('calculates GPA correctly', () => {
      const grades = [85, 78, 92, 88]
      const gpa = gradeCalculator.calculateGPA(grades)
      expect(gpa).toBeCloseTo(3.6, 1)
    })
  })

  describe('Duplicate Detection', () => {
    it('detects duplicate applications', async () => {
      const application1 = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        nrc: '123456/78/9'
      }
      
      const application2 = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        nrc: '123456/78/9'
      }
      
      const isDuplicate = await duplicateDetection.check(application1, application2)
      expect(isDuplicate).toBe(true)
    })

    it('handles similar but not duplicate applications', async () => {
      const application1 = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        nrc: '123456/78/9'
      }
      
      const application2 = {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        nrc: '987654/32/1'
      }
      
      const isDuplicate = await duplicateDetection.check(application1, application2)
      expect(isDuplicate).toBe(false)
    })
  })

  describe('Smart Matching', () => {
    it('recommends programs based on grades', async () => {
      const studentProfile = {
        grades: {
          mathematics: 90,
          physics: 85,
          chemistry: 88
        },
        interests: ['technology', 'engineering']
      }
      
      const recommendations = await smartMatching.getRecommendations(studentProfile)
      expect(recommendations).toContain('Computer Science')
      expect(recommendations).toContain('Engineering')
    })

    it('considers student preferences', async () => {
      const studentProfile = {
        grades: {
          biology: 90,
          chemistry: 85,
          mathematics: 80
        },
        interests: ['medicine', 'healthcare']
      }
      
      const recommendations = await smartMatching.getRecommendations(studentProfile)
      expect(recommendations).toContain('Medicine')
      expect(recommendations).toContain('Nursing')
    })
  })
})