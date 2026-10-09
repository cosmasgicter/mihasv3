/**
 * The applications roster reads the server, and only the server (task 9.1).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.1 — "Create one
 * scoped applications query and aggregate contract".
 * Requirements: **R8.1** (list, filters, facets, search, pagination, aggregates,
 * and dashboard links are served by one scoped query contract and never infer
 * portfolio totals from one page), **R8.6** (authoritative, definition-labelled
 * metrics; missing data never becomes a healthy zero), R6.5 (page-independent,
 * capability-gated export).
 * Findings: **ADM-01** — "Application totals, filters, and select options are
 * derived from the currently loaded page."
 *
 * These drive the **real** `useApplicationsData` against a mocked roster
 * service, so what is measured is the wiring the finding was about:
 *
 *   1. the whole query — every filter, the sort, and the page — reaches the
 *      server in the registered parameter names;
 *   2. the headline numbers are the server's `aggregates` and **do not move**
 *      when the operator turns a page;
 *   3. the filter options are the server's `facets`, so an offering with no row
 *      on the loaded page is still offered as a filter;
 *   4. no answer is `null`, never a zeroed shape, so a loading or failed read
 *      cannot be read as "nothing to do";
 *   5. the export drops the page and follows the backend's `can_export`.
 *
 * The backend authority half — scope before lookup, aggregates equal to an
 * independent SQL count, masked cross-tenant filters, audited export — lives in
 * `backend/tests/unit/test_application_query_contract_9_1.py`. The vocabulary
 * half lives in `tests/unit/applicationRosterDeepLinks.test.ts`.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getRoster = vi.fn()
const downloadExport = vi.fn()
const rosterExportPath = vi.fn(
  (query: Record<string, unknown>) => `/admin/applications/?export=csv&spy=${JSON.stringify(query)}`,
)

vi.mock('@/services/admin/applications', async () => {
  const actual = await vi.importActual<typeof import('@/services/admin/applications')>(
    '@/services/admin/applications',
  )
  return {
    ...actual,
    applicationRosterService: {
      getRoster: (...args: unknown[]) => getRoster(...args),
      rosterExportPath: (...args: unknown[]) => rosterExportPath(...(args as [Record<string, unknown>])),
      downloadExport: (...args: unknown[]) => downloadExport(...args),
      listSavedFilters: vi.fn(),
      saveFilter: vi.fn(),
      deleteFilter: vi.fn(),
    },
  }
})

import { useApplicationsData } from '@/hooks/admin/useApplicationsData'
import { DEFAULT_APPLICATION_FILTERS, type ApplicationFilters } from '@/hooks/admin/useApplicationFilters'
import { facetToOptions } from '@/pages/admin/Applications'
import type { ApplicationRosterReport } from '@/services/admin/applications'

const repoRoot = resolve(__dirname, '../../../..')
const read = (relative: string) => readFileSync(resolve(repoRoot, relative), 'utf8')

/**
 * Source with comments stripped.
 *
 * The scan below asks what the roster *does*, and these files deliberately name
 * the retired patterns in prose ("instead of `[...new Set(rows.map(...))]`") so
 * the next reader knows what was removed and why. A scan that read the
 * explanation as the offence would push that explanation out of the code.
 */
const readCode = (relative: string) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

/**
 * The whole-filtered-set counters for a 2-page portfolio.
 *
 * `total: 57` against a 25-row page is the point: before 9.1 the surface counted
 * the rows it had and called the answer the portfolio.
 */
const AGGREGATES = {
  total: 57,
  draft_count: 9,
  submitted_count: 18,
  under_review_count: 7,
  decision_queue_count: 25,
  waitlisted_count: 3,
  approved_count: 6,
  conditionally_approved_count: 2,
  enrolled_count: 4,
  accepted_count: 12,
  rejected_count: 5,
  withdrawn_count: 1,
  payment_resolved_count: 30,
  payment_pending_count: 11,
  payment_rejected_count: 2,
  payment_unpaid_count: 14,
  late_submission_count: 4,
  unassigned_count: 20,
  overdue_review_count: 6,
  deadline_pressure_count: 3,
  today_activity_count: 8,
  first_created_at: '2026-01-04T08:00:00Z',
  last_activity_at: '2026-08-06T06:30:00Z',
  next_deadline_at: '2026-08-08T12:00:00Z',
  review_sla_days: 5,
  deadline_pressure_hours: 48,
  row_limit: 5000,
  definitions: {
    decision_queue_count: 'Applications awaiting a staff decision (submitted or under review).',
    deadline_pressure_count: 'An open condition or enrollment confirmation falls due within 48h.',
  },
}

