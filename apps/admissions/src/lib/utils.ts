import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'


// Re-export centralized date formatting for backward compatibility
export { formatDate, formatTimestamp, formatRelative, toDateInputValue } from './dateFormat'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// File size formatting utility
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Date formatting helper used across the application
// formatDate is now re-exported from ./dateFormat above

export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch (error) {
    return fallback
  }
}

// Consistent status badge styling helper
const STATUS_COLOR_MAP: Record<string, string> = {
  draft: 'bg-muted text-foreground border border-border',
  pending: 'bg-warning/20 text-foreground border border-warning/30',
  pending_review: 'bg-warning/20 text-foreground border border-warning/30',
  under_review: 'bg-info/20 text-foreground border border-info/30',
  in_progress: 'bg-info/20 text-foreground border border-info/30',
  approved: 'bg-success/20 text-foreground border border-success/30',
  verified: 'bg-success/20 text-foreground border border-success/30',
  completed: 'bg-success/20 text-foreground border border-success/30',
  rejected: 'bg-destructive/20 text-foreground border border-destructive/30',
  declined: 'bg-destructive/20 text-foreground border border-destructive/30',
  cancelled: 'bg-destructive/20 text-foreground border border-destructive/30',
  expired: 'bg-muted text-foreground border border-border'
}

export function getStatusColor(status?: string | null): string {
  if (!status) {
    return 'bg-muted text-foreground border border-border'
  }

  return STATUS_COLOR_MAP[status.toLowerCase()] ?? 'bg-muted text-foreground border border-border'
}

// Network status utilities
export function isOnline(): boolean {
  return navigator.onLine
}

// Debounce utility for performance
export function debounce<T extends (...args: never[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

// Throttle utility for performance
export function throttle<T extends (...args: never[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

// Device detection utilities
export function isMobile(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

// Validation utilities
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function isValidPhoneNumber(phone: string): boolean {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/
  return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''))
}

// Copy to clipboard utility
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'absolute'
      textArea.style.left = '-999999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      const success = document.execCommand('copy')
      document.body.removeChild(textArea)
      return success
    }
  } catch (error) {
    return false
  }
}


// ── File helper utilities (merged from src/utils/file-helpers.ts) ──

export interface FileValidationResult {
  isValid: boolean
  error?: string
}

// File validation
export function validateFile(
  file: File,
  allowedTypes: string[],
  maxSize: number
): FileValidationResult {
  if (file.size > maxSize) {
    return {
      isValid: false,
      error: `File size (${formatFileSize(file.size)}) exceeds maximum allowed size (${formatFileSize(maxSize)})`
    }
  }

  const isValidType = allowedTypes.some(type => {
    if (type.startsWith('.')) {
      return file.name.toLowerCase().endsWith(type.toLowerCase())
    } else if (type.includes('*')) {
      const baseType = type.split('/')[0]!
      return file.type.startsWith(baseType)
    } else {
      return file.type === type
    }
  })

  if (!isValidType) {
    return {
      isValid: false,
      error: `File type "${file.type}" is not allowed. Supported types: ${allowedTypes.join(', ')}`
    }
  }

  return { isValid: true }
}
