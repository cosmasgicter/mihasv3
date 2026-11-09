import type { Application, ApplicationInterview } from '@/types/database'

import { logApiError } from '@/lib/apiErrorLogger'
import { importWithChunkRecovery } from '@/lib/lazyImportRecovery'
import { apiClient, buildQueryString, type ApiRequestOptions, type QueryParams } from './client'
import { notificationService } from './notifications'
import type { OfferConditionInput } from '@/types/statusCommand'

export interface PaginatedApplicationsResponse {
  applications: Application[]
  totalCount: number
  page: number
  pageSize: number
  stats?: Record<string, unknown>
}

/**
 * One admission condition as the server publishes it (task 10.2, R13.9).
 *
 * Everything a reader needs to render the condition is here, including the copy:
 * `state_definition` is the platform's own words for the state, `waiting_on` says
 * whose move it is, and `allowed_actions` says what *this* reader may do. The
 * browser adds no vocabulary of its own — a client-side status table is how the
 * notification settings drifted from the delivery path (STU-14), and a condition
 * is a deadline that can cost a place.
 */
export interface StudentConditionEvidence {
  id: string
  document_name: string
  version: number
  is_current: boolean
  lifecycle_state: string | null
  mime_type: string | null
  file_size: number | null
  uploaded_at: string | null
  superseded_at: string | null
}

export interface StudentConditionHistoryEntry {
  id: string
  event_type: string
  from_state: string | null
  to_state: string
  actor_role: string | null
  document_version: number | null
  comment: string | null
  reason: string | null
  condition_status: string | null
  created_at: string | null
}

export interface StudentCondition {
  id: string
  application_id: string
  description: string
  condition_type: string
  deadline: string | null
  days_remaining: number | null
  status: string
  state: string
  state_design_name: string
  waiting_on: 'student' | 'school' | 'nobody' | string
  state_definition: string
  met_at: string | null
  verified_by: string | null
  updated_at: string | null
  notes: string | null
  review_reason: string | null
  evidence: StudentConditionEvidence | null
  evidence_versions: number
  superseded_evidence: StudentConditionEvidence[]
  allowed_actions: string[]
  evidence_document_type: string
  history?: StudentConditionHistoryEntry[]
}

/**
 * The server-authored enrollment readiness contract (task 10.3, R13.2/R13.9,
 * finding STU-15). Declared next to `Application` — it is published *on* the
 * application row — and re-exported here so callers have one import for the
 * student application contract.
 */
export type {
  EnrollmentAllowedAction,
  EnrollmentBlocker,
  EnrollmentReadiness,
} from '@/types/database'

/** One of the student's own amendment requests (task 10.2, R13.9-R13.10). */
export interface StudentAmendment {
  id: string
  application_id: string
  field_name: string
  new_value: string
  status: string
  status_definition: string
  is_terminal: boolean
  requested_at: string | null
  reviewed_at: string | null
  /** Detail read only. */
  old_value?: string | null
  reason?: string | null
}

export interface StudentAmendmentPage {
  page: number
  pageSize: number
  totalCount: number
  results: StudentAmendment[]
}

/** A reviewer eligible to be assigned an application in its tenant (R8.2). */
export interface ReviewerCandidate {
  id: string
  email: string
  first_name: string
  last_name: string
  full_name: string
  role: string
}

type ApplicationIncludeOptions = {
  include?: string[]
}

type ApplicationPayload = object
type ApplicationListRequestOptions = Pick<ApiRequestOptions, 'timeout' | 'retries'>

export interface ApplicationDetailResponse {
  application: Application & { interview?: ApplicationInterview | null }
  documents?: unknown[]
  grades?: unknown[]
  statusHistory?: unknown[]
  interview?: ApplicationInterview | null
  [key: string]: unknown
}

type ScheduleInterviewPayload = {
  scheduledAt: string
  mode: ApplicationInterview['mode']
  location?: string
  notes?: string
}

type RescheduleInterviewPayload = {
  scheduledAt: string
  mode?: ApplicationInterview['mode']
  location?: string
  notes?: string
}

