import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { sanitizeForLog, sanitizeHtml, sanitizeFilePath } from './security'

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

// Touch target validation utility
export function validateTouchTarget(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  const minSize = 44 // 44px minimum as per Apple Human Interface Guidelines

  return rect.width >= minSize && rect.height >= minSize
}

// Date formatting helper used across the application
export function formatDate(value?: string | number | Date | null): string {
  if (!value) {
    return 'Not available'
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Invalid date'
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

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
  draft: 'bg-gray-100 text-gray-700 border border-gray-200',
  pending: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  pending_review: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  under_review: 'bg-blue-100 text-blue-800 border border-blue-200',
  in_progress: 'bg-blue-100 text-blue-800 border border-blue-200',
  approved: 'bg-green-100 text-green-800 border border-green-200',
  verified: 'bg-green-100 text-green-800 border border-green-200',
  completed: 'bg-green-100 text-green-800 border border-green-200',
  rejected: 'bg-red-100 text-red-800 border border-red-200',
  declined: 'bg-red-100 text-red-800 border border-red-200',
  cancelled: 'bg-red-100 text-red-800 border border-red-200',
  expired: 'bg-slate-200 text-slate-700 border border-slate-300'
}

export function getStatusColor(status?: string | null): string {
  if (!status) {
    return 'bg-gray-100 text-gray-800 border border-gray-200'
  }

  return STATUS_COLOR_MAP[status.toLowerCase()] ?? 'bg-gray-100 text-gray-800 border border-gray-200'
}

// Network status utilities
export function isOnline(): boolean {
  return navigator.onLine
}

export function getConnectionType(): string {
  // @ts-ignore - NetworkInformation API is experimental
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  return connection?.effectiveType || 'unknown'
}

// Debounce utility for performance
export function debounce<T extends (...args: any[]) => any>(
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
export function throttle<T extends (...args: any[]) => any>(
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

// Image compression utility
export function compressImage(
  file: File,
  maxWidth: number = 1920,
  maxHeight: number = 1080,
  quality: number = 0.8
): Promise<File> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const img = new Image()
    
    img.onload = () => {
      // Calculate new dimensions
      let { width, height } = img
      
      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }
      } else {
        if (height > maxHeight) {
          width = (width * maxHeight) / height
          height = maxHeight
        }
      }
      
      canvas.width = width
      canvas.height = height
      
      // Draw and compress
      ctx.drawImage(img, 0, 0, width, height)
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now()
            })
            resolve(compressedFile)
          } else {
            resolve(file)
          }
        },
        file.type,
        quality
      )
    }
    
    img.src = URL.createObjectURL(file)
  })
}

// Performance monitoring utilities
export function measurePerformance(name: string, fn: () => void): number {
  const start = performance.now()
  fn()
  const end = performance.now()
  const duration = end - start
  
  return duration
}

export async function measureAsyncPerformance<T>(
  name: string,
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = performance.now()
  const result = await fn()
  const end = performance.now()
  const duration = end - start
  
  return { result, duration }
}

// Error handling utilities
export function createUserFriendlyError(error: any): string {
  if (typeof error === 'string') return sanitizeHtml(error)
  
  const errorMessages: Record<string, string> = {
    'Network Error': 'Please check your internet connection and try again.',
    'Unauthorized': 'Your session has expired. Please sign in again.',
    'Forbidden': 'You do not have permission to perform this action.',
    'Not Found': 'The requested resource was not found.',
    'Internal Server Error': 'Something went wrong on our end. Please try again later.',
    'Bad Request': 'There was an error with your request. Please check your input.',
    'Timeout': 'The operation took too long. Please try again.',
    'ECONNREFUSED': 'Unable to connect to the server. Please try again later.',
    'NETWORK_ERROR': 'Network connection failed. Please check your internet connection.',
    'FILE_TOO_LARGE': 'The selected file is too large. Please choose a smaller file.',
    'INVALID_FILE_TYPE': 'This file type is not supported. Please choose a different file.',
    'UPLOAD_FAILED': 'File upload failed. Please try again.',
    'COMPRESSION_FAILED': 'Unable to optimize the image. The original file will be used.'
  }
  
  if (error?.message) {
    const message = error.message
    for (const [key, value] of Object.entries(errorMessages)) {
      if (message.includes(key)) {
        return value
      }
    }
    return message
  }
  
  if (error?.code && errorMessages[error.code]) {
    return errorMessages[error.code]
  }
  
  return 'An unexpected error occurred. Please try again.'
}

// Local storage utilities with error handling
export function getLocalStorage(key: string, defaultValue: any = null) {
  try {
    const item = window.localStorage.getItem(key)
    return item ? JSON.parse(item) : defaultValue
  } catch (error) {
    return defaultValue
  }
}

export function setLocalStorage(key: string, value: any): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (error) {
    return false
  }
}

export function removeLocalStorage(key: string): boolean {
  try {
    window.localStorage.removeItem(key)
    return true
  } catch (error) {
    return false
  }
}

// Device detection utilities
export function isMobile(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

export function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent)
}

export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

// Accessibility utilities
export function announceToScreenReader(message: string): void {
  const announcement = document.createElement('div')
  announcement.setAttribute('aria-live', 'polite')
  announcement.setAttribute('aria-atomic', 'true')
  announcement.className = 'sr-only'
  announcement.textContent = sanitizeHtml(message)
  
  document.body.appendChild(announcement)
  
  setTimeout(() => {
    document.body.removeChild(announcement)
  }, 1000)
}

// Focus management
export function trapFocus(element: HTMLElement): () => void {
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  ) as NodeListOf<HTMLElement>
  
  const firstElement = focusableElements[0]
  const lastElement = focusableElements[focusableElements.length - 1]
  
  const handleTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return
    
    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        lastElement.focus()
        e.preventDefault()
      }
    } else {
      if (document.activeElement === lastElement) {
        firstElement.focus()
        e.preventDefault()
      }
    }
  }
  
  element.addEventListener('keydown', handleTabKey)
  firstElement?.focus()
  
  return () => {
    element.removeEventListener('keydown', handleTabKey)
  }
}

// URL utilities
export function isValidUrl(string: string): boolean {
  try {
    new URL(string)
    return true
  } catch (_) {
    return false
  }
}

export function getBaseUrl(): string {
  return `${window.location.protocol}//${window.location.host}`
}

// Animation utilities
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Color utilities
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

// Date utilities
export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  
  if (diffInSeconds < 60) return 'Just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`
  
  return date.toLocaleDateString()
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