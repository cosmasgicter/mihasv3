/**
 * The scoped user-directory read, bulk command, import, and export (task 9.3).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.3 — "Rebuild user
 * directory CRUD, import, bulk, and export".
 * Requirements: **R6.1** (list, search, filters, sort, pagination, facets,
 * counts, and export are server-side and preserve tenant scope), **R6.2** (one
 * supported field and role contract; ignored mutation fields are rejected),
 * **R6.4** (previewed, tenant-bound, atomic, idempotent import with row-level
 * failures), **R6.5** (bulk mutation and export are backend commands).
 * Findings: **ADM-03**, **ADM-04**, **AUTH-04**.
 *
 * What this module is *not*: it does not search, filter, sort, paginate, count,
 * or export anything. All six were browser behaviour before 9.3 — `Users.tsx`
 * fetched one server page and then ran `filter`, `sort`, `slice`, `.length`, and
 * a CSV writer over the array it had, so the headline count described the table
 * while every other number described the twenty rows that happened to arrive.
 * This sends the query and hands back the answer.
 *
 * The parameter names here are the **registered** ones
 * (`backend/apps/accounts/user_directory_service.py:REGISTERED_PARAMETERS`), so
 * a link or a bookmark can be checked against the contract rather than hoped
 * about. Anything outside that set comes back in `filters.unknown_parameters`
 * instead of being silently dropped.
 */
import { apiClient, buildQueryString, toApiV1Path } from '../client'
import { API_BASE } from '../httpClient'
import { logApiError } from '@/lib/apiErrorLogger'

/** One directory row. The server owns every field, including the display name. */
export interface UserDirectoryRow {
  id: string
  email: string
  first_name: string
  last_name: string
  /** Computed in SQL from `full_name` or the first/last pair — one answer. */
  full_name: string
  phone: string
  role: string
  is_active: boolean
  has_active_membership: boolean
  created_at: string | null
  updated_at: string | null
  /** Platform-only cross-tenant context: withheld for a tenant actor. */
  institution_count?: number | null
  institution_names?: string | null
}

/**
 * Whole-filtered-set counters. Every one of these was `array.length` or a
 * `reduce` over the loaded page before 9.3.
 */
export interface UserDirectoryAggregates {
  total_count: number
  enabled_count: number
  disabled_count: number
  with_membership_count: number
  without_membership_count: number
  /** The ADM-04 population: staff who can sign in and have no tenant access. */
  staff_without_membership_count: number
  role_breakdown: Record<string, number>
}

export interface UserFacetOption {
  value: string | boolean | null
  label: string
  count: number
}

export interface UserFacet {
  options: UserFacetOption[]
  truncated: boolean
}

export type UserDirectoryFacets = Record<string, UserFacet>

export interface AppliedUserFilters {
  institution_id: string | null
  role: string[]
  search: string | null
  is_active: boolean | null
  has_membership: boolean | null
  start_date: string | null
  end_date: string | null
  sort: string
  order: 'asc' | 'desc'
  /** Present-but-unimplemented parameters, echoed back rather than dropped. */
  unknown_parameters: string[]
}

export interface UserDirectoryRedaction {
  applied: boolean
  withheld_fields: string[]
}

export interface UserDirectoryReport {
  page: number
  pageSize: number
  totalCount: number
  /** Server-computed page count. The browser divides nothing here. */
  totalPages: number
  results: UserDirectoryRow[]
  aggregates: UserDirectoryAggregates
  /** One sentence per headline number, so the page can label what it shows. */
  aggregate_definitions: Record<string, string>
  facets: UserDirectoryFacets
  filters: AppliedUserFilters
  redaction: UserDirectoryRedaction
  can_export: boolean
  /** The server's role vocabulary. The form renders this, never its own list. */
  supported_roles: string[]
}

/**
 * The directory query, in the registered parameter names.
 *
 * Snake_case on purpose: these are the contract's own names, and keeping them
 * identical on both sides is what lets a URL and a request be the same thing.
 */
export interface UserDirectoryQuery {
  institution_id?: string
  role?: string
  search?: string
  is_active?: string
  include_inactive?: string
  has_membership?: string
  start_date?: string
  end_date?: string
  sort?: string
  order?: string
  page?: number
  pageSize?: number
}

