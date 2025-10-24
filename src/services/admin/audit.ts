import { supabase } from '@/lib/supabase'

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
  data: AuditLogEntry[]
  page: number
  pageSize: number
  totalPages: number
  totalCount: number
}

class AdminAuditService {
  async list(filters: AuditLogFilters = {}): Promise<AuditLogResponse> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Unauthorized')

    const params = new URLSearchParams()
    if (filters.page) params.append('page', filters.page.toString())
    if (filters.pageSize) params.append('limit', filters.pageSize.toString())
    if (filters.action) params.append('action', filters.action)
    if (filters.targetTable) params.append('entity_type', filters.targetTable)
    if (filters.actorEmail) params.append('actor_id', filters.actorEmail)

    const response = await fetch(`/api/audit/logs?${params}`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    })

    if (!response.ok) throw new Error('Failed to fetch audit logs')

    const result = await response.json()
    
    return {
      data: result.data.map((log: any) => ({
        id: log.id,
        actorId: log.actor_id,
        actorEmail: log.actor?.email || null,
        actorRoles: [],
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
      page: result.pagination.page,
      pageSize: result.pagination.limit,
      totalPages: result.pagination.pages,
      totalCount: result.pagination.total
    }
  }
}

export const adminAuditService = new AdminAuditService()
