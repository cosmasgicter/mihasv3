import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload
} from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase'

export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'

export type ApplicationPaymentStatus =
  | 'pending_review'
  | 'verified'
  | 'rejected'
  | null

export interface AdminApplicationRow {
  id: string
  application_number: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  program: string | null
  intake: string | null
  institution: string | null
  status: ApplicationStatus | null
  payment_status: ApplicationPaymentStatus
  payment_verified_at?: string | null
  payment_verified_by?: string | null
  payment_verified_by_name?: string | null
  payment_verified_by_email?: string | null
  last_payment_audit_id?: number | null
  last_payment_audit_at?: string | null
  last_payment_audit_by_name?: string | null
  last_payment_audit_by_email?: string | null
  last_payment_audit_notes?: string | null
  last_payment_reference?: string | null
  application_fee?: number | null
  amount?: number | null
  paid_amount?: number | null
  submitted_at: string | null
  created_at: string | null
  updated_at: string | null
  result_slip_url?: string | null
  extra_kyc_url?: string | null
  pop_url?: string | null
  grades_summary?: string | null
  total_subjects?: number | null
  average_grade?: number | null
  days_since_submission?: number | null
  user_id?: string | null
  nrc_number?: string | null
  passport_number?: string | null
}

export interface AdminApplicationFilters {
  status?: string
  search?: string
  sortBy?: 'date' | 'name' | 'status'
  sortOrder?: 'asc' | 'desc'
  program?: string
  institution?: string
  paymentStatus?: string
  startDate?: string
  endDate?: string
  mine?: boolean
  page?: number
  pageSize?: number
}

export interface AdminMetricsDelta {
  totalApplications: number
  pendingApplications: number
  approvedApplications: number
  rejectedApplications: number
  todayApplications: number
  weekApplications: number
  monthApplications: number
}

export interface AdminApplicationActivity {
  id: string
  type: 'application' | 'approval' | 'rejection' | 'system'
  message: string
  timestamp: string
  user?: string
}

export interface AdminApplicationChange {
  type: 'insert' | 'update' | 'delete'
  targetId: string
  newRow: AdminApplicationRow | null
  oldRow: AdminApplicationRow | null
  metricsDelta: AdminMetricsDelta
  activity?: AdminApplicationActivity
}

export interface AdminRealtimeMetricsOptions {
  channelName?: string
  onChange?: (change: AdminApplicationChange) => void
  queryKeys?: {
    applicationsListBase?: QueryKey
    applicationsStats?: QueryKey
    applicationsRecentActivity?: QueryKey
    applicationsWithCounts?: QueryKey
  }
  currentUserId?: string | null
}

const DEFAULT_CHANNEL = 'admin-applications-metrics'
const LIST_QUERY_PREFIX = ['applications', 'list'] as const
const DEFAULT_STATS_QUERY_KEY: QueryKey = ['applications', 'stats']
const DEFAULT_RECENT_ACTIVITY_KEY: QueryKey = ['applications', 'recent-activity']
const DEFAULT_WITH_COUNTS_KEY: QueryKey = ['applications-with-counts']

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const ONE_WEEK_MS = 7 * ONE_DAY_MS
const ONE_MONTH_MS = 30 * ONE_DAY_MS

const normalizeText = (value?: string | null) => value?.toLowerCase().trim() ?? ''

const isSameDay = (value?: string | null) => {
  if (!value) return false
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return false
  const now = new Date()
  return target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate()
}

const isWithinDays = (value: string | null, windowMs: number) => {
  if (!value) return false
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return false
  return (Date.now() - target.getTime()) <= windowMs
}

const sanitizeSearch = (term?: string) => normalizeText(term).replace(/[%_]/g, '')

const parseDate = (value?: string | null) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const matchesDateRange = (createdAt: string | null, start?: string, end?: string) => {
  if (!start && !end) return true
  const createdDate = parseDate(createdAt)
  if (!createdDate) return false

  if (start) {
    const startDate = parseDate(start)
    if (startDate && createdDate < startDate) {
      return false
    }
  }

  if (end) {
    const endDate = parseDate(`${end}T23:59:59`)
    if (endDate && createdDate > endDate) {
      return false
    }
  }

  return true
}

const matchesSearch = (row: AdminApplicationRow, term?: string) => {
  const normalized = sanitizeSearch(term)
  if (!normalized) return true

  const haystacks = [
    row.application_number,
    row.full_name,
    row.email,
    row.phone,
    row.nrc_number,
    row.passport_number
  ].map(normalizeText)

  return haystacks.some(h => h.includes(normalized))
}

