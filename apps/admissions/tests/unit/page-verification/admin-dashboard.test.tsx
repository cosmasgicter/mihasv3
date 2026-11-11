// @ts-nocheck
/**
 * Admin Dashboard Page Verification Test
 *
 * Verifies the admin dashboard correctly processes Django API response shapes
 * and renders metrics, activity feed, and quick actions without errors.
 * Mocks services with actual Django response shapes (after envelope unwrap).
 *
 * Requirements: 12.1, 12.2, 12.3
 */

import React, { act } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const originalReactActEnvironment = reactActEnvironment.IS_REACT_ACT_ENVIRONMENT

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
vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}))

// ── Mock AuthContext (admin user) ─────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-001',
      email: 'admin@mihas.edu.zm',
      role: 'admin',
      full_name: 'Admin User',
    },
    loading: false,
    profileLoading: false,
    isAdmin: true,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}))

// ── Mock capability context as platform admin for this page-level dashboard
// verification. Tenant-specific nav filtering is covered separately.
vi.mock('@/contexts/CapabilityContext', () => ({
  useCapabilities: () => ({
    isSuperAdmin: true,
    isTenantAdmin: false,
    capabilities: [],
    institutionCapabilities: {},
    selectedInstitutionId: null,
    setSelectedInstitutionId: vi.fn(),
    can: () => true,
    canForInstitution: () => true,
    noAccess: false,
    isLoading: false,
  }),
}))

// ── Mock useProfileQuery ──────────────────────────────────────────────
vi.mock('@/hooks/auth/useProfileQuery', () => ({
  useProfileQuery: () => ({
    profile: {
      id: 'admin-001',
      email: 'admin@mihas.edu.zm',
      role: 'admin',
      full_name: 'Admin User',
      phone: '+260971000000',
    },
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
    updateProfile: vi.fn(),
    updatingProfile: false,
    updateError: null,
  }),
}))

// ── Django admin dashboard response shape (after envelope unwrap) ─────
// This matches the actual Django API response for GET /api/v1/admin/dashboard/
const mockDjangoDashboardResponse = {
  applications: {
    by_status: {
      pending: 12,
      submitted: 8,
      approved: 45,
      rejected: 5,
      under_review: 3,
    },
    today: 4,
    this_week: 18,
    this_month: 52,
    total: 73,
  },
  users: { total: 150, active: 42 },
  recent_activity: [
    {
      id: 'act-001',
      action: 'submitted_application',
      entity_type: 'application',
      created_at: '2025-06-01T10:30:00Z',
      user: 'student@example.com',
    },
    {
      id: 'act-002',
      action: 'approved_application',
      entity_type: 'application',
      created_at: '2025-06-01T09:15:00Z',
      user: 'reviewer@mihas.edu.zm',
    },
    {
      id: 'act-003',
      action: 'payment_received',
      entity_type: 'payment',
      created_at: '2025-06-01T08:00:00Z',
    },
  ],
}

// ── Mock admin dashboard service ──────────────────────────────────────
const mockGetOverviewWithDiagnostics = vi.fn()

vi.mock('@/services/admin/dashboard', () => ({
  adminDashboardService: {
    getOverviewWithDiagnostics: (...args: unknown[]) => mockGetOverviewWithDiagnostics(...args),
    getOverview: vi.fn(),
  },
}))

// ── Mock hooks that trigger side effects ──────────────────────────────
vi.mock('@/hooks/useManualRefresh', () => ({
  useAdminDashboardRefresh: () => ({
    forceRefresh: vi.fn().mockResolvedValue(undefined),
    isRefreshing: false,
    lastRefreshed: null,
  }),
}))

vi.mock('@/hooks/useAdminDashboardPolling', () => ({
  useAdminDashboardPolling: () => ({
    stats: null,
    isLoading: false,
    isPolling: true,
    error: null,
    refresh: vi.fn(),
    lastUpdated: null,
  }),
}))

vi.mock('@/hooks/useToast', () => ({
  useToastStore: {
    getState: () => ({ addToast: vi.fn() }),
  },
}))

vi.mock('@/lib/speculativePrefetch', () => ({
  onAdminDashboardMount: vi.fn(),
}))

// ── Mock heavy child components ───────────────────────────────────────
vi.mock('@/components/seo/Seo', () => ({
  Seo: () => null,
}))

vi.mock('@/components/ui/ButtonSpinner', () => ({
  ButtonSpinner: ({ size, className }: { size?: string; className?: string }) => (
    <span data-testid="button-spinner" />
  ),
}))

// `RealtimeMetricsDisplay` is no longer mounted by the dashboard (task 9.2): it
// animated eight numbers it could neither label nor report as unknown, two of
// which (`avgProcessingTime`, `activeUsers`) had no source in the payload at all.
// The same volume figures are now rendered from the metric registry, each with
// the server's own definition.

