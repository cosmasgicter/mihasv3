/**
 * A dashboard number is either measured or unknown (Admissions V2, task 9.2).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.2 — "Make
 * dashboard metrics truthful".
 * Requirements: **R8.6** (metrics are authoritative, scope-aware,
 * definition-labelled, and explicit about loading, stale, error, and unknown
 * states; missing data never becomes a healthy zero), **R17.4** / **R17.6** (an
 * honest degraded state, never a failure relabelled as success).
 * Findings: **ADM-02** (missing metrics synthesized as healthy zeros, scoped
 * polling losing institution scope, enabled accounts labelled online users),
 * **MAINT-02** (decorative metrics and misleading labels).
 *
 * Three claims, in three registers, because ADM-02 was three separate defects:
 *
 *   1. **the vocabulary is one vocabulary** — the frontend metric keys are
 *      parsed out of the backend registry, not mirrored from it, so a new
 *      backend metric cannot render as an unlabelled number and a deleted one
 *      cannot render as a permanent "Unknown";
 *   2. **a failed source renders unknown, not zero** — asserted through the
 *      normalizer (the code path every failure used to route to
 *      `createEmptyDashboardResponse()`, which returned fourteen zeros and
 *      `systemHealth: 'good'`) and through the loader reducer;
 *   3. **a poll cannot change which school the numbers describe** — the reducer
 *      refuses a patch whose institution is not the one on screen.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act } from 'react'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DASHBOARD_METRIC_KEYS,
  DASHBOARD_TILE_METRICS,
  UNKNOWN_METRIC_LABEL,
  formatMetricValue,
  freshnessLabel,
  healthNotice,
  isMetricUnknown,
  isStale,
  metricHelper,
  type DashboardMetric,
} from '@/pages/admin/lib/dashboardMetrics'
import { ROSTER_DEEP_LINK_QUERIES } from '@/pages/admin/lib/rosterDeepLinks'

const repoRoot = resolve(__dirname, '../../../..')
const read = (relative: string) => readFileSync(resolve(repoRoot, relative), 'utf8')

/**
 * A file with its comments removed.
 *
 * The copy assertions below are about what the dashboard *renders*, and the
 * comments in `Dashboard.tsx` deliberately quote the retired copy they replaced
 * ("N active users online") so the next reader knows what was wrong. Scanning
 * raw source would make documenting the defect indistinguishable from shipping
 * it.
 */
const readCode = (relative: string) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')

const backendSource = () => read('backend/apps/accounts/dashboard_metrics.py')

/** The backend registry's application metric keys, parsed from its own dict. */
const backendApplicationMetricKeys = (): string[] => {
  const source = backendSource()
  const block = source.match(
    /APPLICATION_METRIC_COUNTERS:\s*dict\[str,\s*str\]\s*=\s*\{([\s\S]*?)\n\}/,
  )
  expect(block, 'APPLICATION_METRIC_COUNTERS must be declared').toBeTruthy()
  return [...(block as RegExpMatchArray)[1]!.matchAll(/"([a-z_]+)":\s*"[a-z_]+"/g)].map(
    (m) => m[1]!,
  )
}

/** The backend registry's non-application metric keys. */
const backendAccountMetricKeys = (): string[] => {
  const source = backendSource()
  const block = source.match(
    /_ACCOUNT_METRICS:\s*tuple\[DashboardMetric,\s*\.\.\.\]\s*=\s*\(([\s\S]*?)\n\)/,
  )
  expect(block, '_ACCOUNT_METRICS must be declared').toBeTruthy()
  return [...(block as RegExpMatchArray)[1]!.matchAll(/key="([a-z_]+)"/g)].map((m) => m[1]!)
}

const metric = (over: Partial<DashboardMetric> = {}): DashboardMetric => ({
  key: 'decision_queue',
  value: 12,
  state: 'ok',
  definition: 'Applications waiting on a staff decision.',
  scope: 'institution',
  source: 'applications',
  ...over,
})

