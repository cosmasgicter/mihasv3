// Centralized security utilities for MIHAS/KATC application system
import { sanitizeText, sanitizeForLog } from './sanitize'
import { sanitizeHtml } from './security'

/** Recursively sanitize all string values in an object */
function sanitizeObject<T>(data: T): T {
  if (data === null || data === undefined) return data
  if (typeof data === 'string') return sanitizeText(data) as unknown as T
  if (typeof data !== 'object') return data
  if (Array.isArray(data)) return data.map(item => sanitizeObject(item)) as unknown as T

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    result[key] = sanitizeObject(value)
  }
  return result as T
}

// Input validation with security checks
export const validateAndSanitizeInput = (input: unknown, type: 'text' | 'email' | 'number' | 'html' = 'text'): string => {
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
      return sanitizeText(String(input))
  }
}

// Secure logging wrapper
export const secureLog = (level: 'info' | 'warn' | 'error', message: string, data?: unknown): void => {
  const sanitizedMessage = sanitizeForLog(message)
  const sanitizedData = data ? sanitizeForLog(data) : undefined
  
  switch (level) {
    case 'info':
      break
    case 'warn':
      break
    case 'error':
      console.error(sanitizedMessage, sanitizedData)
      break
  }
}

// Application-specific sanitization
export const sanitizeApplicationData = (data: Record<string, unknown>): Record<string, unknown> => {
  return sanitizeObject(data)
}

// Safe error handling
export const createSafeError = (message: string, code?: string): Error => {
  const error = new Error(sanitizeText(message))
  if (code) {
    (error as Error & { code: string }).code = sanitizeText(code)
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