/**
 * Settlement and fee-administration reads (Admissions V2, task 8.4).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 8.4
 * Requirements: R3 (backend authority), R6.5 (server-side filters, pagination,
 * export), R8.3-R8.4, R12.5-R12.7 (server is the money authority).
 * Findings: **ADM-06** (settlement rows fetched broadly and filtered
 * client-side), **AUTH-02** (fee/settlement authority was role-based).
 *
 * Both reports are **server-owned**: the filters, the page, the aggregates, the
 * reconciliation state, and the export are all decisions the backend makes. This
 * module sends the filters and hands back what the server said — it derives no
 * total, formats no money, and filters nothing after the fact. That is the whole
 * point of the finding: the tenant console used to fetch every settlement row it
 * could reach, drop other schools' rows in the browser, and add up the currency
 * totals itself.
 */
import { apiClient, buildQueryString, toApiV1Path } from '../client'
import { API_BASE } from '../httpClient'
import { logApiError } from '@/lib/apiErrorLogger'

/** One settlement group: institution × offering × currency. */
export interface SettlementRow {
  institution_id: string | null
  institution_name: string
  program_offering_id: string | null
  program_name: string
  currency: string
  payment_count: number
  /** Server-authored decimal string. Never parsed into a float here. */
  gross_amount: string
  settled_count: number
  settled_amount: string
  pending_count: number
  stale_pending_count: number
  failed_count: number
  expired_count: number
  deferred_count: number
  reconciliation_state: ReconciliationState
  first_payment_at: string | null
  last_payment_at: string | null
  /** Platform-only: withheld for a tenant actor (R6.5 redaction). */
  collector?: string
  /** Platform-only: withheld for a tenant actor (R6.5 redaction). */
  quarantined_count?: number
}

export type ReconciliationState =
  | 'attention_required'
  | 'in_flight'
  | 'uncollected'
  | 'settled'
  | 'no_activity'

export interface SettlementCurrencyTotal {
  currency: string
  payment_count: number
  gross_amount: string
  settled_amount: string
}

export interface SettlementAggregates {
  payment_count: number
  settled_count: number
  pending_count: number
  stale_pending_count: number
  failed_count: number
  expired_count: number
  deferred_count: number
  institution_count: number
  offering_count: number
  totals_by_currency: SettlementCurrencyTotal[]
  reconciliation_state: ReconciliationState
  reconciliation_stale_hours: number
  row_limit: number
}

export interface RedactionInfo {
  applied: boolean
  withheld_fields: string[]
}

export interface PagedReport<TRow, TAggregates> {
  page: number
  pageSize: number
  totalCount: number
  /** Server-computed page count — the browser divides nothing on this report. */
  totalPages: number
  results: TRow[]
  aggregates: TAggregates
  redaction: RedactionInfo
  can_export: boolean
}

export interface SettlementQuery {
  institutionId?: string
  programOfferingId?: string
  currency?: string
  status?: string
  reconciliation?: string
  search?: string
  startDate?: string
  endDate?: string
  page?: number
  pageSize?: number
}

/** One fee schedule row for the scoped fee-administration report. */
export interface FeeAdminRow {
  id: string
  institution_id: string | null
  institution_name: string
  program_offering_id: string | null
  program_offering_code: string | null
  program_name: string
  fee_type: string
  residency_category: string
  /** Server-authored decimal string. Never parsed into a float here. */
  amount: string | null
  currency: string
  is_active: boolean
  created_at: string | null
  updated_at: string | null
  /** Platform-only cross-tenant context: withheld for a tenant actor. */
  peer_offering_count?: number | null
}

export interface FeeAdminAggregates {
  fee_count: number
  active_count: number
  inactive_count: number
  configured_offering_count: number
  offerings_in_scope: number
  unconfigured_offering_count: number
  institution_count: number
  by_currency: Array<{
    currency: string
    fee_count: number
    min_amount: string | null
    max_amount: string | null
  }>
  by_fee_type: Array<{ fee_type: string; fee_count: number }>
  by_residency: Array<{ residency_category: string; fee_count: number }>
  first_created_at: string | null
  last_updated_at: string | null
  row_limit: number
}

export interface FeeAdminQuery {
  institutionId?: string
  programOfferingId?: string
  feeType?: string
  residencyCategory?: string
  currency?: string
  isActive?: boolean
  search?: string
  page?: number
  pageSize?: number
}

const EMPTY_REDACTION: RedactionInfo = { applied: true, withheld_fields: [] }

const EMPTY_SETTLEMENT_AGGREGATES: SettlementAggregates = {
  payment_count: 0,
  settled_count: 0,
  pending_count: 0,
  stale_pending_count: 0,
  failed_count: 0,
  expired_count: 0,
  deferred_count: 0,
  institution_count: 0,
  offering_count: 0,
  totals_by_currency: [],
  reconciliation_state: 'no_activity',
  reconciliation_stale_hours: 0,
  row_limit: 0,
}

const EMPTY_FEE_AGGREGATES: FeeAdminAggregates = {
  fee_count: 0,
  active_count: 0,
  inactive_count: 0,
  configured_offering_count: 0,
  offerings_in_scope: 0,
  unconfigured_offering_count: 0,
  institution_count: 0,
  by_currency: [],
  by_fee_type: [],
  by_residency: [],
  first_created_at: null,
  last_updated_at: null,
  row_limit: 0,
}