describe('the metric vocabulary has one author (R8.6)', () => {
  it('mirrors exactly the backend registry, in its order', () => {
    const expected = [...backendApplicationMetricKeys(), ...backendAccountMetricKeys()]
    expect(expected.length).toBeGreaterThan(10)
    expect([...DASHBOARD_METRIC_KEYS]).toEqual(expected)
  })

  it('declares no key twice', () => {
    expect(new Set(DASHBOARD_METRIC_KEYS).size).toBe(DASHBOARD_METRIC_KEYS.length)
  })

  it('pairs every exception tile with a metric and a registered roster query', () => {
    // The backend pairs the counter with the query in `DASHBOARD_TILES`; the
    // frontend must offer a link for each. Six tiles, six links, one per metric.
    expect(DASHBOARD_TILE_METRICS.length).toBe(Object.keys(ROSTER_DEEP_LINK_QUERIES).length)
    for (const key of DASHBOARD_TILE_METRICS) {
      expect(DASHBOARD_METRIC_KEYS).toContain(key)
    }
    const dashboard = read('apps/admissions/src/pages/admin/Dashboard.tsx')
    for (const key of DASHBOARD_TILE_METRICS) {
      expect(dashboard).toContain(`metric: '${key}'`)
    }
  })

  it('states the enabled-account metric is not a presence count (MAINT-02)', () => {
    const source = backendSource()
    const definition = source.match(/key="staff_accounts_enabled",[\s\S]*?definition=\(([\s\S]*?)\),/)
    expect(definition, 'staff_accounts_enabled must carry a definition').toBeTruthy()
    const text = (definition as RegExpMatchArray)[1]!
    expect(text).toContain('enabled to sign in')
    expect(text).toContain('not a')
    expect(text.toLowerCase()).toContain('presence')
    // And nothing the page renders says otherwise.
    const dashboard = readCode('apps/admissions/src/pages/admin/Dashboard.tsx')
    expect(dashboard).not.toContain('active users online')
    expect(dashboard).not.toMatch(/active users/)
    // Nor does the quick-actions card call staff accounts "students".
    const quickActions = readCode(
      'apps/admissions/src/components/admin/dashboard/DashboardQuickActions.tsx',
    )
    expect(quickActions).not.toMatch(/students/)
  })

  it('keeps the retired four-value health vocabulary out of the page', () => {
    const dashboard = readCode('apps/admissions/src/pages/admin/Dashboard.tsx')
    for (const retired of ["'excellent'", "'good'", "'critical'"]) {
      expect(dashboard).not.toContain(retired)
    }
  })
})

describe('rendering a metric never invents a number (R8.6, R17.6)', () => {
  it('renders a measured value with its definition', () => {
    const entry = metric()
    expect(formatMetricValue(entry)).toBe('12')
    expect(metricHelper(entry)).toBe('Applications waiting on a staff decision.')
    expect(isMetricUnknown(entry)).toBe(false)
  })

  it('renders a genuine zero as zero, with its definition', () => {
    // A measured zero is a real answer and must stay distinguishable from a
    // missing one — which is the whole distinction ADM-02 collapsed.
    const entry = metric({ value: 0 })
    expect(formatMetricValue(entry)).toBe('0')
    expect(isMetricUnknown(entry)).toBe(false)
    expect(metricHelper(entry)).toContain('waiting on a staff decision')
  })

  it('renders an unknown metric as a word, and gives the reason', () => {
    const entry = metric({
      value: null,
      state: 'unknown',
      reason: 'This metric’s source did not answer (OperationalError).',
    })
    expect(formatMetricValue(entry)).toBe(UNKNOWN_METRIC_LABEL)
    expect(formatMetricValue(entry)).not.toBe('0')
    expect(isMetricUnknown(entry)).toBe(true)
    expect(metricHelper(entry)).toContain('did not answer')
  })

  it('renders an absent metric as unknown rather than zero', () => {
    expect(formatMetricValue(undefined)).toBe(UNKNOWN_METRIC_LABEL)
    expect(isMetricUnknown(undefined)).toBe(true)
  })

  it('refuses an "ok" metric with no value', () => {
    // Defensive: a malformed payload claiming `ok` with `value: null` is not
    // allowed to render as anything numeric.
    const entry = metric({ value: null })
    expect(formatMetricValue(entry)).toBe(UNKNOWN_METRIC_LABEL)
    expect(isMetricUnknown(entry)).toBe(true)
  })
})

