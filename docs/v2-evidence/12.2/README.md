# Task 12.2 — Remove V1 first-party compatibility normalizers and duplicate routes

Evidence index for task **12.2** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [x] 12.2 Remove V1 first-party compatibility normalizers and duplicate routes
  - Confirm the V2 frontend has zero V1 first-party calls for migrated domains.
  - Remove permissive envelope/list normalizers and duplicate document/catalog/
    application workspaces after telemetry and rollback checks.
  - Keep documented external compatibility until its announced end date.
  - _Requirements: R2.5-R2.7, R14.5-R14.7_
  - _Findings: API-02, API-04, REL-01, STU-23_
  - _Evidence: source/route telemetry zero report and V1 deprecation tests
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-11 (UTC).
- **Schema: no.** §7 records the OpenAPI schema regenerated and **byte-identical**
  (SHA-256 `35fe05d4…`) to task 12.1's anchor. No SQL, no migration, no model, no
  Neon branch. The dispatch expected the hash to move; §7 is why it correctly did
  not, and why that is the strongest available statement about blast radius rather
  than a null result.
- PBT: task 12.2 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`), so nothing is recorded through
  `update_pbt_status` and no numbered spec property of *this* spec is claimed.
  §5.4 is the one place this task touched **another** spec's numbered properties,
  stated in full because it is the most reversible decision here.
- **Working tree inspected first.** No partial 12.2 work existed: no
  `docs/v2-evidence/12.2/`, and every baseline in §2 reproduces 12.1's
  second-pass candidate exactly.

## The Required_Evidence claim

The `_Evidence:` line asks for **two** things, and both are a measurement.

| Claim | Where it is settled |
|---|---|
| **source/route telemetry zero report** | [`scripts/v1_surface_telemetry.py`](../../../scripts/v1_surface_telemetry.py) → [`raw/v1-surface-telemetry.txt`](raw/v1-surface-telemetry.txt) + [`raw/v1-surface-telemetry.json`](raw/v1-surface-telemetry.json). A new dependency-free tool with **three** halves: 17 declared V1 surfaces greped for first-party callers with the pattern printed beside the count and every hit classified (production / test / dev-preview / self / comment); the approved authority registry reconciled against the **live** URLConf; and an announced-end-date check on every surface kept for external compatibility. **OVERALL PASS = True**, with **0 production callers** on all 17 and **0 stale registry entries** |
| **V1 deprecation tests** | [`backend/tests/unit/test_compatibility_surfaces_12_2.py`](../../../backend/tests/unit/test_compatibility_surfaces_12_2.py) — 10 cases (§6), plus **11 refusal cases and 5 repointed fixtures** across 4 frontend suites (§5). Not one legacy-shape assertion was deleted: each became its inverse or moved to the shape the producer emits, so every removal is *pinned* rather than forgotten. Counted by `grep -rn "it('REFUSES" tests/` → 11, and `grep -rn 'task 12.2' tests/` for the repoint markers → 5 |

### The browser gate

Task 12.2 adds **no** browser journey, deliberately, for the same reason 12.1
gave: it changes no rendered output. What it must show is that the existing ones
still pass on a freshly seeded stack, which §8 records.

## What this task establishes

1. **The failing gate nine prior tasks recorded as someone else's is closed.**
   `test_authority_matrix_v2.py` was failing on
   `Stale=['/api/v1/applications/<uuid:application_id>/email-slip/', '…/preview-summary/']`.
   Both routes had been deleted — by 10.6 and 7.4 — and both were still
   *registered*. De-registering them takes the suite from **14/16 to 16/16**
   (§3), and it is the whole of the change: no served route moved, which §7's
   byte-identical schema proves.
2. **De-registering a stale entry and deleting a live route are different acts,
   and the dispatch was right to ask for the first where it is available.** §3.2
   is the distinction with its blast radius measured on both sides. The registry
   file already contained the precedent — task 7.4's `admin-summary/` comment
   block — and this change follows it verbatim.
3. **Nine permissive normalizer surfaces are gone, and two of them were the
   *same* normalizer in two copies over one endpoint** (§4). `normalizePaymentRows`
   claimed in its own docstring that the payments-list unwrapping "lives in one
   place"; `hooks/usePaymentStatus.ts` held a fourth-branch copy of it over the
   same endpoint. That is finding API-02 in one file pair, and it is how one copy
   keeps a branch the other drops.
4. **The dangerous branch in every one of them was the same branch, and it is
   worth naming once**: `.data` / `.data.results` — a *second* envelope.
   `apiClient.request` unwraps exactly one `{success, data}` level, so those
   branches required `{success, data: {data: …}}`, which nothing emits. Had the
   envelope ever regressed to double-wrapped, six surfaces would have kept
   rendering and the drift would have been invisible. R14's user story is
   literally *"so that compatibility normalizers cannot hide drift"* (§4.1).
5. **A rival contract is a different thing from a missing key, and the removals
   are scoped to the first** (§4.2). `count` is DRF's *default* pagination key;
   this platform's `StandardPagination` publishes `totalCount`. Reading `count`
   silently accepted a pagination class the platform does not use. `totalPages`
   and `summary`, by contrast, are keys the same contract simply does not send
   yet — the client derives them, and if a later task publishes them the
   derivation steps aside. Those are **kept**, and the distinction is written
   into the code rather than left to be inferred.
6. **Every surface kept for external compatibility now has an announced end
   date, an owner, and exit criteria** (§6). The task's own constraint is *"keep
   documented external compatibility until its announced end date"* — and four
   surfaces had `Deprecation: true` with **no date at all**, which is an
   open-ended exemption wearing a deprecation's clothes. They now carry RFC 8594
   `Sunset` from a new register (`apps/common/compatibility_register.py`), which
   is the shape task 12.5 audits.
7. **A second `__module__`-keyed gate was broken by 12.1's split, and it is the
   security-relevant one** (§9). `test_public_endpoint_policy.py` derives its keys
   by AST-scanning `apps/**/*.py` for the class **definition**, so all seven
   `AllowAny` catalog views fell out of the register the moment they changed
   module. It was outside 12.1's 49-file selection, so that pass never saw it.
   **10 → 3 unclassified**; the 3 that remain are named with their owning lane.
   12.1 §23 #2 wrote the lesson from one instance; there were two.
8. **Two shims were a decision, and the decision is a mechanism** (§10). Both
   12.1 shims are **kept**, with the reasoning measured rather than asserted —
   and a new test **evaluates each removal condition on every run**, prints the
   exact blockers, refuses to let the blocker set grow, and **fails when a
   condition becomes satisfied**. A shim whose removal condition nobody evaluates
   is the debt this task exists to stop; the answer is to evaluate it, not
   necessarily to delete it.
9. **Item 2 of the dispatch was already closed, and saying so is the finding**
   (§11). The duplicate student workspace's data and action logic was **not**
   left in place by 10.6 — 10.6 deleted `ApplicationDetail.tsx` in the same task
   and its own §11 says so. Re-measured here: the file is absent, and the only
   references anywhere are three tests asserting its absence.

## Files

```
docs/v2-evidence/12.2/
├── README.md                        ← this index
└── raw/
    ├── v1-surface-telemetry.txt     (THE zero report — 17 surfaces, 3 halves, OVERALL PASS)
    ├── v1-surface-telemetry.json    (the same, machine-readable)
    ├── backend-selection.txt        (the 49 files, identical to 12.1 pass 2)
    ├── backend-baseline.txt         (BEFORE, serial: 34 failed / 773 passed / 0 errors)
    ├── backend-candidate.txt        (AFTER, serial, +2 files: 33 failed / 787 passed / 0 errors)
    ├── backend-failure-diff.txt     (the set difference: 2 fixed, 0 introduced)
    ├── public-endpoint-policy.txt   (the 10 → 3 reading on the second __module__-keyed gate)
    ├── openapi-schema.txt           (byte-identical, SHA-256 35fe05d4…, and why that is correct)
    ├── django-check.txt             (no issues — no TESTING=1, no substitute REDIS_URL)
    ├── frontend-test-baseline.txt   (BEFORE: 1 failed / 4584 passed / 1 skipped / 493 files)
    ├── frontend-test.txt            (AFTER:  1 failed / 4592 passed / 1 skipped / 493 files)
    ├── frontend-lint.txt            (15 errors, 13 files — identical set to 12.1)
    ├── frontend-lint-baseline.txt   (BEFORE: the same 15)
    ├── frontend-lint-files.txt      (the 13)
    ├── frontend-build.txt           (exit 0, incl. tsc and the CSP gate)
    ├── size-dependency-after.txt    (cycles 7 → 7, largest SCC 116 → 116)
    ├── harness-down-pre.txt         (the teardown BEFORE the fresh up, so "fresh" is measured)
    ├── harness-up.txt               (fresh stack: volumes wiped, SPA rebuilt, reseeded)
    ├── harness-required-suite.txt   (the required profile on that fresh stack)
    ├── harness-flake-isolation.txt  (the one unfamiliar failure, re-run in isolation)
    ├── harness-gatecheck.txt        (must fail — the gates fire)
    ├── harness-drain.txt            (broker 0, unsettled payment collections 0)
    └── harness-down.txt             (teardown: 0 containers, 0 volumes)