// ── Mock logApiError ──────────────────────────────────────────────────
vi.mock('@/lib/apiErrorLogger', () => ({
  logApiError: vi.fn(),
}))

// ── Mock tanstack react-query to prevent provider requirement ─────────
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    resetQueries: vi.fn(),
    refetchQueries: vi.fn(),
  }),
  useQuery: () => ({
    data: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
  }),
}))

// ── Import the component under test ───────────────────────────────────
import AdminDashboard from '@/pages/admin/Dashboard'


// ── Build the normalized service response from Django data ─────────────
// This is what adminDashboardService.getOverviewWithDiagnostics() returns
// after normalizing the Django response shape above.
/**
 * The metric registry the backend publishes (task 9.2).
 *
 * This is what the dashboard renders. Each entry carries its value, its state,
 * and the sentence stating what it counts — the page has no path that turns an
 * absent entry into a zero, so a metric omitted here renders "Unknown".
 */
function metricEntry(
  key: string,
  value: number | null,
  extra: Record<string, unknown> = {},
) {
  return {
    key,
    value,
    state: value === null ? 'unknown' : 'ok',
    definition: `Definition for ${key}.`,
    scope: 'institution',
    source: 'applications',
    ...extra,
  }
}

function buildMetrics(overrides: Record<string, number | null> = {}) {
  const values: Record<string, number | null> = {
    total_applications: 73,
    decision_queue: 12,
    accepted_path: 45,
    rejected: 5,
    overdue_reviews: 2,
    deadline_pressure: 1,
    pending_documents: 6,
    payment_review: 3,
    upcoming_interviews: 4,
    today_activity: 4,
    applications_this_week: 18,
    applications_this_month: 52,
    payment_resolved: 40,
    payment_unpaid: 33,
    staff_accounts_total: 150,
    staff_accounts_enabled: 42,
    ...overrides,
  }
  const metrics: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    metrics[key] = metricEntry(key, value, {
      source: key.startsWith('staff_accounts') ? 'accounts' : 'applications',
      ...(value === null ? { reason: 'This metric’s source did not answer (OperationalError).' } : {}),
    })
  }
  return metrics
}

function buildSuccessResult() {
  const django = mockDjangoDashboardResponse
  return {
    data: {
      metrics: buildMetrics(),
      sources: {
        applications: { state: 'ok', reason: null },
        accounts: { state: 'ok', reason: null },
        activity: { state: 'ok', reason: null },
      },
      health: {
        state: 'operational' as const,
        definition: 'Every metric source answered this request.',
      },
      freshness: {
        generatedAt: new Date().toISOString(),
        staleAfterSeconds: 120,
      },
      scope: {
        kind: 'platform' as const,
        institutionId: null,
        allAccess: true,
        institutionCount: null,
      },
      windows: { review_sla_days: 5, deadline_pressure_hours: 48 },
      stats: {
        totalApplications: django.applications.total,
        pendingApplications: django.applications.by_status.pending,
        approvedApplications: django.applications.by_status.approved,
        conditionallyApprovedApplications: 0,
        enrolledApplications: 0,
        acceptedApplications: django.applications.by_status.approved,
        rejectedApplications: django.applications.by_status.rejected,
        totalPrograms: 0,
        activeIntakes: 0,
        totalStudents: django.users.total,
        todayApplications: django.applications.today,
        weekApplications: django.applications.this_week,
        monthApplications: django.applications.this_month,
        avgProcessingTime: 0,
        avgProcessingTimeHours: 0,
        medianProcessingTimeHours: 0,
        p95ProcessingTimeHours: 0,
        decisionVelocity24h: 0,
        activeUsers: django.users.active,
        activeUsersLast7d: 0,
        systemHealth: 'good' as const,
        pendingPayments: 0,
        pendingDocuments: 0,
        upcomingInterviews: 0,
        overdueReviews: 0,
        conditionsExpiringSoon: 0,
        enrollmentsExpiringSoon: 0,
      },
      statusBreakdown: { ...django.applications.by_status },
      periodTotals: {
        today: django.applications.today,
        this_week: django.applications.this_week,
        this_month: django.applications.this_month,
        total: django.applications.total,
      },
      totalsSnapshot: {},
      processingMetrics: {
        averageHours: 0,
        averageDays: 0,
        medianHours: 0,
        p95Hours: 0,
        decisionVelocity24h: 0,
        activeAdminsLast24h: django.users.active,
        activeAdminsLast7d: 0,
      },
      recentActivity: [
        {
          id: 'act-001',
          type: 'application' as const,
          message: 'submitted application application',
          timestamp: '2025-06-01T10:30:00Z',
          user: 'student@example.com',
        },
        {
          id: 'act-002',
          type: 'application' as const,
          message: 'approved application application',
          timestamp: '2025-06-01T09:15:00Z',
          user: 'reviewer@mihas.edu.zm',
        },
        {
          id: 'act-003',
          type: 'application' as const,
          message: 'payment received payment',
          timestamp: '2025-06-01T08:00:00Z',
        },
      ],
      generatedAt: null,
      noSchoolAccess: false,
    },
    diagnostics: {
      endpoint: '/admin/dashboard/' as const,
      ok: true,
      status: null,
      errorMessage: null,
      responseShape: 'valid' as const,
      requestedAt: '2025-06-01T12:00:00Z',
    },
  }
}

