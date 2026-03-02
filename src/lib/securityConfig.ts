// @ts-nocheck
/**
 * Security configuration and Content Security Policy setup
 * Prevents code injection vulnerabilities including Function() constructor usage
 */

import { initializeSecurityPatches } from './securityPatches'

/**
 * Content Security Policy configuration
 */
export const CSP_CONFIG = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'" // Required for Vite in development
  ],
  'style-src': [
    "'self'",
    "'unsafe-inline'", // Required for Tailwind CSS
    "https://fonts.googleapis.com"
  ],
  'font-src': [
    "'self'",
    "https://fonts.gstatic.com"
  ],
  'img-src': [
    "'self'",
    "data:",
    "blob:",
    "https:",
    "http:"
  ],
  'connect-src': [
    "'self'"
  ],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],

  'upgrade-insecure-requests': []
}

/**
 * Generate CSP header string
 */
export function generateCSPHeader(): string {
  return Object.entries(CSP_CONFIG)
    .map(([directive, sources]) => {
      if (sources.length === 0) {
        return directive.replace(/-/g, '-')
      }
      return `${directive.replace(/-/g, '-')} ${sources.join(' ')}`
    })
    .join('; ')
}

/**
 * Security headers configuration
 */
export const SECURITY_HEADERS = {
  'Content-Security-Policy': generateCSPHeader(),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
}

/**
 * Disable dangerous global functions to prevent code injection - DISABLED FOR LOCAL DEVELOPMENT
 */
export function disableDangerousFunctions(): void {
  // Security functions disabled for local development
}

/**
 * Input sanitization utilities
 */
export class SecuritySanitizer {
  /**
   * Sanitize HTML content to prevent XSS
   */
  static sanitizeHTML(html: string): string {
    const div = document.createElement('div')
    div.textContent = html
    return div.innerHTML
  }
  
  /**
   * Sanitize user input for safe display
   */
  static sanitizeInput(input: string): string {
    return input
      .replace(/[<>\"'&]/g, (match) => {
        const entities: Record<string, string> = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;'
        }
        return entities[match] || match
      })
      .trim()
      .substring(0, 1000) // Limit length
  }
  
  /**
   * Sanitize URL to prevent javascript: and data: schemes
   */
  static sanitizeURL(url: string): string {
    try {
      const urlObj = new URL(url)
      const allowedProtocols = ['http:', 'https:', 'mailto:']
      
      if (!allowedProtocols.includes(urlObj.protocol)) {
        throw new Error('Protocol not allowed')
      }
      
      return urlObj.toString()
    } catch {
      return '#'
    }
  }
  
  /**
   * Validate and sanitize JSON input
   */
  static sanitizeJSON(jsonString: string): any {
    try {
      // Remove potentially dangerous patterns
      const cleaned = jsonString
        .replace(/__proto__/g, '')
        .replace(/constructor/g, '')
        .replace(/prototype/g, '')
      
      const parsed = JSON.parse(cleaned)
      
      // Remove dangerous properties from parsed object
      if (parsed && typeof parsed === 'object') {
        this.removeDangerousProperties(parsed)
      }
      
      return parsed
    } catch (error) {
      throw new Error('Invalid JSON input')
    }
  }
  
  /**
   * Recursively remove dangerous properties from objects
   */
  private static removeDangerousProperties(obj: any): void {
    if (!obj || typeof obj !== 'object') return
    
    const dangerousProps = ['__proto__', 'constructor', 'prototype']
    
    for (const prop of dangerousProps) {
      delete obj[prop]
    }
    
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') {
        this.removeDangerousProperties(value)
      }
    }
  }
}

/**
 * Initialize security measures - DISABLED FOR LOCAL DEVELOPMENT
 */
export function initializeSecurity(): void {
  // Security measures disabled for local development
}