```

There is no `size-dependency-before.txt`: the "before" is
[`docs/v2-evidence/12.1/raw/size-dependency-pass2-after.txt`](../12.1/raw/size-dependency-pass2-after.txt),
because §2 measures that this task's tree started exactly where 12.1's finished.
Citing 12.1's file rather than re-running it under a new name keeps one artifact
for one measurement.

Source of the change.

| Path | What changed |
|---|---|
| **`scripts/v1_surface_telemetry.py`** | **new**, 682 — the zero report (§1). Three halves, 17 declared surfaces as data, block-comment-aware match classification, dependency-free |
| **`backend/apps/common/compatibility_register.py`** | **new**, 198 — the external-compatibility register: owner, **announced end date**, successor, exit criteria, and the measurement that says nothing first-party needs it (§6) |
| **`backend/tests/unit/test_compatibility_surfaces_12_2.py`** | **new**, 293 / **10 cases** — the V1 deprecation tests, incl. the shim removal-condition evaluator (§10) |
| `scripts/authority_matrix_registry.py` | the two stale entries **de-registered**, replaced by a comment block in the file's own existing style (§3) |
| `backend/apps/common/public_endpoint_policy.py` | 7 canonical split-module keys **added** beside the shim keys — the second `__module__`-keyed gate, 10 → 3 (§9) |
| `backend/apps/catalog/legacy_write_telemetry.py` | `mark_deprecated` now stamps RFC 8594 **`Sunset`** from the register, per resource (§6.2) |
| `backend/apps/applications/admin_amendment_views.py` | `_with_condition_deprecation_headers` now stamps **`Sunset`** too (§6.2) |
| `apps/admissions/src/services/catalog.ts` | `normalizeCollection`: the domain-key branch and the "first array-valued property" **guess** deleted; the three mutation readers' second-envelope pre-step deleted; `CollectionKey` gone; six call-site generics tightened |
| `apps/admissions/src/services/admin/catalog.ts` | `listFrom`: `.programs`, `.data`, `.data.results`, `.data.programs` deleted (6 branches → 2) |
| `apps/admissions/src/services/admin/tenants.ts` | `listFromResponse`: `.data`, `.data.results` deleted; `listResult`'s `count` rival-key fallback deleted |
| `apps/admissions/src/services/admin/audit.ts` | `result.entries` and `result.count` deleted; `totalPages` / `summary` **kept**, with the difference stated (§4.2) |
| `apps/admissions/src/services/notifications.ts` | `normalizeNotificationsResponse`: five shapes → one; `firstArrayValue` deleted with its empty-page fall-through (§4.3) |
| `apps/admissions/src/services/sessionService.ts` | the `{sessions}` / `{count}` triple sniff deleted; the `last_active` **field** map kept and labelled |
| `apps/admissions/src/services/payments.ts` | `normalizePaymentRows`: `.payments`, `.data`, `.data.results` deleted; it is now the **only** reader of that endpoint |
| `apps/admissions/src/hooks/usePaymentStatus.ts` | its **duplicate copy** of that reader deleted; calls the service's (§4.4) |
| `apps/admissions/src/services/applications.ts` | `normalizePaginatedApplications`: `.applications`, `.count`, `.limit` rival-contract keys deleted; `BackendPaginatedApplications` narrowed to the published key set |
| `apps/admissions/tests/unit/serviceNormalization.test.ts` | 4 legacy-shape pins **inverted**, 6 cases added (34 → 40) |
| `…/tests/property/frontend-django-alignment/service-normalization.property.test.ts` | 2 duplicate property cases inverted — **another spec's numbered properties**, §5.4 |
| `…/tests/unit/notificationServiceCacheBehavior.test.ts` | 2 fixtures repointed to the post-unwrap shape |
| `…/tests/unit/page-verification/wizard-step1.test.tsx` | 2 domain-keyed pins inverted, 2 canonical cases added |

---

## 1. The zero report

```
$ python3 scripts/v1_surface_telemetry.py --json raw/v1-surface-telemetry.json
```

[`raw/v1-surface-telemetry.txt`](raw/v1-surface-telemetry.txt). **OVERALL PASS = True.**

### 1.1 Why it is a tool

The justification for every deletion in this task is *"nothing first-party needs
it"*. Read off by eye that is an assertion. Two earlier tasks built the hooks for
exactly this and said so in their own docstrings: task 5.1's
`legacy_write_telemetry.py` describes `X-Legacy-Catalog-Write` as *"a machine hint
used by the source/telemetry evidence to spot any residual first-party caller"*,
and 1.5 left the remaining normalizers *"with telemetry"*. This is that evidence.

### 1.2 Half 1 — source telemetry, 17 surfaces, 0 production callers

| surface | disposition | production callers | other matches |
|---|---|---:|---|
| `normalizer.catalog.collection_key_sniff` | removed | **0** | self 1 |
| `normalizer.catalog.mutation_key_sniff` | removed | **0** | self 2 |
| `normalizer.admin_catalog.listFrom` | removed | **0** | self 1 |
| `normalizer.admin_tenants.listFromResponse` | removed | **0** | self 1 |
| `normalizer.notifications.response_sniff` | removed | **0** | self 1 |
| `normalizer.payments.row_sniff` | removed | **0** | — |
| `normalizer.applications.rival_pagination` | removed | **0** | — |
| `normalizer.admin_audit.rival_pagination` | removed | **0** | self 1 |
| `normalizer.sessions.triple_shape` | removed | **0** | — |
| `workspace.student_application_detail` | already_closed | **0** | test 3 |
| `route.applications.email_slip` | already_closed | **0** | comment 2 |
| `route.applications.preview_summary` | already_closed | **0** | comment 1 |
| `alias.applications.generate_star` | already_closed | **0** | — |
| `route.catalog.legacy_institution_write` | kept_external | **0** | — |
| `route.catalog.legacy_intake_write` | kept_external | **0** | — |
| `route.catalog.legacy_program_write` | kept_external | **0** | — |
| `route.applications.condition_verify` | kept_external | **0** | — |

Every hit is printed with its file, line, text and class, so a reader can
disagree with a classification rather than take the count on trust.

**Two things the tool had to get right, both of which it got wrong first.**

- **A comment is not a caller, and JSDoc continuation lines do not start with
  `*`.** The first run reported `route.applications.email_slip` with one
  *production* hit; it was prose inside a `/** … */` block in `slipService.ts`
  recording that the route had been retired. Classifying documentation as a
  dependency makes a zero report unreachable for a reason that is not real, so
  the tool now tracks block-comment state per file rather than pattern-matching
  the line prefix.
- **A pattern shared by two files reports each as the other's caller.** The first
  run showed `admin/catalog.ts` and `admin/tenants.ts` blocking each other. They
  were not callers — they held the *same* permissive shape in two copies, which
  is finding API-02 itself. Both are declared `self` for both surfaces, with the
  reason in the tool's source.

### 1.3 Half 2 — route telemetry

Registry reconciled against the **live** URLConf (jobs-ops routes enabled, the
same full surface `test_authority_matrix_v2.py` walks):

```
live routes            : 230
registry entries       : 182
stale registry entries : none
retired routes still served : none
kept-external surfaces : 4
PASS=True
```

`stale registry entries : none` is §3's result, measured by a second, independent
instrument from the pytest gate.

### 1.4 Half 3 — announced end date

```
catalog legacy writes (institution / intake / program)  Deprecation=True  Sunset=True  Link=True
applications .../conditions/{cid}/verify/               Deprecation=True  Sunset=True  Link=True
compatibility register present : True
  registered: applications.condition_verify
  registered: catalog.legacy_institution_write
  registered: catalog.legacy_intake_write
  registered: catalog.legacy_program_write
