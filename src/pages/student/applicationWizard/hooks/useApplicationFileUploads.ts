import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'

import { supabase } from '@/lib/supabase'
import { sanitizeForLog } from '@/lib/security'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'] as const

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
  handleResultSlipUpload: (event: ChangeEvent<HTMLInputElement>) => void
  handleExtraKycUpload: (event: ChangeEvent<HTMLInputElement>) => void
  handleProofOfPaymentUpload: (event: ChangeEvent<HTMLInputElement>) => void
  startUpload: (file: File, fileType: ApplicationFileType) => Promise<string>
  trackUploadTask: <T>(task: () => Promise<T>) => Promise<T>
}

function isAllowedFileType(type: string): type is typeof ALLOWED_TYPES[number] {
  return (ALLOWED_TYPES as readonly string[]).includes(type)
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

  const createFileHandler = useCallback(
    (fileType: ApplicationFileType, setter: (file: File | null) => void) =>
      (event: ChangeEvent<HTMLInputElement>) => {
        const target = event.target
        const file = target.files?.[0] ?? null

        const isValid = validateFileSelection(file, fileType, target)
        if (!isValid) {
          setter(null)
        }
      },
    [validateFileSelection]
  )

  const handleResultSlipUpload = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      createFileHandler('result_slip', setResultSlipFile)(event)
    },
    [createFileHandler]
  )

  const handleExtraKycUpload = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      createFileHandler('extra_kyc', setExtraKycFile)(event)
    },
    [createFileHandler]
  )

  const handleProofOfPaymentUpload = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      createFileHandler('proof_of_payment', setProofOfPaymentFile)(event)
    },
    [createFileHandler]
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
    async (file: File, fileType: ApplicationFileType): Promise<string> => {
      return trackUploadTask(async () => {
        if (!userId || !applicationId) {
          throw new Error('User or application ID not available')
        }

        const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
        if (authError || !currentUser) {
          throw new Error('Please sign in again to upload files')
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
            throw new Error(result.error || 'Upload failed')
          }

          setUploadProgress(prev => ({ ...prev, [fileType]: 100 }))
          setUploadedFiles(prev => ({ ...prev, [fileType]: true }))

          return result.url!
        } catch (error) {
          console.error('File upload error:', {
            error: sanitizeForLog(error instanceof Error ? error.message : 'Unknown error')
          })
          setUploadedFiles(prev => ({ ...prev, [fileType]: false }))
          clearProgressEntry(fileType)
          throw error
        } finally {
          if (progressInterval) {
            clearInterval(progressInterval)
          }
          scheduleProgressClear(fileType)
        }
      })
    },
    [applicationId, clearProgressEntry, scheduleProgressClear, trackUploadTask, userId]
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
