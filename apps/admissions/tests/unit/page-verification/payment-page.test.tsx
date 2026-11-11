// @ts-nocheck
/**
 * Payment Page Verification Test
 *
 * Verifies `/student/payment` against the real Django response shapes: the
 * application list mapping, the canonical payment-row list, and what each
 * post-submission state renders.
 *
 * Rewritten by **admissions-v2 task 8.3** ("Complete the student payment ownership
 * split"). The previous version pinned the surface this task replaced — the
 * "Payment: Action Required" badge vocabulary, the "Pay outstanding fees directly
 * from this page" marketing block, the "No need to go back to the application
 * wizard" line, the stale `applications.application_fee` column, and the hardcoded
 * `admissions@beanola.com` support address (finding STU-24). Keeping those
 * assertions would have meant keeping the findings.
 *
 * What is preserved is every assertion that was about *behaviour* rather than copy:
 * the queryFn's mapping of the Django payload, the loading and error paths, and the
 * rule that draft work never routes through this page.
 *
 * Requirements: R12.3, R12.4, R12.6, R13.1.
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
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
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

// ── Tenant context (R13.1 / STU-24) ───────────────────────────────────
// The page reads the runtime brand + support address from resolved tenant
// context. The default here is the NEUTRAL shared portal: no tenant address is
// configured, so the page must route to the in-app contact page and print no
// address at all.
let currentPortalBrand = {
  brandName: 'Beanola Admissions',
  brandOwner: 'Beanola Technologies',
  isWhiteLabel: false,
  offeringInstitutionId: undefined as string | undefined,
  supportEmail: null as string | null,
  isLoading: false,
}
vi.mock('@/hooks/usePortalBrand', () => ({
  usePortalBrand: () => currentPortalBrand,
  DEFAULT_BRAND_NAME: 'Beanola Admissions',
}))

// ── Mock services ─────────────────────────────────────────────────────

const mockApplicationServiceList = vi.fn()

vi.mock('@/services/applications', () => ({
  applicationService: {
    list: (...args: unknown[]) => mockApplicationServiceList(...args),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue({ success: true }),
  },
}))

const mockListPayments = vi.fn()
vi.mock('@/services/payments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/payments')>()
  return {
    ...actual,
    listPayments: (...args: unknown[]) => mockListPayments(...args),
  }
})

vi.mock('@/lib/apiErrorLogger', () => ({
  logApiError: vi.fn(),
}))

// The per-application card's own hooks. `usePaymentStatus` is the poller and
// `useFeeQuote` mints/reads the server quote; neither may reach the network here.
const paymentStatusState = {
  status: null as 'pending' | 'successful' | 'failed' | 'deferred' | null,
  phase: null as string | null,
  pollingExceededTimeout: false,
}
vi.mock('@/hooks/usePaymentStatus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/usePaymentStatus')>()
  return {
    ...actual,
    usePaymentStatus: () => ({
      status: paymentStatusState.status,
      phase: paymentStatusState.phase,
      refetch: vi.fn().mockResolvedValue(undefined),
      setStatus: vi.fn(),
      pollingExceededTimeout: paymentStatusState.pollingExceededTimeout,
      lastUpdated: null,
    }),
  }
})
vi.mock('@/hooks/useFeeQuote', () => ({
  useFeeQuote: () => ({ quote: null, isLoading: false, error: null, isExpired: false, refresh: vi.fn() }),
}))

// ── Mock tanstack react-query ─────────────────────────────────────────
const mockRefetch = vi.fn()
let capturedApplicationQueryFn: (() => Promise<unknown>) | null = null
let capturedPaymentsQueryFn: (() => Promise<unknown>) | null = null

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: (options: { queryFn?: () => Promise<unknown>; queryKey?: unknown[] }) => {
    const queryKey = Array.isArray(options.queryKey) ? options.queryKey : []

    if (queryKey[0] === 'payment-records') {
      capturedPaymentsQueryFn = options.queryFn ?? null
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

// ── Django application response shapes ────────────────────────────────
// GET /api/v1/applications/?mine=true after envelope unwrap +
// normalizePaginatedApplications.

const djangoApplicationsWithPayment = {
  applications: [
    {
      id: 'app-001',
      user_id: 'user-001',
      status: 'submitted',
      application_number: 'APP-20250115-AAAAAAAA',
      payment_status: null,
      last_payment_audit_notes: null,
      created_at: '2025-01-15T10:00:00Z',
      program: 'Bachelor of Nursing',
      full_name: 'Jane Doe',
      email: 'student@example.com',
      phone: '+260970000001',
      // The stale `applications.application_fee` column is still on the wire; the
      // page must NOT map or display it (task 8.1 — the quote is the only price).
      application_fee: 153,
    },
    {
      id: 'app-002',
      user_id: 'user-001',
      status: 'submitted',
      application_number: 'APP-20250201-BBBBBBBB',
      payment_status: 'pending_review',
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
      application_number: 'APP-20241210-CCCCCCCC',
      payment_status: 'verified',
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
      application_number: 'APP-20250301-DDDDDDDD',
      payment_status: 'rejected',
      last_payment_audit_notes:
        'The last payment attempt could not be verified. Please review the latest instructions and try again.',
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

/** Applications as the page's own queryFn maps them. */
function buildPaymentApplications(apps: typeof djangoApplicationsWithPayment.applications) {
  return apps.map((app) => ({
    id: app.id,
    status: app.status,
    payment_status: typeof app.payment_status === 'string' ? app.payment_status : null,
    program: typeof app.program === 'string' ? app.program : null,
    application_number: typeof app.application_number === 'string' ? app.application_number : null,
    full_name: typeof app.full_name === 'string' ? app.full_name : null,
    email: typeof app.email === 'string' ? app.email : null,
    phone: typeof app.phone === 'string' ? app.phone : null,
    created_at: typeof app.created_at === 'string' ? app.created_at : new Date().toISOString(),
    last_payment_audit_notes:
      typeof app.last_payment_audit_notes === 'string' ? app.last_payment_audit_notes : null,
  }))
}

