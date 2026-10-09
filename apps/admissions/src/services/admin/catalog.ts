/**
 * Strict canonical catalog admin service (Admissions V2, task 5.1).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 5.1
 * Requirements: R7.1-R7.5, R14.7 · Findings: TEN-03, DATA-01, API-02.
 *
 * This is the single domain service the admin catalog pages (Programs, Intakes,
 * Program Fees) consume to write the catalog through the **canonical** graph:
 *
 *   Canonical_Program -> Program_Offering -> Intake_Offering
 *                                         -> FeeSchedule
 *                                         -> RequirementProfile
 *
 * It deliberately does NOT introduce a second transport client: it composes the
 * already-shipped canonical methods on `tenantAdminService` (task 4.3 —
 * `createOffering`, `createProgramIntake`, `listProgramFees`, `createProgramFee`,
 * `listOfferings`, required-documents, institutions) and adds only the catalog
 * writes that were still missing a canonical frontend caller:
 *
 *   - Canonical_Program listing (the offering selector source).
 *   - Program_Offering update / deactivate (canonical `apply_program_offering_change`
 *     via `PATCH /api/v1/admin/institutions/{id}/programs/{id}/`).
 *   - FeeSchedule update / deactivate (`PUT`/`DELETE /api/v1/programs/{id}/fees/{id}/`).
 *   - Global intake-period CRUD via the canonical `/api/v1/admin/intakes/` home
 *     (task 5.1 backend), replacing the frozen legacy `/api/v1/catalog/intakes/`
 *     writes.
 *   - Institution (tenant) deactivate via `PATCH /admin/institutions/{id}/`.
 *
 * The retired legacy write path (`programService`/`intakeService`/
 * `institutionService` in `@/services/catalog`, and the raw fee client in
 * `ProgramFees.tsx`) accepted display strings as identifiers and created bare
 * programs with no canonical link (TEN-03/DATA-01). Every write here is keyed by
 * canonical UUIDs; the backend derives tenant/snapshots/fee/requirements.
 */

import { apiClient, buildQueryString, type QueryParams } from '../client'
import { logApiError } from '@/lib/apiErrorLogger'
import {
  tenantAdminService,
  type CreateOfferingPayload,
  type CreateProgramIntakePayload,
  type TenantInstitution,
  type TenantOffering,
  type TenantProgramFee,
  type TenantProgramFeePayload,
  type TenantProgramIntake,
  type TenantRequiredDocument,
  type TenantRequiredDocumentPayload,
} from './tenants'

// Re-export the shared canonical shapes so catalog pages import them from the
// catalog domain service rather than reaching into the tenant service.
export type {
  CreateOfferingPayload,
  CreateProgramIntakePayload,
  TenantInstitution,
  TenantOffering,
  TenantProgramFee,
  TenantProgramFeePayload,
  TenantProgramIntake,
  TenantRequiredDocument,
  TenantRequiredDocumentPayload,
}

type RawList<T> =
  | T[]
  | {
      results?: T[]
      programs?: T[]
      data?: T[] | { results?: T[]; programs?: T[] }
      totalCount?: number
      count?: number
    }
  | null
  | undefined

/** A global Beanola Canonical_Program definition (offering selector source, R7.1). */
export interface CanonicalProgramOption {
  id: string
  name: string
  code: string
  description?: string | null
  duration_months?: number | null
  regulatory_body?: string | null
  is_active?: boolean
}

/** A global intake period (Jan/Jul calendar record) — platform-managed (R7.3). */
export interface CatalogIntake {
  id: string
  name: string
  year: number
  semester?: string | null
  start_date?: string | null
  end_date?: string | null
  application_start_date?: string | null
  application_deadline?: string | null
  max_capacity?: number | null
  current_enrollment?: number | null
  is_active?: boolean
}

export interface CatalogIntakePayload {
  name: string
  year: number
  semester?: string
  start_date?: string
  end_date?: string
  application_start_date?: string
  application_deadline: string
  max_capacity: number
}

/** A program offering as surfaced in the global (super-admin) catalog list. */
export interface CatalogOffering {
  id: string
  name: string
  code?: string
  institution_id?: string | null
  canonical_program_id?: string | null
  duration_months?: number | null
  offering_status?: string | null
  assignment_priority?: number | null
  application_fee?: number | string | null
  is_active?: boolean
  institution?: { id: string; name: string; full_name?: string | null; code?: string | null } | null
}

