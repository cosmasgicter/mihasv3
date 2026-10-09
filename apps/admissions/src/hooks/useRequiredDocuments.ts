/**
 * Required-document upload state (admissions-v2 task 7.2).
 *
 * Requirements: R11.6 (controls come from the versioned server contract),
 *               R11.7 (type/size validation per requirement).
 * Findings:     STU-13 (hardcoded two-field wizard), STU-19 (replace that only
 *               changed local UI state).
 * Design:       §9.3 (Required Documents).
 *
 * One state machine per requirement — `idle -> uploading -> uploaded | failed` —
 * plus progress, a single automatic retry for a genuinely retryable failure, a
 * manual retry, and replacement. Every upload re-reads the server contract
 * afterwards, so the rendered state is the persisted state rather than an
 * optimistic local flag.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { logger } from '@/lib/logger'
import {
  RequiredDocumentsContractError,
  unsatisfiedRequirements,
  validateFileForRequirement,
  type RequiredDocumentRequirement,
  type RequiredDocumentsContract,
} from '@/lib/requiredDocuments'
import { sanitizeForLog } from '@/lib/security'
import {
  RequiredDocumentUploadError,
  requiredDocumentsService,
} from '@/services/requiredDocuments'
import { toError } from '@/lib/toError'

/**
 * `replacing` is the state a student is in after asking to replace stored
 * evidence: the server still holds the current document, but the control must be
 * open for a new file. Without it, "Replace file" cleared local state that was
 * already empty and nothing happened on screen — the STU-19 shape of "replace
 * only changed local UI state".
 */
export type RequiredDocumentUploadStatus =
  | 'idle'
  | 'replacing'
  | 'uploading'
  | 'uploaded'
  | 'removing'
  | 'failed'

export interface RequiredDocumentUploadState {
  status: RequiredDocumentUploadStatus
  /**
   * Which command failed. A failed *upload* means there may be nothing on the
   * server, so the control stays open; a failed *remove* means the stored
   * evidence is still the server's record, so it must stay on screen rather than
   * disappearing because a delete did not happen (task 7.3, STU-19).
   */
  failedCommand: 'upload' | 'remove' | null
  /**
   * 0-100 when a transport can measure the transfer, otherwise `undefined` and
   * the control renders an accessible indeterminate indicator. The unified
   * fetch-based client cannot measure request-body progress, so today this is
   * always `undefined` while uploading — never a frozen fabricated number.
   */
  progress?: number
  file: File | null
  error: string | null
  errorCode: string | null
  retryable: boolean
}

export interface UseRequiredDocumentsResult {
  contract: RequiredDocumentsContract | null
  requirements: RequiredDocumentRequirement[]
  /** True while the contract is being read for the first time. */
  loading: boolean
  /** Set when the contract itself could not be read (fail-closed surface). */
  contractError: string | null
  contractErrorRetryable: boolean
  reload: () => void
  uploadStates: Record<string, RequiredDocumentUploadState>
  /** True while any upload is in flight. */
  uploading: boolean
  selectFile: (documentType: string, file: File | null) => Promise<void>
  retry: (documentType: string) => Promise<void>
  /** Record a client-side rejection (e.g. a drop zone refusal) as a failed state. */
  reportLocalError: (documentType: string, message: string, code?: string) => void
  /** Open the control for a replacement without touching the stored evidence. */
  beginReplace: (documentType: string) => void
  /** Abandon a replacement and go back to the stored evidence. */
  cancelReplace: (documentType: string) => void
  /**
   * Remove the stored evidence for a requirement on the server (task 7.3).
   *
   * The delete command, not a local clear: the version stops being current, the
   * removal is appended to verification history, and the contract re-read is
   * what returns the requirement to `missing`. A server failure leaves the
   * stored evidence rendered.
   */
  removeDocument: (documentType: string) => Promise<void>
  /** Required requirements with no persisted evidence yet. */
  blocking: RequiredDocumentRequirement[]
}

const IDLE_STATE: RequiredDocumentUploadState = {
  status: 'idle',
  failedCommand: null,
  progress: undefined,
  file: null,
  error: null,
  errorCode: null,
  retryable: false,
}

const RETRY_DELAY_MS = 1200

export interface UseRequiredDocumentsOptions {
  applicationId: string | null
  /** Called after a successful upload, e.g. to kick off result-slip extraction. */
  onUploaded?: (documentType: string, documentId: string, file: File) => void
  /** Disable the initial read (the wizard has no online draft yet). */
  enabled?: boolean
}