PASS=True
```

Before this task both rows read `Sunset=False` and the register did not exist.
§6 is what changed and why it is in scope.

## 2. Baselines, measured before anything changed

| Gate | Baseline (this task's own run) | 12.1 pass-2 candidate | Match |
|---|---|---|---|
| `cd apps/admissions && bun run test` | 1 failed / **4584** passed / 1 skipped, 493 files | same | ✓ |
| `bun run lint` | **15** errors, 13 files | same | ✓ |
| backend 49-file selection, **serial** | **34** failed / **773** passed / **0** errors | same | ✓ |
| cycles / largest SCC | 7 / 116 | same | ✓ |
| OpenAPI SHA-256 | `35fe05d4…`, 22,135 lines | same | ✓ |

[`raw/frontend-test-baseline.txt`](raw/frontend-test-baseline.txt),
[`raw/frontend-lint-baseline.txt`](raw/frontend-lint-baseline.txt),
[`raw/backend-baseline.txt`](raw/backend-baseline.txt). The tree this task started
from is the tree 12.1 finished with, to the test — so nothing below has drift to
account for.

Run **serially**, with a verified-empty `test_%` database list before starting and
no other pytest process, against the throwaway `mihas_localtest` Postgres
(`127.0.0.1:5433`) and local Redis (`127.0.0.1:6380`). Neon and production
untouched. 12.1 §15.1 is the write-up of why a concurrent run makes the
before/after unmeasurable (17 spurious `DuplicateDatabase` errors); both runs here
report **0 errors**, so the comparison is sound.

## 3. The two stale registry entries — the item nine tasks deferred

### 3.1 What was wrong

```
FAILED tests/unit/test_authority_matrix_v2.py::test_no_stale_registry_entries
FAILED tests/unit/test_authority_matrix_v2.py::test_zero_unclassified_gate_passes_on_live_surface
Stale=['/api/v1/applications/<uuid:application_id>/email-slip/',
       '/api/v1/applications/<uuid:application_id>/preview-summary/']