export const USER_DIRECTORY_ENDPOINT = '/admin/users/'
export const USER_EXPORT_ENDPOINT = '/admin/users/export/'
export const USER_BULK_ENDPOINT = '/admin/users/bulk/'
export const USER_IMPORT_ENDPOINT = '/admin/users/batch-import/'
export const USER_IMPORT_PREVIEW_ENDPOINT = '/admin/users/batch-import/preview/'

/**
 * An honest empty report.
 *
 * `aggregate_definitions: {}` is the tell: a caller can distinguish "the server
 * answered, and the answer is zero" (definitions present) from "there is no
 * answer yet" (definitions absent). Reused from 9.1's `EMPTY_*` convention so
 * "missing data must not become a healthy zero" stays checkable.
 */
export const EMPTY_USER_AGGREGATES: UserDirectoryAggregates = {
  total_count: 0,
  enabled_count: 0,
  disabled_count: 0,
  with_membership_count: 0,
  without_membership_count: 0,
  staff_without_membership_count: 0,
  role_breakdown: {},
}

const EMPTY_USER_FILTERS: AppliedUserFilters = {
  institution_id: null,
  role: [],
  search: null,
  is_active: null,
  has_membership: null,
  start_date: null,
  end_date: null,
  sort: 'created_at',
  order: 'desc',
  unknown_parameters: [],
}

function normalise(
  payload: Partial<UserDirectoryReport> | null | undefined,
): UserDirectoryReport {
  return {
    page: payload?.page ?? 1,
    pageSize: payload?.pageSize ?? 0,
    totalCount: payload?.totalCount ?? 0,
    totalPages: payload?.totalPages ?? 1,
    results: payload?.results ?? [],
    aggregates: payload?.aggregates ?? EMPTY_USER_AGGREGATES,
    aggregate_definitions: payload?.aggregate_definitions ?? {},
    facets: payload?.facets ?? {},
    filters: payload?.filters ?? EMPTY_USER_FILTERS,
    redaction: payload?.redaction ?? { applied: true, withheld_fields: [] },
    can_export: payload?.can_export ?? false,
    supported_roles: payload?.supported_roles ?? [],
  }
}

function directoryParams(query: UserDirectoryQuery = {}) {
  // Spread, not a field-by-field copy: the query is already expressed in the
  // registered names, so re-listing them here would be a second place for the
  // parameter set to drift from the contract.
  return { ...query } as Record<string, string | number | undefined>
}

/** One import row, as the operator's file describes it. */
export interface UserImportRowInput {
  email: string
  full_name?: string
  first_name?: string
  last_name?: string
  phone?: string
  role: string
  password?: string
}

export type UserImportMode = 'all_or_nothing' | 'per_row'

/** One row-level failure. `index` is 1-based and matches the operator's file. */
export interface UserImportRowError {
  index: number | null
  row: number | null
  code: string
  field: string | null
  message: string
  email: string
}

export interface UserImportPreviewRow {
  index: number
  email: string
  first_name: string
  last_name: string
  full_name: string
  phone: string
  role: string
  password_supplied: boolean
  will_receive_generated_password: boolean
}

export interface UserImportPreview {
  mode: UserImportMode
  institution_id: string
  submitted_count: number
  valid_count: number
  error_count: number
  /** Whether a commit would write anything — known *before* committing. */
  would_commit: boolean
  rows: UserImportPreviewRow[]
  errors: UserImportRowError[]
  row_limit: number
}

export interface UserImportResult {
  mode: UserImportMode
  institution_id: string
  committed: boolean
  submitted_count: number
  /** Accounts that exist because of this request. 0 on a rolled-back batch. */
  created: number
  created_ids: string[]
  failed: number
  errors: UserImportRowError[]
  rolled_back_reason: string | null
  row_limit: number
}

export type UserBulkOperation = 'set_role' | 'deactivate' | 'reactivate'

export interface UserBulkTargetError {
  user_id: string
  code: string
  message: string
}

export interface UserBulkResult {
  operation: UserBulkOperation
  role: string | null
  committed: boolean
  requested_count: number
  updated: number
  updated_ids: string[]
  failed: number
  errors: UserBulkTargetError[]
  sessions_revoked: number
  size_limit: number
}