function normalise<TRow, TAggregates>(
  payload: Partial<PagedReport<TRow, TAggregates>> | null | undefined,
  emptyAggregates: TAggregates,
): PagedReport<TRow, TAggregates> {
  return {
    page: payload?.page ?? 1,
    pageSize: payload?.pageSize ?? 0,
    totalCount: payload?.totalCount ?? 0,
    totalPages: payload?.totalPages ?? 1,
    results: payload?.results ?? [],
    aggregates: payload?.aggregates ?? emptyAggregates,
    redaction: payload?.redaction ?? EMPTY_REDACTION,
    can_export: payload?.can_export ?? false,
  }
}

export const SETTLEMENT_ENDPOINT = '/payments/settlements/'
export const FEE_ADMIN_ENDPOINT = '/admin/fees/'

function settlementParams(query: SettlementQuery = {}) {
  return {
    institution_id: query.institutionId,
    program_offering_id: query.programOfferingId,
    currency: query.currency,
    status: query.status,
    reconciliation: query.reconciliation,
    search: query.search,
    start_date: query.startDate,
    end_date: query.endDate,
    page: query.page,
    pageSize: query.pageSize,
  }
}

function feeParams(query: FeeAdminQuery = {}) {
  return {
    institution_id: query.institutionId,
    program_offering_id: query.programOfferingId,
    fee_type: query.feeType,
    residency_category: query.residencyCategory,
    currency: query.currency,
    is_active: query.isActive === undefined ? undefined : String(query.isActive),
    search: query.search,
    page: query.page,
    pageSize: query.pageSize,
  }
}

export const settlementAdminService = {
  /**
   * The scoped settlement report for one institution (or the whole platform for
   * a Super_Admin). `institutionId` is a **server** filter: the backend resolves
   * it against the actor's scope before querying, so an out-of-scope id is a 404
   * rather than a silently empty list.
   */
  getSettlementReport: async (
    query: SettlementQuery = {},
  ): Promise<PagedReport<SettlementRow, SettlementAggregates>> => {
    const endpoint = `${SETTLEMENT_ENDPOINT}${buildQueryString(settlementParams(query))}`
    try {
      const response =
        await apiClient.request<Partial<PagedReport<SettlementRow, SettlementAggregates>>>(endpoint)
      return normalise<SettlementRow, SettlementAggregates>(response, EMPTY_SETTLEMENT_AGGREGATES)
    } catch (error) {
      logApiError('admin-settlement', endpoint, error)
      throw error
    }
  },

  /**
   * The CSV export URL for the current filters.
   *
   * The export is a backend command: it covers the whole filtered set regardless
   * of the page being viewed, requires the tenant export capability, redacts by
   * capability, and is audited server-side. The browser only follows the link.
   */
  settlementExportPath: (query: SettlementQuery = {}): string =>
    `${SETTLEMENT_ENDPOINT}${buildQueryString({ ...settlementParams(query), page: undefined, pageSize: undefined, export: 'csv' })}`,

  /** The scoped fee-administration report (filters, page, and aggregates server-side). */
  getFeeReport: async (
    query: FeeAdminQuery = {},
  ): Promise<PagedReport<FeeAdminRow, FeeAdminAggregates>> => {
    const endpoint = `${FEE_ADMIN_ENDPOINT}${buildQueryString(feeParams(query))}`
    try {
      const response =
        await apiClient.request<Partial<PagedReport<FeeAdminRow, FeeAdminAggregates>>>(endpoint)
      return normalise<FeeAdminRow, FeeAdminAggregates>(response, EMPTY_FEE_AGGREGATES)
    } catch (error) {
      logApiError('admin-settlement', endpoint, error)
      throw error
    }
  },

  /** The fee-administration CSV export URL for the current filters. */
  feeExportPath: (query: FeeAdminQuery = {}): string =>
    `${FEE_ADMIN_ENDPOINT}${buildQueryString({ ...feeParams(query), page: undefined, pageSize: undefined, export: 'csv' })}`,

  /**
   * Download a server-generated CSV export.
   *
   * The file is authored, filtered, redacted, bounded, and audited by the
   * backend; this only carries the session cookie and saves what comes back. A
   * refusal (no export capability) or an over-limit set is surfaced as a thrown
   * error so the caller can show the server's own message rather than saving an
   * error page as a `.csv`.
   */
  downloadExport: async (path: string, filename: string): Promise<void> => {
    const url = `${API_BASE}${toApiV1Path(path)}`
    // Deliberately **no** `Accept: text/csv`. DRF negotiates content *before* the
    // view runs and no CSV renderer is configured, so asking for `text/csv` gets a
    // 406 from the framework and the export never reaches the handler. The
    // response's own `Content-Type` is what makes it a download, and the browser
    // honours `Content-Disposition` regardless of what was asked for. Task 9.3
    // recorded this for the user-directory export; task 9.5's browser run found
    // the same header still here, where no journey had exercised it.
    const response = await fetch(url, { method: 'GET', credentials: 'include' })
    if (!response.ok) {
      logApiError('admin-settlement', path, new Error(`export failed: ${response.status}`))
      throw new Error(
        response.status === 403
          ? 'You do not have permission to export this report.'
          : response.status === 400
            ? 'This export is too large. Narrow the filters and try again.'
            : 'The export could not be generated. Please try again.',
      )
    }
    const blob = await response.blob()
    if (typeof document === 'undefined') return
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(objectUrl)
  },
}
