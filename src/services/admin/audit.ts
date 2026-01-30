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

    const page = filters.page || 1
    const pageSize = filters.pageSize || 50
    const offset = (page - 1) * pageSize

    // Build query with join to profiles for actor email
    let query = supabase
      .from('audit_logs')
      .select(`
        *,
        profiles:actor_id (
          email,
          full_name,
          role
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    // Apply filters
    if (filters.action) {
      query = query.ilike('action', `%${filters.action}%`)
    }
    if (filters.targetTable) {
      query = query.eq('entity_type', filters.targetTable)
    }
    if (filters.from) {
      query = query.gte('created_at', filters.from)
    }
    if (filters.to) {
      query = query.lte('created_at', filters.to)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Failed to fetch audit logs:', error)
      throw new Error(`Failed to fetch audit logs: ${error.message}`)
    }

    const totalCount = count || 0
    const totalPages = Math.ceil(totalCount / pageSize) || 1

    return {
      data: (data || []).map((log: any) => ({
        id: log.id,
        actorId: log.actor_id,
        actorEmail: log.profiles?.email || null,
        actorRoles: log.profiles?.role ? [log.profiles.role] : [],
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
  }
}

export const adminAuditService = new AdminAuditService()
