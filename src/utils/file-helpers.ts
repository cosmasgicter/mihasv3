// File helper utilities for compression, validation, and processing

export interface FileValidationResult {
  isValid: boolean
  error?: string
}

// Image compression function
export async function compressImage(
  file: File, 
  quality: number = 0.8,
  maxWidth: number = 1920,
  maxHeight: number = 1920
): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()
    
    img.onload = () => {
      // Calculate new dimensions while maintaining aspect ratio
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
      ctx?.drawImage(img, 0, 0, width, height)
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now()
            })
            resolve(compressedFile)
          } else {
            reject(new Error('Failed to compress image'))
          }
        },
        file.type,
        quality
      )
    }
    
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

// File validation
export function validateFile(
  file: File, 
  allowedTypes: string[], 
  maxSize: number
): FileValidationResult {
  // Check file size
  if (file.size > maxSize) {
    return {
      isValid: false,
      error: `File size (${formatFileSize(file.size)}) exceeds maximum allowed size (${formatFileSize(maxSize)})`
    }
  }
  
  // Check file type
  const isValidType = allowedTypes.some(type => {
    if (type.startsWith('.')) {
      // Extension check
      return file.name.toLowerCase().endsWith(type.toLowerCase())
    } else if (type.includes('*')) {
      // MIME type wildcard check
      const baseType = type.split('/')[0]
      return file.type.startsWith(baseType)
    } else {
      // Exact MIME type check
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

// Format file size for display
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
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
      // Calculate thumbnail dimensions
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
  // This would integrate with Tesseract.js or similar OCR library
  // For now, return a placeholder implementation
  
  try {
    // In a real implementation, you would use:
    // import Tesseract from 'tesseract.js'
    // const { data: { text } } = await Tesseract.recognize(file, 'eng')
    // return text
    
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
  // Basic security checks
  const dangerousExtensions = [
    '.exe', '.bat', '.cmd', '.com', '.scr', '.vbs', '.js', '.jar',
    '.app', '.deb', '.dmg', '.pkg', '.rpm'
  ]
  
  const fileName = file.name.toLowerCase()
  const isDangerous = dangerousExtensions.some(ext => fileName.endsWith(ext))
  
  if (isDangerous) {
    return {
      isValid: false,
      error: 'File type not allowed for security reasons'
    }
  }
  
  // Check for suspicious file names
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return {
      isValid: false,
      error: 'Invalid file name'
    }
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
        // Remove data URL prefix to get just the base64
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
