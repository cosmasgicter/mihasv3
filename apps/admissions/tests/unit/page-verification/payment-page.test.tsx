// @ts-nocheck
/**
 * Payment Page Verification Test
 *
 * Verifies the payment page correctly processes Django API response shapes
 * for application payment fields and renders payment status correctly.
 * Mocks services with actual Django response shapes (after envelope unwrap)
 * and asserts correct rendering.
 *
 * Requirements: 12.1, 12.2, 12.3
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'

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
vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

// ── Mock AuthContext ───────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'user-001',
      email: 'student@example.com',
      role: 'student',
      full_name: 'Jane Doe',
    },
    loading: false,
    isAdmin: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}))

// ── Mock services ─────────────────────────────────────────────────────

const mockApplicationServiceList = vi.fn()
const mockApplicationServiceUpdate = vi.fn()

vi.mock('@/services/applications', () => ({
  applicationService: {
    list: (...args: unknown[]) => mockApplicationServiceList(...args),
    update: (...args: unknown[]) => mockApplicationServiceUpdate(...args),
    delete: vi.fn().mockResolvedValue({ success: true }),
  },
}))

vi.mock('@/services/documents', () => ({
  documentService: {
    upload: vi.fn().mockResolvedValue({ url: 'https://example.com/proof.pdf' }),
  },
}))

vi.mock('@/lib/apiErrorLogger', () => ({
  logApiError: vi.fn(),
}))

// ── Mock tanstack react-query ─────────────────────────────────────────
// Payment page uses useQuery + useQueryClient directly
const mockInvalidateQueries = vi.fn()
const mockRefetch = vi.fn()

let capturedApplicationQueryFn: (() => Promise<unknown>) | null = null

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
  useQuery: (options: { queryFn?: () => Promise<unknown>; queryKey?: unknown[] }) => {
    const queryKey = Array.isArray(options.queryKey) ? options.queryKey : []

    if (queryKey[0] === 'payment-records') {
      return {
        data: currentMockPaymentsData,
        isLoading: currentMockLoading,
        error: null,
        refetch: mockRefetch,
      }
    }

    capturedApplicationQueryFn = options.queryFn ?? null
    return {
      data: currentMockApplicationsData,
      isLoading: currentMockLoading,
      error: currentMockError,
      refetch: mockRefetch,
    }
  },
}))

// ── Mutable test state for useQuery mock ──────────────────────────────
let currentMockApplicationsData: unknown[] = []
let currentMockPaymentsData: Record<string, unknown[]> = {}
let currentMockLoading = false
let currentMockError: Error | null = null

// ── Django application response shapes (payment fields on Application) ─
// These match the actual Django API response for GET /api/v1/applications/?mine=true
// after envelope unwrap and normalizePaginatedApplications processing.

const djangoApplicationsWithPayment = {
  applications: [
    {
      id: 'app-001',
      user_id: 'user-001',
      status: 'submitted',
      payment_status: null,
      last_payment_audit_notes: null,
      created_at: '2025-01-15T10:00:00Z',
      program: 'Bachelor of Nursing',
      full_name: 'Jane Doe',
      email: 'student@example.com',
      phone: '+260970000001',
      application_fee: 153,
    },
    {
      id: 'app-002',
      user_id: 'user-001',
      status: 'submitted',
      payment_status: 'pending_review',
      payment_method: 'MTN Money',
      paid_amount: 153,
      paid_at: '2025-02-01T14:30:00Z',
      payment_reference: 'TXN-12345',
      last_payment_reference: 'TXN-12345',
      receipt_number: null,
      last_payment_audit_notes: null,
      created_at: '2025-02-01T08:00:00Z',
      program: 'Diploma in Pharmacy',
      full_name: 'Jane Doe',
      email: 'student@example.com',
      phone: '+260970000001',
      application_fee: 153,
    },
    {
      id: 'app-003',
      user_id: 'user-001',
      status: 'submitted',
      payment_status: 'verified',
      payment_method: 'Airtel Money',
      paid_amount: 153,
      paid_at: '2025-01-20T09:00:00Z',
      payment_reference: 'TXN-67890',
      last_payment_reference: 'TXN-67890',
      receipt_number: 'RCT-003',
      last_payment_audit_notes: null,
      created_at: '2024-12-10T08:00:00Z',
      program: 'Certificate in Community Health',
      full_name: 'Jane Doe',
      email: 'student@example.com',
      phone: '+260970000001',
      application_fee: 153,
    },
    {
      id: 'app-004',
      user_id: 'user-001',
      status: 'submitted',
      payment_status: 'rejected',
      payment_method: 'MTN Money',
      paid_amount: 153,
      paid_at: '2025-03-01T11:00:00Z',
      payment_reference: 'TXN-INVALID',
      last_payment_reference: 'TXN-INVALID',
      receipt_number: null,
      last_payment_audit_notes: 'The last payment attempt could not be verified. Please review the latest instructions and try again.',
      created_at: '2025-03-01T08:00:00Z',
      program: 'Bachelor of Nursing',
      full_name: 'Jane Doe',
      email: 'student@example.com',
      phone: '+260970000001',
      application_fee: 153,
    },
  ],
  totalCount: 4,
  page: 0,
  pageSize: 50,
}

// Pre-processed applications as the Payment page's useQuery would return them
// (the queryFn in Payment.tsx maps from applicationService.list response)
function buildPaymentApplications(apps: typeof djangoApplicationsWithPayment.applications) {
  return apps.map((app) => ({
    id: app.id,
    status: app.status,
    payment_status: typeof app.payment_status === 'string' ? app.payment_status : null,
    last_payment_audit_notes: typeof app.last_payment_audit_notes === 'string' ? app.last_payment_audit_notes : null,
    created_at: typeof app.created_at === 'string' ? app.created_at : new Date().toISOString(),
    program: typeof app.program === 'string' ? app.program : null,
    full_name: typeof app.full_name === 'string' ? app.full_name : null,
    email: typeof app.email === 'string' ? app.email : null,
    phone: typeof app.phone === 'string' ? app.phone : null,
    application_fee: typeof app.application_fee === 'number' ? app.application_fee : null,
  }))
}

const djangoPaymentRecords = [
  {
    id: 'payment-002',
    application_id: 'app-002',
    status: 'pending',
    amount: 153,
    currency: 'ZMW',
    created_at: '2025-02-01T14:30:00Z',
  },
  {
    id: 'payment-003',
    application_id: 'app-003',
    status: 'successful',
    amount: 153,
    currency: 'ZMW',
    created_at: '2025-01-20T09:00:00Z',
  },
  {
    id: 'payment-004',
    application_id: 'app-004',
    status: 'failed',
    amount: 153,
    currency: 'ZMW',
    created_at: '2025-03-01T11:00:00Z',
  },
]

function buildPaymentsByApplication(records: typeof djangoPaymentRecords) {
  return records.reduce<Record<string, typeof djangoPaymentRecords>>((acc, record) => {
    const existing = acc[record.application_id] ?? []
    return {
      ...acc,
      [record.application_id]: [...existing, record],
    }
  }, {})
}

// ── Import the component under test ───────────────────────────────────
import PaymentPage from '@/pages/student/Payment'

describe('Payment page verification', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    mockNavigate.mockClear()
    mockRefetch.mockClear()
    mockApplicationServiceList.mockResolvedValue(djangoApplicationsWithPayment)
    currentMockError = null
    currentMockLoading = false
    currentMockApplicationsData = buildPaymentApplications(djangoApplicationsWithPayment.applications)
    currentMockPaymentsData = buildPaymentsByApplication(djangoPaymentRecords)

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    root.unmount()
    container.remove()
    vi.clearAllMocks()
    capturedApplicationQueryFn = null
  })

  function renderAndWait(ms = 300) {
    root.render(<PaymentPage />)
    return new Promise((r) => setTimeout(r, ms))
  }

  // ── Basic rendering ─────────────────────────────────────────────────

  it('renders without errors and shows the page title', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('Application Payment')
  })

  it('shows loading state when data is loading', async () => {
    currentMockLoading = true
    currentMockApplicationsData = []
    currentMockPaymentsData = {}

    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('Loading payment information')
  })

  // ── Payment status display ──────────────────────────────────────────

  it('displays applications with payment_status=null as requiring action', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    // app-001 has null payment_status → normalizes to 'not_paid' → requires action
    expect(text).toContain('Payment: Action Required')
    expect(text).toContain('Bachelor of Nursing')
  })

  it('displays applications with payment_status=pending_review under review section', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    // app-002 has pending_review status
    expect(text).toContain('Payment: Awaiting Review')
    expect(text).toContain('Diploma in Pharmacy')
  })

  it('displays applications with payment_status=verified in history section', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    // app-003 has verified status
    expect(text).toContain('Payment: Verified')
    expect(text).toContain('Certificate in Community Health')
  })

  it('displays rejected payment with audit notes', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    // app-004 has rejected status with audit notes
    expect(text).toContain('Rejected')
    expect(text).toContain('The last payment attempt could not be verified')
  })

  it('renders retry buttons for payment actions on the dedicated payment page', async () => {
    await renderAndWait()

    // app-001 (null payment) and app-004 (rejected) should show Pay Now toggle buttons
    const text = container.textContent || ''
    expect(text).toContain('Pay Now')
  })

  // ── Summary cards ───────────────────────────────────────────────────

  it('shows the key payment states across applications', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('Action Required')
    expect(text).toContain('Awaiting Review')
    expect(text).toContain('Verified')
  })

  // ── Payment method display ──────────────────────────────────────────

  it('displays payment record amounts and statuses', async () => {
    await renderAndWait()

    const html = container.innerHTML || ''
    expect(html).toContain('K153.00')
    expect(html).toContain('Successful')
  })

  // ── Empty state ─────────────────────────────────────────────────────

  it('shows empty state when no applications exist', async () => {
    currentMockApplicationsData = []
    currentMockPaymentsData = {}

    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('No payments yet')
    expect(text).toContain('Payment records will appear here once you submit')
  })

  // ── Error handling ──────────────────────────────────────────────────

  it('shows error message when fetch fails', async () => {
    currentMockError = new Error('Network timeout')
    currentMockApplicationsData = []
    currentMockPaymentsData = {}

    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('Failed to load payment information')
  })

  it('shows retry button when fetch fails', async () => {
    currentMockError = new Error('Network timeout')
    currentMockApplicationsData = []
    currentMockPaymentsData = {}

    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('Try Again')
  })

  // ── Static content ──────────────────────────────────────────────────

  it('displays per-application fee guidance', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('Pay outstanding fees directly from this page')
    expect(text).toContain('Application Fee')
  })

  it('explains that submitted payments can be retried outside the wizard', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('No need to go back to the application wizard')
    expect(text).toContain('Pay Now')
  })

  it('does not route draft work through the payment page', async () => {
    currentMockApplicationsData = [
      ...buildPaymentApplications(djangoApplicationsWithPayment.applications),
      {
        id: 'draft-001',
        status: 'draft',
        payment_status: null,
        last_payment_audit_notes: null,
        created_at: '2026-04-01T08:00:00Z',
        program: 'Draft Programme',
        full_name: 'Jane Doe',
        email: 'student@example.com',
        phone: '+260970000001',
        application_fee: 153,
      },
    ]

    await renderAndWait()

    const text = container.textContent || ''
    expect(text).not.toContain('Draft Programme')
    expect(text).not.toContain('Continue draft in wizard')
    expect(container.querySelector('a[href="/student/application-wizard"]')).toBeNull()
  })

  it('displays the help/support contact', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('admissions@beanola.com')
  })

  // ── queryFn correctly maps Django response ──────────────────────────

  it('queryFn maps Django application response to payment fields', async () => {
    // Render to capture the queryFn
    await renderAndWait()

    // The queryFn should have been captured by our useQuery mock
    expect(capturedApplicationQueryFn).toBeDefined()

    // Call the captured queryFn to verify it maps Django response correctly
    const result = await capturedApplicationQueryFn!()
    const apps = result as Array<Record<string, unknown>>

    expect(apps).toHaveLength(4)

    // app-001: null payment status
    expect(apps[0].id).toBe('app-001')
    expect(apps[0].payment_status).toBeNull()

    // app-002: pending_review with audit metadata preserved
    expect(apps[1].id).toBe('app-002')
    expect(apps[1].payment_status).toBe('pending_review')
    expect(apps[1].program).toBe('Diploma in Pharmacy')
    expect(apps[1].application_fee).toBe(153)

    // app-003: verified
    expect(apps[2].payment_status).toBe('verified')

    // app-004: rejected with audit notes
    expect(apps[3].payment_status).toBe('rejected')
    expect(apps[3].last_payment_audit_notes).toBe(
      'The last payment attempt could not be verified. Please review the latest instructions and try again.'
    )
  })
})