export const doesApplicationMatchFilters = (
  row: AdminApplicationRow,
  filters?: AdminApplicationFilters,
  currentUserId?: string | null
) => {
  if (!filters) {
    return true
  }

  if (filters.status && filters.status !== 'all' && row.status !== filters.status) {
    return false
  }

  if (filters.program && filters.program !== 'all' && row.program !== filters.program) {
    return false
  }

  if (filters.institution && filters.institution !== 'all' && row.institution !== filters.institution) {
    return false
  }

  if (filters.paymentStatus && filters.paymentStatus !== 'all' && row.payment_status !== filters.paymentStatus) {
    return false
  }

  if (filters.mine && currentUserId && row.user_id !== currentUserId) {
    return false
  }

  if (!matchesDateRange(row.created_at, filters.startDate, filters.endDate)) {
    return false
  }

  return matchesSearch(row, filters.search)
}

const mapRowToActivity = (row: AdminApplicationRow | null): AdminApplicationActivity | undefined => {
  if (!row) return undefined

  const type: AdminApplicationActivity['type'] = row.status === 'approved'
    ? 'approval'
    : row.status === 'rejected'
      ? 'rejection'
      : 'application'

  const timestamp = row.updated_at || row.created_at
  if (!timestamp) {
    return undefined
  }

  return {
    id: row.id,
    type,
    message: `${row.full_name ?? 'Application'} - ${row.status ?? 'updated'}`,
    timestamp,
    user: row.full_name ?? undefined
  }
}

const mapRowToSummary = (row: AdminApplicationRow) => ({
  id: row.id,
  application_number: row.application_number ?? '',
  full_name: row.full_name ?? '',
  email: row.email ?? '',
  phone: row.phone ?? '',
  program: row.program ?? '',
  intake: row.intake ?? '',
  institution: row.institution ?? '',
  status: row.status ?? 'draft',
  payment_status: row.payment_status ?? 'pending_review',
  payment_verified_at: row.payment_verified_at ?? null,
  payment_verified_by: row.payment_verified_by ?? null,
  payment_verified_by_name: row.payment_verified_by_name ?? null,
  payment_verified_by_email: row.payment_verified_by_email ?? null,
  last_payment_audit_id: row.last_payment_audit_id ?? null,
  last_payment_audit_at: row.last_payment_audit_at ?? null,
  last_payment_audit_by_name: row.last_payment_audit_by_name ?? null,
  last_payment_audit_by_email: row.last_payment_audit_by_email ?? null,
  last_payment_audit_notes: row.last_payment_audit_notes ?? null,
  last_payment_reference: row.last_payment_reference ?? null,
  application_fee: row.application_fee ?? 0,
  paid_amount: (row.paid_amount ?? row.amount ?? 0) ?? 0,
  submitted_at: row.submitted_at ?? row.created_at ?? '',
  created_at: row.created_at ?? row.submitted_at ?? '',
  result_slip_url: row.result_slip_url ?? '',
  extra_kyc_url: row.extra_kyc_url ?? '',
  pop_url: row.pop_url ?? '',
  grades_summary: row.grades_summary ?? '',
  total_subjects: row.total_subjects ?? 0,
  average_grade: row.average_grade ?? null,
  days_since_submission: row.days_since_submission ?? null
})

