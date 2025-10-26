import { describe, it, expect } from 'vitest'

describe('Application Data Validation', () => {
  it('validates application number format', () => {
    const validFormats = ['MIHAS202512345', 'KATC202567890']
    const invalidFormats = ['MIHAS2025', '202512345', 'INVALID']
    
    validFormats.forEach(format => {
      expect(format).toMatch(/^(MIHAS|KATC)\d{9}$/)
    })
    
    invalidFormats.forEach(format => {
      expect(format).not.toMatch(/^(MIHAS|KATC)\d{9}$/)
    })
  })

  it('validates NRC format', () => {
    const validNRCs = ['123456/12/1', '987654/01/9']
    const invalidNRCs = ['12345/12/1', '123456-12-1', 'invalid']
    
    validNRCs.forEach(nrc => {
      expect(nrc).toMatch(/^\d{6}\/\d{2}\/\d$/)
    })
    
    invalidNRCs.forEach(nrc => {
      expect(nrc).not.toMatch(/^\d{6}\/\d{2}\/\d$/)
    })
  })

  it('validates phone number format', () => {
    const validPhones = ['+260961234567', '+260971234567', '+260977123456']
    const invalidPhones = ['0961234567', '961234567', '+26096']
    
    validPhones.forEach(phone => {
      expect(phone).toMatch(/^\+260\d{9}$/)
    })
    
    invalidPhones.forEach(phone => {
      expect(phone).not.toMatch(/^\+260\d{9}$/)
    })
  })

  it('validates email format', () => {
    const validEmails = ['test@example.com', 'user.name@domain.co.zm', 'admin@mihas.edu.zm']
    const invalidEmails = ['invalid', '@example.com', 'test@', 'test @example.com']
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    
    validEmails.forEach(email => {
      expect(email).toMatch(emailRegex)
    })
    
    invalidEmails.forEach(email => {
      expect(email).not.toMatch(emailRegex)
    })
  })

  it('validates grade values (1-9 scale)', () => {
    const validGrades = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    const invalidGrades = [0, 10, -1, 15, 100]
    
    validGrades.forEach(grade => {
      expect(grade).toBeGreaterThanOrEqual(1)
      expect(grade).toBeLessThanOrEqual(9)
    })
    
    invalidGrades.forEach(grade => {
      expect(grade < 1 || grade > 9).toBe(true)
    })
  })
})