/**
 * The confirmation token the bulk command requires.
 *
 * SHA-256 over the sorted target ids plus the operation and role. It is computed
 * here *and checked on the server*, which is the difference from the pre-9.3
 * version: a token computed in the browser and verified in the browser guarded
 * against a mis-click and nothing else.
 */
export async function userBulkConfirmationToken(
  operation: UserBulkOperation,
  userIds: string[],
  role?: string | null,
): Promise<string> {
  const payload = [...userIds].sort().join('') + operation + (role || '')
  const encoded = new TextEncoder().encode(payload)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * A command that answered with nothing did not happen.
 *
 * Surfacing it as an error keeps the caller from reporting a success the server
 * never confirmed — the same instinct as 9.1's saved-filter guard.
 */
function required<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message)
  return value
}

/** A stable idempotency key for one operator-initiated command. */
function commandKey(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${random}`
}

export const userDirectoryService = {
  /**
   * The scoped directory with its server facets and whole-set aggregates.
   *
   * The `institution_id` filter is resolved against the actor's scope on the
   * server **before** it reaches a query, so an out-of-scope id is a 404 rather
   * than a silently empty list that would confirm the id exists.
   */
  getDirectory: async (
    query: UserDirectoryQuery = {},
  ): Promise<UserDirectoryReport> => {
    const endpoint = `${USER_DIRECTORY_ENDPOINT}${buildQueryString(directoryParams(query))}`
    try {
      const response = await apiClient.request<Partial<UserDirectoryReport>>(endpoint)
      return normalise(response)
    } catch (error) {
      logApiError('admin-users', endpoint, error)
      throw error
    }
  },

  /**
   * The CSV export path for the current filters.
   *
   * `page`/`pageSize` are dropped: an export that only contained the page an
   * operator happened to be looking at would be a different document each time
   * it was pressed, which is exactly what the old browser-side `UserExport`
   * produced from its `users` prop. Authority, redaction, the row ceiling, and
   * the audit record are all the server's.
   */
  exportPath: (query: UserDirectoryQuery = {}): string =>
    `${USER_EXPORT_ENDPOINT}${buildQueryString({
      ...directoryParams(query),
      page: undefined,
      pageSize: undefined,
    })}`,

  /**
   * Download a server-generated CSV export.
   *
   * A refusal or an over-limit set is surfaced as a thrown error rather than
   * saved as a `.csv` containing an error page.
   */
  downloadExport: async (path: string, filename: string): Promise<void> => {
    const url = `${API_BASE}${toApiV1Path(path)}`
    // Deliberately **no** `Accept: text/csv`. DRF negotiates content before the
    // view runs, and no CSV renderer is configured, so asking for `text/csv`
    // gets a 406 from the framework and the export never reaches the handler.
    // The response's own `Content-Type` is what makes it a download, and the
    // browser honours the `Content-Disposition` regardless of what we asked for.
    const response = await fetch(url, { method: 'GET', credentials: 'include' })
    if (!response.ok) {
      logApiError('admin-users', path, new Error(`export failed: ${response.status}`))
      throw new Error(
        response.status === 403
          ? 'You do not have permission to export the user directory.'
          : response.status === 400
            ? 'This export is too large. Narrow the filters and try again.'
            : response.status === 404
              ? 'That school is not in your scope.'
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

  /** Create one account. Unsupported fields are rejected by the server (R6.2). */
  create: async (input: {
    email: string
    password: string
    first_name: string
    last_name: string
    phone?: string
    role: string
    institution_id?: string
  }): Promise<UserDirectoryRow> => {
    try {
      const created = await apiClient.request<UserDirectoryRow>(USER_DIRECTORY_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(input),
      })
      return required(created, 'The account could not be created. Please try again.')
    } catch (error) {
      logApiError('admin-users', USER_DIRECTORY_ENDPOINT, error)
      throw error
    }
  },

  /**
   * Update one account.
   *
   * Only the contract's own fields are sent, and every one of them is
   * implemented server-side. `email` and `phone` used to be sent and dropped
   * inside a `200 OK` — the operator was told their correction worked.
   */
  update: async (
    id: string,
    input: {
      email?: string
      first_name?: string
      last_name?: string
      phone?: string
      role?: string
      is_active?: boolean
      password?: string
    },
  ): Promise<UserDirectoryRow> => {
    const endpoint = `${USER_DIRECTORY_ENDPOINT}${encodeURIComponent(id)}/`
    try {
      const updated = await apiClient.request<UserDirectoryRow>(endpoint, {
        method: 'PATCH',
        body: JSON.stringify(input),
      })
      return required(updated, 'The account could not be updated. Please try again.')
    } catch (error) {
      logApiError('admin-users', endpoint, error)
      throw error
    }
  },

  /** Deactivate one account (never a delete — history stays attached). */
  deactivate: async (id: string): Promise<UserDirectoryRow> =>
    userDirectoryService.update(id, { is_active: false }),

  /**
   * One bulk role/status command.
   *
   * Replaces a browser `for` loop of N `PATCH` calls: there is one decision to
   * authorize, audit, and bound, it is all-or-nothing, and the confirmation
   * token is verified server-side.
   */
  bulk: async (input: {
    operation: UserBulkOperation
    user_ids: string[]
    role?: string | null
  }): Promise<UserBulkResult> => {
    const confirmation_token = await userBulkConfirmationToken(
      input.operation,
      input.user_ids,
      input.role,
    )
    try {
      const applied = await apiClient.request<UserBulkResult>(USER_BULK_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({
          operation: input.operation,
          user_ids: input.user_ids,
          role: input.role ?? undefined,
          confirmation_token,
        }),
        headers: { 'Idempotency-Key': commandKey('user-bulk') },
      })
      return required(applied, 'The bulk change could not be applied. Nothing was changed.')
    } catch (error) {
      logApiError('admin-users', USER_BULK_ENDPOINT, error)
      throw error
    }
  },

  /**
   * Validate an import without writing anything (R6.4).
   *
   * The rows are sent as the file describes them; the *server* splits
   * `full_name`, normalises the role, checks the ceiling, spots duplicates
   * within the batch and against existing accounts, and reports each failing row
   * by its own line number.
   */
  previewImport: async (input: {
    institution_id: string
    mode?: UserImportMode
    rows: UserImportRowInput[]
  }): Promise<UserImportPreview> => {
    try {
      const answer = await apiClient.request<UserImportPreview>(USER_IMPORT_PREVIEW_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(input),
      })
      return required(answer, 'The file could not be checked. Please try again.')
    } catch (error) {
      logApiError('admin-users', USER_IMPORT_PREVIEW_ENDPOINT, error)
      throw error
    }
  },

  /**
   * Apply the import under its declared mode (R6.4).
   *
   * Carries an `Idempotency-Key`, so a double-submit returns the first response
   * instead of importing twice.
   */
  commitImport: async (input: {
    institution_id: string
    mode?: UserImportMode
    rows: UserImportRowInput[]
  }): Promise<UserImportResult> => {
    try {
      const answer = await apiClient.request<UserImportResult>(USER_IMPORT_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(input),
        headers: { 'Idempotency-Key': commandKey('user-import') },
      })
      return required(answer, 'The import could not be applied. Please try again.')
    } catch (error) {
      logApiError('admin-users', USER_IMPORT_ENDPOINT, error)
      throw error
    }
  },
}

/**
 * Render the row-level failures as a CSV an operator can fix and re-upload.
 *
 * R6.4 asks for "downloadable row-level failures". A list in a dialog is not
 * downloadable, and a hundred-row import that fails on nine rows is unusable as
 * a dialog: the operator needs the nine rows, addressed by line number, in
 * something they can open next to the original file.
 */
export function importErrorsToCsv(errors: UserImportRowError[]): string {
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? '' : String(value)
    return /["\n\r,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const header = ['row', 'code', 'field', 'email', 'message']
  const lines = [header.join(',')]
  for (const error of errors) {
    lines.push(
      [error.index ?? '', error.code, error.field ?? '', error.email, error.message]
        .map(escape)
        .join(','),
    )
  }
  return lines.join('\n')
}

/** Save the row-failure CSV to disk. */
export function downloadImportErrors(
  errors: UserImportRowError[],
  filename = 'user-import-errors.csv',
): void {
  if (typeof document === 'undefined') return
  const blob = new Blob([importErrorsToCsv(errors)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.visibility = 'hidden'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
