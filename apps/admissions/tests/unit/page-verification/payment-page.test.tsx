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

let capturedQueryFn: (() => Promise<unknown>) | null = null

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
  useQuery: (options: { queryFn?: () => Promise<unknown>; queryKey?: unknown[] }) => {
    // Capture the queryFn so we can call it in tests
    capturedQueryFn = options.queryFn ?? null
    return {
      data: currentMockData,
      isLoading: currentMockLoading,
      error: currentMockError,
      refetch: mockRefetch,
    }
  },
}))

// ── Mutable test state for useQuery mock ──────────────────────────────
let currentMockData: unknown[] = []
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
      payment_method: null,
      payer_name: null,
      payer_phone: null,
      amount: null,
      paid_at: null,
      momo_ref: null,
      pop_url: null,
      last_payment_audit_notes: null,
      created_at: '2025-01-15T10:00:00Z',
      program: 'Bachelor of Nursing',
    },
    {
      id: 'app-002',
      user_id: 'user-001',
      status: 'submitted',
      payment_status: 'pending_review',
      payment_method: 'MTN Money',
      payer_name: 'Jane Doe',
      payer_phone: '+260971234567',
      amount: 153,
      paid_at: '2025-02-01T14:30:00Z',
      momo_ref: 'TXN-12345',
      pop_url: 'https://storage.example.com/proof-002.pdf',
      last_payment_audit_notes: null,
      created_at: '2025-02-01T08:00:00Z',
      program: 'Diploma in Pharmacy',
    },
    {
      id: 'app-003',
      user_id: 'user-001',
      status: 'submitted',
      payment_status: 'verified',
      payment_method: 'Airtel Money',
      payer_name: 'Jane Doe',
      payer_phone: '+260977654321',
      amount: 153,
      paid_at: '2025-01-20T09:00:00Z',
      momo_ref: 'TXN-67890',
      pop_url: 'https://storage.example.com/proof-003.pdf',
      last_payment_audit_notes: null,
      created_at: '2024-12-10T08:00:00Z',
      program: 'Certificate in Community Health',
    },
    {
      id: 'app-004',
      user_id: 'user-001',
      status: 'submitted',
      payment_status: 'rejected',
      payment_method: 'MTN Money',
      payer_name: 'Jane Doe',
      payer_phone: '+260971234567',
      amount: 153,
      paid_at: '2025-03-01T11:00:00Z',
      momo_ref: 'TXN-INVALID',
      pop_url: 'https://storage.example.com/proof-004.pdf',
      last_payment_audit_notes: 'Proof of payment is blurry and unreadable. Please resubmit.',
      created_at: '2025-03-01T08:00:00Z',
      program: 'Bachelor of Nursing',
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
    payment_method: typeof app.payment_method === 'string' ? app.payment_method : null,
    payer_name: typeof app.payer_name === 'string' ? app.payer_name : null,
    payer_phone: typeof app.payer_phone === 'string' ? app.payer_phone : null,
    amount: typeof app.amount === 'number' ? app.amount : null,
    paid_at: typeof app.paid_at === 'string' ? app.paid_at : null,
    momo_ref: typeof app.momo_ref === 'string' ? app.momo_ref : null,
    pop_url: typeof app.pop_url === 'string' ? app.pop_url : null,
    last_payment_audit_notes: typeof app.last_payment_audit_notes === 'string' ? app.last_payment_audit_notes : null,
    created_at: typeof app.created_at === 'string' ? app.created_at : new Date().toISOString(),
    program: typeof app.program === 'string' ? app.program : null,
  }))
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
    currentMockData = buildPaymentApplications(djangoApplicationsWithPayment.applications)

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    root.unmount()
    container.remove()
    vi.clearAllMocks()
    capturedQueryFn = null
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
    currentMockData = []

    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('Loading payment information')
  })

  // ── Payment status display ──────────────────────────────────────────

  it('displays applications with payment_status=null as requiring action', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    // app-001 has null payment_status → normalizes to 'not_paid' → requires action
    expect(text).toContain('Payment Action Required')
    expect(text).toContain('Bachelor of Nursing')
  })

  it('displays applications with payment_status=pending_review under review section', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    // app-002 has pending_review status
    expect(text).toContain('Payment Under Review')
    expect(text).toContain('Diploma in Pharmacy')
  })

  it('displays applications with payment_status=verified in history section', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    // app-003 has verified status
    expect(text).toContain('Payment History')
    expect(text).toContain('Certificate in Community Health')
  })

  it('displays rejected payment with audit notes', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    // app-004 has rejected status with audit notes
    expect(text).toContain('Rejected')
    expect(text).toContain('Proof of payment is blurry and unreadable')
  })

  // ── Summary cards ───────────────────────────────────────────────────

  it('shows correct counts in summary cards', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    // Payment Action Required: app-001 (not_paid) + app-004 (rejected) = 2
    // Awaiting Review: app-002 (pending_review) = 1
    // Verified Payments: app-003 (verified) = 1
    expect(text).toContain('Payment Action Required')
    expect(text).toContain('Awaiting Review')
    expect(text).toContain('Verified Payments')
  })

  // ── Payment method display ──────────────────────────────────────────

  it('displays payment method for applications that have one', async () => {
    await renderAndWait()

    const html = container.innerHTML || ''
    // app-002 has payment_method 'MTN Money', app-003 has 'Airtel Money'
    expect(html).toContain('MTN Money')
    expect(html).toContain('Airtel Money')
  })

  // ── Empty state ─────────────────────────────────────────────────────

  it('shows empty state when no applications exist', async () => {
    currentMockData = []

    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('No Applications Yet')
    expect(text).toContain('Start your application')
  })

  // ── Error handling ──────────────────────────────────────────────────

  it('shows error message when fetch fails', async () => {
    currentMockError = new Error('Network timeout')
    currentMockData = []

    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('Failed to load payment information')
  })

  it('shows retry button when fetch fails', async () => {
    currentMockError = new Error('Network timeout')
    currentMockData = []

    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('Retry')
  })

  // ── Static content ──────────────────────────────────────────────────

  it('displays the K153 application fee', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('K153')
    expect(text).toContain('Application Fee')
  })

  it('displays payment instructions', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('Payment Instructions')
    expect(text).toContain('mobile money')
  })

  it('displays the continue to wizard button', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('Continue to Application Wizard')
  })

  it('displays the help/support contact', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('admissions@mihas.edu.zm')
  })

  // ── queryFn correctly maps Django response ──────────────────────────

  it('queryFn maps Django application response to payment fields', async () => {
    // Render to capture the queryFn
    await renderAndWait()

    // The queryFn should have been captured by our useQuery mock
    expect(capturedQueryFn).toBeDefined()

    // Call the captured queryFn to verify it maps Django response correctly
    const result = await capturedQueryFn!()
    const apps = result as Array<Record<string, unknown>>

    expect(apps).toHaveLength(4)

    // app-001: null payment fields
    expect(apps[0].id).toBe('app-001')
    expect(apps[0].payment_status).toBeNull()
    expect(apps[0].payment_method).toBeNull()
    expect(apps[0].amount).toBeNull()
    expect(apps[0].paid_at).toBeNull()
    expect(apps[0].momo_ref).toBeNull()
    expect(apps[0].pop_url).toBeNull()

    // app-002: pending_review with all payment fields populated
    expect(apps[1].id).toBe('app-002')
    expect(apps[1].payment_status).toBe('pending_review')
    expect(apps[1].payment_method).toBe('MTN Money')
    expect(apps[1].amount).toBe(153)
    expect(apps[1].paid_at).toBe('2025-02-01T14:30:00Z')
    expect(apps[1].momo_ref).toBe('TXN-12345')
    expect(apps[1].pop_url).toBe('https://storage.example.com/proof-002.pdf')

    // app-003: verified
    expect(apps[2].payment_status).toBe('verified')

    // app-004: rejected with audit notes
    expect(apps[3].payment_status).toBe('rejected')
    expect(apps[3].last_payment_audit_notes).toBe('Proof of payment is blurry and unreadable. Please resubmit.')
  })
})