/** Partial offering update payload — canonical fields only (no display-string ids). */
export interface UpdateOfferingPayload {
  name?: string
  code?: string
  canonical_program_id?: string
  duration_months?: number
  offering_status?: string
  assignment_priority?: number
  application_fee?: number | string
  tuition_fee?: number | string
  regulatory_body?: string
  accreditation_status?: string
  requirements?: Record<string, unknown>
  is_active?: boolean
}

/**
 * Read the item list out of an admin catalog list response.
 *
 * Task 12.2 (R14.5, finding API-02) deleted four of this function's six
 * branches. What is left is the two shapes the endpoints it reads actually
 * emit — `{page, pageSize, totalCount, results}` from `StandardPagination`, and
 * a bare array from the un-paginated branch the catalog views still carry.
 *
 * Deleted, with the reason each was unreachable:
 *
 * - `.programs` — a domain-keyed list. No catalog endpoint puts one inside
 *   `data`; `services/catalog.ts` invented that key on the way *out* and this
 *   copy sniffed for it on the way *in*.
 * - `.data`, `.data.results`, `.data.programs` — a **second** envelope.
 *   `apiClient.request` already unwrapped exactly one `{success, data}` level
 *   (`httpClient.unwrapApiResponse`), so reaching `response.data.results` means
 *   the server sent `{success, data: {data: {results}}}`, which nothing does.
 *   This is the branch that makes a permissive normalizer dangerous rather than
 *   merely dead: had the envelope ever regressed to double-wrapped, the page
 *   would have kept working and the drift would have been invisible — the exact
 *   thing R14's "compatibility normalizers cannot hide drift" is about.
 *
 * Zero first-party callers, measured by `scripts/v1_surface_telemetry.py`
 * (surface `normalizer.admin_catalog.listFrom`). Note that this file and
 * `admin/tenants.ts` held the SAME sniff in two copies; both are now the one
 * shape, and `moneyAdminServerOwned`-style tests pin the paged reads.
 */
function listFrom<T>(response: RawList<T>): T[] {
  if (Array.isArray(response)) return response
  if (!response || typeof response !== 'object') return []
  if (Array.isArray(response.results)) return response.results
  return []
}

