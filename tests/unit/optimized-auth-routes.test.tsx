import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUseQuery = vi.fn()
const mockUseAuthCheck = vi.fn()
const mockUseOptimizedAuthState = vi.fn()

const mockUseDebouncedLoading = vi.fn()

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
  isSupabaseConfigured: false,
}))


vi.mock('@/hooks/useLoadingState', () => ({
  useDebouncedLoading: (isLoading: boolean, delay?: number) => mockUseDebouncedLoading(isLoading, delay),
}))

vi.mock('@/hooks/queries/useSupabaseQuery', () => ({
  CACHE_CONFIG: {
    auth: {
      staleTime: 1000,
      gcTime: 1000,
    },
  },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    Navigate: (props: { to: string; state?: unknown; replace?: boolean }) =>
      React.createElement('mock-navigate', props),
    useLocation: () => ({ pathname: '/protected' }),
  }
})

vi.mock('@/hooks/auth/useOptimizedAuthState', async () => {
  const actual = await vi.importActual('@/hooks/auth/useOptimizedAuthState')
  return {
    ...actual,
    useAuthCheck: () => mockUseAuthCheck(),
    useOptimizedAuthState: () => mockUseOptimizedAuthState(),
  }
})

import { normalizeSessionResult, useAuthCheck } from '@/hooks/auth/useOptimizedAuthState'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { StudentRoute } from '@/components/StudentRoute'
import { AdminRoute } from '@/components/AdminRoute'

describe('useAuthCheck session normalization', () => {
  beforeEach(() => {
    mockUseQuery.mockReset()
  })

  it('normalizes wrapped session payload and authenticates from result.data.user', () => {
    const wrappedResponse = {
      success: true,
      data: {
        user: { id: 'user-123', email: 'student@example.com' },
      },
    }

    mockUseQuery.mockReturnValue({
      data: normalizeSessionResult(wrappedResponse),
      isLoading: false,
    })

    const result = useAuthCheck()

    expect(result.isAuthenticated).toBe(true)
    expect(result.user?.id).toBe('user-123')
  })

  it('returns unauthenticated state when wrapped response is unsuccessful', () => {
    mockUseQuery.mockReturnValue({
      data: normalizeSessionResult({ success: false, data: null }),
      isLoading: false,
    })

    const result = useAuthCheck()

    expect(result.isAuthenticated).toBe(false)
    expect(result.user).toBeNull()
  })
})

describe('route guards with normalized session-backed auth state', () => {
  beforeEach(() => {
    mockUseAuthCheck.mockReset()
    mockUseOptimizedAuthState.mockReset()
    mockUseDebouncedLoading.mockReset()
    mockUseDebouncedLoading.mockReturnValue(true)
  })

  it('ProtectedRoute returns null while loading before anti-flicker threshold', () => {
    mockUseAuthCheck.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      user: null,
    })
    mockUseDebouncedLoading.mockReturnValue(false)

    const element = ProtectedRoute({ children: React.createElement('div', null, 'OK') })

    expect(element).toBeNull()
  })

  it('AdminRoute renders inline loader after anti-flicker threshold', () => {
    mockUseOptimizedAuthState.mockReturnValue({
      user: null,
      isAdmin: false,
      isLoading: true,
      profile: null,
      isAuthenticated: false,
    })
    mockUseDebouncedLoading.mockReturnValue(true)

    const element = AdminRoute({ children: React.createElement('div', null, 'Admin') }) as React.ReactElement

    expect(element.props.message).toBe('Verifying administrator access')
  })


  it('ProtectedRoute does not redirect authenticated users back to /auth/signin', () => {
    mockUseAuthCheck.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 'user-123', email: 'student@example.com' },
    })

    const element = ProtectedRoute({ children: React.createElement('div', { id: 'ok' }, 'OK') }) as React.ReactElement

    expect(element.type).toBe(React.Fragment)
    expect((element.props.children as React.ReactElement).props.id).toBe('ok')
  })

  it('StudentRoute redirects admins to admin dashboard', () => {
    mockUseOptimizedAuthState.mockReturnValue({
      user: { id: 'admin-1', email: 'admin@example.com' },
      isAdmin: true,
      isLoading: false,
      profile: null,
      isAuthenticated: true,
    })

    const element = StudentRoute({ children: React.createElement('div', null, 'Student') }) as React.ReactElement

    expect(element.type).toBe('mock-navigate')
    expect(element.props.to).toBe('/admin/dashboard')
  })


  it('AdminRoute redirects logged-in students to student dashboard', () => {
    mockUseOptimizedAuthState.mockReturnValue({
      user: { id: 'student-1', email: 'student@example.com', role: 'student' },
      isAdmin: false,
      isLoading: false,
      profile: null,
      isAuthenticated: true,
    })

    const element = AdminRoute({ children: React.createElement('div', null, 'Admin') }) as React.ReactElement

    expect(element.type).toBe('mock-navigate')
    expect(element.props.to).toBe('/student/dashboard')
  })

  it('AdminRoute allows logged-in admins from session role source', () => {
    mockUseOptimizedAuthState.mockReturnValue({
      user: { id: 'admin-2', email: 'admin@example.com', role: 'admin' },
      isAdmin: true,
      isLoading: false,
      profile: null,
      isAuthenticated: true,
    })

    const element = AdminRoute({ children: React.createElement('div', { id: 'admin-ok' }, 'Admin') }) as React.ReactElement

    expect(typeof element.type).toBe('function')
    expect((element.props.children as React.ReactElement).props.id).toBe('admin-ok')
  })
  it('AdminRoute redirects unauthenticated users to signin', () => {
    mockUseOptimizedAuthState.mockReturnValue({
      user: null,
      isAdmin: false,
      isLoading: false,
      profile: null,
      isAuthenticated: false,
    })

    const element = AdminRoute({ children: React.createElement('div', null, 'Admin') }) as React.ReactElement

    expect(element.type).toBe('mock-navigate')
    expect(element.props.to).toBe('/auth/signin')
  })
})