type CancelInterviewPayload = {
  notes?: string
}

/**
 * The applications-list payload as `apiClient.request` hands it over — one
 * `{success, data}` level already unwrapped.
 *
 * Task 12.2 (R14.5) removed `applications`, `count` and `limit` from this type
 * along with the branches that read them. The type is deliberately kept
 * permissive in *value* (`unknown` per key) and strict in *key set*: the
 * normalizer validates each value, and the key set is now the contract
 * `StandardPagination` actually publishes.
 */
export type BackendPaginatedApplications =
  | {
      results?: unknown
      totalCount?: unknown
      page?: unknown
      pageSize?: unknown
      stats?: Record<string, unknown>
      next?: string | null
    }
  | Application[]
  | null
  | undefined

type ApplicationSummaryResponse = {
  application?: Application
  documents_count?: number
  grades_count?: number
  status_history?: unknown[]
}

function normalizeStatusHistory(history?: unknown[]): unknown[] {
  if (!Array.isArray(history)) {
    return []
  }

  return history.map((item, index) => {
    if (!item || typeof item !== 'object') {
      return item
    }

    const row = item as Record<string, unknown>
    const status = row.status ?? row.new_status ?? 'unknown'
    return {
      id: row.id ?? `${String(status)}-${String(row.created_at ?? index)}`,
      ...row,
      status,
      changed_by: row.changed_by ?? row.changed_by_name ?? null,
      changed_by_profile: row.changed_by_profile ?? (
        row.changed_by_name
          ? { full_name: row.changed_by_name, email: '' }
          : undefined
      ),
    }
  })
}

function isApplicationRecord(value: unknown): value is Application {
  return Boolean(value && typeof value === 'object' && 'id' in (value as Record<string, unknown>))
}

function normalizeApplicationRecord(value: unknown): Application | null {
  if (isApplicationRecord(value)) {
    return value
  }

  if (value && typeof value === 'object' && 'application' in (value as Record<string, unknown>)) {
    const application = (value as { application?: unknown }).application
    return isApplicationRecord(application) ? application : null
  }

  return null
}

