import { apiClient, buildQueryString } from '@/services/client'

export interface AuditLogEntry {
  id: string
  actorId: string | null
  actorEmail: string | null
  actorRoles?: string[]
  action: string
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
  targetTable?: string
  category?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export interface AuditLogResponse {
  entries: AuditLogEntry[]
  page: number
  pageSize: number
  totalPages: number
  totalCount: number
}

class AdminAuditService {
  async list(filters: AuditLogFilters = {}): Promise<AuditLogResponse> {
    const page = filters.page || 1
    const pageSize = filters.pageSize || 50

    const params: Record<string, string> = {
      action: 'audit-log',
      page: String(page),
      pageSize: String(pageSize),
    }

    if (filters.action) params.filter_action = filters.action
    if (filters.targetTable) params.filter_entity_type = filters.targetTable
    if (filters.from) params.filter_from = filters.from
    if (filters.to) params.filter_to = filters.to

    try {
      const result = await apiClient.request<{
        entries: any[]
        page: number
        pageSize: number
        totalPages: number
        totalCount: number
      }>(`/admin${buildQueryString(params)}`)

      if (!result) {
        return { entries: [], page, pageSize, totalPages: 1, totalCount: 0 }
      }

      const totalCount = result.totalCount || 0
      const totalPages = result.totalPages || Math.ceil(totalCount / pageSize) || 1

      return {
        entries: (result.entries || []).map((log: any) => ({
          id: log.id,
          actorId: log.actor_id,
          actorEmail: log.actor_email ?? log.actor?.email ?? null,
          actorRoles: log.actor_roles ?? (log.actor?.role ? [log.actor.role] : []),
          action: log.action,
          entityType: log.entity_type,
          entityId: log.entity_id,
          changes: log.changes,
          ipAddress: log.ip_address,
          userAgent: log.user_agent,
          createdAt: log.created_at,
          targetTable: log.entity_type,
          targetId: log.entity_id,
          requestIp: log.ip_address,
          metadata: log.changes
        })),
        page,
        pageSize,
        totalPages,
        totalCount
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error)
      throw error
    }
  }
}

export const adminAuditService = new AdminAuditService()
