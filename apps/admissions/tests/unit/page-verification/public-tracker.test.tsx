// @ts-nocheck
/**
 * Public Application Tracker Page Verification Test
 *
 * Verifies the public tracker page renders its search UI and displays application
 * results when the tracking API returns data with Django API shapes.
 *
 * Requirements: 8.4, 8.10, 8.11, 8.12
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// -- Polyfill window.matchMedia for jsdom --
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

// -- Polyfill scrollIntoView for jsdom --
Element.prototype.scrollIntoView = vi.fn()

// -- Mock IntersectionObserver for scroll-reveal components --
class MockIntersectionObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  constructor(callback: IntersectionObserverCallback) {
    setTimeout(() => {
      callback(
        [{ isIntersecting: true, target: document.createElement('div') }] as unknown as IntersectionObserverEntry[],
        this as unknown as IntersectionObserver
      )
    }, 0)
  }
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
})

// -- Mock react-router-dom --
const mockSearchParams = new URLSearchParams()
vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/track-application', search: '', hash: '', state: null }),
  useSearchParams: () => [mockSearchParams],
}))

// -- Mock AuthContext --
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    isAdmin: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}))

// -- Mock heavy child components --
vi.mock('@/components/seo/Seo', () => ({
  Seo: () => null,
}))

vi.mock('@/components/layout/PublicLayout', () => ({
  PublicLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="public-layout">{children}</div>
  ),
}))

// -- Mock smoothui components to render children directly --
vi.mock('@/components/smoothui', () => ({
  ScrollReveal: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="scroll-reveal" className={className}>{children}</div>
  ),
  StaggerReveal: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="stagger-reveal" className={className}>{children}</div>
  ),
  StaggerItem: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="stagger-item">{children}</div>
  ),
}))

// -- Mock apiClient for tracking API --
const mockRequest = vi.fn()

vi.mock('@/services/client', () => ({
  apiClient: { request: (...args: unknown[]) => mockRequest(...args) },
}))

// -- Mock logApiError (no-op for tests) --
vi.mock('@/lib/apiErrorLogger', () => ({
  logApiError: vi.fn(),
}))

// -- Django API response shape for application tracking --
//
// admissions-v2 task 10.5 (R13.12, STU-22): the payload is the published contract
// exactly — the fields the backend serializer sends and no others. The pre-10.5
// fixture also carried `public_tracking_code`, `created_at` and
// `feedback_summary`, two of which the backend never sent.
const MOCK_DJANGO_TRACK_RESPONSE = {
  application: {
    application_number: 'MIHAS202500042',
    status: 'under_review',
    program_name: 'Diploma in Clinical Medicine',
    intake_name: 'January 2025',
    institution: 'mihas',
    submitted_at: '2025-01-15T10:30:00Z',
    updated_at: '2025-02-01T14:00:00Z',
  },
}

// The credential the tracker is opened with. An application number no longer
// authorises public disclosure, so every deep link carries a tracking secret.
const TRACKING_SECRET = 'TRK-4KP2M9XT-9QW3RT7VZ2KDN8YH6JF4'

// -- Import the component under test --
import PublicApplicationTracker from '@/pages/public/tracker'

describe('Public tracker page verification', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    mockRequest.mockClear()
    mockSearchParams.delete('code')

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    root.unmount()
    container.remove()
    vi.clearAllMocks()
  })

  /*
    The tracker resolves its visible brand and its support contact from tenant
    context (admissions-v2 task 11.5, STU-24), which is a React Query read of
    `/api/v1/catalog/context/`. A page that reads resolved context needs the
    app's query client, so this render supplies one — the page is rendered with
    the providers it actually runs under, rather than the page being made to
    resolve nothing.
  */
  async function renderAndWait(ms = 300) {
    root.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PublicApplicationTracker />
      </QueryClientProvider>
    )
    await new Promise((r) => setTimeout(r, ms))
  }

  // -- Page heading and search UI --

  it('renders without errors and shows the page heading', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Track Your Application')
  })

  it('renders the search section with input and button', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Find Your Application')
    expect(text).toContain('Search')
    const input = container.querySelector('input')
    expect(input).toBeTruthy()
  })

  it('renders the help cards in the search section', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    // Task 10.5 renamed the first card: the credential comes from the owner's own
    // "Get tracking link" command, not from the confirmation email's number.
    expect(text).toContain('Get Your Link')
    expect(text).toContain('Format Example')
    // Task 11.5 replaced the third card: "Instant Results — real-time status
    // updates" claimed a capability the tracker does not have (it reads the
    // recorded status of a submitted application on request, and there is no
    // push, stream or poll behind it). What it says now is what it does.
    expect(text).toContain('What you see')
    expect(text).toContain('The current recorded status, without signing in')
    expect(text).not.toMatch(/instant/i)
    expect(text).not.toMatch(/real[- ]time/i)
  })

  // -- Help section --

  it('renders the help section with status meanings', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Need Help?')
    // Task 11.5 (R16.5): the glossary heading states what it is instead of
    // narrating the feature ("Application Status Meanings"), and each entry is
    // the status plus what it means for the applicant — without the
    // celebratory/consoling asides a legend does not need.
    expect(text).toContain('What each status means')
    expect(text).toContain('Submitted')
    expect(text).toContain('Under review')
    expect(text).toContain('Approved')
  })

  /*
    Task 11.5, finding STU-24. This case used to assert the panel printed
    `admissions@beanola.com` — the platform's own inbox, hardcoded into every
    tenant's tracker. It was pinning the defect. The support affordance now comes
    from `resolveTenantSupportContact` over resolved tenant context: this test
    resolves no tenant, so the neutral platform outcome is the one asserted — the
    in-app `/contact` route, with no address printed at all.
  */
  it('resolves its support affordance from tenant context, printing no address', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Still need help?')
    expect(text).toContain('Contact support')
    expect(text).not.toContain('admissions@beanola.com')
    const supportLink = container.querySelector('a[href="/contact"]')
    expect(supportLink).not.toBeNull()
  })

  // -- Search results with Django API response --

  it('renders application results after a successful search', async () => {
    mockRequest.mockResolvedValue(MOCK_DJANGO_TRACK_RESPONSE)
    mockSearchParams.set('code', TRACKING_SECRET)

    await renderAndWait(500)

    const text = container.textContent || ''
    expect(text).toContain('MIHAS202500042')
    expect(text).toContain('Diploma in Clinical Medicine')
    expect(text).toContain('January 2025')
  })

  it('renders the application status badge from Django response', async () => {
    mockRequest.mockResolvedValue(MOCK_DJANGO_TRACK_RESPONSE)
    mockSearchParams.set('code', TRACKING_SECRET)

    await renderAndWait(500)

    const text = container.textContent || ''
    expect(text).toContain('UNDER REVIEW')
  })

  it('renders the application details grid with Django API fields', async () => {
    mockRequest.mockResolvedValue(MOCK_DJANGO_TRACK_RESPONSE)
    mockSearchParams.set('code', TRACKING_SECRET)

    await renderAndWait(500)

    const text = container.textContent || ''
    expect(text).toContain('Application Details')
    expect(text).toContain('Application Number')
    expect(text).toContain('Program')
    expect(text).not.toContain('applicant@example.com')
    expect(text).not.toContain('Payment Status')
  })

  it('renders share/copy actions without anonymous slip controls when application is found', async () => {
    mockRequest.mockResolvedValue(MOCK_DJANGO_TRACK_RESPONSE)
    mockSearchParams.set('code', TRACKING_SECRET)

    await renderAndWait(500)

    const text = container.textContent || ''
    expect(text).toContain('Share')
    expect(text).toContain('Copy #')
    expect(text).not.toContain('Download Slip')
    expect(text).not.toContain('Email Slip')
  })

  // -- No results state --

  it('renders no-results view when API returns no application', async () => {
    mockRequest.mockResolvedValue(null)
    mockSearchParams.set('code', TRACKING_SECRET)

    await renderAndWait(500)

    const text = container.textContent || ''
    expect(text).toContain('No application found')
    expect(text).toContain('Try Again')
  })

  // -- Task 10.5: an application number is not a credential --

  it('explains that an application number no longer opens tracking', async () => {
    mockRequest.mockResolvedValue(MOCK_DJANGO_TRACK_RESPONSE)
    mockSearchParams.set('code', 'MIHAS202500042')
    await renderAndWait(500)

    const text = container.textContent || ''
    expect(text).toContain('application number')
    expect(text).toContain('tracking link')
    /*
      The refusal is local, so no **tracking** request is made.

      This was `expect(mockRequest).not.toHaveBeenCalled()`. Task 11.5 resolves
      the page's visible brand and support contact from tenant context, which is
      a read of `/api/v1/catalog/context/` through this same mocked client — so
      "no request at all" is no longer the claim. The claim was always about the
      tracking lookup, and now it says so.
    */
    const trackingCalls = mockRequest.mock.calls.filter((call) =>
      String(call[0] ?? '').includes('track'),
    )
    expect(trackingCalls).toHaveLength(0)
    expect(text).not.toContain('Diploma in Clinical Medicine')
  })

  // -- Error state --

  it('renders error message when API call fails', async () => {
    mockRequest.mockRejectedValue(new Error('Network error'))
    mockSearchParams.set('code', TRACKING_SECRET)

    await renderAndWait(500)

    const text = container.textContent || ''
    expect(text).toContain('An error occurred while searching')
  })
})
