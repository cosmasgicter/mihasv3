// Security patches and utilities to address vulnerabilities

import { sanitizeForLog, sanitizeHtml, sanitizeUrl, sanitizeFilePath } from './security'

/**
 * Secure code execution wrapper to prevent code injection
 */
export class SecureCodeExecution {
  private static allowedFunctions = new Set([
    'Math.max', 'Math.min', 'Math.round', 'Math.floor', 'Math.ceil',
    'Number', 'String', 'Boolean', 'Array.isArray', 'Object.keys'
  ])

  /**
   * Safely evaluate mathematical expressions without using eval() or Function()
   */
  static evaluateMathExpression(expression: string): number {
    // Only allow basic math operations
    const sanitized = expression.replace(/[^0-9+\-*/.() ]/g, '')
    
    if (!sanitized || !/^[0-9+\-*/.() ]+$/.test(sanitized)) {
      return 0
    }
    
    try {
      // Use safe math parser instead of Function constructor
      return this.parseMathExpression(sanitized)
    } catch (error) {
      return 0
    }
  }

  /**
   * Safe recursive descent parser for math expressions
   */
  private static parseMathExpression(expr: string): number {
    let pos = 0
    const clean = expr.replace(/\s/g, '')
    
    const parseNumber = (): number => {
      let num = ''
      while (pos < clean.length && /[0-9.]/.test(clean[pos])) {
        num += clean[pos++]
      }
      return parseFloat(num) || 0
    }
    
    const parseFactor = (): number => {
      if (clean[pos] === '(') {
        pos++
        const result = parseExpression()
        pos++
        return result
      }
      return parseNumber()
    }
    
    const parseTerm = (): number => {
      let result = parseFactor()
      while (pos < clean.length && (clean[pos] === '*' || clean[pos] === '/')) {
        const op = clean[pos++]
        const right = parseFactor()
        result = op === '*' ? result * right : result / right
      }
      return result
    }
    
    const parseExpression = (): number => {
      let result = parseTerm()
      while (pos < clean.length && (clean[pos] === '+' || clean[pos] === '-')) {
        const op = clean[pos++]
        const right = parseTerm()
        result = op === '+' ? result + right : result - right
      }
      return result
    }
    
    return parseExpression()
  }

  /**
   * Safely parse JSON with size limits
   */
  static parseJSON<T>(jsonString: string, maxSize: number = 1024 * 1024): T | null {
    if (jsonString.length > maxSize) {
      throw new Error('JSON string too large')
    }

    try {
      return JSON.parse(jsonString)
    } catch (error) {
      return null
    }
  }

  /**
   * Validate and sanitize function names
   */
  static isAllowedFunction(functionName: string): boolean {
    return this.allowedFunctions.has(functionName)
  }
}

/**
 * Enhanced input validation
 */
export class InputValidator {
  /**
   * Validate email addresses
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email) && email.length <= 254
  }

  /**
   * Validate phone numbers
   */
  static isValidPhone(phone: string): boolean {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/
    const cleaned = phone.replace(/[\s\-\(\)]/g, '')
    return phoneRegex.test(cleaned) && cleaned.length >= 7 && cleaned.length <= 15
  }

  /**
   * Validate NRC numbers (Zambian format)
   */
  static isValidNRC(nrc: string): boolean {
    const nrcRegex = /^\d{6}\/\d{2}\/\d{1}$/
    return nrcRegex.test(nrc)
  }

  /**
   * Validate file uploads
   */
  static validateFileUpload(file: File, allowedTypes: string[], maxSize: number): string | null {
    if (!file) return 'No file provided'
    
    if (file.size > maxSize) {
      return `File size exceeds ${Math.round(maxSize / 1024 / 1024)}MB limit`
    }

    const fileType = file.type.toLowerCase()
    const fileName = file.name.toLowerCase()
    
    const isAllowedType = allowedTypes.some(type => {
      if (type.startsWith('.')) {
        return fileName.endsWith(type)
      }
      return fileType.startsWith(type.replace('*', ''))
    })

    if (!isAllowedType) {
      return `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`
    }

    // Check for potentially dangerous file extensions
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.com', '.js', '.vbs', '.jar']
    if (dangerousExtensions.some(ext => fileName.endsWith(ext))) {
      return 'File type not allowed for security reasons'
    }

    return null
  }
}

/**
 * Rate limiting utility
 */
export class RateLimiter {
  private static requests = new Map<string, number[]>()

  /**
   * Check if request is within rate limit
   */
  static checkLimit(identifier: string, maxRequests: number = 10, windowMs: number = 60000): boolean {
    const now = Date.now()
    const windowStart = now - windowMs

    if (!this.requests.has(identifier)) {
      this.requests.set(identifier, [])
    }

    const userRequests = this.requests.get(identifier)!
    
    // Remove old requests
    const validRequests = userRequests.filter(timestamp => timestamp > windowStart)
    
    if (validRequests.length >= maxRequests) {
      return false
    }

    validRequests.push(now)
    this.requests.set(identifier, validRequests)
    
    return true
  }

  /**
   * Clear old entries periodically
   */
  static cleanup(): void {
    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000

    for (const [key, timestamps] of this.requests.entries()) {
      const validTimestamps = timestamps.filter(t => t > oneHourAgo)
      if (validTimestamps.length === 0) {
        this.requests.delete(key)
      } else {
        this.requests.set(key, validTimestamps)
      }
    }
  }
}

/**
 * Content Security Policy helper
 */
export class CSPHelper {
  /**
   * Generate CSP header value
   */
  static generateCSP(): string {
    const directives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' ***REMOVED***",
      "frame-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests"
    ]

    return directives.join('; ')
  }
}

/**
 * Session security utilities
 */
export class SessionSecurity {
  /**
   * Generate secure session token
   */
  static generateSessionToken(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
  }

  /**
   * Validate session token format
   */
  static isValidSessionToken(token: string): boolean {
    return /^[a-f0-9]{64}$/.test(token)
  }

  /**
   * Check if session is expired
   */
  static isSessionExpired(timestamp: number, maxAge: number = 24 * 60 * 60 * 1000): boolean {
    return Date.now() - timestamp > maxAge
  }
}

// Initialize cleanup interval
if (typeof window !== 'undefined') {
  setInterval(() => {
    RateLimiter.cleanup()
  }, 5 * 60 * 1000) // Cleanup every 5 minutes
}
