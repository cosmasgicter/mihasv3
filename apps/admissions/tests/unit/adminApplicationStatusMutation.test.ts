import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/secureStorage', () => ({
  secureStorage: { clearSession: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock('@/lib/apiConfig', () => ({
  getApiBaseUrl: () => '',
}))

vi.mock('@/lib/errorMessages', () => ({
  TIMEOUT_ERROR_MESSAGE: 'Request timed out. Please try again.',
}))

vi.mock('@/utils/api-cache', () => ({
  fetchWithCache: vi.fn(),
  invalidateCache: vi.fn(),
}))

vi.mock('@/lib/apiErrorHandler', () => ({
  ApiErrorHandler: {
    enhanceError: vi.fn(({ originalError }) =>
      originalError instanceof Error ? originalError : new Error(String(originalError))
    ),
  },
}))

const mockToast = {
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}

vi.mock('@/hooks/useToast', () => ({
  useToastStore: () => mockToast,
}))

const invalidateAdminApplicationQueries = vi.fn().mockResolvedValue(undefined)
vi.mock('@/hooks/admin/applicationQueryInvalidation', () => ({
  invalidateAdminApplicationQueries: (...args: unknown[]) => invalidateAdminApplicationQueries(...args),
}))

const mockQueryClient = {}
let capturedMutationOptions: any

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
  useMutation: (options: any) => {
    capturedMutationOptions = options
    return {
      mutate: async (params: unknown) => {
        try {
          const result = await options.mutationFn(params)
          await options.onSuccess?.(result)
          return result
        } catch (error) {
          await options.onError?.(error)
          throw error
        }
      },
      mutateAsync: async (params: unknown) => {
        try {
          const result = await options.mutationFn(params)
          await options.onSuccess?.(result)
          return result
        } catch (error) {
          await options.onError?.(error)
          throw error
        }
      },
      isPending: false,
      error: null,
      isSuccess: false,
      reset: vi.fn(),
    }
  },
}))

import { applicationService } from '@/services/applications'
import { useApplicationStatusUpdate } from '@/hooks/admin/useApplicationStatusUpdate'
import { setCsrfToken, clearCsrfToken } from '@/lib/csrfToken'

function createFetchResponse(body: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {
      get: () => 'application/json',
      entries: () => new Map([['content-type', 'application/json']]).entries(),
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    clone() {
      return createFetchResponse(body, status)
    },
  }
}

describe('admin status mutation canonical path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedMutationOptions = undefined
  })

  it('sends PATCH action update_status to /api/applications for approve and reject', async () => {
    const mockFetch = vi.fn()
    global.fetch = mockFetch as unknown as typeof fetch
    clearCsrfToken()
    setCsrfToken('csrf-token')

    mockFetch
      .mockResolvedValueOnce(createFetchResponse({ success: true, data: { id: 'app-1', status: 'approved' } }))
      .mockResolvedValueOnce(createFetchResponse({ success: true, data: { id: 'app-1', status: 'rejected' } }))

    await applicationService.updateStatus('app-1', 'approved', 'Approved after review')
    await applicationService.updateStatus('app-1', 'rejected', 'Rejected due to missing documents', true)

    expect(mockFetch).toHaveBeenCalledTimes(2)

    const approveCall = mockFetch.mock.calls[0]
    expect(approveCall[0]).toContain('/api/applications?id=app-1')
    expect(approveCall[1].method).toBe('PATCH')
    expect(JSON.parse(approveCall[1].body)).toEqual({
      action: 'update_status',
      status: 'approved',
      notes: 'Approved after review',
    })

    const rejectCall = mockFetch.mock.calls[1]
    expect(rejectCall[0]).toContain('/api/applications?id=app-1')
    expect(rejectCall[1].method).toBe('PATCH')
    expect(JSON.parse(rejectCall[1].body)).toEqual({
      action: 'update_status',
      status: 'rejected',
      notes: 'Rejected due to missing documents',
      force: true,
    })
  })

  it('routes approve/reject transitions through useApplicationStatusUpdate -> applicationService.updateStatus', async () => {
    const updateStatusSpy = vi
      .spyOn(applicationService, 'updateStatus')
      .mockResolvedValueOnce({
        id: 'app-approve',
        application_number: 'APP-001',
        status: 'approved',
        updated_at: '2026-01-01T00:00:00Z',
      } as any)
      .mockResolvedValueOnce({
        id: 'app-reject',
        application_number: 'APP-002',
        status: 'rejected',
        updated_at: '2026-01-01T00:01:00Z',
      } as any)

    const { updateStatusAsync } = useApplicationStatusUpdate()

    await updateStatusAsync({
      applicationId: 'app-approve',
      status: 'approved',
      notes: 'Looks good',
    })

    await updateStatusAsync({
      applicationId: 'app-reject',
      status: 'rejected',
      notes: 'Missing requirements',
      force: true,
    })

    expect(updateStatusSpy).toHaveBeenNthCalledWith(1, 'app-approve', 'approved', 'Looks good', undefined)
    expect(updateStatusSpy).toHaveBeenNthCalledWith(2, 'app-reject', 'rejected', 'Missing requirements', true)
    expect(invalidateAdminApplicationQueries).toHaveBeenCalledTimes(2)
    expect(capturedMutationOptions).toBeTruthy()
    expect(mockToast.success).toHaveBeenCalledTimes(2)
  })
})
