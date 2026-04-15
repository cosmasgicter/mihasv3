/**
 * Unit Tests — Auth Form method="post" and noValidate Attributes
 *
 * **Validates: Requirements 2.3, 2.4, 3.3**
 *
 * Verifies that all auth page forms have method="post" and noValidate.
 * Uses createRoot + act for ResetPasswordPage (useEffect gating).
 */
import React, { act } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot } from 'react-dom/client'

// ---------------------------------------------------------------------------
// Mocks — same patterns as bug condition test file
// ---------------------------------------------------------------------------

vi.mock('react-router-dom', () => ({
  Link: ({ children, ...props }: any) => React.createElement('a', props, children),
  useNavigate: () => () => {},
  useLocation: () => ({ pathname: '/auth/signin', search: '', state: null }),
  useSearchParams: () => [new URLSearchParams('?token=test-token'), vi.fn()],
  MemoryRouter: ({ children }: any) => React.createElement('div', null, children),
}))

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
    reset: vi.fn(),
  }),
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: any) => React.createElement('div', null, children),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    signUp: vi.fn(),
    requestPasswordReset: vi.fn(),
  }),
}))

vi.mock('@/components/seo/Seo', () => ({
  Seo: () => null,
}))

vi.mock('@/lib/apiErrorLogger', () => ({
  logApiError: vi.fn(),
}))

vi.mock('@/lib/routePreload', () => ({
  preloadStudentWorkspaceRoute: vi.fn(),
  preloadPostAuthWorkspace: vi.fn(),
}))

vi.mock('@/lib/speculativePrefetch', () => ({
  onSignInEmailBlur: vi.fn(),
  onLoginSuccess: vi.fn(),
}))

vi.mock('@/services/auth', () => ({
  authService: {
    passwordResetConfirm: vi.fn(),
  },
}))

vi.mock('@/lib/animation-config', () => ({
  useReducedMotion: () => true,
}))

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import SignInPage from '@/pages/auth/SignInPage'
import SignUpPage from '@/pages/auth/SignUpPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'

// ---------------------------------------------------------------------------
// Helper — ResetPasswordPage gates its form behind a useEffect state
// transition (verifying → ready). renderToStaticMarkup does NOT execute
// effects, so we use createRoot + act for client-side rendering.
// ---------------------------------------------------------------------------

async function renderResetPasswordPageDOM(): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(React.createElement(ResetPasswordPage))
  })

  return container
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Auth form method="post" attribute', () => {
  it('SignInPage form has method="post"', () => {
    const markup = renderToStaticMarkup(React.createElement(SignInPage))
    const doc = new DOMParser().parseFromString(markup, 'text/html')
    const form = doc.querySelector('form')
    expect(form).not.toBeNull()
    expect(form!.getAttribute('method')).toBe('post')
  })

  it('SignUpPage form has method="post"', () => {
    const markup = renderToStaticMarkup(React.createElement(SignUpPage))
    const doc = new DOMParser().parseFromString(markup, 'text/html')
    const form = doc.querySelector('form')
    expect(form).not.toBeNull()
    expect(form!.getAttribute('method')).toBe('post')
  })

  it('ForgotPasswordPage form has method="post"', () => {
    const markup = renderToStaticMarkup(React.createElement(ForgotPasswordPage))
    const doc = new DOMParser().parseFromString(markup, 'text/html')
    const form = doc.querySelector('form')
    expect(form).not.toBeNull()
    expect(form!.getAttribute('method')).toBe('post')
  })

  it('ResetPasswordPage form has method="post"', async () => {
    const container = await renderResetPasswordPageDOM()
    const form = container.querySelector('form')
    expect(form).not.toBeNull()
    expect(form!.getAttribute('method')).toBe('post')
    document.body.removeChild(container)
  })
})

describe('Auth form noValidate attribute', () => {
  it('SignInPage form has noValidate', () => {
    const markup = renderToStaticMarkup(React.createElement(SignInPage))
    const doc = new DOMParser().parseFromString(markup, 'text/html')
    const form = doc.querySelector('form')
    expect(form).not.toBeNull()
    expect(form!.hasAttribute('novalidate')).toBe(true)
  })

  it('SignUpPage form has noValidate', () => {
    const markup = renderToStaticMarkup(React.createElement(SignUpPage))
    const doc = new DOMParser().parseFromString(markup, 'text/html')
    const form = doc.querySelector('form')
    expect(form).not.toBeNull()
    expect(form!.hasAttribute('novalidate')).toBe(true)
  })

  it('ForgotPasswordPage form has noValidate', () => {
    const markup = renderToStaticMarkup(React.createElement(ForgotPasswordPage))
    const doc = new DOMParser().parseFromString(markup, 'text/html')
    const form = doc.querySelector('form')
    expect(form).not.toBeNull()
    expect(form!.hasAttribute('novalidate')).toBe(true)
  })

  it('ResetPasswordPage form has noValidate', async () => {
    const container = await renderResetPasswordPageDOM()
    const form = container.querySelector('form')
    expect(form).not.toBeNull()
    expect(form!.hasAttribute('novalidate')).toBe(true)
    document.body.removeChild(container)
  })
})