export function getApplicationActivityTime(application: Pick<Application, 'submitted_at' | 'updated_at' | 'created_at'>): number {
  const value = application.submitted_at || application.updated_at || application.created_at || ''
  const timestamp = value ? new Date(value).getTime() : 0
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function sortApplicationsByActivity<T extends Pick<Application, 'submitted_at' | 'updated_at' | 'created_at' | 'id'>>(
  applications: T[]
): T[] {
  return [...applications].sort((left, right) => {
    const activityDelta = getApplicationActivityTime(right) - getApplicationActivityTime(left)
    if (activityDelta !== 0) return activityDelta

    const createdDelta =
      new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()
    if (createdDelta !== 0) return createdDelta

    return String(right.id || '').localeCompare(String(left.id || ''))
  })
}

/**
 * Map Django pagination response `{results}` → `{applications}`.
 * Handles both Django `results` field and legacy `applications` field.
 * Returns safe defaults for null/undefined input.
 */
export function normalizePaginatedApplications(response: BackendPaginatedApplications): PaginatedApplicationsResponse {
  if (response == null) {
    return {
      applications: [],
      totalCount: 0,
      page: 1,
      pageSize: 0,
    }
  }

  if (Array.isArray(response)) {
    const applications = sortApplicationsByActivity(response)
    return {
      applications,
      totalCount: applications.length,
      page: 1,
      pageSize: applications.length,
    }
  }

  // Task 12.2 (R14.5, finding API-02) deleted three rival-contract keys:
  // `.applications` (a domain-keyed list), `.count` (DRF's default pagination
  // key) and `.limit` (a limit/offset page size). `ApplicationListCreateView`
  // returns `paginator.get_paginated_response`, and this platform's paginator is
  // `StandardPagination`, which publishes exactly `{page, pageSize, totalCount,
  // results}` and none of those three. Accepting them meant accepting a
  // pagination contract this platform does not serve — and doing so silently, so
  // a regression to DRF defaults would have kept the roster rendering while the
  // page-size and total quietly came from a different contract. That is what
  // R14's "compatibility normalizers cannot hide drift" is about.
  //
  // What stays: the bare-array branch above (the view's own un-paginated tail),
  // and every `Number.isFinite` guard below — those validate the canonical keys
  // rather than substituting a second contract for them.
  const rawApplications = Array.isArray(response?.results) ? response.results : []
  const applications = sortApplicationsByActivity(rawApplications)
  const totalCountCandidate = response?.totalCount
  const pageCandidate = response?.page
  const pageSizeCandidate = response?.pageSize
  const totalCount =
    typeof totalCountCandidate === 'number' && Number.isFinite(totalCountCandidate) && totalCountCandidate >= 0
      ? totalCountCandidate
      : applications.length
  const page =
    typeof pageCandidate === 'number' && Number.isFinite(pageCandidate) && pageCandidate >= 1
      ? pageCandidate
      : 1
  const pageSize =
    typeof pageSizeCandidate === 'number' && Number.isFinite(pageSizeCandidate) && pageSizeCandidate >= 0
      ? pageSizeCandidate
      : applications.length

  return {
    applications,
    totalCount,
    page,
    pageSize,
    ...(response?.stats ? { stats: response.stats } : {}),
  }
}

async function getApplicationById(id: string): Promise<Application | null> {
  const response = await apiClient.request<unknown>(`/applications/${encodeURIComponent(id)}/`)
  return normalizeApplicationRecord(response)
}

async function loadApplicationDetails(
  id: string,
  options?: ApplicationIncludeOptions,
): Promise<ApplicationDetailResponse> {
  const encodedId = encodeURIComponent(id)

  // If no specific includes requested, use the details endpoint for a single round-trip
  const include = new Set(options?.include ?? [])
  const shouldLoadDocuments = include.has('documents')
  const shouldLoadGrades = include.has('grades')
  const shouldLoadStatusHistory = include.has('statusHistory')

  const [detailsResponse, documents, grades, summary, interviews] = await Promise.all([
    apiClient.request<unknown>(`/applications/${encodedId}/details/`).catch((err) => {
      // 404 means application was deleted — return null instead of throwing
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
        return null
      }
      // Propagate 429 with status so React Query's retry function can see it
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 429) {
        throw err
      }
      throw err
    }),
    shouldLoadDocuments
      ? apiClient.request<unknown[]>(`/applications/${encodedId}/documents/`)
      : Promise.resolve(null),
    shouldLoadGrades
      ? apiClient.request<unknown[]>(`/applications/${encodedId}/grades/`)
      : Promise.resolve(null),
    shouldLoadStatusHistory
      ? apiClient.request<ApplicationSummaryResponse>(`/applications/${encodedId}/summary/`)
      : Promise.resolve(null),
    apiClient.request<ApplicationInterview[]>(`/applications/${encodedId}/interviews/`).catch((err) => {
      logApiError('applications', `/applications/${encodedId}/interviews/`, err)
      return null
    }),
  ])

  const application = normalizeApplicationRecord(detailsResponse)

  if (!application) {
    throw new Error('Application not found or access denied')
  }

  const latestInterview = Array.isArray(interviews) && interviews.length > 0 ? interviews[0] : null
  const mergedApplication = summary?.application
    ? { ...application, ...summary.application, interview: latestInterview }
    : { ...application, interview: latestInterview }

  return {
    application: mergedApplication,
    ...(Array.isArray(documents) ? { documents } : {}),
    ...(Array.isArray(grades) ? { grades } : {}),
    ...(Array.isArray(summary?.status_history) ? { statusHistory: normalizeStatusHistory(summary.status_history) } : {}),
    interview: latestInterview,
  }
}

