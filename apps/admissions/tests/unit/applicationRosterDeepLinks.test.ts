/**
 * A dashboard link is the roster's query, in the roster's own words (task 9.1).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.1 — "Make
 * dashboard deep links use registered query parameters".
 * Requirements: **R8.1** (one scoped query contract serves the list, its
 * filters, and its dashboard links), **R8.6**.
 * Findings: **ADM-01** — "A dashboard link emits a filter the parser ignores."
 *
 * The finding's second half is a *vocabulary* defect, so the guard against it
 * has to be a vocabulary test. Every parameter this app can put in a roster URL
 * is checked against the backend's own `REGISTERED_PARAMETERS` set, read out of
 * `query_service.py` — not against a copy of it kept here, which is the drift a
 * mirror would introduce.
 *
 * What this pins:
 *
 *   1. every dashboard tile link, every UI-filter → parameter mapping, and
 *      everything `toApplicationRosterQuery` can emit is **registered**;
 *   2. no admin page hand-writes a roster URL any more (the six tiles go through
 *      `rosterDeepLink`), so a seventh tile cannot invent a name;
 *   3. a link round-trips: parse it, re-emit it, and the query is the same;
 *   4. the two links that were previously dropped now parse — the tile's
 *      `deadline_pressure` and the backend review-SLA notification's
 *      `status=submitted,under_review`;
 *   5. a pre-9.1 bookmark in the old UI-state spelling still opens the view it
 *      described, and is rewritten to the registered spelling.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_APPLICATION_FILTERS,
  REGISTERED_PARAMETER_BY_FILTER_KEY,
  ROSTER_URL_PARAMETERS,
  applicationFiltersFromSearchParams,
  applicationFiltersToSearchParams,
  toApplicationRosterQuery,
  type ApplicationFilters,
} from '@/hooks/admin/useApplicationFilters'
import {
  ROSTER_DEEP_LINK_QUERIES,
  rosterDeepLink,
  rosterDeepLinkParameters,
} from '@/pages/admin/lib/rosterDeepLinks'

const repoRoot = resolve(__dirname, '../../../..')
const read = (relative: string) => readFileSync(resolve(repoRoot, relative), 'utf8')

/**
 * The backend's registered parameter set, parsed from the query service.
 *
 * Deliberately parsed rather than mirrored: a mirror is a second source of
 * truth, and the whole finding is about two sides disagreeing about a name.
 */
const backendRegisteredParameters = (): Set<string> => {
  const source = read('backend/apps/applications/query_service.py')
  const block = source.match(/REGISTERED_PARAMETERS:\s*frozenset\[str\]\s*=\s*frozenset\(\s*\{([\s\S]*?)\}\s*\)/)
  expect(block, 'REGISTERED_PARAMETERS must be declared in query_service.py').toBeTruthy()
  const names = [...(block?.[1] ?? '').matchAll(/"([a-zA-Z_]+)"/g)].map(match => match[1])
  expect(names.length).toBeGreaterThan(20)
  return new Set(names)
}

const REGISTERED = backendRegisteredParameters()

const filtersWith = (partial: Partial<ApplicationFilters>): ApplicationFilters => ({
  ...DEFAULT_APPLICATION_FILTERS,
  ...partial,
})

