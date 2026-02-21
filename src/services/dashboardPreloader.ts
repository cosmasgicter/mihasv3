import { QueryClient } from '@tanstack/react-query'
import type { UserProfile } from '@/types/database'
import { CACHE_CONFIG } from '@/hooks/queries/useSupabaseQuery'
import { applicationService } from '@/services/applications'
import { catalogService } from '@/services/catalog'
import { apiClient } from '@/services/client'
import { ApiErrorHandler } from '@/lib/apiErrorHandler'
import { adminDashboardService } from '@/services/admin/dashboard'

type StudentDashboardPreload = {
  applications: Array<Record<string, unknown>>
  studentDashboard: {
    applications: Array<{
      id: string
      application_number: string
      status: string
      program: string
      created_at: string
      updated_at: string
      payment_status: string
    }>
  }
  notifications: Array<Record<string, unknown>>
  intakes: Array<Record<string, unknown>>
}

type AdminDashboardPreload = {
  applications: Array<Record<string, unknown>>
  stats: {
    totalApplications: number
    pendingApplications: number
    approvedApplications: number
    rejectedApplications: number
    todayApplications: number
    weekApplications: number
  }
  dashboard: Awaited<ReturnType<typeof adminDashboardService.getOverview>>
  notifications: Array<Record<string, unknown>>
}

const isTransientNetworkError = (error: unknown): boolean => ApiErrorHandler.isRetryableError(error)

async function preloadStudentDashboard(_userId: string): Promise<StudentDashboardPreload> {
  try {
    const [applicationResult, intakesResult, notificationsResult] = await Promise.all([
      applicationService.list({
        page: 0,
        pageSize: 50,
        sortBy: 'date',
        sortOrder: 'desc',
        mine: true,
      }),
      catalogService.getIntakes(),
      apiClient.request<Array<Record<string, unknown>>>('/notifications?action=list'),
    ])

    const applications = (applicationResult?.applications ?? []) as Array<Record<string, unknown>>

    return {
      applications,
      studentDashboard: {
        applications: applications.map((app) => ({
          id: String(app.id ?? ''),
          application_number: String(app.application_number ?? ''),
          status: String(app.status ?? ''),
          program: String(app.program ?? ''),
          created_at: String(app.created_at ?? ''),
          updated_at: String(app.updated_at ?? ''),
          payment_status: String(app.payment_status ?? ''),
        })),
      },
      notifications: (notificationsResult ?? []) as Array<Record<string, unknown>>,
      intakes: ((intakesResult as { intakes?: Array<Record<string, unknown>> } | null)?.intakes ?? []),
    }
  } catch (error) {
    if (isTransientNetworkError(error)) {
      console.warn('Transient error preloading student dashboard; skipping preload data.', error)
      return {
        applications: [],
        studentDashboard: { applications: [] },
        notifications: [],
        intakes: [],
      }
    }

    throw error
  }
}

