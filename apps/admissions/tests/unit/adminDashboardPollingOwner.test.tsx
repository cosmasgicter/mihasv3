// Feature: system-performance-hardening
// Requirements: 11.2, 11.4, 11.5, 11.6
/**
 * Polling owner mount / unmount / failure unit tests (Task 18.3)
 *
 * Verifies the R11 consolidation: `useAdminDashboardPolling` is the SOLE owner
 * of admin dashboard metric refetching, and every other consumer
 * (`useStats` / app-stats, `useAdminPendingCount`) is a pure reader of the
 * shared `['admin-dashboard-polling']` React Query cache that issues NO polling
 * of its own.
 *
 * What is asserted:
 *  - R11.2: On mount, overlapping admin statistics are refetched EXCLUSIVELY
 *    through the owner. Owner + consumer mounted together dedup to a single
 *    network fetch on mount and a single owner-driven refetch stream after —
 *    never a doubled poll.
 *  - R11.4: A non-owner consumer mounted alone issues no interval refetch for
 *    the overlapping statistics (one initial read, then constant).
 *  - R11.5: When an owner refetch fails, the last successfully fetched stats are
 *    retained, an error indication is surfaced, and the next refetch is
 *    rescheduled (recovers on the following interval) without crashing.
 *  - R11.6: On unmount, all polling through the owner stops (no further fetches).
 *
 * The single mocked seam is `adminDashboardService.getOverview` — both the owner
 * (`fetchDashboardStats`) and every consumer ultimately call it, so its call
 * count is the authoritative measure of "who refetched".
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock the dashboard service: the one network seam shared by the owner and all
// consumers. Mock BEFORE importing the hooks/data modules under test.
vi.mock('@/services/admin/dashboard', () => ({
  adminDashboardService: {
    getOverview: vi.fn(),
  },
}))

import { adminDashboardService } from '@/services/admin/dashboard'
import {
  useAdminDashboardPolling,
  useAdminPendingCount,
} from '@/hooks/useAdminDashboardPolling'
import { applicationsData } from '@/data/applications'

const POLL_MS = 30_000

const getOverviewMock = vi.mocked(adminDashboardService.getOverview)

/** Build a getOverview payload with a recognisable total-applications value. */
function overview(totalApplications: number) {
  return {
    stats: {
      totalApplications,
      pendingApplications: 0,
      approvedApplications: 0,
      conditionallyApprovedApplications: 0,
      enrolledApplications: 0,
      acceptedApplications: 0,
      rejectedApplications: 0,
      todayApplications: 0,
      weekApplications: 0,
      avgProcessingTime: 0,
      systemHealth: 'good' as const,
      activeUsers: 0,
    },
    recentActivity: [],
  }
}

/** Build a 429 error so the owner's retry policy short-circuits (no retries). */
function rateLimitedError(): Error {
  return Object.assign(new Error('rate limited'), { status: 429 })
}

