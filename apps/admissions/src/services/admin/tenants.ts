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
  address?: string | null
  primary_color?: string | null
  secondary_color?: string | null
  accreditation_status?: string | null
  description?: string | null
  is_active?: boolean
}

/**
 * The DNS record a tenant must publish to verify ownership/routing. Returned by
 * the domain create endpoint (`AdminTenantDomainListCreateView`) alongside the
 * freshly generated `verification_token` + `dns_target`. Mirrors the backend
 * `_build_dns_record` shape.
 */
export interface TenantDomainDnsRecord {
  type: string
  name: string
  value: string
  ttl?: number
  verification?: {
    type: string
    name: string
    value: string
  }
  instructions?: string
}

/**
 * Domain lifecycle status (R7.2). Mirrors `InstitutionDomain.STATUS_*` and the
 * `DomainStatusMachine` on the backend. A domain only routes a tenant when it
 * reaches `active`.
 */
export type TenantDomainStatus =
  | 'pending_dns'
  | 'pending_review'
  | 'verified'
  | 'active'
  | 'disabled'
  | 'failed'
  | 'rejected'

export interface TenantDomain {
  id: string
  institution_id: string
  hostname: string
  is_primary?: boolean
  is_active?: boolean
  /** Lifecycle status (R7.2). Present on create/activate responses and reads. */
  status?: TenantDomainStatus | string | null
  verification_token?: string | null
  dns_target?: string | null
  verified_at?: string | null
  last_checked_at?: string | null
  last_error?: string | null
  /** Only present on the create response — the record the tenant must publish. */
  dns_record?: TenantDomainDnsRecord | null
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

export interface TenantReadinessItem {
  key: string
  label: string
  ready: boolean
  count: number
  blocking: boolean
  message: string
}

export interface TenantReadiness {
  institution_id: string
  launch_ready: boolean
  items: TenantReadinessItem[]
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

/** A single fee-chart row on a document profile (≤50 rows). */
export interface TenantProfileFeeRow {
  item: string
  amount: number
  cadence?: string | null
  [key: string]: unknown
}

/** A single bank-account row on a document profile (≤10 rows). */
export interface TenantProfileBankAccount {
  bank_name: string
  account_number: string
  [key: string]: unknown
}

/**
 * Rich tenant document profile (R8.8) — the multi-section successor to
 * `TenantTemplate`. Carries an optional applies-to scope
 * (offering/canonical-program/intake), a layout, free-form prose `sections`,
 * and structured `fee_chart` / `bank_accounts` / `requirements` / `signatory`
 * data. Mirrors the backend `AdminDocumentProfileSerializer`. Structural caps
 * (≤30 sections × ≤5000 chars, ≤50 fee rows, ≤10 banks, ≤50 requirements) are
 * enforced by the backend `validate_profile_payload`.
 */
export interface TenantDocumentProfile {
  id: string
  institution_id: string
  document_type: string
  program_id?: string | null
  canonical_program_id?: string | null
  intake_id?: string | null
  layout_key: string
  sections?: Record<string, string>
  fee_chart?: TenantProfileFeeRow[]
  bank_accounts?: TenantProfileBankAccount[]
  requirements?: string[]
  signatory?: Record<string, unknown>
  rules?: Record<string, unknown> | null
  version: number
  is_active?: boolean
  created_at?: string | null
  updated_at?: string | null
}

export type TenantDocumentProfilePayload = Pick<TenantDocumentProfile, 'document_type'> &
  Partial<TenantDocumentProfile>

/** Optional content overrides accepted by the profile clone (new-version) endpoint. */
export type TenantProfileCloneOverrides = Partial<
  Pick<
    TenantDocumentProfile,
    'layout_key' | 'sections' | 'fee_chart' | 'bank_accounts' | 'requirements' | 'signatory' | 'rules' | 'is_active'
  >
>

/** Structural caps enforced by the backend `validate_profile_payload` (R8.10). Surfaced in the UI. */
export const TENANT_PROFILE_CAPS = {
  maxSections: 30,
  maxSectionChars: 5000,
  maxFeeRows: 50,
  maxBankAccounts: 10,
  maxRequirements: 50,
} as const

/** Layout keys supported by the backend renderer package (`tasks/pdf/layouts/`). */
export const TENANT_PROFILE_LAYOUTS = ['simple_letter', 'fee_chart_letter'] as const

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
  permissions?: string[] | null
  is_active?: boolean
}

/**
 * A tenant staff invitation (task 4.2, R4.3-R4.4). The atomic invite endpoint
 * creates the identity, this invitation, and the membership in one transaction
 * and emails a single-use accept link — it NEVER returns a token or password,
 * so this shape deliberately has no `token`/`password` field.
 */
export interface TenantStaffInvitation {
  id: string
  institution_id: string
  email: string
  invited_role: string
  permissions?: string[] | null
  status: 'pending' | 'accepted' | 'revoked' | 'expired' | string
  profile_id?: string | null
  membership_id?: string | null
  expires_at?: string | null
  accepted_at?: string | null
  revoked_at?: string | null
  last_sent_at?: string | null
  resend_count?: number
  created_at?: string | null
}

/** A candidate identity for the invite-by-email search selector (R6.3, TEN-05). */
export interface TenantStaffCandidate {
  id: string
  email: string
  full_name: string
  role: string
}

export interface TenantStaffInvitePayload {
  institution_id: string
  email: string
  role?: string
  full_name?: string
  permissions?: string[]
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
  host?: string | null
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

/**
 * A canonical application/tuition fee row for a program offering (R7.3, R7.4).
 * Mirrors the backend `ProgramFeeSerializer` (`/api/v1/programs/{id}/fees/`).
 * One active fee is enforced per `(program, fee_type, residency_category)`;
 * a duplicate race returns `DUPLICATE_ACTIVE_FEE` (409).
 */
export interface TenantProgramFee {
  id: string
  program_id: string
  fee_type: 'application' | 'tuition' | string
  residency_category: 'local' | 'international' | string
  amount: string | number
  currency: string
  is_active?: boolean
  created_at?: string | null
  updated_at?: string | null
}

export type TenantProgramFeePayload = Pick<
  TenantProgramFee,
  'fee_type' | 'residency_category' | 'amount'
> & { currency?: string }

/**
 * Payload to assign a Canonical_Program to a tenant, creating an
 * Institution_Program_Offering (R7.1, R7.3). Posted to
 * `POST /api/v1/catalog/programs/`; the server derives the tenant + snapshots
 * from the canonical IDs. `canonical_program_id` is the only write authority —
 * never a display string.
 */
export interface CreateOfferingPayload {
  canonical_program_id: string
  name: string
  code: string
  duration_months?: number
  assignment_priority?: number
  offering_status?: string
  tuition_fee?: number | string
  regulatory_body?: string
  accreditation_status?: string
  requirements?: Record<string, unknown>
}

/**
 * A created Intake_Offering junction row (R7.3). Mirrors the backend
 * `AdminProgramIntakeSerializer` (`POST /api/v1/admin/program-intakes/`).
 */
export interface TenantProgramIntake {
  id: string
  program_id: string
  intake_id: string
  max_capacity?: number | null
  current_enrollment?: number | null
  assignment_priority?: number | null
  is_active?: boolean
}

/** Payload to link an offering to an intake with an optional seat capacity (R4.2, R7.3). */
export interface CreateProgramIntakePayload {
  program_id: string
  intake_id: string
  max_capacity?: number | null
  assignment_priority?: number | null
}

export type TenantAssetPayload = Pick<TenantAsset, 'asset_type' | 'storage_key' | 'mime_type'> & Partial<TenantAsset>
export type TenantTemplatePayload = Pick<TenantTemplate, 'document_type' | 'name'> & Partial<TenantTemplate>
export type TenantRequiredDocumentPayload = Pick<TenantRequiredDocument, 'document_type' | 'label'> & Partial<TenantRequiredDocument>
export type TenantMembershipPayload = Pick<TenantMembership, 'user_id' | 'institution_id' | 'role'> & Partial<TenantMembership>
export type TenantAccessGrantPayload = Pick<TenantAccessGrant, 'user_id' | 'scope_type'> & Partial<TenantAccessGrant>

/**
 * Read the item list out of an admin tenant list response.
 *
 * Task 12.2 (R14.5, finding API-02) deleted the `.data` and `.data.results`
 * branches: `apiClient.request` unwraps exactly one `{success, data}` level, so
 * both required a second envelope no admin endpoint emits. The two remaining
 * shapes are real — `{page, pageSize, totalCount, results}` from
 * `StandardPagination`, and a bare array from the endpoints that return
 * `{"success": True, "data": [...]}` unpaginated.
 *
 * Zero first-party callers, measured by `scripts/v1_surface_telemetry.py`
 * (surface `normalizer.admin_tenants.listFromResponse`).
 */
function listFromResponse<T>(response: RawList<T>): T[] {
  if (Array.isArray(response)) return response
  if (!response || typeof response !== 'object') return []
  if (Array.isArray(response.results)) return response.results
  return []
}

/**
 * The list plus its server-owned total.
 *
 * `response.count` — DRF's *default* pagination key — was removed by task 12.2.
 * This platform's pagination class is `StandardPagination`, which publishes
 * `totalCount` and has no `count` key at all (`backend/apps/common/pagination.py`).
 * Reading `count` was reading a key from a pagination class this platform does
 * not use, and its effect when both were absent was to report the **page
 * length** as the total — a browser-side number standing in for a server one,
 * which is the habit finding ADM-06 named. `items.length` remains as the
 * un-paginated fallback, where it is the true total rather than a guess.
 */
function listResult<T>(response: RawList<T>) {
  const items = listFromResponse(response)
  const totalCount = response && typeof response === 'object' && !Array.isArray(response)
    ? response.totalCount ?? items.length
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

  getInstitution: async (id: string) => {
    const endpoint = `/admin/institutions/${encodeURIComponent(id)}/`
    try {
      return await apiClient.request<TenantInstitution>(endpoint, { method: 'GET' })
    } catch (error) {
      logApiError('admin-tenant-detail', endpoint, error)
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

  /**
   * Activate a verified domain (R7.6, R7.14). Super-admin only on the backend
   * (`AdminTenantDomainActivateView`); drives `verified → active` so the
   * Domain_Resolver will route the tenant. A domain that is not yet `verified`
   * is rejected with the stable `DOMAIN_NOT_VERIFIED` code (409), and a
   * hostname already active for another tenant returns `HOSTNAME_CONFLICT`
   * (409) — both surfaced through the enhanced API error. Sends no body; the
   * target domain is identified entirely by the path.
   */
  activateDomain: async (institutionId: string, domainId: string) => {
    const endpoint = `/admin/institutions/${encodeURIComponent(institutionId)}/domains/${encodeURIComponent(domainId)}/activate/`
    try {
      return await apiClient.request<TenantDomain>(endpoint, { method: 'POST' })
    } catch (error) {
      logApiError('admin-tenants', endpoint, error)
      throw error
    }
  },

  /**
   * Re-run verification for a domain (R5.1). Super-admin only
   * (`AdminTenantDomainRetryView`, `platform.domain.manage`). Valid from
   * `pending_dns` / `failed` / `rejected` — the backend commits a fresh
   * verification job before returning `202 Accepted`; any other status is
   * rejected with `DOMAIN_TRANSITION_REJECTED` (409).
   */
  retryDomain: async (institutionId: string, domainId: string) => {
    const endpoint = `/admin/institutions/${encodeURIComponent(institutionId)}/domains/${encodeURIComponent(domainId)}/retry/`
    try {
      return await apiClient.request<TenantDomain>(endpoint, { method: 'POST' })
    } catch (error) {
      logApiError('admin-tenants', endpoint, error)
      throw error
    }
  },

  /**
   * Approve a DNS-verified domain (R5.1): `pending_review → verified`.
   * Super-admin only (`platform.domain.manage`). Approving does not make the
   * domain route a tenant — a subsequent `activateDomain` does.
   */
  approveDomain: async (institutionId: string, domainId: string) => {
    const endpoint = `/admin/institutions/${encodeURIComponent(institutionId)}/domains/${encodeURIComponent(domainId)}/approve/`
    try {
      return await apiClient.request<TenantDomain>(endpoint, { method: 'POST' })
    } catch (error) {
      logApiError('admin-tenants', endpoint, error)
      throw error
    }
  },

  /**
   * Reject a domain pending review (R5.1): `pending_review → rejected`. An
   * optional operator `reason` is stored on the domain. Super-admin only
   * (`platform.domain.manage`). A rejected domain can only re-enter the
   * lifecycle via `retryDomain`.
   */
  rejectDomain: async (institutionId: string, domainId: string, reason?: string) => {
    const endpoint = `/admin/institutions/${encodeURIComponent(institutionId)}/domains/${encodeURIComponent(domainId)}/reject/`
    try {
      return await apiClient.request<TenantDomain>(endpoint, {
        method: 'POST',
        body: JSON.stringify(reason ? { reason } : {}),
      })
    } catch (error) {
      logApiError('admin-tenants', endpoint, error)
      throw error
    }
  },

  /**
   * Reactivate a disabled domain (R5.1): `disabled → active`. Super-admin only
   * (`platform.domain.manage`); sets the row active again so the fail-closed
   * resolver routes the tenant. A hostname another tenant activated meanwhile
   * returns `HOSTNAME_CONFLICT` (409).
   */
  reactivateDomain: async (institutionId: string, domainId: string) => {
    const endpoint = `/admin/institutions/${encodeURIComponent(institutionId)}/domains/${encodeURIComponent(domainId)}/reactivate/`
    try {
      return await apiClient.request<TenantDomain>(endpoint, { method: 'POST' })
    } catch (error) {
      logApiError('admin-tenants', endpoint, error)
      throw error
    }
  },

  listAssets: async (institutionId: string) => {
    const endpoint = `/admin/institutions/${encodeURIComponent(institutionId)}/assets/`
    const response = await apiClient.request<RawList<TenantAsset>>(endpoint)
    return listResult(response).items
  },

  getReadiness: async (institutionId: string) => {
    const endpoint = `/admin/institutions/${encodeURIComponent(institutionId)}/readiness/`
    try {
      return await apiClient.request<TenantReadiness>(endpoint)
    } catch (error) {
      logApiError('admin-tenants', endpoint, error)
      throw error
    }
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

  /**
   * List a school's rich document profiles (R8.8). Returns every version of
   * every profile scope; the panel groups by scope + document type and surfaces
   * the latest version per scope.
   */
  listDocumentProfiles: async (institutionId: string) => {
    const endpoint = `/admin/institutions/${encodeURIComponent(institutionId)}/document-profiles/`
    try {
      const response = await apiClient.request<RawList<TenantDocumentProfile>>(endpoint)
      return listResult(response).items
    } catch (error) {
      logApiError('admin-tenants', endpoint, error)
      throw error
    }
  },

  createDocumentProfile: async (institutionId: string, data: TenantDocumentProfilePayload) =>
    apiClient.request<TenantDocumentProfile>(`/admin/institutions/${encodeURIComponent(institutionId)}/document-profiles/`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateDocumentProfile: async (institutionId: string, profileId: string, data: Partial<TenantDocumentProfile>) =>
    apiClient.request<TenantDocumentProfile>(
      `/admin/institutions/${encodeURIComponent(institutionId)}/document-profiles/${encodeURIComponent(profileId)}/`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    ),

  /**
   * Clone a profile into its next version (R8.5). Reuses the backend
   * `create_new_version` service — an INSERT that leaves prior versions (and
   * any documents generated from them) untouched. Optional content overrides
   * are validated server-side before any write.
   */
  cloneDocumentProfile: async (institutionId: string, profileId: string, overrides: TenantProfileCloneOverrides = {}) =>
    apiClient.request<TenantDocumentProfile>(
      `/admin/institutions/${encodeURIComponent(institutionId)}/document-profiles/${encodeURIComponent(profileId)}/clone/`,
      {
        method: 'POST',
        body: JSON.stringify(overrides),
      }
    ),

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

  // --- Staff invitations (task 4.2, R4.3-R4.4, R6.3) ---------------------
  //
  // The atomic invite command replaces the old fragile flow (create user, then
  // separately create a membership, with an operator-set password shown and
  // persisted in localStorage — TEN-01). It creates the identity + invitation +
  // membership server-side in one transaction, emails a single-use accept link,
  // and returns NO token or password.

  /** List staff invitations for a tenant (pending/accepted/revoked/expired). */
  listStaffInvitations: async (institutionId: string, params?: { status?: string }) => {
    const query = buildQueryString({ institution: institutionId, status: params?.status })
    const endpoint = `/admin/staff/invitations/${query}`
    try {
      const response = await apiClient.request<RawList<TenantStaffInvitation>>(endpoint)
      return listResult(response).items
    } catch (error) {
      logApiError('admin-tenants', endpoint, error)
      throw error
    }
  },

  /** Atomically invite a staff member by email (never sets/returns a password). */
  inviteStaff: async (data: TenantStaffInvitePayload) => {
    const endpoint = '/admin/staff/invitations/'
    try {
      return await apiClient.request<TenantStaffInvitation>(endpoint, {
        method: 'POST',
        body: JSON.stringify(data),
      })
    } catch (error) {
      logApiError('admin-tenants', endpoint, error)
      throw error
    }
  },

  /** Rotate the token and re-send a pending/expired invitation. */
  resendStaffInvitation: async (invitationId: string) =>
    apiClient.request<TenantStaffInvitation>(
      `/admin/staff/invitations/${encodeURIComponent(invitationId)}/resend/`,
      { method: 'POST' }
    ),

  /** Revoke an invitation and deactivate the membership it granted. */
  revokeStaffInvitation: async (invitationId: string) =>
    apiClient.request<TenantStaffInvitation>(
      `/admin/staff/invitations/${encodeURIComponent(invitationId)}/revoke/`,
      { method: 'POST' }
    ),

  /** Search existing identities by email/name for the invite selector (R6.3). */
  searchStaffCandidates: async (query: string, institutionId?: string) => {
    const qs = buildQueryString({ q: query, institution: institutionId, limit: 10 })
    const endpoint = `/admin/staff/candidates/${qs}`
    try {
      const response = await apiClient.request<RawList<TenantStaffCandidate>>(endpoint)
      return listResult(response).items
    } catch (error) {
      logApiError('admin-tenants', endpoint, error)
      throw error
    }
  },

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
   * structured rule builders. This uses the tenant-scoped admin child endpoint
   * so a school admin never receives another school's offerings in the browser.
   */
  listOfferings: async (institutionId: string) => {
    const endpoint = `/admin/institutions/${encodeURIComponent(institutionId)}/programs/${buildQueryString({ pageSize: 200 })}`
    try {
      const response = await apiClient.request<RawList<TenantOffering>>(endpoint)
      return listFromResponse(response)
    } catch (error) {
      logApiError('admin-tenants', endpoint, error)
      throw error
    }
  },

  /**
   * Persist structured routing config (priority, status, country rules) on an
   * offering through the tenant-scoped admin endpoint. The structured builders
   * serialise into `assignment_rules`; the backend re-validates that the
   * offering belongs to the institution in the path.
   */
  updateOfferingRules: async (
    institutionId: string,
    offeringId: string,
    data: { assignment_priority?: number; offering_status?: string; assignment_rules?: TenantOfferingRules; is_active?: boolean }
  ) =>
    apiClient.request<TenantOffering>(`/admin/institutions/${encodeURIComponent(institutionId)}/programs/${encodeURIComponent(offeringId)}/`, {
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
   * Assign a Canonical_Program to a tenant, creating an
   * Institution_Program_Offering (R7.1, R7.3, TEN-03). Posts the canonical
   * program id + institution id to `POST /api/v1/catalog/programs/`; the server
   * derives snapshots and re-enforces `can_manage_program` for the owning
   * institution. This is the only offering write path — no legacy string
   * identifiers.
   */
  createOffering: async (institutionId: string, data: CreateOfferingPayload) => {
    const endpoint = '/catalog/programs/'
    try {
      return await apiClient.request<TenantOffering>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ ...data, institution_id: institutionId }),
      })
    } catch (error) {
      logApiError('admin-tenants', endpoint, error)
      throw error
    }
  },

  /**
   * Link a tenant offering to a global Intake, creating an Intake_Offering with
   * an optional seat capacity (R4.2, R7.3, TEN-03). Posts to
   * `POST /api/v1/admin/program-intakes/` (platform.intake.manage). A duplicate
   * `(program_id, intake_id)` pair returns `ALREADY_LINKED` (409).
   */
  createProgramIntake: async (data: CreateProgramIntakePayload) => {
    const endpoint = '/admin/program-intakes/'
    try {
      return await apiClient.request<TenantProgramIntake>(endpoint, {
        method: 'POST',
        body: JSON.stringify(data),
      })
    } catch (error) {
      logApiError('admin-tenants', endpoint, error)
      throw error
    }
  },

  /** List the canonical fees configured for an offering (R7.3, R7.4). */
  listProgramFees: async (programId: string) => {
    const endpoint = `/programs/${encodeURIComponent(programId)}/fees/`
    try {
      const response = await apiClient.request<RawList<TenantProgramFee>>(endpoint)
      return listResult(response).items
    } catch (error) {
      logApiError('admin-tenants', endpoint, error)
      throw error
    }
  },

  /**
   * Create a canonical application/tuition fee for an offering (R7.3, R7.4).
   * Posts to `POST /api/v1/programs/{id}/fees/` (super-admin). A duplicate
   * active `(fee_type, residency)` returns `DUPLICATE_ACTIVE_FEE` (409).
   */
  createProgramFee: async (programId: string, data: TenantProgramFeePayload) => {
    const endpoint = `/programs/${encodeURIComponent(programId)}/fees/`
    try {
      return await apiClient.request<TenantProgramFee>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ currency: 'ZMW', ...data }),
      })
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
          host: optionalString(input.host),
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
