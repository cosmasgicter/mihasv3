import { sanitizeForDisplay } from './sanitize'

// Secure display utilities to prevent XSS
export const secureDisplay = {
  text: (input: string | null | undefined): string => {
    return sanitizeForDisplay(input || '')
  },
  
  html: (input: string | null | undefined): string => {
    if (!input) return ''
    // Remove all HTML tags and dangerous characters
    return input
      .replace(/<[^>]*>/g, '')
      .replace(/[<>\"'&]/g, '')
      .trim()
  },
  
  email: (input: string | null | undefined): string => {
    if (!input) return ''
    return input.toLowerCase().replace(/[<>\"'&]/g, '').trim()
  },
  
  number: (input: number | string | null | undefined): string => {
    if (input === null || input === undefined) return '0'
    const num = Number(input)
    return isFinite(num) ? num.toString() : '0'
  }
}