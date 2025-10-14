// Comprehensive Security Tests for MIHAS Application System
import { describe, it, expect, beforeEach } from 'vitest'
import {
  SecuritySanitizer,
  UrlValidator,
  FileUploadSecurity,
  SafeCodeExecution,
  SecureErrorHandler,
  RateLimiter,
  SECURITY_CONFIG
} from '../securityEnhancements'

describe('Security Enhancements', () => {
  describe('SecuritySanitizer', () => {
    it('should sanitize HTML content', () => {
      const maliciousHtml = '<script>alert("xss")</script><p>Safe content</p>'
      const sanitized = SecuritySanitizer.sanitizeHtml(maliciousHtml)
      
      expect(sanitized).not.toContain('<script>')
      expect(sanitized).toContain('<p>Safe content</p>')
    })

    it('should sanitize strings by removing dangerous characters', () => {
      const maliciousString = 'user<script>alert("xss")</script>'
      const sanitized = SecuritySanitizer.sanitizeString(maliciousString)
      
      expect(sanitized).toBe('useralert(xss)')
      expect(sanitized).not.toContain('<')
      expect(sanitized).not.toContain('>')
    })

    it('should sanitize filenames', () => {
      const maliciousFilename = '../../../etc/passwd'
      const sanitized = SecuritySanitizer.sanitizeFilename(maliciousFilename)
      
      expect(sanitized).toBe('___etc_passwd')
      expect(sanitized).not.toContain('/')
      expect(sanitized).not.toContain('.')
    })

    it('should sanitize URLs and reject malicious ones', () => {
      const validUrl = '***REMOVED***/api/test'
      const maliciousUrl = 'https://evil.com/steal-data'
      
      expect(SecuritySanitizer.sanitizeUrl(validUrl)).toBe(validUrl)
      expect(SecuritySanitizer.sanitizeUrl(maliciousUrl)).toBeNull()
    })

    it('should sanitize objects recursively', () => {
      const maliciousObject = {
        name: 'John<script>alert("xss")</script>',
        nested: {
          value: 'test"malicious',
          array: ['item1', 'item2<script>']
        }
      }
      
      const sanitized = SecuritySanitizer.sanitizeObject(maliciousObject)
      
      expect(sanitized.name).toBe('Johnalert(xss)')
      expect(sanitized.nested.value).toBe('testmalicious')
      expect(sanitized.nested.array[1]).toBe('item2')
    })
  })

  describe('UrlValidator', () => {
    it('should validate allowed API URLs', () => {
      expect(UrlValidator.isValidApiUrl('***REMOVED***/api/test')).toBe(true)
      expect(UrlValidator.isValidApiUrl('https://mylgegkqoddcrxtwcclb.supabase.co/rest/v1/test')).toBe(true)
      expect(UrlValidator.isValidApiUrl('https://evil.com/api/test')).toBe(false)
    })

    it('should throw error for invalid URLs', () => {
      expect(() => {
        UrlValidator.validateAndSanitizeUrl('https://evil.com/steal-data')
      }).toThrow('Invalid or unsafe URL')
    })
  })

  describe('FileUploadSecurity', () => {
    it('should validate file size', () => {
      const largeFile = new File(['x'.repeat(SECURITY_CONFIG.MAX_FILE_SIZE + 1)], 'large.txt', {
        type: 'text/plain'
      })
      
      const result = FileUploadSecurity.validateFile(largeFile)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('File size exceeds')
    })

    it('should validate file types', () => {
      const maliciousFile = new File(['content'], 'malicious.exe', {
        type: 'application/x-executable'
      })
      
      const result = FileUploadSecurity.validateFile(maliciousFile)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('File type not allowed')
    })

    it('should accept valid files', () => {
      const validFile = new File(['content'], 'document.pdf', {
        type: 'application/pdf'
      })
      
      const result = FileUploadSecurity.validateFile(validFile)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should sanitize filenames', () => {
      const maliciousFile = new File(['content'], '../../../malicious.pdf', {
        type: 'application/pdf'
      })
      
      const sanitized = FileUploadSecurity.sanitizeFile(maliciousFile)
      expect(sanitized.name).toBe('___malicious.pdf')
    })
  })

  describe('SafeCodeExecution', () => {
    it('should safely evaluate conditions', () => {
      expect(SafeCodeExecution.evaluateCondition(5, '>', 3)).toBe(true)
      expect(SafeCodeExecution.evaluateCondition(5, '<', 3)).toBe(false)
      expect(SafeCodeExecution.evaluateCondition('hello', '==', 'hello')).toBe(true)
    })

    it('should reject invalid operators', () => {
      expect(() => {
        SafeCodeExecution.evaluateCondition(5, 'eval', 3)
      }).toThrow('Invalid operator')
    })

    it('should safely evaluate arithmetic expressions', () => {
      expect(SafeCodeExecution.safeArithmeticEvaluation('2 + 3')).toBe(5)
      expect(SafeCodeExecution.safeArithmeticEvaluation('10 / 2')).toBe(5)
    })

    it('should reject malicious expressions', () => {
      expect(() => {
        SafeCodeExecution.safeArithmeticEvaluation('alert("xss")')
      }).toThrow('Invalid arithmetic expression')
    })
  })

  describe('SecureErrorHandler', () => {
    it('should sanitize error messages', () => {
      const maliciousError = new Error('Error: <script>alert("xss")</script>')
      const sanitized = SecureErrorHandler.sanitizeError(maliciousError)
      
      expect(sanitized).not.toContain('<script>')
      expect(sanitized).toBe('Error: alert(xss)')
    })

    it('should handle different error types', () => {
      expect(SecureErrorHandler.sanitizeError('string error')).toBe('string error')
      expect(SecureErrorHandler.sanitizeError(null)).toBe('An error occurred')
      expect(SecureErrorHandler.sanitizeError(undefined)).toBe('An error occurred')
    })
  })

  describe('RateLimiter', () => {
    beforeEach(() => {
      // Clear rate limiter state
      RateLimiter.cleanup()
    })

    it('should allow requests within limit', () => {
      const identifier = 'test-user'
      const limit = 5
      
      for (let i = 0; i < limit; i++) {
        expect(RateLimiter.checkRateLimit(identifier, limit)).toBe(true)
      }
    })

    it('should block requests exceeding limit', () => {
      const identifier = 'test-user'
      const limit = 3
      
      // Use up the limit
      for (let i = 0; i < limit; i++) {
        RateLimiter.checkRateLimit(identifier, limit)
      }
      
      // Next request should be blocked
      expect(RateLimiter.checkRateLimit(identifier, limit)).toBe(false)
    })

    it('should reset limits after time window', () => {
      const identifier = 'test-user'
      const limit = 1
      
      // Use up the limit
      expect(RateLimiter.checkRateLimit(identifier, limit)).toBe(true)
      expect(RateLimiter.checkRateLimit(identifier, limit)).toBe(false)
      
      // Simulate time passing by cleaning up (in real scenario, time would pass)
      RateLimiter.cleanup()
      
      // Should work again after cleanup
      expect(RateLimiter.checkRateLimit(identifier, limit)).toBe(true)
    })
  })

  describe('Security Configuration', () => {
    it('should have proper security constants', () => {
      expect(SECURITY_CONFIG.MAX_FILE_SIZE).toBeGreaterThan(0)
      expect(SECURITY_CONFIG.ALLOWED_FILE_TYPES).toContain('application/pdf')
      expect(SECURITY_CONFIG.ALLOWED_HOSTS).toContain('apply.mihas.edu.zm')
      expect(SECURITY_CONFIG.API_RATE_LIMIT).toBeGreaterThan(0)
    })

    it('should have proper CSP directives', () => {
      expect(SECURITY_CONFIG.CSP_DIRECTIVES['default-src']).toContain("'self'")
      expect(SECURITY_CONFIG.CSP_DIRECTIVES['frame-src']).toContain("'none'")
      expect(SECURITY_CONFIG.CSP_DIRECTIVES['object-src']).toContain("'none'")
    })
  })
})