/**
 * Dashboard → applications roster deep links (Admissions V2, task 9.1).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.1 — "Make
 * dashboard deep links use registered query parameters".
 * Requirements: **R8.1** (one scoped query contract serves the list, its
 * filters, and its dashboard links), **R8.6** (a metric an operator acts on is
 * authoritative and explicit).
 * Findings: **ADM-01** — "A dashboard link emits a filter the parser ignores."
 *
 * A dashboard tile states a number and offers to show the work behind it. That
 * promise only holds if the link is the *same query* the number came from —
 * which is why these links are built from the registered parameter names
 * (`backend/apps/applications/query_service.py:REGISTERED_PARAMETERS`) rather
 * than from the roster's internal filter-state keys.
 *
 * The defect this replaces: the "Deadlines in 48h" tile linked to
 * `?deadlinePressureFilter=true`, a name nothing on either side parsed, so the
 * tile opened an **unfiltered** roster — a number and a page that disagreed,
 * with nothing to tell the operator they disagreed. The other five tiles used
 * the roster's UI-state spelling, which worked only because the roster read its
 * own private vocabulary out of the address bar; a link written by anything
 * else (the backend's review-SLA notification emits `?status=…`) was dropped.
 *
 * Every entry here is asserted to be registered by
 * `tests/unit/applicationRosterDeepLinks.test.ts`, which parses the backend's
 * own `REGISTERED_PARAMETERS` set — so a new tile cannot reintroduce ADM-01 by
 * inventing a parameter name.
 */

/** The roster route these links open. */
export const ADMIN_ROSTER_PATH = '/admin/applications'

/**
 * One deep link per dashboard exception tile, keyed by the metric it explains.
 *
 * The values are query strings in registered parameter names. `review_queue`,
 * `overdue_review`, `has_pending_documents`, `has_upcoming_interviews`, and
 * `deadline_pressure` are server-side predicates over the *whole* scoped set;
 * `payment_status` is the canonical payment vocabulary. None of them is derived
 * in the browser, and none of them is a name only this app understands.
 */
export const ROSTER_DEEP_LINK_QUERIES = {
  overdueReviews: 'overdue_review=true',
  pendingReview: 'review_queue=true',
  pendingDocuments: 'has_pending_documents=true',
  pendingPayments: 'payment_status=pending_review',
  upcomingInterviews: 'has_upcoming_interviews=true',
  deadlinePressure: 'deadline_pressure=true',
} as const

export type RosterDeepLinkName = keyof typeof ROSTER_DEEP_LINK_QUERIES

/** The full `to=` value for one dashboard tile. */
export const rosterDeepLink = (name: RosterDeepLinkName): string =>
  `${ADMIN_ROSTER_PATH}?${ROSTER_DEEP_LINK_QUERIES[name]}`

/** Every distinct parameter name these links emit — the drift test's input. */
export const rosterDeepLinkParameters = (): string[] => {
  const names = new Set<string>()
  for (const query of Object.values(ROSTER_DEEP_LINK_QUERIES)) {
    for (const [name] of new URLSearchParams(query)) names.add(name)
  }
  return [...names].sort()
}
