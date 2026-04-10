import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'

import { importWithChunkRecovery } from '@/lib/lazyImportRecovery'
import { sanitizeForLog } from '@/lib/security'
import { apiClient } from '@/services/client'

export const MAX_FILE_SIZE = 10 * 1024 * 1024
export const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'] as const
export const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'] as const
export const LARGE_FILE_THRESHOLD = 1 * 1024 * 1024 // 1MB — show progress bar above this
const MAX_UPLOAD_RETRIES = 1
const RETRY_DELAY_MS = 1200

export type ApplicationFileType = 'result_slip' | 'extra_kyc'

export interface UseApplicationFileUploadsOptions {
  userId?: string | null
  applicationId: string | null
  onValidationError?: (message: string) => void
  onValidationClear?: () => void
}

export interface UseApplicationFileUploadsResult {
  resultSlipFile: File | null
  extraKycFile: File | null
  uploading: boolean
  uploadProgress: Record<string, number>
  uploadedFiles: Record<string, boolean>
  handleResultSlipUpload: (event: ChangeEvent<HTMLInputElement>, onUploadComplete?: (file: File, url: string) => void) => void
  handleExtraKycUpload: (event: ChangeEvent<HTMLInputElement>, onUploadComplete?: (file: File, url: string) => void) => void
  /** File-based handlers for canonical FileUpload component (react-dropzone) */
  handleResultSlipFile: (file: File | null) => void
  handleExtraKycFile: (file: File | null) => void
  markUploadedFile: (fileType: ApplicationFileType, uploaded: boolean) => void
  startUpload: (file: File, fileType: ApplicationFileType) => Promise<string>
  trackUploadTask: <T>(task: () => Promise<T>) => Promise<T>
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function isAllowedFileType(type: string): type is typeof ALLOWED_TYPES[number] {
  return (ALLOWED_TYPES as readonly string[]).includes(type)
}

function hasAllowedExtension(fileName: string): boolean {
  const lowerName = fileName.toLowerCase()
  return (ALLOWED_EXTENSIONS as readonly string[]).some(ext => lowerName.endsWith(ext))
}

export function isAuthError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AuthenticationError') {
    return true
  }
  const status = (error as { status?: number })?.status
  return status === 401 || status === 403
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function verifySessionWithRetry(): Promise<boolean> {
  try {
    const result = await apiClient.request<{ user?: unknown }>('/auth/session/')
    return !!result?.user
  } catch (error) {
    if (isAuthError(error)) {
      await delay(1000)
      try {
        const retryResult = await apiClient.request<{ user?: unknown }>('/auth/session/')
        return !!retryResult?.user
      } catch (retryError) {
        if (isAuthError(retryError)) {
          throw new Error('Your session has expired. Please sign in again to continue uploading.')
        }
        // Network error on retry — proceed with upload
        return true
      }
    }
    // Network error (not auth) — proceed with upload
    return true
  }
}

function isRetryableUploadError(error: unknown): boolean {
  const explicitRetryable = (error as { retryable?: unknown })?.retryable
  if (typeof explicitRetryable === 'boolean') {
    return explicitRetryable
  }

  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('failed to fetch') ||
    message.includes('408') ||
    message.includes('425') ||
    message.includes('429') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504')
  )
}

