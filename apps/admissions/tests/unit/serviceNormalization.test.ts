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
 *   - interviews                    (strict generated-contract mapping via `interviewsService.list`)
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

  // V1 DEPRECATION TEST (task 12.2, R14.5). This case used to be titled
  // "tolerates the legacy {applications,count,limit} shape" and asserted the
  // permissive normalizer accepted a rival pagination contract. R14.5 says such
  // a normalizer is DELETED after cutover, so the assertion is inverted rather
  // than removed: the strict reader must now *refuse* the legacy shape, and
  // refuse it visibly (empty list, zero total) rather than partially.
  it('REFUSES the legacy {applications,count,limit} shape — the rival contract is gone', async () => {
    const { normalizePaginatedApplications } = await import('@/services/applications')

    const normalized = normalizePaginatedApplications({
      applications: [{ id: 'a-1', created_at: '2026-01-01T00:00:00Z' }],
      count: 1,
      page: 1,
      limit: 25,
    } as never)

    // `.applications` is not read: `StandardPagination` publishes `results`.
    expect(normalized.applications).toEqual([])
    // `.count` is not read: it is DRF's default key, not this platform's.
    expect(normalized.totalCount).toBe(0)
    // `.limit` is not read: `pageSize` is the published key.
    expect(normalized.pageSize).toBe(0)
    // `page` IS canonical and is still honoured — the refusal is scoped to the
    // three rival keys, not to the whole payload.
    expect(normalized.page).toBe(1)
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
  it('normalizeProgramsResponse accepts the array and {results} shapes the endpoint emits', async () => {
    const { normalizeProgramsResponse } = await import('@/services/catalog')

    const raw = { id: 'p-1', name: 'Nursing', duration_months: 36, application_fee: '153' }

    const fromArray = normalizeProgramsResponse([raw] as never)
    const fromResults = normalizeProgramsResponse({ results: [raw] } as never)

    for (const shape of [fromArray, fromResults]) {
      expect(shape.programs).toHaveLength(1)
      const program = shape.programs[0]
      expect(program.id).toBe('p-1')
      // duration_months → duration_years coercion over documented fields
      expect(program.duration_years).toBe(3)
      // application_fee string coerced to number
      expect(program.application_fee).toBe(153)
    }
  })

  // V1 DEPRECATION TEST (task 12.2, R14.5). The `{programs: […]}` third shape
  // above was a domain-keyed list `services/catalog.ts` invented on the way OUT
  // and sniffed for on the way IN. No catalog endpoint puts a domain key inside
  // `data`. The case is inverted rather than deleted so the removal is pinned.
  it('REFUSES the {programs|intakes|subjects|institutions} domain-keyed shape', async () => {
    const {
      normalizeProgramsResponse,
      normalizeIntakesResponse,
      normalizeSubjectsResponse,
      normalizeInstitutionsResponse,
    } = await import('@/services/catalog')

    const row = { id: 'x-1', name: 'Anything' }

    expect(normalizeProgramsResponse({ programs: [row] } as never).programs).toEqual([])
    expect(normalizeIntakesResponse({ intakes: [row] } as never).intakes).toEqual([])
    expect(normalizeSubjectsResponse({ subjects: [row] } as never).subjects).toEqual([])
    expect(
      normalizeInstitutionsResponse({ institutions: [row] } as never).institutions,
    ).toEqual([])
  })

  // V1 DEPRECATION TEST (task 12.2, R14.5). The deleted "first array-valued
  // property" fallback would have found `rows` here and *guessed* it was the
  // list. A normalizer that invents a contract is worse than one that refuses,
  // because the guess is silent.
  it('REFUSES an unrecognised shape instead of guessing which array is the list', async () => {
    const { normalizeProgramsResponse } = await import('@/services/catalog')

    const normalized = normalizeProgramsResponse({
      rows: [{ id: 'p-1', name: 'Nursing' }],
    } as never)

    expect(normalized.programs).toEqual([])
  })

  // V1 DEPRECATION TEST (task 12.2, R14.5). The three mutation readers used to
  // re-unwrap a domain key out of a payload the client had ALREADY unwrapped one
  // `{success, data}` level from — a `{data: {program: {…}}}` double envelope no
  // catalog write emits. Driven through the public service so the assertion is
  // about the wire, not about a private function.
  it('program create reads the record, and REFUSES a second {program} envelope', async () => {
    const { programService } = await import('@/services/catalog')

    // Canonical: the endpoint returns the created offering.
    requestMock.mockResolvedValueOnce({ id: 'p-1', name: 'Nursing', duration_months: 36 })
    const canonical = await programService.create({
      name: 'Nursing',
      duration_years: 3,
      institution_id: 'i-1',
    })
    expect(canonical.program?.id).toBe('p-1')

    // Retired: a second envelope is no longer unwrapped, so nothing is read.
    requestMock.mockResolvedValueOnce({ program: { id: 'p-2', name: 'Clinical' } })
    const doubled = await programService.create({
      name: 'Clinical',
      duration_years: 3,
      institution_id: 'i-1',
    })
    expect(doubled.program).toBeNull()
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

    // Repointed by task 12.2: this case read the `{institutions: […]}`
    // domain-keyed shape, which the strict reader no longer accepts (the
    // dedicated REFUSES case above pins that). Its actual claim is about the
    // per-record map, so it now uses the shape the endpoint publishes.
    const institutions = normalizeInstitutionsResponse({
      results: [{ id: 'ins-1', name: 'MIHAS' }],
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
  it('reads the {…, results} shape every NotificationListView path publishes', async () => {
    const { normalizeNotificationsResponse } = await import('@/services/notifications')

    const result = normalizeNotificationsResponse({
      page: 1,
      pageSize: 20,
      totalCount: 1,
      results: [
        { id: 'n-1', title: 'Hello', message: 'Body', type: 'success', is_read: false, created_at: '2026-01-01T00:00:00Z' },
      ],
    })

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('n-1')
    // is_read → read, message → content (documented field-variant tolerance)
    expect(result[0].read).toBe(false)
    expect(result[0].content).toBe('Body')
    expect(result[0].type).toBe('success')
  })

  it('reads the cursor-mode shape, which is the same {…, results}', async () => {
    const { normalizeNotificationsResponse } = await import('@/services/notifications')

    const result = normalizeNotificationsResponse({
      pageSize: 20,
      totalCount: null,
      after: 'n-9',
      results: [{ id: 'n-2', title: 'B', content: 'y', created_at: '' }],
    })

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('n-2')
  })

  // V1 DEPRECATION TEST (task 12.2, R14.5). This case used to be titled "reads
  // nested data.results / data.notifications paginated shapes". Both required a
  // SECOND `{success, data}` envelope, which `apiClient.request` has already
  // unwrapped, so neither was reachable. The bare-array and `{notifications}`
  // branches went with them. Inverted, not deleted.
  it('REFUSES a second envelope, a bare array and the {notifications} key', async () => {
    const { normalizeNotificationsResponse } = await import('@/services/notifications')

    const row = { id: 'n-1', title: 'A', content: 'x', created_at: '' }

    expect(normalizeNotificationsResponse({ data: { results: [row] } })).toEqual([])
    expect(normalizeNotificationsResponse({ data: { notifications: [row] } })).toEqual([])
    expect(normalizeNotificationsResponse({ data: [row] })).toEqual([])
    expect(normalizeNotificationsResponse({ notifications: [row] })).toEqual([])
    expect(normalizeNotificationsResponse([row])).toEqual([])
  })

  // The deleted `firstArrayValue` helper tried candidate keys in order and kept
  // the first NON-EMPTY array, so an empty canonical page fell THROUGH to the
  // next candidate. "No notifications" and "unrecognised shape" therefore
  // reached the same answer by different routes. A strict read separates them:
  // an empty canonical page is an empty page, full stop.
  it('an EMPTY canonical page is an empty page, not a fall-through', async () => {
    const { normalizeNotificationsResponse } = await import('@/services/notifications')

    expect(
      normalizeNotificationsResponse({
        results: [],
        notifications: [{ id: 'n-9', title: 'stale', content: 'z', created_at: '' }],
      }),
    ).toEqual([])
  })

  it('drops rows without an id and defaults invalid type to info', async () => {
    const { normalizeNotificationsResponse } = await import('@/services/notifications')

    const result = normalizeNotificationsResponse({
      results: [
        { id: 'n-1', title: 'Keep', content: 'x', type: 'not-a-type', created_at: '' },
        { title: 'Drop — no id', content: 'y', created_at: '' },
      ],
    })

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
// 4. Interviews — strict generated-contract mapping (interviewsService.list)
// ===========================================================================
//
// interviews.ts is the reference-converted domain service (task 1.5): it
// consumes the generated `ApplicationInterview` contract and trusts the unified
// client's single envelope unwrap. The permissive `normalizeInterviewsResponse`
// (bare array / {data} / {data:{interviews}} / {results} sniffing) was deleted
// per R14.5 — these assertions pin the strict post-unwrap contract instead.

describe('interviews — strict generated-contract mapping', () => {
  it('interviewsService.list maps the unwrapped ApplicationInterview[] and sorts by schedule', async () => {
    requestMock.mockResolvedValue([
      { id: 'iv-late', application_id: 'a-1', scheduled_at: '2026-05-01T10:00:00Z', mode: 'virtual', location: null, status: 'scheduled', notes: null, program: 'Nursing', application_number: 'APP-1' },
      { id: 'iv-early', application_id: 'a-1', scheduled_at: '2026-03-01T10:00:00Z', mode: 'virtual', location: null, status: 'scheduled', notes: null, program: 'Nursing', application_number: 'APP-1' },
    ])

    const { interviewsService } = await import('@/services/interviews')
    const result = await interviewsService.list()

    expect(Array.isArray(result.interviews)).toBe(true)
    expect(result.interviews.map((i) => i.id)).toEqual(['iv-early', 'iv-late'])
  })

  it('narrows mode/status and defaults nullable optionals to null', async () => {
    requestMock.mockResolvedValue([
      { id: 'iv-1', application_id: 'a-1', scheduled_at: '2026-03-01T10:00:00Z', mode: 'phone', status: 'scheduled', program: 'Nursing', application_number: 'APP-1' },
    ])

    const { interviewsService } = await import('@/services/interviews')
    const { interviews } = await interviewsService.list('a-1')

    expect(interviews).toHaveLength(1)
    expect(interviews[0].mode).toBe('phone')
    expect(interviews[0].status).toBe('scheduled')
    // location/notes absent on the wire → defaulted to null by the mapper
    expect(interviews[0].location).toBeNull()
    expect(interviews[0].notes).toBeNull()
  })

  it('returns an empty list when the client yields null (no envelope data)', async () => {
    requestMock.mockResolvedValue(null)

    const { interviewsService } = await import('@/services/interviews')
    const result = await interviewsService.list()

    expect(result.interviews).toEqual([])
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
      system_health: 'degraded',
    })

    expect(stats.totalApplications).toBe(42)
    expect(stats.pendingApplications).toBe(5)
    // Task 9.2: the health vocabulary is the three states the backend *derives*
    // from whether each metric source answered. The retired adjectives
    // (`excellent`/`good`/`warning`/`critical`) normalise to `null`, because the
    // platform never measured them (ADM-02).
    expect(stats.systemHealth).toBe('degraded')
    expect(normalizeStats({ system_health: 'warning' }).systemHealth).toBeNull()
    expect(normalizeStats({ system_health: 'good' }).systemHealth).toBeNull()
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
    // Task 9.2: the **metric registry** is what the dashboard reads, so the
    // compatibility `stats` block is derived from it rather than from the legacy
    // `applications` / `users` / `needs_attention` blocks. Those blocks are still
    // sent (and still asserted below through the status breakdown), but a number
    // that has no metric is no longer invented from them.
    const metric = (key: string, value: number | null) => ({
      key,
      value,
      state: value === null ? 'unknown' : 'ok',
      definition: `Definition for ${key}.`,
      scope: 'institution',
      source: key.startsWith('staff_accounts') ? 'accounts' : 'applications',
    })
    requestMock.mockResolvedValue({
      metrics: {
        total_applications: metric('total_applications', 10),
        decision_queue: metric('decision_queue', 5),
        accepted_path: metric('accepted_path', 4),
        rejected: metric('rejected', 1),
        payment_review: metric('payment_review', 1),
        pending_documents: metric('pending_documents', 2),
        staff_accounts_total: metric('staff_accounts_total', 50),
        staff_accounts_enabled: metric('staff_accounts_enabled', 30),
      },
      sources: { applications: { state: 'ok', reason: null }, accounts: { state: 'ok', reason: null } },
      health: { state: 'operational', definition: 'Every metric source answered this request.' },
      freshness: { generated_at: '2026-01-02T00:00:00Z', stale_after_seconds: 120 },
      scope: { kind: 'platform', institution_id: null, all_access: true, institution_count: null },
      windows: { review_sla_days: 5, deadline_pressure_hours: 48 },
      applications: {
        total: 10,
        by_status: { submitted: 3, under_review: 2, approved: 4, rejected: 1 },
        today_activity: 2,
        this_week: 5,
        this_month: 8,
      },
      users: { total: 50, enabled: 30 },
      needs_attention: { payment_review: 1, pending_documents: 2 },
      recent_activity: [{ id: 'act-1', action: 'PUT', entity_type: 'applications', created_at: '2026-01-01T00:00:00Z' }],
      generated_at: '2026-01-02T00:00:00Z',
      no_school_access: false,
    })

    const { adminDashboardService } = await import('@/services/admin/dashboard')
    const data = await adminDashboardService.getOverview()

    // The registry is carried through verbatim, definitions and all.
    expect(data.metrics.total_applications?.value).toBe(10)
    expect(data.metrics.total_applications?.state).toBe('ok')
    expect(data.metrics.staff_accounts_enabled?.definition).toContain('staff_accounts_enabled')
    expect(data.health?.state).toBe('operational')
    expect(data.freshness.staleAfterSeconds).toBe(120)
    expect(data.scope?.allAccess).toBe(true)

    // …and the compatibility block is derived from it.
    expect(data.stats.totalApplications).toBe(10)
    expect(data.stats.pendingApplications).toBe(5) // decision_queue
    expect(data.stats.totalStudents).toBe(50)
    expect(data.stats.pendingPayments).toBe(1)
    expect(data.stats.systemHealth).toBe('operational')
    expect(data.recentActivity).toHaveLength(1)
    expect(data.noSchoolAccess).toBe(false)
    expect(data.generatedAt).toBe('2026-01-02T00:00:00.000Z')
  })

  it('adminDashboardService.getOverview returns an empty typed response for a non-object payload', async () => {
    requestMock.mockResolvedValue(null)

    const { adminDashboardService } = await import('@/services/admin/dashboard')
    const data = await adminDashboardService.getOverview()

    // Task 9.2: an unusable payload carries **no** metrics and **no** health
    // claim, so every tile renders "Unknown". The legacy numeric block still
    // types out as zeros, and nothing on the dashboard reads it.
    expect(data.metrics).toEqual({})
    expect(data.health).toBeNull()
    expect(data.stats.systemHealth).toBeNull()
    expect(data.freshness.generatedAt).toBeNull()
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

  // V1 DEPRECATION TEST (task 12.2, R14.5). Was "tolerates the legacy
  // {entries,count} shape". `AdminAuditLogView` returns
  // `paginator.get_paginated_response`, and this platform's paginator publishes
  // `{page, pageSize, totalCount, results}` — no `entries`, and `count` is DRF's
  // DEFAULT key, i.e. a rival pagination contract. Reading it meant a silent
  // regression to DRF defaults would have kept the audit page rendering.
  it('REFUSES the legacy {entries,count} shape — entries is not a key, count is a rival contract', async () => {
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

    expect(result.entries).toEqual([])
    expect(result.totalCount).toBe(0)
  })

  // `totalPages` and `summary` are deliberately still read when present. They
  // are NOT rival contracts — the server does not send them, the client derives
  // both, and if a later task publishes them the derivation steps aside. The
  // distinction from `count` is the point: `count` names a different pagination
  // contract; `totalPages` names the same one more completely.
  it('still prefers a server-published totalPages/summary over the derived ones', async () => {
    requestMock.mockResolvedValue({
      page: 1,
      pageSize: 50,
      totalCount: 120,
      totalPages: 3,
      results: [],
      summary: {
        totalEntries: 120,
        uniqueActors: 7,
        criticalActions: 2,
        failedActions: 1,
      },
    })

    const { adminAuditService } = await import('@/services/admin/audit')
    const result = await adminAuditService.list({ page: 1, pageSize: 50 })

    expect(result.totalPages).toBe(3)
    expect(result.summary.uniqueActors).toBe(7)
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

  // V1 DEPRECATION TEST (task 12.2, R14.5). Was "normalizes the
  // {sessions,count} object payload". `SessionListView` returns
  // `{"success": true, "data": [ … ]}` — a bare array after the client's single
  // envelope unwrap — and has neither a `sessions` key nor a `count`. It is
  // unpaginated and capped at 10 rows, so it publishes no total at all: the
  // `count` override this case asserted could never fire, and `sessions.length`
  // was always the answer.
  it('REFUSES the {sessions,count} object payload — neither key exists', async () => {
    requestMock.mockResolvedValue({
      sessions: [{ id: 's-1', device_info: 'Firefox', last_activity: '2026-01-01T00:00:00Z', created_at: '2025-12-01T00:00:00Z' }],
      count: 1,
    })

    const { listActiveSessions } = await import('@/services/sessionService')
    const result = await listActiveSessions()

    // Refusing a shape is not an error path — the read still succeeds — but
    // nothing is read out of it, and the count is the (empty) list length rather
    // than the server's rival `count`.
    expect(result.success).toBe(true)
    expect(result.sessions).toEqual([])
    expect(result.count).toBe(0)
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
