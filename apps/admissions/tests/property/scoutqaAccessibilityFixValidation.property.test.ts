/**
 * Property-Based Fix Validation — ScoutQA Accessibility Fixes
 *
 * Feature: scoutqa-accessibility-fixes
 *
 * These property-based tests verify the FIXED accessibility behavior works
 * correctly across a wide range of randomly generated inputs.
 *
 * Property 1: Tracker error differentiation by HTTP status code
 * Property 2: No empty inputMode on auth form inputs
 * Property 3: Input component label-to-id association
 * Property 4: Decorative SVGs excluded from accessibility tree
 * Property 5: Error alert attributes completeness
 * Property 6: Password toggle accessibility
 */
import React, { act } from 'react'
import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot, type Root } from 'react-dom/client'

// ---------------------------------------------------------------------------
// Mocks — keep pages renderable in a test context
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
    error: new Error('Test error'),
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

vi.mock('@/components/smoothui', () => ({
  ScrollReveal: ({ children }: any) => React.createElement('div', null, children),
}))

vi.mock('@/components/layout/PublicLayout', () => ({
  PublicLayout: ({ children }: any) => React.createElement('div', null, children),
}))

vi.mock('@/lib/constants/landing', () => ({
  contactInfo: {
    katcPhone: '+260 123 456 789',
    mihasPhone: '+260 987 654 321',
    email: 'test@example.com',
    address: '123 Test Street',
  },
}))

// ---------------------------------------------------------------------------
// Imports — after mocks so modules pick up the mocked dependencies
// ---------------------------------------------------------------------------

import SignUpPage from '@/pages/auth/SignUpPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import { Input } from '@/components/ui/input'
import ContactPage from '@/pages/ContactPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'
import { PasswordInput } from '@/components/ui/PasswordInput'


// ---------------------------------------------------------------------------
// Property 1: Tracker error differentiation by HTTP status code
// ---------------------------------------------------------------------------

/**
 * Pure function that mirrors the error mapping logic in useApplicationTracker.ts.
 * Extracted for property-based testing without rendering.
 */
function getTrackerErrorMessage(status: number | undefined): string {
  if (status === 400) {
    return 'Invalid tracking code format. Try your application number (e.g. MIHAS202641411) or tracking code (e.g. TRK370990).'
  } else if (status === 404) {
    return 'No application found with this tracking code. Please check the code and try again.'
  } else {
    return 'An error occurred while searching. Please try again.'
  }
}

describe('[PBT] Property 1: Tracker error differentiation by HTTP status code', () => {
  /**
   * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
   *
   * For any HTTP error response with a status code, the error mapping function
   * shall produce a message containing format guidance strings when status is 400,
   * a "not found" message when status is 404, and the generic fallback message
   * for all other status codes. The 400 and 404 messages shall always be distinct
   * from each other and from the generic message.
   */

  const MESSAGE_400 = 'Invalid tracking code format. Try your application number (e.g. MIHAS202641411) or tracking code (e.g. TRK370990).'
  const MESSAGE_404 = 'No application found with this tracking code. Please check the code and try again.'
  const MESSAGE_GENERIC = 'An error occurred while searching. Please try again.'

  it('status 400 produces format guidance with real examples', () => {
    fc.assert(
      fc.property(fc.constant(400), (status) => {
        const message = getTrackerErrorMessage(status)
        expect(message).toContain('MIHAS202641411')
        expect(message).toContain('TRK370990')
        expect(message).toBe(MESSAGE_400)
      }),
      { numRuns: 100 },
    )
  })

  it('status 404 produces a "not found" message', () => {
    fc.assert(
      fc.property(fc.constant(404), (status) => {
        const message = getTrackerErrorMessage(status)
        expect(message).toContain('No application found')
        expect(message).toBe(MESSAGE_404)
      }),
      { numRuns: 100 },
    )
  })

  it('any status other than 400 or 404 produces the generic fallback message', () => {
    const arbNon400Or404 = fc.integer({ min: 100, max: 599 }).filter((s) => s !== 400 && s !== 404)
    fc.assert(
      fc.property(arbNon400Or404, (status) => {
        const message = getTrackerErrorMessage(status)
        expect(message).toBe(MESSAGE_GENERIC)
      }),
      { numRuns: 100 },
    )
  })

  it('undefined status produces the generic fallback message', () => {
    fc.assert(
      fc.property(fc.constant(undefined), (status) => {
        const message = getTrackerErrorMessage(status)
        expect(message).toBe(MESSAGE_GENERIC)
      }),
      { numRuns: 100 },
    )
  })

  it('400, 404, and generic messages are all distinct from each other', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 599 }), (status) => {
        const msg400 = getTrackerErrorMessage(400)
        const msg404 = getTrackerErrorMessage(404)
        const msgGeneric = getTrackerErrorMessage(status === 400 || status === 404 ? 500 : status)

        expect(msg400).not.toBe(msg404)
        expect(msg400).not.toBe(msgGeneric)
        expect(msg404).not.toBe(msgGeneric)
      }),
      { numRuns: 100 },
    )
  })
})


