/**
 * The admin dashboard's metric contract, frontend half (Admissions V2, task 9.2).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.2 — "Make
 * dashboard metrics truthful".
 * Requirements: **R8.6** (metrics are authoritative, scope-aware,
 * definition-labelled, and explicit about loading, stale, error, and unknown
 * states; missing data never becomes a healthy zero), **R17.4** / **R17.6** (an
 * honest degraded state, never a failure relabelled as success).
 * Findings: **ADM-02**, **MAINT-02**.
 *
 * This module holds no numbers and computes no counters. It is the *vocabulary*:
 * the metric keys the backend registry publishes, the states a metric can be in,
 * and the two pure functions that turn a metric into something renderable.
 *
 * The defect it replaces
 * ----------------------
 * `services/admin/dashboard.ts` shipped a `DEFAULT_STATS` object in which every
 * number was `0` and `systemHealth` was `'good'`, and returned it from **every**
 * failure path. So a 500, a dropped connection, an expired session, and a school
 * with genuinely nothing to do all rendered the same screen — one that said the
 * platform was healthy and there was no work outstanding.
 *
 * Here, a metric is `{ value: number } | { value: null }` with a `state` saying
 * which, and there is no default value to fall back to. "Unknown" is a thing the
 * UI must render, not a thing the code can quietly avoid.
 *
 * The keys mirror `backend/apps/accounts/dashboard_metrics.py`
 * (`APPLICATION_METRIC_COUNTERS` + the account metrics) and are drift-guarded by
 * `apps/admissions/tests/unit/dashboardMetricsTruthful.test.ts`, which parses the
 * backend registry.
 */

/** A metric answered, or its source did not. There is no third option. */
export type DashboardMetricState = 'ok' | 'unknown'

/** Whether a metric source answered this request. */
export type DashboardSourceState = 'ok' | 'failed'

/** Read health, derived by the backend from the sources — never defaulted. */
export type DashboardHealthState = 'operational' | 'degraded' | 'unknown'

/** Whether a number describes the actor's schools or the whole platform. */
export type DashboardMetricScope = 'institution' | 'platform'

export interface DashboardMetric {
  key: string
  /** `null` whenever `state` is `'unknown'`. Never `0` as a stand-in. */
  value: number | null
  state: DashboardMetricState
  /** The sentence stating what this number counts (R8.6). */
  definition: string
  scope: DashboardMetricScope
  source: string
  /** The registered roster query this metric's tile links to, when it has one. */
  rosterQuery?: string
  /** Why the source did not answer, when it did not. */
  reason?: string
}

/**
 * Every metric key the backend registry publishes, in render order.
 *
 * Mirror of `APPLICATION_METRIC_COUNTERS` + the two account metrics in
 * `backend/apps/accounts/dashboard_metrics.py`.
 */
export const DASHBOARD_METRIC_KEYS = [
  'total_applications',
  'decision_queue',
  'accepted_path',
  'rejected',
  'overdue_reviews',
  'deadline_pressure',
  'pending_documents',
  'payment_review',
  'upcoming_interviews',
  'today_activity',
  'applications_this_week',
  'applications_this_month',
  'payment_resolved',
  'payment_unpaid',
  'staff_accounts_total',
  'staff_accounts_enabled',
] as const

export type DashboardMetricKey = (typeof DASHBOARD_METRIC_KEYS)[number]

export type DashboardMetrics = Partial<Record<DashboardMetricKey, DashboardMetric>>

export interface DashboardFreshness {
  /** When the backend computed these numbers. `null` while nothing has landed. */
  generatedAt: string | null
  /** Age at which the numbers should be labelled stale. */
  staleAfterSeconds: number
}

export interface DashboardHealth {
  state: DashboardHealthState
  definition: string
}

export interface DashboardScopeLabel {
  kind: DashboardMetricScope
  institutionId: string | null
  allAccess: boolean
  institutionCount: number | null
}

/** The six exception tiles, keyed by the metric that answers each one. */
export const DASHBOARD_TILE_METRICS = [
  'overdue_reviews',
  'decision_queue',
  'pending_documents',
  'payment_review',
  'upcoming_interviews',
  'deadline_pressure',
] as const satisfies readonly DashboardMetricKey[]

/**
 * What a metric renders as.
 *
 * `'Unknown'` is deliberately a word, not a dash or an empty cell: an operator
 * scanning tiles must be able to tell "we could not find out" from "there is
 * nothing here", and punctuation does not say that.
 */
export const UNKNOWN_METRIC_LABEL = 'Unknown'

export function formatMetricValue(metric: DashboardMetric | undefined): string {
  if (!metric || metric.state !== 'ok' || metric.value === null) {
    return UNKNOWN_METRIC_LABEL
  }
  return metric.value.toLocaleString()
}

/**
 * The helper line under a metric: its definition, or why it is unknown.
 *
 * A number whose meaning is not stated is the other half of ADM-02 — the
 * dashboard's numbers were not only wrong, they were unexplainable.
 */
export function metricHelper(metric: DashboardMetric | undefined): string {
  if (!metric) return ''
  if (metric.state === 'unknown') {
    return metric.reason || 'This metric could not be loaded.'
  }
  return metric.definition
}

/** True when a metric has no answer, so a tile must not imply a healthy zero. */
export function isMetricUnknown(metric: DashboardMetric | undefined): boolean {
  return !metric || metric.state !== 'ok' || metric.value === null
}

/**
 * Whether the payload is old enough to be labelled stale.
 *
 * Freshness is computed here from a timestamp the server sent rather than
 * pushed: per the repo polling convention there is no SSE or WebSocket on this
 * surface, so "current" has to be something the page can work out on its own.
 */
export function isStale(
  freshness: DashboardFreshness | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!freshness?.generatedAt) return false
  const generated = new Date(freshness.generatedAt).getTime()
  if (Number.isNaN(generated)) return false
  const ageSeconds = (now.getTime() - generated) / 1000
  return ageSeconds > freshness.staleAfterSeconds
}

/** How long ago the numbers were computed, for the freshness line. */
export function freshnessLabel(
  freshness: DashboardFreshness | null | undefined,
  now: Date = new Date(),
): string {
  if (!freshness?.generatedAt) return 'Not loaded yet'
  const generated = new Date(freshness.generatedAt)
  if (Number.isNaN(generated.getTime())) return 'Not loaded yet'
  const ageSeconds = Math.max(0, Math.round((now.getTime() - generated.getTime()) / 1000))
  const measured = ageSeconds < 60
    ? `${ageSeconds}s ago`
    : `${Math.round(ageSeconds / 60)}m ago`
  return isStale(freshness, now) ? `Stale — measured ${measured}` : `Measured ${measured}`
}

/** The banner copy for a degraded or unknown read. Empty when operational. */
export function healthNotice(health: DashboardHealth | null | undefined): string {
  if (!health || health.state === 'operational') return ''
  return health.definition
}