export const applicationService = {
  /** GET /applications/ with query params for pagination/filtering */
  list: async (params?: QueryParams, options: ApplicationListRequestOptions = {}) => {
    const response = await apiClient.request<BackendPaginatedApplications>(
      `/applications/${buildQueryString(params ?? {})}`,
      options
    )
    return normalizePaginatedApplications(response)
  },

  /** GET /applications/{id}/details/ with optional sub-resource loading */
  getById: (id: string, options?: ApplicationIncludeOptions) =>
    loadApplicationDetails(id, options),

  /**
   * GET /applications/{id}/ — one application row as the platform stores it.
   *
   * The single-row read, not the five-request composite `getById` builds. The
   * wizard's resume path needs it because the draft **list** is a lightweight
   * projection: it carries `full_name`, `email` and `phone` and no other personal
   * field, so hydrating a resumed draft from a list item blanked the town, the
   * NRC/passport, the date of birth, sex, country, nationality and both
   * next-of-kin values even when the platform had them (admissions-v2 task 11.2,
   * finding STU-02).
   */
  getRecord: (id: string) => getApplicationById(id),

  /** POST /applications/ */
  create: async (data: ApplicationPayload) => {
    const response = await apiClient.request<unknown>('/applications/', {
      method: 'POST',
      body: JSON.stringify(data)
    })

    return normalizeApplicationRecord(response)
  },

  /** PUT /applications/{id}/ */
  update: async (id: string, data: ApplicationPayload) => {
    const cleanId = id.replace(/^applications-/, '')
    const response = await apiClient.request<unknown>(`/applications/${encodeURIComponent(cleanId)}/`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })

    return normalizeApplicationRecord(response)
  },

  /**
   * PATCH /applications/drafts/{id}/ — canonical versioned draft-answer write.
   *
   * The supplied key belongs to one exact `(expectedVersion, payload)` command.
   * Callers retain it across a transport retry so a response lost after commit
   * is replayed instead of advancing the draft twice. Automatic client retries
   * stay disabled; the coordinator decides whether the exact command is safe to
   * replay or whether a newer edit needs a new command.
   */
  updateDraft: async (
    id: string,
    data: ApplicationPayload,
    expectedVersion: number,
    idempotencyKey: string,
  ) => {
    const response = await apiClient.request<unknown>(
      `/applications/drafts/${encodeURIComponent(id)}/`,
      {
        method: 'PATCH',
        body: JSON.stringify({ ...data, expected_version: expectedVersion }),
        headers: { 'Idempotency-Key': idempotencyKey },
        retries: 0,
      },
    )

    return normalizeApplicationRecord(response)
  },

  /** DELETE /applications/{id}/ */
  delete: async (id: string) => {
    try {
      await apiClient.request<void>(`/applications/${encodeURIComponent(id)}/`, {
        method: 'DELETE',
        retries: 0
      })
    } catch (error) {
      // 404 means already deleted — treat as success (idempotent delete).
      const status = (error as { status?: number })?.status
      if (status === 404) {
        return { success: true }
      }
      const message = error instanceof Error ? error.message.toLowerCase() : ''
      if (
        message.includes('resource not found') ||
        message.includes('application not found') ||
        message.includes('not found or access denied')
      ) {
        return { success: true }
      }
      throw error
    }
    return { success: true }
  },

  /** POST /applications/{id}/submit/ — student self-service submission */
  submit: async (id: string, options?: { headers?: Record<string, string> }) => {
    const response = await apiClient.request<unknown>(`/applications/${encodeURIComponent(id)}/submit/`, {
      method: 'POST',
      body: JSON.stringify({ confirm_submission: true }),
      retries: 0,
      ...(options?.headers ? { headers: options.headers } : {}),
    })

    return normalizeApplicationRecord(response)
  },

  /** PATCH /applications/{id}/review/ — update application status */
  updateStatus: async (
    id: string,
    status: Application['status'],
    notes?: string,
    force?: boolean,
    conditions?: OfferConditionInput[],
  ) => {
    const encodedId = encodeURIComponent(id)
    await apiClient.request(`/applications/${encodedId}/review/`, {
      method: 'POST',
      body: JSON.stringify({
        new_status: status,
        notes,
        ...(force ? { force: true } : {}),
        ...(conditions ? { conditions } : {}),
      }),
    })

    return getApplicationById(id)
  },

  /** PATCH /applications/{id}/review/ — update payment status */
  updatePaymentStatus: async (
    id: string,
    paymentStatus: Application['payment_status'],
    verificationNotes?: string,
    force?: boolean
  ) => {
    const encodedId = encodeURIComponent(id)
    await apiClient.request(`/applications/${encodedId}/review/`, {
      method: 'POST',
      body: JSON.stringify({
        payment_status: paymentStatus,
        notes: verificationNotes,
        ...(force ? { force: true } : {}),
      }),
    })

    return getApplicationById(id)
  },

  verifyDocument: async (
    id: string,
    payload: { documentId?: string; documentType?: string; status: string; notes?: string }
  ) => {
    return apiClient.request(`/applications/${encodeURIComponent(id)}/verify-document/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  syncGrades: async (
    id: string,
    grades: Array<{ subject_id: string; grade: number }>,
    options?: { partial?: boolean; idempotencyKey?: string },
  ) => {
    if (options?.partial) {
      // The draft machine's grades channel (SJR R6-b): it owns retry and backoff,
      // so this call does not layer a second retry under it, and an empty set is
      // a real command (the student removed every row), not a no-op.
      return apiClient.request<unknown>(`/applications/${encodeURIComponent(id)}/grades/`, {
        method: 'POST',
        body: JSON.stringify({ grades, partial: true }),
        headers: options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : undefined,
        retries: 0,
      })
    }
    const { syncGradesWithRecovery } = await importWithChunkRecovery(() => import('@/lib/connectionFix'), {
      guardKey: 'wizard-grade-sync',
      recoveryMessage: 'A newer version of the grade sync tools is loading. Please wait a moment and try again.',
    })
    return syncGradesWithRecovery(id, grades)
  },

  sendNotification: async (id: string, notification: { title: string; message: string }) => {
    const application = await getApplicationById(id)
    if (!application?.user_id) {
      throw new Error('Application recipient could not be resolved')
    }

    const sent = await notificationService.send({
      to: application.user_id,
      subject: notification.title,
      message: notification.message,
    })

    if (!sent) {
      throw new Error('Notification delivery request was rejected by the backend')
    }

    return { success: true }
  },

  /*
    admissions-v2 task 10.6 (R13.5, finding **API-04**): the five legacy document
    generators are **removed**.

    `generateApplicationSlip`, `generateAcceptanceLetter`, `generateConditionalOffer`,
    `generatePaymentReceipt` and `generateFinanceReceipt` each POSTed to a
    per-type route (`…/application-slip/`, `…/acceptance-letter/`, …) that returned
    a bare Celery `task_id`. They were the second way to ask for an official
    document, and the way that could not answer "did that actually get queued" —
    which is the durability defect task 10.4 closed.

    Every first-party caller goes through `services/officialDocuments.ts` and the
    one idempotent, fingerprinted family
    `…/official-documents/{document_type}/` (+ `/email/`). R13.5 asks for the
    legacy callers to be *measured* and removed after zero use: 10.4 §8 measured
    zero production call sites, this task re-measured it
    (`docs/v2-evidence/10.6/raw/usage-measurement.txt`) and removes them.

    The backend per-type routes are unchanged — they are staff-reachable and
    retiring them is a separate decision with its own window.
  */

  /** POST /applications/{id}/interviews/ — schedule interview */
  scheduleInterview: async (id: string, payload: ScheduleInterviewPayload) => {
    const response = await apiClient.request<ApplicationInterview>(
      `/applications/${encodeURIComponent(id)}/interviews/`,
      {
        method: 'POST',
        body: JSON.stringify({
          scheduled_at: payload.scheduledAt,
          mode: payload.mode,
          location: payload.location,
          notes: payload.notes,
        })
      }
    )

    return response ?? null
  },

  /** PUT /applications/{id}/interviews/ — reschedule interview */
  rescheduleInterview: async (id: string, payload: RescheduleInterviewPayload) => {
    const response = await apiClient.request<ApplicationInterview>(
      `/applications/${encodeURIComponent(id)}/interviews/`,
      {
        method: 'PUT',
        body: JSON.stringify({
          scheduled_at: payload.scheduledAt,
          mode: payload.mode,
          location: payload.location,
          notes: payload.notes,
        })
      }
    )

    return response ?? null
  },

  /** DELETE /applications/{id}/interviews/ — cancel interview */
  cancelInterview: async (id: string, payload: CancelInterviewPayload = {}) => {
    const response = await apiClient.request<ApplicationInterview>(
      `/applications/${encodeURIComponent(id)}/interviews/`,
      {
        method: 'DELETE',
        body: JSON.stringify({
          notes: payload.notes,
        })
      }
    )

    return response ?? null
  },

  /** GET /applications/export/ — admin CSV/Excel export */
  exportApplications: async (params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    payment?: string;
    program?: string;
    institution?: string;
  } = {}) => {
    const queryParams: QueryParams = {
      page: params.page !== undefined ? params.page + 1 : undefined,
      pageSize: params.limit,
      search: params.search,
      status: params.status,
      payment: params.payment,
      program: params.program,
      institution: params.institution,
    }
    const response = await apiClient.request<BackendPaginatedApplications>(
      `/applications/export/${buildQueryString(queryParams)}`
    )
    const normalized = normalizePaginatedApplications(response)

    return {
      applications: normalized.applications,
      page: normalized.page,
      limit: normalized.pageSize,
      hasMore: normalized.page * normalized.pageSize < normalized.totalCount,
    }
  },

  /** GET /applications/track/ — public application tracking */
  track: async (params: { applicationNumber?: string; trackingCode?: string }) => {
    const queryParams: QueryParams = {
      applicationNumber: params.applicationNumber,
      trackingCode: params.trackingCode,
    }
    return apiClient.request<unknown>(`/applications/track/${buildQueryString(queryParams)}`)
  },

  /** POST /applications/bulk-status/ — admin bulk status updates */
  /**
   * POST /applications/bulk-status/ — one all-or-nothing bulk decision.
   *
   * `expectedVersions` is task 9.4's version guard applied to the batch (R8.4).
   * A bulk decision is the most dangerous place for a stale write — one press
   * changes up to 25 applications — so the command states, per application, the
   * version the roster row was read at. Any application that moved since is
   * reported as `VERSION_CONFLICT` and the whole batch is refused rather than
   * one row being silently overwritten.
   *
   * The confirmation token is still computed here because the endpoint verifies
   * it server-side; this side only has to produce it.
   */
  bulkStatus: async (data: {
    applicationIds: string[]
    status: string
    notes?: string
    expectedVersions?: Record<string, number>
  }) => {
    // Backend requires SHA-256(sorted_ids_joined + target_status) as confirmation_token
    const sortedIds = [...data.applicationIds].sort()
    const tokenInput = sortedIds.join('') + data.status
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(tokenInput))
    const confirmationToken = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    return apiClient.request<unknown>('/applications/bulk-status/', {
      method: 'POST',
      body: JSON.stringify({
        application_ids: data.applicationIds,
        new_status: data.status,
        notes: data.notes,
        confirmation_token: confirmationToken,
        ...(data.expectedVersions && Object.keys(data.expectedVersions).length > 0
          ? { expected_versions: data.expectedVersions }
          : {}),
      }),
    })
  },

  /** POST /applications/draft/ — auto-save draft persistence */
  saveDraft: async (data: ApplicationPayload) => {
    return apiClient.request<unknown>('/applications/draft/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /**
   * POST /applications/drafts/ — canonical multi-draft START (task 6.2).
   *
   * The start requires the minimum canonical selection (`program_id` +
   * `intake_id`, R10.9) and sends an `Idempotency-Key` so a retried start
   * returns the same draft instead of creating a second row (R10.3). Callers
   * should pass a stable key when they want replay protection across retries;
   * a fresh key is generated otherwise.
   */
  startDraft: async (data: ApplicationPayload, idempotencyKey?: string) => {
    const key =
      idempotencyKey ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `draft-start-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const response = await apiClient.request<unknown>('/applications/drafts/', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Idempotency-Key': key },
      retries: 0,
    })
    return normalizeApplicationRecord(response)
  },

  /**
   * POST /applications/drafts/{id}/change-selection/ — the one reroute command
   * (task 6.4, R7.2/R10.5; design §7.2).
   *
   * The generic draft PATCH no longer accepts `program`/`intake`/`institution`
   * or any canonical id, so this is the only way a draft's assignment moves.
   * The server revalidates the canonical graph and updates every id, display
   * snapshot, configuration version, requirement/eligibility snapshot, fee, and
   * dependent answer in one transaction, then returns a change summary.
   *
   * Rejections carry a stable code: `ASSIGNMENT_LOCKED_BY_PAYMENT` (409, with a
   * `recovery` path), `DUPLICATE_APPLICATION` (409), `VERSION_CONFLICT` (409),
   * `NO_ELIGIBLE_OFFERING` (400), or `CONFIGURATION_UNAVAILABLE` (503,
   * retryable). Sent with an `Idempotency-Key` and `retries: 0` so a retry
   * replays rather than duplicating the command.
   */
  changeSelection: async (
    id: string,
    payload: { programId: string; intakeId: string; assignmentVersion?: number },
    idempotencyKey?: string,
  ) => {
    const key =
      idempotencyKey ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `change-selection-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const response = await apiClient.request<unknown>(
      `/applications/drafts/${encodeURIComponent(id)}/change-selection/`,
      {
        method: 'POST',
        body: JSON.stringify({
          program_id: payload.programId,
          intake_id: payload.intakeId,
          ...(payload.assignmentVersion !== undefined
            ? { assignment_version: payload.assignmentVersion }
            : {}),
        }),
        headers: { 'Idempotency-Key': key },
        retries: 0,
      },
    )
    return normalizeApplicationRecord(response)
  },

  /**
   * PATCH /applications/drafts/{id}/rename/ — validated draft label (task 6.2,
   * R10.9). Rename is a real, supported server field; the backend rejects a
   * blank name and masks a non-owned draft as 404.
   */
  renameDraft: async (id: string, draftName: string) => {
    const response = await apiClient.request<unknown>(
      `/applications/drafts/${encodeURIComponent(id)}/rename/`,
      {
        method: 'PATCH',
        body: JSON.stringify({ draft_name: draftName }),
        retries: 0,
      },
    )
    return normalizeApplicationRecord(response)
  },

  /** GET /applications/{id}/documents/ */
  getDocuments: async (id: string) => {
    return apiClient.request<unknown[]>(`/applications/${encodeURIComponent(id)}/documents/`)
  },

  /** GET /applications/{id}/grades/ */
  getGrades: async (id: string) => {
    return apiClient.request<unknown[]>(`/applications/${encodeURIComponent(id)}/grades/`)
  },

  /** GET /applications/{id}/summary/ */
  getSummary: async (id: string) => {
    return apiClient.request<ApplicationSummaryResponse>(`/applications/${encodeURIComponent(id)}/summary/`)
  },

  /** POST /applications/{id}/confirm-enrollment/ */
  confirmEnrollment: async (id: string) => {
    return apiClient.request(`/applications/${encodeURIComponent(id)}/confirm-enrollment/`, { method: 'POST' })
  },

  /** POST /applications/{id}/fee-waiver/ */
  applyFeeWaiver: async (id: string, data: { waiver_type: string; reason_code: string; discount_percentage: number }) => {
    return apiClient.request(`/applications/${encodeURIComponent(id)}/fee-waiver/`, { method: 'POST', body: JSON.stringify(data) })
  },

  /** POST /applications/{id}/withdraw/ */
  withdraw: async (id: string, reason: string) => {
    return apiClient.request(`/applications/${encodeURIComponent(id)}/withdraw/`, {
      method: 'POST',
      body: JSON.stringify({ withdrawal_reason: reason }),
    })
  },

  /** GET /applications/{id}/waitlist-position/ */
  getWaitlistPosition: async (id: string) => {
    return apiClient.request<{ position: number; total: number }>(`/applications/${encodeURIComponent(id)}/waitlist-position/`)
  },

  /**
   * GET /applications/{id}/conditions/
   *
   * Task 10.2 (R13.9, STU-16): each condition now carries its own state
   * definition, who the state is waiting on, its current evidence version, the
   * reviewer's reason, the append-only history, and the actions **this** reader
   * may take. Nothing in the browser derives any of that — a condition's copy and
   * its available controls are the server's answer.
   */
  getConditions: async (id: string) => {
    const data = await apiClient.request<StudentCondition[]>(
      `/applications/${encodeURIComponent(id)}/conditions/`,
    )
    return Array.isArray(data) ? data : []
  },

  /** GET /applications/{id}/conditions/{cid}/ — one condition with its history. */
  getCondition: async (id: string, conditionId: string) => {
    return apiClient.request<StudentCondition>(
      `/applications/${encodeURIComponent(id)}/conditions/${encodeURIComponent(conditionId)}/`,
    )
  },

  /**
   * POST /applications/{id}/conditions/{cid}/evidence/
   *
   * Submit **or replace** the evidence for one condition, with an optional note.
   * A replacement is the same call: the server supersedes the previous immutable
   * version rather than overwriting it, so this is deliberately not a PUT.
   */
  submitConditionEvidence: async (
    id: string,
    conditionId: string,
    data: { file: File; comment?: string },
  ) => {
    const formData = new FormData()
    formData.append('file', data.file)
    if (data.comment && data.comment.trim()) formData.append('comment', data.comment.trim())
    return apiClient.request<StudentCondition>(
      `/applications/${encodeURIComponent(id)}/conditions/${encodeURIComponent(conditionId)}/evidence/`,
      { method: 'POST', body: formData },
    )
  },

  /** POST /applications/{id}/amendments/ */
  submitAmendment: async (id: string, data: { field_name: string; new_value: string; reason: string }) => {
    return apiClient.request(`/applications/${encodeURIComponent(id)}/amendments/`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /**
   * GET /applications/{id}/amendments/
   *
   * Task 10.2 (R13.9-R13.10, STU-17): the student's own amendment history. Owner
   * scoped and paginated on the server; the status definition travels with each
   * row, so the list is rendered rather than interpreted.
   */
  listAmendments: async (id: string, params?: { page?: number; pageSize?: number }) => {
    const query = new URLSearchParams()
    if (params?.page) query.set('page', String(params.page))
    if (params?.pageSize) query.set('pageSize', String(params.pageSize))
    const suffix = query.toString() ? `?${query.toString()}` : ''
    const data = await apiClient.request<StudentAmendmentPage>(
      `/applications/${encodeURIComponent(id)}/amendments/${suffix}`,
    )
    return (
      data ?? { page: 1, pageSize: 0, totalCount: 0, results: [] as StudentAmendment[] }
    )
  },

  /** GET /applications/{id}/amendments/{aid}/ — one of the student's own requests. */
  getAmendment: async (id: string, amendmentId: string) => {
    return apiClient.request<StudentAmendment>(
      `/applications/${encodeURIComponent(id)}/amendments/${encodeURIComponent(amendmentId)}/`,
    )
  },

  /**
   * GET /applications/{id}/assignment-candidates/
   * Tenant-scoped, searchable reviewer candidates eligible for this
   * application's institution (R8.2). Backs the reviewer picker so the client
   * never posts a raw or empty reviewer id (AUTH-03).
   */
  getAssignmentCandidates: async (id: string, search?: string): Promise<ReviewerCandidate[]> => {
    const query = search && search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''
    const data = await apiClient.request<ReviewerCandidate[]>(
      `/applications/${encodeURIComponent(id)}/assignment-candidates/${query}`,
    )
    return Array.isArray(data) ? data : []
  },

  /** POST /applications/{id}/assign/ — reviewerId must be a real candidate id. */
  assignReviewer: async (id: string, reviewerId: string) => {
    return apiClient.request(`/applications/${encodeURIComponent(id)}/assign/`, {
      method: 'POST',
      body: JSON.stringify({ reviewer_id: reviewerId }),
    })
  },

  /** POST /applications/auto-assign/ */
  autoAssign: async () => {
    return apiClient.request('/applications/auto-assign/', { method: 'POST' })
  },
}
