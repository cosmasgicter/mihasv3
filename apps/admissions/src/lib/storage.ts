/**
 * Storage Utilities - Uses R2 via Django API
 * 
 * All storage operations go through the Django /documents/ endpoints
 * via apiClient.request() for proper CSRF and cookie handling.
 */

import { sanitizeForLog } from './security'
import { apiClient } from '@/services/client'

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

type UploadedDocument = {
  id: string
  document_name?: string
  file_url?: string
  document_type?: string
}

async function uploadDocument(
  file: File,
  applicationId: string,
  documentType: string
): Promise<UploadResult> {
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('application_id', applicationId)
    formData.append('document_type', documentType)

    const uploaded = await apiClient.request<UploadedDocument>('/documents/upload/', {
      method: 'POST',
      body: formData
    })

    if (!uploaded?.id || !uploaded.file_url) {
      return {
        success: false,
        error: 'Upload completed without a stored document URL',
      }
    }

    return {
      success: true,
      path: uploaded.id,
      url: uploaded.file_url,
    }
  } catch (error) {
    console.error('Upload error:', { error: sanitizeForLog(error instanceof Error ? error.message : 'Unknown error') })
    const message = error instanceof Error ? error.message : 'Upload failed'
    const lowerMessage = message.toLowerCase()
    return {
      success: false,
      error: message,
      retryable:
        lowerMessage.includes('network') ||
        lowerMessage.includes('timeout') ||
        lowerMessage.includes('failed to fetch') ||
        lowerMessage.includes('load failed'),
    }
  }
}

/**
 * Upload application file via API
 */
export async function uploadApplicationFile(
  file: File,
  userId: string,
  applicationId: string,
  fileType: string
): Promise<UploadResult> {
  void userId
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

    return uploadDocument(file, applicationId, fileType)
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
  void path
  void userId
  try {
    // Validate file
    const validation = validateFile(file, config)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      }
    }

    return {
      success: false,
      error: 'Generic storage upload is not supported by the Django backend without an application ID',
      retryable: false,
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
  void bucket
  try {
    const encodedPath = encodeURIComponent(path)
    await apiClient.request(`/documents/${encodedPath}/`, {
      method: 'DELETE',
    })
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
  void bucket
  try {
    if (/^https?:\/\//.test(path)) {
      return { success: true, url: path }
    }

    const encodedPath = encodeURIComponent(path)
    const result = await apiClient.request<{ url: string }>(`/documents/${encodedPath}/signed-url/`)
    return {
      success: true,
      url: result?.url,
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
  void bucket
  try {
    if (/^https?:\/\//.test(path)) {
      const response = await fetch(path)
      if (!response.ok) {
        return {
          success: false,
          error: `Download failed: ${response.status}`
        }
      }
      return {
        success: true,
        data: await response.blob()
      }
    }

    const encodedPath = encodeURIComponent(path)
    const result = await apiClient.request<string>(`/documents/${encodedPath}/download/`)
    // apiClient returns raw text for non-JSON responses; convert to Blob
    if (result) {
      const blob = new Blob([result])
      return { success: true, data: blob }
    }
    return {
      success: false,
      error: 'Download returned empty response'
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
  void bucket
  try {
    const params = folder ? `?folder=${encodeURIComponent(folder)}` : ''
    const result = await apiClient.request<any[]>(`/documents/${params}`)
    return {
      success: true,
      files: result ?? [],
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
  void bucketName
  return { success: true }
}

/**
 * Get file info via API
 */
export async function getFileInfo(bucket: string, path: string): Promise<{ success: boolean; info?: any; error?: string }> {
  void bucket
  try {
    const encodedPath = encodeURIComponent(path)
    const result = await apiClient.request<Record<string, unknown>>(`/documents/${encodedPath}/info/`)
    return {
      success: true,
      info: result,
    }
  } catch (error) {
    console.error('File info error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get file info'
    }
  }
}
