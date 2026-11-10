# Task 10.6 — Consolidate the student application workspace

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

Evidence index for task **10.6** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [-] 10.6 Consolidate the student application workspace
  - Choose one canonical route for next action, status, payment, documents,
    interview, communications, conditions, amendments, enrollment, and history.
  - Redirect the duplicate route and remove duplicate data/action logic after
    usage and browser parity proof.
  - _Requirements: R13.1-R13.7, R13.13_
  - _Findings: STU-23, API-04, MAINT-01_
  - _Evidence: route redirect, parity tests, and golden student lifecycle E2E_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-09 (UTC). **An earlier dispatch of this task was interrupted**
  after the code landed but before any gate ran, before the golden journey existed,
  and before this README existed. §11 records exactly what was inherited, what was
  re-measured, and the **three real defects** the gates then found — two in the
  inherited work and one in the product, found by writing the browser journey.
- **STU-23 was not a broken surface. It was two working ones.**
  `/student/application/:id` and `/student/status` were both live workspaces over
  the same application, with different actions, different cache keys and two
  interview renderers. That is why a unit test could not see it and why the
  `_Evidence:` line asks for a browser journey.
- This task **removes** what tasks 10.2 §13 and 10.4 §11 deferred to it, after
  measuring zero use twice (§2): the deprecated `/email-slip/` route with its view
  and its two serializers, the five `applicationService.generate*` methods, and the
  second student workspace. It **deprecates rather than deletes** the duplicate
  staff condition front door, and §5 states why that asymmetry is the correct
  reading of R2.5 rather than an inconsistency.
- **Schema: no.** No SQL script, no migration, no model change. The published
  OpenAPI contract *is* regenerated, because a removed route that still appears in
  the contract is the API-04 drift this task closes (§6).
