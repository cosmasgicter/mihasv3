import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { sanitizeForLog, sanitizeHtml, sanitizeFilePath } from './security'


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

// Touch target validation utility
export function validateTouchTarget(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  const minSize = 44 // 44px minimum as per Apple Human Interface Guidelines

  return rect.width >= minSize && rect.height >= minSize
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
  pending: 'bg-yellow-200 text-yellow-900 border border-yellow-300',
  pending_review: 'bg-yellow-200 text-yellow-900 border border-yellow-300',
  under_review: 'bg-blue-200 text-blue-900 border border-blue-300',
  in_progress: 'bg-blue-200 text-blue-900 border border-blue-300',
  approved: 'bg-green-200 text-green-900 border border-green-300',
  verified: 'bg-green-200 text-green-900 border border-green-300',
  completed: 'bg-green-200 text-green-900 border border-green-300',
  rejected: 'bg-red-200 text-red-900 border border-red-300',
  declined: 'bg-red-200 text-red-900 border border-red-300',
  cancelled: 'bg-red-200 text-red-900 border border-red-300',
  expired: 'bg-slate-300 text-slate-900 border border-slate-400'
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
      const baseType = type.split('/')[0]
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

// Generate unique filename to prevent conflicts
export function generateUniqueFilename(originalName: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const extension = originalName.substring(originalName.lastIndexOf('.'))
  const nameWithoutExtension = originalName.substring(0, originalName.lastIndexOf('.'))
  return `${nameWithoutExtension}_${timestamp}_${random}${extension}`
}

// Create thumbnail/preview for images
export function createImagePreview(file: File, maxSize: number = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File is not an image'))
      return
    }

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      let { width, height } = img
      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width
          width = maxSize
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height
          height = maxSize
        }
      }
      canvas.width = width
      canvas.height = height
      ctx?.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }

    img.onerror = () => reject(new Error('Failed to create preview'))
    img.src = URL.createObjectURL(file)
  })
}

// Extract text from images using OCR (basic implementation)
export async function extractTextFromImage(file: File): Promise<string> {
  try {
    return Promise.resolve('OCR extraction would be implemented here')
  } catch (error) {
    throw new Error('Failed to extract text from image')
  }
}

// File type detection utilities
export function getFileCategory(file: File): 'image' | 'document' | 'video' | 'audio' | 'other' {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  if (
    file.type.includes('pdf') ||
    file.type.includes('doc') ||
    file.type.includes('text') ||
    file.type.includes('spreadsheet')
  ) {
    return 'document'
  }
  return 'other'
}

// Security: Scan file for potential issues
export function validateFileForSecurity(file: File): FileValidationResult {
  const dangerousExtensions = [
    '.exe', '.bat', '.cmd', '.com', '.scr', '.vbs', '.js', '.jar',
    '.app', '.deb', '.dmg', '.pkg', '.rpm'
  ]

  const fileName = file.name.toLowerCase()
  const isDangerous = dangerousExtensions.some(ext => fileName.endsWith(ext))

  if (isDangerous) {
    return { isValid: false, error: 'File type not allowed for security reasons' }
  }

  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return { isValid: false, error: 'Invalid file name' }
  }

  return { isValid: true }
}

// Utility to convert File to base64 for API uploads
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1]
        resolve(base64)
      } else {
        reject(new Error('Failed to convert file to base64'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
  })
}

// Batch file operations
export async function processFilesInBatch<T>(
  files: File[],
  processor: (file: File) => Promise<T>,
  concurrency: number = 3
): Promise<T[]> {
  const results: T[] = []
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(processor))
    results.push(...batchResults)
  }
  return results
}