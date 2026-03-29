/**
 * Storage Utilities - Uses R2 via API
 * 
 * MIGRATION COMPLETE: Legacy storage -> R2
 * All storage operations now go through /api/documents endpoint
 */

import { sanitizeForLog } from './security'
import { fileToBase64 } from '@/lib/utils'

export interface UploadResult {
  success: boolean
  url?: string
  path?: string
  error?: string
  retryable?: boolean
  statusCode?: number
}

export interface StorageConfig {
  bucket: string
  maxFileSize: number // in bytes
  allowedTypes: readonly string[]
}

export const STORAGE_CONFIGS = {
  documents: {
    bucket: 'app_docs',
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: [
      'image/jpeg',
      'image/png',
      'image/jpg',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  },
  applicationDocuments: {
    bucket: 'app_docs',
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: [
      'image/jpeg',
      'image/png',
      'image/jpg',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  },
  appDocs: {
    bucket: 'app_docs',
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: [
      'image/jpeg',
      'image/png',
      'image/jpg',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  }
} as const

/**
 * Upload application file via API
 */
export async function uploadApplicationFile(
  file: File,
  userId: string,
  applicationId: string,
  fileType: string
): Promise<UploadResult> {
  try {
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return {
        success: false,
        error: 'File size must be less than 10MB',
        retryable: false,
      }
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
    if (!allowedTypes.includes(file.type)) {
      return {
        success: false,
        error: 'Only PDF, JPG, JPEG, and PNG files are allowed',
        retryable: false,
      }
    }

    const fileData = await fileToBase64(file)

    const response = await fetch('/api/documents?action=upload', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        file: fileData,
        fileName: file.name,
        contentType: file.type,
        applicationId,
        userId,
        documentType: fileType
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const statusCode = response.status
      const retryable = [408, 425, 429, 502, 503, 504].includes(statusCode)
      return {
        success: false,
        error: errorData.error || `Upload failed: ${response.status}`,
        retryable,
        statusCode,
      }
    }

    const data = await response.json()
    const payload = data?.data ?? data
    
    return {
      success: true,
      path: payload.path,
      url: payload.url
    }
  } catch (error) {
    console.error('Upload error:', error)
    const message = error instanceof Error ? error.message : 'Upload failed'
    const lowerMessage = message.toLowerCase()
    const retryable =
      lowerMessage.includes('network') ||
      lowerMessage.includes('timeout') ||
      lowerMessage.includes('failed to fetch') ||
      lowerMessage.includes('load failed')
    return {
      success: false,
      error: message,
      retryable,
    }
  }
}

export function validateFile(file: File, config: StorageConfig): { valid: boolean; error?: string } {
  if (file.size > config.maxFileSize) {
    return {
      valid: false,
      error: `File size exceeds ${config.maxFileSize / (1024 * 1024)}MB limit`
    }
  }

  if (!config.allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} is not allowed. Allowed types: ${config.allowedTypes.join(', ')}`
    }
  }

  return { valid: true }
}

/**
 * Simple file validation for application uploads
 */
export function validateApplicationFile(file: File): { valid: boolean; error?: string } {
  if (file.size > 10 * 1024 * 1024) {
    return {
      valid: false,
      error: 'File size must be less than 10MB'
    }
  }

  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Only PDF, JPG, JPEG, and PNG files are allowed'
    }
  }

  return { valid: true }
}

/**
 * Upload file via API
 */
export async function uploadFile(
  file: File,
  config: StorageConfig,
  path?: string,
  userId?: string
): Promise<UploadResult> {
  try {
    // Validate file
    const validation = validateFile(file, config)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      }
    }

    const fileData = await fileToBase64(file)

    const response = await fetch('/api/documents?action=upload', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        file: fileData,
        fileName: file.name,
        contentType: file.type,
        documentType: path || 'document'
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('Storage upload error:', { error: sanitizeForLog(errorData.error || 'Upload failed') })
      return {
        success: false,
        error: errorData.error || 'Upload failed'
      }
    }

    const data = await response.json()
    const payload = data?.data ?? data
    
    return {
      success: true,
      path: payload.path,
      url: payload.url
    }
  } catch (error) {
    console.error('Upload error:', { error: sanitizeForLog(error instanceof Error ? error.message : 'Unknown error') })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed'
    }
  }
}

/**
 * Delete file via API
 */
export async function deleteFile(bucket: string, path: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/documents?action=delete&path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
      credentials: 'include'
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('Storage delete error:', { error: sanitizeForLog(errorData.error || 'Delete failed') })
      return {
        success: false,
        error: errorData.error || 'Delete failed'
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Delete error:', { error: sanitizeForLog(error instanceof Error ? error.message : 'Unknown error') })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed'
    }
  }
}

/**
 * Get signed URL for file via API
 */
export async function getFileUrl(bucket: string, path: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const response = await fetch(`/api/documents?action=url&path=${encodeURIComponent(path)}`, {
      credentials: 'include'
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: errorData.error || 'Failed to get URL'
      }
    }

    const data = await response.json()
    return {
      success: true,
      url: data.url
    }
  } catch (error) {
    console.error('Get URL error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get URL'
    }
  }
}

/**
 * Download file via API
 */
export async function downloadFile(bucket: string, path: string): Promise<{ success: boolean; data?: Blob; error?: string }> {
  try {
    const response = await fetch(`/api/documents?action=download&path=${encodeURIComponent(path)}`, {
      credentials: 'include'
    })

    if (!response.ok) {
      return {
        success: false,
        error: `Download failed: ${response.status}`
      }
    }

    const blob = await response.blob()
    return {
      success: true,
      data: blob
    }
  } catch (error) {
    console.error('Download error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Download failed'
    }
  }
}

/**
 * List files via API
 */
export async function listFiles(bucket: string, folder?: string): Promise<{ success: boolean; files?: any[]; error?: string }> {
  try {
    const params = new URLSearchParams({ action: 'list' })
    if (folder) params.append('folder', folder)
    
    const response = await fetch(`/api/documents?${params}`, {
      credentials: 'include'
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: errorData.error || 'List failed'
      }
    }

    const data = await response.json()
    return {
      success: true,
      files: data.files || []
    }
  } catch (error) {
    console.error('List error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'List failed'
    }
  }
}

/**
 * Check if bucket exists - always returns true since R2 bucket is pre-configured
 */
export async function ensureBucketExists(bucketName: string): Promise<{ success: boolean; error?: string }> {
  // R2 bucket is pre-configured, no need to create
  return { success: true }
}

/**
 * Get file info via API
 */
export async function getFileInfo(bucket: string, path: string): Promise<{ success: boolean; info?: any; error?: string }> {
  try {
    const response = await fetch(`/api/documents?action=info&path=${encodeURIComponent(path)}`, {
      credentials: 'include'
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: errorData.error || 'Failed to get file info'
      }
    }

    const data = await response.json()
    return {
      success: true,
      info: data.info
    }
  } catch (error) {
    console.error('File info error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get file info'
    }
  }
}