async function preloadAdminDashboard(): Promise<AdminDashboardPreload> {
  try {
    const [applicationResult, statsResult, dashboardResult, notificationsResult] = await Promise.all([
      applicationService.list({
        page: 0,
        pageSize: 50,
        sortBy: 'date',
        sortOrder: 'desc',
      }),
      apiClient.request<{
        totalApplications?: number
        pendingApplications?: number
        approvedApplications?: number
        rejectedApplications?: number
        todayApplications?: number
        weekApplications?: number
        pendingReviews?: number
      }>('/admin?action=stats'),
      adminDashboardService.getOverview(),
      apiClient.request<Array<Record<string, unknown>>>('/notifications?action=list'),
    ])

    const stats = {
      totalApplications: statsResult?.totalApplications ?? 0,
      pendingApplications: statsResult?.pendingApplications ?? statsResult?.pendingReviews ?? 0,
      approvedApplications: statsResult?.approvedApplications ?? 0,
      rejectedApplications: statsResult?.rejectedApplications ?? 0,
      todayApplications: statsResult?.todayApplications ?? 0,
      weekApplications: statsResult?.weekApplications ?? 0,
    }

    return {
      applications: (applicationResult?.applications ?? []) as Array<Record<string, unknown>>,
      stats,
      dashboard: dashboardResult,
      notifications: (notificationsResult ?? []) as Array<Record<string, unknown>>,
    }
  } catch (error) {
    if (isTransientNetworkError(error)) {
      console.warn('Transient error preloading admin dashboard; skipping preload data.', error)
      return {
        applications: [],
        stats: {
          totalApplications: 0,
          pendingApplications: 0,
          approvedApplications: 0,
          rejectedApplications: 0,
          todayApplications: 0,
          weekApplications: 0,
        },
        dashboard: {
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
        notifications: [],
      }
    }

    throw error
  }
}

export function getCriticalDashboardQueries(role: string): string[] {
  if (role === 'admin' || role === 'super_admin') {
    return ['admin-applications', 'admin-stats', 'admin-dashboard', 'admin-notifications']
  }

  return ['student-applications', 'student-dashboard-polling', 'student-notifications', 'active-intakes']
}

export async function preloadDashboardData(
  queryClient: QueryClient,
  userId: string,
  profile: UserProfile | null
): Promise<void> {
  if (!profile) {
    return
  }

  const role = profile.role || 'student'

  try {
    if (role === 'admin' || role === 'super_admin') {
      const data = await preloadAdminDashboard()

      queryClient.setQueryData(['applications'], data.applications, { updatedAt: Date.now() })
      queryClient.setQueryData(['admin-dashboard-polling'], data.stats, { updatedAt: Date.now() })
      queryClient.setQueryData(['admin-dashboard'], data.dashboard, { updatedAt: Date.now() })
      queryClient.setQueryData(['notifications', userId], data.notifications, { updatedAt: Date.now() })
    } else {
      const data = await preloadStudentDashboard(userId)

      queryClient.setQueryData(['applications', userId], data.applications, { updatedAt: Date.now() })
      queryClient.setQueryData(['student-dashboard-polling', userId], data.studentDashboard, { updatedAt: Date.now() })
      queryClient.setQueryData(['notifications', userId], data.notifications, { updatedAt: Date.now() })
      queryClient.setQueryData(['intakes'], data.intakes, { updatedAt: Date.now() })
    }
  } catch (error) {
    if (isTransientNetworkError(error)) {
      console.warn('Transient error preloading dashboard data:', error)
      return
    }

    console.error('Error preloading dashboard data:', error)
  }
}

export async function prefetchDashboardQueries(
  queryClient: QueryClient,
  userId: string,
  role: string
): Promise<void> {
  if (role === 'admin' || role === 'super_admin') {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: ['applications'],
        queryFn: async () => (await applicationService.list({ page: 0, pageSize: 50, sortBy: 'date', sortOrder: 'desc' }))?.applications ?? [],
        ...CACHE_CONFIG.applications,
      }),
      queryClient.prefetchQuery({
        queryKey: ['admin-dashboard-polling'],
        queryFn: async () => {
          const statsResult = await apiClient.request<{
            totalApplications?: number
            pendingApplications?: number
            approvedApplications?: number
            rejectedApplications?: number
            todayApplications?: number
            weekApplications?: number
            pendingReviews?: number
          }>('/admin?action=stats')

          return {
            totalApplications: statsResult?.totalApplications ?? 0,
            pendingApplications: statsResult?.pendingApplications ?? statsResult?.pendingReviews ?? 0,
            approvedApplications: statsResult?.approvedApplications ?? 0,
            rejectedApplications: statsResult?.rejectedApplications ?? 0,
            todayApplications: statsResult?.todayApplications ?? 0,
            weekApplications: statsResult?.weekApplications ?? 0,
          }
        },
        ...CACHE_CONFIG.applications,
      }),
      queryClient.prefetchQuery({
        queryKey: ['admin-dashboard'],
        queryFn: () => adminDashboardService.getOverview(),
        ...CACHE_CONFIG.applications,
      }),
      queryClient.prefetchQuery({
        queryKey: ['notifications', userId],
        queryFn: async () => (await apiClient.request<Array<Record<string, unknown>>>('/notifications?action=list')) ?? [],
        ...CACHE_CONFIG.applications,
      }),
    ])

    return
  }

  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: ['applications', userId],
      queryFn: async () => (await applicationService.list({ page: 0, pageSize: 50, sortBy: 'date', sortOrder: 'desc', mine: true }))?.applications ?? [],
      ...CACHE_CONFIG.applications,
    }),
    queryClient.prefetchQuery({
      queryKey: ['student-dashboard-polling', userId],
      queryFn: async () => {
        const response = await applicationService.list({ page: 0, pageSize: 50, sortBy: 'date', sortOrder: 'desc', mine: true })
        return {
          applications: (response?.applications ?? []).map((app) => ({
            id: app.id ?? '',
            application_number: app.application_number ?? '',
            status: app.status ?? '',
            program: app.program ?? '',
            created_at: app.created_at ?? '',
            updated_at: app.updated_at ?? '',
            payment_status: app.payment_status ?? '',
          })),
        }
      },
      ...CACHE_CONFIG.applications,
    }),
    queryClient.prefetchQuery({
      queryKey: ['notifications', userId],
      queryFn: async () => (await apiClient.request<Array<Record<string, unknown>>>('/notifications?action=list')) ?? [],
      ...CACHE_CONFIG.applications,
    }),
    queryClient.prefetchQuery({
      queryKey: ['intakes'],
      queryFn: async () => ((await catalogService.getIntakes())?.intakes ?? []),
      ...CACHE_CONFIG.static,
    }),
  ])
}
