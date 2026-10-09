# Task 9.1 — Create one scoped applications query and aggregate contract

Evidence index for task **9.1** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [-] 9.1 Create one scoped applications query and aggregate contract
  - Move search, filters, sort, pagination, facets, totals, deadlines, and saved
    filters server-side.
  - Make dashboard deep links use registered query parameters.
  - Do not derive filter options/totals from the loaded page.
  - _Requirements: R8.1, R8.6_
  - _Findings: ADM-01_
  - _Evidence: direct DB aggregate comparison and page 2+/filter browser tests_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-07 (UTC).
- Follows **8.4** deliberately rather than inventing a second pattern. 8.4's
  `SettlementQueryService` established scope-before-lookup, SQL aggregates over
  the whole filtered set, capability-driven redaction, a page-independent audited
  export, and a masked 404 on an out-of-scope identifier *filter*; 8.4 §10
  explicitly left the applications query contract here. This task spends that
  vocabulary on the roster and adds two things the money surfaces did not need:
  **facets** and **saved filters**.
- PBT: task 9.1 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`). Nothing is recorded via
  `update_pbt_status`.
- Schema: **one additive table**, `admin_saved_filters`
  (`backend/scripts/2026_08_06_01_admin_saved_filters.sql` + its rollback), proven
  on a Neon branch. Nothing was applied to the Neon default branch or to
  production (§6).

## The Required_Evidence claim

The `_Evidence:` line is two claims, and they are deliberately different kinds of
proof:

**1. A direct database aggregate comparison.** The endpoint computes its counters
with Django `Count(…, filter=Q(…))`; the evidence recomputes them with
hand-written SQL over the same filtered rows and asserts equality. Two different
query builders agreeing on one database is a materially stronger statement than
one builder agreeing with itself.

| Where | What it proves |
|---|---|
| [`test_application_query_contract_9_1.py::TestAggregatesEqualIndependentSql`](../../../backend/tests/unit/test_application_query_contract_9_1.py) | **15 counters** recomputed in raw SQL over an 18-row spread covering every status bucket, both payment poles, a late row and an unassigned row — plus the same comparison under a `status=` filter, and the deadline counter against an independent window count |
| [`raw/live-aggregate-comparison.txt`](raw/live-aggregate-comparison.txt) | the same comparison against the **running** stack: a cookie-authenticated `GET …?pageSize=5&page=3` returns **5 rows and counts 56**, and `psql` inside the harness Postgres reproduces all six headline counters and all four facet counts exactly |

**2. Page 2+ and filter browser tests.**
[`admin-applications-roster.spec.ts`](../../../apps/admissions/tests/harness-e2e/required/admin-applications-roster.spec.ts)
— **5 journeys × 2 viewports = 10, all passing on a freshly wiped harness with
zero skips** ([`raw/harness-roster-journeys.txt`](raw/harness-roster-journeys.txt)):

| Journey | The claim it settles |
|---|---|
| **page 2** | 26 seeded rows, 25 on screen: the rows change, the headline total does not, `page=2` is on the wire, and `Page 2 of N` is the server's `totalPages` |
| **filter** | choosing "Completed Only" sends `exclude_status=draft`, the total *moves with it*, and the address bar carries the registered spelling — not `draftFilter=` |
| **deep link** | `?deadline_pressure=true` (the dashboard's own tile link) arrives **applied**, the control shows it, and no "not applied" warning appears |
| **legacy link** | a pre-9.1 bookmark `?reviewQueueFilter=true` still opens its view and is rewritten to `review_queue=true` |
| **facets** | filter to the primary offering — not one secondary row is loaded — and the select **still** offers the excluded offering with its own whole-set count `(2)`. A pick list harvested from the loaded rows cannot do that |

Why a browser test adds something the API tests do not: every defect in ADM-01
was a *rendering* defect. The API always knew the total; the browser recounted the
rows it had.

## What this task establishes

1. **The totals are the server's.** `buildApplicationsOverview(applications,
   totalCount)` filtered the **loaded page** to produce fourteen numbers an
   operator reads as portfolio facts. There are now **21** SQL counters over the
   whole filtered set, and the builder is deleted (§1).
2. **The filter options are the server's.** `[...new Set(applications.map(a =>
   a.program))]` meant an offering with no row on the current page was not offered
   as a filter, and the option list changed as you paged. Facets are now SQL
   `GROUP BY` over the same filtered set, each option carrying its own count, with
   its **own dimension left open** so a filter can always be widened again (§2).
3. **A link is a reproducible query.** The platform had two spellings for one
   query — dashboard tiles emitted UI-state names, the backend's own review-SLA
   notification emitted `?status=…` — and one tile emitted
   `?deadlinePressureFilter=true`, which nothing on either side parsed. There is
   now one registered parameter set, a deep-link map asserted against it, and
   anything outside it is **echoed back** instead of silently dropped (§3).
4. **A page is a page.** "Load more" appended the next page to the rows on screen
   and a footer divided loaded-by-total into a "% loaded" figure. That is what made
   the page-derived totals *look* plausible: the list really did hold everything it
   was counting. It is one page of a report now, and the page arithmetic is the
   server's (§4).
5. **Authority is a capability, and scope precedes lookup.** `tenant.application.read`
   through `AdminCapabilityService`; no tenant scope is a **masked 404** rather
   than a confirming empty page; an out-of-scope `institution_id` /
   `program_offering_id` / `intake_id` / `assigned_reviewer_id` / `saved_filter` is
   the same masked 404 as one that does not exist, and the probe is audited (§5).
6. **A saved filter is a record, not a browser slot.** It was one `sessionStorage`
   key, so a saved view did not survive a cleared session or a second device,
   there was exactly one of them, and nothing recorded which tenant it belonged
   to. It is now an owner-scoped row that may hold **only registered parameters**
   (§6).
7. **Deadlines are a query.** "Deadlines in 48h" was a tile label with no matching
   filter. It is a registered SQL predicate over a derived `next_deadline_at`
   (soonest open condition deadline or enrollment-confirmation deadline), so the
   tile's number and the roster it opens describe the same set by construction (§7).

## Files

```
docs/v2-evidence/9.1/
├── README.md                                ← this index
└── raw/
    ├── application-suites.txt                   (19 failed / 163 passed / 30 errors — all pre-existing, §8.1)
    ├── application-suites-baseline.txt          (the SAME suites with 9.1's backend surface removed: 19/111/30)
    ├── catalog-authority-suites.txt             (25 failed / 568 passed — identical set to the baseline)
    ├── catalog-authority-suites-baseline.txt    (the same suites with 9.1 + its registry entries removed: 25/568)
    ├── roster-frontend-tests.txt                (49 passed — the 3 roster frontend files, verbose)
    ├── frontend-test.txt                        (whole suite: 3961 passed, 1 pre-existing failure)
    ├── frontend-lint.txt                        (21 errors — identical file set to 8.4, none in this task's files)
    ├── frontend-build.txt                       (exit 0, incl. tsc + CSP gate)
    ├── django-check.txt                         (no issues)
    ├── spectacular.txt                          (3 warnings / 116 errors — unchanged from 8.4)
    ├── neon-branch-proof.txt                    (the additive table proven on br-jolly-pine-ahybtg2e)
    ├── live-aggregate-comparison.txt            (server aggregates vs psql, on the running stack)
    └── harness-roster-journeys.txt              (10 passed — 5 journeys × desktop + mobile, fresh harness)
```

Source of the change:

| Path | What it is |
|---|---|
| `backend/apps/applications/query_service.py` | **new** — `ApplicationQueryService`: the one place that decides which applications an actor may see, how they filter and sort, what the whole-set totals are, which filter options exist in scope, and what an export may contain |
| `backend/apps/applications/admin_query_views.py` | **new** — `AdminApplicationQueryView` (`GET /api/v1/admin/applications/`) + the saved-filter list/detail views |
| `backend/apps/applications/admin_urls.py` | **new** — the three routes, in the canonical `/api/v1/admin/` namespace |
| `backend/apps/applications/models.py` | **new** `AdminSavedFilter` (`managed = False`, maps `admin_saved_filters`) |
| `backend/scripts/2026_08_06_01_admin_saved_filters.sql` + `_rollback.sql` | **new** — one additive, idempotent table (§6) |
| `backend/apps/catalog/tenant_audit_service.py` | `ACTION_APPLICATION_EXPORTED` registered next to 8.4's two export actions, so the platform has one export vocabulary rather than one per surface |
| `backend/config/urls.py` | mounts `apps.applications.admin_urls` |
| `scripts/authority_matrix_registry.py` | the three new routes registered with their capability, scope path, and disclosure policy |
| `apps/admissions/src/services/admin/applications.ts` | **new** — sends the query, returns the answer; counts, filters, groups and totals nothing |
| `apps/admissions/src/hooks/admin/useApplicationRoster.ts` | **new** — React Query hooks keyed on the **whole** server query |
| `apps/admissions/src/hooks/admin/useApplicationsData.ts` | rewritten: one page of rows, the server's aggregates/facets/page arithmetic, and `null` — never a zeroed shape — while there is no answer |
| `apps/admissions/src/hooks/admin/useApplicationFilters.ts` | the one UI-filter → registered-parameter map, plus URL read/write in registered names with legacy aliases accepted once and rewritten |
| `apps/admissions/src/pages/admin/lib/rosterDeepLinks.ts` | **new** — the six dashboard tile links, in registered parameters |
| `apps/admissions/src/pages/admin/lib/applicationsOverview.ts` | **deleted** — the page-derived overview builder |
| `apps/admissions/src/components/admin/applications/RosterPagination.tsx` | **new** — one page navigator; replaces "Load more" + "% loaded" |
| `apps/admissions/src/components/admin/applications/FiltersPanel.tsx` | facet-driven selects (`FilterSelectOption`, value = canonical id), the deadline control, and an `idPrefix` so the two panel instances stop sharing DOM ids (§9.1) |
| `apps/admissions/src/pages/admin/Applications.tsx` | server metrics with the server's definitions, the unapplied-parameter notice, the capability-gated export, one page navigator |
| `apps/admissions/src/pages/admin/Dashboard.tsx` | all six exception tiles link through `rosterDeepLink(...)` |
| `backend/tests/unit/test_application_query_contract_9_1.py` | **new** — 52 cases (§8) |
| `apps/admissions/tests/unit/applicationRosterServerOwned.test.tsx`, `applicationRosterDeepLinks.test.ts` | **new** — the wiring plus a source scan that fails if a page-derived habit returns |
| `apps/admissions/tests/harness-e2e/required/admin-applications-roster.spec.ts` | **new** — the 5 required browser journeys, desktop and mobile |
| `docs/canonical-truth-map.md` | "Admin applications query contract" — the registered parameter set, the aggregates and their definitions, the deadline window, saved filters, disclosure policy, and their frontend mirrors |

---

## 1. The totals are the server's (ADM-01)

### 1.1 What the browser used to do

```ts
// pages/admin/lib/applicationsOverview.ts, before — deleted
export function buildApplicationsOverview(applications: ApplicationSummary[], totalCount: number) {
  const decisionQueue = applications.filter(a => a.status === 'submitted' || a.status === 'under_review').length
  const paymentProofReview = applications.filter(a => a.payment_status === 'pending_review').length
  const acceptedPath = applications.filter(a => ACCEPTED.has(a.status)).length
  …
}
```

`applications` is **one page**. Load page 1 of 9 and "decision queue" silently
described 25 rows while sitting next to a `totalCount` of 214. The two numbers
came from different populations and the surface did not say so.

### 1.2 What runs now

`ApplicationQueryService.aggregates` is a single `.aggregate()` of **21**
conditional counters plus `Min`/`Max` timestamps, computed over the same filtered
queryset the page is drawn from:

```
total, draft_count, submitted_count, under_review_count, decision_queue_count,
waitlisted_count, approved_count, conditionally_approved_count, enrolled_count,
accepted_count, rejected_count, withdrawn_count, payment_resolved_count,
payment_pending_count, payment_rejected_count, payment_unpaid_count,
late_submission_count, unassigned_count, overdue_review_count,
deadline_pressure_count, today_activity_count
+ first_created_at, last_activity_at, next_deadline_at
+ review_sla_days, deadline_pressure_hours, row_limit, definitions
```

Turning a page cannot change them — asserted on both sides:
`test_aggregates_are_identical_on_every_page` (page 1 and page 2 return different
rows, `aggregates.total` identical) and the browser journey (the Portfolio tile is
byte-identical across Next/Previous).

**The vocabulary is borrowed, not invented.** `REVIEW_QUEUE_STATUSES` is the pair
`ApplicationFilter.filter_review_queue` already used; `ACCEPTED_STATUSES` mirrors
the frontend's own set; the resolved-payment tuple is imported from
`payment_constants.RESOLVED_PAYMENT_STATUSES` (ADR-001) rather than restated; the
review SLA is read from the same `review_sla_days` Setting the SLA reminder task
reads. Three `TestServiceInvariants` cases fail if any of them drifts. That is
what makes "decision queue" mean one thing in the counter and in the
`review_queue=true` filter — `test_review_queue_filter_and_counter_agree` asserts
the filtered total equals the unfiltered counter.

### 1.3 Each number carries its definition (R8.6)

R8.6 asks for *definition-labelled* metrics. `aggregate_definitions()` ships a
sentence per headline counter in the response, and the page renders it as the
tile's helper text. The dashboard's failure was not only wrong numbers; it was
numbers whose meaning nobody could state.

`definitions` is also how "no answer" is told apart from "zero": the frontend's
`EMPTY_APPLICATION_AGGREGATES` has `definitions: {}`, and `useApplicationsData`
returns `aggregates: null` — never a zeroed shape — while the server has not
answered, so a loading or failed read can never be read as "nothing to do"
(`test_an_empty_scope_is_an_honest_zero_with_its_window` covers the genuine zero:
`total: 0` **with** its window and its definitions).

## 2. The filter options are the server's, and they stay open

### 2.1 The harvested `Set`

```ts
const programs = [...new Set(applications.map(a => a.program).filter(Boolean))]
```

Two defects: an offering with no row on the current page was not offered as a
filter at all, and the option list *changed as the operator paged* — so the same
screen offered different filters depending on where you were.

### 2.2 SQL facets, each with its own dimension left open

Five facets (`status`, `payment_status`, `institution`, `program_offering`,
`intake`) are `GROUP BY` + `Count` over the filtered set. Options carry
`{value: canonical id, label: server label, count: whole-set count}` and a
`truncated` flag at `FACET_LIMIT = 200` rather than silently dropping options.

The view computes each facet with **that dimension's own filter cleared**
(`FACET_OPEN_DIMENSIONS`). Without it a status facet computed after
`status=approved` could only ever offer `approved` — ADM-01's defect reappearing
in a new place, with the operator filtered into a corner and no way back. Facets
describe *what else you could ask for*; aggregates describe *what you asked for*.

The browser journey is the sharp version of this: filter to the primary offering,
observe that no secondary row is loaded, and observe the secondary offering still
in the select **with its count of 2**.

Cost, stated plainly: the facet block runs one filtered query per dimension (five
per roster request) because each needs a different relaxation. That is the price
of options that do not lie; the alternative — one query and a Python regroup — is
the habit this task removes.

## 3. A link is a reproducible query (ADM-01's ignored-filter half)

### 3.1 What was broken

| Emitter | Emitted | The roster's URL reader | Result |
|---|---|---|---|
| "Deadlines in 48h" tile | `?deadlinePressureFilter=true` | not in `APPLICATION_FILTER_KEYS` | dropped → **unfiltered** list under a number describing a filtered set |
| five other tiles | `?overdueReviewFilter=true`, … | UI-state names, understood | worked, but only because the roster read its own private vocabulary |
| `review_sla_reminder_task` (backend) | `?status=submitted,under_review` | a *registered* name the reader did not look for | dropped |

So the platform had two spellings for one query and neither side owned the list.

### 3.2 One registered set, and unknown parameters are visible

`query_service.REGISTERED_PARAMETERS` is the contract's own list (27 names).
`REGISTERED_PARAMETER_BY_FILTER_KEY` + `ROSTER_URL_PARAMETERS` are the only
spellings the frontend writes to a URL, and `ROSTER_DEEP_LINK_QUERIES` holds the
six tile links. Two drift guards close the loop:
`TestRegisteredParameterContract::test_every_dashboard_deep_link_parameter_is_registered`
and `applicationRosterDeepLinks.test.ts`, which **parses the backend's own
`REGISTERED_PARAMETERS`** — so a new tile cannot reintroduce ADM-01 by inventing a
name.

Anything outside the set comes back in `filters.unknown_parameters` and the page
renders "Some link filters were not applied: …". A dropped parameter is now
*visible*; silence was the defect.

Legacy links keep working and are **upgraded**: the URL reader accepts the old UI
names as aliases, the registered name wins when both are present, and the writer
emits only the registered spelling — so a pre-9.1 bookmark is rewritten the first
time it is opened rather than preserved forever (browser journey 4).

`draftFilter` is deliberately **not** a parameter of its own: it is a lens over
`status` / `exclude_status`, so the two selects can no longer contradict each other
on one request.

## 4. A page is a page

`useApplicationsData` used to accumulate pages into one growing array, so "page 2"
meant "51 loaded rows", and the footer showed a "% loaded" figure. `RosterPagination`
renders one page of a report: `page`, `totalPages`, `totalCount` and `loadedCount`
are all the server's, the only arithmetic is `page ± 1`, and the bounds come from
`totalPages`.

`totalPages` is the server's arithmetic for the same reason 8.4 made it so: the
alternative was `Math.ceil(totalCount / pageSize)` in a browser this task exists to
stop deriving numbers in.

Sorting is an **allow-list** (`SORT_FIELDS`, nine keys) with legacy aliases
(`sortBy=date` → `activity_at`); an unknown key falls back to the default rather
than being interpolated into an `ORDER BY`
(`test_an_unknown_sort_falls_back_rather_than_interpolating`). Every ordering ends
in `id`, so page 2 of an equal-key run can neither repeat nor skip a row.

## 5. Authority is a capability, and scope precedes lookup (R3, R8.1)

No capability was invented. Reads use `tenant.application.read` (in the default
tenant read bundle, so a scoped Reviewer holds it for their own schools) and the
export uses `tenant.application.export` — the platform's one tenant export grant,
the same one 8.4 used. The catalogue stays at 17 `platform.*` + 17 `tenant.*`.

| Actor | Result |
|---|---|
| Scoped **Reviewer** | **200**, and `apply_reviewer_assignment_scope` narrows it to their *assigned* work (R8.2/AUTH-01) |
| Scoped **Tenant_Admin** | 200, their institutions only; the other tenant's rows, ids, names and counts absent from the whole body |
| `admin` with **no membership** | masked **404** — not a confirming empty page |
| **Student** | masked **404** |
| Anonymous | 401/403 |
| **Super_Admin** | everything, plus the platform-only `peer_offering_count` |

`test_the_service_never_compares_a_role_string` reads the service source and fails
on a role comparison.

**Identifier filters resolve before they reach a query.** `institution_id`,
`program_offering_id`, `intake_id`, `assigned_reviewer_id` and `saved_filter` are
each checked against the actor's scope *first*, so an out-of-scope value raises
`ApplicationScopeDenied` → masked 404 + a `scope.denied` Audit_Event, byte-identical
to a random UUID. A 200 with zero rows would answer a question the actor was not
entitled to ask: it would confirm the id resolves.

Two of those resolvers deserve their reasoning stated, because they are not simply
"is it in `visible_institution_queryset`":

- **intake** — intakes are platform-managed and shared, so "in scope" means *an
  intake the actor's own applications actually reach*. A scoped actor cannot use
  the roster to confirm an intake exists that no school of theirs participates in;
  an all-access actor may legitimately filter an intake with no applications yet.
- **reviewer** — resolved against the actor's own application set, so the roster
  cannot be used to enumerate another tenant's staff. A reviewer who has never
  been assigned work the actor can see is indistinguishable from one who does not
  exist.

`peer_offering_count` (how many *other* institutions offer the same canonical
program) is the one redacted column, and for a tenant actor it is **not computed** —
the query that would produce the cross-tenant inference never runs. Both worlds in
`test_peer_offering_count_is_platform_only` offer the same canonical program, so
the number is real and its absence is a decision.

**The export is a command** (R6.5): a separate capability, the whole filtered set
regardless of the page (`test_export_is_page_independent`), redacted by capability,
bounded by `EXPORT_ROW_LIMIT = 5000` with `EXPORT_TOO_LARGE` rather than a silent
truncation, and audited as `application.exported` recording the actor, scope,
filters and row count — **never the rows**
(`test_export_is_audited_without_the_rows`). A refused export emits `auth.denied`.

## 6. Saved filters, and the one schema change

### 6.1 What "saved filters" used to be

One `sessionStorage` key (`admin_applications_filters`). So: a saved view did not
survive a cleared session, a different browser, or a second device — it could not
be shared with a colleague or cited in a handover; there was exactly **one** slot,
which makes "saved filters" really "the last filters I used"; and nothing recorded
which tenant it belonged to, so a filter saved while one school was selected
silently reapplied to another.

### 6.2 What it is now

`admin_saved_filters` — an actor-owned, optionally institution-bound name for a
set of query parameters:

| Property | How it holds |
|---|---|
| private to its owner | list/read/delete filter by `user_id` **before** any lookup; another operator's id is the same masked 404 as one that does not exist |
| cannot outlive its justification | an `institution_id` binding is re-resolved through `visible_institution_queryset` on read and reported as `institution_in_scope: false` rather than quietly applied |
| **registered parameters only** | an unregistered parameter is rejected with `UNREGISTERED_QUERY_PARAMETER`. Persisting one would write ADM-01's own defect to disk: a stored filter the roster silently ignores every time it is opened |
| refine, don't accumulate | saving the same name is an update (unique on `(user_id, lower(name))`), so an operator sharpens a view instead of collecting near-duplicates they cannot tell apart |
| the request still wins | `?saved_filter=<id>` supplies the *base* query and explicit parameters override it, so opening a saved view and then narrowing it works |
| the database is the final race guard | a concurrent save of the same name converges on the existing row via `IntegrityError` |

### 6.3 The migration, proven on Neon

[`raw/neon-branch-proof.txt`](raw/neon-branch-proof.txt) — project
`mihasApplication`, branch **`br-jolly-pine-ahybtg2e`** (the rehearsal branch prior
admissions-v2 tasks reuse; the project is at its branch limit), database `neondb`:

- re-running all six statements of the forward script on a database that already
  has the table is a **no-op** — every statement is guarded, so a re-run after a
  migration-tracking wipe converges rather than failing, which is what
  `apply_sql_migrations` relies on;
- the built table, its four indexes (including the `lower(name)` unique index) and
  both `ON DELETE CASCADE` FKs are recorded as Postgres reports them;
- the uniqueness claim is **exercised**, not asserted: the same owner saving
  `overdue` after `Overdue` is refused by
  `uq_admin_saved_filters_owner_name`, while a *different* owner saving `Overdue`
  succeeds, and an unbound (`institution_id IS NULL`) row is legal.

Nothing was applied to the Neon default branch. **Nothing was applied to
production** — per the infrastructure rules that is an operator step: back up
first, then `apply_sql_migrations`, which picks the script up by filename. No
`DROP` / `DELETE` / `TRUNCATE` was run anywhere; the three rehearsal rows left on
the branch are named in the proof file rather than silently removed.

## 7. Deadlines became a query

`DEADLINE_PRESSURE_HOURS = 48` is the dashboard tile's own window, promoted from a
label to a registered SQL predicate over a derived `next_deadline_at` — the
earliest **open** `ApplicationCondition.deadline` (a subquery excluding `met` and
`waived`) coalesced with `enrollment_confirmation_deadline`. So:

- the tile's count and the roster it links to describe the same set;
- `deadline_pressure=true` is a real filter with a visible control — a filter
  applied by a link with no control is a page an operator can neither explain nor
  clear;
- `sort=deadline` orders by the derived column
  (`test_sort_by_deadline_orders_by_the_derived_column`);
- `deadline_pressure_count` equals an independent SQL count over the same window,
  including a row whose pressure comes from a **condition** deadline rather than
  the enrollment column — which the enrollment column alone misses
  (`test_deadline_pressure_aggregate_matches_raw_sql`).

One implementation note worth recording because it is not obvious: the aggregate
for the soonest deadline is computed as `soonest_deadline_at` and renamed once in
`aggregates()`. An aggregate alias that shadows a **subquery-backed annotation**
alias makes Django emit the annotation's name as a bare column in the outer
aggregation query, which Postgres rejects. The published key is still
`next_deadline_at`; the internal alias never reaches the contract.

## 8. Verification (verbatim)

### 8.1 Backend application suites, against a measured baseline

`cd backend && DATABASE_URL=<localtest 5433> TESTING=1 python3 -m pytest $(ls tests/unit/*.py tests/property/*.py | grep -iE "application")`
— against the isolated `mihas-localtest` Postgres. Neon and production were not
touched.

| Run | Result |
|---|---|
| **baseline** — 9.1's backend surface removed (the three new modules moved aside, the URL include and the three registry entries reverted) | **19 failed, 111 passed**, 30 errors |
| **9.1** | **19 failed, 163 passed**, 30 errors |

[`application-suites.txt`](raw/application-suites.txt) /
[`application-suites-baseline.txt`](raw/application-suites-baseline.txt). This is a
*measured* baseline, not an argument: **+52 passing, and the failing and erroring
sets are identical by name.** The 19 failures and 30 errors are the pre-existing
clusters catalogued in [8.4 §7](../8.4/README.md) plus the de-AI lane's two
`test_applications_serializers.py` cases, which pin
`ApplicationAdminSummaryView` / `ApplicationPreviewSummaryView` — classes that
lane **deleted** (verified: neither name exists anywhere under `backend/apps/`).

### 8.2 The task's own suite

`tests/unit/test_application_query_contract_9_1.py` — **52 passed**, every case
under the `production_scope` fixture so what is measured is the real
membership/grant-derived capability model and never a test-settings shortcut:

| Class | Cases | What it settles |
|---|---|---|
| `TestAggregatesEqualIndependentSql` | 3 | the Required_Evidence claim: 15 counters, a filtered set, and the deadline window, each against raw SQL |
| `TestNothingIsDerivedFromTheLoadedPage` | 4 | aggregates identical on every page; facets complete regardless of page; a narrowed query still offers its dimension's other values; options carry ids **and** labels |
| `TestAuthorityIsCapabilityDerived` | 4 | scoped reviewer 200 (assignment-narrowed), student masked, no-scope admin masked, anonymous denied |
| `TestCrossTenantIsolation` | 8 | tenant B absent from list/aggregates; searching B's applicant returns the same body as nonsense; four identifier filters masked; the probe audited; the reviewer filter cannot enumerate B's staff; `peer_offering_count` platform-only |
| `TestRegisteredParameterContract` | 4 | every deep-link parameter registered; an unknown one echoed; a understood query reports none; an unknown sort falls back |
| `TestFiltersRunInSql` | 6 | review queue, SLA, amendments, `exclude_status` + search composition, application-number search, deadline sort |
| `TestEnvelopeAndDefinitions` | 3 | the envelope + pagination shape; a definition per headline metric; an honest zero with its window |
| `TestExportIsACommand` | 6 | page-independent, capability-gated, audited without rows, redacted, tenant-isolated, refused rather than truncated |
| `TestSavedFilters` | 9 | save/list/apply, explicit override, update-by-name, unregistered rejection, owner privacy, cross-tenant binding masked, delete, name required, and the **database's** own duplicate refusal |
| `TestServiceInvariants` | 5 | the borrowed vocabularies; grouping/counting happen in SQL; the export limit is declared; no role string is compared |

### 8.3 Backend catalog / capability / authority suites

`python3 -m pytest $(ls tests/unit/*.py tests/property/*.py | grep -iE "catalog|capabilit|permission|authorit|tenant|scope|cross_tenant")`
— run because this task adds three routes and an authority gate.

| Run | Result |
|---|---|
| **baseline** (9.1 + its registry entries removed) | 25 failed, 568 passed, 6 skipped |
| **9.1** | **25 failed, 568 passed**, 6 skipped |

[`catalog-authority-suites.txt`](raw/catalog-authority-suites.txt) /
[`…-baseline.txt`](raw/catalog-authority-suites-baseline.txt). The failing sets are
**identical by name** (diffed), and identical to the 25 that 8.4 §7.4 catalogued
and traced to other lanes — the de-AI lane's stale registry/gap-register pins and
task 2.2's no-scope masking of `/admin/capabilities/` and the dashboard. This task
neither fixes nor adds one.

### 8.4 Frontend gates

| Gate | Result | Artifact |
|---|---|---|
| `bun run test` | **1 failed / 3961 passed / 1 skipped** (466 files) — the single failure is the pre-existing `authPageFormMarkup` copy conflict | [`frontend-test.txt`](raw/frontend-test.txt) |
| `bun run lint` | **21 errors, 0 warnings** — same count *and the same file set* as 8.4 (diffed); none in this task's files | [`frontend-lint.txt`](raw/frontend-lint.txt) |
| `bun run build` | **exit 0** (includes `tsc -p tsconfig.build.json --noEmit`, `vite build`, and the CSP gate) | [`frontend-build.txt`](raw/frontend-build.txt) |
| the 3 roster frontend files | **49 passed** | [`roster-frontend-tests.txt`](raw/roster-frontend-tests.txt) |

vs 8.4's run: **+46 tests passing, +2 test files**, same single failure. That
failure is `tests/unit/authPageFormMarkup.test.tsx`, which asserts the SignUp
helper copy "We'll verify this address." while the page in this worktree says
"We'll send account updates here." — another in-flight task's edit, catalogued in
[8.1 §4.1](../8.1/slice-2-frontend.md), the task 7.5 evidence, and
[8.3 §7.1](../8.3/README.md) / [8.4 §7.3](../8.4/README.md). Unrelated to the roster.

### 8.5 Django system checks

`cd backend && python3 manage.py check`

```
LENCO_API_SECRET_KEY is not set — payment processing will be unavailable.
System check identified no issues (1 silenced).
CHECK_EXIT=0
```

[`django-check.txt`](raw/django-check.txt). The LENCO line is the expected
local-dev notice — this machine holds no provider credential.

> **`manage.py check` must run with the repo's own environment.** Exporting a
> `TESTING=1` or a substitute `REDIS_URL` first flips `CACHES` to `LocMemCache`
> (`base.py` `_is_testing`) and the check then reports
> `django_ratelimit.E003 — not a shared cache`. That is the override talking, not
> the platform (recorded by 8.3 §7.7 and 8.4 §7.5, re-confirmed here).

### 8.6 OpenAPI schema

`cd backend && python3 manage.py spectacular --file /tmp/schema-9.1.yaml`

```
Warnings: 3 (3 unique)
Errors:   116 (26 unique)
SPECTACULAR_EXIT=0
```

[`spectacular.txt`](raw/spectacular.txt) — identical counts to 8.2, 8.3 and 8.4.
The four new operations (`admin_applications_query`,
`admin_application_saved_filters_list` / `_save` / `_delete`) are present in the
generated schema and **none of them appears in the error list**: each declares its
parameters and responses through `extend_schema`, so this task adds no "unable to
guess serializer" error.

### 8.7 Browser journeys

`cd apps/admissions && HARNESS_PW_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://localhost:8090 bunx playwright test -c playwright.harness.config.ts --project=chromium-required --project=mobile-required tests/harness-e2e/required/admin-applications-roster.spec.ts`

```
Running 10 tests using 1 worker
  … 10 passed (45.2s)
PW_EXIT=0
```

[`harness-roster-journeys.txt`](raw/harness-roster-journeys.txt). Run against the
task-0.4 isolated harness brought up **fresh** (`harness/bin/harness up` wipes
volumes; the database held 0 applications before the run), with the strict
`harness-fixtures.ts` gates active: zero skips, no console errors, no unasserted
failed requests. The harness was torn down afterwards
(`harness/bin/harness down`, volumes wiped).

`HARNESS_PW_CHANNEL=chrome` is the config's documented escape hatch: Playwright's
bundled Chromium has no build for this machine, so the required projects run
against the system Chrome. It changes the browser binary, not the assertions.

### 8.8 Failures introduced by this task

**Zero**, against measured baselines rather than assertion:

| Scope | Evidence |
|---|---|
| Backend application suites | baseline 19 failed / 111 passed / 30 errors → 19 / **163** / 30; failing + erroring sets identical by name (§8.1) |
| Backend authority suites | baseline 25 failed / 568 passed → 25 / 568; failing sets identical by diff (§8.3) |
| Frontend | same single pre-existing failure; lint count **and file set** identical to 8.4 (§8.4) |
| Build / check / schema | exit 0, no issues, unchanged counts (§8.4–8.6) |

## 9. What the prior attempt had wrong, and what it cost

A substantial prior attempt existed in the working tree: the service, the views,
the routes, the migration, the 52-case suite, the frontend rewrite, the canonical
truth-map entry, and the harness spec. The backend and the frontend unit layers
were sound. The **browser layer had never run** — this task's `_Evidence:` line
was not actually satisfied — and running it surfaced three real defects:

### 9.1 Two filter panels shared their DOM ids (product defect)

`FiltersPanel` hardcoded `id="draft-filter"`, `id="program-filter"`, … and the
roster renders it **twice**: a desktop rail (`hidden sm:block`) and a mobile sheet.
With the sheet open, two elements shared every id. That is not cosmetic:
`<label for="draft-filter">` resolves to whichever comes first in the document, so
on a small viewport the mobile control's label pointed at the **hidden desktop
control** — a click on the label or a screen-reader activation reached the wrong
element. It also made the mobile journey unwritable.

Fixed with an `idPrefix` prop (default `''`, so the desktop ids are unchanged) and
`data-roster-filters="mobile" | "desktop"` on the two containers. The mobile
instance now owns the `mobile-` namespace.

### 9.2 The spec read a DOM attribute that does not exist

`visibleRowIds()` queried `[data-application-id]`, which exists only on the
student payment card — never on an admin roster row. It returned `[]` on every
call, so `expect(firstPageIds.length).toBe(PAGE_SIZE)` could not pass. Rewritten
to read the row selection checkboxes' accessible names
(`input[aria-label^="Select application "]`), which the roster already renders —
identifying a row costs the product nothing.

### 9.3 The seed assumed the harness publishes two canonical programs

It asserted `canonicals.length > 1` from `/catalog/canonical-programs/`. The
harness seeds two canonical programs but an offering for only one, and that
endpoint lists canonical programs **that have an active offering** — so it returns
one, and the seed aborted before any journey ran.

Two more facts had to be respected rather than assumed:

- **One canonical program + one intake resolves to exactly one offering.**
  `OfferingAssignmentService.assign` picks a single offering by
  `(program-intake priority, offering priority, code, id)`. Two offerings sharing
  an intake would leave one with **no applications**, so the facet claim would be
  vacuous. The seed now uses **one intake per offering**, which is what makes both
  offerings real.
- **The facet claim cannot rest on row order.** The seeded rows have NULL
  `created_at` / `updated_at` (see §10), so `activity_at` is NULL for all of them
  and the ordering falls to the `id` tie-break. The claim was rewritten to be
  ordering-independent and is now *stronger*: filter to the primary offering so
  **no** secondary row is loaded, and assert the secondary offering is still
  offered with its whole-set count of 2. A pick list harvested from the loaded
  rows cannot survive that, whatever the order.

One further seed change: applications are created **serially**. The harness
database does not install the `next_application_number` SQL helper, so the platform
falls back to "count the rows, then attempt", which two concurrent creates lose
with an `applications_application_number_key` unique violation. The uniqueness
constraint is doing its job; the seed simply declines to race it. That gap belongs
to the harness fixture, not to this task.

## 10. Not claimed here

- **`applications.created_at` / `updated_at` are never written by the create
  path.** Both columns are nullable with no default and the model declares no
  `auto_now_add`, so every application seeded through
  `POST /api/v1/applications/` on the harness has NULL timestamps. The roster
  behaves correctly — its ordering is total and deterministic
  (`-activity_at, -created_at, -id`) — but with no timestamps "most recent first"
  degenerates to a UUID tie-break, and the row cards render "Not available" for
  their date. This is a **create-path / schema observation, not a query-contract
  defect**, and fixing it means writing the columns (or adding a database default)
  in the application create lane. Recorded here because this task is where it
  became visible; deliberately not fixed here, because changing what the create
  path writes is not this task's scope.
- **The dashboard's own metrics** (ADM-02) are task **9.2**. This task changed
  exactly one thing on `Dashboard.tsx`: the six tile `to=` values now come from
  `rosterDeepLink(...)`. The tile *numbers* still come from the admin dashboard
  service and are 9.2's subject.
- **The review workspace** (`ApplicationDetailModal`, the per-application detail
  composition) is task **9.4**. The roster row deliberately carries triage fields
  only; `grades_summary`, `points`, `age`, `days_since_submission` and the payment
  amounts are `null` — absence rendered as absence, never a healthy zero — and the
  workspace fetches them for the one application an operator opened.
- **The applications export endpoint** `/api/v1/applications/export/` still
  exists and keeps its own task-2.2 capability gate; the two failing fixtures
  against it are catalogued in 8.4 §7.4 and are not touched. `?export=csv` on the
  new roster route is a *separate*, page-independent export and does not replace it.
- **The user directory** (ADM-03, task 9.3) has the same page-one-then-filter
  shape. It is not in scope here, and no part of this contract was generalised
  speculatively to cover it.
- **A performance budget for the facet block.** Five filtered queries per roster
  request is stated in §2 as a cost, not measured against a target; the perf lane
  owns budgets.