describe('admin dashboard polling owner (R11.2/11.4/11.5/11.6)', () => {
  let queryClient: QueryClient

  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  /** Advance fake timers and flush the promises React Query schedules. */
  async function advance(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  afterEach(() => {
    queryClient.clear()
    vi.useRealTimers()
  })

  it('R11.2: owner + consumer mounted together dedup to a single fetch on mount', async () => {
    getOverviewMock.mockResolvedValue(overview(10) as never)

    renderHook(
      () => {
        const owner = useAdminDashboardPolling({ pollingInterval: POLL_MS })
        const consumer = applicationsData.useStats()
        return { owner, consumer }
      },
      { wrapper },
    )

    // Let the initial mount fetch settle.
    await advance(0)

    // Two observers share `['admin-dashboard-polling']`; React Query dedups them
    // into exactly one network fetch on mount — the overlapping statistics are
    // fetched through the single shared (owner-owned) cache, not once per source.
    expect(getOverviewMock).toHaveBeenCalledTimes(1)
  })

  it('R11.4: a non-owner consumer mounted alone issues no polling refetch', async () => {
    getOverviewMock.mockResolvedValue(overview(7) as never)

    // useStats is a pure consumer: no refetchInterval of its own.
    renderHook(() => applicationsData.useStats(), { wrapper })

    await advance(0)
    // Initial read populates the shared cache once.
    expect(getOverviewMock).toHaveBeenCalledTimes(1)

    // Advance well past several polling intervals — a non-owner must not poll.
    await advance(POLL_MS * 5)
    expect(getOverviewMock).toHaveBeenCalledTimes(1)
  })

  it('R11.4: useAdminPendingCount consumer alone also issues no polling refetch', async () => {
    getOverviewMock.mockResolvedValue(overview(3) as never)

    renderHook(() => useAdminPendingCount(), { wrapper })

    await advance(0)
    expect(getOverviewMock).toHaveBeenCalledTimes(1)

    await advance(POLL_MS * 5)
    expect(getOverviewMock).toHaveBeenCalledTimes(1)
  })

  it('R11.2/R11.4: refetches are driven exclusively by the owner interval, never doubled', async () => {
    getOverviewMock.mockResolvedValue(overview(10) as never)

    renderHook(
      () => {
        const owner = useAdminDashboardPolling({ pollingInterval: POLL_MS })
        const consumer = applicationsData.useStats()
        return { owner, consumer }
      },
      { wrapper },
    )

    await advance(0) // mount fetch (1)
    expect(getOverviewMock).toHaveBeenCalledTimes(1)

    // Three owner-driven polling cycles.
    await advance(POLL_MS) // 2
    await advance(POLL_MS) // 3
    await advance(POLL_MS) // 4

    // 1 initial + 3 owner polls = 4. If the consumer also polled, this would be
    // doubled (8). It is not — the owner is the sole refetch driver.
    expect(getOverviewMock).toHaveBeenCalledTimes(4)
  })

  it('R11.5: owner refetch failure retains last-good stats, surfaces error, and reschedules', async () => {
    // First fetch succeeds with total=42 (the last-good value).
    getOverviewMock.mockResolvedValueOnce(overview(42) as never)

    const { result } = renderHook(
      () => useAdminDashboardPolling({ pollingInterval: POLL_MS }),
      { wrapper },
    )

    await advance(0)
    expect(result.current.stats?.totalApplications).toBe(42)
    expect(result.current.error).toBeNull()
    expect(getOverviewMock).toHaveBeenCalledTimes(1)

    // Next poll fails with a 429 (owner retry policy => no retries, deterministic).
    // Advance just past the interval boundary so the rejection settles.
    getOverviewMock.mockRejectedValueOnce(rateLimitedError() as never)
    await advance(POLL_MS + 1_000)

    // Last-good stats retained, error surfaced, dashboard did not crash.
    expect(result.current.stats?.totalApplications).toBe(42)
    expect(result.current.error).not.toBeNull()
    expect(getOverviewMock).toHaveBeenCalledTimes(2)

    // Recovery: the owner reschedules. After an error the interval backs off to
    // pollingInterval * 2 (60s). The next cycle succeeds with a fresh value.
    getOverviewMock.mockResolvedValueOnce(overview(99) as never)
    await advance(POLL_MS * 2)

    expect(getOverviewMock).toHaveBeenCalledTimes(3) // rescheduled refetch fired
    expect(result.current.stats?.totalApplications).toBe(99) // fresh stats applied
    expect(result.current.error).toBeNull() // error cleared on recovery
  })

  it('R11.6: unmounting the owner stops all polling', async () => {
    getOverviewMock.mockResolvedValue(overview(5) as never)

    const { unmount } = renderHook(
      () => useAdminDashboardPolling({ pollingInterval: POLL_MS }),
      { wrapper },
    )

    await advance(0) // mount fetch (1)
    await advance(POLL_MS) // one poll (2)
    expect(getOverviewMock).toHaveBeenCalledTimes(2)

    unmount()
    const callsAtUnmount = getOverviewMock.mock.calls.length

    // Advance several intervals after unmount — no observers remain, so the
    // owner's polling must be fully stopped.
    await advance(POLL_MS * 5)
    expect(getOverviewMock).toHaveBeenCalledTimes(callsAtUnmount)
  })
})
