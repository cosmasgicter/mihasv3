// @ts-nocheck
/**
 * Sign-In Page Verification Test
 *
 * Verifies the sign-in page correctly renders the login form, processes
 * Django login response shapes, and performs role-based redirects.
 * Mocks AuthContext with Django response shapes (after envelope unwrap)
 * and asserts correct rendering and navigation behavior.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// ── Polyfill window.matchMedia for jsdom ──────────────────────────────
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// ── Mock react-router-dom ──────────────────────────────────────────────
const mockNavigate = vi.fn()
const mockLocation = {
  pathname: '/auth/signin',
  search: '',
  hash: '',
  state: null,
}

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
}))

// ── Mock AuthContext ───────────────────────────────────────────────────
// Django login response shape (after envelope unwrap):
// { user: { id: string, email: string, role: string, first_name: string, last_name: string } }
const mockSignIn = vi.fn()

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    isAdmin: false,
    signIn: mockSignIn,
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}))

// ── Mock heavy child components ───────────────────────────────────────
vi.mock('@/components/seo/Seo', () => ({
  Seo: () => null,
}))

vi.mock('@/components/auth/AuthLayout', () => ({
  AuthLayout: ({ children, title, description, footer }: {
    children: React.ReactNode
    title: string
    description: React.ReactNode
    footer: React.ReactNode
  }) => (
    <div data-testid="auth-layout">
      <h1>{title}</h1>
      <div data-testid="auth-description">{description}</div>
      <div data-testid="auth-form">{children}</div>
      <div data-testid="auth-footer">{footer}</div>
    </div>
  ),
}))

vi.mock('@/components/ui/UnifiedLoader', () => ({
  UnifiedLoader: ({ label }: { label: string }) => (
    <div data-testid="unified-loader">{label}</div>
  ),
  UnifiedSpinner: ({ size, className }: { size?: string; className?: string }) => (
    <span data-testid="unified-spinner" />
  ),
}))

vi.mock('@/components/ui/Banner', () => ({
  Banner: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-banner">{children}</div>
  ),
}))

vi.mock('@/components/ui/FormErrorAnnouncer', () => ({
  FormErrorAnnouncer: () => null,
}))

vi.mock('@/lib/apiErrorLogger', () => ({
  logApiError: vi.fn(),
}))

// ── Mock tanstack react-query ─────────────────────────────────────────
let capturedMutationFn: ((data: unknown) => Promise<unknown>) | null = null
let capturedOnSuccess: ((result: unknown) => void) | null = null
let capturedOnError: ((error: unknown) => void) | null = null
let mockMutationState = {
  isPending: false,
  error: null as Error | null,
  reset: vi.fn(),
}

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: {
    mutationFn: (data: unknown) => Promise<unknown>
    onSuccess?: (result: unknown) => void
    onError?: (error: unknown) => void
  }) => {
    capturedMutationFn = options.mutationFn
    capturedOnSuccess = options.onSuccess ?? null
    capturedOnError = options.onError ?? null
    return {
      mutate: (data: unknown) => {
        if (capturedMutationFn) {
          capturedMutationFn(data)
            .then((result) => capturedOnSuccess?.(result))
            .catch((err) => capturedOnError?.(err))
        }
      },
      isPending: mockMutationState.isPending,
      error: mockMutationState.error,
      reset: mockMutationState.reset,
    }
  },
}))

// ── Import the component under test and the redirect helper ───────────
import SignInPage, { getRoleSafeRedirectPath } from '@/pages/auth/SignInPage'

describe('Sign-in page verification', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    mockNavigate.mockClear()
    mockSignIn.mockClear()
    mockMutationState = {
      isPending: false,
      error: null,
      reset: vi.fn(),
    }
    mockLocation.pathname = '/auth/signin'
    mockLocation.search = ''
    mockLocation.hash = ''
    mockLocation.state = null

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    root.unmount()
    container.remove()
    vi.clearAllMocks()
    capturedMutationFn = null
    capturedOnSuccess = null
    capturedOnError = null
  })

  async function renderAndWait(ms = 300) {
    root.render(<SignInPage />)
    await new Promise((r) => setTimeout(r, ms))
  }

  // ── Basic rendering ─────────────────────────────────────────────────

  it('renders without errors and shows the sign-in title', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Sign in')
  })

  it('renders email and password input fields', async () => {
    await renderAndWait()
    const emailInput = container.querySelector('input[type="email"]')
    const passwordInput = container.querySelector('input[type="password"]')
    expect(emailInput).toBeTruthy()
    expect(passwordInput).toBeTruthy()
  })

  it('renders the submit button', async () => {
    await renderAndWait()
    const button = container.querySelector('button[type="submit"]')
    expect(button).toBeTruthy()
    expect(button?.textContent).toContain('Sign in')
  })

  it('renders links to sign-up and forgot password pages', async () => {
    await renderAndWait()
    const html = container.innerHTML || ''
    expect(html).toContain('/auth/signup')
    expect(html).toContain('/auth/forgot-password')
  })

  // ── Form submission with Django login response ──────────────────────

  it('mutationFn calls signIn with email and password', async () => {
    // Simulate a successful Django login response
    mockSignIn.mockResolvedValue({
      user: {
        id: 'user-001',
        email: 'student@example.com',
        role: 'student',
        first_name: 'Jane',
        last_name: 'Doe',
      },
    })

    await renderAndWait()

    // Call the captured mutationFn directly with form data
    expect(capturedMutationFn).toBeDefined()
    const result = await capturedMutationFn!({
      email: 'student@example.com',
      password: 'password123',
    })

    expect(mockSignIn).toHaveBeenCalledWith('student@example.com', 'password123')
    expect(result).toEqual({
      user: {
        id: 'user-001',
        email: 'student@example.com',
        role: 'student',
        first_name: 'Jane',
        last_name: 'Doe',
      },
    })
  })

  it('mutationFn throws when signIn returns an error', async () => {
    mockSignIn.mockResolvedValue({ error: 'Invalid email or password.' })

    await renderAndWait()

    expect(capturedMutationFn).toBeDefined()
    await expect(
      capturedMutationFn!({ email: 'bad@example.com', password: 'wrong' })
    ).rejects.toThrow('Invalid email or password.')
  })

  // ── Role-based redirect (onSuccess) ─────────────────────────────────

  it('onSuccess redirects student to /student/dashboard', async () => {
    mockSignIn.mockResolvedValue({
      user: { id: 'u1', email: 's@example.com', role: 'student', first_name: 'S', last_name: 'T' },
    })

    await renderAndWait()

    // Simulate onSuccess with a student role result
    capturedOnSuccess?.({
      user: { id: 'u1', email: 's@example.com', role: 'student', first_name: 'S', last_name: 'T' },
    })

    await new Promise((r) => setTimeout(r, 100))
    expect(mockNavigate).toHaveBeenCalledWith('/student/dashboard', { replace: true })
  })

  it('onSuccess redirects admin to /admin/dashboard', async () => {
    await renderAndWait()

    capturedOnSuccess?.({
      user: { id: 'u2', email: 'a@example.com', role: 'admin', first_name: 'A', last_name: 'D' },
    })

    await new Promise((r) => setTimeout(r, 100))
    expect(mockNavigate).toHaveBeenCalledWith('/admin/dashboard', { replace: true })
  })

  it('onSuccess redirects super_admin to /admin/dashboard', async () => {
    await renderAndWait()

    capturedOnSuccess?.({
      user: { id: 'u3', email: 'sa@example.com', role: 'super_admin', first_name: 'S', last_name: 'A' },
    })

    await new Promise((r) => setTimeout(r, 100))
    expect(mockNavigate).toHaveBeenCalledWith('/admin/dashboard', { replace: true })
  })

  // ── Redirect with ?redirect= query param ───────────────────────────

  it('onSuccess respects ?redirect= for admin-allowed paths', async () => {
    mockLocation.search = '?redirect=/admin/applications'

    await renderAndWait()

    capturedOnSuccess?.({
      user: { id: 'u2', email: 'a@example.com', role: 'admin', first_name: 'A', last_name: 'D' },
    })

    await new Promise((r) => setTimeout(r, 100))
    expect(mockNavigate).toHaveBeenCalledWith('/admin/applications', { replace: true })
  })

  it('onSuccess ignores ?redirect= for cross-role paths', async () => {
    mockLocation.search = '?redirect=/admin/dashboard'

    await renderAndWait()

    // Student trying to redirect to admin path → should get student dashboard
    capturedOnSuccess?.({
      user: { id: 'u1', email: 's@example.com', role: 'student', first_name: 'S', last_name: 'T' },
    })

    await new Promise((r) => setTimeout(r, 100))
    expect(mockNavigate).toHaveBeenCalledWith('/student/dashboard', { replace: true })
  })

  // ── Error display ───────────────────────────────────────────────────

  it('shows error banner when mutation has an error', async () => {
    mockMutationState.error = new Error('Invalid email or password.')

    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('Invalid email or password')
  })

  it('shows loading state when mutation is pending', async () => {
    mockMutationState.isPending = true

    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('Signing in')
  })

  // ── getRoleSafeRedirectPath unit tests ──────────────────────────────

  describe('getRoleSafeRedirectPath', () => {
    it('returns /admin/dashboard for admin with no redirect', () => {
      expect(getRoleSafeRedirectPath({ requestedRedirect: null, role: 'admin' }))
        .toBe('/admin/dashboard')
    })

    it('returns /student/dashboard for student with no redirect', () => {
      expect(getRoleSafeRedirectPath({ requestedRedirect: null, role: 'student' }))
        .toBe('/student/dashboard')
    })

    it('returns /admin/dashboard for super_admin with no redirect', () => {
      expect(getRoleSafeRedirectPath({ requestedRedirect: null, role: 'super_admin' }))
        .toBe('/admin/dashboard')
    })

    it('allows admin redirect to /admin/applications', () => {
      expect(getRoleSafeRedirectPath({ requestedRedirect: '/admin/applications', role: 'admin' }))
        .toBe('/admin/applications')
    })

    it('allows student redirect to /student/payment', () => {
      expect(getRoleSafeRedirectPath({ requestedRedirect: '/student/payment', role: 'student' }))
        .toBe('/student/payment')
    })

    it('blocks student from admin paths', () => {
      expect(getRoleSafeRedirectPath({ requestedRedirect: '/admin/dashboard', role: 'student' }))
        .toBe('/student/dashboard')
    })

    it('blocks admin from student paths', () => {
      expect(getRoleSafeRedirectPath({ requestedRedirect: '/student/dashboard', role: 'admin' }))
        .toBe('/admin/dashboard')
    })

    it('returns default when redirect is /auth/signin', () => {
      expect(getRoleSafeRedirectPath({ requestedRedirect: '/auth/signin', role: 'student' }))
        .toBe('/student/dashboard')
    })

    it('returns default for unknown paths', () => {
      expect(getRoleSafeRedirectPath({ requestedRedirect: '/unknown/path', role: 'admin' }))
        .toBe('/admin/dashboard')
    })

    it('handles null role as non-admin', () => {
      expect(getRoleSafeRedirectPath({ requestedRedirect: null, role: null }))
        .toBe('/student/dashboard')
    })

    it('handles undefined role as non-admin', () => {
      expect(getRoleSafeRedirectPath({ requestedRedirect: null, role: undefined }))
        .toBe('/student/dashboard')
    })
  })
})
