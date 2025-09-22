import { apiClient } from '../client'

export type AdminDashboardStatusBreakdown = Record<string, number>

export type AdminDashboardPeriodTotals = Record<string, number>

export interface AdminDashboardProcessingMetrics {
  averageHours: number
  averageDays: number
  medianHours: number
  p95Hours: number
  decisionVelocity24h: number
  activeAdminsLast24h: number
  activeAdminsLast7d: number
}

export interface AdminDashboardStats {
  totalApplications: number
  pendingApplications: number
  approvedApplications: number
  rejectedApplications: number
  totalPrograms: number
  activeIntakes: number
  totalStudents: number
  todayApplications: number
  weekApplications: number
  monthApplications: number
  avgProcessingTime: number
  avgProcessingTimeHours: number
  medianProcessingTimeHours: number
  p95ProcessingTimeHours: number
  decisionVelocity24h: number
  activeUsers: number
  activeUsersLast7d: number
  systemHealth: 'excellent' | 'good' | 'warning' | 'critical'
}

export type AdminDashboardActivityType =
  | 'application'
  | 'approval'
  | 'rejection'
  | 'review'
  | 'system'

export interface AdminDashboardActivity {
  id: string
  type: AdminDashboardActivityType
  message: string
  timestamp: string
  user?: string
  status?: string
  paymentStatus?: string | null
  submittedAt?: string | null
  updatedAt?: string | null
  createdAt?: string | null
  program?: string | null
  intake?: string | null
}

export interface AdminDashboardResponse {
  stats: AdminDashboardStats
  statusBreakdown: AdminDashboardStatusBreakdown
  periodTotals: AdminDashboardPeriodTotals
  totalsSnapshot: Record<string, number>
  processingMetrics: AdminDashboardProcessingMetrics
  recentActivity: AdminDashboardActivity[]
  generatedAt: string | null
}

const DEFAULT_STATS: AdminDashboardStats = {
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
  systemHealth: 'good'
}

const DEFAULT_PROCESSING_METRICS: AdminDashboardProcessingMetrics = {
  averageHours: 0,
  averageDays: 0,
  medianHours: 0,
  p95Hours: 0,
  decisionVelocity24h: 0,
  activeAdminsLast24h: 0,
  activeAdminsLast7d: 0
}

const VALID_SYSTEM_HEALTH: Array<AdminDashboardStats['systemHealth']> = [
  'excellent',
  'good',
  'warning',
  'critical'
]

const VALID_ACTIVITY_TYPES: AdminDashboardActivityType[] = [
  'application',
  'approval',
  'rejection',
  'review',
  'system'
]

type RawProcessingMetrics = {
  average_hours?: unknown
  median_hours?: unknown
  p95_hours?: unknown
  decision_velocity_24h?: unknown
  active_admins_last_24h?: unknown
  active_admins_last_7d?: unknown
}