// DRF serialises `Payment.amount` (a DecimalField) as a **string** — the wire
// shape is `"153.00"`, not `153`. Task 8.1 made the UI render that string verbatim
// instead of re-quantising it, and task 8.2 added the derived `phase`.
const djangoPaymentRecords = [
  {
    id: 'payment-002',
    application_id: 'app-002',
    status: 'pending',
    amount: '153.00',
    currency: 'ZMW',
    created_at: '2025-02-01T14:30:00Z',
    phase: 'action_required',
    phase_timeout_seconds: 120,
  },
  {
    id: 'payment-003',
    application_id: 'app-003',
    status: 'successful',
    amount: '153.00',
    currency: 'ZMW',
    created_at: '2025-01-20T09:00:00Z',
    phase: 'paid',
    phase_timeout_seconds: null,
  },
  {
    id: 'payment-004',
    application_id: 'app-004',
    status: 'failed',
    amount: '153.00',
    currency: 'ZMW',
    created_at: '2025-03-01T11:00:00Z',
    phase: 'failed_retryable',
    phase_timeout_seconds: null,
  },
]

function buildPaymentsByApplication(records: typeof djangoPaymentRecords) {
  return records.reduce<Record<string, typeof djangoPaymentRecords>>((acc, record) => {
    const existing = acc[record.application_id] ?? []
    return { ...acc, [record.application_id]: [...existing, record] }
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
    mockListPayments.mockResolvedValue(djangoPaymentRecords)
    currentMockError = null
    currentMockLoading = false
    currentMockApplicationsData = buildPaymentApplications(djangoApplicationsWithPayment.applications)
    currentMockPaymentsData = buildPaymentsByApplication(djangoPaymentRecords)
    currentPortalBrand = {
      brandName: 'Beanola Admissions',
      brandOwner: 'Beanola Technologies',
      isWhiteLabel: false,
      offeringInstitutionId: undefined,
      supportEmail: null,
      isLoading: false,
    }
    paymentStatusState.status = null
    paymentStatusState.phase = null
    paymentStatusState.pollingExceededTimeout = false

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    root.unmount()
    container.remove()
    vi.clearAllMocks()
    capturedApplicationQueryFn = null
    capturedPaymentsQueryFn = null
  })

  function renderAndWait(ms = 300) {
    root.render(<PaymentPage />)
    return new Promise((r) => setTimeout(r, ms))
  }

  // ── Basic rendering ─────────────────────────────────────────────────

  it('renders without errors and shows the page title', async () => {
    await renderAndWait()
    expect(container.textContent || '').toContain('Application payment')
  })

  it('shows loading state when data is loading', async () => {
    currentMockLoading = true
    currentMockApplicationsData = []
    currentMockPaymentsData = {}

    await renderAndWait()
    expect(container.textContent || '').toContain('Loading your payments')
  })

  // ── R12.3: every post-submission state, with its recovery affordance ──

  it('an unpaid submitted application can be paid from this page', async () => {
    await renderAndWait()

    const card = container.querySelector('[data-application-id="app-001"]')
    expect(card).not.toBeNull()
    expect(card!.getAttribute('data-payment-ui-state')).toBe('idle')
    expect(card!.textContent).toContain('Bachelor of Nursing')
    expect(card!.querySelector('[data-testid="payment-pay-action"]')?.textContent).toContain('Pay now')
  })

  it('a pending payment renders the server phase, not a dead end', async () => {
    await renderAndWait()

    // app-002's latest row is pending with phase=action_required (task 8.2).
    const card = container.querySelector('[data-application-id="app-002"]')
    expect(card).not.toBeNull()
    expect(card!.getAttribute('data-payment-ui-state')).toBe('action_required')
    expect(card!.getAttribute('data-payment-phase')).toBe('action_required')
    // The student is told to approve on their handset and can re-check the status…
    expect(card!.textContent?.toLowerCase()).toContain('pin')
    expect(card!.querySelector('[data-testid="payment-check-status"]')).not.toBeNull()
    // …and is never invited to start a second collection.
    expect(card!.querySelector('[data-testid="payment-pay-action"]')).toBeNull()
  })

  it('a verified payment offers the receipt and no payment affordance', async () => {
    await renderAndWait()

    const card = container.querySelector('[data-application-id="app-003"]')
    expect(card).not.toBeNull()
    expect(card!.getAttribute('data-payment-ui-state')).toBe('confirmed')
    expect(card!.textContent).toContain('Certificate in Community Health')
    expect(card!.querySelector('[data-testid="payment-pay-action"]')).toBeNull()
  })

  it('a failed payment shows the admissions note and offers a retry', async () => {
    await renderAndWait()

    const card = container.querySelector('[data-application-id="app-004"]')
    expect(card).not.toBeNull()
    expect(card!.getAttribute('data-payment-ui-state')).toBe('retry_with_different_number')
    expect(card!.textContent).toContain('The last payment attempt could not be verified')
    expect(card!.querySelector('[data-testid="payment-pay-action"]')?.textContent).toContain('Try again')
  })

  it('orders applications that still need payment before settled ones (R13.1)', async () => {
    await renderAndWait()

    const ids = Array.from(container.querySelectorAll('[data-application-id]')).map((node) =>
      node.getAttribute('data-application-id'),
    )
    expect(ids).toHaveLength(4)
    // app-003 is the only verified one, so it sorts last.
    expect(ids[ids.length - 1]).toBe('app-003')
  })

  it('renders each application payment history from the canonical rows', async () => {
    await renderAndWait()

    const toggles = container.querySelectorAll('[data-testid="payment-history-toggle"]')
    // Three of the four applications have a payment row.
    expect(toggles.length).toBe(3)
    expect(Array.from(toggles).some((node) => node.textContent?.includes('Payment history (1)'))).toBe(true)
  })

  it('renders server amounts verbatim, and no stale application_fee column', async () => {
    await renderAndWait()

    const html = container.innerHTML || ''
    expect(html).toContain('K153.00')
    // The page must not render the legacy integer fee column (`153` with no
    // decimals) as an amount — the ledger/quote strings are the only money.
    expect(html).not.toContain('>K153<')
  })

  // ── Empty states / ownership hand-off ───────────────────────────────

  it('shows an empty state when no applications exist', async () => {
    currentMockApplicationsData = []
    currentMockPaymentsData = {}

    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('No payments yet')
    expect(text).toContain('Once you submit an application')
  })

  it('hands a draft-only student back to the wizard (R12.3)', async () => {
    currentMockApplicationsData = [
      {
        id: 'draft-001',
        status: 'draft',
        payment_status: null,
        program: 'Draft Programme',
        application_number: null,
        full_name: 'Jane Doe',
        email: 'student@example.com',
        phone: '+260970000001',
        created_at: '2026-04-01T08:00:00Z',
        last_payment_audit_notes: null,
      },
    ]
    currentMockPaymentsData = {}

    await renderAndWait()
    const text = container.textContent || ''
    // The fee for a draft is paid in the wizard, and the page says so instead of
    // showing an empty history.
    expect(text).toContain('Nothing to pay here yet')
    expect(text).toContain('on the payment step of the form')
    expect(text).toContain('Continue your application')
  })

  it('does not route draft work through the payment page', async () => {
    currentMockApplicationsData = [
      ...buildPaymentApplications(djangoApplicationsWithPayment.applications),
      {
        id: 'draft-001',
        status: 'draft',
        payment_status: null,
        program: 'Draft Programme',
        application_number: null,
        full_name: 'Jane Doe',
        email: 'student@example.com',
        phone: '+260970000001',
        created_at: '2026-04-01T08:00:00Z',
        last_payment_audit_notes: null,
      },
    ]

    await renderAndWait()

    const text = container.textContent || ''
    expect(text).not.toContain('Draft Programme')
    expect(container.querySelector('[data-application-id="draft-001"]')).toBeNull()
  })

  // ── Error handling ──────────────────────────────────────────────────

  it('shows an error message and a retry when the fetch fails', async () => {
    currentMockError = new Error('Network timeout')
    currentMockApplicationsData = []
    currentMockPaymentsData = {}

    await renderAndWait()
    const text = container.textContent || ''
    expect(text).toContain('Unable to load your payments')
    expect(text).toContain('Try again')
  })

  // ── R13.1 / STU-24: support contact comes from tenant context ────────

  it('routes support to the in-app contact page on the neutral portal', async () => {
    await renderAndWait()

    const link = container.querySelector('[data-testid="payment-page-support"]')
    expect(link).not.toBeNull()
    expect(link!.getAttribute('data-support-kind')).toBe('platform_contact_page')
    expect(link!.getAttribute('href')).toBe('/contact')
    // No hardcoded platform address anywhere on the page — that was STU-24.
    expect((container.innerHTML || '').toLowerCase()).not.toContain('admissions@beanola.com')
  })

  it('uses the resolved tenant admissions address when the host resolved a school', async () => {
    currentPortalBrand = {
      ...currentPortalBrand,
      brandName: 'Example School',
      isWhiteLabel: true,
      supportEmail: 'admissions@example-school.edu.zm',
    }

    await renderAndWait()

    const link = container.querySelector('[data-testid="payment-page-support"]')
    expect(link).not.toBeNull()
    expect(link!.getAttribute('data-support-kind')).toBe('tenant_email')
    expect(link!.getAttribute('href')).toContain('mailto:admissions@example-school.edu.zm')
    expect(container.textContent).toContain('Example School')
  })

  // ── queryFn correctly maps the Django response ──────────────────────

  it('queryFn maps the Django application response to the payment surface fields', async () => {
    await renderAndWait()

    expect(capturedApplicationQueryFn).toBeDefined()
    const result = await capturedApplicationQueryFn!()
    const apps = result as Array<Record<string, unknown>>

    expect(apps).toHaveLength(4)

    // app-001: null payment status stays null (never coerced to a string).
    expect(apps[0].id).toBe('app-001')
    expect(apps[0].payment_status).toBeNull()
    expect(apps[0].application_number).toBe('APP-20250115-AAAAAAAA')

    // app-002: pending_review preserved.
    expect(apps[1].payment_status).toBe('pending_review')
    expect(apps[1].program).toBe('Diploma in Pharmacy')

    // app-003 / app-004: verified + rejected with the audit note preserved.
    expect(apps[2].payment_status).toBe('verified')
    expect(apps[3].payment_status).toBe('rejected')
    expect(apps[3].last_payment_audit_notes).toBe(
      'The last payment attempt could not be verified. Please review the latest instructions and try again.',
    )

    // The stale fee column is deliberately NOT carried onto the payment surface.
    for (const app of apps) {
      expect(app.application_fee).toBeUndefined()
    }
  })

  it('groups the canonical payment rows by application', async () => {
    await renderAndWait()

    expect(capturedPaymentsQueryFn).toBeDefined()
    const grouped = (await capturedPaymentsQueryFn!()) as Record<string, unknown[]>

    expect(mockListPayments).toHaveBeenCalled()
    expect(Object.keys(grouped).sort()).toEqual(['app-001', 'app-002', 'app-003', 'app-004'])
    expect(grouped['app-001']).toHaveLength(0)
    expect(grouped['app-002']).toHaveLength(1)
    expect((grouped['app-002'][0] as Record<string, unknown>).phase).toBe('action_required')
  })
})