const row = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  application_number: `APP-20260806-${id}`,
  public_tracking_code: null,
  full_name: `Applicant ${id}`,
  email: `${id}@example.test`,
  phone: null,
  status: 'submitted',
  payment_status: 'pending_review',
  institution_id: 'inst-a',
  institution_name: 'Example School',
  program_offering_id: 'offering-nursing',
  program_name: 'Nursing',
  intake_id: 'intake-jan',
  intake_name: 'January 2027',
  assigned_reviewer_id: null,
  is_late_submission: false,
  waitlist_position: null,
  next_deadline_at: null,
  submitted_at: '2026-08-01T09:00:00Z',
  created_at: '2026-07-20T09:00:00Z',
  updated_at: '2026-08-01T09:00:00Z',
  activity_at: '2026-08-01T09:00:00Z',
  ...overrides,
})

/**
 * The facets deliberately name an offering that has **no row** on either page.
 * A `new Set(rows.map(...))` cannot produce it, so its presence in the select is
 * proof the options are the server's.
 */
const FACETS = {
  status: {
    options: [
      { value: 'submitted', label: 'Submitted', count: 18 },
      { value: 'under_review', label: 'Under review', count: 7 },
    ],
    truncated: false,
  },
  program_offering: {
    options: [
      { value: 'offering-nursing', label: 'Nursing', count: 40 },
      { value: 'offering-pharmacy', label: 'Pharmacy', count: 17 },
    ],
    truncated: false,
  },
  institution: {
    options: [{ value: 'inst-a', label: 'Example School', count: 57 }],
    truncated: false,
  },
}

const report = (overrides: Partial<ApplicationRosterReport> = {}): ApplicationRosterReport =>
  ({
    page: 1,
    pageSize: 25,
    totalCount: 57,
    totalPages: 3,
    results: [row('r1')],
    aggregates: AGGREGATES,
    facets: FACETS,
    filters: {
      ...({} as ApplicationRosterReport['filters']),
      status: [],
      exclude_status: [],
      payment_status: [],
      sort: 'activity_at',
      order: 'desc',
      unknown_parameters: [],
    },
    redaction: { applied: true, withheld_fields: ['peer_offering_count'] },
    can_export: false,
    ...overrides,
  }) as ApplicationRosterReport

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const filtersWith = (partial: Partial<ApplicationFilters> = {}): ApplicationFilters => ({
  ...DEFAULT_APPLICATION_FILTERS,
  ...partial,
})

