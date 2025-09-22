// Centralized security utilities for MIHAS/KATC application system
import { sanitizeText, sanitizeForLog, sanitizeHtml, sanitizeObject } from './sanitize'

// Input validation with security checks
export const validateAndSanitizeInput = (input: any, type: 'text' | 'email' | 'number' | 'html' = 'text'): string => {
  if (input === null || input === undefined) return ''
  
  switch (type) {
    case 'email':
      const email = String(input).toLowerCase().trim()
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      return emailRegex.test(email) ? email : ''
    
    case 'number':
      const num = Number(input)
      return isFinite(num) ? String(num) : '0'
    
    case 'html':
      return sanitizeHtml(String(input))
    
    default:
      return sanitizeText(input)
  }
}

// Secure logging wrapper
export const secureLog = (level: 'info' | 'warn' | 'error', message: string, data?: any): void => {
  const sanitizedMessage = sanitizeForLog(message)
  const sanitizedData = data ? sanitizeForLog(data) : undefined
  
  switch (level) {
    case 'info':
      console.info(sanitizedMessage, sanitizedData)
      break
    case 'warn':
      console.warn(sanitizedMessage, sanitizedData)
      break
    case 'error':
      console.error(sanitizedMessage, sanitizedData)
      break
  }
}

// Application-specific sanitization
export const sanitizeApplicationData = (data: any): any => {
  const allowedKeys = [
    'full_name', 'email', 'phone', 'program', 'status', 'notes',
    'grade_subject', 'grade_value', 'institution_name'
  ]
  
  return sanitizeObject(data)
}

// Safe error handling
export const createSafeError = (message: string, code?: string): Error => {
  const error = new Error(sanitizeText(message))
  if (code) {
    (error as any).code = sanitizeText(code)
  }
  return error
}

// Content Security Policy nonce generation
export const generateCSPNonce = (): string => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(16)
    crypto.getRandomValues(array)
    return btoa(String.fromCharCode(...array))
  }
  return btoa(Math.random().toString()).substring(0, 16)
}