export const catalogAdminService = {
  // ── Canonical programs (offering selector source, R7.1) ──────────────────
  /** List the global canonical program catalogue used to assign offerings. */
  listCanonicalPrograms: async (): Promise<CanonicalProgramOption[]> => {
    const endpoint = '/catalog/canonical-programs/'
    try {
      const response = await apiClient.request<RawList<CanonicalProgramOption>>(endpoint)
      return listFrom(response)
    } catch (error) {
      logApiError('admin-catalog', endpoint, error)
      throw error
    }
  },

  // ── Program offerings (Institution_Program_Offering) ─────────────────────
  /** Global super-admin offering listing (read; GET /catalog/programs/ admin mode). */
  listCatalogOfferings: async (params?: QueryParams): Promise<CatalogOffering[]> => {
    const endpoint = `/catalog/programs/${buildQueryString(params ?? { pageSize: 500 })}`
    try {
      const response = await apiClient.request<RawList<CatalogOffering>>(endpoint)
      return listFrom(response)
    } catch (error) {
      logApiError('admin-catalog', endpoint, error)
      throw error
    }
  },

  /** Tenant-scoped offering listing (GET /admin/institutions/{id}/programs/). */
  listOfferings: (institutionId: string) => tenantAdminService.listOfferings(institutionId),

  /**
   * Assign a Canonical_Program to a tenant, creating an offering (R7.1, TEN-03).
   * The ONLY offering-create path — POST /catalog/programs/ with
   * `canonical_program_id`; the backend rejects a write without it
   * (`CANONICAL_PROGRAM_REQUIRED`).
   */
  createOffering: (institutionId: string, data: CreateOfferingPayload) =>
    tenantAdminService.createOffering(institutionId, data),

  /**
   * Update an offering through the canonical command
   * (PATCH /admin/institutions/{id}/programs/{id}/ -> apply_program_offering_change).
   */
  updateOffering: async (
    institutionId: string,
    offeringId: string,
    data: UpdateOfferingPayload,
  ): Promise<TenantOffering | null> => {
    const endpoint = `/admin/institutions/${encodeURIComponent(institutionId)}/programs/${encodeURIComponent(offeringId)}/`
    try {
      return await apiClient.request<TenantOffering>(endpoint, {
        method: 'PATCH',
        body: JSON.stringify(data),
      })
    } catch (error) {
      logApiError('admin-catalog', endpoint, error)
      throw error
    }
  },

  /** Deactivate an offering (canonical PATCH is_active=false). */
  deactivateOffering: async (institutionId: string, offeringId: string): Promise<TenantOffering | null> =>
    catalogAdminService.updateOffering(institutionId, offeringId, { is_active: false }),

  // ── Intake offerings (ProgramIntake) ─────────────────────────────────────
  /** Link an offering to a global intake with optional capacity (POST /admin/program-intakes/). */
  createProgramIntake: (data: CreateProgramIntakePayload) =>
    tenantAdminService.createProgramIntake(data),

  // ── Global intake periods (canonical /admin/intakes/ home, R7.3) ─────────
  listIntakes: async (): Promise<CatalogIntake[]> => {
    const endpoint = '/admin/intakes/'
    try {
      const response = await apiClient.request<RawList<CatalogIntake>>(endpoint)
      return listFrom(response)
    } catch (error) {
      logApiError('admin-catalog', endpoint, error)
      throw error
    }
  },

  createIntake: async (data: CatalogIntakePayload): Promise<CatalogIntake | null> => {
    const endpoint = '/admin/intakes/'
    try {
      return await apiClient.request<CatalogIntake>(endpoint, {
        method: 'POST',
        body: JSON.stringify(data),
      })
    } catch (error) {
      logApiError('admin-catalog', endpoint, error)
      throw error
    }
  },

  updateIntake: async (id: string, data: Partial<CatalogIntakePayload>): Promise<CatalogIntake | null> => {
    const endpoint = `/admin/intakes/${encodeURIComponent(id)}/`
    try {
      return await apiClient.request<CatalogIntake>(endpoint, {
        method: 'PATCH',
        body: JSON.stringify(data),
      })
    } catch (error) {
      logApiError('admin-catalog', endpoint, error)
      throw error
    }
  },

  deactivateIntake: async (id: string): Promise<void> => {
    const endpoint = `/admin/intakes/${encodeURIComponent(id)}/`
    try {
      await apiClient.request<void>(endpoint, { method: 'DELETE' })
    } catch (error) {
      logApiError('admin-catalog', endpoint, error)
      throw error
    }
  },

  // ── Fee schedules (per offering, R7.4) ───────────────────────────────────
  listFees: (offeringId: string) => tenantAdminService.listProgramFees(offeringId),

  createFee: (offeringId: string, data: TenantProgramFeePayload) =>
    tenantAdminService.createProgramFee(offeringId, data),

  updateFee: async (
    offeringId: string,
    feeId: string,
    data: TenantProgramFeePayload,
  ): Promise<TenantProgramFee | null> => {
    const endpoint = `/programs/${encodeURIComponent(offeringId)}/fees/${encodeURIComponent(feeId)}/`
    try {
      return await apiClient.request<TenantProgramFee>(endpoint, {
        method: 'PUT',
        body: JSON.stringify({ currency: 'ZMW', ...data }),
      })
    } catch (error) {
      logApiError('admin-catalog', endpoint, error)
      throw error
    }
  },

  deactivateFee: async (offeringId: string, feeId: string): Promise<void> => {
    const endpoint = `/programs/${encodeURIComponent(offeringId)}/fees/${encodeURIComponent(feeId)}/`
    try {
      await apiClient.request<void>(endpoint, { method: 'DELETE' })
    } catch (error) {
      logApiError('admin-catalog', endpoint, error)
      throw error
    }
  },

  // ── Requirement profiles (Offering_Requirement, R7.2) ────────────────────
  listRequiredDocuments: (institutionId: string) =>
    tenantAdminService.listRequiredDocuments(institutionId),
  createRequiredDocument: (institutionId: string, data: TenantRequiredDocumentPayload) =>
    tenantAdminService.createRequiredDocument(institutionId, data),
  updateRequiredDocument: (institutionId: string, documentId: string, data: Partial<TenantRequiredDocument>) =>
    tenantAdminService.updateRequiredDocument(institutionId, documentId, data),

  // ── Institutions (tenant) — Programs page tenant management ──────────────
  listInstitutions: (params?: { search?: string; active?: boolean }) =>
    tenantAdminService.listInstitutions(params),
  createInstitution: (data: Partial<TenantInstitution>) => tenantAdminService.createInstitution(data),
  updateInstitution: (id: string, data: Partial<TenantInstitution>) =>
    tenantAdminService.updateInstitution(id, data),
  deactivateInstitution: (id: string) => tenantAdminService.updateInstitution(id, { is_active: false }),
}

export type CatalogAdminService = typeof catalogAdminService
