// @ts-nocheck
// Comprehensive Security Enhancements for MIHAS Application System
// This file centralizes all security configurations and utilities

import DOMPurify from 'dompurify'

// Security Configuration Constants
export const SECURITY_CONFIG = {
  // Allowed hosts for API requests (prevents SSRF)
  ALLOWED_HOSTS: [
    'apply.mihas.edu.zm',
    'mihas.vercel.app',
    'a3ba1959935abd8777e64caee46d1de1.r2.cloudflarestorage.com',
    'localhost',
    '127.0.0.1'
  ],
  
  // File upload restrictions
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_FILE_TYPES: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ],
  
  // Input validation limits
  MAX_STRING_LENGTH: 1000,
  MAX_TEXT_LENGTH: 5000,
  MAX_ARRAY_LENGTH: 100,
  
  // Rate limiting
  API_RATE_LIMIT: 100, // requests per minute
  AUTH_RATE_LIMIT: 10,  // auth attempts per minute
  
  // Session security
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  CSRF_TOKEN_LENGTH: 32,
  
  // Content Security Policy
  CSP_DIRECTIVES: {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", 'https://challenges.cloudflare.com'],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com'],
    'img-src': ["'self'", 'data:', 'https:', 'blob:'],
    'connect-src': ["'self'", '***REMOVED***', '***REMOVED***'],
    'frame-src': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"]
  }
} as const

// Enhanced Input Sanitization
export class SecuritySanitizer {
  private static readonly HTML_SANITIZER_CONFIG = {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_DOM_IMPORT: false,
    SANITIZE_DOM: true,
    WHOLE_DOCUMENT: false,
    IN_PLACE: false
  }

  static sanitizeHtml(input: string): string {
    if (typeof input !== 'string') {
      return ''
    }
    
    return DOMPurify.sanitize(input, this.HTML_SANITIZER_CONFIG)
  }

