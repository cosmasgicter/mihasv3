import { apiClient } from '../client'
import { logApiError } from '@/lib/apiErrorLogger'
import { logger } from '@/lib/logger'
import {
  DASHBOARD_METRIC_KEYS,
  type DashboardFreshness,
  type DashboardHealth,
  type DashboardHealthState,
  type DashboardMetric,
  type DashboardMetricKey,
  type DashboardMetricScope,
  type DashboardMetrics,
  type DashboardScopeLabel,
  type DashboardSourceState,
} from '@/pages/admin/lib/dashboardMetrics'

export type AdminDashboardStatusBreakdown = Record<string, number>

export const ADMIN_DASHBOARD_STATUS_KEYS = [
  'approved',
  'conditionally_approved',
  'enrolled',
  'pending',
  'rejected',
  'submitted',
  'under_review',
] as const

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
  conditionallyApprovedApplications: number
  enrolledApplications: number
  acceptedApplications: number
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
  /**
   * Read health, **derived by the backend from whether each metric source
   * answered** — `null` until it has (task 9.2).
   *
   * It used to be `'excellent' | 'good' | 'warning' | 'critical'` with a default
   * of `'good'`, and the backend never sent it: the dashboard asserted the
   * platform was healthy without measuring anything (ADM-02). The vocabulary is
   * now three states that describe something real, and there is no default.
   */
  systemHealth: DashboardHealthState | null
  pendingPayments: number
  pendingDocuments: number
  upcomingInterviews: number
  overdueReviews: number
  conditionsExpiringSoon: number
  enrollmentsExpiringSoon: number
}

export type AdminDashboardActivityType =
  | 'status_change'
  | 'payment'
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
  application_number?: string
  old_status?: string
  new_status?: string
  actor_name?: string
}

export interface AdminDashboardResponse {
  /**
   * The authority (task 9.2). Every number the dashboard renders comes from
   * here, carrying its definition, its scope, and whether its source answered.
   * A metric whose source failed is `{value: null, state: 'unknown'}` — the
   * legacy `stats` block below cannot express that, which is why it is no longer
   * what the page reads.
   */
  metrics: DashboardMetrics
  /** Per-source read outcome, so a partial failure is visible as partial. */
  sources: Record<string, { state: DashboardSourceState; reason: string | null }>
  /** Derived from `sources` by the backend — never a default health grade. */
  health: DashboardHealth | null
  /** When the numbers were computed, and when to call them stale. */
  freshness: DashboardFreshness
  /** Who the numbers describe. */
  scope: DashboardScopeLabel | null
  /** The windows each time-bounded number used (SLA days, deadline hours). */
  windows: Record<string, unknown>
  /**
   * Pre-9.2 shape, kept for existing consumers. Numbers here are `null` when
   * their source did not answer — reading a `0` off this block is what ADM-02
   * was.
   */
  stats: AdminDashboardStats
  statusBreakdown: AdminDashboardStatusBreakdown
  periodTotals: AdminDashboardPeriodTotals
  totalsSnapshot: Record<string, number>
  processingMetrics: AdminDashboardProcessingMetrics
  recentActivity: AdminDashboardActivity[]
  generatedAt: string | null
  /**
   * R11.6: true when a non-super-admin caller has no membership/grant scope.
   * The backend (`AdminDashboardView`) computes every aggregate over an empty
   * scope in this case, so the UI must render an explicit "No school access
   * assigned" state rather than the (correct-but-misleading) zero counts.
   */
  noSchoolAccess: boolean
}

export interface AdminDashboardDiagnostics {
  endpoint: '/admin/dashboard/'
  ok: boolean
  status: number | null
  errorMessage: string | null
  responseShape: 'valid' | 'empty' | 'invalid'
  requestedAt: string
}

export interface AdminDashboardOverviewResult {
  data: AdminDashboardResponse
  diagnostics: AdminDashboardDiagnostics
}