```

Both routes were **already deleted**:

- `/email-slip/` — task 10.4 measured zero first-party use and made it a thin
  proxy; task 10.6 removed the route, its view and its two serializers on a
  *second* zero reading (R13.5, API-04). Its successor is the one canonical
  official-document email.
- `/preview-summary/` — task 7.4 deleted the generative student preview summary
  (R11.1: the admissions runtime makes no generative AI call), and the route left
  the URLConf with it.

Neither was **de-registered**. A registry entry for a route the URLConf does not
serve is drift, and this registry's own drift guard says so — which is why it had
been failing on exactly this pair since 10.6 and 7.4 landed.

### 3.2 De-registering a stale entry is not deleting a live route

The dispatch asked for the first where both would satisfy the gate, and here only
the first is even available. The distinction, with both sides measured:

| | de-register a stale entry (what happened) | delete a live route (what did not) |
|---|---|---|
| served surface | **unchanged** — the route was already gone | one fewer path |
| OpenAPI contract | **unchanged**, byte-identical (§7) | a path and possibly components disappear |
| external consumer | **cannot observe it** — nothing to warn | a contract change needing R2.6's window |
| what it fixes | a gate that stopped reconciling | nothing, on its own |

### 3.3 The fix follows the registry's own precedent

Four lines above the two entries sits task 7.4's block for `admin-summary/`,
ending: *"The entry is deleted rather than left in place because a registry entry
for a route the URLconf does not serve is drift, not documentation."* The two
`_register(...)` calls are replaced by a comment block in that same form, naming
the retiring task, the successor, and the two tests that were failing.

### 3.4 Result

```
$ pytest tests/unit/test_authority_matrix_v2.py -q
16 passed, 1 warning in 6.39s
```

**14/16 → 16/16.** The whole suite, including the zero-unclassified gate, the
teeth tests, both reconciliation guards, and the committed-2.1-artifact check.

**The committed task-2.1 artifacts were deliberately not regenerated.**
`docs/v2-evidence/2.1/authority-matrix.json` and `authority-case-matrix.json`
still contain both paths. They are a **dated snapshot of what 2.1 measured**, and
R2.7 requires that *"immutable historical launch evidence SHALL remain labeled
with the release and commit that produced it"*. Rewriting them would make 2.1's
evidence describe a surface 2.1 never saw. `test_committed_evidence_artifacts_are_passing`
reads only the pass/count fields, which are unaffected.

## 4. The permissive normalizers

R14.5, verbatim: *"AFTER coordinated endpoint cutover, permissive
array/result/data/application normalizers and legacy request aliases SHALL be
deleted rather than retained indefinitely."* Task 1.5 removed **one**
(`normalizeInterviewsResponse`, six shapes) as the deliberate reference pattern
and recorded that *"remaining services' normalizers are removed as each is
migrated — Phase 12.2"*. These are the rest.

### 4.1 The branch that mattered was the same branch every time

Six of the nine surfaces had a `.data` or `.data.results` branch.
`apiClient.request` → `httpClient.unwrapApiResponse` unwraps **exactly one**
`{success, data}` level, so every one of those branches required the server to
have sent `{success, data: {data: …}}`.

They were not merely dead. R14's user story is *"I want the frontend and backend
to share an executable contract, **so that compatibility normalizers cannot hide
drift**"* — and a double-envelope branch is precisely a drift-hider: if the
envelope had ever regressed to double-wrapped, the admin catalog list, the tenant
list, the audit page, the payments ledger, the payment poller and the notification
bell would all have kept rendering, and nothing would have failed.

### 4.2 A rival contract is not a missing key, and only the first was removed

Three surfaces read `count`, one read `limit`, one read `entries`. This platform's
paginator is `StandardPagination` (`backend/apps/common/pagination.py`), which
publishes exactly `{page, pageSize, totalCount, results}`:

- `count` is **DRF's default** total key — a different pagination contract.
  Reading it meant a silent regression to DRF defaults would have kept every list
  page working with its total coming from somewhere else.
- `limit` is a limit/offset page size — a third contract.
- `entries` is a list key `AdminAuditLogView` has never had.

All removed. What was **kept**, deliberately, is `result.totalPages` and
`result.summary` in the audit reader: those are not rival contracts. The server
does not send them, the client derives both, and if a later task publishes them
the derivation steps aside correctly. A case now pins that preference explicitly,
and the difference is written into the code.

The same reasoning kept two things elsewhere: the **bare-array** branch in the
catalog, admin, payments and applications readers (each backing view still has an
un-paginated `return Response({"success": True, "data": serializer.data})` tail —
the branch exists because the *producer* does), and the `last_active` →
`last_activity` map in `sessionService.ts`, which is a **field** map, not an
envelope sniff, and is the live path (`SessionListView` publishes `last_active`).

### 4.3 The normalizer that could not tell "empty" from "unrecognised"

`services/notifications.ts` had a helper, `firstArrayValue`, that tried candidate
keys in order and kept the first **non-empty** array. So an empty canonical page
fell **through** to the next candidate key, and "no notifications" and
"unrecognised shape" reached the same answer by different routes. A strict read
separates them, and a new case pins it: an empty `results` beside a populated
`notifications` yields empty.

Its four other branches were the bare array, `.data`, `.data.results`,
`.data.notifications` and `.notifications`. `NotificationListView` has **four**
return paths — page-number, implicit-no-params, cursor, and cursor-with-unknown-
anchor — and every one of them returns `{"success": true, "data": {…, "results": […]}}`.
So `.results` is the whole contract. The three first-party callers, all in
`hooks/useNotificationPolling.ts`, keep working: the exported function stays, and
only the sniff inside it is gone.

### 4.4 One endpoint had two readers, and one of them said it did not

`services/payments.ts::normalizePaymentRows` opens with: *"Exported so the drift
here is testable and lives in one place: the payment page and the polling hook
both read the same endpoint, and each used to carry its own copy of this
unwrapping."*

`hooks/usePaymentStatus.ts::normalizeRecords` was a byte-equivalent copy of it,
over the same `GET /api/v1/payments/`, with the same six branches. The
consolidation the docstring described had not happened. It has now: the hook calls
the service's reader, the service's reader accepts the two shapes
`PaymentListView` emits, and the docstring says what is true.

### 4.5 A normalizer that guesses is worse than one that refuses

`services/catalog.ts::normalizeCollection` ended with a "defensive fallback" that
took `Object.values(response).find(Array.isArray)` — the **first array-valued
property, whatever it was** — logged a warning, and used it as the list. On a
payload with two arrays it picked one by key order. A normalizer that invents a
contract is worse than a parse failure, because the guess is silent and the
warning goes to a console nobody reads in production. Deleted, with a case that
feeds it `{rows: […]}` and asserts an empty read.

## 5. The V1 deprecation tests — frontend

**Not one legacy-shape assertion was deleted.** Eleven cases across four suites
assert **refusal**, and five fixtures were **repointed** to the shape the producer
emits. In every inversion the input the case already generated is still generated,
at the same `numRuns` where it is a property; only the expectation moved. That keeps the removal pinned — a future task
cannot quietly restore a branch without a red test — and it is the same discipline
12.1 §4.2 applied to eight source-location pins.

### 5.1 `tests/unit/serviceNormalization.test.ts` — 34 → 40 cases

This file *was* the register of permissive shapes; three of its case titles began
"tolerates the legacy …". Four inverted, six added:

| was | is |
|---|---|
| `tolerates the legacy {applications,count,limit} shape` | `REFUSES the legacy {applications,count,limit} shape — the rival contract is gone`, and asserts `page` **is** still honoured, so the refusal is scoped rather than a blanket discard |
| `normalizeProgramsResponse accepts array / {results} / {programs} shapes` | the two real shapes, plus a dedicated `REFUSES the {programs\|intakes\|subjects\|institutions} domain-keyed shape` over all four collections |
| `reads nested data.results / data.notifications paginated shapes` | `REFUSES a second envelope, a bare array and the {notifications} key` — five retired shapes in one case |
| `tolerates the legacy {entries,count} shape` | `REFUSES the legacy {entries,count} shape — entries is not a key, count is a rival contract` |
| `normalizes the {sessions,count} object payload` | `REFUSES the {sessions,count} object payload — neither key exists` |
| — | `REFUSES an unrecognised shape instead of guessing which array is the list` (§4.5) |
| — | `an EMPTY canonical page is an empty page, not a fall-through` (§4.3) |
| — | `program create reads the record, and REFUSES a second {program} envelope`, driven through `programService.create` so the claim is about the wire |
| — | `still prefers a server-published totalPages/summary over the derived ones` (§4.2's kept half) |
| — | `reads the cursor-mode shape, which is the same {…, results}` |

### 5.2 One case was repointed rather than inverted, and it is marked

`normalizeSubjectsResponse and normalizeInstitutionsResponse return their declared
collections` fed the institutions reader a `{institutions: […]}` payload. Its
actual claim is about the **per-record** map, not the envelope, and the envelope
half is now covered by the dedicated REFUSES case — so its input moved to
`{results: […]}` with a comment saying so.

### 5.3 Two fixtures were wrong about where they sat in the stack

`notificationServiceCacheBehavior.test.ts` passed the normalizer a **full**
`{success: true, data: {…}}` envelope. The service never sees that: the client
unwraps it first. So the fixture was exercising the double-envelope branch — i.e.
the test's *own* claim (the `is_read` → `read` / `message` → `content` field map)
was being proven through a branch that could not fire in production. Repointed to
the post-unwrap shape; the claim is unchanged. Its sibling case used a bare array
for the same reason and moved the same way.

### 5.4 Two of the inverted cases belong to **another spec's numbered properties** — read this

This is the most reversible decision in the task, so it gets its own section
rather than a footnote.

`tests/property/frontend-django-alignment/service-normalization.property.test.ts`
carries **Property 4** ("Paginated applications normalization",
*Validates: Requirements 2.5, 4.4, 8.1*) and **Property 6** ("No double envelope
unwrap", *Validates: Requirements 4.1*) of the **`frontend-django-alignment`**
spec — not this one. One case in each generated the retired `{applications, count}`
shape and asserted it was accepted.

There is a genuine tension: that spec's Property 4 asserts the tolerance;
admissions-v2 R14.5 requires the tolerance be deleted. What makes the resolution
safe rather than a silent spec edit:

1. **Neither property's claim rests on the case that changed.** Property 4 has a
   canonical `{results, totalCount, page, pageSize}` case immediately above,
   over the same generators, which passes untouched — that is the case carrying
   the property. Property 6 likewise. Both changed cases were **duplicates over
   a second input shape**.
2. **The requirement links are unchanged** (2.5 / 4.4 / 8.1 and 4.1).
3. **The retired shape is still generated**, at the same `numRuns: 100`; only the
   expectation is inverted. Nothing was deleted, so nothing is unpinned.
4. **Each carries a block comment saying it was repointed by task 12.2, by whom,
   and why**, so the next reader can challenge it in one place.
5. Property 6's inverted case additionally re-asserts the **canonical** read in
   the same body, so the half of the property that actually defends against a
   second unwrap is proven twice.

If a reviewer judges that a numbered property of another spec may not be touched
by this one, the reversal is two blocks in one file and the normalizer change does
not depend on it — the strict readers stay, and Property 4/6 would have to be
re-stated by their own spec instead.

### 5.5 Frontend result

| | baseline | candidate |
|---|---|---|
| test files | 1 failed / 491 passed / 1 skipped (493) | 1 failed / 491 passed / 1 skipped (**493**) |
| tests | 1 failed / **4584** passed / 1 skipped | 1 failed / **4592** passed / 1 skipped |

**New failures: 0.** The one failure is the same
`authPageFormMarkup.test.tsx > uses honest helper copy instead of fake email
availability states` — the **sign-up page's** helper copy, which seven lanes have
now each recorded (11.1–11.5, both 12.1 passes, and this one). Not touched here.

**+8, and the arithmetic closes exactly:** `serviceNormalization` 34 → 40 (+6) and
`wizard-step1` +2 (the two canonical `{results}` cases added beside the inverted
domain-keyed ones). File count unchanged at 493 — no new test file on the frontend
— and **no case deleted**, which is the check that matters for a task whose claim
is "the removals are pinned, not forgotten".

## 6. Keeping documented external compatibility until its announced end date

### 6.1 Four surfaces had a deprecation with no end

The task's hard constraint presumes an announced end date. Three different answers
existed in the repo before this task:

| surface | end date, before |
|---|---|
| notification `/mark-all-read/` + `/mark-read/` aliases | **yes** — RFC 8594 `Sunset`, default `Thu, 08 Nov 2026`, overridable by `NOTIFICATION_ALIAS_SUNSET` |
| the legacy columns | **yes** — `SUNSET_DATE = "2026-08-15"`, with a runbook and a drop script |
| the three frozen catalog write routes (task 5.1) | **no** — `Deprecation: true` + successor `Link`, no date |
| `.../conditions/{cid}/verify/` (task 10.6) | **no** — same |

Task 5.1 wrote *"Phase 12.2 removes them"*; task 10.6 wrote that removing
`/verify/` *"needs a window that starts with this task's measurement, not one that
ends with it"*. Both windows were open-ended, and an open-ended deprecation is the
debt this task exists to stop.

### 6.2 What changed

`backend/apps/common/compatibility_register.py` (**new**) registers all four with
an **owner**, an **announced end date**, a **successor**, **exit criteria**, and
the **measurement** that says nothing first-party needs them. The window is 180
days from `2026-08-11` → `2027-02-07`, matching the notification aliases' own
6-month convention rather than inventing a third. `mark_deprecated` and
`_with_condition_deprecation_headers` now stamp `Sunset` from it, so a caller
discovers the date on the wire instead of in our source.

`sunset_for()` raises `KeyError` for an unregistered id, deliberately: a `Sunset`
in front of a caller that no register audits looks like a commitment and is not
one. A case pins the refusal.

### 6.3 Why the routes were **not** removed, stated as a decision

All four have **zero** first-party production callers (§1.2), so R14.5's clause
about *normalizers and request aliases* is satisfied by the frontend work. But
these are `/api/v1/` **routes** on the published API, and R2.6 requires that a
breaking public contract change either move to `/api/v2/` or *"first publish a
measured deprecation window for `/api/v1/`"*. `/verify/` in particular is a staff
route a school's own integration may call, and 10.6 measured it for the first
time. Removing a route in the same window that first announced its end date would
collapse the window into an instant.

So: **kept, with the window now closed-ended and auditable.** Task 12.5 audits
that register; everything in it is real, has an owner, and names the measurement
behind it.

### 6.4 The register does **not** contain the normalizers, and that is the rule

A surface with zero first-party callers and **no published contract** is not a
compatibility surface — it is dead code, and this task deleted it rather than
registering it. The nine normalizers were private frontend functions; no external
consumer could observe them, so no window was owed. The register's docstring
states this so it cannot become a parking lot.

## 7. The OpenAPI contract is byte-identical, and that is the correct reading

```
$ diff schema/openapi.v2.candidate.yaml /tmp/schema-12-2.yaml     # no output
$ sha256sum …
35fe05d4cd3fa69ddfa9b0f0b3f9370c4649fa83b8258f29dc9100231cc3ef58  (both)
```

[`raw/openapi-schema.txt`](raw/openapi-schema.txt). 22,135 lines, unchanged.

The dispatch said *"the schema hash will change if you remove a route, and that is
correct — account for every removed path and component by name."* Here is the
accounting: **zero paths removed, zero components removed.** Task 12.2 removed no
route. The two route removals it closes out were performed by **10.6** and
**7.4**, each of which regenerated the schema at the time (10.6 §6 is that
regeneration, and it is why `/email-slip/` is absent from the committed contract).
What 12.2 removed is two **registry** entries and nine **private frontend**
functions, neither of which is a contract surface.

What it *added* is an RFC 8594 `Sunset` response header on four legacy surfaces.
drf-spectacular does not describe response headers unless they are declared, and
declaring them would mean **extending the surface being retired** — which is
10.6 §5.1's own stated principle about not giving a deprecated route new fields on
its way out.

## 8. The browser gate, on a freshly seeded stack

Isolated local harness (task 0.4), strict gates active,
`HARNESS_PW_CHANNEL=chrome` (bundled Chromium is unsupported on this OS), SPA
rebuilt by `harness up` after the source change, volumes wiped and reseeded, and
**torn down afterwards**.

| Run | Result |
|---|---|
| `harness down` then `harness up` | volumes wiped, SPA rebuilt, backend healthy (schema + seed), edge serving ([`raw/harness-up.txt`](raw/harness-up.txt)) |
| the whole required profile, **fresh stack** | **217 passed**, 3 failed, **0 did not run** — 15.6 min ([`raw/harness-required-suite.txt`](raw/harness-required-suite.txt)) |
| the one unfamiliar failure, **re-run in isolation on the same live stack** | reproduces on chromium, passes on mobile ([`raw/harness-flake-isolation.txt`](raw/harness-flake-isolation.txt)) |
| `gatecheck-negative` | **4 failed, as required** — skip / console / failed-request / undrained gates all fire ([`raw/harness-gatecheck.txt`](raw/harness-gatecheck.txt)) |
| drain | `{"broker_queue_depth": 0, "celery_queues": ["celery"], "unsettled_payment_collections": 0, "unsettled_references": []}` ([`raw/harness-drain.txt`](raw/harness-drain.txt)) |
| teardown | 0 harness containers, 0 harness volumes ([`raw/harness-down.txt`](raw/harness-down.txt)) |

Total **220**, the same as 12.1's. This task adds no journey.

### 8.1 The three failures, attributed — and one of them investigated rather than assumed

| Failure | Reading |
|---|---|
| `tenant-launch.spec.ts:139` × **both** projects | **stable pre-existing.** The same pair tasks 10.5, 10.6, 11.1, 11.2, 11.3, 11.4, 11.5 and both 12.1 passes each recorded at this base commit — this is the **tenth** consecutive recording. Its assertion is `getByText('Fees')` against a `Program Fees` step label `TenantOnboardingWizard.tsx` renders `hidden` on mobile. The tenant lane's; 12.1 §21 is why that file is declined |
| `ocr-manual-fallback.spec.ts:146` [chromium] | **not this task's, and investigated rather than asserted.** §8.2 |

### 8.2 The one failure that was not already on the list

12.1 pass 2 recorded 218 passed / 2 failed; this run is 217 / 3. The extra is
`ocr-manual-fallback.spec.ts:146` on the **chromium** project only, and it
**reproduced when re-run in isolation** — so it is not dismissed as a flake. Four
things were checked before attributing it:

1. **Where it stalls.** The error context shows the wizard sitting on **Step 3 of
   6: Personal details** with "Continue to Education" focused and the step
   checklist reading *"Personal details complete"*. The click landed; the step did
   not advance. This is the wizard step-advance species 11.2 §16–§17 documented
   and 11.3 §4.6 catalogued for three specs.
2. **The reads this task changed had already succeeded.** Steps 1 and 2 —
   programme + intake selection, which go through
   `services/catalog.ts::normalizeCollection`, the reader this task narrowed — are
   marked *completed* in the same snapshot. If the catalog reader were broken the
   journey could not have reached step 3.
3. **The same test passes on the mobile project, on the same build.** The two
   projects differ in viewport and device scale factor, not in code. A logic
   regression in a service reader cannot be project-selective.
4. **The one structural change that could have moved a chunk boundary was ruled
   out by measurement, not by argument.** `hooks/usePaymentStatus.ts` now imports
   `normalizePaymentRows` from `@/services/payments` (§4.4), which could in
   principle pull a module into the wizard chunk and change load order. It does
   not: `components/student/PaymentForm.tsx` — which `PaymentStep` renders —
   already imports `@/services/payments`, so that module was in the wizard's
   dependency graph before this task. The cycle report agrees: 7 → 7, largest SCC
   116 → 116, component sizes identical member for member (§13).

**Recorded as new information for the wizard lane, not fixed here.** What is new
is that this species now **reproduces in isolation**, which the three instances
11.3 §4.6 catalogued did not — those each passed on re-run. That is worth the
wizard lane knowing: it may be hardening from a flake into a defect. Fixing a
wizard step-advance race is not in this bullet, and doing it here would mix an
unrelated behaviour change into a legacy-contraction task.

## 9. The second `__module__`-keyed gate 12.1's split broke

### 9.1 What it is

`tests/unit/test_public_endpoint_policy.py::test_every_allow_any_view_has_public_endpoint_classification`
is the guardrail that makes unauthenticated exposure a deliberate decision: every
view with `permission_classes = [AllowAny]` must appear in
`apps/common/public_endpoint_policy.py`. It derives its keys by **AST-scanning
`apps/**/*.py` for the class definition** — so a class that changes defining
module changes key.

Task 12.1 split `apps/catalog/views.py` into six resource modules. All **seven**
`AllowAny` catalog views therefore left the register at once, and the gate has
been failing since. It was **outside 12.1's 49-file selection**, so neither pass
ran it.

### 9.2 Why it matters more than the first one

12.1 §19 found and fixed `test_view_auth_classification.py` (38 → 75 → 38) and
its §23 #2 wrote the lesson: *"grep for `__module__`-keyed tests before you move a
class."* The lesson was drawn from one instance; there were two, and the second is
the security-relevant one. While the register was stale, a **new** `AllowAny`
catalog view could have been added in a split module without the gate noticing,
because the gate was already red for other reasons.

### 9.3 The fix, and what it deliberately does not do

Seven canonical split-module keys **added**, the seven `apps.catalog.views.*` shim
keys **kept alongside**. That is this register's own existing precedent —
`apps.accounts.auth_views.LoginView` and `apps.accounts.views.LoginView` are both
already in it, as are both `LencoWebhookView` paths — and it is the convention
`test_view_auth_classification.py` follows. Additive, so nothing a future reader
needs can have been removed.

```
before: 10 unclassified   (7 from the 12.1 split, 3 from other lanes)
after :  3 unclassified   (the same 3)
```

[`raw/public-endpoint-policy.txt`](raw/public-endpoint-policy.txt).

The three that remain — `apps.catalog.staff_invitation_views.StaffInvitationAcceptView`
and the two `apps.common.v2.demo_views` views from task 1.3 — are **not
classified here**, deliberately. Classifying a public endpoint is a decision about
whether its unauthenticated exposure is intended, which belongs to the lane that
added it. 12.1 §19 set exactly this precedent when it declined to classify four
domain-lifecycle views under cover of a refactor. The gate still fails, for the
reason it should.

## 10. The two shims — the decision, and why it is a mechanism

Task 12.1 left `apps/catalog/admin_views.py` (2,072 → 96) and
`apps/catalog/views.py` (1,570 → 85) as re-export shims, each with a removal
condition in its own docstring. The dispatch put the obligation plainly: *"A shim
whose removal condition nobody ever evaluates is exactly the debt this task exists
to stop."*

### 10.1 The conditions, evaluated

Measured, not read off the docstring:

| shim | production importers | test dependents | condition met? |
|---|---|---|---|
| `apps.catalog.views` | **1** — `apps/catalog/urls.py` | **11** — `test_catalog_properties`, `test_perf_output_equivalence`, `test_perf_divergence_regression`, `test_perf_golden_snapshots`, `test_envelope_consistency`, `test_optional_public_auth`, `test_perf_catalog_cache`, `test_perf_scoped_cache_ttl`, `test_scenario_query_override_fail_closed`, `test_tenant_api_contract_preservation`, `test_view_auth_classification` | **no** |
| `apps.catalog.admin_views` | **2** — `admin_urls.py`, `staff_invitation_views.py` | **3** — `test_tenant_audit_amendment_scope_9_5`, `test_tenant_api_contract_preservation`, `test_view_auth_classification` | **no** |

### 10.2 Decision: keep both

The reasoning, and it is a trade rather than a preference:

- **Deleting them improves no gate.** The `__module__`-keyed registers are already
  keyed on the **split** modules — that is why two of them were failing — and
  repointing those registers (§9, and 12.1 §19) is independent of whether the
  shim exists. The schema is byte-identical either way (§7). Cycles are unaffected:
  12.1 §17 established that the shim imports the split modules and no split module
  imports the shim, so those edges are acyclic by construction.
- **Deleting them costs 14 test files plus a URL conf and one production module**,
  for ~180 lines. Several of those suites belong to other lanes' perf-golden work
  and are currently red for task 9.2's reasons (§12), so editing them would mix a
  mechanical repoint into a failing surface someone else owns.
- **`apps.catalog.views` is also the name the tests' `@patch` targets resolve
  through**, including two underscore imports 12.1 §13.3 had to re-export
  explicitly. Repointing 11 files' patch targets is mechanical but it is 11 other
  lanes' files.

### 10.3 What makes keeping them honest

`test_compatibility_surfaces_12_2.py::test_shim_removal_condition_is_evaluated_and_can_only_shrink`
evaluates each condition **on every run** and:

- **prints the exact blocker set** on failure, so nobody has to rediscover it;
- **budgets** it at today's measured count with **no slack** (1/11 and 2/3), so
  adding a caller to a shim fails — the allowance can only shrink, which is the
  mechanism task 1.5 built for `LEGACY_EXCEPTIONS`;
- **fails when a condition becomes satisfied**, i.e. when the last blocker goes,
  the test says *delete this shim now* rather than letting a deletable shim sit
  unnoticed;
- asserts each shim still carries its `COMPATIBILITY_OWNER` and
  `REMOVAL_CONDITION` markers, so the documentation cannot silently disappear
  either.

That converts "we will remove it later" into a claim the suite checks. If the next
reader disagrees with keeping them, the budget table is the exact work list.

## 11. Item 2 of the dispatch was already closed — and the correction is the finding

The dispatch said: *"10.6 chose the canonical route and redirected the duplicate,
deliberately leaving the duplicate's data and action logic in place until parity
was proven. Parity was proven. Remove it (finding STU-23)."*

**Re-measured: 10.6 removed it in the same task.** Its own §11 inheritance table
reads *"`ApplicationDetail.tsx` deleted, `DuplicateRouteRedirect.tsx` added,
registry + config + three call sites updated — correct; re-verified by the 50-case
suite and leg 0"*, and its §"What this task establishes" #5 reads *"The duplicate
reads are gone."*

The measurement, from [`raw/v1-surface-telemetry.txt`](raw/v1-surface-telemetry.txt)
(surface `workspace.student_application_detail`, pattern
`pages/student/ApplicationDetail|student\.applicationDetail`, scanning **both**
`src/` and `tests/`):

```
production callers : 0
test               : studentWorkspaceConsolidation.test.tsx:252  it('there is no longer a separate student.applicationDetail route id')
test               : studentWorkspaceConsolidation.test.tsx:253  expect(() => routeById('student.applicationDetail')).toThrow()
test               : pageShellRenderSmoke.test.tsx:139           // `pages/student/ApplicationDetail.tsx` removed by admissions-v2 task 10.6
```

Three references in the whole repo, all three asserting the absence. `ls` confirms
the file does not exist. What remains at `/student/application/:id` is a
`duplicateRedirects` entry rendering `DuplicateRouteRedirect` inside the `student`
guard — a redirect, not a second workspace, which is the shape R13.13 asks for and
is deliberately **kept** (a bookmark is external compatibility with no cost).

Recorded rather than quietly skipped, because "the dispatch was wrong about this"
is more useful to the next reader than silence, and because re-deriving it cost
real time that the next reader should not spend.

## 12. Backend result — 2 fixed, 0 introduced

```
$ cd backend && DATABASE_URL=<mihas_localtest 5433> REDIS_URL=<local 6380> TESTING=1 \
    .venv/bin/python3 -m pytest $(cat raw/backend-selection.txt) \
      tests/unit/test_compatibility_surfaces_12_2.py \
      tests/unit/test_public_endpoint_policy.py -q     # run SERIALLY