describe('freshness is measured, not asserted (R8.6)', () => {
  const now = new Date('2026-08-08T12:00:00.000Z')

  it('says so when nothing has been loaded', () => {
    expect(freshnessLabel(null, now)).toBe('Not loaded yet')
    expect(freshnessLabel({ generatedAt: null, staleAfterSeconds: 120 }, now)).toBe('Not loaded yet')
    // Absent freshness is not "stale" — it is *nothing*, and the label says that.
    expect(isStale({ generatedAt: null, staleAfterSeconds: 120 }, now)).toBe(false)
  })

  it('reports a fresh payload with its age', () => {
    const freshness = { generatedAt: '2026-08-08T11:59:30.000Z', staleAfterSeconds: 120 }
    expect(isStale(freshness, now)).toBe(false)
    expect(freshnessLabel(freshness, now)).toBe('Measured 30s ago')
  })

  it('labels a payload past its budget stale', () => {
    const freshness = { generatedAt: '2026-08-08T11:55:00.000Z', staleAfterSeconds: 120 }
    expect(isStale(freshness, now)).toBe(true)
    expect(freshnessLabel(freshness, now)).toBe('Stale — measured 5m ago')
  })

  it('treats a zero budget as immediately stale', () => {
    // `normalizeFreshness` falls back to 0 when the server sent no budget: with
    // no budget the page must not claim the numbers are current.
    const freshness = { generatedAt: '2026-08-08T11:59:59.000Z', staleAfterSeconds: 0 }
    expect(isStale(freshness, now)).toBe(true)
  })

  it('says nothing when the read was healthy, and speaks when it was not', () => {
    expect(healthNotice({ state: 'operational', definition: 'all good' })).toBe('')
    expect(healthNotice(null)).toBe('')
    expect(
      healthNotice({ state: 'degraded', definition: 'At least one metric source failed.' }),
    ).toBe('At least one metric source failed.')
  })
})

describe('the normalizer never substitutes a zero (ADM-02)', () => {
  it('returns no metrics and no health claim when the payload is unusable', async () => {
    const { createUnknownDashboardResponse } = await import('@/services/admin/dashboard')
    const empty = createUnknownDashboardResponse()
    expect(empty.metrics).toEqual({})
    expect(empty.health).toBeNull()
    expect(empty.stats.systemHealth).toBeNull()
    expect(empty.freshness.generatedAt).toBeNull()
    // Every key renders as "Unknown" through the same function the page uses.
    for (const key of DASHBOARD_METRIC_KEYS) {
      expect(formatMetricValue(empty.metrics[key])).toBe(UNKNOWN_METRIC_LABEL)
    }
  })

  it('keeps the source of a failure out of the browser copy', async () => {
    // The reason names the exception class, never a database message.
    const source = backendSource()
    expect(source).toContain('type(exc).__name__')
    expect(source).not.toMatch(/reason.*str\(exc\)/)
  })
})