export function useApplicationFileUploads({
  userId,
  applicationId,
  onValidationError,
  onValidationClear
}: UseApplicationFileUploadsOptions): UseApplicationFileUploadsResult {
  const [resultSlipFile, setResultSlipFile] = useState<File | null>(null)
  const [extraKycFile, setExtraKycFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, boolean>>({})
  const [activeTasks, setActiveTasks] = useState(0)
  const progressCleanupTimeouts = useRef<Record<string, NodeJS.Timeout | undefined>>({})
  const uploadPromises = useRef<Record<string, Promise<string> | null>>({})

  const uploading = activeTasks > 0

  const incrementActiveTasks = useCallback(() => {
    setActiveTasks(prev => prev + 1)
  }, [])

  const decrementActiveTasks = useCallback(() => {
    setActiveTasks(prev => (prev > 0 ? prev - 1 : 0))
  }, [])

  const clearProgressEntry = useCallback((fileType: ApplicationFileType) => {
    const existingTimeout = progressCleanupTimeouts.current[fileType]
    if (existingTimeout) {
      clearTimeout(existingTimeout)
      delete progressCleanupTimeouts.current[fileType]
    }

    setUploadProgress(prev => {
      if (!(fileType in prev)) {
        return prev
      }

      const next = { ...prev }
      delete next[fileType]
      return next
    })
  }, [])

  const scheduleProgressClear = useCallback((fileType: ApplicationFileType) => {
    const existingTimeout = progressCleanupTimeouts.current[fileType]
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    const timeoutId = setTimeout(() => {
      clearProgressEntry(fileType)
    }, 3000)

    progressCleanupTimeouts.current[fileType] = timeoutId
  }, [clearProgressEntry])

  const resetUploadedState = useCallback((fileType: ApplicationFileType) => {
    setUploadedFiles(prev => {
      if (prev[fileType] === false) {
        return prev
      }

      return { ...prev, [fileType]: false }
    })
    clearProgressEntry(fileType)
  }, [clearProgressEntry])

  const markUploadedFile = useCallback((fileType: ApplicationFileType, uploaded: boolean) => {
    setUploadedFiles(prev => ({ ...prev, [fileType]: uploaded }))
    if (!uploaded) {
      clearProgressEntry(fileType)
    }
  }, [clearProgressEntry])

  useEffect(() => () => {
    const timeouts = progressCleanupTimeouts.current
    Object.values(timeouts).forEach(timeoutId => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    })
  }, [])

  const validateFileSelection = useCallback(
    (file: File | null, fileType: ApplicationFileType, target: HTMLInputElement | null) => {
      if (!file) {
        onValidationClear?.()
        setUploadedFiles(prev => {
          if (!(fileType in prev)) {
            return prev
          }

          const next = { ...prev }
          delete next[fileType]
          return next
        })
        clearProgressEntry(fileType)
        switch (fileType) {
          case 'result_slip':
            setResultSlipFile(null)
            break
          case 'extra_kyc':
            setExtraKycFile(null)
            break
        }
        return false
      }

      if (file.size > MAX_FILE_SIZE) {
        onValidationError?.('File size must be less than 10MB. Your file is ' + formatFileSize(file.size) + '.')
        if (target) {
          target.value = ''
        }
        switch (fileType) {
          case 'result_slip':
            setResultSlipFile(null)
            break
          case 'extra_kyc':
            setExtraKycFile(null)
            break
        }
        resetUploadedState(fileType)
        return false
      }

      if (!hasAllowedExtension(file.name)) {
        onValidationError?.('Only PDF, JPG, JPEG, and PNG files are allowed. Please select a supported file type.')
        if (target) {
          target.value = ''
        }
        switch (fileType) {
          case 'result_slip':
            setResultSlipFile(null)
            break
          case 'extra_kyc':
            setExtraKycFile(null)
            break
        }
        resetUploadedState(fileType)
        return false
      }

      if (!isAllowedFileType(file.type)) {
        onValidationError?.('Only PDF, JPG, JPEG, and PNG files are allowed. Please select a supported file type.')
        if (target) {
          target.value = ''
        }
        switch (fileType) {
          case 'result_slip':
            setResultSlipFile(null)
            break
          case 'extra_kyc':
            setExtraKycFile(null)
            break
        }
        resetUploadedState(fileType)
        return false
      }

      onValidationClear?.()
      setUploadedFiles(prev => ({ ...prev, [fileType]: false }))

      switch (fileType) {
        case 'result_slip':
          setResultSlipFile(file)
          break
        case 'extra_kyc':
          setExtraKycFile(file)
          break
      }

      clearProgressEntry(fileType)
      return true
    },
    [onValidationClear, onValidationError, resetUploadedState, clearProgressEntry]
  )

  const trackUploadTask = useCallback(
    async <T,>(task: () => Promise<T>) => {
      incrementActiveTasks()
      try {
        return await task()
      } finally {
        decrementActiveTasks()
      }
    },
    [incrementActiveTasks, decrementActiveTasks]
  )

  const startUpload = useCallback(
    async (file: File, fileType: ApplicationFileType, retryCount = 0): Promise<string> => {
      // Prevent concurrent uploads of same file type
      if (uploadPromises.current[fileType]) {
        return uploadPromises.current[fileType]!
      }

      const uploadPromise = trackUploadTask(async () => {
        if (!userId || !applicationId) {
          throw new Error('User or application ID not available')
        }

        // Verify session with retry-once logic for auth errors
        await verifySessionWithRetry()

        setUploadProgress(prev => ({ ...prev, [fileType]: 0 }))
        setUploadedFiles(prev => ({ ...prev, [fileType]: false }))

        let progressInterval: NodeJS.Timeout | null = null

        try {
          progressInterval = setInterval(() => {
            setUploadProgress(prev => {
              const currentValue = prev[fileType] ?? 0
              if (currentValue < 85) {
                return { ...prev, [fileType]: currentValue + 15 }
              }
              return prev
            })
          }, 300)

          const { uploadApplicationFile } = await importWithChunkRecovery(() => import('@/lib/storage'), {
            guardKey: 'wizard-storage',
            recoveryMessage: 'A newer version of the upload tools is loading. Please wait a moment and try again.',
          })
          const result = await uploadApplicationFile(file, userId, applicationId, fileType)

          if (!result.success) {
            const uploadError = new Error(result.error || 'Upload failed') as Error & {
              retryable?: boolean
              statusCode?: number
            }
            uploadError.retryable = result.retryable
            uploadError.statusCode = result.statusCode
            throw uploadError
          }

          setUploadProgress(prev => ({ ...prev, [fileType]: 100 }))
          setUploadedFiles(prev => ({ ...prev, [fileType]: true }))

          return result.url!
        } catch (error) {
          console.error(`File upload error (attempt ${retryCount + 1}/${MAX_UPLOAD_RETRIES + 1}):`, {
            error: sanitizeForLog(error instanceof Error ? error.message : 'Unknown error')
          })

          const shouldRetry = retryCount < MAX_UPLOAD_RETRIES && isRetryableUploadError(error)

          if (shouldRetry) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (retryCount + 1)))
            uploadPromises.current[fileType] = null
            return startUpload(file, fileType, retryCount + 1)
          }

          setUploadedFiles(prev => ({ ...prev, [fileType]: false }))
          clearProgressEntry(fileType)

          if (error instanceof Error) {
            throw new Error(
              shouldRetry
                ? error.message
                : retryCount > 0
                  ? `Upload failed after ${retryCount + 1} attempts: ${error.message}`
                  : error.message
            )
          }

          throw new Error('Upload failed')
        } finally {
          if (progressInterval) {
            clearInterval(progressInterval)
          }
          scheduleProgressClear(fileType)
          uploadPromises.current[fileType] = null
        }
      })
      
      uploadPromises.current[fileType] = uploadPromise
      return uploadPromise
    },
    [applicationId, clearProgressEntry, scheduleProgressClear, trackUploadTask, userId]
  )

  const createFileHandler = useCallback(
    (fileType: ApplicationFileType, setter: (file: File | null) => void, onUploadComplete?: (file: File, url: string) => void) =>
      async (event: ChangeEvent<HTMLInputElement>) => {
        const target = event.target
        const file = target.files?.[0] ?? null

        const isValid = validateFileSelection(file, fileType, target)
        if (!isValid) {
          setter(null)
          return
        }

        // Auto-upload immediately after validation
        if (file && applicationId) {
          try {
            const url = await startUpload(file, fileType)
            onUploadComplete?.(file, url)
          } catch (error) {
            console.error('Auto-upload failed:', error)
            onValidationError?.(error instanceof Error ? error.message : 'Upload failed')
          }
        }
      },
    [validateFileSelection, applicationId, startUpload, onValidationError]
  )

  const handleResultSlipUpload = useCallback(
    (event: ChangeEvent<HTMLInputElement>, onUploadComplete?: (file: File, url: string) => void) => {
      createFileHandler('result_slip', setResultSlipFile, onUploadComplete)(event)
    },
    [createFileHandler]
  )

  const handleExtraKycUpload = useCallback(
    (event: ChangeEvent<HTMLInputElement>, onUploadComplete?: (file: File, url: string) => void) => {
      createFileHandler('extra_kyc', setExtraKycFile, onUploadComplete)(event)
    },
    [createFileHandler]
  )

  /**
   * File-based handler factory for canonical FileUpload (react-dropzone).
   * Accepts a File | null directly instead of a ChangeEvent.
   */
  const createDirectFileHandler = useCallback(
    (fileType: ApplicationFileType, setter: (file: File | null) => void) =>
      async (file: File | null) => {
        const isValid = validateFileSelection(file, fileType, null)
        if (!isValid) {
          setter(null)
          return
        }

        if (file && applicationId) {
          try {
            await startUpload(file, fileType)
          } catch (error) {
            console.error('Auto-upload failed:', error)
            onValidationError?.(error instanceof Error ? error.message : 'Upload failed')
          }
        }
      },
    [validateFileSelection, applicationId, startUpload, onValidationError]
  )

  const handleResultSlipFile = useCallback(
    (file: File | null) => {
      createDirectFileHandler('result_slip', setResultSlipFile)(file)
    },
    [createDirectFileHandler]
  )

  const handleExtraKycFile = useCallback(
    (file: File | null) => {
      createDirectFileHandler('extra_kyc', setExtraKycFile)(file)
    },
    [createDirectFileHandler]
  )

  return {
    resultSlipFile,
    extraKycFile,
    uploading,
    uploadProgress,
    uploadedFiles,
    handleResultSlipUpload,
    handleExtraKycUpload,
    handleResultSlipFile,
    handleExtraKycFile,
    markUploadedFile,
    startUpload,
    trackUploadTask
  }
}

export default useApplicationFileUploads