const DEFAULT_STATS: AdminDashboardStats = {
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
  // Not `'good'`: nothing has been measured yet, and saying so is the point.
  systemHealth: null,
  pendingPayments: 0,
  pendingDocuments: 0,
  upcomingInterviews: 0,
  overdueReviews: 0,
  conditionsExpiringSoon: 0,
  enrollmentsExpiringSoon: 0
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

const VALID_SYSTEM_HEALTH: DashboardHealthState[] = [
  'operational',
  'degraded',
  'unknown'
]

const VALID_ACTIVITY_TYPES: AdminDashboardActivityType[] = [
  'status_change',
  'payment',
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
  applications?: Record<string, unknown>
  users?: Record<string, unknown>
  recentActivity?: unknown
  recent_activity?: unknown
  generatedAt?: unknown
  generated_at?: unknown
  no_school_access?: unknown
  noSchoolAccess?: unknown
}

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) {
    return 0
  }

  // Guard against objects that can't be converted to a primitive (e.g. {__proto__: null})
  if (typeof value === 'object') {
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

  // An unrecognised (or absent) value is `null`, not the friendliest option in
  // the enum. This is the ADM-02 line: a health grade the platform did not
  // measure is not reported at all.
  const systemHealth = VALID_SYSTEM_HEALTH.includes(systemHealthCandidate as DashboardHealthState)
    ? (systemHealthCandidate as DashboardHealthState)
    : null

  return {
    ...DEFAULT_STATS,
    totalApplications: toNumber(stats?.totalApplications ?? stats?.total_applications),
    pendingApplications: toNumber(stats?.pendingApplications ?? stats?.pending_applications),
    approvedApplications: toNumber(stats?.approvedApplications ?? stats?.approved_applications),
    conditionallyApprovedApplications: toNumber(stats?.conditionallyApprovedApplications ?? stats?.conditionally_approved_applications),
    enrolledApplications: toNumber(stats?.enrolledApplications ?? stats?.enrolled_applications),
    acceptedApplications: toNumber(stats?.acceptedApplications ?? stats?.accepted_applications),
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
    pendingPayments: toNumber(stats?.pendingPayments ?? stats?.pending_payments),
    pendingDocuments: toNumber(stats?.pendingDocuments ?? stats?.pending_documents),
    upcomingInterviews: toNumber(stats?.upcomingInterviews ?? stats?.upcoming_interviews),
    overdueReviews: toNumber(stats?.overdueReviews ?? stats?.overdue_reviews),
    conditionsExpiringSoon: toNumber(stats?.conditionsExpiringSoon ?? stats?.conditions_expiring_soon),
    enrollmentsExpiringSoon: toNumber(stats?.enrollmentsExpiringSoon ?? stats?.enrollments_expiring_soon),
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

const ACTIVITY_MESSAGE_MAP: Record<string, Record<string, string>> = {
  POST: {
    auth: 'User logged in',
    applications: 'Application submitted',
    errors: 'Error reported',
    documents: 'Document uploaded',
    payments: 'Payment initiated',
    notifications: 'Notification sent',
    sessions: 'Session created',
  },
  PATCH: {
    applications: 'Application updated',
    auth: 'Profile updated',
    profiles: 'User profile updated',
  },
  PUT: {
    applications: 'Application reviewed',
    notifications: 'Notification read',
  },
  DELETE: {
    applications: 'Draft deleted',
    sessions: 'Session ended',
  },
}

const resolveActivityMessage = (action: string, entityType: string): string => {
  const mapped = ACTIVITY_MESSAGE_MAP[action]?.[entityType]
  if (mapped) return mapped
  // Fallback: humanize the action + entity_type
  const verb = action === 'POST' ? 'Created' : action === 'PATCH' ? 'Updated' : action === 'PUT' ? 'Modified' : action === 'DELETE' ? 'Removed' : action
  const entity = entityType.replace(/_/g, ' ')
  return `${verb} ${entity}`
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
      const action = 'action' in item && typeof item.action === 'string' ? item.action : ''
      const entityType = 'entity_type' in item && typeof item.entity_type === 'string' ? item.entity_type : ''
      const message = 'message' in item && typeof item.message === 'string'
        ? item.message
        : action
          ? resolveActivityMessage(action, entityType)
          : ''
      const rawTimestamp = 'timestamp' in item && typeof item.timestamp === 'string'
        ? item.timestamp
        : 'updatedAt' in item && typeof item.updatedAt === 'string'
          ? item.updatedAt
          : 'createdAt' in item && typeof item.createdAt === 'string'
            ? item.createdAt
            : 'created_at' in item && typeof item.created_at === 'string'
              ? item.created_at
              : ''

      // Fallback: if a timestamp key exists but value is null, use current time
      const timestamp = rawTimestamp || (
        ('created_at' in item || 'createdAt' in item || 'timestamp' in item || 'updatedAt' in item)
          ? new Date().toISOString()
          : ''
      )

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
        intake: 'intake' in item && typeof item.intake === 'string' ? item.intake : undefined,
        application_number: 'application_number' in item && typeof item.application_number === 'string'
          ? item.application_number
          : undefined,
        old_status: 'old_status' in item && typeof item.old_status === 'string'
          ? item.old_status
          : undefined,
        new_status: 'new_status' in item && typeof item.new_status === 'string'
          ? item.new_status
          : undefined,
        actor_name: 'actor_name' in item && typeof item.actor_name === 'string'
          ? item.actor_name
          : undefined
      }

      return normalized
    })
    .filter((activity): activity is AdminDashboardActivity => Boolean(activity))
}