describe('every roster parameter this app can emit is registered on the backend (ADM-01)', () => {
  it('registers every dashboard deep-link parameter', () => {
    const emitted = rosterDeepLinkParameters()
    expect(emitted.length).toBeGreaterThan(0)
    for (const name of emitted) {
      expect(REGISTERED.has(name), `dashboard link parameter "${name}" is not registered`).toBe(true)
    }
  })

  it('registers every UI-filter → parameter mapping', () => {
    for (const name of Object.values(REGISTERED_PARAMETER_BY_FILTER_KEY)) {
      expect(REGISTERED.has(name), `filter maps to unregistered "${name}"`).toBe(true)
    }
  })

  it('registers every parameter the URL writer can put on the address', () => {
    for (const name of ROSTER_URL_PARAMETERS) {
      expect(REGISTERED.has(name), `URL parameter "${name}" is not registered`).toBe(true)
    }
  })

  it('registers every key toApplicationRosterQuery can produce from a fully populated view', () => {
    // Every filter set at once, both spellings of the id-or-label dimensions,
    // so the emitted key set is the widest this function can produce.
    const wide = filtersWith({
      searchTerm: 'mwansa',
      statusFilter: 'submitted',
      paymentFilter: 'pending_review',
      programFilter: '11111111-1111-4111-8111-111111111111',
      institutionFilter: 'Example School',
      draftFilter: 'completed',
      assignedReviewerFilter: 'unassigned',
      lateSubmissionFilter: 'true',
      pendingAmendmentsFilter: 'true',
      reviewQueueFilter: 'true',
      overdueReviewFilter: 'true',
      pendingDocumentsFilter: 'true',
      upcomingInterviewsFilter: 'true',
      deadlinePressureFilter: 'true',
    })
    const query = toApplicationRosterQuery(wide, { page: 2, pageSize: 25, sort: 'deadline', order: 'asc' })
    for (const name of Object.keys(query)) {
      expect(REGISTERED.has(name), `query key "${name}" is not registered`).toBe(true)
    }
    // The id-or-label duality resolves to the id parameter for a canonical id
    // and to the label parameter for a name — never both for one dimension.
    expect(query.program_offering_id).toBe('11111111-1111-4111-8111-111111111111')
    expect(query.program).toBeUndefined()
    expect(query.institution).toBe('Example School')
    expect(query.institution_id).toBeUndefined()
  })
})

