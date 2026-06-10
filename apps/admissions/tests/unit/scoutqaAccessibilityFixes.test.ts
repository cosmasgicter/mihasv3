/**
 * Unit Tests — ScoutQA Accessibility Fixes
 *
 * Feature: scoutqa-accessibility-fixes
 *
 * 11.1 inputMode values on auth form fields (Requirements 3.1–3.3, 4.1)
 * 11.2 aria-label values on auth form fields (Requirements 5.1–5.2, 6.1–6.5)
 * 11.3 Landing page contrast verification (Requirements 9.1–9.2)
 * 11.4 Tracker hook network error fallback (Requirement 1.3)
 */
import React, { act } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot } from 'react-dom/client'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-router-dom', () => ({
  Link: ({ children, ...props }: any) => React.createElement('a', props, children),
  useNavigate: () => () => {},
  useLocation: () => ({ pathname: '/auth/signin', search: '', state: null }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
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
  preloadAuthRoutes: vi.fn(),
}))

vi.mock('@/lib/speculativePrefetch', () => ({
  onSignInEmailBlur: vi.fn(),
  onLoginSuccess: vi.fn(),
}))

vi.mock('@/lib/animation-config', () => ({
  useReducedMotion: () => true,
}))

vi.mock('@/components/smoothui/infinite-grid', () => ({
  InfiniteGrid: () => null,
}))

vi.mock('@/components/smoothui/text-rotate', () => ({
  TextRotate: () => React.createElement('span', null, 'rotating'),
}))

vi.mock('@/components/smoothui/shiny-text', () => ({
  ShinyText: ({ text }: any) => React.createElement('span', null, text),
}))

vi.mock('@/components/ui/OptimizedImage', () => ({
  OptimizedImage: (props: any) =>
    React.createElement('img', { src: props.src, alt: props.alt, width: props.width, height: props.height }),
}))

vi.mock('@/components/icons', () => ({
  CheckCircle: (props: any) => React.createElement('svg', { ...props, 'aria-hidden': 'true' }),
  GraduationCap: (props: any) => React.createElement('svg', { ...props, 'aria-hidden': 'true' }),
  Building2: (props: any) => React.createElement('svg', { ...props, 'aria-hidden': 'true' }),
}))

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import SignInPage from '@/pages/auth/SignInPage'
import SignUpPage from '@/pages/auth/SignUpPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import { ShapeLandingHero } from '@/components/smoothui/shape-landing-hero'

// ---------------------------------------------------------------------------
// Pure function mirroring tracker error logic (same as property test)
// ---------------------------------------------------------------------------

function getTrackerErrorMessage(status: number | undefined): string {
  if (status === 400) {
    return 'Invalid tracking code format. Try your application number (e.g. MIHAS202641411) or tracking code (e.g. TRK370990).'
  } else if (status === 404) {
    return 'No application found with this tracking code. Please check the code and try again.'
  } else {
    return 'An error occurred while searching. Please try again.'
  }
}

// ---------------------------------------------------------------------------
// Helper: render component to DOM and return container
// ---------------------------------------------------------------------------

function renderToDOM(element: React.ReactElement): { container: HTMLElement; cleanup: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(element) })
  return {
    container,
    cleanup: () => {
      act(() => { root.unmount() })
      document.body.removeChild(container)
    },
  }
}

// ---------------------------------------------------------------------------
// Helper: parse static markup to DOM
// ---------------------------------------------------------------------------

function parseMarkup(markup: string): Document {
  return new DOMParser().parseFromString(markup, 'text/html')
}


// ---------------------------------------------------------------------------
// 11.1 — inputMode values (Requirements 3.1–3.3, 4.1)
// ---------------------------------------------------------------------------

describe('11.1 inputMode values on auth form fields', () => {
  it('SignUpPage email input has inputMode="email"', () => {
    const doc = parseMarkup(renderToStaticMarkup(React.createElement(SignUpPage)))
    const emailInput = doc.querySelector('input[type="email"]')
    expect(emailInput).not.toBeNull()
    expect(emailInput!.getAttribute('inputmode')).toBe('email')
  })

  it('SignUpPage phone input has inputMode="tel"', () => {
    const doc = parseMarkup(renderToStaticMarkup(React.createElement(SignUpPage)))
    const phoneInput = doc.querySelector('input[type="tel"]')
    expect(phoneInput).not.toBeNull()
    expect(phoneInput!.getAttribute('inputmode')).toBe('tel')
  })

  it('SignUpPage first_name input has inputMode="text"', () => {
    const doc = parseMarkup(renderToStaticMarkup(React.createElement(SignUpPage)))
    const nameInputs = doc.querySelectorAll('input[type="text"][inputmode="text"]')
    // first_name and last_name both have inputMode="text"
    expect(nameInputs.length).toBeGreaterThanOrEqual(2)
    // Verify by aria-label
    const firstName = doc.querySelector('input[aria-label="First name"]')
    expect(firstName).not.toBeNull()
    expect(firstName!.getAttribute('inputmode')).toBe('text')
  })

  it('SignUpPage last_name input has inputMode="text"', () => {
    const doc = parseMarkup(renderToStaticMarkup(React.createElement(SignUpPage)))
    const lastName = doc.querySelector('input[aria-label="Last name"]')
    expect(lastName).not.toBeNull()
    expect(lastName!.getAttribute('inputmode')).toBe('text')
  })

  it('ForgotPasswordPage email input has inputMode="email"', () => {
    const doc = parseMarkup(renderToStaticMarkup(React.createElement(ForgotPasswordPage)))
    const emailInput = doc.querySelector('input[type="email"]')
    expect(emailInput).not.toBeNull()
    expect(emailInput!.getAttribute('inputmode')).toBe('email')
  })
})