type RawDashboardResponse = {
  stats?: Record<string, unknown>
  statusBreakdown?: Record<string, unknown>
  periodTotals?: Record<string, unknown>
  applicationTrends?: Record<string, unknown>
  totalsSnapshot?: Record<string, unknown>
  processingMetrics?: RawProcessingMetrics
  recentActivity?: unknown
  generatedAt?: unknown
  generated_at?: unknown
}

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) {
    return 0
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const toIsoString = (value: unknown): string | null => {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const isoCandidate = typeof value === 'string' ? value : new Date(value).toISOString()
    const date = new Date(isoCandidate)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  return null
}

const normalizeNumberRecord = (record?: Record<string, unknown>): Record<string, number> => {
  if (!record || typeof record !== 'object') {
    return {}
  }

  return Object.entries(record).reduce<Record<string, number>>((acc, [key, value]) => {
    acc[key] = toNumber(value)
    return acc
  }, {})
}

const normalizeStats = (stats?: Record<string, unknown>): AdminDashboardStats => {
  const systemHealthCandidate = typeof stats?.systemHealth === 'string'
    ? stats.systemHealth.toLowerCase()
    : typeof stats?.system_health === 'string'
      ? stats.system_health.toLowerCase()
      : undefined

  const systemHealth = VALID_SYSTEM_HEALTH.includes(systemHealthCandidate as AdminDashboardStats['systemHealth'])
    ? systemHealthCandidate as AdminDashboardStats['systemHealth']
    : DEFAULT_STATS.systemHealth

  return {
    ...DEFAULT_STATS,
    totalApplications: toNumber(stats?.totalApplications ?? stats?.total_applications),
    pendingApplications: toNumber(stats?.pendingApplications ?? stats?.pending_applications),
    approvedApplications: toNumber(stats?.approvedApplications ?? stats?.approved_applications),
    rejectedApplications: toNumber(stats?.rejectedApplications ?? stats?.rejected_applications),
    totalPrograms: toNumber(stats?.totalPrograms ?? stats?.total_programs),
    activeIntakes: toNumber(stats?.activeIntakes ?? stats?.active_intakes),
    totalStudents: toNumber(stats?.totalStudents ?? stats?.total_students),
    todayApplications: toNumber(stats?.todayApplications ?? stats?.today_applications),
    weekApplications: toNumber(stats?.weekApplications ?? stats?.week_applications),
    monthApplications: toNumber(stats?.monthApplications ?? stats?.month_applications),
    avgProcessingTime: toNumber(stats?.avgProcessingTime ?? stats?.avg_processing_time),
    avgProcessingTimeHours: toNumber(stats?.avgProcessingTimeHours ?? stats?.avg_processing_time_hours),
    medianProcessingTimeHours: toNumber(stats?.medianProcessingTimeHours ?? stats?.median_processing_time_hours),
    p95ProcessingTimeHours: toNumber(stats?.p95ProcessingTimeHours ?? stats?.p95_processing_time_hours),
    decisionVelocity24h: toNumber(stats?.decisionVelocity24h ?? stats?.decision_velocity_24h),
    activeUsers: toNumber(stats?.activeUsers ?? stats?.active_users),
    activeUsersLast7d: toNumber(stats?.activeUsersLast7d ?? stats?.active_users_last_7d),
    systemHealth
  }
}

const normalizeProcessingMetrics = (
  processing: RawProcessingMetrics | undefined,
  stats: AdminDashboardStats
): AdminDashboardProcessingMetrics => {
  const averageHours = toNumber(processing?.average_hours ?? stats.avgProcessingTimeHours)
  const medianHours = toNumber(processing?.median_hours ?? stats.medianProcessingTimeHours)
  const p95Hours = toNumber(processing?.p95_hours ?? stats.p95ProcessingTimeHours)
  const decisionVelocity24h = toNumber(processing?.decision_velocity_24h ?? stats.decisionVelocity24h)
  const activeAdminsLast24h = toNumber(processing?.active_admins_last_24h ?? stats.activeUsers)
  const activeAdminsLast7d = toNumber(processing?.active_admins_last_7d ?? stats.activeUsersLast7d)
  const averageDaysSource = stats.avgProcessingTime || (averageHours ? Number((averageHours / 24).toFixed(1)) : 0)

  return {
    averageHours,
    averageDays: toNumber(averageDaysSource),
    medianHours,
    p95Hours,
    decisionVelocity24h,
    activeAdminsLast24h,
    activeAdminsLast7d
  }
}

const normalizeActivityType = (type: unknown): AdminDashboardActivityType => {
  if (typeof type === 'string' && VALID_ACTIVITY_TYPES.includes(type as AdminDashboardActivityType)) {
    return type as AdminDashboardActivityType
  }
  return 'application'
}

const normalizeRecentActivity = (items: unknown): AdminDashboardActivity[] => {
  if (!Array.isArray(items)) {
    return []
  }

  return items
    .map(item => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const id = 'id' in item && item.id !== undefined && item.id !== null ? String(item.id) : ''
      const message = 'message' in item && typeof item.message === 'string' ? item.message : ''
      const timestamp = 'timestamp' in item && typeof item.timestamp === 'string'
        ? item.timestamp
        : 'updatedAt' in item && typeof item.updatedAt === 'string'
          ? item.updatedAt
          : 'createdAt' in item && typeof item.createdAt === 'string'
            ? item.createdAt
            : ''

      if (!id || !message || !timestamp) {
        return null
      }

      const normalized: AdminDashboardActivity = {
        id,
        type: normalizeActivityType('type' in item ? (item as Record<string, unknown>).type : undefined),
        message,
        timestamp,
        user: 'user' in item && typeof item.user === 'string' ? item.user : undefined,
        status: 'status' in item && typeof item.status === 'string' ? item.status : undefined,
        paymentStatus: 'paymentStatus' in item && typeof item.paymentStatus === 'string'
          ? item.paymentStatus
          : 'payment_status' in item && typeof item.payment_status === 'string'
            ? item.payment_status
            : undefined,
        submittedAt: 'submittedAt' in item && typeof item.submittedAt === 'string'
          ? item.submittedAt
          : 'submitted_at' in item && typeof item.submitted_at === 'string'
            ? item.submitted_at
            : undefined,
        updatedAt: 'updatedAt' in item && typeof item.updatedAt === 'string'
          ? item.updatedAt
          : 'updated_at' in item && typeof item.updated_at === 'string'
            ? item.updated_at
            : undefined,
        createdAt: 'createdAt' in item && typeof item.createdAt === 'string'
          ? item.createdAt
          : 'created_at' in item && typeof item.created_at === 'string'
            ? item.created_at
            : undefined,
        program: 'program' in item && typeof item.program === 'string' ? item.program : undefined,
        intake: 'intake' in item && typeof item.intake === 'string' ? item.intake : undefined
      }

      return normalized
    })
    .filter((activity): activity is AdminDashboardActivity => Boolean(activity))
}