function buildErrorResult(message: string, status: number | null = null) {
  return {
    data: {
      // A failed read carries **no** metric registry (task 9.2). Every tile
      // renders "Unknown"; nothing renders a zero.
      metrics: {},
      sources: {},
      health: null,
      freshness: { generatedAt: null, staleAfterSeconds: 0 },
      scope: null,
      windows: {},
      stats: {
        totalApplications: 0,
        pendingApplications: 0,
        approvedApplications: 0,
        conditionallyApprovedApplications: 0,
        enrolledApplications: 0,
        acceptedApplications: 0,
        rejectedApplications: 0,
        totalPrograms: 0,
        activeIntakes: 0,
        totalStudents: 0,
        todayApplications: 0,
        weekApplications: 0,
        monthApplications: 0,
        avgProcessingTime: 0,
        avgProcessingTimeHours: 0,
        medianProcessingTimeHours: 0,
        p95ProcessingTimeHours: 0,
        decisionVelocity24h: 0,
        activeUsers: 0,
        activeUsersLast7d: 0,
        systemHealth: 'good' as const,
        pendingPayments: 0,
        pendingDocuments: 0,
        upcomingInterviews: 0,
        overdueReviews: 0,
        conditionsExpiringSoon: 0,
        enrollmentsExpiringSoon: 0,
      },
      statusBreakdown: {},
      periodTotals: {},
      totalsSnapshot: {},
      processingMetrics: {
        averageHours: 0,
        averageDays: 0,
        medianHours: 0,
        p95Hours: 0,
        decisionVelocity24h: 0,
        activeAdminsLast24h: 0,
        activeAdminsLast7d: 0,
      },
      recentActivity: [],
      generatedAt: null,
      noSchoolAccess: false,
    },
    diagnostics: {
      endpoint: '/admin/dashboard/' as const,
      ok: false,
      status,
      errorMessage: message,
      responseShape: 'invalid' as const,
      requestedAt: '2025-06-01T12:00:00Z',
    },
  }
}