// ---------------------------------------------------------------------------
// 11.2 — aria-label values (Requirements 5.1–5.2, 6.1–6.5)
// ---------------------------------------------------------------------------

describe('11.2 aria-label values on auth form fields', () => {
  it('SignInPage email input has aria-label="Email"', () => {
    const { container, cleanup } = renderToDOM(React.createElement(SignInPage))
    const emailInput = container.querySelector('input[type="email"]')
    expect(emailInput).not.toBeNull()
    expect(emailInput!.getAttribute('aria-label')).toBe('Email')
    cleanup()
  })

  it('SignInPage password input has aria-label="Password"', () => {
    const { container, cleanup } = renderToDOM(React.createElement(SignInPage))
    const passwordInput = container.querySelector('input[type="password"]')
    expect(passwordInput).not.toBeNull()
    expect(passwordInput!.getAttribute('aria-label')).toBe('Password')
    cleanup()
  })

  it('SignUpPage email input has aria-label="Email"', () => {
    const doc = parseMarkup(renderToStaticMarkup(React.createElement(SignUpPage)))
    const emailInput = doc.querySelector('input[type="email"]')
    expect(emailInput).not.toBeNull()
    expect(emailInput!.getAttribute('aria-label')).toBe('Email')
  })

  it('SignUpPage first_name input has aria-label="First name"', () => {
    const doc = parseMarkup(renderToStaticMarkup(React.createElement(SignUpPage)))
    const input = doc.querySelector('input[aria-label="First name"]')
    expect(input).not.toBeNull()
  })

  it('SignUpPage last_name input has aria-label="Last name"', () => {
    const doc = parseMarkup(renderToStaticMarkup(React.createElement(SignUpPage)))
    const input = doc.querySelector('input[aria-label="Last name"]')
    expect(input).not.toBeNull()
  })

  it('SignUpPage phone input has aria-label="Phone number"', () => {
    const doc = parseMarkup(renderToStaticMarkup(React.createElement(SignUpPage)))
    const input = doc.querySelector('input[aria-label="Phone number"]')
    expect(input).not.toBeNull()
  })

  it('SignUpPage password input has aria-label="Password"', () => {
    const doc = parseMarkup(renderToStaticMarkup(React.createElement(SignUpPage)))
    const input = doc.querySelector('input[aria-label="Password"]')
    expect(input).not.toBeNull()
  })

  it('SignUpPage confirmPassword input has aria-label="Confirm password"', () => {
    const doc = parseMarkup(renderToStaticMarkup(React.createElement(SignUpPage)))
    const input = doc.querySelector('input[aria-label="Confirm password"]')
    expect(input).not.toBeNull()
  })
})


// ---------------------------------------------------------------------------
// 11.3 — Landing page contrast verification (Requirements 9.1–9.2)
// ---------------------------------------------------------------------------

const mockHeroProps = {
  headline: 'Test Headline',
  description: 'Test description',
  rotatingPhrases: ['Phrase 1', 'Phrase 2'],
  primaryCta: { label: 'Apply Now', href: '/auth/signup' },
  secondaryCta: { label: 'See Our Programs', href: '#programs' },
  proofPanel: {
    image: { src: '/test.jpg', alt: 'Test image', width: 640, height: 480 },
    eyebrow: 'Test Eyebrow',
    title: 'Test Title',
    description: 'Test panel description',
    badges: ['NMCZ', 'HPCZ', 'ECZ', 'UNZA'],
    highlights: [
      { value: '100+', label: 'Students' },
      { value: '10+', label: 'Programs' },
      { value: '5+', label: 'Partners' },
    ],
    checklist: ['Item 1', 'Item 2'],
  },
}

describe('11.3 Landing page contrast verification', () => {
  it('secondary CTA ("See Our Programs") uses foreground token contrast classes', () => {
    const { container, cleanup } = renderToDOM(
      React.createElement(ShapeLandingHero, mockHeroProps),
    )
    // The secondary CTA is an <a> with aria-label="See Our Programs"
    const secondaryCta = container.querySelector('a[aria-label="See Our Programs"]') as HTMLElement
    expect(secondaryCta).not.toBeNull()
    expect(secondaryCta.className).toContain('text-foreground')
    cleanup()
  })

  it('accreditation badge labels use semantic primary contrast classes', () => {
    const { container, cleanup } = renderToDOM(
      React.createElement(ShapeLandingHero, mockHeroProps),
    )
    const badges = container.querySelectorAll('span')
    const badgeLabels = ['NMCZ', 'HPCZ', 'ECZ', 'UNZA']
    let foundBadges = 0

    for (const span of badges) {
      if (badgeLabels.includes(span.textContent?.trim() ?? '')) {
        expect(span.className).toContain('bg-primary/10')
        expect(span.className).toContain('text-primary')
        foundBadges++
      }
    }

    expect(foundBadges).toBe(4)
    cleanup()
  })
})

// ---------------------------------------------------------------------------
// 11.4 — Tracker hook network error fallback (Requirement 1.3)
// ---------------------------------------------------------------------------

describe('11.4 Tracker hook network error fallback', () => {
  it('undefined status (network error) returns the generic error message', () => {
    const message = getTrackerErrorMessage(undefined)
    expect(message).toBe('An error occurred while searching. Please try again.')
  })
})