const deriveMetricsDelta = (
  payload: RealtimePostgresChangesPayload<AdminApplicationRow>
): AdminMetricsDelta => {
  const { eventType, new: newRow, old: oldRow } = payload

  const base: AdminMetricsDelta = {
    totalApplications: 0,
    pendingApplications: 0,
    approvedApplications: 0,
    rejectedApplications: 0,
    todayApplications: 0,
    weekApplications: 0,
    monthApplications: 0
  }

  if (eventType === 'INSERT' && newRow) {
    base.totalApplications = 1
    if (newRow.status === 'submitted') {
      base.pendingApplications = 1
    } else if (newRow.status === 'approved') {
      base.approvedApplications = 1
    } else if (newRow.status === 'rejected') {
      base.rejectedApplications = 1
    }

    if (isSameDay(newRow.created_at ?? newRow.submitted_at ?? undefined)) {
      base.todayApplications = 1
    }
    if (isWithinDays(newRow.created_at ?? newRow.submitted_at, ONE_WEEK_MS)) {
      base.weekApplications = 1
    }
    if (isWithinDays(newRow.created_at ?? newRow.submitted_at, ONE_MONTH_MS)) {
      base.monthApplications = 1
    }
  }

  if (eventType === 'DELETE' && oldRow) {
    base.totalApplications = -1
    if (oldRow.status === 'submitted') {
      base.pendingApplications = -1
    } else if (oldRow.status === 'approved') {
      base.approvedApplications = -1
    } else if (oldRow.status === 'rejected') {
      base.rejectedApplications = -1
    }

    if (isSameDay(oldRow.created_at ?? oldRow.submitted_at ?? undefined)) {
      base.todayApplications = -1
    }
    if (isWithinDays(oldRow.created_at ?? oldRow.submitted_at, ONE_WEEK_MS)) {
      base.weekApplications = -1
    }
    if (isWithinDays(oldRow.created_at ?? oldRow.submitted_at, ONE_MONTH_MS)) {
      base.monthApplications = -1
    }
  }

  if (eventType === 'UPDATE' && newRow && oldRow) {
    if (newRow.status !== oldRow.status) {
      if (oldRow.status === 'submitted') base.pendingApplications -= 1
      if (oldRow.status === 'approved') base.approvedApplications -= 1
      if (oldRow.status === 'rejected') base.rejectedApplications -= 1
      if (newRow.status === 'submitted') base.pendingApplications += 1
      if (newRow.status === 'approved') base.approvedApplications += 1
      if (newRow.status === 'rejected') base.rejectedApplications += 1
    }
  }

  return base
}

const addOrUpdateApplication = (
  list: any[],
  summary: ReturnType<typeof mapRowToSummary>,
  pageSize?: number
) => {
  const filtered = list.filter(item => item.id !== summary.id)
  const updated = [summary, ...filtered]
  if (pageSize && updated.length > pageSize) {
    return updated.slice(0, pageSize)
  }
  return updated
}

const updateExistingApplication = (list: any[], summary: ReturnType<typeof mapRowToSummary>) => {
  return list.map(item => item.id === summary.id ? { ...item, ...summary } : item)
}

const removeApplication = (list: any[], id: string) => list.filter(item => item.id !== id)

const isListQuery = (queryKey: QueryKey) => Array.isArray(queryKey) && queryKey.length >= 2 && queryKey[0] === LIST_QUERY_PREFIX[0] && queryKey[1] === LIST_QUERY_PREFIX[1]

