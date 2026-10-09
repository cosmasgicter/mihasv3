# Task 9.2 — Make dashboard metrics truthful

Evidence index for task **9.2** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [-] 9.2 Make dashboard metrics truthful
  - Define each metric and scope, add freshness/error/unknown states, and preserve
    tenant selection through polling.
  - Remove invented zero/healthy defaults and relabel enabled accounts correctly.
  - _Requirements: R8.6, R17.3-R17.6_
  - _Findings: ADM-02, MAINT-02_
  - _Evidence: metric query tests, provider/API failure UI tests, scoped polling E2E_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-08 (UTC).
- **Reuses task 9.1 rather than recomputing anything.** Every application number
  is `ApplicationQueryService.dashboard_counters` over `scoped_applications`, and
  every application metric's *sentence* is 9.1's own
  `dashboard_definitions()`. 9.1 left the tile numbers here (9.1 §10); this task
  spends 9.1's vocabulary on them and adds the three things a roster did not need:
  **states**, **freshness**, and **source failure isolation**.
- PBT: task 9.2 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`). Nothing is recorded via
  `update_pbt_status`.
- Schema: **no migration.** No table, column, index, capability, or endpoint was
  added. Neon and production were not touched; the only databases used were the
  throwaway `mihas_localtest` Postgres and the task-0.4 harness.

## The Required_Evidence claim

The `_Evidence:` line is three claims, deliberately in three different registers,
because ADM-02 was three separate defects.

**1. Metric query tests — each number against an independent count over its
stated scope.**

| Where | What it proves |
|---|---|
| [`test_dashboard_metrics_9_2.py::TestEachNumberEqualsAnIndependentCount`](../../../backend/tests/unit/test_dashboard_metrics_9_2.py) | **14 of the 16** registry metrics recomputed in **hand-written SQL** over the same scoped rows — 12 application counters in one query plus both account counters in their own — over a 10-row spread where six of those counters are deliberately non-zero, so an equality that held only because both sides were empty cannot pass. Plus the same comparison under a selected school. The two not covered this way are the week/month activity windows (§13) |
| `…::TestATileIsTheRosterItOpens` | each of the six tile counters equals the `totalCount` of the roster query its link opens — the pairing, not two implementations that agree today |
| [`raw/live-metric-comparison.txt`](raw/live-metric-comparison.txt) | the same two comparisons against the **running** stack: a cookie-authenticated `GET /api/v1/admin/dashboard/`, then each tile's roster query, then `psql` inside the harness Postgres. **10 counters, `ALL_COUNTERS_MATCH: True`**, and all six tiles `MATCH` |

**2. Provider and API failure UI tests — a failed source renders unknown, not
zero.**

| Where | What it proves |
|---|---|
| `test_dashboard_metrics_9_2.py::TestAFailedSourceIsUnknownNotZero` | a failed applications read leaves **every** count `unknown`; one failed source does not take the others down (`health: degraded`); the reason names no internals; a legacy block **omits** a key rather than zeroing it; a genuine zero is `ok` **with its window** |
| [`dashboardMetricsTruthful.test.tsx`](../../../apps/admissions/tests/unit/dashboardMetricsTruthful.test.tsx) | 20 cases: the normalizer's every failure path yields `{}` + `health: null`; `formatMetricValue` renders `'Unknown'` for absent / `unknown` / malformed-`ok` and `'0'` for a **measured** zero; the loader reducer wipes the numbers on a failed read instead of leaving them on screen |
| [`page-verification/admin-dashboard.test.tsx`](../../../apps/admissions/tests/unit/page-verification/admin-dashboard.test.tsx) | the rendered page: a 500 renders `Unknown` on every tile and `Data sources: Unknown`; a single failed source renders `degraded` with the application numbers still answered |
| the harness journey 5 (below) | the same claim in a real browser, with the read failed at the network boundary |

**3. A scoped polling E2E — tenant selection survives polling.**
[`admin-dashboard-metrics.spec.ts`](../../../apps/admissions/tests/harness-e2e/required/admin-dashboard-metrics.spec.ts)
— **5 journeys × 2 viewports = 10, all passing on a freshly wiped harness with
zero skips** ([`raw/harness-dashboard-journeys.txt`](raw/harness-dashboard-journeys.txt)):

| Journey | The claim it settles |
|---|---|
| **every tile is measured** | six tiles, each linking to its registered roster query, each `data-metric-state="ok"`, each carrying a definition; `Data sources: operational`; freshness is a measured age |
| **a tile is the roster it opens** | the rendered tile number equals the `totalCount` the roster contract returns for the tile's own query — end to end, through two endpoints |
| **nothing measures presence** | the MAINT-02 relabel on the rendered page: no "active users online", no "N active users", and "Staff accounts enabled … enabled to sign in … the platform does not measure presence" |
| **tenant selection survives polling** | select a school, **wait out a full 30 s polling interval**, and every poll on the wire carries that school's `institution_id`, while the switcher value, the scope line, and the numbers are unchanged |
| **a failed read is unknown** | the dashboard read is failed at the network boundary; every tile renders `Unknown` with `data-metric-state="unknown"`, `Data sources: Unknown`, `Not loaded yet`, and the roster is still offered |

Why the browser is required for journey 4 and nothing else can stand in for it:
the endpoint was always correct — it narrowed to whatever `?institution_id=` it
was handed. The *poll* asked a different question than the page had. Only a real
elapsed interval in a real browser can show that, and only the wire can prove the
fix.

## What this task establishes

1. **A metric is a state, not a number.** `ok` carries an integer; `unknown`
   carries `None` and the reason its source failed. There is no third option and
   no default value anywhere on the path, which is what makes "missing data never
   becomes a healthy zero" structural rather than a convention (§1).
2. **Three counters that were rendered but never computed now exist.**
   `overdue_reviews`, and the condition/enrollment deadline pressure the
   "Deadlines in 48h" tile claimed, had no backend field at all: the frontend
   normalizer read the absent keys as `0`, so an operator read "0 reviews past
   SLA" as "nothing is late" (§2).
3. **A failed read is reported as a failed read.** The needs-attention block was
   wrapped in `except Exception: pending_payments = 0; pending_documents = 0;
   upcoming_interviews = 0`, and every frontend failure path returned
   `createEmptyDashboardResponse()` — fourteen zeros and `systemHealth: 'good'`.
   Failure is now isolated per source, and a partial failure renders as partial
   (§3).
4. **The health grade is measured or absent.** `systemHealth` had four adjectives
   and the backend never sent it, so it was always the default `'good'`: the
   dashboard asserted the platform was healthy without measuring anything. It is
   now three states derived from whether each source answered, and `null` when
   nothing has been (§4).
5. **Every number states what it counts, and who it counts.** Each metric ships a
   definition (reused from 9.1 where the metric is an application counter) and a
   scope, and the page renders both (§5).
6. **Freshness is computed, not claimed.** `generated_at` + `stale_after_seconds`,
   compared in the browser. **No SSE and no WebSocket** — per the repo polling
   convention (§6).
7. **A poll answers the question the page asked.** The school is in the React
   Query key, on the wire, and echoed back in the payload so a switch-in-flight
   race is discarded rather than rendered; a second gate on the reducer refuses a
   patch for a school that is not on screen (§7).
8. **Enabled accounts are called enabled accounts.** The number counts
   `profiles.is_active` — permission to sign in — and was published as
   `users.active` and rendered as "N active users online". Nothing in the payload
   has ever measured presence (§8).
9. **Authority is a capability.** The dashboard moved off the raw `IsAdmin` role
   string onto `HasTenantCapability` + `tenant.application.read`, so no tenant
   scope is a masked 404 and an out-of-scope `?institution_id=` is masked 404 +
   `scope.denied` rather than a 200 whose zeros would confirm the id resolves
   (§9). **This is a documented contract strengthening** with two consequences,
   both recorded below.

## Files

```
docs/v2-evidence/9.2/
├── README.md                                    ← this index
└── raw/
    ├── application-dashboard-suites.txt             (19 failed / 231 passed / 30 errors)
    ├── application-dashboard-suites-baseline.txt    (the SAME suites, 9.2 removed: 19 / 202 / 30)
    ├── catalog-authority-analytics-suites.txt       (24 failed / 569 passed / 6 skipped / 0 errors)
    ├── catalog-authority-analytics-suites-baseline.txt (the same suites, 9.2 removed: 24 / 548 / 6 / 21 errors)
    ├── dashboard-suite.txt                          (the task's own 29-case suite, verbose)
    ├── frontend-test.txt                            (whole suite: 1 pre-existing failure / 3984 passed; middle of the log elided)
    ├── frontend-test-baseline.txt                   (the same suite, 9.2 removed: 4 failed / 3957 passed)
    ├── frontend-lint.txt                            (21 errors — identical file set to the baseline)
    ├── frontend-lint-baseline.txt                   (the same 21 errors with 9.2 removed)
    ├── frontend-build.txt                           (exit 0, incl. tsc + CSP gate)
    ├── django-check.txt                             (no issues)
    ├── spectacular.txt                              (3 warnings / 116 errors — unchanged)
    ├── live-metric-comparison.txt                   (API metrics vs tile rosters vs psql, on the running stack)
    └── harness-dashboard-journeys.txt               (10 passed — 5 journeys × desktop + mobile, fresh harness)
```

Source of the change:

| Path | What it is |
|---|---|
| `backend/apps/accounts/dashboard_metrics.py` | **new** — the metric registry (`APPLICATION_METRIC_COUNTERS`, `_ACCOUNT_METRICS`, `DashboardMetric`), the state and health vocabularies, `STALE_AFTER_SECONDS`, and `DashboardMetricsService`: per-source failure isolation, derived health, freshness, scope, and the activity feed moved out of the view |
| `backend/apps/applications/query_service.py` | `DASHBOARD_TILES` (tile → `{roster_query, counter}`), `DASHBOARD_ONLY_DEFINITIONS`, `annotate_dashboard_flags`, `_dashboard_expressions`, `dashboard_counters`, `status_breakdown`, `dashboard_definitions` — the counters and sentences, built **on top of** 9.1's own `_aggregate_expressions` |
| `backend/apps/accounts/admin_user_views.py` | `AdminDashboardView` rewritten: `HasTenantCapability` + `tenant.application.read`, scope-before-lookup on `?institution_id=`, and `_legacy_blocks` that **omit** a key whose metric is unknown |
| `backend/tests/unit/test_dashboard_metrics_9_2.py` | **new** — 29 cases (§10) |
| `backend/tests/unit/test_no_scope_empty.py` | `TestDashboardNoScope` updated to the shipped masked-404 contract, with the reasoning in the docstring (§9) |
| `scripts/authority_matrix_registry.py` | the dashboard entry re-registered with its capability, its scope path, and `not_found_mask_then_non_revealing_403` (it said "IsAdmin raw role today -> 2.2") |
| `apps/admissions/src/pages/admin/lib/dashboardMetrics.ts` | **new** — the frontend contract: metric keys (mirroring the backend registry), the state/health/scope types, and the pure renderers `formatMetricValue`, `metricHelper`, `isMetricUnknown`, `isStale`, `freshnessLabel`, `healthNotice` |
| `apps/admissions/src/services/admin/dashboard.ts` | `normalizeMetrics` / `normalizeSources` / `normalizeHealth` / `normalizeFreshness` / `normalizeScope`; `createEmptyDashboardResponse` → **`createUnknownDashboardResponse`**; the `stats` block derived from the registry; `systemHealth` never defaulted |
| `apps/admissions/src/hooks/useAdminDashboardPolling.ts` | `adminDashboardPollingKey(institutionId)`, `fetchDashboardStats(institutionId)`, the payload's own `institutionId`, `onMetricsChange`, and the scoped-data guard on both the callback and the return value |
| `apps/admissions/src/hooks/admin/useAdminDashboardLoader.ts` | `metrics` / `health` / `freshness` / `loadedInstitutionId` in the state; `patch-metrics` refused for another school; a failed read **invalidates** the numbers; a masked 404 on the actor's own unscoped dashboard is the explicit no-scope state (§9.2) |
| `apps/admissions/src/pages/admin/Dashboard.tsx` | rewritten render layer: the six exception tiles from `EXCEPTION_TILES` (metric + `rosterDeepLink`), the definition-labelled "Volume and outcomes" block, the read-state line (health / freshness / scope / live), and the scoped poll |
| `apps/admissions/src/components/admin/dashboard/DashboardQuickActions.tsx` | props are `number \| null`; a count is rendered only where a real metric supplies it, and staff accounts are no longer called "students" |
| `apps/admissions/src/data/applications.ts` | `useStats(institutionId?)` reads the scoped cache entry; `approvalRate` is `null` (with `decisionsRecorded`) when nothing has been decided; `systemHealth` not defaulted |
| `apps/admissions/src/lib/speculativePrefetch.ts` | seeds the **full** poll payload shape under the `'all'` key, so the prefetch cannot desync the poller or be discarded as another school's |
| `apps/admissions/tests/unit/dashboardMetricsTruthful.test.tsx` | **new** — 20 cases; parses the backend registry so the key list cannot drift |
| `apps/admissions/tests/harness-e2e/required/admin-dashboard-metrics.spec.ts` | **new** — the 5 required browser journeys, desktop and mobile |
| `apps/admissions/tests/unit/page-verification/admin-dashboard.test.tsx`, `noScopeEmptyState.test.tsx`, `serviceNormalization.test.ts`, `dashboardNormalizer.property.test.ts`, `frontend-django-alignment/service-normalization.property.test.ts` | assertions that pinned the retired defaults, updated (§11) |
| `docs/canonical-truth-map.md` | "Admin dashboard metric contract" — the registry, states, definitions, scope, tile pairing, health, freshness, the relabel, scoped polling, disclosure, and the drift guards |

---

## 1. A metric is a state, not a number (R8.6)

### 1.1 What the browser used to do

```ts
// services/admin/dashboard.ts, before
const DEFAULT_STATS: AdminDashboardStats = {
  totalApplications: 0, pendingApplications: 0, /* …14 zeros… */
  systemHealth: 'good',
}
export const createEmptyDashboardResponse = () => ({ stats: { ...DEFAULT_STATS }, … })
```

`createEmptyDashboardResponse()` was returned from **every** failure path: a 500, a
dropped connection, an expired session, and a school with genuinely nothing to do
all rendered the same screen — one that said the platform was healthy and there was
no work outstanding.

### 1.2 What runs now

Each registry entry is either

```json
{"key": "overdue_reviews", "value": 2, "state": "ok",
 "definition": "Submitted or under review for longer than the configured review SLA.",
 "scope": "institution", "source": "applications",
 "roster_query": "overdue_review=true"}
```

or

```json
{"key": "overdue_reviews", "value": null, "state": "unknown",
 "definition": "…", "scope": "institution", "source": "applications",
 "reason": "This metric's source did not answer (OperationalError)."}
```

There is no third shape and no default value. On the frontend the same rule holds
structurally: `formatMetricValue` returns `'Unknown'` unless the backend said `ok`
**and** sent a finite number, and there is deliberately no branch that substitutes
`0` — that substitution is the finding. A **measured** zero still renders as `0`,
with its definition and its window, which is the distinction ADM-02 collapsed.

`'Unknown'` is a word, not a dash or an empty cell: an operator scanning tiles has
to be able to tell "we could not find out" from "there is nothing here", and
punctuation does not say that.

## 2. The three counters that were rendered but never computed

`overdue_reviews`, `conditions_expiring_soon` and `enrollments_expiring_soon` were
read by `Dashboard.tsx` and computed nowhere. The backend never sent the keys; the
normalizer read the absent keys as `0`; the tile rendered a reassuring number.
The deadline tile even added two of them together —
`stats.conditionsExpiringSoon + stats.enrollmentsExpiringSoon` — which is `0 + 0`.

They are real counters now, and they are **the roster's**: `overdue_review_count`
is `Q(status__in=REVIEW_QUEUE_STATUSES, submitted_at__lt=now - review_sla_days)`
read from the same `review_sla_days` Setting `review_sla_reminder_task` reads, and
the two deadline counters became the single `deadline_pressure_count` over 9.1's
derived `next_deadline_at` (soonest open condition deadline or enrollment
confirmation deadline) inside `DEADLINE_PRESSURE_HOURS = 48`. One number, one
predicate, one filter — so the tile and the page it opens describe the same set.

The live run shows the effect directly: with the `review_sla_days` Setting at `0`
and two applications submitted, `overdue_reviews` is `2`, the roster query
`?overdue_review=true` returns `totalCount: 2`, and the independent psql count
over the same predicate is `2`.

## 3. A failed read is reported as a failed read (R17.4, R17.6)

### 3.1 The handler this replaces

```python
try:
    pending_payments = …
    pending_documents = …
    upcoming_interviews = …
except Exception:
    pending_payments = 0
    pending_documents = 0
    upcoming_interviews = 0
```

A database error, a missing table, and a timeout all rendered as three reassuring
zeros.

### 3.2 Per-source isolation

Three sources — `applications`, `accounts`, `activity` — each read inside its own
boundary in `DashboardMetricsService._read`. The `except Exception` there is the
*opposite* of the one it replaces: it records the failure and substitutes
**nothing**. The exception is logged with a stack trace; only its **class name**
reaches the response, so a database message can never leak into an admin's
browser (`test_the_failure_reason_names_no_internals`, and a source scan in
`dashboardMetricsTruthful.test.tsx`).

Because failure is per-source, a partial failure renders as partial: the
applications numbers stay answered while the account numbers say they are unknown,
and `health` is `degraded` rather than the page having to choose between
"everything is fine" and "everything is broken"
(`test_a_failed_source_does_not_take_the_others_down`, and the rendered version in
the page-verification suite).

The **compatibility blocks** follow the same rule: `_legacy_blocks` populates
`applications` / `users` / `needs_attention` only where a metric answered, and
**omits** the key otherwise. An absent key is a question the payload declines to
answer; a zero is a wrong answer
(`test_a_legacy_block_omits_a_key_rather_than_zeroing_it`).

## 4. The health grade is measured or absent

`systemHealth` had four values (`excellent`/`good`/`warning`/`critical`), the
backend never sent it, and the frontend normalizer defaulted an unrecognised or
absent value to `'good'`. So the dashboard asserted the platform was healthy
without measuring anything, and the status bar read `System good` on a completely
failed read.

It is now three states **derived from the read**:

| state | meaning |
|---|---|
| `operational` | every metric source answered this request |
| `degraded` | at least one source failed; those metrics are unknown |
| `unknown` | no source answered; no number on this page is current |

and `null` — rendered as `Unknown` — when nothing has been measured yet.
`test_health_is_derived_from_the_read_not_defaulted` fails a source and asserts the
state moves. The retired vocabulary is unreachable: `normalizeStats({system_health:
'good'})` returns `null`, and a source scan fails if `'excellent'`, `'good'` or
`'critical'` reappears in the page.

## 5. Every number states what it counts, and who it counts (R8.6)

R8.6 asks for *definition-labelled* metrics, and ADM-02's numbers were not only
wrong — they were unexplainable.

Application metrics reuse **9.1's own sentences**
(`ApplicationQueryService.dashboard_definitions()` = `aggregate_definitions()` ∪
`DASHBOARD_ONLY_DEFINITIONS`), so "decision queue" cannot mean one thing on the
dashboard and another on the roster
(`test_a_tile_definition_is_the_rosters_own_sentence`). A metric whose counter has
**no** definition raises at import rather than shipping an unlabelled number, and
`test_the_dashboard_only_counters_are_the_only_new_sentences` fails if this task
quietly invents a second definition vocabulary.

Scope is published twice, deliberately: per metric (`institution` / `platform`) and
once for the read (`scope: {kind, institution_id, all_access, institution_count}`).
The page renders it in words — "Counting every school" / "the selected school" /
"your school" — because a scoped read and a platform-wide read look identical
otherwise, which is precisely the confusion ADM-02's polling defect produced
silently.

## 6. Freshness is computed, not claimed

`STALE_AFTER_SECONDS = 120` ships with `generated_at`, and the browser compares
them (`isStale`, `freshnessLabel`). Per the repo polling convention there is **no
SSE and no WebSocket** on this surface, so "current" has to be something the page
can work out on its own.

Two details worth recording:

- **a missing server budget is `0`, i.e. immediately stale.** If the payload
  carries no `stale_after_seconds`, the page must not claim the numbers are
  current; a generous default would be the same instinct as a healthy zero.
- **absent freshness is not "stale" — it is *nothing*,** and the label says
  `Not loaded yet` rather than implying a measurement that never happened.

`onMetricsChange` fires on **every** scoped poll, not only when a counter moved:
freshness moves even when no number does, and a stale label that never updates is
itself a false statement about how current the page is.

## 7. A poll answers the question the page asked (ADM-02)

### 7.1 What was broken

```ts
// useAdminDashboardPolling.ts, before
async function fetchDashboardStats() {
  const overview = await adminDashboardService.getOverview()   // no argument
  …
}
const query = useQuery({ queryKey: ['admin-dashboard-polling'], … })
```

The page's initial load was scoped to the selected institution; the poll was not,
and cached under a bare key. So a super-admin who selected one school saw that
school's numbers for up to one polling interval, and then the poll silently
replaced them with **platform-wide totals** under the same "Your School Overview"
heading — with no visible event to explain the change.

### 7.2 Three gates, not one

| Gate | What it stops |
|---|---|
| `adminDashboardPollingKey(institutionId)` in the query key | two schools sharing one cache entry (and the prefetch seeding the wrong one) |
| `fetchDashboardStats(institutionId)` on the wire | the poll asking a different question than the page |
| the payload's own `institutionId`, checked in `onMetricsChange`, in the returned `stats`/`metrics`, **and** in the loader reducer's `patch-metrics` | the switch-in-flight race: an in-flight poll for the previous school resolving after the operator has moved on |

The reducer gate is deliberately redundant with the callback gate. The query key
already separates the caches, so this is defence against a *future* caller — the
state cannot be patched with numbers for a school it is not showing, whoever calls
it.

The three sibling consumers were scoped with it (`useAdminPendingCount`,
`useAdminTotalApplicationCount`, `data/applications.ts:useStats`), and
`speculativePrefetch` seeds the **whole** payload shape under the `'all'` key —
a partial seed desyncs the cache and crashes the poller on
`query.data.stats === undefined`, and an unscoped seed would be discarded as
another school's.

Tab-visibility invalidation stays on the **prefix** (`['admin-dashboard-polling']`),
which is what a returning operator wants: whichever school is on screen refetches.

## 8. Enabled accounts are called enabled accounts (MAINT-02)

The number counts `profiles.is_active` — *permission to sign in*. It was published
as `users.active` and rendered as `{stats.activeUsers} active users online` next to
a tile labelled "System health", and again as `{stats.activeUsers} active users` in
the status bar. **Nothing in the payload has ever measured presence.**

The metric keeps its number and its scoping (membership-derived, plus the actor's
own row — the population did not change) and states what it is:

> Accounts in your scope that are enabled to sign in. This is not a count of users
> currently online — the platform does not measure presence.

The payload key is `users.enabled`, the headline metric is "Staff accounts
enabled", and three guards fail if the old claim returns: a backend definition
assertion, a source scan over the rendered page, and the browser journey. The
quick-actions card lost the same mislabel in the other direction — it rendered
`{totalStudents} students` from the **account** total, and `{totalPrograms} active`
from a number with no source in the payload at all, which was therefore always the
`0` its initial state supplied.

`RealtimeMetricsDisplay` was removed from the dashboard for the same reason: it
animated eight numbers it could neither label nor report as unknown, two of them
(`avgProcessingTime`, `activeUsers`) with no source in the payload. The same volume
figures are now a definition-labelled block from the registry. The derived
"Success Rate" went with it — a browser-computed ratio has no server definition,
and `approvalRate` is now `null` (shipped with `decisionsRecorded`) when nothing has
been decided, because "0% approval" and "no decisions recorded yet" are different
statements and only the second was true.

## 9. Authority is a capability, and scope precedes lookup (R3, R8.6)

The dashboard was gated by `IsAdmin` — a raw role-string check, which the steering
rules forbid and which the authority registry itself flagged
(`notes="… IsAdmin raw role today -> 2.2"`). It now uses `HasTenantCapability` +
`tenant.application.read`: the same grant and the same `authorize_tenant_surface`
disclosure contract task 9.1 gave the roster and task 8.4 gave the money surfaces.
**No capability was invented**; the catalogue stays at 17 `platform.*` + 17
`tenant.*`.

| Actor | Result |
|---|---|
| Scoped **Reviewer** / **Tenant_Admin** | 200, their institutions only |
| `admin` with **no membership** | masked **404** |
| **Student** | masked **404** |
| **Super_Admin** | everything; `?institution_id=` narrows it |
| out-of-scope or unknown `?institution_id=` | masked **404** + `scope.denied` (`dashboard.institution`) |

`test_the_service_never_compares_a_role_string` reads the service source and fails
on a role comparison. The live run shows the masking directly: a random UUID and
`not-a-uuid` both return the identical body, and four `scope.denied` rows are
recorded with `entity_type=dashboard.institution` and no tenant identity.

**This is a contract strengthening, and it has two documented consequences.**

### 9.1 A no-scope admin is refused, not answered with zeros

`test_no_scope_empty.py::TestDashboardNoScope` asserted a 200 with
`no_school_access: true` and zeroed blocks. That test was updated: the assertion is
now the masked 404, and the docstring records why. R4.6's requirement — a no-scope
caller never sees the platform total and is told explicitly that they have no
school access — still holds, and holds more strongly, because a refusal cannot be
misread as a quiet platform.

### 9.2 R11.6's explicit no-scope state now has a different source

The frontend's "No school access assigned" surface was driven by the payload's
`no_school_access` flag, which a masked 404 does not carry. The loader now treats a
**404 on a request that named no institution** as that state:

```ts
if (result.diagnostics.status === 404 && !institutionIdRef.current) {
  dispatch({ type: 'no-school-access' })
  return
}
```

The `!institutionIdRef.current` guard is what keeps this honest. For a request that
named no school, the actor asked for their **own** scoped dashboard and the platform
declined: no other tenant's identity is involved and nothing is disclosed. When a
school **was** named, a 404 means *that* school is out of scope — a different
statement, which stays an error. The dispatch settles as `phase: 'success'` with
`metrics: {}`, because it is a correct answer rather than a failure: there is no
error to show and no number to render.

An earlier attempt at this read `CapabilityContext.noAccess` instead. It was
withdrawn: `useCapabilities()` outside a provider returns the fail-closed default
`noAccess: true`, so the page would render "No school access assigned" for any
caller whose provider had not mounted — a new way to be confidently wrong, which is
the shape of the finding being fixed.

## 10. The task's own backend suite

`tests/unit/test_dashboard_metrics_9_2.py` — **29 passed**, every case under the
`production_scope` fixture so what is measured is the real membership/grant-derived
capability model and never a test-settings shortcut
([`raw/dashboard-suite.txt`](raw/dashboard-suite.txt)):

| Class | Cases | What it settles |
|---|---|---|
| `TestEachNumberEqualsAnIndependentCount` | 3 | the Required_Evidence claim: every application metric and the enabled-account count against raw SQL, and the same under a selected school |
| `TestATileIsTheRosterItOpens` | 3 | each tile counter equals its roster's total; each tile publishes the query its link must carry; every tile query is a registered parameter |
| `TestAFailedSourceIsUnknownNotZero` | 5 | a failed read leaves every count unknown; one failed source does not take the others down; the reason names no internals; a legacy block omits rather than zeroes; a genuine zero is `ok` with its window |
| `TestEveryNumberStatesWhatItCounts` | 7 | a definition per metric; a tile definition is the roster's own sentence; the dashboard-only sentences are the only new ones; enabled accounts never claim presence; freshness ships a staleness budget; health is derived, not defaulted; scope states who each number describes |
| `TestScopePrecedesLookup` | 6 | another tenant's institution masked; an unknown institution indistinguishable; the probe audited; a scoped actor may narrow to their own school; another tenant's rows never reach any number; no role string compared |
| `TestTheRegistryIsTheOneAuthority` | 5 | no key declared twice; every application metric reads a real counter; the activity feed is bounded; the accounts source owns exactly the account metrics; the envelope preserved |

## 11. Verification (verbatim)

### 11.1 Backend application + dashboard suites, against a measured baseline

`cd backend && DATABASE_URL=<localtest 5433> TESTING=1 python3 -m pytest $(ls tests/unit/*.py tests/property/*.py | grep -iE "application|dashboard|metric") -q --tb=no -rfE -p no:randomly`
— against the isolated `mihas-localtest` Postgres. Neon and production were not
touched.

| Run | Result |
|---|---|
| **baseline** — 9.2 removed (`dashboard_metrics.py` + its suite moved aside, `AdminDashboardView` reverted to its pre-9.2 implementation, the registry entry and `test_no_scope_empty.py` reverted) | **19 failed, 202 passed**, 30 errors |
| **9.2** | **19 failed, 231 passed**, 30 errors |

[`application-dashboard-suites.txt`](raw/application-dashboard-suites.txt) /
[`…-baseline.txt`](raw/application-dashboard-suites-baseline.txt). A *measured*
baseline, not an argument: **+29 passing** (exactly this task's suite), and the
failing and erroring sets are **identical by name** (diffed; both 49 entries). The
19 failures and 30 errors are the pre-existing clusters catalogued in
[9.1 §8.1](../9.1/README.md).

### 11.2 Backend catalog / capability / authority / analytics suites

`… | grep -iE "catalog|capabilit|permission|authorit|tenant|scope|cross_tenant|analytic"`
— run because this task changes an authority gate and a registry entry.

| Run | Result |
|---|---|
| **baseline** (9.2 removed, as above) | 24 failed, 548 passed, 6 skipped, **21 errors** |
| **9.2** | **24 failed, 569 passed, 6 skipped, 0 errors** |

[`catalog-authority-analytics-suites.txt`](raw/catalog-authority-analytics-suites.txt) /
[`…-baseline.txt`](raw/catalog-authority-analytics-suites-baseline.txt).
**Nothing is new**: the candidate's 24 failures are a strict subset of the
baseline's 45 non-passing entries (`comm -13` is empty), and they are the same 24
that [9.1 §8.3](../9.1/README.md) catalogued and traced to other lanes. The 21
baseline-only entries are errors *caused by reverting this task*: with the
dashboard role-gated again, `test_authority_matrix_generated.py`'s conformance
fixture fails and cascades — the authority matrix already expected this endpoint to
be capability-gated.

Because this task edits the authority registry, the two registry gates deserve to
be named rather than left inside a count.
`test_authority_matrix_v2.py::test_no_stale_registry_entries` and
`::test_zero_unclassified_gate_passes_on_live_surface` fail in **both** runs, and
the failure is the de-AI lane's two deleted routes
(`/applications/<id>/admin-summary/`, `/applications/<id>/preview-summary/`) still
being registered — verified by reading the assertion output. The dashboard entry
this task rewrote is **not** among the stale entries, and
`test_authority_matrix_generated.py`'s full-matrix conformance test — the one that
actually probes the live surface against the registry — **passes** with the new
entry (§9).

### 11.3 Frontend gates

| Gate | Result | Artifact |
|---|---|---|
| `bun run test` | **1 failed / 3984 passed / 1 skipped** (467 files) — the single failure is the pre-existing `authPageFormMarkup` copy conflict | [`frontend-test.txt`](raw/frontend-test.txt) |
| `bun run lint` | **21 errors, 0 warnings** — same count *and the same 18-file set* as the baseline (diffed); none in this task's files | [`frontend-lint.txt`](raw/frontend-lint.txt) |
| `bun run build` | **exit 0** (includes `tsc -p tsconfig.build.json --noEmit`, `vite build`, and the CSP gate) | [`frontend-build.txt`](raw/frontend-build.txt) |

The pre-9.2 frontend baseline was measured the same way (the four modified files
reverted, the new module moved aside): **4 failed / 3957 passed / 1 skipped** across
466 files. So: **+27 passing, +1 test file, and three of the baseline's four
failures gone** — which needs explaining rather than claiming, because 9.2 did not
fix them.
Three of those four failures were **baseline-construction artifacts**, not
pre-existing breakage: 9.2's files are shared with two other landed tasks, so
reverting them also reverts task 8.4's `formatFeeAmount` expectations
(`adminDashboardOverhaul.test.tsx`, `adminDashboardOverhaul.property.test.tsx`) and
task 9.1's dashboard-deep-link guard (`applicationRosterDeepLinks.test.ts`). They
are named here rather than counted as a win.

The genuine pre-existing failure is one, in both runs:
`authPageFormMarkup.test.tsx`, the SignUp helper-copy conflict catalogued in
[8.1 §4.1](../8.1/slice-2-frontend.md), [8.3 §7.1](../8.3/README.md),
[8.4 §7.3](../8.4/README.md) and [9.1 §8.4](../9.1/README.md). Unrelated to the
dashboard.

### 11.4 Django system checks

`cd backend && python3 manage.py check`

```
LENCO_API_SECRET_KEY is not set — payment processing will be unavailable.
System check identified no issues (1 silenced).
CHECK_EXIT=0
```

[`django-check.txt`](raw/django-check.txt). The LENCO line is the expected
local-dev notice — this machine holds no provider credential. (The run also emits
the `SECRET_KEY not set` dev warning, because it uses the repo venv without a
`.env` export; it is not a check failure.)

> **`manage.py check` must run with the repo's own environment.** Exporting a
> `TESTING=1` or a substitute `REDIS_URL` first flips `CACHES` to `LocMemCache`
> (`base.py` `_is_testing`) and the check then reports
> `django_ratelimit.E003 — not a shared cache`. That is the override talking, not
> the platform (recorded by 8.3 §7.7, 8.4 §7.5 and 9.1 §8.5; re-confirmed here).

### 11.5 OpenAPI schema

`cd backend && python3 manage.py spectacular --file /tmp/schema-9.2.yaml`

```
Warnings: 3 (3 unique)
Errors:   116 (26 unique)
SPECTACULAR_EXIT=0
```

[`spectacular.txt`](raw/spectacular.txt) — **identical counts** to 8.2, 8.3, 8.4
and 9.1. This task adds no operation (the dashboard route already existed) and no
new schema error: `admin_dashboard_retrieve` is present in the generated schema and
does not appear in the error list.

### 11.6 Browser journeys

`cd apps/admissions && HARNESS_PW_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://localhost:8090 bunx playwright test -c playwright.harness.config.ts --project=chromium-required --project=mobile-required tests/harness-e2e/required/admin-dashboard-metrics.spec.ts`

```
Running 10 tests using 1 worker
  … 10 passed (2.1m)
PW_EXIT=0
```

[`harness-dashboard-journeys.txt`](raw/harness-dashboard-journeys.txt). Run against
the task-0.4 isolated harness brought up **fresh** (`harness/bin/harness up` wipes
volumes), with the strict `harness-fixtures.ts` gates active: zero skips, no
console errors, no unasserted failed requests. The harness was torn down afterwards
(`harness/bin/harness down`, volumes wiped) — verified: no `mihas-v2-harness-*`
container remains.

`HARNESS_PW_CHANNEL=chrome` is the config's documented escape hatch: Playwright's
bundled Chromium has no build for this machine, so the required projects run
against the system Chrome. It changes the browser binary, not the assertions.

Two things the journeys had to declare rather than suppress:

- the failed-read journey `route.fulfill`s a 500, so it declares that endpoint to
  the request gate with `gate.allowRequest('/api/v1/admin/dashboard/')` — the
  declaration **is** R18.4's "asserted error path";
- Chromium logs its own `Failed to load resource: … 500` console error for the
  route it was handed. It carries no URL, so it is allowed by its exact text; any
  *application* console error still fails the run.

One assertion detail worth recording because it cost a run: `innerText` honours
`text-transform`, and the headline metric labels are rendered uppercase, so the
MAINT-02 copy checks compare against a lower-cased body. The unit tests read
`textContent` and are unaffected.

### 11.7 The live comparison

[`raw/live-metric-comparison.txt`](raw/live-metric-comparison.txt) — against the
running harness stack, all of its state created through platform endpoints: six
real applicants each with one draft, two of them moved to `submitted` through
`POST /api/v1/applications/{id}/review/`, and the `review_sla_days` Setting written
to `0` through `POST /api/v1/admin/settings/` so a just-submitted application is
genuinely past SLA. No row was hand-edited.

It records the whole payload (metrics with states and definitions, sources, health,
freshness, scope, windows, and the compatibility blocks), then three comparisons:
each tile counter against its own roster query (**6 MATCH**), every counter against
hand-written psql (**10 MATCH, `ALL_COUNTERS_MATCH: True`**), a selected school
narrowing both the API and psql to the same numbers, and the masked 404 with its
`scope.denied` audit rows.

### 11.8 Failures introduced by this task

**Zero**, against measured baselines rather than assertion:

| Scope | Evidence |
|---|---|
| Backend application + dashboard suites | baseline 19 failed / 202 passed / 30 errors → 19 / **231** / 30; failing + erroring sets identical by name (§11.1) |
| Backend authority / catalog / analytics suites | baseline 24 failed / 548 passed / 21 errors → 24 / **569** / **0**; candidate failures a strict subset of the baseline's (§11.2) |
| Frontend | the same single pre-existing failure; lint count **and file set** identical to the baseline (§11.3) |
| Build / check / schema | exit 0, no issues, unchanged counts (§11.3–11.5) |

## 12. What the prior attempt had wrong, and what it cost

A substantial prior attempt existed in the working tree: the backend registry, the
service, the view rewrite, the 29-case suite, the frontend contract module, the
normalizer, the polling hook, and the loader reducer. All of that was sound.

**The render layer had never been finished, and the tree did not compile.**
`Dashboard.tsx` had been half-converted: it destructured `metrics` / `health` /
`freshness` / `patchMetrics` and imported all seven pure renderers, but its body
still read `stats.*` in about thirty places, still referenced `lastUpdated`, and
still mounted `RealtimeMetricsDisplay` — whose import had been deleted along with
`Activity` and `XCircle`. `tsc` reported **39 errors** in that one file. So the
work this run did was the half that actually reaches an operator: the tiles, the
labels, the states, the freshness line, and the two blocks that replaced the
animated widget.

Three further gaps came with it:

- **`dashboardMetricsTruthful.test.ts` did not exist.** The contract module's
  docstring cited it as the drift guard for the metric-key mirror. It is now
  `dashboardMetricsTruthful.test.tsx`, 20 cases, and it **parses** the backend
  registry rather than mirroring it.
- **The scoped-polling journey did not exist**, so the task's own
  `_Evidence:` line was unsatisfied — and it is the one claim only a browser can
  make.
- **Five test files still pinned the retired defaults.** `page-verification/
  admin-dashboard.test.tsx` asserted `System good` and `42 active users`;
  `serviceNormalization.test.ts`, `dashboardNormalizer.property.test.ts` and
  `frontend-django-alignment/service-normalization.property.test.ts` asserted
  `systemHealth` was always one of the four adjectives and that a null input
  produced `'good'`; `noScopeEmptyState.test.tsx` looked for the removed widget's
  "Total Applications" label. Each was updated to assert the *new* contract, and
  two of them gained an assertion that the retired vocabulary is now unreachable.

Two defects were found by running things rather than reading them: the
`no_scope` masked-404 collision (§9) and the `innerText` text-transform (§11.6).

## 13. Not claimed here

- **`applications_this_week` / `applications_this_month` are not compared against
  hand-written SQL.** Both are `activity_at >= <boundary>` where the boundary is
  computed in the platform's timezone (Monday, and the 1st). Reproducing that
  boundary in the test's SQL would mean reimplementing the expression the test is
  supposed to check independently, which is not an independent check — it is the
  same arithmetic twice. They are covered by the definition, state, and scope
  assertions like every other metric, and by `today_activity`, whose boundary
  (midnight) the SQL comparison **does** reproduce.
- **`applications.created_at` / `updated_at` are still never written by the create
  path** (9.1 §10). It shows up here as `today_activity`, `applications_this_week`
  and `applications_this_month` counting only rows with an `activity_at` — which on
  the harness means the two applications the review command touched, not the six
  that exist. The counters are correct for their stated definition; the *column* is
  the create lane's to fix, and this task does not change what the create path
  writes.
- **`avgProcessingTime`, `activeUsersLast7d`, `decisionVelocity24h`,
  `totalPrograms`, `activeIntakes` and the processing-time percentiles** are not
  registry metrics. They have no source in the dashboard payload, so they are not
  rendered rather than rendered as zeros. Giving them real sources is a separate
  piece of work; inventing them here would be the finding.
- **The analytics funnel** (`/api/v1/analytics/funnel/`) still answers a no-scope
  caller with zeros and a flag. It is a different endpoint with its own task-2.2
  gate; this task changed only the dashboard, and
  `test_no_scope_empty.py::TestFunnelNoScope` is untouched and still passing.
- **The student dashboard** is not in scope. Only the admin dashboard's metrics are
  ADM-02.
- **The review workspace** (`ApplicationDetailModal`) is task **9.4**, and the user
  directory is task **9.3** — both have their own page-derived habits, and no part
  of this contract was generalised speculatively to cover them.
- **A performance budget for the dashboard read.** It is one aggregate for every
  application counter plus one `GROUP BY` for the status breakdown plus one
  accounts aggregate plus the bounded activity feed; the query count is stated, not
  measured against a target. The perf lane owns budgets.
