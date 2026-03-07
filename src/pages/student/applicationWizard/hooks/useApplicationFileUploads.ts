import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'

import { sanitizeForLog } from '@/lib/security'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'] as const
const MAX_UPLOAD_RETRIES = 1
const RETRY_DELAY_MS = 1200

export type ApplicationFileType = 'result_slip' | 'extra_kyc' | 'proof_of_payment'

export interface UseApplicationFileUploadsOptions {
  userId?: string | null
  applicationId: string | null
  onValidationError?: (message: string) => void
  onValidationClear?: () => void
}

export interface UseApplicationFileUploadsResult {
  resultSlipFile: File | null
  extraKycFile: File | null
  proofOfPaymentFile: File | null
  uploading: boolean
  uploadProgress: Record<string, number>
  uploadedFiles: Record<string, boolean>
  handleResultSlipUpload: (event: ChangeEvent<HTMLInputElement>, onUploadComplete?: (file: File, url: string) => void) => void
  handleExtraKycUpload: (event: ChangeEvent<HTMLInputElement>, onUploadComplete?: (file: File, url: string) => void) => void
  handleProofOfPaymentUpload: (event: ChangeEvent<HTMLInputElement>, onUploadComplete?: (file: File, url: string) => void) => void
  startUpload: (file: File, fileType: ApplicationFileType) => Promise<string>
  trackUploadTask: <T>(task: () => Promise<T>) => Promise<T>
}

function isAllowedFileType(type: string): type is typeof ALLOWED_TYPES[number] {
  return (ALLOWED_TYPES as readonly string[]).includes(type)
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
  const [proofOfPaymentFile, setProofOfPaymentFile] = useState<File | null>(null)
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
          case 'proof_of_payment':
            setProofOfPaymentFile(null)
            break
        }
        return false
      }

      if (file.size > MAX_FILE_SIZE) {
        onValidationError?.('File size must be less than 10MB')
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
          case 'proof_of_payment':
            setProofOfPaymentFile(null)
            break
        }
        resetUploadedState(fileType)
        return false
      }

      if (!isAllowedFileType(file.type)) {
        onValidationError?.('Only PDF, JPG, JPEG, and PNG files are allowed')
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
          case 'proof_of_payment':
            setProofOfPaymentFile(null)
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
        case 'proof_of_payment':
          setProofOfPaymentFile(file)
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

        // Verify session via API (cookie-based auth)
        const sessionResponse = await fetch('/api/auth?action=session', {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        })
        
        if (!sessionResponse.ok) {
          throw new Error('Session expired. Please refresh the page.')
        }

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

          const { uploadApplicationFile } = await import('@/lib/storage')
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

  const handleProofOfPaymentUpload = useCallback(
    (event: ChangeEvent<HTMLInputElement>, onUploadComplete?: (file: File, url: string) => void) => {
      createFileHandler('proof_of_payment', setProofOfPaymentFile, onUploadComplete)(event)
    },
    [createFileHandler]
  )

  return {
    resultSlipFile,
    extraKycFile,
    proofOfPaymentFile,
    uploading,
    uploadProgress,
    uploadedFiles,
    handleResultSlipUpload,
    handleExtraKycUpload,
    handleProofOfPaymentUpload,
    startUpload,
    trackUploadTask
  }
}

export default useApplicationFileUploads