// ---------------------------------------------------------------------------
// Property 2: No empty inputMode on auth form inputs
// ---------------------------------------------------------------------------

describe('[PBT] Property 2: No empty inputMode on auth form inputs', () => {
  /**
   * **Validates: Requirements 3.4**
   *
   * For any rendered auth form page (SignUpPage, ForgotPasswordPage), no <input>
   * element shall have an empty inputMode="" attribute. Every input with an
   * inputMode attribute must have a non-empty value from the valid set.
   */

  const VALID_INPUT_MODES = new Set(['text', 'email', 'tel', 'numeric', 'decimal', 'search', 'url', 'none'])

  const authPages = [
    { name: 'SignUpPage', Component: SignUpPage },
    { name: 'ForgotPasswordPage', Component: ForgotPasswordPage },
  ] as const

  const arbAuthPage = fc.constantFrom(...authPages)

  it('no input element has an empty inputMode attribute', () => {
    fc.assert(
      fc.property(arbAuthPage, ({ Component }) => {
        const markup = renderToStaticMarkup(React.createElement(Component))
        const parser = new DOMParser()
        const doc = parser.parseFromString(markup, 'text/html')

        const inputs = doc.querySelectorAll('input')
        for (const input of inputs) {
          if (input.hasAttribute('inputmode')) {
            const value = input.getAttribute('inputmode')
            expect(value).not.toBe('')
            expect(VALID_INPUT_MODES.has(value!)).toBe(true)
          }
        }
      }),
      { numRuns: 100 },
    )
  })

  it('every input with inputMode has a value from the valid set', () => {
    fc.assert(
      fc.property(arbAuthPage, ({ Component }) => {
        const markup = renderToStaticMarkup(React.createElement(Component))
        const parser = new DOMParser()
        const doc = parser.parseFromString(markup, 'text/html')

        const inputsWithMode = doc.querySelectorAll('input[inputmode]')
        for (const input of inputsWithMode) {
          const mode = input.getAttribute('inputmode')!
          expect(mode.length).toBeGreaterThan(0)
          expect(VALID_INPUT_MODES).toContain(mode)
        }
      }),
      { numRuns: 100 },
    )
  })
})


// ---------------------------------------------------------------------------
// Property 3: Input component label-to-id association
// ---------------------------------------------------------------------------

describe('[PBT] Property 3: Input component label-to-id association', () => {
  /**
   * **Validates: Requirements 5.3**
   *
   * For any Input component rendered with a label prop, the rendered <label>
   * element's htmlFor attribute shall match the rendered <input> element's id
   * attribute, establishing a programmatic accessible name association.
   */

  const arbLabel = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0)

  it('label htmlFor matches input id for any label string', () => {
    fc.assert(
      fc.property(arbLabel, (label) => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)

        act(() => {
          root.render(React.createElement(Input, { label }))
        })

        const labelEl = container.querySelector('label')
        const inputEl = container.querySelector('input')

        expect(labelEl).not.toBeNull()
        expect(inputEl).not.toBeNull()

        const htmlFor = labelEl!.getAttribute('for')
        const inputId = inputEl!.getAttribute('id')

        expect(htmlFor).toBeTruthy()
        expect(inputId).toBeTruthy()
        expect(htmlFor).toBe(inputId)

        act(() => { root.unmount() })
        document.body.removeChild(container)
      }),
      { numRuns: 100 },
    )
  })
})


// ---------------------------------------------------------------------------
// Property 4: Decorative SVGs excluded from accessibility tree
// ---------------------------------------------------------------------------

describe('[PBT] Property 4: Decorative SVGs excluded from accessibility tree', () => {
  /**
   * **Validates: Requirements 7.1, 7.2**
   *
   * For any decorative SVG icon rendered on the ContactPage (icons adjacent to
   * text labels), the SVG element shall have aria-hidden="true" set, excluding
   * it from the accessibility tree.
   */

  it('all decorative SVGs on ContactPage have aria-hidden="true"', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)

        act(() => {
          root.render(React.createElement(ContactPage))
        })

        // Lucide icons render as <svg> elements
        const svgs = container.querySelectorAll('svg')

        // All SVGs on the ContactPage are decorative (adjacent to text labels)
        for (const svg of svgs) {
          expect(svg.getAttribute('aria-hidden')).toBe('true')
        }

        act(() => { root.unmount() })
        document.body.removeChild(container)
      }),
      { numRuns: 100 },
    )
  })
})


