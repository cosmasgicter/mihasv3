import { apiClient } from '../client'

export interface AuditLogEntry {
  id: string
  action: string
  actorId: string | null
  actorEmail: string | null
  actorRoles: string[]
  targetTable: string | null
  targetId: string | null
  targetLabel: string | null
  requestId: string | null
  requestIp: string | null
  userAgent: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface AuditLogResponse {
  data: AuditLogEntry[]
  page: number
  pageSize: number
  totalPages: number
  totalCount: number
}

export interface AuditLogFilters {
  action?: string
  actorId?: string
  targetTable?: string
  targetId?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export interface AuditStats {
  totalEntries: number
  todayEntries: number
  uniqueActors: number
  topActions: Array<{ action: string; count: number }>
  recentActivity: AuditLogEntry[]
}

function buildQuery(params: AuditLogFilters = {}): string {
  const searchParams = new URLSearchParams()

  if (params.action) searchParams.set('logAction', params.action)
  if (params.actorId) searchParams.set('actorId', params.actorId)
  if (params.targetTable) searchParams.set('targetTable', params.targetTable)
  if (params.targetId) searchParams.set('targetId', params.targetId)
  if (params.from) searchParams.set('from', params.from)
  if (params.to) searchParams.set('to', params.to)
  if (params.page) searchParams.set('page', String(params.page))
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize))

  const queryString = searchParams.toString()
  return queryString ? `?${queryString}` : ''
}

export const adminAuditService = {
  async list(params: AuditLogFilters = {}): Promise<AuditLogResponse> {
    try {
      const query = buildQuery(params)
      const url = `/api/admin/audit-log${query}`
      const response = await apiClient.request<AuditLogResponse>(url, {
        method: 'GET'
      })
      return response || { data: [], page: 1, pageSize: 25, totalPages: 1, totalCount: 0 }
    } catch (error) {
      console.error('Failed to fetch audit log:', error)
      throw new Error(error instanceof Error ? error.message : 'Failed to load audit entries')
    }
  },

  async getStats(): Promise<AuditStats> {
    try {
      const response = await apiClient.request<AuditStats>('/api/admin/audit-log/stats', {
        method: 'GET'
      })
      return response || {
        totalEntries: 0,
        todayEntries: 0,
        uniqueActors: 0,
        topActions: [],
        recentActivity: []
      }
    } catch (error) {
      console.error('Failed to fetch audit stats:', error)
      return {
        totalEntries: 0,
        todayEntries: 0,
        uniqueActors: 0,
        topActions: [],
        recentActivity: []
      }
    }
  },

  async export(params: AuditLogFilters = {}): Promise<Blob> {
    try {
      const query = buildQuery(params)
      const url = `/api/admin/audit-log/export${query}`
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}` || ''
        }
      })
      
      if (!response.ok) {
        throw new Error('Export failed')
      }
      
      return await response.blob()
    } catch (error) {
      console.error('Failed to export audit log:', error)
      throw new Error('Failed to export audit log')
    }
  }
}
