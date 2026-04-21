/**
 * Unit Tests — AuthLayout Mobile Overflow Fixes
 *
 * **Validates: Requirements 2.1, 2.2, 3.1**
 *
 * Verifies that AuthLayout has the correct CSS classes to prevent
 * mobile overflow and preserves desktop layout classes.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

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

import { AuthLayout } from '@/components/auth/AuthLayout'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderLayout(variant: 'default' | 'signin' | 'signup' = 'default', showBranding = true) {
  const markup = renderToStaticMarkup(
    React.createElement(
      AuthLayout,
      { title: 'Test', variant, showBranding },
      React.createElement('div', null, 'content'),
    ),
  )
  const parser = new DOMParser()
  return parser.parseFromString(markup, 'text/html')
}

function classesOf(el: Element): string[] {
  return (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(Boolean)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthLayout mobile overflow fixes', () => {
  it('form panel flex column has min-w-0 class', () => {
    const doc = renderLayout()
    const flexColumns = doc.querySelectorAll('[class*="flex-1"][class*="flex-col"]')
    expect(flexColumns.length).toBeGreaterThan(0)

    const cls = classesOf(flexColumns[0]!)
    expect(cls).toContain('min-w-0')
  })

  it('form card container has overflow-hidden class', () => {
    const doc = renderLayout()
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

    const cls = classesOf(card!)
    expect(cls).toContain('overflow-hidden')
  })

  it('desktop layout preserves lg:w-1/2 on branding wrapper', () => {
    const doc = renderLayout('signin', true)
    const candidates = doc.querySelectorAll('[class*="lg:w-1/2"]')
    expect(candidates.length).toBeGreaterThan(0)

    let brandingWrapper: Element | null = null
    for (const el of candidates) {
      const cls = classesOf(el)
      if (cls.includes('hidden') && cls.includes('lg:flex')) {
        brandingWrapper = el
        break
      }
    }
    expect(brandingWrapper).not.toBeNull()
    expect(classesOf(brandingWrapper!)).toContain('lg:w-1/2')
  })

  it('desktop layout preserves lg:px-12 on FormPanel', () => {
    const doc = renderLayout('default', true)
    const allEls = doc.querySelectorAll('[class*="lg:px-12"]')
    let formPanel: Element | null = null
    for (const el of allEls) {
      const cls = typeof el.className === 'string' ? el.className : ''
      if (cls.includes('justify-center') && cls.includes('px-4')) {
        formPanel = el
        break
      }
    }
    expect(formPanel).not.toBeNull()
    expect(classesOf(formPanel!)).toContain('lg:px-12')
  })

  it('mobile gradient bar is present with lg:hidden', () => {
    const doc = renderLayout()
    const allElements = doc.querySelectorAll('[class*="lg:hidden"]')
    let gradientBar: Element | null = null
    for (const el of allElements) {
      const cls = typeof el.className === 'string' ? el.className : ''
      if (cls.includes('bg-gradient-to-r') && cls.includes('h-1')) {
        gradientBar = el
        break
      }
    }
    expect(gradientBar).not.toBeNull()
    expect(classesOf(gradientBar!)).toContain('lg:hidden')
  })
})
