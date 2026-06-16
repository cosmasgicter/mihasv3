/**
 * Admin tenant-scope service + types.
 *
 * Backs the multi-tenant admin UX. Calls `GET /api/v1/admin/scope/`
 * (`AdminScopeView`), which returns the actor's role, whether they have
 * all-institution access, and the institutions they may act on:
 *
 *   - A super-admin gets `all_access: true` + the full institution list →
 *     the UI shows an institution switcher ("All schools" + each school).
 *   - A school admin gets `all_access: false` + their institution(s) → the UI
 *     auto-locks to it (single) with no switcher.
 *
 * Scope is derived server-side from `AccessScopeService`, never from a
 * role-string assumption, so the frontend mirrors the backend's authority.
 */
import { apiClient } from '../client'
import { logApiError } from '@/lib/apiErrorLogger'

export interface AdminScopeInstitution {
  id: string
  name: string
  code: string
}

export interface AdminScope {
  role: string | null
  all_access: boolean
  institutions: AdminScopeInstitution[]
}

const EMPTY_SCOPE: AdminScope = { role: null, all_access: false, institutions: [] }

export const adminScopeService = {
  async getScope(): Promise<AdminScope> {
    try {
      const data = await apiClient.request<AdminScope>('/admin/scope/', { method: 'GET' })
      return {
        role: data?.role ?? null,
        all_access: Boolean(data?.all_access),
        institutions: Array.isArray(data?.institutions) ? data.institutions : [],
      }
    } catch (err) {
      logApiError('admin-scope', '/admin/scope/', err)
      return EMPTY_SCOPE
    }
  },
}