  static sanitizeString(input: string, maxLength: number = SECURITY_CONFIG.MAX_STRING_LENGTH): string {
    if (typeof input !== 'string') {
      return ''
    }
    
    return input
      .replace(/[<>\"'`\\]/g, '') // Remove potentially dangerous characters
      .trim()
      .substring(0, maxLength)
  }

  static sanitizeFilename(filename: string): string {
    if (typeof filename !== 'string') {
      return 'file'
    }
    
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Only allow safe characters
      .replace(/^\.+/, '') // Remove leading dots
      .substring(0, 255) // Limit length
  }

  static sanitizeUrl(url: string): string | null {
    try {
      const urlObj = new URL(url)
      
      // Check if host is allowed
      if (!SECURITY_CONFIG.ALLOWED_HOSTS.includes(urlObj.hostname)) {
        return null
      }
      
      // Only allow HTTPS in production
      if (process.env.NODE_ENV === 'production' && urlObj.protocol !== 'https:') {
        return null
      }
      
      return urlObj.toString()
    } catch {
      return null
    }
  }

  static sanitizeObject(obj: any, maxDepth: number = 5): any {
    if (maxDepth <= 0) {
      return null
    }
    
    if (obj === null || obj === undefined) {
      return obj
    }
    
    if (typeof obj === 'string') {
      return this.sanitizeString(obj)
    }
    
    if (typeof obj === 'number') {
      return isFinite(obj) ? obj : 0
    }
    
    if (typeof obj === 'boolean') {
      return obj
    }
    
    if (Array.isArray(obj)) {
      return obj
        .slice(0, SECURITY_CONFIG.MAX_ARRAY_LENGTH)
        .map(item => this.sanitizeObject(item, maxDepth - 1))
    }
    
    if (typeof obj === 'object') {
      const sanitized: Record<string, any> = {}
      const allowedKeys = Object.keys(obj).slice(0, 50) // Limit object keys
      
      for (const key of allowedKeys) {
        const sanitizedKey = this.sanitizeString(key, 100)
        if (sanitizedKey) {
          sanitized[sanitizedKey] = this.sanitizeObject(obj[key], maxDepth - 1)
        }
      }
      
      return sanitized
    }
    
    return null
  }
}

// URL Validation for SSRF Prevention
export class UrlValidator {
  static isValidApiUrl(url: string): boolean {
    try {
      const urlObj = new URL(url)
      return SECURITY_CONFIG.ALLOWED_HOSTS.includes(urlObj.hostname)
    } catch {
      return false
    }
  }

  static validateAndSanitizeUrl(url: string): string {
    const sanitized = SecuritySanitizer.sanitizeUrl(url)
    if (!sanitized) {
      throw new Error('Invalid or unsafe URL')
    }
    return sanitized
  }
}

// File Upload Security
export class FileUploadSecurity {
  static validateFile(file: File): { valid: boolean; error?: string } {
    // Check file size
    if (file.size > SECURITY_CONFIG.MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File size exceeds ${SECURITY_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB limit`
      }
    }
    
    // Check file type
    if (!SECURITY_CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: 'File type not allowed'
      }
    }
    
    // Check filename
    const sanitizedName = SecuritySanitizer.sanitizeFilename(file.name)
    if (!sanitizedName || sanitizedName.length < 1) {
      return {
        valid: false,
        error: 'Invalid filename'
      }
    }
    
    return { valid: true }
  }

  static sanitizeFile(file: File): File {
    const sanitizedName = SecuritySanitizer.sanitizeFilename(file.name)
    return new File([file], sanitizedName, {
      type: file.type,
      lastModified: file.lastModified
    })
  }
}

// Safe Code Execution (replaces eval usage)
export class SafeCodeExecution {
  private static readonly ALLOWED_OPERATORS = ['>=', '<=', '>', '<', '==', '!=', '+', '-', '*', '/', '%']
  
  static evaluateCondition(left: any, operator: string, right: any): boolean {
    if (!this.ALLOWED_OPERATORS.includes(operator)) {
      throw new Error('Invalid operator')
    }
    
    const leftNum = Number(left)
    const rightNum = Number(right)
    
    if (isNaN(leftNum) || isNaN(rightNum)) {
      // String comparison for non-numeric values
      const leftStr = String(left)
      const rightStr = String(right)
      
      switch (operator) {
        case '==': return leftStr === rightStr
        case '!=': return leftStr !== rightStr
        case '>': return leftStr > rightStr
        case '<': return leftStr < rightStr
        case '>=': return leftStr >= rightStr
        case '<=': return leftStr <= rightStr
        default: return false
      }
    }
    
    // Numeric comparison
    switch (operator) {
      case '>=': return leftNum >= rightNum
      case '<=': return leftNum <= rightNum
      case '>': return leftNum > rightNum
      case '<': return leftNum < rightNum
      case '==': return leftNum === rightNum
      case '!=': return leftNum !== rightNum
      case '+': return leftNum + rightNum
      case '-': return leftNum - rightNum
      case '*': return leftNum * rightNum
      case '/': return rightNum !== 0 ? leftNum / rightNum : 0
      case '%': return rightNum !== 0 ? leftNum % rightNum : 0
      default: return false
    }
  }
  
  static safeArithmeticEvaluation(expression: string): number {
    // Only allow basic arithmetic with numbers
    const sanitized = expression.replace(/[^0-9+\-*/().]/g, '')
    if (sanitized !== expression) {
      throw new Error('Invalid arithmetic expression')
    }
    
    try {
      // Use Function constructor instead of eval for safer evaluation
      return Function('"use strict"; return (' + sanitized + ')')()
    } catch {
      throw new Error('Failed to evaluate expression')
    }
  }
}

// Enhanced Error Handling
export class SecureErrorHandler {
  static sanitizeError(error: any): string {
    if (typeof error === 'string') {
      return SecuritySanitizer.sanitizeString(error, 500)
    }
    
    if (error instanceof Error) {
      return SecuritySanitizer.sanitizeString(error.message, 500)
    }
    
    return 'An error occurred'
  }
  
  static logSecureError(error: any, context?: Record<string, any>): void {
    const sanitizedError = this.sanitizeError(error)
    const sanitizedContext = context ? SecuritySanitizer.sanitizeObject(context, 3) : {}
    
    console.error('Secure Error:', {
      message: sanitizedError,
      context: sanitizedContext,
      timestamp: new Date().toISOString()
    })
  }
}

// Content Security Policy Generator
export class CSPGenerator {
  static generateCSP(): string {
    const directives = Object.entries(SECURITY_CONFIG.CSP_DIRECTIVES)
      .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
      .join('; ')
    
    return directives
  }
  
  static getSecurityHeaders(): Record<string, string> {
    return {
      'Content-Security-Policy': this.generateCSP(),
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
    }
  }
}

// Rate Limiting
export class RateLimiter {
  private static requests = new Map<string, { count: number; resetTime: number }>()
  
  static checkRateLimit(identifier: string, limit: number = SECURITY_CONFIG.API_RATE_LIMIT): boolean {
    const now = Date.now()
    const windowMs = 60 * 1000 // 1 minute window
    
    const record = this.requests.get(identifier)
    
    if (!record || now > record.resetTime) {
      this.requests.set(identifier, { count: 1, resetTime: now + windowMs })
      return true
    }
    
    if (record.count >= limit) {
      return false
    }
    
    record.count++
    return true
  }
  
  static cleanup(): void {
    const now = Date.now()
    for (const [key, record] of this.requests.entries()) {
      if (now > record.resetTime) {
        this.requests.delete(key)
      }
    }
  }
}

// Initialize rate limiter cleanup
if (typeof window !== 'undefined') {
  setInterval(() => {
    RateLimiter.cleanup()
  }, 60000) // Cleanup every minute
}

// Export all security utilities
export {
  SecuritySanitizer as sanitizer,
  UrlValidator as urlValidator,
  FileUploadSecurity as fileUploadSecurity,
  SafeCodeExecution as safeCodeExecution,
  SecureErrorHandler as secureErrorHandler,
  CSPGenerator as cspGenerator,
  RateLimiter as rateLimiter
}

// Legacy compatibility exports
export const sanitizeForLog = SecuritySanitizer.sanitizeString
export const sanitizeHtml = SecuritySanitizer.sanitizeHtml
export const sanitizeFilePath = SecuritySanitizer.sanitizeFilename