import { apiClient, buildQueryString } from '../client'
import { logApiError } from '@/lib/apiErrorLogger'

type RawList<T> = T[] | { results?: T[]; data?: T[] | { results?: T[] }; totalCount?: number; count?: number } | null | undefined

export interface TenantInstitution {
  id: string
  name: string
  code: string
  slug?: string | null
  full_name?: string | null
  brand_name?: string | null
  email?: string | null
  support_email?: string | null
  admissions_email?: string | null
  phone?: string | null
  website?: string | null
  primary_color?: string | null
  secondary_color?: string | null
  accreditation_status?: string | null
  description?: string | null
  is_active?: boolean
}

export interface TenantDomain {
  id: string
  institution_id: string
  hostname: string
  is_primary?: boolean
  is_active?: boolean
}

export interface TenantAsset {
  id: string
  institution_id: string
  asset_type: string
  storage_key: string
  public_url?: string | null
  mime_type: string
  checksum_sha256?: string
  version?: number
  is_active?: boolean
}

export interface TenantTemplate {
  id: string
  institution_id: string
  document_type: string
  name: string
  version: number
  sections?: Record<string, unknown>
  tokens?: string[]
  is_active?: boolean
}

/**
 * Structured assignment/residency rule shape used by the rule builders.
 * Stored on the program offering's `assignment_rules` JSON column. Every field
 * is optional so legacy/empty offerings round-trip without loss.
 */
export interface TenantOfferingRules {
  /** ISO country codes / nationalities explicitly allowed (allowlist). */
  allowed_countries?: string[]
  /** ISO country codes / nationalities explicitly blocked (denylist). */
  blocked_countries?: string[]
  [key: string]: unknown
}

export interface TenantOffering {
  id: string
  name: string
  code: string
  institution_id: string
  canonical_program_id?: string | null
  assignment_priority?: number | null
  offering_status?: string | null
  assignment_rules?: TenantOfferingRules | null
  application_fee?: number | string | null
  is_active?: boolean
}

export interface TenantSettlementRow {
  institution_id: string | null
  institution_name: string
  program_offering_id: string | null
  program_name: string
  currency: string
  payment_count: number
  gross_amount: string
}

export interface TenantRequiredDocument {
  id: string
  institution_id: string
  program_id?: string | null
  canonical_program_id?: string | null
  document_type: string
  label: string
  is_required?: boolean
  is_active?: boolean
}

export interface TenantMembership {
  id: string
  user_id: string
  institution_id: string
  role: string
  is_active?: boolean
}

export interface TenantAccessGrant {
  id: string
  user_id: string
  scope_type: string
  institution_id?: string | null
  program_id?: string | null
  application_id?: string | null
  expires_at?: string | null
  is_active?: boolean
}

/** Inputs for the "Test routing" simulator — mirror `OfferingAssignmentService.assign`. */
export interface RoutingSimulationInput {
  program_id: string
  intake_id: string
  country?: string | null
  nationality?: string | null
  institution_id?: string | null
}

/** Routing decision factors echoed back so an operator can see why an offering won. */
export interface RoutingSimulationDecision {
  offering_priority?: number | null
  program_intake_priority?: number | null
  offering_status?: string | null
}

/**
 * Result of a routing simulation. Mirrors the dedicated super-admin endpoint
 * `POST /api/v1/admin/routing/simulate/`, which reuses the real
 * `OfferingAssignmentService` — so this result matches what a real submission
 * would route for the same inputs. `assigned: false` carries a recoverable
 * `error` (e.g. `NO_ELIGIBLE_OFFERING`) instead of dead-ending.
 */
export interface RoutingSimulationResult {
  assigned: boolean
  inputs: RoutingSimulationInput
  program_id?: string
  program_name?: string
  intake_id?: string
  intake_name?: string
  program_offering_id?: string
  offering_code?: string
  offering_name?: string
  institution_id?: string
  institution?: {
    id: string
    name: string
    full_name?: string
    code?: string
  }
  decision?: RoutingSimulationDecision
  required_documents?: Array<{
    document_type: string
    label: string
    required: boolean
    rules?: Record<string, unknown>
  }>
  error?: {
    code: string
    message: string
  }
}

export type TenantAssetPayload = Pick<TenantAsset, 'asset_type' | 'storage_key' | 'mime_type'> & Partial<TenantAsset>
export type TenantTemplatePayload = Pick<TenantTemplate, 'document_type' | 'name'> & Partial<TenantTemplate>
export type TenantRequiredDocumentPayload = Pick<TenantRequiredDocument, 'document_type' | 'label'> & Partial<TenantRequiredDocument>
export type TenantMembershipPayload = Pick<TenantMembership, 'user_id' | 'institution_id' | 'role'> & Partial<TenantMembership>
export type TenantAccessGrantPayload = Pick<TenantAccessGrant, 'user_id' | 'scope_type'> & Partial<TenantAccessGrant>

