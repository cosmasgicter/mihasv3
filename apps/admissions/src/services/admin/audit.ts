import { apiClient, buildQueryString } from '@/services/client'

export type AuditCategory =
  | 'Authentication'
  | 'Data'
  | 'Access'
  | 'System'
  | 'Communication'
  | 'Analytics'
  | 'General'

export interface AuditLogEntry {
  id: string
  actorId: string | null
  actorEmail: string | null
  actorName?: string | null
  actorRoles?: string[]
  action: string
  category: AuditCategory
  entityType: string
  entityId: string
  changes: Record<string, any> | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  targetTable?: string
  targetId?: string
  targetLabel?: string
  requestId?: string
  requestIp?: string
  metadata?: Record<string, any>
}

export interface AuditLogFilters {
  action?: string
  actorEmail?: string
  userId?: string
  targetTable?: string
  category?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export interface AuditBreakdownItem {
  label: string
  count: number
}

export interface AuditLogSummary {
  uniqueActors: number
  categoryBreakdown: Record<string, number>
  entityBreakdown: AuditBreakdownItem[]
  actionBreakdown: AuditBreakdownItem[]
}

export interface AuditLogResponse {
  entries: AuditLogEntry[]
  page: number
  pageSize: number
  totalPages: number
  totalCount: number
  summary: AuditLogSummary
}

interface BackendAuditEntry {
  id: string
  actor_id: string | null
  actor_email?: string | null
  actor_name?: string | null
  actor_role?: string | null
  action: string
  category?: string | null
  entity_type: string
  entity_id: string
  changes: Record<string, any> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

interface BackendAuditBreakdownItem {
  label?: string | null
  count?: string | number | null
}

interface BackendAuditResponse {
  entries?: BackendAuditEntry[]
  page?: number
  pageSize?: number
  totalPages?: number
  totalCount?: number
  summary?: {
    uniqueActors?: number
    categoryBreakdown?: BackendAuditBreakdownItem[]
    entityBreakdown?: BackendAuditBreakdownItem[]
    actionBreakdown?: BackendAuditBreakdownItem[]
  }
}

const AUDIT_CATEGORY_SET = new Set<AuditCategory>([
  'Authentication',
  'Data',
  'Access',
  'System',
  'Communication',
  'Analytics',
  'General',
])

const EMPTY_SUMMARY: AuditLogSummary = {
  uniqueActors: 0,
  categoryBreakdown: {},
  entityBreakdown: [],
  actionBreakdown: [],
}

const parseCount = (value: string | number | null | undefined) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  const parsed = Number.parseInt(String(value ?? '0'), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeAuditCategory = (value?: string | null): AuditCategory => {
  if (value && AUDIT_CATEGORY_SET.has(value as AuditCategory)) {
    return value as AuditCategory
  }

  return 'General'
}

export function getAuditCategory(action: string): AuditCategory {
  const normalized = action.trim().toLowerCase()

  if (
    /(login|signin|logout|signout|register|signup|auth|password|session|refresh)/.test(normalized)
  ) {
    return 'Authentication'
  }

  if (/(create|insert|add|update|modify|edit|delete|remove|archive|restore)/.test(normalized)) {
    return 'Data'
  }

  if (/(view|read|get|download|export)/.test(normalized)) {
    return 'Access'
  }

  if (/(settings|config|permission|role|admin|security|maintenance)/.test(normalized)) {
    return 'System'
  }

  if (/(email|notification|message|sms|communication)/.test(normalized)) {
    return 'Communication'
  }

  if (/(analytics|report|dashboard|metric)/.test(normalized)) {
    return 'Analytics'
  }

  return 'General'
}

export function getAuditCategoryLabel(category: AuditCategory): string {
  return category
}

function mapBreakdownItems(items?: BackendAuditBreakdownItem[]): AuditBreakdownItem[] {
  if (!Array.isArray(items)) {
    return []
  }

  return items
    .filter((item): item is BackendAuditBreakdownItem & { label: string } => Boolean(item?.label))
    .map((item) => ({
      label: item.label!,
      count: parseCount(item.count),
    }))
}

function mapSummary(summary?: BackendAuditResponse['summary']): AuditLogSummary {
  const categoryBreakdown = mapBreakdownItems(summary?.categoryBreakdown).reduce<Record<string, number>>(
    (accumulator, item) => {
      accumulator[item.label] = item.count
      return accumulator
    },
    {}
  )

  return {
    uniqueActors: summary?.uniqueActors ?? 0,
    categoryBreakdown,
    entityBreakdown: mapBreakdownItems(summary?.entityBreakdown),
    actionBreakdown: mapBreakdownItems(summary?.actionBreakdown),
  }
}

function mapAuditEntry(log: BackendAuditEntry): AuditLogEntry {
  const actorRoles = log.actor_role ? [log.actor_role] : []
  const category = log.category ? normalizeAuditCategory(log.category) : getAuditCategory(log.action)

  return {
    id: log.id,
    actorId: log.actor_id,
    actorEmail: log.actor_email ?? null,
    actorName: log.actor_name ?? null,
    actorRoles,
    action: log.action,
    category,
    entityType: log.entity_type,
    entityId: log.entity_id,
    changes: log.changes,
    ipAddress: log.ip_address,
    userAgent: log.user_agent,
    createdAt: log.created_at,
    targetTable: log.entity_type,
    targetId: log.entity_id,
    requestIp: log.ip_address ?? undefined,
    metadata: log.changes ?? undefined,
  }
}

class AdminAuditService {
  async list(filters: AuditLogFilters = {}): Promise<AuditLogResponse> {
    const page = filters.page || 1
    const pageSize = filters.pageSize || 50

    const params: Record<string, string> = {
      page: String(page),
      pageSize: String(pageSize),
    }

    if (filters.action) params.filter_action = filters.action
    if (filters.actorEmail) params.filter_actor_email = filters.actorEmail
    if (filters.userId) params.filter_user_id = filters.userId
    if (filters.targetTable) params.filter_entity_type = filters.targetTable
    if (filters.category) params.filter_category = filters.category
    if (filters.from) params.filter_from = filters.from
    if (filters.to) params.filter_to = filters.to

    try {
      const result = await apiClient.request<BackendAuditResponse>(
        `/admin/audit-logs/${buildQueryString(params)}`
      )

      if (!result) {
        return { entries: [], page, pageSize, totalPages: 1, totalCount: 0, summary: EMPTY_SUMMARY }
      }

      const totalCount = result.totalCount || 0
      const totalPages = result.totalPages || Math.ceil(totalCount / pageSize) || 1

      return {
        entries: (result.entries || []).map(mapAuditEntry),
        page: result.page || page,
        pageSize: result.pageSize || pageSize,
        totalPages,
        totalCount,
        summary: mapSummary(result.summary),
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error)
      throw error
    }
  }
}

export const adminAuditService = new AdminAuditService()
