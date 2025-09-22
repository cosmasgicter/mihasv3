import { supabase } from './supabase'
import { sanitizeForLog } from './security'

export interface UploadResult {
  success: boolean
  url?: string
  path?: string
  error?: string
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

// Simple upload function for application wizard
export async function uploadApplicationFile(
  file: File,
  userId: string,
  applicationId: string,
  fileType: string
): Promise<UploadResult> {
  try {
    console.log(`Starting upload for ${fileType}:`, file.name, `(${file.size} bytes)`)
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return {
        success: false,
        error: 'File size must be less than 10MB'
      }
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
    if (!allowedTypes.includes(file.type)) {
      return {
        success: false,
        error: 'Only PDF, JPG, JPEG, and PNG files are allowed'
      }
    }

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('Auth error during upload:', authError)
      return {
        success: false,
        error: 'Please sign in again to upload files'
      }
    }

    // Generate filename with better sanitization
    const timestamp = Date.now()
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const fileName = `${userId}/${applicationId}/${fileType}/${timestamp}-${sanitizedFileName}`
    
    console.log('Generated filename:', fileName)

    // Try uploading to available buckets
    const buckets = ['app_docs', 'documents', 'application-documents']
    let uploadError: any = null
    let usedBucket = ''
    let uploadData: any = null

    for (const bucket of buckets) {
      console.log('Attempting upload to bucket:', { bucket: sanitizeForLog(bucket) })
      
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, {
          contentType: file.type,
          upsert: true,
          duplex: 'half'
        })

      if (!error && data) {
        usedBucket = bucket
        uploadData = data
        console.log(`Upload successful to bucket: ${bucket}`, data.path)
        break
      } else {
        console.warn(`Upload failed to bucket ${bucket}:`, error)
        uploadError = error
      }
    }

    if (!usedBucket || !uploadData) {
      console.error('All bucket uploads failed:', uploadError)
      return {
        success: false,
        error: uploadError?.message || 'Upload failed - no available storage buckets'
      }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(usedBucket)
      .getPublicUrl(uploadData.path)

    console.log('Upload completed successfully:', urlData.publicUrl)
    
    return {
      success: true,
      path: uploadData.path,
      url: urlData.publicUrl
    }
  } catch (error) {
    console.error('Upload error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed'
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

// Simple file validation for application uploads
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

    // Get current user if not provided
    const currentUserId = userId || (await supabase.auth.getUser()).data.user?.id
    if (!currentUserId) {
      return {
        success: false,
        error: 'User not authenticated'
      }
    }

    // Generate unique filename with user folder structure
    const fileExtension = file.name.split('.').pop()
    const timestamp = Date.now()
    const randomString = Math.random().toString(36).substring(2)
    const fileName = path || `${currentUserId}/${timestamp}-${randomString}.${fileExtension}`

    // Try multiple buckets in order of preference
    const buckets = ['app_docs', 'documents', 'application-documents']
    let uploadError
    let usedBucket = ''
    let uploadData

    for (const bucket of buckets) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, {
          contentType: file.type,
          upsert: true
        })

      if (!error) {
        usedBucket = bucket
        uploadData = data
        break
      }
      uploadError = error
    }

    if (!usedBucket) {
      console.error('Storage upload error:', { error: sanitizeForLog(uploadError?.message || 'No available buckets') })
      return {
        success: false,
        error: uploadError?.message || 'Upload failed - no available storage buckets'
      }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(usedBucket)
      .getPublicUrl(uploadData.path)

    return {
      success: true,
      path: uploadData.path,
      url: urlData.publicUrl
    }
  } catch (error) {
    console.error('Upload error:', { error: sanitizeForLog(error instanceof Error ? error.message : 'Unknown error') })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed'
    }
  }
}

export async function deleteFile(bucket: string, path: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([path])

    if (error) {
      console.error('Storage delete error:', { error: sanitizeForLog(error.message || 'Unknown error') })
      return {
        success: false,
        error: error.message
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

export async function getFileUrl(bucket: string, path: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(path)

    return {
      success: true,
      url: data.publicUrl
    }
  } catch (error) {
    console.error('Get URL error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get URL'
    }
  }
}

export async function downloadFile(bucket: string, path: string): Promise<{ success: boolean; data?: Blob; error?: string }> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(path)

    if (error) {
      console.error('Storage download error:', error)
      return {
        success: false,
        error: error.message
      }
    }

    return {
      success: true,
      data
    }
  } catch (error) {
    console.error('Download error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Download failed'
    }
  }
}

export async function listFiles(bucket: string, folder?: string): Promise<{ success: boolean; files?: any[]; error?: string }> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folder)

    if (error) {
      console.error('Storage list error:', error)
      return {
        success: false,
        error: error.message
      }
    }

    return {
      success: true,
      files: data
    }
  } catch (error) {
    console.error('List error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'List failed'
    }
  }
}

// Helper function to check if bucket exists and create if needed
export async function ensureBucketExists(bucketName: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Try to get bucket info
    const { data: buckets, error: listError } = await supabase.storage.listBuckets()
    
    if (listError) {
      return { success: false, error: listError.message }
    }

    const bucketExists = buckets.some(bucket => bucket.name === bucketName)
    
    if (!bucketExists) {
      // Create bucket if it doesn't exist
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true,
        allowedMimeTypes: [...STORAGE_CONFIGS.appDocs.allowedTypes],
        fileSizeLimit: STORAGE_CONFIGS.appDocs.maxFileSize
      })
      
      if (createError) {
        return { success: false, error: createError.message }
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Bucket check error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check bucket'
    }
  }
}

// Helper function to get file info
export async function getFileInfo(bucket: string, path: string): Promise<{ success: boolean; info?: any; error?: string }> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(path.split('/').slice(0, -1).join('/'), {
        search: path.split('/').pop()
      })

    if (error) {
      return { success: false, error: error.message }
    }

    const fileInfo = data.find(file => file.name === path.split('/').pop())
    
    return {
      success: true,
      info: fileInfo
    }
  } catch (error) {
    console.error('File info error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get file info'
    }
  }
}