function listFromResponse<T>(response: RawList<T>): T[] {
  if (Array.isArray(response)) return response
  if (!response || typeof response !== 'object') return []
  if (Array.isArray(response.results)) return response.results
  if (Array.isArray(response.data)) return response.data
  if (response.data && typeof response.data === 'object' && Array.isArray(response.data.results)) {
    return response.data.results
  }
  return []
}

function listResult<T>(response: RawList<T>) {
  const items = listFromResponse(response)
  const totalCount = response && typeof response === 'object' && !Array.isArray(response)
    ? response.totalCount ?? response.count ?? items.length
    : items.length
  return { items, totalCount }
}

export const tenantAdminService = {
  listInstitutions: async (params?: { search?: string; active?: boolean }) => {
    const query = buildQueryString({
      search: params?.search,
      active: params?.active === undefined ? undefined : String(params.active),
    })
    const endpoint = `/admin/institutions/${query}`
    try {
      const response = await apiClient.request<RawList<TenantInstitution>>(endpoint)
      const { items, totalCount } = listResult(response)
      return { institutions: items, totalCount }
    } catch (error) {
      logApiError('admin-tenants', endpoint, error)
      throw error
    }
  },

  createInstitution: async (data: Partial<TenantInstitution>) => {
    try {
      return apiClient.request<TenantInstitution>('/admin/institutions/', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    } catch (error) {
      logApiError('admin-tenants', '/api/v1/admin/institutions/', error)
      throw error
    }
  },

  updateInstitution: async (id: string, data: Partial<TenantInstitution>) => {
    const endpoint = `/admin/institutions/${encodeURIComponent(id)}/`
    try {
      return apiClient.request<TenantInstitution>(endpoint, {
        method: 'PATCH',
        body: JSON.stringify(data),
      })
    } catch (error) {
      logApiError('admin-tenants', endpoint, error)
      throw error
    }
  },

  listDomains: async (institutionId: string) => {
    const endpoint = `/admin/institutions/${encodeURIComponent(institutionId)}/domains/`
    const response = await apiClient.request<RawList<TenantDomain>>(endpoint)
    return listResult(response).items
  },

  createDomain: async (institutionId: string, data: Pick<TenantDomain, 'hostname'> & Partial<TenantDomain>) =>
    apiClient.request<TenantDomain>(`/admin/institutions/${encodeURIComponent(institutionId)}/domains/`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateDomain: async (institutionId: string, domainId: string, data: Partial<TenantDomain>) =>
    apiClient.request<TenantDomain>(`/admin/institutions/${encodeURIComponent(institutionId)}/domains/${encodeURIComponent(domainId)}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  listAssets: async (institutionId: string) => {
    const endpoint = `/admin/institutions/${encodeURIComponent(institutionId)}/assets/`
    const response = await apiClient.request<RawList<TenantAsset>>(endpoint)
    return listResult(response).items
  },

  createAsset: async (institutionId: string, data: TenantAssetPayload) =>
    apiClient.request<TenantAsset>(`/admin/institutions/${encodeURIComponent(institutionId)}/assets/`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  uploadAsset: async (institutionId: string, data: { asset_type: string; file: File }) => {
    const formData = new FormData()
    formData.append('asset_type', data.asset_type)
    formData.append('file', data.file)
    return apiClient.request<TenantAsset>(`/admin/institutions/${encodeURIComponent(institutionId)}/assets/upload/`, {
      method: 'POST',
      body: formData,
    })
  },

  updateAsset: async (institutionId: string, assetId: string, data: Partial<TenantAsset>) =>
    apiClient.request<TenantAsset>(`/admin/institutions/${encodeURIComponent(institutionId)}/assets/${encodeURIComponent(assetId)}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  listTemplates: async (institutionId: string) => {
    const endpoint = `/admin/institutions/${encodeURIComponent(institutionId)}/templates/`
    const response = await apiClient.request<RawList<TenantTemplate>>(endpoint)
    return listResult(response).items
  },

  createTemplate: async (institutionId: string, data: TenantTemplatePayload) =>
    apiClient.request<TenantTemplate>(`/admin/institutions/${encodeURIComponent(institutionId)}/templates/`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTemplate: async (institutionId: string, templateId: string, data: Partial<TenantTemplate>) =>
    apiClient.request<TenantTemplate>(`/admin/institutions/${encodeURIComponent(institutionId)}/templates/${encodeURIComponent(templateId)}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  listRequiredDocuments: async (institutionId: string) => {
    const endpoint = `/admin/institutions/${encodeURIComponent(institutionId)}/required-documents/`
    const response = await apiClient.request<RawList<TenantRequiredDocument>>(endpoint)
    return listResult(response).items
  },

  createRequiredDocument: async (institutionId: string, data: TenantRequiredDocumentPayload) =>
    apiClient.request<TenantRequiredDocument>(`/admin/institutions/${encodeURIComponent(institutionId)}/required-documents/`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateRequiredDocument: async (institutionId: string, documentId: string, data: Partial<TenantRequiredDocument>) =>
    apiClient.request<TenantRequiredDocument>(`/admin/institutions/${encodeURIComponent(institutionId)}/required-documents/${encodeURIComponent(documentId)}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  listMemberships: async (institutionId?: string) => {
    const query = buildQueryString({ institution: institutionId })
    const response = await apiClient.request<RawList<TenantMembership>>(`/admin/memberships/${query}`)
    return listResult(response).items
  },

  createMembership: async (data: TenantMembershipPayload) =>
    apiClient.request<TenantMembership>('/admin/memberships/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateMembership: async (membershipId: string, data: Partial<TenantMembership>) =>
    apiClient.request<TenantMembership>(`/admin/memberships/${encodeURIComponent(membershipId)}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  listAccessGrants: async (params?: { userId?: string; institutionId?: string }) => {
    const query = buildQueryString({ user: params?.userId, institution: params?.institutionId })
    const response = await apiClient.request<RawList<TenantAccessGrant>>(`/admin/access-grants/${query}`)
    return listResult(response).items
  },

  createAccessGrant: async (data: TenantAccessGrantPayload) =>
    apiClient.request<TenantAccessGrant>('/admin/access-grants/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateAccessGrant: async (grantId: string, data: Partial<TenantAccessGrant>) =>
    apiClient.request<TenantAccessGrant>(`/admin/access-grants/${encodeURIComponent(grantId)}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /**
   * List a school's program offerings. Offerings drive routing, so the tenant
   * page reads them to surface assignment priority/capacity and to power the
   * structured rule builders. Filtered to the institution client-side because
   * `/catalog/programs/` returns all schools' offerings to an admin.
   */
  listOfferings: async (institutionId: string) => {
    const endpoint = `/catalog/programs/${buildQueryString({ pageSize: 200 })}`
    try {
      const response = await apiClient.request<RawList<TenantOffering>>(endpoint)
      const items = listFromResponse(response)
      return items.filter(item => String(item.institution_id || (item as { institution?: { id?: string } }).institution?.id || '') === String(institutionId))
    } catch (error) {
      logApiError('admin-tenants', endpoint, error)
      throw error
    }
  },

  getOffering: async (offeringId: string) =>
    apiClient.request<TenantOffering>(`/catalog/programs/${encodeURIComponent(offeringId)}/`),

  /**
   * Persist structured routing config (priority, status, country rules) on an
   * offering. Reuses the existing admin program PATCH endpoint; the structured
   * builders serialise into `assignment_rules`.
   */
  updateOfferingRules: async (
    offeringId: string,
    data: { assignment_priority?: number; offering_status?: string; assignment_rules?: TenantOfferingRules; is_active?: boolean }
  ) =>
    apiClient.request<TenantOffering>(`/catalog/programs/${encodeURIComponent(offeringId)}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /** Tenant-scoped settlement grouping by institution/offering/currency. */
  listSettlements: async (params?: { start_date?: string; end_date?: string; status?: string }) => {
    const query = buildQueryString({
      start_date: params?.start_date,
      end_date: params?.end_date,
      status: params?.status,
    })
    const endpoint = `/payments/settlements/${query}`
    try {
      const response = await apiClient.request<RawList<TenantSettlementRow>>(endpoint)
      return listResult(response).items
    } catch (error) {
      logApiError('admin-tenants', endpoint, error)
      throw error
    }
  },

  /**
   * Dry-run the real assignment service for a canonical program + intake (R11.3).
   *
   * Calls the dedicated super-admin endpoint that *reuses*
   * `OfferingAssignmentService` rather than reimplementing routing, so the
   * simulator result matches exactly what a real submission would route for the
   * same inputs. Read-only — creates no application row. The endpoint returns a
   * `200` with `assigned: false` + a recoverable `error` for unroutable inputs,
   * so callers should branch on `result.assigned`, not on a thrown error.
   */
  simulateRouting: async (input: RoutingSimulationInput) => {
    const endpoint = '/admin/routing/simulate/'
    try {
      return await apiClient.request<RoutingSimulationResult>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          program_id: input.program_id,
          intake_id: input.intake_id,
          country: optionalString(input.country),
          nationality: optionalString(input.nationality),
          institution_id: optionalString(input.institution_id),
        }),
      })
    } catch (error) {
      logApiError('admin-tenants', endpoint, error)
      throw error
    }
  },
}

function optionalString(value: string | null | undefined) {
  const trimmed = (value ?? '').trim()
  return trimmed || undefined
}
