/**
 * Admin capability service + types.
 *
 * Backs the capability-aware admin UX (enterprise-tenant-authority). Calls
 * `GET /api/v1/admin/capabilities/` (`AdminCapabilityView`), which returns the
 * actor's resolved Capability_Set inside the `{"success": true, "data": ...}`
 * envelope (the api client unwraps the envelope, so this service receives the
 * inner `data` directly):
 *
 *   - `role`            — the actor's role string (informational only).
 *   - `is_super_admin`  — the single authority flag the frontend derives from.
 *   - `all_access`      — convenience flag mirroring super-admin reach.
 *   - `capabilities`    — platform.* strings (populated for super-admins).
 *   - `institutions[]`  — per-institution tenant.* capabilities, each entry
 *                         carrying `id`, `code`, `name`, and `capabilities`.
 *
 * Capabilities are derived server-side by `AdminCapabilityService` from active
 * memberships and grants, never from a role-string assumption — so the frontend
 * mirrors the backend's authority and the backend stays the security boundary.
 * On any failure we return an EMPTY capability set so the UI fails closed (no
 * leaked tenant data, no fabricated authority).
 */
import { apiClient } from '../client'
import { logApiError } from '@/lib/apiErrorLogger'

export interface AdminCapabilityInstitution {
  id: string
  code: string
  name: string
  capabilities: string[]
}

export interface AdminCapabilitySet {
  role: string | null
  is_super_admin: boolean
  all_access: boolean
  /** Platform-level (`platform.*`) capabilities — populated for super-admins. */
  capabilities: string[]
  /** Per-institution tenant capabilities for non-super-admins. */
  institutions: AdminCapabilityInstitution[]
}

const EMPTY_CAPABILITIES: AdminCapabilitySet = {
  role: null,
  is_super_admin: false,
  all_access: false,
  capabilities: [],
  institutions: [],
}

function normalizeInstitution(raw: unknown): AdminCapabilityInstitution | null {
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

export const adminCapabilityService = {
  async getCapabilities(): Promise<AdminCapabilitySet> {
    try {
      const data = await apiClient.request<AdminCapabilitySet>('/admin/capabilities/', {
        method: 'GET',
      })
      return {
        role: data?.role ?? null,
        is_super_admin: Boolean(data?.is_super_admin),
        all_access: Boolean(data?.all_access),
        capabilities: Array.isArray(data?.capabilities)
          ? data.capabilities.filter((c): c is string => typeof c === 'string')
          : [],
        institutions: Array.isArray(data?.institutions)
          ? data.institutions
              .map(normalizeInstitution)
              .filter((i): i is AdminCapabilityInstitution => i !== null)
          : [],
      }
    } catch (err) {
      logApiError('admin-capabilities', '/admin/capabilities/', err)
      return EMPTY_CAPABILITIES
    }
  },
}
