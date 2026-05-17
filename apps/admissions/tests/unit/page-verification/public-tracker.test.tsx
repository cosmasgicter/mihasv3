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

// -- Mock toast store --
vi.mock('@/hooks/useToast', () => ({
  useToastStore: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    errorWithRetry: vi.fn(),
  }),
}))

// -- Mock slip service (not under test) --
vi.mock('@/lib/slipService', () => ({
  createApplicationSlip: vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock('@/lib/applicationSlip', () => ({
  repairLegacyDocumentReference: vi.fn().mockResolvedValue({}),
}))

// -- Django API response shape for application tracking --
const MOCK_DJANGO_TRACK_RESPONSE = {
  application: {
    public_tracking_code: 'TRK-2025-ABC123',
    application_number: 'MIHAS202500042',
    status: 'under_review',
    program_name: 'Diploma in Clinical Medicine',
    intake_name: 'January 2025',
    institution: 'mihas',
    submitted_at: '2025-01-15T10:30:00Z',
    updated_at: '2025-02-01T14:00:00Z',
    created_at: '2025-01-15T10:30:00Z',
    feedback_summary: null,
  },
}

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

  async function renderAndWait(ms = 300) {
    root.render(<PublicApplicationTracker />)
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
    expect(text).toContain('Check Your Email')
    expect(text).toContain('Format Example')
    expect(text).toContain('Instant Results')
  })

  // -- Help section --

  it('renders the help section with status meanings', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Need Help?')
    expect(text).toContain('Application Status Meanings')
    expect(text).toContain('Submitted')
    expect(text).toContain('Under Review')
    expect(text).toContain('Approved')
  })

  it('renders contact information in the help section', async () => {
    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('info@mihas.edu.zm')
    expect(text).toContain('Contact Information')
  })

  // -- Search results with Django API response --

  it('renders application results after a successful search', async () => {
    mockRequest.mockResolvedValue(MOCK_DJANGO_TRACK_RESPONSE)
    mockSearchParams.set('code', 'MIHAS202500042')

    await renderAndWait(500)

    const text = container.textContent || ''
    expect(text).toContain('MIHAS202500042')
    expect(text).toContain('Diploma in Clinical Medicine')
    expect(text).toContain('January 2025')
  })

  it('renders the application status badge from Django response', async () => {
    mockRequest.mockResolvedValue(MOCK_DJANGO_TRACK_RESPONSE)
    mockSearchParams.set('code', 'MIHAS202500042')

    await renderAndWait(500)

    const text = container.textContent || ''
    expect(text).toContain('UNDER REVIEW')
  })

  it('renders the application details grid with Django API fields', async () => {
    mockRequest.mockResolvedValue(MOCK_DJANGO_TRACK_RESPONSE)
    mockSearchParams.set('code', 'MIHAS202500042')

    await renderAndWait(500)

    const text = container.textContent || ''
    expect(text).toContain('Application Details')
    expect(text).toContain('Application Number')
    expect(text).toContain('Program')
    expect(text).not.toContain('applicant@example.com')
    expect(text).not.toContain('Payment Status')
  })

  it('renders action buttons when application is found', async () => {
    mockRequest.mockResolvedValue(MOCK_DJANGO_TRACK_RESPONSE)
    mockSearchParams.set('code', 'MIHAS202500042')

    await renderAndWait(500)

    const text = container.textContent || ''
    expect(text).toContain('Share')
    expect(text).toContain('Copy #')
    expect(text).toContain('Download Slip')
    expect(text).toContain('Email Slip')
  })

  // -- No results state --

  it('renders no-results view when API returns no application', async () => {
    mockRequest.mockResolvedValue(null)
    mockSearchParams.set('code', 'NONEXISTENT123')

    await renderAndWait(500)

    const text = container.textContent || ''
    expect(text).toContain('No application found')
    expect(text).toContain('Try Again')
  })

  // -- Error state --

  it('renders error message when API call fails', async () => {
    mockRequest.mockRejectedValue(new Error('Network error'))
    mockSearchParams.set('code', 'MIHAS202500042')

    await renderAndWait(500)

    const text = container.textContent || ''
    expect(text).toContain('An error occurred while searching')
  })
})
