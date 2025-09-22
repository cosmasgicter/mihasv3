// Secure file storage utilities with path traversal protection
import { sanitizePath } from './security'

export const createSecureFilePath = (fileName: string, folder: string = ''): string => {
  const sanitizedFileName = sanitizePath(fileName)
  const sanitizedFolder = sanitizePath(folder)
  
  if (!sanitizedFileName) {
    throw new Error('Invalid file name')
  }
  
  // Generate timestamp-based path to avoid collisions
  const timestamp = Date.now()
  const randomSuffix = crypto.randomUUID ? crypto.randomUUID().substring(0, 8) : Math.random().toString(36).substring(2, 8)
  
  const securePath = sanitizedFolder 
    ? `${sanitizedFolder}/${timestamp}-${randomSuffix}-${sanitizedFileName}`
    : `${timestamp}-${randomSuffix}-${sanitizedFileName}`
    
  return securePath
}

export const validateFileType = (fileName: string, allowedTypes: string[]): boolean => {
  const extension = fileName.split('.').pop()?.toLowerCase()
  return extension ? allowedTypes.includes(extension) : false
}

export const validateFileSize = (size: number, maxSizeBytes: number = 10 * 1024 * 1024): boolean => {
  return size <= maxSizeBytes
}