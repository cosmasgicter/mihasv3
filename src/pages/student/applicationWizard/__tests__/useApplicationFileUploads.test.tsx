import { vi } from 'vitest'

const uploadApplicationFileMock = vi.fn()
const getUserMock = vi.fn()

vi.mock('@/lib/storage', () => ({
  uploadApplicationFile: (...args: unknown[]) => uploadApplicationFileMock(...args)
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => getUserMock(...args)
    }
  }
}))

import { render, cleanup } from '@testing-library/react'
import { act } from 'react'
import type { ChangeEvent } from 'react'
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

import useApplicationFileUploads, {
  type UseApplicationFileUploadsOptions,
  type UseApplicationFileUploadsResult
} from '../hooks/useApplicationFileUploads'

describe('useApplicationFileUploads', () => {
  beforeAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  const createFile = (name: string, size: number, type: string) =>
    new File([new Uint8Array(size)], name, { type })

  const renderUseApplicationFileUploads = (
    override: Partial<UseApplicationFileUploadsOptions> = {}
  ) => {
    const hookRef: { current: UseApplicationFileUploadsResult | null } = { current: null }

    const TestComponent = () => {
      const hookValue = useApplicationFileUploads({
        userId: 'user-1',
        applicationId: 'app-1',
        ...override
      })

      hookRef.current = hookValue

      return null
    }

    render(<TestComponent />)
    return hookRef
  }

  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    uploadApplicationFileMock.mockResolvedValue({ success: true, url: 'https://storage.example/file.pdf' })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('updates progress over time and marks uploads as complete', async () => {
    vi.useFakeTimers()

    uploadApplicationFileMock.mockImplementation(() =>
      new Promise(resolve => {
        setTimeout(() => resolve({ success: true, url: 'https://storage.example/result.pdf' }), 900)
      })
    )

    const hookRef = renderUseApplicationFileUploads()
    const file = createFile('result.pdf', 2048, 'application/pdf')

    let uploadPromise: Promise<string>

    await act(async () => {
      uploadPromise = hookRef.current!.startUpload(file, 'result_slip')
      await Promise.resolve()
    })

    await act(async () => {
      vi.advanceTimersByTime(899)
      await Promise.resolve()
    })

    expect(hookRef.current!.uploading).toBe(true)
    expect(hookRef.current!.uploadProgress.result_slip).toBeGreaterThan(0)

    await act(async () => {
      vi.advanceTimersByTime(1)
      await uploadPromise
    })

    expect(hookRef.current!.uploadProgress.result_slip).toBe(100)
    expect(hookRef.current!.uploadedFiles.result_slip).toBe(true)
    expect(hookRef.current!.uploading).toBe(false)

    await act(async () => {
      vi.advanceTimersByTime(3000)
      await Promise.resolve()
    })

    expect(hookRef.current!.uploadProgress.result_slip).toBeUndefined()
  })

  it('resets progress and uploaded state when an upload fails', async () => {
    uploadApplicationFileMock.mockResolvedValue({ success: false, error: 'Upload failed' })

    const hookRef = renderUseApplicationFileUploads()
    const startUpload = hookRef.current!.startUpload
    const file = createFile('result.pdf', 2048, 'application/pdf')

    await act(async () => {
      await expect(startUpload(file, 'result_slip')).rejects.toThrow('Upload failed')
    })

    expect(hookRef.current!.uploadProgress.result_slip).toBeUndefined()
    expect(hookRef.current!.uploadedFiles.result_slip).toBe(false)
    expect(hookRef.current!.uploading).toBe(false)
  })

  it('throws when Supabase authentication fails before uploading', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'Auth error' } })

    const hookRef = renderUseApplicationFileUploads()
    const startUpload = hookRef.current!.startUpload
    const file = createFile('result.pdf', 2048, 'application/pdf')

    await act(async () => {
      await expect(startUpload(file, 'result_slip')).rejects.toThrow(
        'Please sign in again to upload files'
      )
    })

    expect(uploadApplicationFileMock).not.toHaveBeenCalled()
    expect(hookRef.current!.uploadProgress.result_slip).toBeUndefined()
    expect(hookRef.current!.uploading).toBe(false)
  })

  it('validates file selections and clears previous errors', async () => {
    const onError = vi.fn()
    const onClear = vi.fn()

    const hookRef = renderUseApplicationFileUploads({
      onValidationError: onError,
      onValidationClear: onClear
    })
    const handleResultSlipUpload = hookRef.current!.handleResultSlipUpload

    const oversizedFile = createFile('large.pdf', 10 * 1024 * 1024 + 1, 'application/pdf')
    const invalidEvent = {
      target: {
        files: [oversizedFile],
        value: 'invalid-value'
      }
    } as unknown as ChangeEvent<HTMLInputElement>

    await act(async () => {
      handleResultSlipUpload(invalidEvent)
    })

    expect(onError).toHaveBeenCalledWith('File size must be less than 10MB')
    expect(onClear).not.toHaveBeenCalled()
    expect(hookRef.current!.resultSlipFile).toBeNull()
    expect(invalidEvent.target.value).toBe('')

    const validFile = createFile('valid.pdf', 2048, 'application/pdf')
    const validEvent = {
      target: {
        files: [validFile],
        value: 'valid-value'
      }
    } as unknown as ChangeEvent<HTMLInputElement>

    await act(async () => {
      handleResultSlipUpload(validEvent)
    })

    expect(onClear).toHaveBeenCalled()
    expect(hookRef.current!.resultSlipFile).toBe(validFile)
    expect(hookRef.current!.uploadedFiles.result_slip).toBe(false)
  })

  it('handles clearing file selections without optional callbacks', async () => {
    const hookRef = renderUseApplicationFileUploads()

    const event = {
      target: {
        files: null,
        value: 'existing-value'
      }
    } as unknown as ChangeEvent<HTMLInputElement>

    await act(async () => {
      hookRef.current!.handleProofOfPaymentUpload(event)
    })

    expect(hookRef.current!.proofOfPaymentFile).toBeNull()
    expect(hookRef.current!.uploadedFiles.proof_of_payment).toBeUndefined()
    expect(event.target.value).toBe('existing-value')
  })
})
