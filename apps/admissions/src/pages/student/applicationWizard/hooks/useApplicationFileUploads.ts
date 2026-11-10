import { useCallback, useState } from 'react'
import type { ChangeEvent } from 'react'

import { importWithChunkRecovery } from '@/lib/lazyImportRecovery'
import { sanitizeForLog } from '@/lib/security'
import { delay, isAuthError, verifySessionWithRetry } from '@/services/sessionProbe'

/**
 * The session probe moved to `@/services/sessionProbe` in task 13.6 remediation L12.
 *
 * It reached `apiClient` directly from here, which the R14.3 architecture rule forbids
 * for anything under `src/pages` — and the rule was right: a raw `GET /auth/session/`
 * with retry-once semantics is transport, and it only lived in a page hook because it
 * was written here. The behaviour is unchanged; these three re-exports keep this
 * module's existing import sites (including
 * `tests/property/fileUploadRetryOnAuthError.property.test.ts` and
 * `tests/property/fileUploadProceedOnNetworkError.property.test.ts`, which mock
 * `@/services/client` and therefore still see exactly the same two calls) working
 * against a single definition.
 */
export { delay, isAuthError, verifySessionWithRetry }

export const MAX_FILE_SIZE = 10 * 1024 * 1024
export const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'] as const
export const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'] as const
export const LARGE_FILE_THRESHOLD = 1 * 1024 * 1024 // 1MB — show progress bar above this

export type ApplicationFileType = 'result_slip' | 'extra_kyc'
export type ApplicationUploadState = 'idle' | 'uploading' | 'uploaded' | 'failed'

export interface UseApplicationFileUploadsResult {
  resultSlipFile: File | null
  extraKycFile: File | null
  uploading: boolean
  uploadProgress: Record<string, number>
  uploadStates: Record<string, ApplicationUploadState>
  uploadedFiles: Record<string, boolean>
  markUploadedFile: (fileType: ApplicationFileType, uploaded: boolean) => void
}

/**
 * The wizard's per-document upload bookkeeping.
 *
 * Uploads themselves go through `services/requiredDocuments.ts` (the single
 * upload transport, see `uploadPathSingleSource.test.ts`). The older
 * `startUpload` stack, its file handlers and its progress timers were removed
 * with platform-simplification task 14.9; what is left is the uploaded/idle
 * state the draft loader and the contract bridge write through
 * `markUploadedFile`. The file, progress and `uploading` fields keep their
 * shape for the step-advance and validation contracts and are constant.
 */
const NO_PROGRESS: Record<string, number> = {}
export function useApplicationFileUploads(): UseApplicationFileUploadsResult {
  const [uploadStates, setUploadStates] = useState<Record<string, ApplicationUploadState>>({})
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, boolean>>({})
  const markUploadedFile = useCallback((fileType: ApplicationFileType, uploaded: boolean) => {
    setUploadedFiles(prev => ({ ...prev, [fileType]: uploaded }))
    setUploadStates(prev => ({ ...prev, [fileType]: uploaded ? 'uploaded' : 'idle' }))
  }, [])
  return {
    resultSlipFile: null,
    extraKycFile: null,
    uploading: false,
    uploadProgress: NO_PROGRESS,
    uploadStates,
    uploadedFiles,
    markUploadedFile,
  }
}
export default useApplicationFileUploads
