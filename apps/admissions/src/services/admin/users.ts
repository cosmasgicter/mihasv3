import { apiClient, buildQueryString } from '../client'
import { logApiError } from '@/lib/apiErrorLogger'

const splitFullName = (fullName: string): { firstName: string; lastName: string } => {
  const normalized = fullName.trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return { firstName: '', lastName: '' }
  }

  const [firstName, ...rest] = normalized.split(' ')
  return {
    firstName: firstName ?? '',
    lastName: rest.join(' ') || (firstName ?? ''),
  }
}

export interface AdminUserRecord {
  id: string
  user_id?: string
  email: string
  first_name?: string
  last_name?: string
  full_name: string
  phone?: string
  role: string
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface AdminUserMutationResult {
  user?: AdminUserRecord
  revokedSessions?: number
  message?: string
}

export interface AdminUserListResult {
  users: AdminUserRecord[]
  totalCount: number
  page?: number
  pageSize?: number
  totalPages?: number
}

/**
 * Read-only Effective_Capabilities for a target user (design §5.3, R3.7).
 *
 * Mirrors the backend Capability_Endpoint payload. The fake permission editor
 * and its invented colon-permission vocabulary are retired (task 2.4, AUTH-04):
 * the frontend never mutates permissions and never maps arbitrary selections
 * back to a role. Authority is mutated only through the canonical platform
 * role, membership, and access-grant commands; this shape is display-only.
 */
export interface AdminUserCapabilityInstitution {
  id: string
  code: string
  name: string
  capabilities: string[]
}

export interface AdminUserEffectiveCapabilities {
  /** The target user's role string (informational). */
  role: string | null
  is_super_admin: boolean
  all_access: boolean
  /** Platform-level (`platform.*`) capabilities — populated for super-admins. */
  capabilities: string[]
  /** Per-institution tenant (`tenant.*`) capabilities. */
  institutions: AdminUserCapabilityInstitution[]
  /** Always true — this surface is display-only. */
  read_only: boolean
  /** True when the backend could not resolve the target's capabilities (fail-closed). */
  resolution_error?: boolean
}

function normalizeCapabilityInstitution(raw: unknown): AdminUserCapabilityInstitution | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>
  if (typeof entry.id !== 'string') return null
  return {
    id: entry.id,
    code: typeof entry.code === 'string' ? entry.code : '',
    name: typeof entry.name === 'string' ? entry.name : '',
    capabilities: Array.isArray(entry.capabilities)
      ? entry.capabilities.filter((c): c is string => typeof c === 'string')
      : [],
  }
}

export const userService = {
  /** List users with pagination. Maps to GET /admin/users/ */
  list: async (filters?: { page?: number; pageSize?: number; search?: string; role?: string }): Promise<AdminUserListResult> => {
    const params: Record<string, string> = {}
    if (filters?.page) params.page = String(filters.page)
    if (filters?.pageSize) params.pageSize = String(filters.pageSize)
    if (filters?.search) params.search = filters.search
    if (filters?.role) params.role = filters.role

    const qs = buildQueryString(params)
    try {
      const response = await apiClient.request<{
        results?: Array<Partial<AdminUserRecord>>
        totalCount?: number
        page?: number
        pageSize?: number
        totalPages?: number
      }>(`/admin/users/${qs}`)

      const users = (response?.results || []).map((user) => ({
        ...user,
        id: String(user.id ?? ''),
        full_name:
          user.full_name ||
          [user.first_name, user.last_name].filter(Boolean).join(' ').trim(),
        email: String(user.email ?? ''),
        role: typeof user.role === 'string' ? user.role : 'student',
      })) as AdminUserRecord[]

      return {
        users,
        totalCount: response?.totalCount ?? users.length,
        page: response?.page,
        pageSize: response?.pageSize,
        totalPages: response?.totalPages,
      }
    } catch (error) {
      logApiError('admin-users', '/api/v1/admin/users/', error)
      throw error
    }
  },

  /** Get a single user by ID. Maps to GET /admin/users/{id}/ */
  getById: async (id: string) => {
    try {
      return await apiClient.request<AdminUserRecord>(`/admin/users/${encodeURIComponent(id)}/`, {
        method: 'GET',
      })
    } catch (error) {
      logApiError('admin-users', `/api/v1/admin/users/${id}/`, error)
      throw error
    }
  },

  /**
   * Read the target user's backend-derived Effective_Capabilities (read-only).
   * Maps to GET /admin/users/{id}/effective-capabilities/ (task 2.4, R3.7).
   * Authority is derived server-side by AdminCapabilityService; this call never
   * mutates and there is no permission editor.
   */
  getEffectiveCapabilities: async (id: string): Promise<AdminUserEffectiveCapabilities> => {
    try {
      const data = await apiClient.request<AdminUserEffectiveCapabilities>(
        `/admin/users/${encodeURIComponent(id)}/effective-capabilities/`,
        { method: 'GET' },
      )
      return {
        role: data?.role ?? null,
        is_super_admin: Boolean(data?.is_super_admin),
        all_access: Boolean(data?.all_access),
        capabilities: Array.isArray(data?.capabilities)
          ? data.capabilities.filter((c): c is string => typeof c === 'string')
          : [],
        institutions: Array.isArray(data?.institutions)
          ? data.institutions
              .map(normalizeCapabilityInstitution)
              .filter((i): i is AdminUserCapabilityInstitution => i !== null)
          : [],
        read_only: data?.read_only !== false,
        resolution_error: Boolean(data?.resolution_error),
      }
    } catch (error) {
      logApiError('admin-users', `/api/v1/admin/users/${id}/effective-capabilities/`, error)
      throw error
    }
  },

  /** Create a new user. Maps to POST /admin/users/ */
  create: async (data: { email: string; password: string; full_name: string; phone?: string; role: string }) => {
    try {
      return await apiClient.request<AdminUserMutationResult>('/admin/users/', {
        method: 'POST',
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          phone: data.phone,
          ...splitFullName(data.full_name),
          role: data.role,
        }),
      })
    } catch (error) {
      logApiError('admin-users', '/api/v1/admin/users/', error)
      throw error
    }
  },

  /** Update a user. Maps to PATCH /admin/users/{id}/ */
  update: async (id: string, data: { full_name: string; email: string; phone?: string; role: string }) => {
    try {
      return await apiClient.request<AdminUserMutationResult>(`/admin/users/${encodeURIComponent(id)}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...splitFullName(data.full_name),
          email: data.email,
          phone: data.phone,
          role: data.role,
        }),
      })
    } catch (error) {
      logApiError('admin-users', `/api/v1/admin/users/${id}/`, error)
      throw error
    }
  },

  /** Deactivate a user. Maps to PATCH /admin/users/{id}/ */
  remove: async (id: string) => {
    try {
      return await apiClient.request<AdminUserMutationResult>(`/admin/users/${encodeURIComponent(id)}/`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: false }),
      })
    } catch (error) {
      logApiError('admin-users', `/api/v1/admin/users/${id}/`, error)
      throw error
    }
  },

  /** Export users as CSV. Maps to GET /admin/users/export/ */
  export: async () => {
    try {
      return await apiClient.request('/admin/users/export/', {
        method: 'GET',
      })
    } catch (error) {
      logApiError('admin-users', '/api/v1/admin/users/export/', error)
      throw error
    }
  },
}
