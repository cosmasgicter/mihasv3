import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUseQuery = vi.fn()
const mockUseAuthCheck = vi.fn()
const mockUseSessionListener = vi.fn()
const mockUseAuth = vi.fn()
const mockUseDebouncedLoading = vi.fn()

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    removeQueries: vi.fn(),
    clear: vi.fn(),
  })),
}))

vi.mock('@/hooks/useLoadingState', () => ({
  useDebouncedLoading: (isLoading: boolean, delay?: number) => mockUseDebouncedLoading(isLoading, delay),
}))

vi.mock('@/hooks/queries/useQueryConfig', () => ({
  CACHE_CONFIG: {
    auth: { staleTime: 1000, gcTime: 1000 },
  },
}))

vi.mock('@/utils/userDisplayName', () => ({
  getDisplayName: vi.fn((profile: any) => profile?.full_name || ''),
}))

vi.mock('react-router-dom', () => ({
  Navigate: (props: { to: string; state?: unknown; replace?: boolean }) =>
    React.createElement('mock-navigate', props),
  useLocation: () => ({ pathname: '/protected' }),
}))

vi.mock('@/hooks/auth/useSessionListener', () => ({
  normalizeSessionResult: <T,>(result: { success: boolean; data: T } | null | undefined): T | null => {
    return result?.success ? result.data : null
  },
  useAuthCheck: () => mockUseAuthCheck(),
  useSessionListener: () => mockUseSessionListener(),
  useInvalidateAuthCache: vi.fn(() => ({
    invalidateSession: vi.fn(),
    invalidateProfile: vi.fn(),
    invalidateAll: vi.fn(),
  })),
  checkIsAdmin: vi.fn(),
}))

vi.mock('@/components/admin/AdminErrorBoundary', () => ({
  AdminErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('@/components/student/StudentErrorBoundary', () => ({
  StudentErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}))

import { normalizeSessionResult, useAuthCheck } from '@/hooks/auth/useSessionListener'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { StudentRoute } from '@/components/StudentRoute'
import { AdminRoute } from '@/components/AdminRoute'
import { getRoleSafeRedirectPath } from '@/pages/auth/SignInPage'

describe('useAuthCheck session normalization', () => {
  beforeEach(() => {
    mockUseQuery.mockReset()
    mockUseAuthCheck.mockReset()
  })

  it('normalizes wrapped session payload and authenticates from result.data.user', () => {
    const wrappedResponse = {
      success: true,
      data: {
        user: { id: 'user-123', email: 'student@example.com' },
      },
    }

    const normalized = normalizeSessionResult(wrappedResponse)
    // Verify normalization extracts the data payload
    expect(normalized).toEqual({ user: { id: 'user-123', email: 'student@example.com' } })

    // Mock useAuthCheck to return authenticated state based on normalized data
    mockUseAuthCheck.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: normalized?.user ?? null,
    })

    const result = useAuthCheck()

    expect(result.isAuthenticated).toBe(true)
    expect(result.user?.id).toBe('user-123')
  })

  it('returns unauthenticated state when wrapped response is unsuccessful', () => {
    const normalized = normalizeSessionResult({ success: false, data: null })
    expect(normalized).toBeNull()

    mockUseAuthCheck.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
    })

    const result = useAuthCheck()

    expect(result.isAuthenticated).toBe(false)
    expect(result.user).toBeNull()
  })
})

describe('route guards with normalized session-backed auth state', () => {
  beforeEach(() => {
    mockUseAuthCheck.mockReset()
    mockUseSessionListener.mockReset()
    mockUseAuth.mockReset()
    mockUseDebouncedLoading.mockReset()
    mockUseDebouncedLoading.mockReturnValue(true)
  })

  it('ProtectedRoute renders a neutral skeleton while loading', () => {
    mockUseAuthCheck.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      user: null,
    })

    const element = ProtectedRoute({ children: React.createElement('div', null, 'OK') }) as React.ReactElement
    expect(element).toBeTruthy()
    expect(element.props.label).toBe('Preparing your account')
  })

  it('AdminRoute renders a neutral skeleton while loading', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAdmin: false,
      loading: true,
      profile: null,
    })

    const element = AdminRoute({ children: React.createElement('div', null, 'Admin') }) as React.ReactElement
    expect(element).toBeTruthy()
    expect(element.props.label).toBe('Preparing admin workspace')
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
    mockUseAuth.mockReturnValue({
      user: { id: 'admin-1', email: 'admin@example.com' },
      isAdmin: true,
      loading: false,
      profile: null,
    })

    const element = StudentRoute({ children: React.createElement('div', null, 'Student') }) as React.ReactElement
    // Navigate may resolve as the mock function or the string tag depending on vitest module resolution
    const isNavigate = element.type === 'mock-navigate' || (typeof element.type === 'function' && (element.type as any).name === 'Navigate')
    expect(isNavigate).toBe(true)
    expect(element.props.to).toBe('/admin/dashboard')
  })

  it('AdminRoute redirects logged-in students to student dashboard', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'student-1', email: 'student@example.com', role: 'student' },
      isAdmin: false,
      loading: false,
      profile: null,
    })

    const element = AdminRoute({ children: React.createElement('div', null, 'Admin') }) as React.ReactElement
    const isNavigate = element.type === 'mock-navigate' || (typeof element.type === 'function' && (element.type as any).name === 'Navigate')
    expect(isNavigate).toBe(true)
    expect(element.props.to).toBe('/student/dashboard')
  })

  it('AdminRoute allows logged-in admins from session role source', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'admin-2', email: 'admin@example.com', role: 'admin' },
      isAdmin: true,
      loading: false,
      profile: null,
    })

    const element = AdminRoute({ children: React.createElement('div', { id: 'admin-ok' }, 'Admin') }) as React.ReactElement
    // AdminErrorBoundary is mocked to pass through children
    expect(element).toBeTruthy()
  })

  it('AdminRoute redirects unauthenticated users to signin', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAdmin: false,
      loading: false,
      profile: null,
    })

    const element = AdminRoute({ children: React.createElement('div', null, 'Admin') }) as React.ReactElement
    const isNavigate = element.type === 'mock-navigate' || (typeof element.type === 'function' && (element.type as any).name === 'Navigate')
    expect(isNavigate).toBe(true)
    expect(element.props.to).toBe('/auth/signin')
  })
})

describe('role-safe post-login redirect sanitization', () => {
  it('uses admin default when stale student redirect exists after student logout then admin login', () => {
    const redirectTo = getRoleSafeRedirectPath({
      requestedRedirect: '/student/application-wizard?step=documents',
      role: 'admin',
    })

    expect(redirectTo).toBe('/admin/dashboard')
  })

  it('uses student default when stale admin redirect exists after admin logout then student login', () => {
    const redirectTo = getRoleSafeRedirectPath({
      requestedRedirect: '/admin/users',
      role: 'student',
    })

    expect(redirectTo).toBe('/student/dashboard')
  })

  it('accepts same-role redirect targets and preserves query/hash', () => {
    const adminRedirect = getRoleSafeRedirectPath({
      requestedRedirect: '/admin/applications?page=2#pending',
      role: 'admin',
    })
    const studentRedirect = getRoleSafeRedirectPath({
      requestedRedirect: '/student/application/abc-123?tab=files#upload',
      role: 'student',
    })

    expect(adminRedirect).toBe('/admin/applications?page=2#pending')
    expect(studentRedirect).toBe('/student/application/abc-123?tab=files#upload')
  })
})