- PBT: task 10.6 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`), so nothing is recorded through
  `update_pbt_status` and no numbered spec property is claimed. Unlike 8.3/10.3/10.5
  it also adds **no** task-level property suite: every claim here is about a
  specific route, a specific affordance or a specific removal, and there is no
  input space to quantify over. Stated rather than silently skipped.

## The Required_Evidence claim

The `_Evidence:` line names **three** things.

| Claim | Where it is settled |
|---|---|
| **route redirect** | [`studentWorkspaceConsolidation.test.tsx`](../../../apps/admissions/tests/unit/studentWorkspaceConsolidation.test.tsx) §1–2 (12 cases) — the duplicate is registered as a `duplicateRedirects` entry and **not** an alias; it resolves to `DuplicateRouteRedirect` and not a page; it keeps the student inside the `student` guard while hopping; it carries the application id, the query string and the hash; it falls back to the dashboard rather than building a malformed URL; a hostile id is encoded; `matchesRoutePath` refuses it while `routeByPath` still recognises it — the difference between "retired duplicate" and "unknown URL". **Browser:** leg 0 of the golden journey |
| **parity tests** | the same file §3–5 and §4b (26 cases) — no production surface builds a bare link to the retired path; the two affordances only the retired page had (public tracking, nationality/institution) are on the survivor; the *richer* of the two interview renderers wins, so a virtual interview is **clickable**; one detail read, one cache key, no surface still evicting the retired one; and a deferred fee is an action rather than a dead end (§9.2 — the defect the journey found). **Backend:** [`test_condition_front_doors_10_6.py`](../../../backend/tests/unit/test_condition_front_doors_10_6.py) (15) and [`test_email_slip_route_removed_10_6.py`](../../../backend/tests/unit/test_email_slip_route_removed_10_6.py) (13) — the removals' parity halves |
| **golden student lifecycle E2E** | [`student-lifecycle-golden.spec.ts`](../../../apps/admissions/tests/harness-e2e/required/student-lifecycle-golden.spec.ts) — R13.7's seven legs plus the consolidation itself, in **one** test, **one** applicant, **one** session, on **desktop and mobile** ([`raw/harness-golden-lifecycle.txt`](raw/harness-golden-lifecycle.txt)) |

**50** frontend cases and **28** backend cases, plus the browser journey.

### The golden journey's eight legs

R13.7: *"A student browser journey SHALL cover submitted/deferred payment recovery,
amendment, interview, communication, decision, official document download, and
terminal tracking on desktop and mobile."*

| Leg | The claim it settles |
|---|---|
| **0. the redirect** | a bookmark of `/student/application/:id?from=bookmark` lands on `/student/application/:id/status?from=bookmark`, renders the same workspace, and **Back does not bounce** — the history entry was replaced, not pushed |
| **1. deferred payment recovery** | the workspace offers *Complete deferred payment*, the payment page names the deferral as the student's own choice, the fee is collected there, and the ledger settles. The workspace then reads the platform's own paid position |
| **2. amendment** | requested from the workspace's form, and the request appears in the workspace's own amendment history as `PENDING` |
| **3. interview** | a virtual interview scheduled by the school renders here as a **joinable link** with `rel="noopener"` — the affordance only the retired page had |
| **4. communication** | the workspace reaches `/student/communications` (the single inbox), and the messages this lifecycle produced are there with the delivery state only that surface holds |
| **5. decision** | `under_review → approved` moves the workspace's state **and** its recorded-changes history, including the note the reviewer left |
| **6. official document download** | the slip is requested from the workspace's own control and reaches `ready` with a stored `document_id` and a **server-produced** `download_url` |
| **7. terminal tracking** | the tracking link is issued from this workspace, carries neither the application number nor the applicant's email, and opens the status in a **clean context with no session** — while disclosing the status and not the applicant |

Why one test and not eight: *"a student journey"* is a sequence. Split into eight
tests it would prove eight visits; as one it proves a lifecycle, and each leg
inherits the state the previous one left. It is also deliberately **not** a re-run
of the seven post-submission lanes — each of those has its own required journey
proving that surface in depth, and duplicating them here would only make this file
fail for another lane's reason. Every leg asserts the *weakest* claim that would
fail if the consolidation were wrong.

## What this task establishes

1. **There is one student application workspace.** `/student/status`, reachable per
   application at `/student/application/:id/status`, owns all ten concerns R13.13
   names. §4 walks them.
2. **The duplicate is a redirect, not an alias.** An alias would keep two live URLs
   for one surface — the shape R13.13 forbids. `duplicateRedirects` is a distinct
   registry concept so that nav highlighting and skeleton selection (`matchesRoutePath`)
   treat the old path as a *hop*, while `routeByPath` still resolves it so a caller
   can tell a retired duplicate from a 404 (§3).
3. **The redirect preserves what the student had.** The application id, the query
   string, the hash, and the `student` guard; and it **replaces** the history entry,
   so Back does not bounce them between two URLs for one application (§3.1).
4. **Parity was proved before removal, not asserted after.** The retired page had
   three things the survivor did not: the public-tracking control, the nationality
   and institution fields, and a *clickable* virtual-interview link. All three moved
   before the page was deleted (§4.1).
5. **The duplicate reads are gone.** One `applicationService.getById` for the whole
   workspace, asking for `statusHistory` on that same read; one cache key
   (`application-workspace`); and the two other surfaces that evicted the retired
   key were moved with it (§4.2).
6. **Three removals, each measured twice.** §2 is the pre-removal reading (from the
   interrupted dispatch, kept verbatim) and the post-removal re-reading, for the
   duplicate route, the five `generate*` methods and the `/email-slip/` route.
7. **The published contract no longer advertises what was removed.** The
   pre-removal reading found `/email-slip/` still in `openapi.v2.candidate.yaml` and
   in the generated `api.d.ts`; both were regenerated and both are now clean (§6).
8. **The duplicate staff condition door decides nothing.** `…/conditions/{cid}/verify/`
   normalises its two-outcome request and delegates to the canonical three-outcome
   `review_condition`, so there is one implementation, one audit action and one
   evidence-history writer. It is **deprecated, not deleted**, and §5 states why.
9. **A deprecated route does not quietly adopt its successor's stricter rules.**
   Waiving still needs no reason *here*; the response shape is unchanged; an
   already-resolved condition is still `CONDITION_NOT_PENDING` with a 400 (§5.1).
10. **A deferred fee is an action, not a dead end** — the defect writing the browser
    journey found, in the product rather than in the test (§9.2).

## Files

```
docs/v2-evidence/10.6/
├── README.md                                  ← this index
└── raw/
    ├── usage-measurement.txt                      (the R2.5 reading: pre-removal, verbatim from the interrupted dispatch, + the post-removal re-reading)
    ├── selection.txt                              (the 19 selected backend files)
    ├── candidate.txt                              (6 failed / 451 passed)
    ├── baseline.txt                               (the same selection with only this task's edits removed: 6 / 423)
    ├── candidate-failing-set.txt                  (6 sorted entries)
    ├── baseline-failing-set.txt                   (6 sorted entries — comm both ways is empty)
    ├── baseline-reconstruction.sh                 (how the baseline was produced: §10.1)
    ├── view-classification-attribution.txt        (why the 6th failure is pre-existing: 55 unclassified at HEAD vs 38 here)
    ├── frontend-test.txt                          (1 pre-existing failure / 4282 passed / 1 skipped, 481 files)
    ├── frontend-lint.txt                          (17 errors — identical to 10.5)
    ├── frontend-lint-files.txt                    (14 files — byte-identical to 10.5's set)
    ├── frontend-build.txt                         (exit 0, incl. tsc + the CSP gate)
    ├── django-check.txt                           (no issues)
    ├── spectacular.txt                            (3 warnings / 116 errors — unchanged from 10.5)
    ├── schema-regen.txt                           (the contract + client-type regeneration)
    ├── schema-contract.txt                        (the retired route absent from both, the successor present, the deprecated door still published)
    ├── harness-golden-lifecycle.txt               (2 passed — the journey × desktop + mobile, on a freshly wiped harness)
    ├── harness-required-suite.txt                 (the whole required profile: 146 passed / the 2 pre-existing tenant-launch failures)
    ├── harness-required-without-10-6.txt          (the same profile with `--grep-invert=golden`: 142 passed / the same 2 — see §10.5)
    ├── harness-gatecheck.txt                      (4 failed, as required — the gates fire)
    └── harness-drain.txt                          (broker 0, unsettled payment collections 0)
```

Source of the change:

| Path | What it is |
|---|---|
| `apps/admissions/src/pages/student/ApplicationDetail.tsx` | **deleted** — the second workspace. Its three unique affordances moved to the survivor first (§4.1) |
| `apps/admissions/src/routes/DuplicateRouteRedirect.tsx` | **new** — a duplicate route whose canonical successor is *parameterised* cannot be a static `<Navigate>`; this reads the matched params, rebuilds the canonical path, carries the search and hash, and `replace`s the history entry |
| `apps/admissions/src/routes/routeRegistry.ts` | `duplicateRedirects` as a first-class concept beside `aliases`, `studentApplicationWorkspacePath`, `duplicateRedirectPaths`, `matchesDuplicateRedirect`; `student.applicationDetail` gone |
| `apps/admissions/src/routes/config.tsx` | the duplicate path now renders the redirect, still behind the `student` guard |
| `apps/admissions/src/pages/student/ApplicationStatus.tsx` | the survivor: public tracking, nationality, institution, `InterviewDetails`, `ApplicationHistory`, the one cache key, the one detail read — and the deferred-fee affordance (§9.2) |
| `apps/admissions/src/components/student/applicationStatus/ApplicationHistory.tsx` | **new** — the platform's own `ApplicationStatusHistory` rows: the transition, the actor, the note. It was on `GET /applications/{id}/summary/` and **no** student surface read it |
| `apps/admissions/src/components/student/{ApplicationListItem,DashboardStatusOverview}.tsx` | repointed at `studentApplicationWorkspacePath` |
| `apps/admissions/src/components/student/applicationStatus/NextActionCards.tsx` | "View full application details" removed — it linked to the page the student was already on |
| `apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts`, `pages/student/lib/dashboardReducer.ts` | moved onto the one cache key |
| `apps/admissions/src/services/applications.ts` | the five `generate*` methods **removed**, with the reason recorded in their place |
| `apps/admissions/src/lib/slipService.ts` | no longer emails: the route it POSTed is gone, and it is deliberately *not* repointed at the canonical email (§7) |
| `apps/admissions/src/services/admin/reviewWorkspace.ts` | `verifyCondition` → `reviewCondition`, on the canonical three-outcome route |
| `apps/admissions/src/components/admin/applications/ApplicationDetailModal.tsx` | the reviewer's control issues the canonical command, so `changes_required` is reachable from where a reviewer works |
| `apps/admissions/src/services/officialDocuments.ts` | the comment that described `/email-slip/` as a live proxy now records that the window is closed |
| `backend/apps/applications/urls.py` | the `<id>/email-slip/` route **removed** |
| `backend/apps/applications/student_document_views.py` | `EmailSlipView` **removed** |
| `backend/apps/applications/_view_helpers.py` | `EmailSlipSerializer`, `EmailSlipQueuedSerializer`, `EmailSlipEnvelopeResponseSerializer` **removed** |
| `backend/apps/applications/student_views.py` | the compatibility re-export surface no longer keeps a deleted view alive |
| `backend/apps/applications/admin_amendment_views.py` | `ApplicationConditionVerifyView` stops deciding: it normalises and delegates, answers with `Deprecation`/`Link` headers, and maps the canonical refusals back onto its own stable codes |
| `backend/schema/openapi.v2.candidate.yaml`, `apps/admissions/src/generated/api.d.ts` | regenerated: the retired route is gone from the published contract |
| `backend/tests/unit/test_condition_front_doors_10_6.py` | **new** — 15 cases (§8.1) |
| `backend/tests/unit/test_email_slip_route_removed_10_6.py` | **new** — 13 cases (§8.2) |
| `backend/tests/unit/test_email_slip_endpoint.py` | **deleted** — it existed only to pin the removed route |
| `backend/tests/property/test_bug5_email_slip.py` | moved onto the route that now carries the capability (§8.3) |
| `backend/tests/unit/test_view_auth_classification.py` | `EmailSlipView` removed from `_PROTECTED` |
| `apps/admissions/tests/unit/studentWorkspaceConsolidation.test.tsx` | **new** — 50 cases (§8.4) |
| `apps/admissions/tests/property/test_bug2_preservation.test.ts` | moved onto the one cache key (§8.5) |
| `apps/admissions/tests/unit/pageShellRenderSmoke.test.tsx` | 22 → 21 consumers: the retired workspace was one (§8.5) |
| `apps/admissions/tests/harness-e2e/required/student-lifecycle-golden.spec.ts` | **new** — R13.7's journey, desktop and mobile |

---

## 1. What was wrong (STU-23, API-04, MAINT-01)

STU-23:

> `ApplicationDetail` and `ApplicationStatus` are overlapping workspaces with
> different actions and duplicate payment, document, interview, and timeline logic.

Both were live, both worked, and both were reachable from the dashboard. The
differences were not cosmetic:

| Concern | `/student/application/:id` (retired) | `/student/status` (canonical) |
|---|---|---|
| public tracking | **had it** — the only way to get a link | absent |
| nationality, institution | **shown** | absent |
| virtual interview location | `InterviewDetails` → a **clickable** meeting link | inline text — an unclickable string |
| status history | absent | absent (on *both*, despite the server publishing it) |
| cache key | `['application-detail', id]` | `['application-status', id]` |
| detail read | its own | its own |

So a student with a video interview got a joinable link on one URL and a dead
string on the other; a student who wanted to share their status could only do it
from one of them; and a mutation on either left the other stale, because the two
cache keys were independent. That last one is the shape of the finding: not a bug
you can point at, but two truths about one application.

R13.13 names the remedy:

> ONE canonical student application workspace SHALL own status, next action,
> payment, documents, interview, communications, conditions, amendments,
> enrollment, and history; duplicate routes SHALL redirect to it.

API-04 and MAINT-01 are the same defect one layer down — duplicate legacy and
official document paths, and files that mix orchestration with rendering. This task
closes the *route* half of both.

## 2. The measurement, before anything was removed (R2.5)

R2.5 requires a measured usage reading before a removal, and R13.5 says legacy
callers are removed "after measured zero use". The reading is
[`raw/usage-measurement.txt`](raw/usage-measurement.txt), and it has two halves:

- **the pre-removal reading**, captured by the interrupted dispatch against the
  working tree at base commit `bae29a28d` — kept **verbatim**, because a measurement
  taken after the removal is not a measurement of the thing removed;
- **the post-removal re-reading**, captured by the dispatch that finished the task,
  which is what proves the removal was complete rather than partial.

| Subject | Pre-removal | Post-removal |
|---|---|---|
| `/student/application/:id` | **7** production call sites across 5 files | **0** links; 2 occurrences, both the redirect's own registration |
| `applicationService.generate*` | **0** call sites (the 10.4 §8 reading, re-confirmed) | **0**; the five methods are gone. The name survives only as `@/lib/pdf`'s dev-preview renderer, a different symbol |
| `POST …/email-slip/` | **1** production call site (`slipService.ts`) + **the generated OpenAPI mirror** | **0** code occurrences; 5 comments; absent from the contract |
| `…/conditions/{cid}/verify/` | **1** production call site (`ApplicationDetailModal` via `reviewWorkspaceService.verifyCondition`) | **0** first-party callers; the route is deprecated, not deleted (§5) |

The `generate*` reading is worth being precise about, because the name still appears
seven times after the removal and none of them is the removed method:
`@/lib/pdf/documents/AcceptanceLetter.tsx` exports its own
`generateAcceptanceLetter`, reached through that module's lazy barrel from
`src/pages/dev/*`. That is the non-official preview use the steering rules
explicitly permit, and `documentFlowDriftGuard.test.ts` keeps it unreachable from
every first-party official path.

## 3. The duplicate route is a redirect, and that is a distinct concept (R13.13)

`ProductRouteDefinition` already had `aliases` — additional live paths that render
the same page, neither redirecting. A retired duplicate is **not** that: an alias
would leave the workspace rendering at two live URLs, which is exactly the shape
R13.13 forbids. So the registry gained `duplicateRedirects`, and the distinction is
load-bearing in three places:

- **`matchesRoutePath` ignores it.** Nav highlighting and skeleton selection both
  read that helper; if a redirect counted as its destination, the hop would paint
  the destination's chrome for one frame and then navigate away from it.
- **`matchesDuplicateRedirect` answers for it**, so a caller that needs to know
  "is this a retired duplicate" can ask.
- **`routeByPath` still resolves it** to the workspace, because the difference
  between a retired duplicate and an unknown URL matters: one has a destination and
  the other is a 404.

### 3.1 Why the redirect is a component and not a `<Navigate>`

`<Navigate to="/student/application/:id/status">` would send the student to a
literal `:id`. `DuplicateRouteRedirect` reads the params React Router already
matched, builds the canonical path from them, and:

- **carries the query string and the hash.** A bookmark of the duplicate may
  legitimately carry state the canonical route understands; dropping it turns a
  redirect into partial data loss.
- **`replace`s the history entry.** Without it the duplicate URL stays on the
  stack, so Back lands on the redirect and is pushed forward again — the bounce that
  makes a redirect feel like a broken page. Leg 0 of the golden journey presses
  Back and asserts it does not land on the duplicate.
- **falls back to the dashboard** when a param is missing, rather than navigating
  to a malformed URL.
- **stays inside the `student` guard.** A redirect that dropped the guard would
  briefly expose the hop to an unauthenticated visitor before the destination
  re-guarded it.

`studentApplicationWorkspacePath` encodes the id, so
`a/../../admin` becomes `a%2F..%2F..%2Fadmin` rather than a path segment.

## 4. The survivor owns all ten concerns (R13.13)

| Concern | How the workspace owns it |
|---|---|
| status | `formatStatusLabel(application.status)` + the decision snapshot |
| next action | `<NextActionCards>`, server-driven for enrollment |
| payment | `<PaymentStatusBlock>` + the one action, routed to the surface that owns collection |
| documents | `<DocumentChecklist>` (uploads) + `<DocumentButtons>` (official records) |
| interview | `<InterviewDetails>` |
| communications | a link to the **one** inbox (§4.3) |
| conditions | `<ConditionsTimeline>` with evidence submission |
| amendments | `<AmendmentForm>` + `<AmendmentHistory>` |
| enrollment | `enrollmentReadinessOf(application)` → the server's readiness state |
| history | `<ApplicationHistory>` (§4.4) |

`studentWorkspaceConsolidation.test.tsx` §6 asserts each of the ten against the real
page source, so a concern cannot quietly leave.

### 4.1 The parity gate: what only the retired page had

A consolidation's real question is not "does the survivor render" — it is "did the
student lose anything". Three things existed only on the retired page:

- **the public-tracking control.** Since task 10.5 the application number
  authorises nothing, so an issued tracking link is the student's *only* way to
  share their status. Deleting the page without moving this would have been a silent
  capability removal. It is offered from submission onwards — a draft has no status
  to track.
- **nationality and institution.** Read off the same detail response the survivor
  already fetched. The canonical `Application` type declares neither (they are
  display snapshots the backend adds — the canonical truth map's note that
  `applications.institution` is a snapshot, not authority), so the read is narrowed
  at the call site rather than widening a shared type with fields no other surface
  consumes.
- **a clickable virtual-interview link.** `InterviewDetails` turns a `location`
  that is a URL into an anchor with `rel="noopener"`, and leaves a non-URL as text.
  The survivor printed the same value as plain text. The **richer renderer wins**
  and the inline copy is gone — asserted both by reading the page and by rendering
  `InterviewDetails` with a URL and with `"to be confirmed"`.

### 4.2 One read, one key

- one `applicationService.getById(id, { include: ['statusHistory'] })` — the status
  history rides the read the workspace already made rather than adding a second
  query;
- one cache key, `['application-workspace', id]`. The conditions, amendments and
  waitlist queries stay separate on purpose — they are separate contracts from
  separate tasks — but the *application* is read once;
- the two other surfaces that evicted the retired key (`useWizardController`,
  `dashboardReducer`) moved with it, so a mutation anywhere invalidates the one
  cache the one workspace reads.

### 4.3 Why communications is a link and not a feed

Task 10.1 made `/student/communications` the single communications/inbox history,
and it is the only surface that holds a message's delivery state. A per-application
message feed here would be exactly the duplicate inbox finding STU-14 closed — and
`notifications` carries no application column to scope one by, so building it would
mean inventing a contract rather than reusing one. The workspace **reaches** the one
inbox.

### 4.4 The record, not the progress bar

`StatusTimeline` is derived from the application's own timestamp columns and
includes steps that have not happened. `ApplicationHistory` is the platform's
`ApplicationStatusHistory`: one row per committed transition, with the note the
actor left and their name where the reader is permitted it. It was already published
on `GET /applications/{id}/summary/` and **no** student surface read it — so "who
moved my application, when, and did they say why" had no answer on *either* old
workspace.

It renders the server's order without re-sorting, does not invent a "from" state for
the first transition, says a legacy row has no recorded time rather than showing
today, drops a row the server could not identify rather than rendering a keyless
entry, and renders an empty record as empty rather than as an error.

## 5. Two staff condition doors, one implementation — deprecated, not deleted

Task 10.2 added the three-outcome `POST …/conditions/{cid}/review/` beside the
pre-existing two-outcome `…/verify/`, made them share the one
`ConditionStateMachine`, and recorded in its own §13 that choosing a single route
belonged here. What this task did:

1. **`/review/` is canonical, and the reviewer workspace uses it.** So
   `changes_required` — the outcome a reviewer needs when evidence is *wrong* rather
   than absent, which is STU-16 — is reachable from the only place a reviewer works.
2. **`/verify/` decides nothing of its own.** It normalises its two-outcome request
   and calls `condition_evidence_service.review_condition`, so there is one
   implementation of the decision, one audit action and one evidence-history writer.
   `ConditionManager.verify_condition` is no longer called by **any** view, and
   `TestVerifyDelegates` walks every `*_views` module to assert it.
3. **It is deprecated, not deleted**, and answers with `Deprecation: true` and a
   `Link` header naming its successor — on success *and* on refusal, because a
   legacy caller should be told where the route went even when the answer is no.

**Why the asymmetry with `/email-slip/` is correct rather than inconsistent.** Both
had zero first-party callers. The difference is what the reading means:
`/email-slip/` had already had its window — task 10.4 measured zero use, made it a
proxy, and R13.5's "removed after measured zero use" was satisfied by a *second*
reading here. `/verify/` is being measured for the **first** time by this task, and
it is a published staff route that a school's own integration may call. Removing it
in the same task that first measured it would collapse the window R2.5 asks for into
a single instant.

### 5.1 The deprecated route keeps its own contract

A deprecated route that quietly adopts its successor's stricter rules breaks callers
*and* hides the break behind the word "deprecated". So:

- **`waived` still needs no reason here.** The canonical command requires one
  (design §11.2's "explicit authorized reason"); a legacy caller of this route never
  sent one. A documented fallback — `LEGACY_WAIVER_REASON`, a named constant — is
  recorded instead of turning a working request into a 400, and it says where it came
  from rather than reading as if a reviewer wrote it.
- **the request body is `{status}` and always was.** The route is deliberately
  **not** given a `notes` field on the way out: extending the surface being retired
  is the opposite of consolidating it, and a reviewer's reason belongs on `/review/`.
  An unrecognised key in the body is *ignored* rather than rejected (DRF's default),
  so a caller sending a hopeful `notes` gets the same 200 it always got.
  `test_the_published_request_body_is_status_only` asserts the contract against the
  serializer the schema publishes.
- **the response shape is unchanged** — `ApplicationConditionSerializer` plus
  `version` and `allowed_transitions`, not the canonical read-back payload.
- **an already-resolved condition is still `CONDITION_NOT_PENDING` with a 400.**
  The canonical command answers `CONDITION_ALREADY_RESOLVED` with a 409; the
  refusals are mapped back onto the stable codes a legacy caller of *this* route
  branches on.
- **both doors share authority.** A student cannot use either; an out-of-tenant
  staff member is masked identically on both.

## 6. The published contract stopped advertising what was removed (API-04, R14)

The pre-removal reading found `/api/v1/applications/{application_id}/email-slip/`
still present in **both** `backend/schema/openapi.v2.candidate.yaml` and the
generated `apps/admissions/src/generated/api.d.ts` — a route the backend no longer
serves, still in the executable contract the frontend types come from. R14 exists so
that "the frontend and backend share an executable contract" and drift cannot hide;
a removed route left in the contract is that drift.

Both were regenerated through the repo's own pipeline
(`scripts/generate-api-types.sh`, which also verifies the types compile) —
[`raw/schema-regen.txt`](raw/schema-regen.txt). The result
([`raw/schema-contract.txt`](raw/schema-contract.txt)):

| Path | In the contract? |
|---|---|
| `…/email-slip/` | **absent** (0 occurrences in both files) |
| `…/official-documents/{document_type}/email/` | present — the successor |
| `…/conditions/{condition_id}/verify/` | present — deliberately, it is deprecated not deleted |
| `…/conditions/{condition_id}/review/` | present — canonical |

`spectacular` itself is unchanged from 10.5: **3 warnings / 116 errors (26 unique)**
([`raw/spectacular.txt`](raw/spectacular.txt)).

## 7. `slipService` no longer emails, and is deliberately not repointed

`slipService.ts` POSTed the removed route. It is **not** repointed at the canonical
official-document email, and that is the deliberate reading: emailing an official
document is a *backend* command with stored provenance, a fingerprint and a delivery
record (task 10.4), while this module renders the slip **in the browser**. Wiring a
client-rendered PDF into the canonical email would put an unfingerprinted artifact
into the official pipeline.

So `sendEmail` is answered honestly — the request is declined with a reason and a
download fallback rather than silently ignored, because a caller that believes it
queued an email and did not is worse than one that is told no. Callers who want the
slip emailed use `services/officialDocuments.ts::emailOfficialDocument`.

## 8. The suites

### 8.1 `test_condition_front_doors_10_6.py` — 15 cases

`TestVerifyDelegates` (4): no view calls `ConditionManager.verify_condition`
(asserted by walking every `*_views` module's source); the deprecated door names its
successor on success and on refusal; the canonical route still answers.
`TestVerifyContractPreserved` (7): `met` with no notes; `waived` with no reason;
an extra body key is ignored not rejected; the published body is `status` only;
the response shape; already-resolved is still `CONDITION_NOT_PENDING`; an unknown
condition is still a 404. `TestBothDoorsShareAuthority` (2) and
`TestBothRoutesStillRegistered` (2).

### 8.2 `test_email_slip_route_removed_10_6.py` — 13 cases

`TestRouteRemoved` (4): the URL name no longer reverses; the path no longer
resolves; a request to it is a 404; the URL conf names no such route.
`TestSymbolsRemoved` (4): the view is not importable from its module **nor through
`student_views`' compatibility re-export surface** — that seam is what would
otherwise keep a deleted view alive; the two serializers are gone; no applications
module still imports them. `TestSuccessorIsReachable` (2) and
`TestSuccessorKeptTheProperties` (3): out-of-scope staff is masked, a slip that was
never issued is refused rather than emailed about nothing, and the request body
cannot choose the recipient.

Points 3 and 4 matter more than 1 and 2. "The route is gone" is cheap to assert and
worthless alone; a removal is only correct if the thing it delegated to answers.

### 8.3 One backend property suite moved onto the new truth

`tests/property/test_bug5_email_slip.py` was a bug-condition exploration suite for a
real defect: the client asked to email a slip, no route existed, and the client
returned a hardcoded "not implemented" refusal. Property 9 was **never** "the path
`email-slip` is in the URL conf" — it was *a capability with no route behind it*,
surfacing to the student as a hardcoded lie. So it is now asserted against the route
that carries the capability, plus its converse: that there is no *second* route for
it, which is the API-04 finding the consolidation closes.

`tests/unit/test_email_slip_endpoint.py` is **deleted** — it existed only to pin the
removed route's own behaviour.

### 8.4 `studentWorkspaceConsolidation.test.tsx` — 50 cases

Organised around the differences between the two pages that actually existed:
the route is a redirect (7); the registry tells a redirect from a destination (5);
no production surface links to the retired workspace (7); **the parity gate** — what
only the retired page had (6); the deferred-fee affordance (4, §9.2); the duplicate
reads are gone (3); all ten R13.13 concerns (10); and `ApplicationHistory` renders
the server's own rows (8).

Nothing mocks a route table or a registry: the assertions read the real `routes`
array and the real registry, because a parity claim asserted against a fixture of
itself proves nothing. The source-scanning guards strip comments first — the code
that removed a link is also the code documenting why, so a naive substring scan
would be tripped by the explanation of the very thing it checks for.

### 8.5 Two frontend suites moved onto the new truth

- `tests/property/test_bug2_preservation.test.ts` pinned
  `queryKey: ['application-status', id]`. The key is now `application-workspace` —
  one workspace, one key. The suite's own property (the read is keyed by the
  application and enabled only for a signed-in owner with an id) is unchanged.
- `tests/unit/pageShellRenderSmoke.test.tsx` enumerated 22 `PageShell` consumers.
  The retired workspace was one of them, so the count is **21**. Consolidating
  removed a page, not just a route.

## 9. The three defects the gates found

### 9.1 Two in the inherited work, found by the backend suite

The inherited `test_condition_front_doors_10_6.py` ran **1 failed / 13 passed / 6
errors**, and neither problem was a test artifact.

**A missing fixture, surfacing as a teardown FK violation.** Resolving the last
outstanding condition auto-promotes the application, and `ConditionManager` records
that transition under `SYSTEM_ACTOR_ID` — a uuid FK into `profiles`. The ephemeral
test database is built from the *models*, so the row
`backend/scripts/system_actor_seed.sql` provides in every real environment is
absent, the FK is deferred, and the failure lands **at teardown** (`SET CONSTRAINTS
ALL IMMEDIATE`) rather than inside the test. That is why it read as a harness
problem. An autouse `_system_actor_profile` fixture seeds it, the same shape
`tests/integration/test_capacity_waitlist_canonical_5_3.py` already uses.

**A false parity claim.** `test_a_supplied_note_is_used_as_the_reason` asserted that
`/verify/` records a supplied `notes` as the reviewer's reason. It does not, and it
never did: `ConditionVerifyRequestSerializer` declares `status` and nothing else, at
HEAD and now. The view read `validated_data.get("notes")` — a dead branch that
*looked* live, which is precisely the MAINT-01 shape. The read is removed, the
fallback is unconditional for the outcomes that need a reason, and the case is
replaced by the two that pin the real property: an extra body key is **ignored**
rather than rejected, and the published body is `status` only.

The test was not deleted to make a run green — it asserted a *feature*, on a route
being retired, that no version of the platform ever had.

### 9.2 One in the product, found by writing the browser journey

**A deferred fee had no affordance on the canonical workspace.**
`requiresStudentPaymentAction` answers `not_paid` and `rejected` only. A student who
chose to pay later reached the one canonical workspace, read *"Payment still needs
attention before review can continue"*, and was offered **nothing to do** — while
`deferred_payment_reminder_task` emailed them about that same fee every day. R13's
own user story exists so that "payment, interview, communications, and official
documents do not become dead ends", and R13.13 makes this workspace the owner of
payment; a state the workspace can describe but not act on is the workspace not
owning it.

Found because leg 1 of the journey looked for the control and there was none. Not
found by any unit test, because both pages were consistent about it.

The fix is inside the surface this task owns: the workspace derives its own
`hasDeferredFee` and offers *Complete deferred payment*, routed to
`/student/payment` — the surface that owns post-submission collection (R12.3, task
8.3) — rather than growing a second collection form. The copy names the student's
own choice instead of warning them about something they forgot.

**The shared helper is deliberately not widened.** It also drives `Dashboard.tsx`,
`ApplicationListItem.tsx` and `DashboardStatusOverview.tsx`, whose recomposition is
task **11.1**'s lane; changing it here would silently move three surfaces this task
measures nothing about. A case asserts the helper is unchanged, so the restraint is
pinned rather than remembered.

### 9.3 Four test-side defects the first browser run found

Recorded because they are the reason the journey's locators look the way they do:

1. **the desktop sidebar links to `/student/payment` too**, so a page-wide
   `a[href^="/student/payment"]` matched the navigation and the desktop run asserted
   against the chrome. Every leg now reads inside the card it names.
2. **`SectionCard` renders a `<section>`**, so `ancestor::*[self::section or
   self::div][1]` resolved to the header row and the amendment history locator found
   nothing. The scope is `ancestor::section[1]`.
3. **scheduling an interview already moves the application to `under_review`** (the
   interview service owns that transition), so the decision leg's original
   `submitted → under_review` was `INVALID_TRANSITION`. The decision is now
   `under_review → approved` — the stronger claim, and one the platform only permits
   because the journey actually paid the fee in leg 1.
4. **`DocumentButtons` renders every control twice** — a mobile `<details>`
   disclosure (`sm:hidden`) and a desktop inline row (`hidden sm:flex`) — so a bare
   test-id matched both. The journey selects the visible copy and opens the mobile
   disclosure the way a student does.

A fifth was mine and is documented in the spec itself: a final
`expect(gate.consoleErrors).toEqual([])` contradicted `allowHarnessNoise`. The gate
is the authority; a second, stricter copy of it in the test would only fail for a
reason the run already accepted.

## 10. Verification (verbatim)

### 10.1 Backend suites, against a measured baseline

```
cd backend && DATABASE_URL=<mihas_localtest 5433> TESTING=1 REDIS_URL=<local 6380> \
  .venv/bin/python3 -m pytest $(cat ../docs/v2-evidence/10.6/raw/selection.txt) \
  -q --tb=no -rfE -p no:randomly
```

against the isolated `mihas_localtest` Postgres (`127.0.0.1:5433`). Neon and
production were not touched. The selection is the condition / amendment /
official-document / view-classification / serializer-contract lane —
[`selection.txt`](raw/selection.txt).

| Run | Result |
|---|---|
| **baseline** — the same selection with only *this task's* edits removed | **6 failed, 423 passed** |
| **10.6 (candidate)** | **6 failed, 451 passed** |

- **New failures: 0.** `comm -13` over the two sorted 6-entry sets is empty.
  `comm -23` is also empty — nothing was fixed either, which is the honest reading:
  this task claims no repair of another lane's failure.
- **+28 passing**: exactly this task's two new suites (15 + 13).

**How the baseline was produced.** The worktree carries the whole admissions-v2
spec, so `git stash` cannot separate this task's edits from other lanes' uncommitted
work on the same shared files. What *can* be separated is that 10.6's backend
footprint is small and mechanical: a removal, a delegation, and test files. So the
baseline drops this task's two new test files and restores the shared classification
file to HEAD — [`baseline-reconstruction.sh`](raw/baseline-reconstruction.sh). This
is stated rather than glossed: it is a **reconstruction, not a checkout**.

The 6 failures present in **both** runs:

```
FAILED tests/contract/test_serializer_response_contract.py::TestAdminDashboardContract::test_admin_dashboard_envelope_and_keys
FAILED tests/property/test_application_properties.py::TestUnverifiedPaymentApprovalGuard::test_non_approval_status_skips_payment_check
FAILED tests/unit/test_applications_serializers.py::test_admin_views_declare_serializer_class
FAILED tests/unit/test_applications_serializers.py::test_student_views_declare_serializer_class
FAILED tests/unit/test_public_endpoint_policy.py::test_every_allow_any_view_has_public_endpoint_classification
FAILED tests/unit/test_view_auth_classification.py::test_all_api_views_are_classified
```

The first five appear **byte-identically** in task 10.5's recorded baseline, captured
on this same tree at this same base commit *before* 10.6's dispatch — which is what
makes them attributable elsewhere rather than here.

The sixth was not in 10.5's selection, so it has no recorded prior state. It is
attributed by the *number* it fails with
([`view-classification-attribution.txt`](raw/view-classification-attribution.txt)):

| Classification file | Unclassified views |
|---|---|
| HEAD (pre-10.6) | **55** |
| 10.6's | **38** |

10.6's edit to that file is a **removal** (`EmailSlipView`, deleted with its route),
so it cannot add an unclassified view — and the 38 that remain belong to tasks
3.x–9.x. This task did not cause the failure; it shrank it by 17.

### 10.2 Frontend suites

```
cd apps/admissions && bun run test -- --run
```

**1 failed / 4282 passed / 1 skipped, 481 files**
([`frontend-test.txt`](raw/frontend-test.txt)). The one failure —
`authPageFormMarkup.test.tsx > uses honest helper copy instead of fake email
availability states` — is the sign-up page's helper copy, a surface this task does
not touch, and is the same single pre-existing failure task 10.5 recorded.

### 10.3 Lint and build

```
cd apps/admissions && bun run lint    # 17 errors, 14 files
cd apps/admissions && bun run build   # exit 0
```

The lint file set is **byte-identical** to 10.5's
(`diff` of the two `frontend-lint-files.txt` is empty) and the total is unchanged at
17. The build passes including `tsc` and the CSP gate
([`frontend-build.txt`](raw/frontend-build.txt)).

### 10.4 Django check and schema

```
cd backend && .venv/bin/python3 manage.py check          # no issues
./scripts/generate-api-types.sh                          # schema + types, types compile
```

[`django-check.txt`](raw/django-check.txt),
[`schema-regen.txt`](raw/schema-regen.txt),
[`schema-contract.txt`](raw/schema-contract.txt).

### 10.5 The browser gate

Run against the isolated local harness (task 0.4) with the strict gates active,
`HARNESS_PW_CHANNEL=chrome`, after `harness/bin/harness up` (which builds the SPA
and wipes volumes), and **torn down afterwards**.

| Run | Result |
|---|---|
| this task's journey alone, on a freshly wiped harness | **2 passed** — desktop + mobile, zero skips ([`harness-golden-lifecycle.txt`](raw/harness-golden-lifecycle.txt)) |
| the whole required profile | **146 passed**, 2 failed ([`harness-required-suite.txt`](raw/harness-required-suite.txt)) |
| the same profile with `--grep-invert=golden` | **142 passed**, the same 2 failed ([`harness-required-without-10-6.txt`](raw/harness-required-without-10-6.txt)) |
| `gatecheck-negative` | **4 failed, as required** — skip / console / failed-request / undrained gates all fire ([`harness-gatecheck.txt`](raw/harness-gatecheck.txt)) |
| drain | broker 0, unsettled payment collections 0 ([`harness-drain.txt`](raw/harness-drain.txt)) |

The two failures are `tenant-launch.spec.ts` on both projects, **byte-identical** to
the two 10.5 recorded as pre-existing:

```
[chromium-required] › tenant-launch.spec.ts:139:5 › the wizard exposes program / intake / fee / routing steps on mobile
[mobile-required]   › tenant-launch.spec.ts:139:5 › the wizard exposes program / intake / fee / routing steps on mobile
```

10.5's profile was **144 passed**; this task's journey adds 1 test × 2 projects, so
146 is the expected arithmetic.

**The `--grep-invert` comparison reads 142, not 144, and that is a confound worth
naming rather than hiding**: the payment lane's own test is titled
`golden: the wizard takes the payment…`, so the filter excluded it too (1 test × 2
projects). 146 − 2 (this task's) − 2 (the payment lane's) = 142. The delta
attributable to 10.6 is exactly **2**.

**One flake observed and not reproduced.** An earlier attempt at the without-10.6
run degraded to 26 passed / 51 failed / 66 did not run, starting with
`admin-dashboard-metrics.spec.ts › a tile is the roster it opens` reporting a tile of
`4` against a roster total of `3`. The same test passed on the clean run before and
the clean run after, on a freshly wiped harness each time. It is the same family as
the admin-lane flake 10.5 documented (`raw/harness-admin-lane-isolated.txt`) and is
recorded here as observed-and-not-reproduced rather than explained away — it is not
this task's, and it is not claimed to be fixed.

## 11. What the interrupted dispatch left, and what was re-measured

The first dispatch of this task landed the code and stopped. Inherited:

| Inherited | State on arrival |
|---|---|
| `raw/usage-measurement.txt` | the pre-removal reading only — kept **verbatim** (§2) |
| `ApplicationDetail.tsx` deleted, `DuplicateRouteRedirect.tsx` added, registry + config + three call sites updated | correct; re-verified by the 50-case suite and leg 0 |
| the five `generate*` methods removed | correct; re-measured (§2) |
| the `/email-slip/` route, view and serializers removed | correct; re-measured (§2) — but the **published contract still advertised it** (§6) |
| the condition-door delegation | correct in shape; **two real defects** (§9.1) |
| `test_condition_front_doors_10_6.py`, `test_email_slip_route_removed_10_6.py` | had never been run: 1 failed / 6 errors (§9.1) |
| `studentWorkspaceConsolidation.test.tsx` | had never been run: 46 passed |

Not inherited, and added by the dispatch that finished the task: **the golden
lifecycle journey** (the whole of R13.7), the deferred-fee fix (§9.2), the schema
regeneration (§6), the two moved frontend suites (§8.5), and every gate in §10.

## 12. Not claimed here

- **`…/conditions/{cid}/verify/` is deprecated, not deleted.** §5 states the
  reasoning. Its removal needs a window that starts with this task's measurement, not
  one that ends with it.
- **`slipService.ts` and `@/lib/pdf` are not removed.** They are unreachable from
  every first-party official path and `documentFlowDriftGuard.test.ts` keeps them
  that way, but `src/pages/dev/*` still uses them for non-official previews, which
  the steering rules explicitly permit.
- **`/student/history` is untouched.** It is the student's own cross-application
  history page, not a second copy of *this* application's status history, so it is
  not a duplicate R13.13 names. Whether it survives the dashboard recomposition is
  task **11.1**'s question.
- **The workspace is not recomposed.** R13.1's "order each student's next required
  action before passive metrics" is task **11.1**, and the first-viewport marketing
  block still on this page ("A single view of where your application stands…", the
  three chips, the PageShell metrics row) is task **11.5**'s de-fluff. This task
  moved *ownership*; it did not redesign the page. The deferred-fee affordance is the
  one exception, and it is a dead end rather than a layout question (§9.2).
- **`ApplicationStatus.tsx` is not split.** At 786 lines it is a MAINT-01 candidate,
  and task **12.1** owns "split oversized modules after behavior is protected". This
  task *added* the protection — 50 cases and a browser journey — which is the
  precondition that task names, not the split itself.
- **The shared `requiresStudentPaymentAction` helper is unchanged**, deliberately
  (§9.2), and a case pins that.
- **No new capability, no new route.** The catalogue stays at 17 `platform.*` + 17
  `tenant.*`. One route was removed, one was deprecated, and one existing route
  became the canonical one.
- **No schema change.** No SQL script, no rollback sibling, no Neon rehearsal — this
  task has nothing to rehearse. The OpenAPI contract is regenerated, which is a
  published-contract change, not a database one.
- **The pre-existing failures are not fixed**: 6 backend, 1 frontend, 17 lint,
  2 harness. Each is shown byte-identically in a baseline and attributed elsewhere.
