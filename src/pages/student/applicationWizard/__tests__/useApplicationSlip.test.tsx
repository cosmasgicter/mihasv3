import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { act } from 'react'
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'

import type { ApplicationSlipData } from '@/lib/applicationSlip'
import useApplicationSlip, {
  type SubmittedApplicationSummary,
  type UseApplicationSlipOptions
} from '../hooks/useApplicationSlip'

type CreateSlipMock = UseApplicationSlipOptions['createApplicationSlip']
type MockedCreateSlip = ReturnType<typeof vi.fn<CreateSlipMock>>

describe('useApplicationSlip', () => {
  beforeAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  const now = new Date().toISOString()

  const baseApplication: SubmittedApplicationSummary = {
    applicationNumber: 'APP-123',
    trackingCode: 'TRK-123',
    program: 'Clinical Medicine',
    institution: 'MIHAS',
    intake: 'January 2025',
    fullName: 'Test Student',
    email: 'student@example.com',
    phone: '260123456789',
    status: 'submitted',
    paymentStatus: 'pending_review',
    submittedAt: now,
    updatedAt: now
  }

  const basePayload: ApplicationSlipData = {
    public_tracking_code: 'TRK-123',
    application_number: 'APP-123',
    status: 'submitted',
    payment_status: 'pending_review',
    submitted_at: now,
    updated_at: now,
    program_name: 'Clinical Medicine',
    intake_name: 'January 2025',
    institution: 'MIHAS',
    full_name: 'Test Student',
    email: 'student@example.com',
    phone: '260123456789',
    admin_feedback: null,
    admin_feedback_date: null
  }

  const originalCreateObjectURL = (URL as unknown as { createObjectURL?: (value: Blob) => string }).createObjectURL
  const originalRevokeObjectURL = (URL as unknown as { revokeObjectURL?: (value: string) => void }).revokeObjectURL
  const originalPrompt = window.prompt
  const originalFetch = global.fetch

  const createObjectURLMock = vi.fn(() => 'blob:mock-url')
  const revokeObjectURLMock = vi.fn()

  const createToast = () => ({
    showError: vi.fn(),
    showInfo: vi.fn(),
    showSuccess: vi.fn(),
    showWarning: vi.fn()
  })

  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURLMock
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURLMock
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    createObjectURLMock.mockClear()
    revokeObjectURLMock.mockClear()
    if (originalFetch) {
      global.fetch = originalFetch
    } else {
      // @ts-expect-error - allow removing fetch mock when not defined originally
      delete global.fetch
    }
    window.prompt = originalPrompt
  })

  afterAll(() => {
    if (originalCreateObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: originalCreateObjectURL
      })
    } else {
      // @ts-expect-error - clean up mocked property when undefined originally
      delete URL.createObjectURL
    }

    if (originalRevokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: originalRevokeObjectURL
      })
    } else {
      // @ts-expect-error - clean up mocked property when undefined originally
      delete URL.revokeObjectURL
    }

    window.prompt = originalPrompt
    if (originalFetch) {
      global.fetch = originalFetch
    }
  })

  const createDefaultSlipMock = (): MockedCreateSlip =>
    vi.fn<CreateSlipMock>().mockResolvedValue({
      blob: new Blob(['test'], { type: 'application/pdf' }),
      publicUrl: 'https://example.com/slip.pdf'
    })

  const renderUseApplicationSlip = (
    override: Partial<UseApplicationSlipOptions> = {},
    createMock?: MockedCreateSlip
  ) => {
    const toast = createToast()
    const createApplicationSlipMock = createMock ?? createDefaultSlipMock()
    const props: UseApplicationSlipOptions = {
      submittedApplication: baseApplication,
      slipPayload: basePayload,
      success: false,
      toast,
      createApplicationSlip: createApplicationSlipMock,
      ...override
    }

    return {
      toast,
      createApplicationSlipMock,
      ...renderHook(() => useApplicationSlip(props))
    }
  }

  it('caches generated slips for subsequent downloads', async () => {
    const createApplicationSlipMock = vi.fn<CreateSlipMock>().mockResolvedValue({
      blob: new Blob(['cached'], { type: 'application/pdf' }),
      publicUrl: 'https://example.com/slip.pdf'
    })

    const { result } = renderUseApplicationSlip({}, createApplicationSlipMock)

    await act(async () => {
      await result.current.handleDownloadSlip()
    })

    await waitFor(() => {
      expect(result.current.slipCache?.objectUrl).toBeDefined()
    })

    expect(createApplicationSlipMock).toHaveBeenCalledTimes(1)
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)

    createObjectURLMock.mockClear()

    await act(async () => {
      await result.current.handleDownloadSlip()
    })

    expect(createApplicationSlipMock).toHaveBeenCalledTimes(1)
    expect(createObjectURLMock).not.toHaveBeenCalled()
  })

  it('only persists slips when data is available and success is true', async () => {
    const createApplicationSlipMock = vi.fn<CreateSlipMock>().mockResolvedValue({
      blob: new Blob(['persist'], { type: 'application/pdf' }),
      publicUrl: 'https://example.com/slip.pdf'
    })

    const { rerender } = renderHook(
      (props: UseApplicationSlipOptions) => useApplicationSlip(props),
      {
        initialProps: {
          submittedApplication: baseApplication,
          slipPayload: null,
          success: true,
          toast: createToast(),
          createApplicationSlip: createApplicationSlipMock
        }
      }
    )

    expect(createApplicationSlipMock).not.toHaveBeenCalled()

    await act(async () => {
      rerender({
        submittedApplication: baseApplication,
        slipPayload: basePayload,
        success: true,
        toast: createToast(),
        createApplicationSlip: createApplicationSlipMock
      })
    })

    await waitFor(() => {
      expect(createApplicationSlipMock).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      rerender({
        submittedApplication: baseApplication,
        slipPayload: basePayload,
        success: true,
        toast: createToast(),
        createApplicationSlip: createApplicationSlipMock
      })
    })

    await waitFor(() => {
      expect(createApplicationSlipMock).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      rerender({
        submittedApplication: baseApplication,
        slipPayload: basePayload,
        success: false,
        toast: createToast(),
        createApplicationSlip: createApplicationSlipMock
      })
    })

    await act(async () => {
      rerender({
        submittedApplication: baseApplication,
        slipPayload: basePayload,
        success: true,
        toast: createToast(),
        createApplicationSlip: createApplicationSlipMock
      })
    })

    await waitFor(() => {
      expect(createApplicationSlipMock).toHaveBeenCalledTimes(2)
    })
  })

  it('downloads persisted slips from public storage when necessary', async () => {
    const createApplicationSlipMock = vi.fn<CreateSlipMock>().mockResolvedValue({
      publicUrl: 'https://example.com/slip.pdf'
    })

    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['fetched'], { type: 'application/pdf' })
    }))

    global.fetch = fetchMock as unknown as typeof fetch

    const { result } = renderUseApplicationSlip({ success: true }, createApplicationSlipMock)

    await waitFor(() => {
      expect(createApplicationSlipMock).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(result.current.slipCache?.publicUrl).toBe('https://example.com/slip.pdf')
    })

    createObjectURLMock.mockClear()

    await act(async () => {
      await result.current.handleDownloadSlip()
    })

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/slip.pdf')
    expect(createApplicationSlipMock).toHaveBeenCalledTimes(1)
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(result.current.slipCache?.objectUrl).toBeDefined()
    })
  })

  it('overrides email address using prompt when emailing slips', async () => {
    const createApplicationSlipMock = vi.fn<CreateSlipMock>().mockResolvedValue({
      blob: new Blob(['email'], { type: 'application/pdf' }),
      publicUrl: 'https://example.com/slip.pdf'
    })
    const onEmailUpdate = vi.fn()
    const promptMock = vi.fn(() => 'override@example.com')
    window.prompt = promptMock

    const { result } = renderUseApplicationSlip(
      {
        submittedApplication: { ...baseApplication, email: null },
        slipPayload: { ...basePayload, email: '' },
        onEmailUpdate
      },
      createApplicationSlipMock
    )

    await act(async () => {
      await result.current.handleEmailSlip()
    })

    expect(promptMock).toHaveBeenCalled()
    expect(createApplicationSlipMock).toHaveBeenCalledTimes(1)

    const [payload, options] = createApplicationSlipMock.mock.calls[0]
    expect(payload.email).toBe('override@example.com')
    expect(options?.sendEmail).toBe(true)
    expect(onEmailUpdate).toHaveBeenCalledWith('override@example.com')
  })
})
