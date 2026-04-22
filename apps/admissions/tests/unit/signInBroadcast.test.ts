// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiRequestSpy = vi.fn()
const broadcastLoginSpy = vi.fn()
const setQueryDataSpy = vi.fn()
const removeQueriesSpy = vi.fn()
const invalidateQueriesSpy = vi.fn()
const cancelQueriesSpy = vi.fn().mockResolvedValue(undefined)

vi.mock('@/services/client', () => ({
  apiClient: {
    request: (...args: unknown[]) => apiRequestSpy(...args),
  },
}))

vi.mock('@/lib/authBroadcast', () => ({
  broadcastLogin: (...args: unknown[]) => broadcastLoginSpy(...args),
  broadcastLogout: vi.fn(),
}))

vi.mock('@/lib/auth/roles', () => ({
  isAdminRole: vi.fn(() => false),
}))

vi.mock('@/lib/userDisplayName', () => ({
  getDisplayName: vi.fn(() => 'Test User'),
}))

vi.mock('@/hooks/queries/useQueryConfig', () => ({
  CACHE_CONFIG: {
    auth: { staleTime: 600000, gcTime: 1800000 },
  },
}))

vi.mock('@/lib/csrfToken', () => ({
  clearCsrfToken: vi.fn(),
}))

vi.mock('@/lib/secureStorage', () => ({
  secureStorage: {
    clearSession: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({
    data: null,
    isLoading: false,
  })),
  useQueryClient: vi.fn(() => ({
    setQueryData: (...args: unknown[]) => setQueryDataSpy(...args),
    removeQueries: (...args: unknown[]) => removeQueriesSpy(...args),
    invalidateQueries: (...args: unknown[]) => invalidateQueriesSpy(...args),
    cancelQueries: (...args: unknown[]) => cancelQueriesSpy(...args),
    clear: vi.fn(),
  })),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useCallback: (fn: (...args: unknown[]) => unknown) => fn,
  }
})

describe('signIn login broadcast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiRequestSpy.mockResolvedValue({
      user: {
        id: 'student-42',
        email: 'student@example.com',
        role: 'student',
      },
    })

    if (typeof globalThis.window === 'undefined') {
      ;(globalThis as any).window = { dispatchEvent: vi.fn() }
    } else {
      vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true)
    }
    ;(globalThis as any).CustomEvent = class CustomEvent {
      type: string
      detail: unknown

      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type
        this.detail = init?.detail
      }
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('broadcasts login after seeding the auth cache', async () => {
    const { useSessionListener } = await import('@/hooks/auth/useSessionListener')
    const { signIn } = useSessionListener()

    const result = await signIn('student@example.com', 'secret')

    expect(result.error).toBeUndefined()
    expect(cancelQueriesSpy).toHaveBeenCalledWith({ queryKey: ['auth', 'session'] })
    expect(setQueryDataSpy).toHaveBeenCalledWith(['auth', 'session'], {
      user: expect.objectContaining({
        id: 'student-42',
        email: 'student@example.com',
        role: 'student',
      }),
    })
    expect(broadcastLoginSpy).toHaveBeenCalledWith('student-42')
  })
})