export function useAdminRealtimeMetrics(options: AdminRealtimeMetricsOptions = {}) {
  const queryClient = useQueryClient()
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabase = useMemo(() => getSupabaseClient(), [])

  const statsQueryKey = options.queryKeys?.applicationsStats ?? DEFAULT_STATS_QUERY_KEY
  const recentActivityKey = options.queryKeys?.applicationsRecentActivity ?? DEFAULT_RECENT_ACTIVITY_KEY
  const withCountsKey = options.queryKeys?.applicationsWithCounts ?? DEFAULT_WITH_COUNTS_KEY

  const updateStatsCache = useCallback((delta: AdminMetricsDelta) => {
    queryClient.setQueryData(statsQueryKey, (previous: any) => {
      if (!previous) return previous
      return {
        ...previous,
        totalApplications: Math.max((previous.totalApplications ?? 0) + delta.totalApplications, 0),
        pendingReviews: Math.max((previous.pendingReviews ?? previous.pendingApplications ?? 0) + delta.pendingApplications, 0),
        pendingApplications: Math.max((previous.pendingApplications ?? previous.pendingReviews ?? 0) + delta.pendingApplications, 0),
        approvedApplications: Math.max((previous.approvedApplications ?? 0) + delta.approvedApplications, 0),
        rejectedApplications: Math.max((previous.rejectedApplications ?? 0) + delta.rejectedApplications, 0),
        todayApplications: Math.max((previous.todayApplications ?? 0) + delta.todayApplications, 0)
      }
    })
  }, [queryClient, statsQueryKey])

  const updateRecentActivityCache = useCallback((activity?: AdminApplicationActivity) => {
    if (!activity) return
    queryClient.setQueryData(recentActivityKey, (previous: any) => {
      if (!Array.isArray(previous)) {
        return previous
      }
      const filtered = previous.filter((item: any) => item?.id !== activity.id)
      return [activity, ...filtered].slice(0, 5)
    })
  }, [queryClient, recentActivityKey])

  const updateWithCountsCache = useCallback((change: AdminApplicationChange) => {
    queryClient.setQueryData(withCountsKey, (previous: AdminApplicationRow[] | undefined) => {
      if (!Array.isArray(previous)) return previous
      if (change.type === 'delete') {
        return previous.filter(item => item.id !== change.targetId)
      }

      const row = change.newRow
      if (!row) return previous

      const summary = { ...row }
      const existingIndex = previous.findIndex(item => item.id === row.id)
      if (existingIndex === -1) {
        return [summary, ...previous]
      }
      const updated = [...previous]
      updated[existingIndex] = { ...updated[existingIndex], ...summary }
      return updated
    })
  }, [queryClient, withCountsKey])

  const updateApplicationsListCache = useCallback((change: AdminApplicationChange) => {
    const cache = queryClient.getQueryCache()
    const queries = cache.findAll({ predicate: query => isListQuery(query.queryKey) })

    queries.forEach(query => {
      const filters = Array.isArray(query.queryKey) ? query.queryKey[2] as AdminApplicationFilters | undefined : undefined
      queryClient.setQueryData(query.queryKey, (previous: any) => {
        if (!previous || typeof previous !== 'object') {
          return previous
        }

        const { applications: currentApplications = [], totalCount = 0 } = previous
        let nextApplications = currentApplications
        let nextTotalCount = totalCount
        const pageSize = (filters?.pageSize && Number(filters.pageSize)) ? Number(filters.pageSize) : undefined
        const page = filters?.page ?? 0

        const matchesNew = change.newRow && doesApplicationMatchFilters(change.newRow, filters, options.currentUserId)
        const matchesOld = change.oldRow && doesApplicationMatchFilters(change.oldRow, filters, options.currentUserId)

        if (change.type === 'insert') {
          if (matchesNew) {
            nextTotalCount = totalCount + 1
            if (page === 0 && change.newRow) {
              nextApplications = addOrUpdateApplication(currentApplications, mapRowToSummary(change.newRow), pageSize)
            }
          }
        } else if (change.type === 'update') {
          if (matchesNew && change.newRow) {
            if (page === 0) {
              const existing = currentApplications.some((item: any) => item.id === change.newRow!.id)
              nextApplications = existing
                ? updateExistingApplication(currentApplications, mapRowToSummary(change.newRow))
                : addOrUpdateApplication(currentApplications, mapRowToSummary(change.newRow), pageSize)
            } else if (matchesOld) {
              nextApplications = updateExistingApplication(currentApplications, mapRowToSummary(change.newRow))
            }
          } else if (!matchesNew && matchesOld && change.oldRow) {
            nextApplications = removeApplication(currentApplications, change.oldRow.id)
            nextTotalCount = Math.max(totalCount - 1, 0)
          }
        } else if (change.type === 'delete' && change.oldRow) {
          if (matchesOld) {
            nextApplications = removeApplication(currentApplications, change.oldRow.id)
            nextTotalCount = Math.max(totalCount - 1, 0)
          }
        }

        return {
          ...previous,
          applications: nextApplications,
          totalCount: nextTotalCount
        }
      })
    })
  }, [options.currentUserId, queryClient])

  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const channel = supabase.channel(options.channelName ?? DEFAULT_CHANNEL, {
      config: {
        broadcast: { ack: false },
        presence: { key: 'admin-dashboard' }
      }
    })

    channel
      .on('postgres_changes', {
        schema: 'public',
        table: 'applications_new',
        event: '*'
      }, (payload: RealtimePostgresChangesPayload<AdminApplicationRow>) => {
        const change: AdminApplicationChange = {
          type: payload.eventType.toLowerCase() as AdminApplicationChange['type'],
          targetId: (payload.new?.id ?? payload.old?.id) as string,
          newRow: payload.new ?? null,
          oldRow: payload.old ?? null,
          metricsDelta: deriveMetricsDelta(payload),
          activity: payload.eventType === 'INSERT' ? mapRowToActivity(payload.new ?? null) : payload.eventType === 'UPDATE' ? mapRowToActivity(payload.new ?? null) : undefined
        }

        updateStatsCache(change.metricsDelta)
        updateRecentActivityCache(change.activity)
        updateApplicationsListCache(change)
        updateWithCountsCache(change)

        options.onChange?.(change)

        setLastEventAt(Date.now())
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true)
          setError(null)
        } else if (status === 'CHANNEL_ERROR') {
          setIsConnected(false)
          setError('Realtime channel error')
        } else if (status === 'TIMED_OUT') {
          setIsConnected(false)
          setError('Realtime channel timeout')
        }
      })

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [options.channelName, options.onChange, supabase, updateApplicationsListCache, updateRecentActivityCache, updateStatsCache, updateWithCountsCache])

  return {
    isConnected,
    error,
    lastEventAt
  }
}
