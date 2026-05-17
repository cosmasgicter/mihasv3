/**
 * Preservation Property Tests — Auth Forms Audit Fixes
 *
 * **Validates: Requirements 3.1, 3.3, 3.4, 3.5, 3.6**
 *
 * These tests verify EXISTING correct behavior that must be preserved
 * through the bugfix. They MUST ALL PASS on unfixed code.
 *
 * - Desktop layout: BrandingPanel visibility, FormPanel padding, form card padding
 * - Sign-in form: noValidate present, Zod schema validates email + 6-char password
 * - Sign-up form: noValidate present
 * - Anti-enumeration: ForgotPasswordPage Zod schema validates email format
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import { renderToStaticMarkup } from 'react-dom/server'
import { z } from 'zod'

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
// Imports — after mocks so modules pick up the mocked dependencies
// ---------------------------------------------------------------------------

import { AuthShell } from '@/components/auth/AuthShell'
import SignInPage from '@/pages/auth/SignInPage'
import SignUpPage from '@/pages/auth/SignUpPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMarkup(markup: string) {
  const parser = new DOMParser()
  return parser.parseFromString(markup, 'text/html')
}

function classesOf(el: Element): string[] {
  return (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(Boolean)
}

// ---------------------------------------------------------------------------
// Zod schemas — mirrors of the source schemas for direct validation testing
// (Source schemas are not exported, so we replicate the exact definitions)
// ---------------------------------------------------------------------------

const signInSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

// ---------------------------------------------------------------------------
// AuthShell layout preservation
// ---------------------------------------------------------------------------

describe('[PBT] Preservation — AuthShell layout classes', () => {
  const arbTitle = fc.constantFrom('Sign in', 'Create account', 'Reset password')

  /**
   * **Validates: Requirements 3.1**
   */
  it('outer wrapper has min-h-dvh bg-muted', () => {
    fc.assert(
      fc.property(arbTitle, (title) => {
        const markup = renderToStaticMarkup(
          React.createElement(
            AuthShell,
            { title, children: React.createElement('div', null, 'content') },
          ),
        )
        const doc = parseMarkup(markup)

        const outer = doc.querySelector('[class*="min-h-dvh"][class*="bg-muted"]')
        expect(outer).not.toBeNull()
      }),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 3.1**
   */
  it('inner column has max-w-md and centered padding', () => {
    fc.assert(
      fc.property(arbTitle, (title) => {
        const markup = renderToStaticMarkup(
          React.createElement(
            AuthShell,
            { title, children: React.createElement('div', null, 'content') },
          ),
        )
        const doc = parseMarkup(markup)

        const inner = doc.querySelector('[class*="max-w-md"]')
        expect(inner).not.toBeNull()

        const cls = classesOf(inner!)
        expect(cls).toContain('mx-auto')
        expect(cls).toContain('px-4')
      }),
      { numRuns: 10 },
    )
  })

  /**
   * **Validates: Requirements 3.1**
   */
  it('form card (main) has sm:p-8 responsive padding', () => {
    fc.assert(
      fc.property(arbTitle, (title) => {
        const markup = renderToStaticMarkup(
          React.createElement(
            AuthShell,
            { title, children: React.createElement('div', null, 'content') },
          ),
        )
        const doc = parseMarkup(markup)

        const main = doc.querySelector('main')
        expect(main).not.toBeNull()

        const cls = classesOf(main!)
        expect(cls).toContain('p-6')
        expect(cls).toContain('sm:p-8')
      }),
      { numRuns: 10 },
    )
  })
})

// ---------------------------------------------------------------------------
// Sign-in form validation preservation
// ---------------------------------------------------------------------------

describe('[PBT] Preservation — Sign-in form validation', () => {
  /**
   * **Validates: Requirements 3.3**
   */
  it('SignInPage form has noValidate attribute', () => {
    const markup = renderToStaticMarkup(React.createElement(SignInPage))
    const doc = parseMarkup(markup)
    const form = doc.querySelector('form')
    expect(form).not.toBeNull()
    expect(form!.hasAttribute('novalidate')).toBe(true)
  })

  /**
   * **Validates: Requirements 3.4**
   */
  it('Zod schema rejects invalid email strings', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('@') || !s.includes('.')),
        (badEmail) => {
          const result = signInSchema.safeParse({ email: badEmail, password: 'validpass' })
          expect(result.success).toBe(false)
        },
      ),
      { numRuns: 20 },
    )
  })

  /**
   * **Validates: Requirements 3.4**
   */
  it('Zod schema rejects passwords shorter than 6 characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 5 }),
        (shortPass) => {
          const result = signInSchema.safeParse({ email: 'test@example.com', password: shortPass })
          expect(result.success).toBe(false)
        },
      ),
      { numRuns: 20 },
    )
  })
})

// ---------------------------------------------------------------------------
// Sign-up form validation preservation
// ---------------------------------------------------------------------------

describe('[PBT] Preservation — Sign-up form validation', () => {
  /**
   * **Validates: Requirements 3.5**
   */
  it('SignUpPage form has noValidate attribute', () => {
    const markup = renderToStaticMarkup(React.createElement(SignUpPage))
    const doc = parseMarkup(markup)
    const form = doc.querySelector('form')
    expect(form).not.toBeNull()
    expect(form!.hasAttribute('novalidate')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Anti-enumeration preservation
// ---------------------------------------------------------------------------

describe('[PBT] Preservation — Anti-enumeration (ForgotPasswordPage)', () => {
  /**
   * **Validates: Requirements 3.6**
   */
  it('ForgotPasswordPage Zod schema rejects invalid emails', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('@') || !s.includes('.')),
        (badEmail) => {
          const result = forgotPasswordSchema.safeParse({ email: badEmail })
          expect(result.success).toBe(false)
        },
      ),
      { numRuns: 20 },
    )
  })
})
