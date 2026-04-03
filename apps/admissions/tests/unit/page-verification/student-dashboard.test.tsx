// @ts-nocheck
/**
 * Student Dashboard Page Verification Test
 *
 * Verifies the student dashboard correctly processes Django API response shapes
 * and renders data without errors. Mocks services with actual Django response
 * shapes (after envelope unwrap) and asserts correct rendering.
 *
 * Requirements: 12.1, 12.2, 12.3
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

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

// ── Mock useProfileQuery ──────────────────────────────────────────────
vi.mock('@/hooks/auth/useProfileQuery', () => ({
  useProfileQuery: () => ({
    profile: {
      id: 'user-001',
      email: 'student@example.com',
      role: 'student',
      full_name: 'Jane Doe',
      phone: '+260971234567',
      address: 'Lusaka, Zambia',
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

// ── Mock services with Django response shapes ─────────────────────────

// Django applications response shape (after envelope unwrap):
// { results: [{id, status, full_name, program, ...}], totalCount, page, pageSize }
const mockApplicationsResponse = {
  applications: [
    {
      id: 'app-001',
      user_id: 'user-001',
      application_number: 'APP-2025-001',
      status: 'submitted',
      program: 'Bachelor of Nursing',
      intake: 'January 2026',
      full_name: 'Jane Doe',
      email: 'student@example.com',
      phone: '+260971234567',
      created_at: '2025-01-15T10:00:00Z',
      submitted_at: '2025-01-16T14:30:00Z',
      payment_status: 'paid',
    },
    {
      id: 'app-002',
      user_id: 'user-001',
      application_number: 'APP-2025-002',
      status: 'under_review',
      program: 'Diploma in Pharmacy',
      intake: 'September 2025',
      full_name: 'Jane Doe',
      email: 'student@example.com',
      created_at: '2025-02-01T08:00:00Z',
      submitted_at: '2025-02-02T09:00:00Z',
      payment_status: 'paid',
    },
  ],
  totalCount: 2,
  page: 0,
  pageSize: 50,
}

// Django intakes response shape (after envelope unwrap):
// [{id, name, year, application_deadline, ...}]
const mockIntakesResponse = {
  intakes: [
    {
      id: 'intake-001',
      name: 'January 2026 Intake',
      application_deadline: '2025-12-15T23:59:59Z',
      start_date: '2026-01-10T00:00:00Z',
      end_date: '2026-06-30T00:00:00Z',
      is_active: true,
    },
    {
      id: 'intake-002',
      name: 'September 2025 Intake',
      application_deadline: '2025-08-01T23:59:59Z',
      start_date: '2025-09-01T00:00:00Z',
      end_date: '2026-02-28T00:00:00Z',
      is_active: true,
    },
  ],
}

// Django interviews response shape (after envelope unwrap):
// [{id, application_id, scheduled_at, mode, status, ...}]
const mockInterviewsResponse = {
  interviews: [
    {
      id: 'interview-001',
      application_id: 'app-001',
      scheduled_at: '2025-03-15T09:00:00Z',
      mode: 'in_person',
      location: 'MIHAS Campus, Room 201',
      status: 'scheduled',
      notes: null,
      program: 'Bachelor of Nursing',
      application_number: 'APP-2025-001',
    },
  ],
}

const mockApplicationServiceList = vi.fn()
const mockCatalogServiceGetIntakes = vi.fn()
const mockInterviewsServiceList = vi.fn()

vi.mock('@/services/applications', () => ({
  applicationService: {
    list: (...args: unknown[]) => mockApplicationServiceList(...args),
    delete: vi.fn().mockResolvedValue({ success: true }),
  },
}))

vi.mock('@/services/catalog', () => ({
  catalogService: {
    getIntakes: (...args: unknown[]) => mockCatalogServiceGetIntakes(...args),
    getPrograms: vi.fn().mockResolvedValue({ programs: [] }),
  },
}))

vi.mock('@/services/interviews', () => ({
  interviewsService: {
    list: (...args: unknown[]) => mockInterviewsServiceList(...args),
  },
}))

// ── Mock hooks that trigger side effects ──────────────────────────────
vi.mock('@/hooks/useManualRefresh', () => ({
  useStudentDashboardRefresh: () => ({
    forceRefresh: vi.fn(),
    isRefreshing: false,
  }),
}))

vi.mock('@/hooks/useStudentDashboardPolling', () => ({
  useStudentDashboardPolling: vi.fn(),
}))

vi.mock('@/hooks/useRealtime', () => ({
  useApplicationUpdates: vi.fn(),
}))

// ── Mock applicationSessionManager ────────────────────────────────────
vi.mock('@/lib/applicationSession', () => ({
  applicationSessionManager: {
    getLocalWizardDraft: vi.fn().mockResolvedValue(null),
    clearLocalWizardDraft: vi.fn(),
  },
}))

// ── Mock draftManager ─────────────────────────────────────────────────
vi.mock('@/lib/draftManager', () => ({
  draftManager: {
    clearAllDrafts: vi.fn().mockResolvedValue(undefined),
  },
  clearAllDraftData: vi.fn(),
}))

// ── Mock heavy child components ───────────────────────────────────────
vi.mock('@/components/seo/Seo', () => ({
  Seo: () => null,
}))

vi.mock('@/components/application/ContinueApplication', () => ({
  ContinueApplication: () => <div data-testid="continue-application" />,
}))

vi.mock('@/components/student/ApplicationTimeline', () => ({
  ApplicationTimeline: ({ applications }: { applications: unknown[] }) => (
    <div data-testid="application-timeline">Timeline ({applications?.length ?? 0})</div>
  ),
}))

vi.mock('@/components/student/DashboardStatusOverview', () => ({
  DashboardStatusOverview: () => <div data-testid="status-overview" />,
}))

vi.mock('@/components/ui/ProfileAutoPopulationIndicator', () => ({
  ProfileCompletionBadge: () => <div data-testid="profile-badge" />,
}))

// ── Mock tanstack react-query ─────────────────────────────────────────
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}))

// ── Mock logApiError (no-op for tests) ────────────────────────────────
vi.mock('@/lib/apiErrorLogger', () => ({
  logApiError: vi.fn(),
}))

// ── Import the component under test ───────────────────────────────────
import StudentDashboard from '@/pages/student/Dashboard'

describe('Student Dashboard page verification', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    mockNavigate.mockClear()

    // Default: return Django-shaped responses
    mockApplicationServiceList.mockResolvedValue(mockApplicationsResponse)
    mockCatalogServiceGetIntakes.mockResolvedValue(mockIntakesResponse)
    mockInterviewsServiceList.mockResolvedValue(mockInterviewsResponse)

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    root.unmount()
    container.remove()
    vi.clearAllMocks()
  })

  async function renderAndWait() {
    // Render without act() wrapper to avoid hanging on pending async work.
    root.render(<StudentDashboard />)
    // Wait for async service calls to resolve and React to re-render
    await new Promise((r) => setTimeout(r, 500))
  }

  async function renderAndWaitForText(text: string, timeoutMs = 5000) {
    root.render(<StudentDashboard />)
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 100))
      if ((container.textContent || '').includes(text)) return
    }
  }

  it('renders without errors and exits loading state', async () => {
    await renderAndWait()

    // Should contain the welcome message (loading state exited)
    expect(container.textContent).toContain('Welcome back')
  })

  it('calls applicationService.list with Django-compatible params', async () => {
    await renderAndWait()

    // Dashboard calls list twice: once for drafts, once for all applications
    expect(mockApplicationServiceList).toHaveBeenCalled()
    const calls = mockApplicationServiceList.mock.calls
    // At least one call should request mine: true
    const hasMineCall = calls.some(
      (args: unknown[]) => (args[0] as Record<string, unknown>)?.mine === true
    )
    expect(hasMineCall).toBe(true)
  })

  it('calls catalogService.getIntakes', async () => {
    await renderAndWait()
    expect(mockCatalogServiceGetIntakes).toHaveBeenCalled()
  })

  it('calls interviewsService.list', async () => {
    await renderAndWait()
    expect(mockInterviewsServiceList).toHaveBeenCalled()
  })

  it('displays submitted applications from Django response', async () => {
    await renderAndWait()

    const html = container.innerHTML
    // Both applications should appear (they are non-draft, so they show in "My applications")
    expect(html).toContain('APP-2025-001')
    expect(html).toContain('APP-2025-002')
  })

  it('displays intake deadlines from Django response', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('January 2026 Intake')
    expect(text).toContain('September 2025 Intake')
  })

  it('displays profile summary with user data', async () => {
    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('Jane Doe')
    expect(text).toContain('student@example.com')
  })

  it('shows per-section error when applications endpoint fails', async () => {
    mockApplicationServiceList.mockRejectedValue(new Error('Network timeout'))

    await renderAndWaitForText('Applications failed to load')

    const text = container.textContent || ''
    expect(text).toContain('Applications failed to load')
    expect(text).toContain('/api/v1/applications/')
    // Intakes should still render (partial failure handling)
    expect(text).toContain('January 2026 Intake')
  })

  it('shows per-section error when intakes endpoint fails', async () => {
    mockCatalogServiceGetIntakes.mockRejectedValue(new Error('Server error'))

    await renderAndWaitForText('Intakes failed to load')

    const text = container.textContent || ''
    expect(text).toContain('Intakes failed to load')
    expect(text).toContain('/api/v1/catalog/intakes/')
    // Applications should still render
    expect(text).toContain('APP-2025-001')
  })

  it('shows per-section error when interviews endpoint fails', async () => {
    mockInterviewsServiceList.mockRejectedValue(new Error('Connection refused'))

    // Interview errors render near QuickActions — wait longer for all sections to load
    await renderAndWaitForText('/api/v1/interviews/', 6000)

    const text = container.textContent || ''
    expect(text).toContain('Interviews failed to load')
    expect(text).toContain('/api/v1/interviews/')
  })

  it('renders empty state when no applications exist', async () => {
    mockApplicationServiceList.mockResolvedValue({
      applications: [],
      totalCount: 0,
      page: 0,
      pageSize: 50,
    })

    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('No applications yet')
  })

  it('renders empty state when no intakes exist', async () => {
    mockCatalogServiceGetIntakes.mockResolvedValue({ intakes: [] })

    await renderAndWait()

    const text = container.textContent || ''
    expect(text).toContain('No upcoming deadlines')
  })
})