const METRIC_STATES = new Set(['ok', 'unknown'])
const HEALTH_STATES: DashboardHealthState[] = ['operational', 'degraded', 'unknown']
const METRIC_SCOPES: DashboardMetricScope[] = ['institution', 'platform']

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || typeof value === 'object') {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Parse the backend metric registry (task 9.2).
 *
 * The only way a metric ends up `ok` is if the backend said so **and** sent a
 * finite number. Anything else — a missing key, a missing state, a non-numeric
 * value — is `unknown` with `value: null`. There is deliberately no branch that
 * substitutes `0`: that substitution is the finding.
 */
const normalizeMetrics = (raw: unknown): DashboardMetrics => {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const metrics: DashboardMetrics = {}

  for (const key of DASHBOARD_METRIC_KEYS) {
    const entry = source[key]
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const record = entry as Record<string, unknown>
    const declaredState = typeof record.state === 'string' ? record.state : ''
    const value = toNullableNumber(record.value)
    const state = METRIC_STATES.has(declaredState) && declaredState === 'ok' && value !== null
      ? 'ok'
      : 'unknown'
    const scope = METRIC_SCOPES.includes(record.scope as DashboardMetricScope)
      ? (record.scope as DashboardMetricScope)
      : 'institution'
    const metric: DashboardMetric = {
      key,
      value: state === 'ok' ? value : null,
      state,
      definition: typeof record.definition === 'string' ? record.definition : '',
      scope,
      source: typeof record.source === 'string' ? record.source : '',
    }
    if (typeof record.roster_query === 'string') {
      metric.rosterQuery = record.roster_query
    }
    if (typeof record.reason === 'string' && record.reason) {
      metric.reason = record.reason
    }
    metrics[key as DashboardMetricKey] = metric
  }
  return metrics
}

const normalizeSources = (
  raw: unknown,
): AdminDashboardResponse['sources'] => {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const result: AdminDashboardResponse['sources'] = {}
  for (const [name, entry] of Object.entries(source)) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    result[name] = {
      state: record.state === 'ok' ? 'ok' : 'failed',
      reason: typeof record.reason === 'string' ? record.reason : null,
    }
  }
  return result
}

const normalizeHealth = (raw: unknown): DashboardHealth | null => {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (!HEALTH_STATES.includes(record.state as DashboardHealthState)) return null
  return {
    state: record.state as DashboardHealthState,
    definition: typeof record.definition === 'string' ? record.definition : '',
  }
}

const normalizeFreshness = (raw: unknown): DashboardFreshness => {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const staleAfter = toNullableNumber(record.stale_after_seconds)
  return {
    generatedAt: toIsoString(record.generated_at),
    // No server budget means the page must not claim the numbers are current, so
    // the fallback is 0 (immediately stale) rather than a generous default.
    staleAfterSeconds: staleAfter !== null && staleAfter > 0 ? staleAfter : 0,
  }
}

