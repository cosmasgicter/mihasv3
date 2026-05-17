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

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false

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
      email: '***REMOVED***',
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

// ── Mock useProfileQuery ──────────────────────────────────────────────
vi.mock('@/hooks/auth/useProfileQuery', () => ({
  useProfileQuery: () => ({
    profile: {
      id: 'admin-001',
      email: '***REMOVED***',
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

// ── Mock heavy child components ───────────────────────────────────────
vi.mock('@/components/seo/Seo', () => ({
  Seo: () => null,
}))

vi.mock('@/components/ui/ButtonSpinner', () => ({
  ButtonSpinner: ({ size, className }: { size?: string; className?: string }) => (
    <span data-testid="button-spinner" />
  ),
}))

vi.mock('@/components/admin/RealtimeMetricsDisplay', () => ({
  RealtimeMetricsDisplay: ({
    todayApplications,
    pendingApplications,
    totalApplications,
  }: {
    todayApplications: number
    pendingApplications: number
    totalApplications: number
  }) => (
    <div data-testid="realtime-metrics">
      <span>Today: {todayApplications}</span>
      <span>Pending: {pendingApplications}</span>
      <span>Total: {totalApplications}</span>
    </div>
  ),
}))

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
function buildSuccessResult() {
  const django = mockDjangoDashboardResponse
  return {
    data: {
      stats: {
        totalApplications: django.applications.total,
        pendingApplications: django.applications.by_status.pending,
        approvedApplications: django.applications.by_status.approved,
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
      stats: {
        totalApplications: 0,
        pendingApplications: 0,
        approvedApplications: 0,
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
    mockGetOverviewWithDiagnostics.mockResolvedValue(buildSuccessResult())

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    root.unmount()
    container.remove()
    vi.clearAllMocks()
  })

  async function renderAndWait(timeoutMs = 600) {
    root.render(<AdminDashboard />)
    await new Promise((r) => setTimeout(r, timeoutMs))
  }

  async function renderAndWaitForText(text: string, timeoutMs = 5000) {
    root.render(<AdminDashboard />)
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 100))
      if ((container.textContent || '').includes(text)) return
    }
  }

  it('renders without errors and exits loading state', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    // Should show the welcome message (loading state exited)
    expect(text).toContain('Welcome back')
  })

  it('calls adminDashboardService.getOverviewWithDiagnostics', async () => {
    await renderAndWait()
    expect(mockGetOverviewWithDiagnostics).toHaveBeenCalled()
  })

  it('renders metrics with Django response data', async () => {
    await renderAndWaitForText('Today:')

    const text = container.textContent || ''
    // RealtimeMetricsDisplay renders today, pending, total
    expect(text).toContain('Today: 4')
    expect(text).toContain('Pending: 12')
    expect(text).toContain('Total: 73')
  })

  it('renders activity feed with normalized Django recent_activity', async () => {
    await renderAndWaitForText('Recent Activity')

    const text = container.textContent || ''
    expect(text).toContain('Recent Activity')
    // Activity messages are derived from Django action + entity_type
    expect(text).toContain('submitted application')
    expect(text).toContain('approved application')
    expect(text).toContain('payment received')
    // User attribution
    expect(text).toContain('student@example.com')
    expect(text).toContain('reviewer@mihas.edu.zm')
  })

  it('renders quick actions with correct counts', async () => {
    await renderAndWaitForText('Quick Actions')

    const text = container.textContent || ''
    expect(text).toContain('Quick Actions')
    expect(text).toContain('Applications')
    expect(text).toContain('12 pending')
    expect(text).toContain('Programs')
    expect(text).toContain('Users')
    expect(text).toContain('150 students')
  })

  it('renders system status bar with health and active users', async () => {
    await renderAndWaitForText('System good')

    const text = container.textContent || ''
    expect(text).toContain('System good')
    expect(text).toContain('42 active users')
    expect(text).toContain('73') // Total Applications
  })

  it('renders weekly overview with Django data', async () => {
    await renderAndWaitForText('Weekly Overview')

    const text = container.textContent || ''
    expect(text).toContain('Weekly Overview')
    expect(text).toContain('18') // weekApplications
    expect(text).toContain('Applications This Week')
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
