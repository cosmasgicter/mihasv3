/**
 * Property P19 / Correctness Property 12: no-scope staff see "No school access
 * assigned", never global zeros.
 *
 * Spec: .kiro/specs/multi-tenant-beanola-admissions.
 *   - Scaffolded as a Phase 0 exploration baseline (task 1.2 / 1.11).
 *   - Repointed by Phase 5 task 23.4 at the now scope-aware admin Dashboard
 *     surface shipped in task 23.3.
 *
 * Design Testing Strategy P19 / Correctness Property 12:
 *   "UI: no-scope staff → 'No school access assigned' (never global zeros)"
 *   → apps/admissions/tests/unit/noScopeEmptyState.test.tsx
 *
 * Task 23.3 made the admin Dashboard scope-aware via `resolveDashboardScope`
 * (`pages/admin/lib/dashboardScope.ts`) driven by the backend `no_school_access`
 * flag threaded through `services/admin/dashboard.ts` →
 * `hooks/admin/useAdminDashboardLoader.ts`. When a non-super-admin caller has no
 * membership/grant scope, the Dashboard renders an explicit "No school access
 * assigned" `EmptyState` with a "Contact support" path and renders NO numeric
 * counts (R11.6).
 *
 * This file now asserts that contract against the REAL Dashboard surface (no
 * `it.fails` divergence marker — the divergence is closed):
 *
 *   1. PRIMITIVE (PASS) — the canonical `EmptyState` building block can express
 *      the no-scope state with no numeric/zero counts.
 *   2. SURFACE — rendering the real `AdminDashboard` for a no-scope staff user
 *      shows the no-scope state and never the global-zeros metrics widget; a
 *      scoped staff user and a super-admin both bypass the no-scope state and
 *      see the metrics surface.
 *
 * `.tsx` + React Testing Library, example-based (consistent with the design's
 * P19 placement under tests/unit/).
 *
 * **Validates: Requirements R11.6, R14.8** (P19 / Correctness Property 12)
 */
import { render, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { EmptyState } from '@/components/ui/EmptyState'
import type { UseAdminDashboardLoaderResult } from '@/hooks/admin'
import type { AdminDashboardStats } from '@/services/admin/dashboard'

// ── Mocks: control the Dashboard's data + identity boundaries ─────────────
// The scope decision (`resolveDashboardScope`) and the no-scope EmptyState
// branch are NOT mocked — they run for real so the test exercises the actual
// rendered surface.

const mockUseAuth = vi.fn()
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

const mockUseProfileQuery = vi.fn(() => ({ profile: null }))
vi.mock('@/hooks/auth/useProfileQuery', () => ({
  useProfileQuery: () => mockUseProfileQuery(),
}))

const mockLoader = vi.fn()
vi.mock('@/hooks/admin', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/admin')>('@/hooks/admin')
  return {
    ...actual,
    useAdminDashboardLoader: () => mockLoader(),
  }
})

const mockPortalBrand = vi.fn(() => ({
  brandName: 'Beanola Admissions',
  brandOwner: 'Beanola Technologies',
  isWhiteLabel: false,
  offeringInstitutionId: undefined as string | undefined,
  supportEmail: 'support@beanola.com',
  isLoading: false,
}))
vi.mock('@/hooks/usePortalBrand', () => ({
  usePortalBrand: () => mockPortalBrand(),
}))

vi.mock('@/hooks/useAdminDashboardPolling', () => ({
  useAdminDashboardPolling: () => ({ isPolling: false, error: null, refresh: vi.fn() }),
}))

vi.mock('@/hooks/useManualRefresh', () => ({
  useAdminDashboardRefresh: () => ({ forceRefresh: vi.fn(), isRefreshing: false }),
}))

vi.mock('@/lib/speculativePrefetch', () => ({
  onAdminDashboardMount: vi.fn(),
}))

import AdminDashboard from '@/pages/admin/Dashboard'

const NO_SCOPE_HEADING = 'No school access assigned'
const NO_SCOPE_DESCRIPTION =
  'Your account is not linked to any school yet. Contact a super administrator to be granted access.'

const ZERO_STATS: AdminDashboardStats = {
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
  systemHealth: 'good',
  pendingPayments: 0,
  pendingDocuments: 0,
  upcomingInterviews: 0,
  overdueReviews: 0,
  conditionsExpiringSoon: 0,
  enrollmentsExpiringSoon: 0,
}

/** A settled, successful loader result with a tunable `noSchoolAccess` flag. */
function loaderResult(noSchoolAccess: boolean): UseAdminDashboardLoaderResult {
  return {
    phase: 'success',
    stats: ZERO_STATS,
    recentActivity: [],
    error: null,
    errorIsNetwork: false,
    lastUpdated: new Date('2026-01-01T00:00:00Z'),
    hasLoadedOnce: true,
    noSchoolAccess,
    load: vi.fn(),
    patchStats: vi.fn(),
    patchActivity: vi.fn(),
    isInitialLoading: false,
    isRefreshing: false,
  }
}

beforeEach(() => {
  mockUseAuth.mockReset()
  mockLoader.mockReset()
  mockUseProfileQuery.mockReturnValue({ profile: null })
})