export const createEmptyDashboardResponse = (): AdminDashboardResponse => ({
  stats: { ...DEFAULT_STATS },
  statusBreakdown: {},
  periodTotals: {},
  totalsSnapshot: {},
  processingMetrics: { ...DEFAULT_PROCESSING_METRICS },
  recentActivity: [],
  generatedAt: null
})

export const adminDashboardService = {
  async getMetrics(): Promise<AdminDashboardResponse> {
    return this.getOverview()
  },
  
  async getOverview(): Promise<AdminDashboardResponse> {
    const response = await apiClient.request('/api/admin/dashboard')

    if (!response || typeof response !== 'object') {
      return createEmptyDashboardResponse()
    }

    const raw = response as RawDashboardResponse
    const rawStats = normalizeStats(raw.stats)
    const statusBreakdown = normalizeNumberRecord(
      raw.statusBreakdown ?? (raw.stats?.statusBreakdown as Record<string, unknown> | undefined)
    )
    const periodTotals = normalizeNumberRecord(
      raw.periodTotals ?? raw.applicationTrends ?? (raw.stats?.applicationTrends as Record<string, unknown> | undefined)
    )
    const totalsSnapshot = normalizeNumberRecord(
      raw.totalsSnapshot ?? (raw.stats?.totalsSnapshot as Record<string, unknown> | undefined)
    )
    const processingMetrics = normalizeProcessingMetrics(raw.processingMetrics, rawStats)
    const recentActivity = normalizeRecentActivity(raw.recentActivity)
    const generatedAt =
      toIsoString(raw.generatedAt) ??
      toIsoString(raw.generated_at) ??
      toIsoString((raw.stats as Record<string, unknown> | undefined)?.generatedAt) ??
      toIsoString((raw.stats as Record<string, unknown> | undefined)?.generated_at)

    return {
      ...createEmptyDashboardResponse(),
      stats: rawStats,
      statusBreakdown,
      periodTotals,
      totalsSnapshot,
      processingMetrics,
      recentActivity,
      generatedAt
    }
  }
}