export function useRequiredDocuments({
  applicationId,
  onUploaded,
  enabled = true,
}: UseRequiredDocumentsOptions): UseRequiredDocumentsResult {
  const [contract, setContract] = useState<RequiredDocumentsContract | null>(null)
  const [loading, setLoading] = useState(false)
  const [contractError, setContractError] = useState<string | null>(null)
  const [contractErrorRetryable, setContractErrorRetryable] = useState(false)
  const [uploadStates, setUploadStates] = useState<Record<string, RequiredDocumentUploadState>>({})
  const [reloadToken, setReloadToken] = useState(0)

  const mounted = useRef(true)
  const inFlight = useRef<Record<string, Promise<void> | undefined>>({})
  const lastFile = useRef<Record<string, File | undefined>>({})
  const onUploadedRef = useRef(onUploaded)
  onUploadedRef.current = onUploaded

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const patchState = useCallback(
    (documentType: string, patch: Partial<RequiredDocumentUploadState>) => {
      if (!mounted.current) return
      setUploadStates((previous) => ({
        ...previous,
        [documentType]: { ...IDLE_STATE, ...previous[documentType], ...patch },
      }))
    },
    [],
  )

  // -- contract read ------------------------------------------------------

  useEffect(() => {
    if (!applicationId || !enabled) {
      setContract(null)
      setContractError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    requiredDocumentsService
      .get(applicationId)
      .then((next) => {
        if (cancelled || !mounted.current) return
        setContract(next)
        setContractError(null)
        setContractErrorRetryable(false)
      })
      .catch((error: unknown) => {
        if (cancelled || !mounted.current) return
        setContract(null)
        if (error instanceof RequiredDocumentsContractError) {
          setContractError(error.message)
          setContractErrorRetryable(true)
        } else if (error instanceof RequiredDocumentUploadError) {
          setContractError(error.message)
          setContractErrorRetryable(error.retryable)
        } else {
          setContractError(
            'We could not load the documents this application needs. Please try again.',
          )
          setContractErrorRetryable(true)
        }
        logger.warn('Required-document contract read failed', {
          error: sanitizeForLog(toError(error).message),
        })
      })
      .finally(() => {
        if (!cancelled && mounted.current) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [applicationId, enabled, reloadToken])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  const requirements = useMemo(() => contract?.requirements ?? [], [contract])

  // -- upload ------------------------------------------------------------

  const runUpload = useCallback(
    async (requirement: RequiredDocumentRequirement, file: File, attempt = 0): Promise<void> => {
      if (!applicationId) return

      const documentType = requirement.documentType
      patchState(documentType, {
        status: 'uploading',
        file,
        error: null,
        errorCode: null,
        retryable: false,
        // No percentage: the upload goes through the unified fetch-based
        // ApiClient (task 1.4), which cannot observe request-body progress, and
        // an invented number would render a bar frozen at that value. The
        // control shows an accessible indeterminate indicator instead. This field
        // stays in the state shape for a transport that can measure it.
        progress: undefined,
      })

      try {
        const { documentId } = await requiredDocumentsService.upload({
          applicationId,
          documentType,
          file,
        })
        patchState(documentType, {
          status: 'uploaded',
          progress: undefined,
          // The server now holds the evidence, so the local File stops being the
          // thing we render: the contract re-read below is what the student sees.
          file: null,
          error: null,
          errorCode: null,
          retryable: false,
        })
        onUploadedRef.current?.(documentType, documentId, file)
        // Re-read the contract so the rendered state is the persisted state.
        reload()
      } catch (error: unknown) {
        const uploadError =
          error instanceof RequiredDocumentUploadError
            ? error
            : new RequiredDocumentUploadError(
                toError(error).message || 'Upload failed. Please try again.',
                'UPLOAD_FAILED',
                true,
              )

        logger.warn('Required-document upload failed', {
          documentType: sanitizeForLog(documentType),
          code: sanitizeForLog(uploadError.code),
        })

        if (uploadError.retryable && attempt === 0) {
          // One silent retry: a dropped mobile connection should not cost the
          // student an interaction (product.md — weak networks are the norm).
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
          if (!mounted.current) return
          return runUpload(requirement, file, attempt + 1)
        }

        patchState(documentType, {
          status: 'failed',
          failedCommand: 'upload',
          progress: undefined,
          file,
          error: uploadError.message,
          errorCode: uploadError.code,
          retryable: uploadError.retryable,
        })
      }
    },
    [applicationId, patchState, reload],
  )

  const startUpload = useCallback(
    (requirement: RequiredDocumentRequirement, file: File) => {
      const documentType = requirement.documentType
      const existing = inFlight.current[documentType]
      if (existing) return existing

      lastFile.current[documentType] = file
      const promise = runUpload(requirement, file).finally(() => {
        inFlight.current[documentType] = undefined
      })
      inFlight.current[documentType] = promise
      return promise
    },
    [runUpload],
  )

  const selectFile = useCallback(
    async (documentType: string, file: File | null) => {
      const requirement = requirements.find((row) => row.documentType === documentType)
      if (!requirement) return

      if (!file) {
        lastFile.current[documentType] = undefined
        patchState(documentType, { ...IDLE_STATE })
        return
      }

      const rejection = validateFileForRequirement(file, requirement)
      if (rejection) {
        // Client-side refusal against the *server-published* constraint: no
        // bytes leave the device and the message names the same limit the
        // control displayed.
        patchState(documentType, {
          status: 'failed',
          failedCommand: 'upload',
          file: null,
          progress: undefined,
          error: rejection.message,
          errorCode: rejection.code,
          retryable: false,
        })
        return
      }

      await startUpload(requirement, file)
    },
    [patchState, requirements, startUpload],
  )

  const retry = useCallback(
    async (documentType: string) => {
      const requirement = requirements.find((row) => row.documentType === documentType)
      const file = lastFile.current[documentType]
      if (!requirement || !file) return
      await startUpload(requirement, file)
    },
    [requirements, startUpload],
  )

  const reportLocalError = useCallback(
    (documentType: string, message: string, code = 'INVALID_FILE_TYPE') => {
      if (!message.trim()) return
      lastFile.current[documentType] = undefined
      patchState(documentType, {
        status: 'failed',
        failedCommand: 'upload',
        file: null,
        progress: undefined,
        error: message,
        errorCode: code,
        // A rejected file is never retried as-is; the student picks another one.
        retryable: false,
      })
    },
    [patchState],
  )

  const beginReplace = useCallback(
    (documentType: string) => {
      lastFile.current[documentType] = undefined
      // `replacing`, not `idle`: the stored evidence is untouched on the server,
      // so a state that merely "cleared the selection" would leave the stored
      // summary rendered and the student with no control to use.
      patchState(documentType, { ...IDLE_STATE, status: 'replacing' })
    },
    [patchState],
  )

  const cancelReplace = useCallback(
    (documentType: string) => {
      lastFile.current[documentType] = undefined
      patchState(documentType, { ...IDLE_STATE })
    },
    [patchState],
  )

  const removeDocument = useCallback(
    async (documentType: string) => {
      const requirement = requirements.find((row) => row.documentType === documentType)
      const documentId = requirement?.document?.id
      // Nothing on the server means nothing to remove. Clearing local state here
      // would be the exact STU-19 shape: a UI that looks changed while the
      // server record is untouched.
      if (!documentId) return

      patchState(documentType, {
        ...IDLE_STATE,
        status: 'removing',
      })

      try {
        await requiredDocumentsService.remove({
          documentId,
          reason: 'Removed by the applicant',
        })
        if (!mounted.current) return
        lastFile.current[documentType] = undefined
        patchState(documentType, { ...IDLE_STATE })
        // The contract re-read is the authority for what the requirement now
        // needs — including the preserved history entry for the removed version.
        reload()
      } catch (error: unknown) {
        const removeError =
          error instanceof RequiredDocumentUploadError
            ? error
            : new RequiredDocumentUploadError(
                toError(error).message || 'The document could not be removed. Please try again.',
                'DOCUMENT_REMOVE_FAILED',
                true,
              )
        logger.warn('Required-document removal failed', {
          documentType: sanitizeForLog(documentType),
          code: sanitizeForLog(removeError.code),
        })
        if (!mounted.current) return
        patchState(documentType, {
          ...IDLE_STATE,
          status: 'failed',
          failedCommand: 'remove',
          error: removeError.message,
          errorCode: removeError.code,
          retryable: removeError.retryable,
        })
      }
    },
    [patchState, reload, requirements],
  )

  const uploading = useMemo(
    () => Object.values(uploadStates).some((state) => state.status === 'uploading'),
    [uploadStates],
  )

  const blocking = useMemo(() => unsatisfiedRequirements(contract), [contract])

  return {
    contract,
    requirements,
    loading,
    contractError,
    contractErrorRetryable,
    reload,
    uploadStates,
    uploading,
    selectFile,
    retry,
    reportLocalError,
    beginReplace,
    cancelReplace,
    removeDocument,
    blocking,
  }
}

export default useRequiredDocuments
