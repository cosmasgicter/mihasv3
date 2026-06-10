/**
 * Unit Tests — AuthShell Layout Structure
 *
 * **Validates: Requirements 2.1, 2.2, 3.1**
 *
 * Verifies that AuthShell has the correct structure: single-column layout,
 * brand wordmark, form card, footer divider, and trust note.
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

import { AuthShell } from '@/components/auth/AuthShell'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderShell(title = 'Test', footer?: React.ReactNode) {
  const markup = renderToStaticMarkup(
    React.createElement(
      AuthShell,
      { title, footer, children: React.createElement('div', null, 'content') },
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

describe('AuthShell layout structure', () => {
  it('outer wrapper has min-h-dvh and bg-muted', () => {
    const doc = renderShell()
    const outer = doc.querySelector('[class*="min-h-dvh"][class*="bg-muted"]')
    expect(outer).not.toBeNull()
  })

  it('inner column has max-w-md and mx-auto centering', () => {
    const doc = renderShell()
    const inner = doc.querySelector('[class*="max-w-md"]')
    expect(inner).not.toBeNull()

    const cls = classesOf(inner!)
    expect(cls).toContain('mx-auto')
    expect(cls).toContain('flex-col')
  })

  it('form card is a <main> with rounded-xl border bg-card', () => {
    const doc = renderShell()
    const main = doc.querySelector('main')
    expect(main).not.toBeNull()

    const cls = classesOf(main!)
    expect(cls).toContain('rounded-xl')
    expect(cls).toContain('bg-card')
    expect(cls).toContain('border')
  })

  it('form card has p-6 sm:p-8 responsive padding', () => {
    const doc = renderShell()
    const main = doc.querySelector('main')
    expect(main).not.toBeNull()

    const cls = classesOf(main!)
    expect(cls).toContain('p-6')
    expect(cls).toContain('sm:p-8')
  })

  it('brand link is present with aria-label', () => {
    const doc = renderShell()
    const brandLink = doc.querySelector('a[aria-label="Beanola home"]')
    expect(brandLink).not.toBeNull()
  })

  it('footer divider renders when footer prop is provided', () => {
    const doc = renderShell('Test', React.createElement('span', null, 'footer'))
    const divider = doc.querySelector('[class*="border-t"]')
    expect(divider).not.toBeNull()
  })

  it('title renders as h1 inside main', () => {
    const doc = renderShell('Welcome Back')
    const h1 = doc.querySelector('main h1')
    expect(h1).not.toBeNull()
    expect(h1!.textContent).toBe('Welcome Back')
  })
})
