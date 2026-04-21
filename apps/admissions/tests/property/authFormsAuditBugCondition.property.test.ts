/**
 * Bug Condition Exploration — Auth Forms Audit Fixes
 *
 * **Validates: Requirements 1.1, 1.4, 1.6**
 *
 * These tests encode the EXPECTED (fixed) behavior. They MUST FAIL on
 * unfixed code — failure confirms the bugs exist.
 *
 * Bug 1: AuthLayout form panel flex column should have `min-w-0` and
 *   the form card container should have `overflow-hidden` to prevent
 *   mobile overflow on narrow viewports.
 *   On UNFIXED code neither class is present → test FAILS.
 *
 * Bug 2: All auth page forms should have `method="post"` attribute.
 *   On UNFIXED code no form has an explicit method → test FAILS.
 *
 * Bug 3: ForgotPasswordPage and ResetPasswordPage forms should have
 *   `noValidate` attribute for consistent Zod-based validation.
 *   On UNFIXED code these forms lack noValidate → test FAILS.
 */
import React, { act } from 'react'
import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot } from 'react-dom/client'

// ---------------------------------------------------------------------------
// Mocks — keep auth pages renderable in a static context
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

import { AuthLayout } from '@/components/auth/AuthLayout'
import SignInPage from '@/pages/auth/SignInPage'
import SignUpPage from '@/pages/auth/SignUpPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'

// ---------------------------------------------------------------------------
// Bug 1 — AuthLayout mobile overflow: min-w-0 and overflow-hidden
// ---------------------------------------------------------------------------

describe('[PBT] Bug 1 — AuthLayout mobile overflow classes', () => {
  const arbVariant = fc.constantFrom('default' as const, 'signin' as const, 'signup' as const)

  it('form panel flex column has min-w-0 class', () => {
    fc.assert(
      fc.property(arbVariant, (variant) => {
        const markup = renderToStaticMarkup(
          React.createElement(
            AuthLayout,
            { title: 'Test', variant, showBranding: false },
            React.createElement('div', null, 'content'),
          ),
        )

        const parser = new DOMParser()
        const doc = parser.parseFromString(markup, 'text/html')

        // Find the flex column that wraps the form panel
        // It has classes: flex flex-1 flex-col overflow-y-auto
        const flexColumns = doc.querySelectorAll('[class*="flex-1"][class*="flex-col"]')
        expect(flexColumns.length).toBeGreaterThan(0)

        const flexCol = flexColumns[0]!
        const classes = flexCol.className.split(/\s+/)

        // EXPECTED (fixed): min-w-0 prevents flex child from overflowing
        // On UNFIXED code this class is missing → FAILS
        expect(classes).toContain('min-w-0')
      }),
      { numRuns: 10 },
    )
  })

  it('form card container has overflow-hidden class', () => {
    fc.assert(
      fc.property(arbVariant, (variant) => {
        const markup = renderToStaticMarkup(
          React.createElement(
            AuthLayout,
            { title: 'Test', variant, showBranding: false },
            React.createElement('div', null, 'content'),
          ),
        )

        const parser = new DOMParser()
        const doc = parser.parseFromString(markup, 'text/html')

        // Find the form card by its unique shadow-2xl class
        const allElements = doc.querySelectorAll('*')
        let card: Element | null = null
        for (const el of allElements) {
          const cls = typeof el.className === 'string' ? el.className : ''
          if (cls.includes('shadow-2xl') && cls.includes('backdrop-blur')) {
            card = el
            break
          }
        }
        expect(card).not.toBeNull()

        const classes = card!.className.split(/\s+/)

        // EXPECTED (fixed): overflow-hidden clips content beyond card boundary
        // On UNFIXED code this class is missing → FAILS
        expect(classes).toContain('overflow-hidden')
      }),
      { numRuns: 10 },
    )
  })
})

// ---------------------------------------------------------------------------
// Helpers — ResetPasswordPage starts in 'verifying' state and only shows
// the form after a useEffect sets status to 'ready'. renderToStaticMarkup
// does NOT execute effects. We use createRoot + act for client-side
// rendering which DOES run effects, allowing the component to transition
// from 'verifying' → 'ready' and render the form.
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
// Bug 2 — Form method="post" missing on all auth pages
// ---------------------------------------------------------------------------

describe('[PBT] Bug 2 — Auth forms have method="post"', () => {
  // Pages that render their form synchronously (no useEffect gating)
  const staticAuthPages = [
    { name: 'SignInPage', Component: SignInPage },
    { name: 'SignUpPage', Component: SignUpPage },
    { name: 'ForgotPasswordPage', Component: ForgotPasswordPage },
  ] as const

  const arbStaticPage = fc.constantFrom(...staticAuthPages)

  it('every static auth page form element has method="post"', () => {
    fc.assert(
      fc.property(arbStaticPage, ({ Component }) => {
        const markup = renderToStaticMarkup(React.createElement(Component))
        const parser = new DOMParser()
        const doc = parser.parseFromString(markup, 'text/html')

        const form = doc.querySelector('form')
        expect(form).not.toBeNull()

        // EXPECTED (fixed): form has method="post"
        // On UNFIXED code, no form has an explicit method attribute → FAILS
        expect(form!.getAttribute('method')).toBe('post')
      }),
      { numRuns: 20 },
    )
  })

  it('ResetPasswordPage form element has method="post"', async () => {
    // ResetPasswordPage gates its form behind a useEffect state transition
    // (verifying → ready). renderToStaticMarkup doesn't run effects, so we
    // use createRoot + act for client-side rendering instead.
    const container = await renderResetPasswordPageDOM()

    const form = container.querySelector('form')
    expect(form).not.toBeNull()
    expect(form!.getAttribute('method')).toBe('post')

    document.body.removeChild(container)
  })
})

// ---------------------------------------------------------------------------
// Bug 3 — ForgotPasswordPage and ResetPasswordPage missing noValidate
// ---------------------------------------------------------------------------

describe('[PBT] Bug 3 — ForgotPasswordPage and ResetPasswordPage have noValidate', () => {
  it('ForgotPasswordPage form element has noValidate attribute', () => {
    const markup = renderToStaticMarkup(React.createElement(ForgotPasswordPage))
    const parser = new DOMParser()
    const doc = parser.parseFromString(markup, 'text/html')

    const form = doc.querySelector('form')
    expect(form).not.toBeNull()

    // EXPECTED (fixed): form has noValidate (rendered as novalidate in HTML)
    // On UNFIXED code, this form lacks noValidate → FAILS
    expect(form!.hasAttribute('novalidate')).toBe(true)
  })

  it('ResetPasswordPage form element has noValidate attribute', async () => {
    // Same createRoot + act approach as Bug 2 — effects must run
    const container = await renderResetPasswordPageDOM()

    const form = container.querySelector('form')
    expect(form).not.toBeNull()

    // EXPECTED (fixed): form has noValidate (rendered as novalidate in HTML)
    // On UNFIXED code, this form lacks noValidate → FAILS
    expect(form!.hasAttribute('novalidate')).toBe(true)

    document.body.removeChild(container)
  })
})