33 failed, 787 passed, 891 warnings in 27.53s
```

| | baseline (49 files) | candidate (51 files) |
|---|---|---|
| failed | **34** | **33** |
| passed | **773** | **787** |
| errored | 0 | 0 |

Set difference, [`raw/backend-failure-diff.txt`](raw/backend-failure-diff.txt):

- **Fixed (2):** `test_authority_matrix_v2.py::test_no_stale_registry_entries` and
  `::test_zero_unclassified_gate_passes_on_live_surface` — §3.
- **Introduced (0).**
- The one name present in the candidate and absent from the baseline is
  `test_public_endpoint_policy.py::test_every_allow_any_view_has_public_endpoint_classification`,
  and it is there because **this task added the file to the selection**. It was
  failing before the change with **10** unclassified views and fails after with
  **3** (§9). Counting it as "introduced" would be wrong in both directions:
  nothing regressed, and 7 of its 10 findings were closed.
- **+14 passing:** 10 from the new `test_compatibility_surfaces_12_2.py`, 2 from
  `test_public_endpoint_policy.py`'s other cases, and 2 from the authority matrix.

`test_view_auth_classification.py::test_all_api_views_are_classified` still
reports **exactly 38**, unchanged — 12.1 §19 restored it to 38 and deliberately
did not improve it, and neither did this task.

Django system check, no `TESTING=1` and no substitute `REDIS_URL`:
`System check identified no issues (1 silenced)`
([`raw/django-check.txt`](raw/django-check.txt)) — run to prove the new register,
the two `Sunset` call sites and the repointed policy import cleanly and every URL
conf still resolves.

## 13. Size, cycles, and the one threshold this task crossed

```
$ bun scripts/module-size-report.ts --threshold 400
```

| Measure | 12.1 candidate | 12.2 candidate |
|---|---:|---:|
| import cycles | 7 | **7** |
| largest SCC | 116 | **116** |
| component sizes | `[116][7][3][3][2][2][2]` | **identical, member for member** |
| `apps/admissions/src` files over 400 | 55 | **55** |
| `backend/apps` files | 338 | **339** |
| `backend/apps` files over 400 | 73 | **74** |
| `backend/apps` total lines | 88,678 | 88,949 |

Per 12.1 §11 #5 the **largest SCC** is watched and not only the count; both held.

**The +1 over 400 is reported rather than engineered away.**
`backend/apps/applications/admin_amendment_views.py` went **387 → 401** — a
14-line docstring on `_with_condition_deprecation_headers` explaining why the
`Sunset` is there and which task's measurement opened the window. Trimming
documentation to hold a line count would be the wrong trade, and 12.1 §20 made
the same point in the other direction: a threshold count is a coarse instrument.
The +271 total lines reconcile exactly: 198 (`compatibility_register.py`) + 26
(`legacy_write_telemetry.py`) + 14 (`admin_amendment_views.py`) + 30
(`public_endpoint_policy.py`) + 3 (report per-file overhead) = 271.

## 14. Lint and build

```
cd apps/admissions && bun run lint     # 15 errors, 13 files
cd apps/admissions && bun run build    # exit 0
```

**15 errors / 13 files — identical to the baseline and to 12.1's candidate, and
the file set is the same 13.** None of the nine modules this task edited appears
in it, and it created no new violation.
[`raw/frontend-lint.txt`](raw/frontend-lint.txt),
[`raw/frontend-lint-files.txt`](raw/frontend-lint-files.txt).

Build exit 0 including `tsc -p tsconfig.build.json --noEmit` and the CSP gate
([`raw/frontend-build.txt`](raw/frontend-build.txt)). `tsc` was the working
instrument for the normalizer removals: narrowing
`BackendPaginatedApplications`, `PaymentListEnvelope`, `PaymentListResponse` and
the six catalog call-site generics turned "which call sites assumed the retired
shape" into a named list rather than a judgement call.

## 15. Design (PRODUCT.md / DESIGN.md)

- **No token, colour, font, size, shadow tier or motion touched.** This task
  changes service-layer readers, two response headers, and three registers. It
  renders nothing.
- **No rendered output changed**, which is why no browser journey was added (§8)
  and why the harness is a regression check rather than a new claim.
- 44 px targets, reduced motion, one container deep, no gradient / glassmorphism /
  emoji, `StatusBadge`'s "never colour alone" — all unchanged and all still
  asserted by `productDesignDeFluff`'s 70 cases, which pass.

## 16. Hard constraints

- **Auto-save untouched.** No wizard hook, `useAutoSave`/`useSmartAutoSave`
  consumer, draft persistence path or `SaveStatusIndicator` was edited. The
  applications-list reader that changed is the **roster/list** projection, not the
  draft write path.
- **Backend permissions remain the only boundary.** Nothing here decides whether
  a command is authorized. The two registry changes are *classification* registers
  read by tests, not by request handling: `authority_matrix_registry.py` is a
  `scripts/` module the gate imports, and `public_endpoint_policy.py` is read only
  by its own gate. Removing an entry from either cannot widen access — and §9's
  change *narrows* the number of unclassified public views.
- **The `Sunset` header changes no authorization and no body.** `mark_deprecated`
  and `_with_condition_deprecation_headers` are wrapped so a header that cannot be
  stamped never turns a working legacy write into a 500.
- **Tenant isolation unchanged.** No scoping decision moved; no query gained or
  lost a filter. The catalog read-scope helpers were not touched.
- **No PII.** The register holds route templates, dates, owners and successors.
  The telemetry tool emits file paths and matched source lines from the repo.
- **Backward compatibility preserved where it is observable, and the removals are
  where it is not.** Nine private frontend readers and two registry entries have
  no external consumer; four published routes were kept and given a date (§6).
- **No new capability, route, endpoint, schema, model or migration.** The
  catalogue stays at 17 `platform.*` + 17 `tenant.*`. Nothing to rehearse on Neon;
  the only databases used were the throwaway `mihas_localtest` Postgres and the
  task-0.4 harness. Production untouched.

## 17. Not claimed here

- **No route was removed.** §7. Every removal in this task is a registry entry or
  a private function. The four legacy routes with zero first-party callers were
  **kept** and given an announced end date, per the bullet's own constraint (§6.3).
- **The `.../conditions/{cid}/verify/` window is announced, not closed.** Its exit
  criteria are in the register; the earliest it can be removed is 2027-02-07.
- **The admin roster still paginates and searches in the browser.**
  `ApplicationsTableView` hands `EnhancedDataTable` a `pageSize={10}` and runs a
  client search over a server page. 11.4 §11 named it, 12.1 §10 restated it as
  ADM-01's lane, and this task restates it again rather than dropping it. It is
  genuinely **not** in scope: it is a query-*location* problem — moving a filter
  and a page to the server — not a normalizer or a duplicate route, and fixing it
  changes a read contract, which this bullet does not authorise. Checked
  explicitly, not assumed.
- **`@/lib/pdf` and `src/lib/slipService.ts` are not removed.** Both have **zero**
  production callers; the only remaining consumers are `src/pages/dev/*` previews,
  which the steering rules explicitly permit, and
  `documentFlowDriftGuard.test.ts` already keeps them off every official path with
  a tight, shrinking allowlist. Removing a dev-only module is task **12.4**'s
  bullet ("services, components, tests, and docs that describe retired behavior"),
  and it needs the dependency/bundle analysis that task names.
- **The 3 remaining unclassified public endpoints are not classified** (§9.3), and
  **`test_view_auth_classification.py`'s 38 are not reduced** — 12.1 §19
  deliberately held that number and so does this task.
- **Not fixed, each measured against a real run and attributed elsewhere:** the
  31 other backend failures (§12 — 20 pre-existing plus the 14 task-9.2
  perf-golden divergences against the 2026-06-21 baseline, minus overlap),
  `authPageFormMarkup.test.tsx` (seven lanes), the 15 lint errors,
  `tenant-launch.spec.ts:139` ×2 (ten consecutive recordings; the tenant lane's),
  `ocr-manual-fallback.spec.ts:146` [chromium] (§8.2 — investigated, attributed to
  the wizard lane, and flagged as newly reproducible), and `bun run
  validate:tailwind` still exiting 127. The two flakes 12.1 §5.7 catalogued
  (`student-wizard-mobile.spec.ts:279`, `admin-dashboard-metrics.spec.ts:356`)
  both **passed** this run, which is their sixth independent confirmation.
- **`catalog/services.py` was not touched.** 52 importers and
  `AdminCapabilityService`; 12.1 §21 is why it is its own task, and this task did
  not weaken that.
- **The committed task-2.1 evidence artifacts were not regenerated** (§3.4), by
  design, under R2.7.

## 18. What a future task on these surfaces should know

The checkbox is `[x]`, so this is not a continuation plan — it is what the next
person contracting a legacy surface in this repo should have in hand.

1. **`grep` for `__module__`-keyed gates, and grep for the *string* form too.**
   12.1 §23 #2 gave this lesson from one instance
   (`test_view_auth_classification.py`, which discovers via `obj.__module__`).
   There is a second (`test_public_endpoint_policy.py`, §9), and it is invisible to
   that grep because it never writes `__module__` — it AST-scans file paths. The
   pattern that finds both is *"a register whose keys are dotted module paths"*:
   ```
   grep -rn "\"apps\.[a-z_]*\.[a-z_]*\.[A-Z]" backend/apps backend/tests scripts/
   ```
   Two registers, both keyed that way, both broken by one split.
2. **Distinguish a rival contract from a key that is merely absent.** §4.2. Delete
   the first (`count`, `limit`, `entries`, `.data.results`); keep the second
   (`totalPages`, `summary`). The test is: *would reading this key make us silently
   accept a different producer?* If yes it hides drift; if no it is forward
   tolerance.
3. **De-registering a stale entry and deleting a live route are different acts
   with different blast radius** (§3.2). Check which one the gate actually wants
   before touching a route. Here the gate wanted the first, and the byte-identical
   schema (§7) is the proof it had none.
4. **Do not register a normalizer as a compatibility surface.** A private function
   with no published contract owes no window; it is dead code. The register's
   docstring says this so it cannot become a parking lot (§6.4).
5. **A `Deprecation` header without a `Sunset` is an exemption, not a
   deprecation.** Four surfaces had one for months because "removes them in Phase
   12.2" was written in a docstring rather than as a date a caller could read
   (§6.1).
6. **Invert a legacy-shape pin; do not delete it.** Fourteen cases here, and the
   inverted case is *stronger* than deleting because it fails if someone restores
   the branch. Where the pin belongs to another spec's numbered property, check
   first whether the property's claim rests on that case or on a canonical sibling
   — here it was always the sibling (§5.4).
7. **A fixture that wraps the payload in a second envelope is testing a branch
   that cannot fire.** §5.3 found two. If a service test's input starts
   `{success: true, data: …}`, the test is a level too high: `apiClient.request`
   unwraps one level before the service sees anything.
8. **Evaluate a shim's removal condition mechanically, and budget the blockers at
   today's count with no slack** (§10.3). "Remove it later" is not a plan;
   `assert len(importers) <= 1` is.
9. **Classify a match, do not filter it.** The telemetry tool prints every hit with
   `production` / `test` / `dev-preview` / `self` / `comment` beside it, so a reader
   can dispute a classification. Both of its early bugs (§1.2) were
   *classification* bugs, and both would have been invisible in a bare count.