describe('a poll answers the question the page asked (ADM-02)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('keys the poll cache by school', async () => {
    const { adminDashboardPollingKey } = await import('@/hooks/useAdminDashboardPolling')
    expect(adminDashboardPollingKey(null)).toEqual(['admin-dashboard-polling', 'all'])
    expect(adminDashboardPollingKey(undefined)).toEqual(['admin-dashboard-polling', 'all'])
    expect(adminDashboardPollingKey('inst-a')).toEqual(['admin-dashboard-polling', 'inst-a'])
    // Two schools never share an entry.
    expect(adminDashboardPollingKey('inst-a')).not.toEqual(adminDashboardPollingKey('inst-b'))
  })

  it('discards a patch for a school the page is not showing', async () => {
    vi.doMock('@/services/admin/dashboard', () => ({
      adminDashboardService: {
        getOverviewWithDiagnostics: vi.fn(async () => ({
          data: {
            metrics: { total_applications: metric({ key: 'total_applications', value: 7 }) },
            sources: { applications: { state: 'ok', reason: null } },
            health: { state: 'operational', definition: 'ok' },
            freshness: { generatedAt: '2026-08-08T12:00:00.000Z', staleAfterSeconds: 120 },
            scope: null,
            windows: {},
            stats: { systemHealth: 'operational' },
            recentActivity: [],
            noSchoolAccess: false,
          },
          diagnostics: {
            endpoint: '/admin/dashboard/',
            ok: true,
            status: 200,
            errorMessage: null,
            responseShape: 'valid',
            requestedAt: '2026-08-08T12:00:00.000Z',
          },
        })),
      },
    }))
    const { useAdminDashboardLoader } = await import('@/hooks/admin/useAdminDashboardLoader')

    const { result } = renderHook(() =>
      useAdminDashboardLoader({ id: 'admin-1' }, 'inst-a'),
    )
    await act(async () => {
      await Promise.resolve()
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(result.current.loadedInstitutionId).toBe('inst-a')
    expect(result.current.metrics.total_applications?.value).toBe(7)

    // A poll that answered for another school is refused outright: it cannot
    // overwrite the numbers, the health claim, or the freshness stamp.
    act(() => {
      result.current.patchMetrics({
        metrics: { total_applications: metric({ key: 'total_applications', value: 999 }) },
        health: { state: 'degraded', definition: 'other school' },
        freshness: { generatedAt: '2026-08-08T12:05:00.000Z', staleAfterSeconds: 120 },
        institutionId: 'inst-b',
      })
    })
    expect(result.current.metrics.total_applications?.value).toBe(7)
    expect(result.current.health?.state).toBe('operational')

    // A poll for the school on screen is accepted.
    act(() => {
      result.current.patchMetrics({
        metrics: { total_applications: metric({ key: 'total_applications', value: 8 }) },
        health: { state: 'operational', definition: 'ok' },
        freshness: { generatedAt: '2026-08-08T12:05:00.000Z', staleAfterSeconds: 120 },
        institutionId: 'inst-a',
      })
    })
    expect(result.current.metrics.total_applications?.value).toBe(8)
  })

  it('invalidates the numbers on a failed read instead of leaving them on screen', async () => {
    vi.doMock('@/services/admin/dashboard', () => ({
      adminDashboardService: {
        getOverviewWithDiagnostics: vi.fn(async () => ({
          data: {
            metrics: {},
            sources: {},
            health: null,
            freshness: { generatedAt: null, staleAfterSeconds: 0 },
            scope: null,
            windows: {},
            stats: { systemHealth: null },
            recentActivity: [],
            noSchoolAccess: false,
          },
          diagnostics: {
            endpoint: '/admin/dashboard/',
            ok: false,
            status: 500,
            errorMessage: 'Server returned 500',
            responseShape: 'invalid',
            requestedAt: '2026-08-08T12:00:00.000Z',
          },
        })),
      },
    }))
    const { useAdminDashboardLoader } = await import('@/hooks/admin/useAdminDashboardLoader')

    const { result } = renderHook(() => useAdminDashboardLoader({ id: 'admin-1' }, null))
    await act(async () => {
      await Promise.resolve()
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(result.current.phase).toBe('error')
    expect(result.current.metrics).toEqual({})
    expect(result.current.health).toBeNull()
    expect(result.current.error).toContain('Server returned 500')
  })
})