describe('Admin Dashboard page verification', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    mockGetOverviewWithDiagnostics.mockResolvedValue(buildSuccessResult())

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.clearAllMocks()
    if (originalReactActEnvironment === undefined) {
      delete reactActEnvironment.IS_REACT_ACT_ENVIRONMENT
    } else {
      reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = originalReactActEnvironment
    }
  })

  async function renderAndWait(timeoutMs = 3000) {
    await act(async () => {
      root.render(<AdminDashboard />)
    })
    await new Promise((r) => setTimeout(r, timeoutMs))
  }

  async function renderAndWaitForText(text: string, timeoutMs = 20000) {
    await act(async () => {
      root.render(<AdminDashboard />)
    })
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100))
      })
      if ((container.textContent || '').includes(text)) {
        // Let downstream effects settle so subsequent assertions are stable.
        await act(async () => {
          await new Promise((r) => setTimeout(r, 100))
        })
        return
      }
    }
    throw new Error(
      `renderAndWaitForText timeout after ${timeoutMs}ms looking for "${text}". ` +
        `Last container text: ${(container.textContent || '').slice(0, 200)}`,
    )
  }

  it('renders without errors and exits loading state', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    // Should show the welcome message (loading state exited)
    expect(text).toContain('Welcome back')
  })

  it('calls adminDashboardService.getOverviewWithDiagnostics', async () => {
    await renderAndWaitForText('Welcome back')
    expect(mockGetOverviewWithDiagnostics).toHaveBeenCalled()
  })

  it('renders every number from the metric registry, with its definition', async () => {
    await renderAndWaitForText('Volume and outcomes')

    const text = container.textContent || ''
    // Headline metrics come from the registry, not from a page-derived stats block.
    expect(text).toContain('73')  // total_applications
    expect(text).toContain('12')  // decision_queue
    expect(text).toContain('18')  // applications_this_week
    expect(text).toContain('52')  // applications_this_month
    // Each rendered number carries the server's sentence (R8.6).
    expect(text).toContain('Definition for total_applications.')
    expect(text).toContain('Definition for applications_this_week.')
    expect(text).not.toContain('Unknown')
  })

  it('renders the three counters the payload used to omit entirely', async () => {
    // `overdue_reviews`, `deadline_pressure` and `pending_documents` were
    // rendered by the pre-9.2 dashboard but computed nowhere — the normalizer
    // read the absent keys as 0 (ADM-02).
    await renderAndWaitForText('Reviews past SLA')

    const text = container.textContent || ''
    expect(text).toContain('Definition for overdue_reviews.')
    expect(text).toContain('Definition for deadline_pressure.')
    expect(text).toContain('Definition for pending_documents.')
    // Each tile links to the roster query that answers it (task 9.1 spelling).
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/admin/applications?overdue_review=true')
    expect(hrefs).toContain('/admin/applications?deadline_pressure=true')
    expect(hrefs).toContain('/admin/applications?has_pending_documents=true')
    expect(text).not.toContain('Unknown')
  })

  it('renders Unknown — never a zero — when the read failed', async () => {
    mockGetOverviewWithDiagnostics.mockResolvedValue(
      buildErrorResult('Server returned 500', 500)
    )
    await renderAndWaitForText('Reviews past SLA')

    const text = container.textContent || ''
    const html = container.innerHTML
    expect(text).toContain('Unknown')
    // Not one tile claims a measured value.
    expect(html).not.toContain('data-metric-state="ok"')
    // The health claim is withheld rather than defaulted to a friendly word.
    expect(text).toContain('Data sources: Unknown')
    expect(text).not.toContain('System good')
    // The tile still offers the roster, because the roster can still count.
    expect(text).toContain('Open the roster to count')
  })

  it('marks a single failed source as unknown and leaves the rest answered', async () => {
    const result = buildSuccessResult()
    result.data.metrics = buildMetrics({
      staff_accounts_total: null,
      staff_accounts_enabled: null,
    })
    result.data.sources.accounts = {
      state: 'failed',
      reason: 'This metric’s source did not answer (OperationalError).',
    }
    result.data.health = {
      state: 'degraded',
      definition: 'At least one metric source failed; those metrics are unknown.',
    }
    mockGetOverviewWithDiagnostics.mockResolvedValue(result)

    await renderAndWaitForText('Volume and outcomes')

    const text = container.textContent || ''
    expect(text).toContain('Data sources: degraded')
    expect(text).toContain('At least one metric source failed')
    // The application numbers still answered.
    expect(text).toContain('73')
    // The account numbers did not, and say so instead of showing 0.
    expect(text).toContain('Unknown')
    expect(text).toContain('This metric’s source did not answer')
  })

  it('renders activity feed with normalized Django recent_activity', async () => {
    await renderAndWaitForText('Recent activity')

    const text = container.textContent || ''
    expect(text).toContain('Recent activity')
    // Activity messages are derived from Django action + entity_type
    expect(text).toContain('submitted application')
    expect(text).toContain('approved application')
    expect(text).toContain('payment received')
    // User attribution
    expect(text).toContain('student@example.com')
    expect(text).toContain('reviewer@mihas.edu.zm')
  })

  it('renders quick actions, counting only what a real metric supplies', async () => {
    await renderAndWaitForText('Quick actions')

    const text = container.textContent || ''
    expect(text).toContain('Quick actions')
    expect(text).toContain('Applications')
    expect(text).toContain('12 pending')
    expect(text).toContain('Programmes')
    expect(text).toContain('Users')
    // `staff_accounts_total` counts accounts in scope, not applicants (MAINT-02).
    expect(text).toContain('150 accounts')
    expect(text).not.toContain('150 students')
    // `totalPrograms` has no source in the payload, so no count is invented.
    expect(text).not.toContain('0 active')
  })

  it('states the read state, its freshness, and who the numbers describe', async () => {
    await renderAndWaitForText('Data sources: operational')

    const text = container.textContent || ''
    expect(text).toContain('Data sources: operational')
    expect(text).toMatch(/Measured \d+s ago/)
    // This actor is a scoped tenant admin, so the numbers describe their school.
    expect(text).toContain('Counting your school')
    // MAINT-02: the platform never measured presence, so nothing claims it.
    expect(text).not.toContain('active users online')
    expect(text).not.toContain('42 active users')
  })

  it('shows error state when dashboard API fails', async () => {
    mockGetOverviewWithDiagnostics.mockResolvedValue(
      buildErrorResult('Server returned 500', 500)
    )

    await renderAndWaitForText('Failed to load dashboard data')

    const text = container.textContent || ''
    expect(text).toContain('Failed to load dashboard data')
    expect(text).toContain('Server returned 500')
  })

  it('shows empty activity feed when no recent_activity', async () => {
    const result = buildSuccessResult()
    result.data.recentActivity = []
    mockGetOverviewWithDiagnostics.mockResolvedValue(result)

    await renderAndWaitForText('No recent activity')

    const text = container.textContent || ''
    expect(text).toContain('No recent activity')
  })
})