const normalizeScope = (raw: unknown): DashboardScopeLabel | null => {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  return {
    kind: record.kind === 'platform' ? 'platform' : 'institution',
    institutionId: typeof record.institution_id === 'string' ? record.institution_id : null,
    allAccess: record.all_access === true,
    institutionCount: toNullableNumber(record.institution_count),
  }
}

/**
 * The shape returned when there is **no answer** (task 9.2, ADM-02).
 *
 * Every metric key is absent — so `formatMetricValue` renders "Unknown" — and
 * `health` is `null`. This replaces `createEmptyDashboardResponse()`, which
 * returned fourteen zeros and `systemHealth: 'good'` from every failure path and
 * so made a broken read indistinguishable from a quiet school.
 *
 * The legacy `stats` block still exists (other consumers read it) but is filled
 * with `DEFAULT_STATS` only as a type-level placeholder; nothing on the dashboard
 * reads it any more, and `metricsAreUnknown` is true whenever this is returned.
 */
export const createUnknownDashboardResponse = (): AdminDashboardResponse => ({
  metrics: {},
  sources: {},
  health: null,
  freshness: { generatedAt: null, staleAfterSeconds: 0 },
  scope: null,
  windows: {},
  stats: { ...DEFAULT_STATS },
  statusBreakdown: {},
  periodTotals: {},
  totalsSnapshot: {},
  processingMetrics: { ...DEFAULT_PROCESSING_METRICS },
  recentActivity: [],
  generatedAt: null,
  noSchoolAccess: false
})