beforeEach(() => {
  getRoster.mockReset()
  downloadExport.mockReset()
  rosterExportPath.mockClear()
  getRoster.mockResolvedValue(report())
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// 1. The whole query reaches the server
// ---------------------------------------------------------------------------

describe('the query is the server\'s question, in registered names (R8.1)', () => {
  it('sends every active filter, the sort, and the page', async () => {
    renderHook(
      () =>
        useApplicationsData(
          filtersWith({
            searchTerm: 'mwansa',
            paymentFilter: 'pending_review',
            reviewQueueFilter: 'true',
            deadlinePressureFilter: 'true',
          }),
          { pageSize: 25, sort: 'deadline', order: 'asc' },
        ),
      { wrapper },
    )

    await waitFor(() => expect(getRoster).toHaveBeenCalled())
    expect(getRoster).toHaveBeenCalledWith({
      search: 'mwansa',
      payment_status: 'pending_review',
      review_queue: 'true',
      deadline_pressure: 'true',
      sort: 'deadline',
      order: 'asc',
      page: 1,
      pageSize: 25,
    })
  })

  it('asks a different question when a filter changes rather than re-slicing the answer', async () => {
    const { rerender } = renderHook(
      ({ filters }: { filters: ApplicationFilters }) => useApplicationsData(filters),
      { wrapper, initialProps: { filters: filtersWith() } },
    )
    await waitFor(() => expect(getRoster).toHaveBeenCalledTimes(1))

    rerender({ filters: filtersWith({ statusFilter: 'under_review' }) })

    await waitFor(() => expect(getRoster).toHaveBeenCalledTimes(2))
    expect(getRoster.mock.calls[1][0]).toMatchObject({ status: 'under_review' })
  })
})

// ---------------------------------------------------------------------------
// 2. The totals are the server's, and paging cannot move them
// ---------------------------------------------------------------------------

describe('the totals are the server\'s aggregates, not the loaded page (ADM-01)', () => {
  it('reports the whole-set total while holding one page of rows', async () => {
    const { result } = renderHook(() => useApplicationsData(filtersWith()), { wrapper })

    await waitFor(() => expect(result.current.aggregates).not.toBeNull())
    expect(result.current.applications).toHaveLength(1)
    expect(result.current.aggregates?.total).toBe(57)
    expect(result.current.aggregates?.decision_queue_count).toBe(25)
    expect(result.current.pagination.totalCount).toBe(57)
    // The page count is the server's arithmetic; the browser divides nothing.
    expect(result.current.pagination.totalPages).toBe(3)
  })

  it('keeps every aggregate identical on page 2 while the rows change', async () => {
    getRoster.mockImplementation(async (query: { page?: number }) =>
      query.page === 2
        ? report({ page: 2, results: [row('r2', { status: 'approved' })] })
        : report(),
    )

    const { result } = renderHook(() => useApplicationsData(filtersWith()), { wrapper })
    await waitFor(() => expect(result.current.applications[0]?.id).toBe('r1'))
    const firstPageAggregates = result.current.aggregates

    act(() => result.current.goToPage(2))

    await waitFor(() => expect(result.current.applications[0]?.id).toBe('r2'))
    expect(result.current.pagination.currentPage).toBe(2)
    // Byte-for-byte: turning a page asks for different rows, not different facts.
    expect(result.current.aggregates).toEqual(firstPageAggregates)
    expect(result.current.aggregates?.total).toBe(57)
  })

  it('carries a definition for the metrics an operator acts on (R8.6)', async () => {
    const { result } = renderHook(() => useApplicationsData(filtersWith()), { wrapper })
    await waitFor(() => expect(result.current.aggregates).not.toBeNull())
    expect(result.current.aggregates?.definitions.decision_queue_count).toContain('awaiting')
    expect(result.current.aggregates?.deadline_pressure_hours).toBe(48)
  })
})

// ---------------------------------------------------------------------------
// 3. Filter options are the server's facets
// ---------------------------------------------------------------------------

describe('filter options are the server\'s facets over the filtered set (ADM-01)', () => {
  it('offers an option that has no row on the loaded page', async () => {
    const { result } = renderHook(() => useApplicationsData(filtersWith()), { wrapper })
    await waitFor(() => expect(result.current.facets.program_offering).toBeTruthy())

    const loadedOfferings = new Set(result.current.applications.map(app => app.program_offering_id))
    expect(loadedOfferings.has('offering-pharmacy')).toBe(false)

    const options = facetToOptions(result.current.facets.program_offering)
    expect(options.map(option => option.value)).toContain('offering-pharmacy')
    // Each option carries its own whole-set count, which a harvested set cannot.
    expect(options.find(option => option.value === 'offering-pharmacy')?.label).toBe('Pharmacy (17)')
  })

  it('drops an option with no value rather than rendering a blank choice', () => {
    const options = facetToOptions({
      options: [
        { value: null, label: 'Unassigned', count: 4 },
        { value: 'inst-a', label: 'Example School', count: 57 },
      ],
      truncated: false,
    })
    expect(options).toHaveLength(1)
    expect(options[0].value).toBe('inst-a')
  })
})

// ---------------------------------------------------------------------------
// 4. No answer is null, never a healthy zero
// ---------------------------------------------------------------------------

describe('missing data is absence, not a healthy zero (R8.6)', () => {
  it('reports null aggregates while the server has not answered', () => {
    let release: ((value: ApplicationRosterReport) => void) | undefined
    getRoster.mockImplementation(
      () => new Promise<ApplicationRosterReport>(resolve => { release = resolve }),
    )

    const { result } = renderHook(() => useApplicationsData(filtersWith()), { wrapper })

    expect(result.current.isInitialLoading).toBe(true)
    expect(result.current.aggregates).toBeNull()
    expect(result.current.facets).toEqual({})
    release?.(report())
  })

  it('reports null aggregates when the read fails, and surfaces the error', async () => {
    getRoster.mockRejectedValue(new Error('scope resolution failed'))

    const { result } = renderHook(() => useApplicationsData(filtersWith()), { wrapper })

    await waitFor(() => expect(result.current.error).toBe('scope resolution failed'))
    expect(result.current.aggregates).toBeNull()
    expect(result.current.applications).toEqual([])
  })

  it('leaves detail-only fields null on a roster row instead of zeroing them', async () => {
    const { result } = renderHook(() => useApplicationsData(filtersWith()), { wrapper })
    await waitFor(() => expect(result.current.applications).toHaveLength(1))

    const summary = result.current.applications[0]
    expect(summary.points).toBeNull()
    expect(summary.total_subjects).toBeNull()
    expect(summary.completionPercentage).toBeNull()
    expect(summary.application_fee).toBeNull()
  })

  it('surfaces a parameter the contract does not implement', async () => {
    getRoster.mockResolvedValue(
      report({
        filters: {
          ...report().filters,
          unknown_parameters: ['mysteryFilter'],
        },
      }),
    )

    const { result } = renderHook(() => useApplicationsData(filtersWith()), { wrapper })
    await waitFor(() => expect(result.current.unknownParameters).toEqual(['mysteryFilter']))
  })
})

// ---------------------------------------------------------------------------
// 5. The export is the server's, and it is page-independent
// ---------------------------------------------------------------------------

describe('the export is a page-independent, capability-gated command (R6.5)', () => {
  it('exports the filters the operator is looking at, from whichever page', async () => {
    getRoster.mockImplementation(async (query: { page?: number }) =>
      query.page === 2 ? report({ page: 2, results: [row('r2')] }) : report(),
    )

    const { result } = renderHook(() => useApplicationsData(filtersWith({ statusFilter: 'submitted' })), {
      wrapper,
    })
    await waitFor(() => expect(result.current.aggregates).not.toBeNull())

    act(() => result.current.goToPage(2))
    await waitFor(() => expect(result.current.pagination.currentPage).toBe(2))

    await act(async () => { await result.current.exportRoster() })

    expect(rosterExportPath).toHaveBeenCalledTimes(1)
    // The filters travel to the export; the page is handed over only so the
    // export path can drop it (asserted against the real function below).
    expect(rosterExportPath.mock.calls[0][0]).toMatchObject({ status: 'submitted', page: 2 })
    expect(downloadExport.mock.calls[0][0] as string).toContain('export=csv')
  })

  it('builds an export URL with no page at all', async () => {
    // The real path builder, not the spy: this is where page-independence is
    // decided, and a file whose contents depended on the page an operator
    // happened to be on would be a different document each time.
    const actual = await vi.importActual<typeof import('@/services/admin/applications')>(
      '@/services/admin/applications',
    )
    const path = actual.applicationRosterService.rosterExportPath({
      status: 'submitted',
      page: 4,
      pageSize: 25,
    })
    expect(path).toContain('status=submitted')
    expect(path).toContain('export=csv')
    expect(path).not.toContain('page=')
    expect(path).not.toContain('pageSize=')
  })

  it('takes the export affordance from the backend, never from a role', async () => {
    const { result } = renderHook(() => useApplicationsData(filtersWith()), { wrapper })
    await waitFor(() => expect(result.current.aggregates).not.toBeNull())
    expect(result.current.canExport).toBe(false)

    getRoster.mockResolvedValue(report({ can_export: true }))
    const second = renderHook(() => useApplicationsData(filtersWith({ statusFilter: 'approved' })), {
      wrapper,
    })
    await waitFor(() => expect(second.result.current.canExport).toBe(true))
  })

  it('reports what the server withheld', async () => {
    const { result } = renderHook(() => useApplicationsData(filtersWith()), { wrapper })
    await waitFor(() => expect(result.current.redactedFields).toEqual(['peer_offering_count']))
  })
})

// ---------------------------------------------------------------------------
// 6. The habits ADM-01 recorded cannot come back
// ---------------------------------------------------------------------------

describe('the page-derived habits cannot return (ADM-01 source scan)', () => {
  const rosterSources = [
    'apps/admissions/src/pages/admin/Applications.tsx',
    'apps/admissions/src/hooks/admin/useApplicationsData.ts',
  ]

  it('reads the server aggregates and facets on the roster page', () => {
    const page = read('apps/admissions/src/pages/admin/Applications.tsx')
    expect(page).toContain('aggregates')
    expect(page).toContain('facets')
    expect(page).toContain('facetToOptions')
  })

  it('never harvests filter options from the loaded rows', () => {
    for (const path of rosterSources) {
      const source = readCode(path)
      // `new Set(applications.map(...))` was how the program and institution
      // selects were built: an offering with no row on page 1 was not offered.
      expect(source, `${path} harvests options from loaded rows`).not.toMatch(
        /new Set\(\s*(applications|rows|results|report)/,
      )
    }
  })

  it('never counts a portfolio number out of the loaded rows', () => {
    for (const path of rosterSources) {
      const source = readCode(path)
      expect(source, `${path} counts rows to make a total`).not.toMatch(
        /(applications|rows|results)\s*\.filter\([^)]*\)\s*\.length/,
      )
      expect(source, `${path} reduces rows into a total`).not.toMatch(
        /(applications|rows|results)\s*\.reduce\(/,
      )
    }
  })

  it('does not accumulate pages into one growing array', () => {
    const hook = readCode('apps/admissions/src/hooks/admin/useApplicationsData.ts')
    // "Load more" used to mean "51 loaded rows" and a `loadedCount` an operator
    // read as a total. Paging is now a server page.
    expect(hook).not.toMatch(/setApplications\(\s*(prev|previous)/)
    expect(hook).toContain('report?.totalPages')
  })

  it('no longer wires the page-derived overview builder into any surface', () => {
    // `buildApplicationsOverview` is the finding itself; it may survive only as
    // history, never as a consumer of a rendered page.
    for (const path of rosterSources) {
      expect(readCode(path)).not.toContain('buildApplicationsOverview')
    }
  })
})
