/**
 * Frontend service-normalization tests (Task 9.2, Component 4).
 *
 * Validates: Requirements 4.4, 4.5.
 *
 * Asserts that each admissions `services/` method normalizes the backend
 * envelope / pagination payload into its declared frontend type. Because
 * `apiClient.request` (`services/client.ts`) already unwraps the
 * `{"success": true, "data": ...}` envelope and returns the inner `data` to
 * each service method (see `docs/audits/api-contract-inventory.md` §1.1), every
 * mock below resolves the *post-unwrap* `data` payload — the exact shape a
 * service method sees on the wire.
 *
 * Covers the normalizers flagged in the contract inventory:
 *   - applications pagination       (`normalizePaginatedApplications`)
 *   - catalog collection normalizers (`normalize{Programs,Intakes,Subjects,Institutions}Response`)
 *   - notifications                 (`normalizeNotificationsResponse`)
 *   - interviews                    (`normalizeInterviewsResponse`, `interviewsService.list`)
 *   - admin dashboard/users/audit   (`normalizeStats`, `normalizeRecentActivity`,
 *                                     `userService.list`, `adminAuditService.list`)
 *   - official documents            (`officialDocumentService.*`)
 *   - sessions                      (`listActiveSessions`)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.fn()

vi.mock('@/services/client', () => ({
  apiClient: {
    request: requestMock,
  },
  buildQueryString: (params: Record<string, unknown>) => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) search.set(key, String(value))
    }
    const qs = search.toString()
    return qs ? `?${qs}` : ''
  },
}))

beforeEach(() => {
  requestMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ===========================================================================
// 1. Applications pagination — normalizePaginatedApplications
// ===========================================================================

describe('applications — normalizePaginatedApplications', () => {
  it('maps the canonical {page,pageSize,totalCount,results} payload into PaginatedApplicationsResponse', async () => {
    const { normalizePaginatedApplications } = await import('@/services/applications')

    const normalized = normalizePaginatedApplications({
      page: 2,
      pageSize: 20,
      totalCount: 137,
      results: [
        { id: 'a-1', created_at: '2026-01-01T00:00:00Z' },
        { id: 'a-2', created_at: '2026-02-01T00:00:00Z' },
      ] as never,
    })

    expect(normalized.page).toBe(2)
    expect(normalized.pageSize).toBe(20)
    expect(normalized.totalCount).toBe(137)
    expect(Array.isArray(normalized.applications)).toBe(true)
    expect(normalized.applications).toHaveLength(2)
    // Declared type has no `results`/`count` keys — they are mapped away.
    expect('results' in normalized).toBe(false)
    expect('count' in normalized).toBe(false)
  })

  it('tolerates the legacy {applications,count,limit} shape', async () => {
    const { normalizePaginatedApplications } = await import('@/services/applications')

    const normalized = normalizePaginatedApplications({
      applications: [{ id: 'a-1', created_at: '2026-01-01T00:00:00Z' }] as never,
      count: 1,
      page: 1,
      limit: 25,
    })

    expect(normalized.applications).toHaveLength(1)
    expect(normalized.totalCount).toBe(1)
    expect(normalized.pageSize).toBe(25)
  })

  it('normalizes a bare array into a single-page response', async () => {
    const { normalizePaginatedApplications } = await import('@/services/applications')

    const normalized = normalizePaginatedApplications([
      { id: 'a-1', created_at: '2026-01-01T00:00:00Z' },
      { id: 'a-2', created_at: '2026-02-01T00:00:00Z' },
    ] as never)

    expect(normalized.applications).toHaveLength(2)
    expect(normalized.page).toBe(1)
    expect(normalized.totalCount).toBe(2)
    expect(normalized.pageSize).toBe(2)
  })

  it('returns safe defaults for null/undefined input', async () => {
    const { normalizePaginatedApplications } = await import('@/services/applications')

    for (const input of [null, undefined]) {
      const normalized = normalizePaginatedApplications(input as never)
      expect(normalized.applications).toEqual([])
      expect(normalized.totalCount).toBe(0)
      expect(normalized.page).toBe(1)
    }
  })

  it('applicationService.list returns the normalized declared type from a paginated envelope', async () => {
    requestMock.mockResolvedValue({
      page: 1,
      pageSize: 20,
      totalCount: 2,
      results: [
        { id: 'a-1', created_at: '2026-01-01T00:00:00Z' },
        { id: 'a-2', created_at: '2026-02-01T00:00:00Z' },
      ],
    })

    const { applicationService } = await import('@/services/applications')
    const result = await applicationService.list()

    expect(result.applications).toHaveLength(2)
    expect(result.totalCount).toBe(2)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(20)
  })

  it('applicationService.exportApplications computes hasMore from the normalized page block', async () => {
    requestMock.mockResolvedValue({
      page: 1,
      pageSize: 1,
      totalCount: 5,
      results: [{ id: 'a-1', created_at: '2026-01-01T00:00:00Z' }],
    })

    const { applicationService } = await import('@/services/applications')
    const result = await applicationService.exportApplications({ page: 0, limit: 1 })

    expect(result.applications).toHaveLength(1)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(1)
    expect(result.hasMore).toBe(true)
  })
})

// ===========================================================================
// 2. Catalog collection normalizers
// ===========================================================================

describe('catalog — collection normalizers', () => {
  it('normalizeProgramsResponse accepts array / {results} / {programs} shapes', async () => {
    const { normalizeProgramsResponse } = await import('@/services/catalog')

    const raw = { id: 'p-1', name: 'Nursing', duration_months: 36, application_fee: '153' }

    const fromArray = normalizeProgramsResponse([raw] as never)
    const fromResults = normalizeProgramsResponse({ results: [raw] } as never)
    const fromKeyed = normalizeProgramsResponse({ programs: [raw] } as never)

    for (const shape of [fromArray, fromResults, fromKeyed]) {
      expect(shape.programs).toHaveLength(1)
      const program = shape.programs[0]
      expect(program.id).toBe('p-1')
      // duration_months → duration_years coercion over documented fields
      expect(program.duration_years).toBe(3)
      // application_fee string coerced to number
      expect(program.application_fee).toBe(153)
    }
  })

  it('normalizeIntakesResponse maps the paginated {results} shape into {intakes}', async () => {
    const { normalizeIntakesResponse } = await import('@/services/catalog')

    // Omit max_capacity so the raw→Intake defaulting branch runs (a record with a
    // numeric max_capacity is treated as already-normalized and returned verbatim).
    const normalized = normalizeIntakesResponse({
      results: [
        {
          id: 'i-1',
          name: 'January 2026',
          year: 2026,
          application_deadline: '2026-01-31',
        },
      ],
    } as never)

    expect(normalized.intakes).toHaveLength(1)
    expect(normalized.intakes[0].id).toBe('i-1')
    // max_capacity defaulted to 0 when absent
    expect(normalized.intakes[0].max_capacity).toBe(0)
    // start_date/end_date defaulted from the deadline when absent
    expect(normalized.intakes[0].start_date).toBe('2026-01-31')
    expect(normalized.intakes[0].end_date).toBe('2026-01-31')
  })

  it('normalizeSubjectsResponse and normalizeInstitutionsResponse return their declared collections', async () => {
    const { normalizeSubjectsResponse, normalizeInstitutionsResponse } = await import('@/services/catalog')

    const subjects = normalizeSubjectsResponse([
      { id: 's-1', name: 'Mathematics', is_core: true },
    ] as never)
    expect(subjects.subjects).toHaveLength(1)
    expect(subjects.subjects[0].is_active).toBe(true)

    const institutions = normalizeInstitutionsResponse({
      institutions: [{ id: 'ins-1', name: 'MIHAS' }],
    } as never)
    expect(institutions.institutions).toHaveLength(1)
    expect(institutions.institutions[0].id).toBe('ins-1')
  })

  it('drops records missing the required id and returns empty for null input', async () => {
    const { normalizeProgramsResponse } = await import('@/services/catalog')
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const withBad = normalizeProgramsResponse([
      { id: 'p-1', name: 'Good' },
      { name: 'No id' },
    ] as never)
    expect(withBad.programs).toHaveLength(1)

    const fromNull = normalizeProgramsResponse(null)
    expect(fromNull.programs).toEqual([])
  })

  it('catalogService.getPrograms returns the normalized {programs} collection from the unwrapped payload', async () => {
    requestMock.mockResolvedValue({
      results: [{ id: 'p-1', name: 'Nursing', duration_months: 24 }],
    })

    const { catalogService } = await import('@/services/catalog')
    const result = await catalogService.getPrograms()

    expect(result.programs).toHaveLength(1)
    expect(result.programs[0].duration_years).toBe(2)
  })

  it('catalogService.getContext falls back to Beanola-generic brand on error', async () => {
    requestMock.mockRejectedValue(new Error('network'))

    const { catalogService } = await import('@/services/catalog')
    const context = await catalogService.getContext()

    expect(context.portal_type).toBe('shared')
    expect(context.institution_id).toBeNull()
    expect(context.brand.name).toBe('Beanola Admissions')
  })
})

// ===========================================================================
// 3. Notifications — normalizeNotificationsResponse
// ===========================================================================

describe('notifications — normalizeNotificationsResponse', () => {
  it('normalizes a bare array into StudentNotification[]', async () => {
    const { normalizeNotificationsResponse } = await import('@/services/notifications')

    const result = normalizeNotificationsResponse([
      { id: 'n-1', title: 'Hello', message: 'Body', type: 'success', is_read: false, created_at: '2026-01-01T00:00:00Z' },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('n-1')
    // is_read → read, message → content (documented field-variant tolerance)
    expect(result[0].read).toBe(false)
    expect(result[0].content).toBe('Body')
    expect(result[0].type).toBe('success')
  })

  it('reads nested data.results / data.notifications paginated shapes', async () => {
    const { normalizeNotificationsResponse } = await import('@/services/notifications')

    const fromResults = normalizeNotificationsResponse({
      data: { results: [{ id: 'n-1', title: 'A', content: 'x', created_at: '' }] },
    })
    expect(fromResults).toHaveLength(1)

    const fromNotifications = normalizeNotificationsResponse({
      data: { notifications: [{ id: 'n-2', title: 'B', content: 'y', created_at: '' }] },
    })
    expect(fromNotifications).toHaveLength(1)
    expect(fromNotifications[0].id).toBe('n-2')
  })

  it('drops rows without an id and defaults invalid type to info', async () => {
    const { normalizeNotificationsResponse } = await import('@/services/notifications')

    const result = normalizeNotificationsResponse([
      { id: 'n-1', title: 'Keep', content: 'x', type: 'not-a-type', created_at: '' },
      { title: 'Drop — no id', content: 'y', created_at: '' },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('info')
  })

  it('returns [] for non-object / empty input', async () => {
    const { normalizeNotificationsResponse } = await import('@/services/notifications')
    expect(normalizeNotificationsResponse(null)).toEqual([])
    expect(normalizeNotificationsResponse(undefined)).toEqual([])
    expect(normalizeNotificationsResponse({})).toEqual([])
  })
})

// ===========================================================================
// 4. Interviews — normalizeInterviewsResponse + interviewsService.list
// ===========================================================================

describe('interviews — normalizeInterviewsResponse', () => {
  it('absorbs bare array, data array, nested data.interviews/results, and top-level variants', async () => {
    const { normalizeInterviewsResponse } = await import('@/services/interviews')

    const row = { id: 'iv-1', application_id: 'a-1', scheduled_at: '2026-03-01T10:00:00Z', mode: 'virtual', location: null, status: 'scheduled', notes: null }

    expect(normalizeInterviewsResponse([row])).toHaveLength(1)
    expect(normalizeInterviewsResponse({ data: [row] })).toHaveLength(1)
    expect(normalizeInterviewsResponse({ data: { interviews: [row] } })).toHaveLength(1)
    expect(normalizeInterviewsResponse({ data: { results: [row] } })).toHaveLength(1)
    expect(normalizeInterviewsResponse({ interviews: [row] })).toHaveLength(1)
    expect(normalizeInterviewsResponse({ results: [row] })).toHaveLength(1)
  })

  it('filters out non-interview entries and returns [] for empty input', async () => {
    const { normalizeInterviewsResponse } = await import('@/services/interviews')

    const result = normalizeInterviewsResponse([{ id: 'iv-1', application_id: 'a-1', scheduled_at: '', mode: 'phone', location: null, status: 'scheduled', notes: null }, { noId: true }])
    expect(result).toHaveLength(1)
    expect(normalizeInterviewsResponse(null)).toEqual([])
  })

  it('interviewsService.list returns ListInterviewsResponse sorted by schedule', async () => {
    requestMock.mockResolvedValue([
      { id: 'iv-late', application_id: 'a-1', scheduled_at: '2026-05-01T10:00:00Z', mode: 'virtual', location: null, status: 'scheduled', notes: null },
      { id: 'iv-early', application_id: 'a-1', scheduled_at: '2026-03-01T10:00:00Z', mode: 'virtual', location: null, status: 'scheduled', notes: null },
    ])

    const { interviewsService } = await import('@/services/interviews')
    const result = await interviewsService.list()

    expect(Array.isArray(result.interviews)).toBe(true)
    expect(result.interviews.map((i) => i.id)).toEqual(['iv-early', 'iv-late'])
  })
})

// ===========================================================================
// 5. Admin dashboard — normalizeStats + normalizeRecentActivity + service
// ===========================================================================

describe('admin dashboard — normalizers', () => {
  it('normalizeStats coerces snake_case + camelCase fields into the declared numeric stats', async () => {
    const { normalizeStats } = await import('@/services/admin/dashboard')

    const stats = normalizeStats({
      total_applications: '42',
      pending_applications: 5,
      system_health: 'warning',
    })

    expect(stats.totalApplications).toBe(42)
    expect(stats.pendingApplications).toBe(5)
    expect(stats.systemHealth).toBe('warning')
    // Unprovided fields default to 0 (declared type stays complete)
    expect(stats.approvedApplications).toBe(0)
  })

  it('normalizeRecentActivity returns typed activity rows and drops invalid items', async () => {
    const { normalizeRecentActivity } = await import('@/services/admin/dashboard')

    const activity = normalizeRecentActivity([
      { id: 1, action: 'POST', entity_type: 'applications', created_at: '2026-01-01T00:00:00Z' },
      { nope: true },
    ])

    expect(activity).toHaveLength(1)
    expect(activity[0].id).toBe('1')
    expect(activity[0].message).toBe('Application submitted')
    expect(activity[0].type).toBe('application')
  })

  it('adminDashboardService.getOverview maps the live snake_case backend shape into AdminDashboardResponse', async () => {
    requestMock.mockResolvedValue({
      applications: {
        total: 10,
        by_status: { submitted: 3, under_review: 2, approved: 4, rejected: 1 },
        today_activity: 2,
        this_week: 5,
        this_month: 8,
      },
      users: { total: 50, active: 30 },
      needs_attention: { pending_payments: 1, pending_documents: 2 },
      recent_activity: [{ id: 'act-1', action: 'PUT', entity_type: 'applications', created_at: '2026-01-01T00:00:00Z' }],
      generated_at: '2026-01-02T00:00:00Z',
      no_school_access: false,
    })

    const { adminDashboardService } = await import('@/services/admin/dashboard')
    const data = await adminDashboardService.getOverview()

    expect(data.stats.totalApplications).toBe(10)
    expect(data.stats.pendingApplications).toBe(5) // submitted + under_review
    expect(data.stats.totalStudents).toBe(50)
    expect(data.stats.pendingPayments).toBe(1)
    expect(data.recentActivity).toHaveLength(1)
    expect(data.noSchoolAccess).toBe(false)
    expect(data.generatedAt).toBe('2026-01-02T00:00:00.000Z')
  })

  it('adminDashboardService.getOverview returns an empty typed response for a non-object payload', async () => {
    requestMock.mockResolvedValue(null)

    const { adminDashboardService } = await import('@/services/admin/dashboard')
    const data = await adminDashboardService.getOverview()

    expect(data.stats.totalApplications).toBe(0)
    expect(data.recentActivity).toEqual([])
    expect(data.noSchoolAccess).toBe(false)
  })
})

// ===========================================================================
// 6. Admin users — userService.list pagination normalization
// ===========================================================================

describe('admin users — userService.list', () => {
  it('maps the StandardPagination {page,pageSize,totalCount,results} payload into AdminUserListResult', async () => {
    requestMock.mockResolvedValue({
      page: 1,
      pageSize: 20,
      totalCount: 2,
      results: [
        { id: 7, email: 'a@b.com', first_name: 'Ada', last_name: 'Lovelace', role: 'admin' },
        { id: 8, email: 'c@d.com', full_name: 'Grace Hopper', role: 'reviewer' },
      ],
    })

    const { userService } = await import('@/services/admin/users')
    const result = await userService.list({ page: 1, pageSize: 20 })

    expect(result.users).toHaveLength(2)
    expect(result.totalCount).toBe(2)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(20)
    // id coerced to string; full_name derived from first/last when omitted
    expect(result.users[0].id).toBe('7')
    expect(result.users[0].full_name).toBe('Ada Lovelace')
    expect(result.users[1].full_name).toBe('Grace Hopper')
    // totalPages is not a backend field — resolves to undefined (F2)
    expect(result.totalPages).toBeUndefined()
  })

  it('falls back to results length when totalCount is omitted', async () => {
    requestMock.mockResolvedValue({
      results: [{ id: 1, email: 'x@y.com', role: 'student' }],
    })

    const { userService } = await import('@/services/admin/users')
    const result = await userService.list()

    expect(result.users).toHaveLength(1)
    expect(result.totalCount).toBe(1)
    expect(result.users[0].role).toBe('student')
  })
})

// ===========================================================================
// 7. Admin audit — adminAuditService.list normalization
// ===========================================================================

describe('admin audit — adminAuditService.list', () => {
  it('maps StandardPagination {results} of AuditLogSerializer rows into AuditLogResponse', async () => {
    requestMock.mockResolvedValue({
      page: 1,
      pageSize: 50,
      totalCount: 1,
      results: [
        {
          id: 'log-1',
          actor_id: 'u-1',
          actor_email: 'admin@beanola.com',
          action: 'login',
          entity_type: 'session',
          entity_id: 's-1',
          changes: null,
          ip_hash: 'hash',
          user_agent_hash: 'uahash',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    })

    const { adminAuditService } = await import('@/services/admin/audit')
    const result = await adminAuditService.list({ page: 1, pageSize: 50 })

    expect(result.entries).toHaveLength(1)
    expect(result.totalCount).toBe(1)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(50)
    const entry = result.entries[0]
    expect(entry.id).toBe('log-1')
    // backend snake_case → camelCase declared fields
    expect(entry.actorEmail).toBe('admin@beanola.com')
    expect(entry.entityType).toBe('session')
    // category derived client-side from the action
    expect(entry.category).toBe('Authentication')
    // summary synthesized from entries when backend omits it
    expect(result.summary.uniqueActors).toBe(1)
  })

  it('tolerates the legacy {entries,count} shape', async () => {
    requestMock.mockResolvedValue({
      entries: [
        {
          id: 'log-2',
          actor_id: 'u-2',
          action: 'application.update',
          entity_type: 'application',
          entity_id: 'a-1',
          changes: { status: ['draft', 'submitted'] },
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      count: 1,
    })

    const { adminAuditService } = await import('@/services/admin/audit')
    const result = await adminAuditService.list()

    expect(result.entries).toHaveLength(1)
    expect(result.totalCount).toBe(1)
    expect(result.entries[0].category).toBe('Data')
  })

  it('returns an empty typed response when the payload is null', async () => {
    requestMock.mockResolvedValue(null)

    const { adminAuditService } = await import('@/services/admin/audit')
    const result = await adminAuditService.list()

    expect(result.entries).toEqual([])
    expect(result.totalCount).toBe(0)
    expect(result.totalPages).toBe(1)
  })
})

// ===========================================================================
// 8. Official documents — officialDocumentService normalization
// ===========================================================================

describe('official documents — officialDocumentService', () => {
  it('listOfficialDocuments returns the OfficialDocumentStatus[] payload and coerces null to []', async () => {
    requestMock.mockResolvedValueOnce([
      {
        document_id: 'doc-1',
        document_type: 'application_slip',
        status: 'ready',
        download_url: 'https://example.com/doc.pdf',
        generated_at: '2026-01-01T00:00:00Z',
        template_version: 3,
        institution_id: 'ins-1',
      },
    ])

    const { officialDocumentService } = await import('@/services/officialDocuments')
    const ready = await officialDocumentService.listOfficialDocuments('a-1')
    expect(ready).toHaveLength(1)
    expect(ready[0].status).toBe('ready')
    expect(ready[0].download_url).toBe('https://example.com/doc.pdf')

    requestMock.mockResolvedValueOnce(null)
    const empty = await officialDocumentService.listOfficialDocuments('a-1')
    expect(empty).toEqual([])
  })

  it('getOfficialDocument returns the single status envelope as its declared type', async () => {
    requestMock.mockResolvedValue({
      document_id: null,
      document_type: 'acceptance_letter',
      status: 'queued',
      generated_at: null,
      template_version: null,
      institution_id: null,
      task_id: 'task-9',
    })

    const { officialDocumentService } = await import('@/services/officialDocuments')
    const status = await officialDocumentService.getOfficialDocument('a-1', 'acceptance_letter')

    expect(status?.status).toBe('queued')
    expect(status?.task_id).toBe('task-9')
    expect(status?.document_id).toBeNull()
  })

  it('downloadOfficialDocument throws when the resolved status is not ready', async () => {
    requestMock.mockResolvedValue({
      document_id: null,
      document_type: 'application_slip',
      status: 'failed',
      generated_at: null,
      template_version: null,
      institution_id: null,
    })

    const { officialDocumentService } = await import('@/services/officialDocuments')
    await expect(officialDocumentService.downloadOfficialDocument('a-1', 'application_slip')).rejects.toThrow(
      /not ready/i,
    )
  })
})

// ===========================================================================
// 9. Sessions — listActiveSessions normalization
// ===========================================================================

describe('sessions — listActiveSessions', () => {
  it('normalizes an array payload into ListSessionsResult with last_activity backfill', async () => {
    requestMock.mockResolvedValue([
      { id: 's-1', device_info: 'Chrome', last_active: '2026-01-01T00:00:00Z', created_at: '2025-12-01T00:00:00Z', is_current: true },
    ])

    const { listActiveSessions } = await import('@/services/sessionService')
    const result = await listActiveSessions()

    expect(result.success).toBe(true)
    expect(result.sessions).toHaveLength(1)
    expect(result.count).toBe(1)
    // legacy last_active alias backfills last_activity
    expect(result.sessions[0].last_activity).toBe('2026-01-01T00:00:00Z')
  })

  it('normalizes the {sessions,count} object payload', async () => {
    requestMock.mockResolvedValue({
      sessions: [{ id: 's-1', device_info: 'Firefox', last_activity: '2026-01-01T00:00:00Z', created_at: '2025-12-01T00:00:00Z' }],
      count: 1,
    })

    const { listActiveSessions } = await import('@/services/sessionService')
    const result = await listActiveSessions()

    expect(result.success).toBe(true)
    expect(result.count).toBe(1)
    expect(result.sessions[0].last_activity).toBe('2026-01-01T00:00:00Z')
  })

  it('returns an access-issue result on Authentication required errors', async () => {
    requestMock.mockRejectedValue(new Error('Authentication required'))

    const { listActiveSessions } = await import('@/services/sessionService')
    const result = await listActiveSessions()

    expect(result.success).toBe(false)
    expect(result.sessions).toEqual([])
    expect(result.accessIssue).toBe(true)
  })
})