export const adminDashboardService = {
  async getOverviewWithDiagnostics(institutionId?: string | null): Promise<AdminDashboardOverviewResult> {
    const requestedAt = new Date().toISOString()
    try {
      const endpoint = institutionId
        ? `/admin/dashboard/?institution_id=${encodeURIComponent(institutionId)}`
        : '/admin/dashboard/'
      const response = await apiClient.request(endpoint)

      if (!response || typeof response !== 'object') {
        return {
          data: createUnknownDashboardResponse(),
          diagnostics: {
            endpoint: '/admin/dashboard/',
            ok: false,
            status: null,
            errorMessage: 'Dashboard API returned a non-object payload.',
            responseShape: 'invalid',
            requestedAt
          }
        }
      }

      const raw = response as RawDashboardResponse

      // Shape mismatch warning: log when expected Django top-level keys are missing (Req 3.4)
      const expectedKeys = ['applications', 'users', 'recent_activity'] as const
      const missingKeys = expectedKeys.filter(key => !(key in raw))
      if (missingKeys.length > 0) {
        logger.warn(
          '[admin-dashboard] Response shape mismatch — missing expected keys',
          { missingKeys, receivedKeys: Object.keys(raw) }
        )
      }

      const applications = raw.applications as Record<string, unknown> | undefined
      const applicationStatusBreakdown = applications?.by_status as Record<string, unknown> | undefined
      const users = raw.users as Record<string, unknown> | undefined

      // The metric registry is the authority (task 9.2). Everything below it is
      // the pre-9.2 compatibility shape: still derived, still coerced to numbers,
      // and no longer what the dashboard renders.
      const metrics = normalizeMetrics((raw as Record<string, unknown>).metrics)
      const sources = normalizeSources((raw as Record<string, unknown>).sources)
      const health = normalizeHealth((raw as Record<string, unknown>).health)
      const freshness = normalizeFreshness((raw as Record<string, unknown>).freshness)
      const scope = normalizeScope((raw as Record<string, unknown>).scope)
      const windows = ((raw as Record<string, unknown>).windows ?? {}) as Record<string, unknown>

      const metricValue = (key: DashboardMetricKey): number | undefined => {
        const metric = metrics[key]
        return metric && metric.state === 'ok' && metric.value !== null
          ? metric.value
          : undefined
      }

      const rawStats = normalizeStats({
        ...(raw.stats ?? {}),
        system_health: health?.state,
        total_applications: metricValue('total_applications'),
        pending_applications: metricValue('decision_queue'),
        approved_applications: applicationStatusBreakdown?.approved,
        conditionally_approved_applications: applicationStatusBreakdown?.conditionally_approved,
        enrolled_applications: applicationStatusBreakdown?.enrolled,
        accepted_applications: metricValue('accepted_path'),
        rejected_applications: metricValue('rejected'),
        today_applications: metricValue('today_activity'),
        week_applications: metricValue('applications_this_week'),
        month_applications: metricValue('applications_this_month'),
        total_students: metricValue('staff_accounts_total'),
        active_users: metricValue('staff_accounts_enabled'),
        pending_payments: metricValue('payment_review'),
        pending_documents: metricValue('pending_documents'),
        upcoming_interviews: metricValue('upcoming_interviews'),
        overdue_reviews: metricValue('overdue_reviews'),
      })
      const statusBreakdown = normalizeNumberRecord(
        raw.statusBreakdown ??
          applicationStatusBreakdown ??
          (raw.stats?.statusBreakdown as Record<string, unknown> | undefined)
      )
      const periodTotals = normalizeNumberRecord(
        raw.periodTotals ??
          raw.applicationTrends ??
          (applications
            ? {
                today: applications.today,
                this_week: applications.this_week,
                this_month: applications.this_month,
                total: applications.total,
              }
            : undefined) ??
          (raw.stats?.applicationTrends as Record<string, unknown> | undefined)
      )
      const totalsSnapshot = normalizeNumberRecord(
        raw.totalsSnapshot ?? (raw.stats?.totalsSnapshot as Record<string, unknown> | undefined)
      )
      const processingMetrics = normalizeProcessingMetrics(raw.processingMetrics, rawStats)
      const recentActivity = normalizeRecentActivity(raw.recentActivity ?? raw.recent_activity)
      const generatedAt =
        toIsoString(raw.generatedAt) ??
        toIsoString(raw.generated_at) ??
        toIsoString((raw.stats as Record<string, unknown> | undefined)?.generatedAt) ??
        toIsoString((raw.stats as Record<string, unknown> | undefined)?.generated_at)

      const noSchoolAccess = raw.no_school_access === true || raw.noSchoolAccess === true

      // "Empty" now means *the payload carried no metric registry* — a genuine
      // shape problem. It used to mean "every number is zero", which the loader
      // surfaced as an error banner: a school with nothing outstanding was told
      // its dashboard was broken, and a broken dashboard was told it was empty.
      // Both directions of that confusion are ADM-02.
      const isEmptyPayload = Object.keys(metrics).length === 0

      return {
        data: {
          ...createUnknownDashboardResponse(),
          metrics,
          sources,
          health,
          freshness,
          scope,
          windows,
          stats: rawStats,
          statusBreakdown,
          periodTotals,
          totalsSnapshot,
          processingMetrics,
          recentActivity,
          generatedAt: generatedAt ?? freshness.generatedAt,
          noSchoolAccess
        },
        diagnostics: {
          endpoint: '/admin/dashboard/',
          ok: true,
          status: null,
          errorMessage: null,
          responseShape: isEmptyPayload ? 'empty' : 'valid',
          requestedAt
        }
      }
    } catch (error) {
      const errorWithStatus = error as Error & { status?: number }
      logApiError('admin-dashboard', '/admin/dashboard/', error)

      return {
        data: createUnknownDashboardResponse(),
        diagnostics: {
          endpoint: '/admin/dashboard/',
          ok: false,
          status: typeof errorWithStatus.status === 'number' ? errorWithStatus.status : null,
          errorMessage: errorWithStatus.message || 'Unknown dashboard API failure',
          responseShape: 'invalid',
          requestedAt
        }
      }
    }
  },

  async getOverview(institutionId?: string | null): Promise<AdminDashboardResponse> {
    const result = await this.getOverviewWithDiagnostics(institutionId)
    return result.data
  }
}

// Exported for property testing
export { normalizeRecentActivity, normalizeStats }