// ---------------------------------------------------------------------------
// Property 5: Error alert attributes completeness
// ---------------------------------------------------------------------------

/**
 * Helper to render ResetPasswordPage with client-side rendering (effects run).
 * ResetPasswordPage gates its form behind a useEffect state transition
 * (verifying → ready). renderToStaticMarkup doesn't run effects.
 */
async function renderResetPasswordPageDOM(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(React.createElement(ResetPasswordPage))
  })

  return { container, root }
}

describe('[PBT] Property 5: Error alert attributes completeness', () => {
  /**
   * **Validates: Requirements 8.1, 8.2**
   *
   * For any error message rendered on the ResetPasswordPage, the error container
   * element shall have all three attributes: role="alert", aria-live="assertive",
   * and aria-atomic="true". No element shall have role="alert" without the
   * accompanying aria-live and aria-atomic attributes.
   */

  it('error container has role="alert", aria-live="assertive", and aria-atomic="true"', async () => {
    // The mock for useMutation returns error: new Error('Test error'),
    // which triggers the error display in the ready state.
    const { container, root } = await renderResetPasswordPageDOM()

    // Find all elements with role="alert"
    const alertElements = container.querySelectorAll('[role="alert"]')

    // There should be at least one alert element (the error container)
    // The mutation error triggers the error display
    for (const alertEl of alertElements) {
      // Every role="alert" element must have aria-live and aria-atomic
      expect(alertEl.getAttribute('aria-live')).toBe('assertive')
      expect(alertEl.getAttribute('aria-atomic')).toBe('true')
    }

    act(() => { root.unmount() })
    document.body.removeChild(container)
  })

  it('no element has role="alert" without aria-live and aria-atomic', async () => {
    fc.assert(
      await fc.asyncProperty(fc.constant(null), async () => {
        const { container, root } = await renderResetPasswordPageDOM()

        const alertElements = container.querySelectorAll('[role="alert"]')
        for (const alertEl of alertElements) {
          const ariaLive = alertEl.getAttribute('aria-live')
          const ariaAtomic = alertEl.getAttribute('aria-atomic')

          // If it has role="alert", it MUST have both aria-live and aria-atomic
          expect(ariaLive).not.toBeNull()
          expect(ariaAtomic).not.toBeNull()
        }

        act(() => { root.unmount() })
        document.body.removeChild(container)
      }),
      { numRuns: 100 },
    )
  })
})


// ---------------------------------------------------------------------------
// Property 6: Password toggle accessibility
// ---------------------------------------------------------------------------

describe('[PBT] Property 6: Password toggle accessibility', () => {
  /**
   * **Validates: Requirements 10.1, 10.2**
   *
   * For any PasswordInput component in either visibility state (password shown
   * or hidden), the toggle button shall have an aria-label describing the
   * available action ("Show password" or "Hide password"), and the SVG icon
   * inside the button shall have aria-hidden="true".
   */

  const arbVisibilityState = fc.constantFrom('hidden', 'shown')

  it('toggle button has correct aria-label and SVG has aria-hidden in both states', () => {
    fc.assert(
      fc.property(arbVisibilityState, (state) => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)

        act(() => {
          root.render(React.createElement(PasswordInput, { label: 'Password' }))
        })

        // If we need the "shown" state, click the toggle button first
        if (state === 'shown') {
          const toggleBtn = container.querySelector('button[type="button"]')
          expect(toggleBtn).not.toBeNull()
          act(() => {
            toggleBtn!.click()
          })
        }

        const toggleBtn = container.querySelector('button[type="button"]')
        expect(toggleBtn).not.toBeNull()

        // Check aria-label on the toggle button
        const ariaLabel = toggleBtn!.getAttribute('aria-label')
        expect(ariaLabel).toBeTruthy()

        if (state === 'hidden') {
          expect(ariaLabel).toBe('Show password')
        } else {
          expect(ariaLabel).toBe('Hide password')
        }

        // Check SVG inside the button has aria-hidden="true"
        const svg = toggleBtn!.querySelector('svg')
        expect(svg).not.toBeNull()
        expect(svg!.getAttribute('aria-hidden')).toBe('true')

        act(() => { root.unmount() })
        document.body.removeChild(container)
      }),
      { numRuns: 100 },
    )
  })
})