afterEach(() => {
  cleanup()
})

/** Render the Dashboard inside a router so its `<Link>` surfaces resolve. */
function renderDashboard() {
  return render(
    <MemoryRouter>
      <AdminDashboard />
    </MemoryRouter>,
  )
}

// ── Primitive: the no-scope state is expressible via EmptyState (PASS) ────

describe('P19: no-scope empty state primitive', () => {
  it('renders an explicit "No school access assigned" heading', () => {
    const { getByText } = render(
      <EmptyState
        heading={NO_SCOPE_HEADING}
        description={NO_SCOPE_DESCRIPTION}
        action={{ label: 'Contact support', onClick: vi.fn() }}
      />,
    )
    expect(getByText(NO_SCOPE_HEADING)).toBeTruthy()
  })

  it('offers a support path action rather than dead-ending the user', () => {
    const onClick = vi.fn()
    const { getByRole } = render(
      <EmptyState
        heading={NO_SCOPE_HEADING}
        description={NO_SCOPE_DESCRIPTION}
        action={{ label: 'Contact support', onClick }}
      />,
    )
    expect(getByRole('button', { name: 'Contact support' })).toBeTruthy()
  })

  it('shows no numeric/zero counts that could imply platform-wide totals', () => {
    const { container } = render(
      <EmptyState
        heading={NO_SCOPE_HEADING}
        description={NO_SCOPE_DESCRIPTION}
        action={{ label: 'Contact support', onClick: vi.fn() }}
      />,
    )
    expect(container.textContent ?? '').not.toMatch(/\d/)
  })
})

// ── Surface: the real scope-aware Dashboard honours R11.6 ─────────────────

describe('P19: scope-aware admin Dashboard no-scope surface (R11.6)', () => {
  it('renders the no-scope state for a staff user with no school scope', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'staff-1', role: 'admin' }, profileLoading: false })
    mockLoader.mockReturnValue(loaderResult(true))

    const { getByText, getByRole } = renderDashboard()

    // Contract A: an explicit no-scope state is shown with a support path.
    expect(getByText(NO_SCOPE_HEADING)).toBeTruthy()
    expect(getByRole('button', { name: /contact support/i })).toBeTruthy()
  })

  it('never renders global/zero aggregate counts for a no-scope staff user', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'staff-1', role: 'admin' }, profileLoading: false })
    mockLoader.mockReturnValue(loaderResult(true))

    const { container } = renderDashboard()
    const text = container.textContent ?? ''

    // Contract B: none of the global metrics-widget aggregates leak through,
    // and the no-scope surface renders no standalone numeric counts.
    expect(text).not.toContain('Total Applications')
    expect(text).not.toContain('Weekly Overview')
    expect(text).not.toContain('Needs attention')
    expect(text).not.toMatch(/\b\d+\b/)
  })

  it('points the support action at the runtime portal support mailbox', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'staff-1', role: 'admin' }, profileLoading: false })
    mockLoader.mockReturnValue(loaderResult(true))
    mockPortalBrand.mockReturnValueOnce({
      brandName: 'MIHAS Admissions',
      brandOwner: 'Beanola Technologies',
      isWhiteLabel: true,
      offeringInstitutionId: 'inst-mihas',
      supportEmail: 'help@mihas.edu.zm',
      isLoading: false,
    })

    // jsdom does not navigate on `mailto:` assignment, so capture the write to
    // `window.location.href` by swapping in a stub location for the assertion.
    const realLocation = window.location
    const hrefSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...realLocation, set href(value: string) { hrefSpy(value) }, get href() { return 'http://localhost:3000/' } },
    })

    try {
      const { getByRole } = renderDashboard()
      getByRole('button', { name: /contact support/i }).click()

      expect(hrefSpy).toHaveBeenCalledTimes(1)
      expect(hrefSpy.mock.calls[0]![0]).toContain('mailto:help@mihas.edu.zm')
      // The mailto carries a request-for-access subject (support path, R11.6).
      expect(hrefSpy.mock.calls[0]![0]).toContain('subject=')
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
    }
  })

  it('does NOT render the no-scope state for a scoped staff user (shows metrics instead)', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'staff-2', role: 'admin' }, profileLoading: false })
    mockLoader.mockReturnValue(loaderResult(false))

    const { queryByText, container } = renderDashboard()

    expect(queryByText(NO_SCOPE_HEADING)).toBeNull()
    // The scoped admin sees the real operational surface (metrics widget).
    expect(container.textContent ?? '').toContain('Total Applications')
  })

  it('does NOT render the no-scope state for a super-admin even if the flag is set', () => {
    // Super-admins are always global; the backend grants them all-access scope
    // before computing no_school_access, so the flag must never strand them.
    mockUseAuth.mockReturnValue({ user: { id: 'super-1', role: 'super_admin' }, profileLoading: false })
    mockLoader.mockReturnValue(loaderResult(true))

    const { queryByText, container } = renderDashboard()

    expect(queryByText(NO_SCOPE_HEADING)).toBeNull()
    expect(container.textContent ?? '').toContain('Total Applications')
  })
})