describe('no admin surface hand-writes a roster URL any more', () => {
  it('routes every dashboard tile through rosterDeepLink', () => {
    const dashboard = read('apps/admissions/src/pages/admin/Dashboard.tsx')
    expect(dashboard).not.toMatch(/["']\/admin\/applications\?/)
    for (const name of Object.keys(ROSTER_DEEP_LINK_QUERIES)) {
      expect(dashboard).toContain(`rosterDeepLink('${name}')`)
    }
  })

  it('keeps the retired UI-state spellings out of every emitted link', () => {
    // These are the exact names the six tiles used before 9.1. They remain
    // *accepted* on the way in (old bookmarks), but nothing may emit them.
    const retired = [
      'overdueReviewFilter=',
      'reviewQueueFilter=',
      'pendingDocumentsFilter=',
      'paymentFilter=',
      'upcomingInterviewsFilter=',
      'deadlinePressureFilter=',
    ]
    const emitted = Object.values(ROSTER_DEEP_LINK_QUERIES).join('&')
    for (const name of retired) {
      expect(emitted).not.toContain(name)
    }
  })
})

describe('a link round-trips through the roster (R8.1)', () => {
  it.each(Object.entries(ROSTER_DEEP_LINK_QUERIES))(
    'parses and re-emits %s unchanged',
    (_name, query) => {
      const incoming = new URLSearchParams(query)
      const filters = filtersWith(applicationFiltersFromSearchParams(incoming))
      const rewritten = applicationFiltersToSearchParams(filters)

      // The same parameters, with the same values — a link an operator shares
      // reproduces the query it was written from.
      expect(rewritten.toString()).toBe(incoming.toString())
    },
  )

  it('turns each deep link into a server query rather than an unfiltered list', () => {
    for (const query of Object.values(ROSTER_DEEP_LINK_QUERIES)) {
      const filters = filtersWith(applicationFiltersFromSearchParams(new URLSearchParams(query)))
      const serverQuery = toApplicationRosterQuery(filters)
      const emitted = Object.keys(serverQuery)
      expect(emitted.length, `"${query}" produced no server filter`).toBeGreaterThan(0)
      for (const [name, value] of new URLSearchParams(query)) {
        expect((serverQuery as Record<string, unknown>)[name]).toBe(value)
      }
    }
  })

  it('prefixes every deep link with the roster route', () => {
    for (const name of Object.keys(ROSTER_DEEP_LINK_QUERIES)) {
      expect(rosterDeepLink(name as keyof typeof ROSTER_DEEP_LINK_QUERIES)).toMatch(
        /^\/admin\/applications\?[a-z_]+=/,
      )
    }
  })
})

describe('the two links that used to be dropped now filter (ADM-01)', () => {
  it('applies the deadline tile filter instead of showing everything', () => {
    const filters = filtersWith(
      applicationFiltersFromSearchParams(new URLSearchParams('deadline_pressure=true')),
    )
    expect(filters.deadlinePressureFilter).toBe('true')
    expect(toApplicationRosterQuery(filters).deadline_pressure).toBe('true')
  })

  it("applies the backend review-SLA notification's own status link", () => {
    // `review_sla_reminder_task` emits `/admin/applications?status=submitted,under_review`.
    // That parameter was always registered on the backend; the roster simply did
    // not look for it, so the notification opened an unfiltered roster.
    const filters = filtersWith(
      applicationFiltersFromSearchParams(new URLSearchParams('status=submitted,under_review')),
    )
    expect(filters.statusFilter).toBe('submitted,under_review')
    expect(toApplicationRosterQuery(filters).status).toBe('submitted,under_review')
  })

  it('reads the same status link out of the backend task source', () => {
    // Pinned so the notification and the parser cannot drift apart again.
    const task = read('backend/apps/applications/tasks/review_sla.py')
    const match = task.match(/\/admin\/applications\?([^"']+)/)
    expect(match, 'the review-SLA notification must deep-link into the roster').toBeTruthy()
    const filters = filtersWith(applicationFiltersFromSearchParams(new URLSearchParams(match?.[1] ?? '')))
    expect(Object.keys(toApplicationRosterQuery(filters)).length).toBeGreaterThan(0)
  })
})

describe('a pre-9.1 bookmark is understood and upgraded', () => {
  it('accepts the legacy UI-state spelling on the way in', () => {
    const filters = filtersWith(
      applicationFiltersFromSearchParams(
        new URLSearchParams('deadlinePressureFilter=true&paymentFilter=pending_review'),
      ),
    )
    expect(filters.deadlinePressureFilter).toBe('true')
    expect(filters.paymentFilter).toBe('pending_review')
  })

  it('rewrites it to the registered spelling on the way out', () => {
    const filters = filtersWith(
      applicationFiltersFromSearchParams(new URLSearchParams('deadlinePressureFilter=true')),
    )
    const rewritten = applicationFiltersToSearchParams(filters)
    expect(rewritten.get('deadline_pressure')).toBe('true')
    expect(rewritten.has('deadlinePressureFilter')).toBe(false)
  })

  it('lets the registered spelling win when a URL carries both', () => {
    const filters = filtersWith(
      applicationFiltersFromSearchParams(
        new URLSearchParams('paymentFilter=verified&payment_status=pending_review'),
      ),
    )
    expect(filters.paymentFilter).toBe('pending_review')
  })

  it('preserves unrelated query parameters when it canonicalises', () => {
    const params = new URLSearchParams('institution=Example%20School&utm_source=email')
    const filters = filtersWith(applicationFiltersFromSearchParams(params))
    const rewritten = applicationFiltersToSearchParams(filters, params)
    expect(rewritten.get('utm_source')).toBe('email')
    expect(rewritten.get('institution')).toBe('Example School')
  })

  it('clears a filter out of both spellings so a stale one cannot survive', () => {
    const params = new URLSearchParams('deadlinePressureFilter=true&deadline_pressure=true')
    const rewritten = applicationFiltersToSearchParams(DEFAULT_APPLICATION_FILTERS, params)
    expect(rewritten.has('deadline_pressure')).toBe(false)
    expect(rewritten.has('deadlinePressureFilter')).toBe(false)
  })
})

describe('the draft lens round-trips through the registered status parameters', () => {
  it('expresses "drafts only" as status=draft', () => {
    const rewritten = applicationFiltersToSearchParams(filtersWith({ draftFilter: 'drafts' }))
    expect(rewritten.get('status')).toBe('draft')
    const back = filtersWith(applicationFiltersFromSearchParams(rewritten))
    expect(back.draftFilter).toBe('drafts')
    expect(back.statusFilter).toBe('')
  })

  it('expresses "completed only" as exclude_status=draft', () => {
    const rewritten = applicationFiltersToSearchParams(filtersWith({ draftFilter: 'completed' }))
    expect(rewritten.get('exclude_status')).toBe('draft')
    expect(filtersWith(applicationFiltersFromSearchParams(rewritten)).draftFilter).toBe('completed')
  })
})
