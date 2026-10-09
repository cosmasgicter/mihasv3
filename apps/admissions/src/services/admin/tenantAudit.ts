/**
 * The selected tenant's audit feed (Admissions V2, task 9.5).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.5 — "Correct tenant
 * audit and amendment notification scope".
 * Requirements: **R3** (backend authority; an out-of-scope id is a masked 404),
 * **R6.6** (the tenant audit list *and export* use the selected institution
 * endpoint, require `tenant.audit.read`, paginate, and never leak another
 * tenant's events).
 * Findings: **ADM-05**.
 *
 * Why this module exists rather than another call to `adminAuditService`
 * ---------------------------------------------------------------------
 *
 * The tenant console's audit panel called `/admin/audit-logs/` — a **generic**
 * feed — and never sent the institution it was rendering. Two different questions
 * were being conflated:
 *
 * - `/admin/audit-logs/` answers *"what did people I share a school with do"*
 *   (it narrows a non-super-admin by **actor**). Legitimate for the platform-wide
 *   audit trail page, wrong for a school panel: a Platform_Admin's change to your
 *   school is missing, and a colleague's change to a school you are not in is not.
 * - `/admin/institutions/{id}/audit/` answers *"what happened to this school"*
 *   (it matches the institution the event records). That is what a panel titled
 *   "Configuration audit" for the selected tenant must show.
 *
 * This module speaks only to the second. It sends filters and paging and returns
 * what the server said: it derives no total, computes no breakdown, and
 * categorises nothing — the category, the facets and the definitions all come
 * from the backend's own action vocabulary.
 */
import { logApiError } from '@/lib/apiErrorLogger'
import { apiClient, buildQueryString } from '../client'
import { settlementAdminService } from './settlement'

/** The backend's category vocabulary (`tenant_audit_query_service.CATEGORIES`). */
export const TENANT_AUDIT_CATEGORIES = [
  'configuration',
  'authorization',
  'review',
  'document',
  'payment',
  'export',
  'communication',
  'other',
] as const

export type TenantAuditCategory = (typeof TENANT_AUDIT_CATEGORIES)[number]

/** One audit event, exactly as the server publishes it. */
export interface TenantAuditEvent {
  id: string
  created_at: string | null
  action: string
  /** Server-assigned, from the platform's action vocabulary — never regexed here. */
  category: TenantAuditCategory
  entity_type: string
  entity_id: string | null
  actor_id: string | null
  institution_id: string | null
  retention_category: string
  /** Redacted at write time by the platform's one audit redactor. */
  changes: Record<string, unknown> | null
}

export interface TenantAuditFacets {
  event_count: number
  actor_count: number
  by_action: Array<{ action: string; event_count: number }>
  by_category: Array<{ category: TenantAuditCategory; event_count: number }>
  row_limit: number
}

export interface TenantAuditFilters {
  action?: string
  category?: string
  entity_type?: string
  actor_id?: string
  date_from?: string
  date_to?: string
  search?: string
}

export interface TenantAuditReport {
  institution_id: string
  page: number
  pageSize: number
  totalCount: number
  /** Server-computed. The browser divides nothing on this report. */
  totalPages: number
  results: TenantAuditEvent[]
  facets: TenantAuditFacets
  filters: TenantAuditFilters
  categories: TenantAuditCategory[]
  definitions: Record<string, string>
  can_export: boolean
}

export interface TenantAuditQuery extends TenantAuditFilters {
  institutionId: string
  page?: number
  pageSize?: number
}

const EMPTY_FACETS: TenantAuditFacets = {
  event_count: 0,
  actor_count: 0,
  by_action: [],
  by_category: [],
  row_limit: 0,
}

export function tenantAuditEndpoint(institutionId: string): string {
  return `/admin/institutions/${encodeURIComponent(institutionId)}/audit/`
}

function auditParams(query: TenantAuditQuery) {
  return {
    action: query.action,
    category: query.category,
    entity_type: query.entity_type,
    actor_id: query.actor_id,
    date_from: query.date_from,
    date_to: query.date_to,
    search: query.search,
    page: query.page,
    pageSize: query.pageSize,
  }
}

function normalise(
  institutionId: string,
  payload: Partial<TenantAuditReport> | null | undefined,
): TenantAuditReport {
  return {
    institution_id: payload?.institution_id ?? institutionId,
    page: payload?.page ?? 1,
    pageSize: payload?.pageSize ?? 0,
    totalCount: payload?.totalCount ?? 0,
    totalPages: payload?.totalPages ?? 1,
    results: payload?.results ?? [],
    facets: payload?.facets ?? EMPTY_FACETS,
    filters: payload?.filters ?? {},
    categories: payload?.categories ?? [...TENANT_AUDIT_CATEGORIES],
    definitions: payload?.definitions ?? {},
    // Fail closed: absent authority is no authority, so the export control stays
    // hidden until the server says otherwise.
    can_export: payload?.can_export ?? false,
  }
}

export const tenantAuditService = {
  /**
   * This school's audit events.
   *
   * `institutionId` is part of the **path**, not a hint: the backend resolves it
   * against the actor's visible institutions before querying, so an out-of-scope
   * id is a masked 404 rather than a quietly empty list.
   */
  list: async (query: TenantAuditQuery): Promise<TenantAuditReport> => {
    const endpoint = `${tenantAuditEndpoint(query.institutionId)}${buildQueryString(auditParams(query))}`
    try {
      const response = await apiClient.request<Partial<TenantAuditReport>>(endpoint)
      return normalise(query.institutionId, response)
    } catch (error) {
      logApiError('admin-tenant-audit', endpoint, error)
      throw error
    }
  },

  /**
   * The CSV export path for the current filters.
   *
   * Page-independent by construction: the paging parameters are dropped, because
   * an export of "what I can currently see" is the defect R6.5 names. The server
   * enforces the export capability, the row ceiling, and the audit record.
   */
  exportPath: (query: TenantAuditQuery): string =>
    `${tenantAuditEndpoint(query.institutionId)}${buildQueryString({
      ...auditParams(query),
      page: undefined,
      pageSize: undefined,
      export: 'csv',
    })}`,

  /** Save the server-generated CSV. Reuses the one export download path (8.4). */
  download: (path: string, filename: string): Promise<void> =>
    settlementAdminService.downloadExport(path, filename),
}
