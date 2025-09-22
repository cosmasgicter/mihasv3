import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const getOverviewMock = vi.hoisted(() => vi.fn())

vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    loading,
    disabled,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) => (
    <button {...props} disabled={disabled || Boolean(loading)}>{children}</button>
  )
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } })
    }
  }))
}))

vi.mock('@/services/admin/dashboard', async () => {
  const actual = await vi.importActual<typeof import('@/services/admin/dashboard')>('@/services/admin/dashboard')
  return {
    ...actual,
    adminDashboardService: {
      ...actual.adminDashboardService,
      getOverview: getOverviewMock
    }
  }
})

import { FixedAdminDashboard } from '../FixedAdminDashboard'
import {
  createEmptyDashboardResponse,
  type AdminDashboardResponse
} from '@/services/admin/dashboard'

const buildDashboardResponse = (): AdminDashboardResponse => {
  const base = createEmptyDashboardResponse()

  return {
    ...base,
    stats: {
      ...base.stats,
      totalApplications: 120,
      pendingApplications: 20,
      approvedApplications: 80,
      rejectedApplications: 20,
      totalPrograms: 12,
      activeIntakes: 3,
      totalStudents: 450,
      todayApplications: 10,
      weekApplications: 50,
      monthApplications: 200,
      avgProcessingTime: 2.5,
      avgProcessingTimeHours: 60,
      medianProcessingTimeHours: 48,
      p95ProcessingTimeHours: 120,
      decisionVelocity24h: 18,
      activeUsers: 7,
      activeUsersLast7d: 22,
      systemHealth: 'good'
    },
    statusBreakdown: {
      total: 120,
      approved: 80,
      rejected: 20,
      submitted: 10,
      under_review: 10
    },
    periodTotals: {
      today: 10,
      this_week: 50,
      this_month: 200
    },
    totalsSnapshot: {
      active_programs: 12
    },
    processingMetrics: {
      ...base.processingMetrics,
      averageDays: 2.5,
      averageHours: 60,
      medianHours: 48,
      p95Hours: 120,
      decisionVelocity24h: 18,
      activeAdminsLast24h: 7,
      activeAdminsLast7d: 22
    },
    recentActivity: [
      {
        id: '1',
        type: 'approval',
        message: 'Jane Doe - Application approved',
        timestamp: '2024-01-01T00:00:00.000Z',
        user: 'Jane Doe',
        status: 'approved',
        paymentStatus: 'paid',
        submittedAt: '2023-12-30T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        createdAt: '2023-12-29T00:00:00.000Z',
        program: 'Nursing',
        intake: 'Spring 2024'
      }
    ]
  }
}

describe('<FixedAdminDashboard />', () => {
  beforeEach(() => {
    getOverviewMock.mockReset()
    getOverviewMock.mockResolvedValue(buildDashboardResponse())
  })

  it('renders aggregated metrics returned by the admin dashboard service', async () => {
    render(<FixedAdminDashboard />)

    await waitFor(() => expect(getOverviewMock).toHaveBeenCalledTimes(1))

    const todayValue = await screen.findByTestId('today-applications-value')
    const pendingValue = screen.getByTestId('pending-applications-value')
    const approvalValue = screen.getByTestId('approval-rate-value')
    const avgProcessingValue = screen.getByTestId('avg-processing-value')

    expect(todayValue.textContent).toContain('10')
    expect(pendingValue.textContent).toContain('20')
    expect(approvalValue.textContent).toContain('80%')
    expect(avgProcessingValue.textContent).toContain('2.5')
    expect(screen.getByText(/Status Distribution/i)).toBeTruthy()
    expect(screen.getByText(/Processing Performance/i)).toBeTruthy()
    expect(screen.getByText(/Active admins \(24h\)/i)).toBeTruthy()
    expect(screen.getByText(/Jane Doe - Application approved/)).toBeTruthy()
  })

  it('surfaces failures from the admin dashboard service', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    getOverviewMock.mockRejectedValueOnce(new Error('boom'))
    getOverviewMock.mockResolvedValueOnce(buildDashboardResponse())

    try {
      render(<FixedAdminDashboard />)

      await waitFor(() =>
        expect(screen.getByText(/Failed to load dashboard metrics/)).toBeTruthy()
      )
    } finally {
      consoleError.mockRestore()
    }
  })
})
