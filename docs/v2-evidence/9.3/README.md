# Task 9.3 — Rebuild user directory CRUD, import, bulk, and export

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

Evidence index for task **9.3** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [-] 9.3 Rebuild user directory CRUD, import, bulk, and export
  - Align form/serializer fields and supported roles.
  - Implement server pagination/search/sort/facets and page-independent export.
  - Add previewed tenant-bound atomic/idempotent import with row errors.
  - _Requirements: R6.1-R6.5_
  - _Findings: ADM-03, ADM-04, AUTH-04_
  - _Evidence: page 2+, ignored-field rejection, import rollback, audited export E2E_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-08 (UTC).
- **Reuses tasks 8.4 and 9.1 rather than inventing a third pattern.** 8.4's
  `SettlementQueryService` and 9.1's `ApplicationQueryService` established
  scope-before-lookup with a masked 404, SQL aggregates over the whole filtered
  set, SQL facets with each dimension left open, registered query parameters
  echoed back when unknown, capability-driven redaction, and a page-independent
  audited export bounded by `EXPORT_ROW_LIMIT`. [9.1 §10](../9.1/README.md) and
  [9.2 §13](../9.2/README.md) both name the user directory as carrying the same
  page-derived habits and leave it here. This task spends that vocabulary on the
  directory and adds the three things neither money nor applications needed: a
  **mutation field contract**, a **previewed import**, and a **bulk command**.
- PBT: task 9.3 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`). Nothing is recorded via
  `update_pbt_status`.
- Schema: **no migration.** No table, column, index, capability, or endpoint
  field was added; three routes were added, all reading existing tables. Neon and
  production were not touched; the only databases used were the throwaway
  `mihas_localtest` Postgres and the task-0.4 harness.

## The Required_Evidence claim

The `_Evidence:` line is four claims, and each one names a different defect.

**1. Page 2 and beyond — a page is a window, and the numbers describe the
population.**

| Where | What it proves |
|---|---|
| [`test_user_directory_9_3.py::TestPageTwoAndBeyond`](../../../backend/tests/unit/test_user_directory_9_3.py) | paging walks 26+ accounts without repeating or skipping a row (the total ordering); **every aggregate recomputed in hand-written SQL** over the same filtered rows, read from **page 3 of a 3-row page** so the numbers cannot be the rows on screen; each headline number ships a definition; search / sort / filter are all server-side |
| [`raw/live-directory-comparison.txt`](raw/live-directory-comparison.txt) §6–§7 | the same comparison against the **running** stack: **10 counters, `ALL_COUNTERS_MATCH: true`**, and `total_count` identical on pages 1, 2 and 3 of the same query |
| the harness journey 1 (below) | the rendered page: 25 rows on screen, a headline of 97, `page=2` on the wire, `Page 2 of N` from the server's own `totalPages`, and no row appearing twice |

**2. Ignored-field rejection — a field the contract does not implement is a 400
that names it, not a 200 that discards it.**

| Where | What it proves |
|---|---|
| `test_user_directory_9_3.py::TestIgnoredFieldsAreRejected` | 7 cases: the edit form's whole field set is implemented; an `email` + `phone` + `first_name` update **lands in the database**; an unsupported field is `UNSUPPORTED_FIELD` (400) naming it **and nothing else is applied**; a duplicate email is a 409 rather than a silent no-op; the role vocabulary is the platform hierarchy and is published; an unsupported role is a 400; a create with an unsupported field creates nothing |
| [`raw/live-directory-comparison.txt`](raw/live-directory-comparison.txt) §10–§11 | on the running stack: `code: UNSUPPORTED_FIELD  unsupported: ['nrc_number']` with `first_name` unchanged in psql, then an email + phone correction visible in psql |
| the harness journey 3 | an operator corrects an address in the edit dialog and finds the account under the new address; the same request with an extra field is refused on the wire |

**3. Import rollback — one bad row leaves the database exactly as it was, and the
preview said so first.**

| Where | What it proves |
|---|---|
| `test_user_directory_9_3.py::TestImportIsPreviewedTenantBoundAtomic` | 15 cases: the preview writes nothing and reports `would_commit: false` with the failing row's own line number; `all_or_nothing` rolls back **including the valid rows** and reports `created: 0` (not "how far it got"); `per_row` keeps the rows that worked; every created account gets an active membership; a missing school is `INSTITUTION_REQUIRED`; an out-of-scope school is masked 404; a role above the actor is a row error; **the preview and the commit produce identical codes and indices**; a replayed key imports once; a replay without a key creates nothing extra; an oversized batch and an unknown mode are refused; a generated password is never echoed |
| [`raw/live-directory-comparison.txt`](raw/live-directory-comparison.txt) §3–§4, §12 | on the running stack: 30 rows committed through the platform's own import; the same request with the same `Idempotency-Key` returns the first response and the database still holds 30; then a 2-row file with one bad row → `committed: False  created: 0  rolled_back_reason: INVALID_ROWS`, `profiles before=127 after=127`, and the *valid* row's existence count is `0` |
| the harness journeys 4 and 5 | the operator's view: the preview names row 2, the commit button is **disabled** because the server said the batch would do nothing, the failures download as a CSV, and afterwards neither the bad row nor the good one exists. Then a clean file commits and the created account is bound to the chosen school |

**4. An audited export E2E — the whole filtered set, capability-gated, and
recorded without recording an applicant.**

| Where | What it proves |
|---|---|
| `test_user_directory_9_3.py::TestExportIsPageIndependentAndAudited` | 8 cases: the export row count equals the directory's `totalCount` while `page`/`pageSize` are supplied; the same filters apply; a read-only actor gets `can_export: false`, a **403**, and an `auth.denied` row; an over-limit export is `EXPORT_TOO_LARGE` rather than truncated; the audit row carries counts + filters and **no exported address**; `?export=csv` and `/export/` return byte-identical CSV; a tenant actor's CSV header omits the platform-only columns; the export capability is one the catalogue already had |
| [`raw/live-directory-comparison.txt`](raw/live-directory-comparison.txt) §8, §13–§14 | on the running stack: `export(no page)` and `export?page=3&pageSize=5` both return **127 data rows** against a `totalCount` of 127; the `user.exported` audit row records `row_count: 127`, `row_limit: 5000`, `page_independent: true`, and the applied filters; and **`audit rows containing an email address: 0`** |
| the harness journeys 6 and 7 | standing on page 2, the export downloads 97 rows, `page=` is absent from the request, and the audit row is readable through the platform's own audit endpoint. A read-only actor is not offered the button and is refused by the endpoint |

Why the browser is required for all four: **every defect in ADM-03/ADM-04 was a
rendering or wiring defect.** The endpoint always knew the total; the browser
recounted the rows it had. The dialog always showed a preview; it just was not a
statement about the file. Two of the defects this run fixed were found *only* by
running the browser (§12).

### The 8 required journeys

[`admin-user-directory.spec.ts`](../../../apps/admissions/tests/harness-e2e/required/admin-user-directory.spec.ts)
— **8 journeys × 2 viewports = 16, all passing on a freshly wiped harness with
zero skips** ([`raw/harness-user-directory-journeys.txt`](raw/harness-user-directory-journeys.txt)):

| Journey | The claim it settles |
|---|---|
| **page 2** | 30 seeded accounts, 25 on screen: the rows change, the headline total does not, `page=2` is on the wire in the registered spelling, and `Page 2 of N` is the server's `totalPages` |
| **facets** | the role select carries **whole-set counts**; filtering to reviewers moves the total to that exact count and the select **still** offers `Student` — a pick list harvested from the loaded rows can do neither |
| **ignored-field rejection** | an email correction lands and is findable; a request naming `nrc_number` is a 400 that names it |
| **import rollback** | the preview says the batch would not commit, names row 2 with `UNSUPPORTED_ROLE`, **disables the commit**, downloads the failures as `user-import-errors.csv`, and afterwards neither row exists |
| **import commit** | a clean file commits, `created: 1 / failed: 0`, and the account is found under `has_membership=true` — the ADM-04 binding |
| **audited export** | from page 2: 97 CSV rows for a 97-account directory, no `page=` on the request, and a `user.exported` audit row with the right count and no address |
| **export authority** | a read-only actor reads the directory, is **not offered** the export, and is refused by the endpoint with `INSUFFICIENT_PERMISSIONS` |
| **bulk command** | one selected account, a typed confirmation code, **exactly one** request to `/users/bulk/`, "Bulk change applied", and the role changed in the database |

## What this task establishes

1. **The totals are the server's.** `Users.tsx` fetched one bare server page and
   then ran `filter`, `sort`, `slice` and `.length` over the array it had,
   publishing those lengths next to a label that said "active accounts". There
   are now SQL counters over the whole filtered set, each with a sentence, and
   the page contains no client-side filtered list, no client-side ordering, and
   no windowing (§1).
2. **The filter options are the server's.** The role select was a hardcoded
   catalogue and the counts came from the loaded rows. Facets are SQL `GROUP BY`
   over the same filtered set, each option carrying its own count, with its own
   dimension left open so a filter can always be widened again (§2).
3. **An ignored field is rejected.** `AdminUserUpdateSerializer` declared five
   fields; the edit form sent seven. `email` and `phone` were dropped inside a
   `200 OK`, so an operator who corrected a typo was told it worked. There is now
   one field contract, and a field outside it is a 400 that names it (§3).
4. **The role vocabulary has one source.** A form enum, a serializer
   `ChoiceField`, and `ROLE_HIERARCHY` were three lists that could disagree.
   `SUPPORTED_ROLES` is **derived** from the hierarchy, published on the report,
   and drift-guarded from the frontend by a test that parses `permissions.py`
   (§4).
5. **An import states what it will do before it does it.** One validator serves
   the preview and the commit, so "what the preview said" and "what the commit
   did" cannot disagree; and the answer includes `would_commit` (§5).
6. **Atomicity is declared, not assumed.** `all_or_nothing` (default) or
   `per_row`. Per-row savepoints run in both modes — in one they preserve the
   surviving rows, in the other they preserve the *diagnosis* (§6).
7. **An imported account belongs to a school.** ADM-04's output was profiles with
   a role string and **zero** tenant capabilities. The import is tenant-bound and
   creates the membership in the same transaction (§7).
8. **A row failure is addressable and downloadable.** Stable codes, 1-based row
   numbers matching the operator's file, and a CSV they can open next to it — the
   pre-9.3 response reported `{"index": null}` (§8).
9. **A bulk change is one command.** It was a browser `for` loop of N `PATCH`
   calls with a confirmation token computed and checked in the same browser. It
   is one authorized, bounded, all-or-nothing, session-revoking, audited request,
   and the token is verified server-side (§9).
10. **The export is page-independent, bounded, and audited.** The browser-side
    `UserExport.tsx` exported its `users` prop — the loaded page — in four
    formats. It is deleted (§10).
11. **The audit trail stops holding addresses.** The batch-import row wrote
    `created_emails`, a list of real addresses, into `audit_logs`. It writes
    fingerprints (§11).
12. **Authority is a capability, and scope precedes lookup.** The directory moved
    off `platform.user.manage_all` onto `tenant.staff.read` / `tenant.staff.invite`
    / `tenant.staff.disable`, and the detail fetch goes *through* the scoped
    queryset rather than fetching and then comparing. **This is a documented
    contract strengthening** with the consequences recorded in §13.

## Files

```
docs/v2-evidence/9.3/
├── README.md                                        ← this index
└── raw/
    ├── accounts-authority-suites.txt                    (40 failed / 801 passed / 6 skipped / 6 errors)
    ├── accounts-authority-suites-baseline.txt           (the SAME suites, 9.3 removed: 43 / 736 / 6 / 6)
    ├── user-directory-suite.txt                         (the task's own 63-case suite, verbose)
    ├── frontend-test.txt                                (whole suite: 1 pre-existing failure / 4013 passed; middle of the log elided)
    ├── frontend-lint.txt                                (20 errors)
    ├── frontend-lint-files.txt                          (the 17 files those errors are in — none of them this task's)
    ├── frontend-build.txt                               (exit 0, incl. tsc + CSP gate)
    ├── django-check.txt                                 (no issues)
    ├── spectacular.txt                                  (3 warnings / 116 errors — unchanged)
    ├── live-directory-comparison.txt                    (the payload, 10 counters vs psql, import replay, rollback, and the audit trail, on the running stack)
    └── harness-user-directory-journeys.txt              (16 passed — 8 journeys × desktop + mobile, fresh harness)
```

Source of the change:

| Path | What it is |
|---|---|
| `backend/apps/accounts/user_directory_service.py` | **new** — `UserDirectoryQueryService`: the one directory query authority. `SUPPORTED_ROLES` derived from `ROLE_HIERARCHY`, `CREATE_FIELDS`/`UPDATE_FIELDS`/`IMPORT_ROW_FIELDS` + `reject_unsupported`, `REGISTERED_PARAMETERS`, `SORT_FIELDS`/`SORT_ALIASES`, `scoped_users`/`resolve_user`/`resolve_institution_filter` (scope before lookup), SQL filters, SQL aggregates + `aggregate_definitions`, SQL facets, `UserRedactionPolicy`, `EXPORT_ROW_LIMIT`, `email_fingerprint`, `split_full_name` |
| `backend/apps/accounts/user_import_service.py` | **new** — `UserImportService`: `resolve_mode`, `resolve_institution` (tenant binding), `plan` (the single validator), `commit` (declared atomicity, per-row savepoints), `ImportPlan`/`ImportResult`/`RowError`, `ROW_ERROR_CODES`, and the two audit writers |
| `backend/apps/accounts/user_bulk_service.py` | **new** — `UserBulkService`: one all-or-nothing role/status command, `MAX_BULK_SIZE = 25`, `confirmation_token_for`, per-target error codes, session revocation, audit |
| `backend/apps/accounts/user_directory_views.py` | **new** — `AdminUserListView` (GET report + POST create), `AdminUserDetailView` (GET/PATCH), `AdminUserExportView`, `AdminUserBulkView`, `AdminUserImportPreviewView`, `AdminUserBatchImportView`, `FACET_OPEN_DIMENSIONS`, `ACTION_USER_EXPORTED`, the shared `_export_response`, and `_require_capability` for the deactivation grant |
| `backend/apps/accounts/admin_user_views.py` | the three rewritten views removed and re-exported from the new module; the imports they alone needed removed |
| `backend/apps/accounts/batch_views.py` | reduced to a documented re-export shim (`BatchUserImportView` → `AdminUserBatchImportView`, `MAX_BATCH_SIZE` → `IMPORT_MAX_ROWS`, `VALID_ROLES` → `SUPPORTED_ROLES`) |
| `backend/apps/accounts/admin_urls.py` | `users/bulk/`, `users/batch-import/preview/` added; preview declared before the commit route |
| `backend/tests/unit/test_user_directory_9_3.py` | **new** — 63 cases (§14) |
| `backend/tests/unit/test_admin_user_management_hardening.py` | `TestAdminUserDetailHardening` moved (its three guards now run against real rows in the new suite); `TestBatchUserImportHardening` rewritten against the service, incl. "the audit row carries no address" (§13.3) |
| `backend/tests/unit/test_admin_serializers.py` | the six retired `BatchUserItemSerializer` cases replaced by the contract they became: a derived role vocabulary, an explicit row-field set, the published row limit, the declared modes, the stable error codes, and the shim (§13.3) |
| `backend/tests/unit/test_unscoped_endpoint_guard.py` | GAP-9/GAP-10 re-pinned onto `user_directory_views.py` (list, export, detail, bulk, `_ImportBase`), and the service names added to `_SCOPE_SEAM_TOKENS` — the seam moved from "an id set compared after the fetch" to "a service that scopes the queryset" |
| `backend/tests/unit/test_view_auth_classification.py` | the six new view classes classified as protected |
| `scripts/authority_matrix_registry.py` | the six user routes re-registered with their capabilities, their tenant object paths, their idempotency, their audit events, and `not_found_mask_then_non_revealing_403` |
| `apps/admissions/src/services/admin/userDirectory.ts` | **new** — the report read, the page-independent export path + download, create/update/deactivate on the endpoint's own field names, the bulk command with a server-verified token, `previewImport`/`commitImport` with an `Idempotency-Key`, and `importErrorsToCsv`/`downloadImportErrors` |
| `apps/admissions/src/hooks/admin/useUserDirectory.ts` | **new** — React Query hooks whose key is the whole server query; the import commit invalidates only when it committed |
| `apps/admissions/src/pages/admin/Users.tsx` | rewritten: one scoped query, server aggregates as the page metrics with their definitions as helper text, facet-sourced role options, server page arithmetic, the unknown-parameter notice, and an export gated on `can_export` |
| `apps/admissions/src/pages/admin/lib/usersReducer.ts` | the filter slice became the **server query**: `activeFilter` / `membershipFilter` / `institutionId`, registered backend sort keys, `toDirectoryQuery`, `SORTABLE_COLUMNS` |
| `apps/admissions/src/data/users.ts` | `useList()` deleted; the write hooks send the endpoint's field contract and invalidate the directory prefix |
| `apps/admissions/src/components/admin/UserStats.tsx` | rewritten to take the server's aggregates + definitions; `formatStat` renders `Unknown` for an absent count and `0` only for a measured zero; a percentage of zero accounts is `—`, not `0%` |
| `apps/admissions/src/components/admin/UserImport.tsx` | rewritten: parse → **preview** → commit, with a required school, a declared mode, row failures addressed by line number and downloadable, and no browser-side validation |
| `apps/admissions/src/components/admin/BulkUserOperations.tsx` | rewritten onto the one server command; the outcome survives until the operator dismisses it (§12.3) |
| `apps/admissions/src/components/admin/UserExport.tsx` | **deleted** — it exported the loaded page (R6.5) |
| `apps/admissions/src/components/admin/UserRowCard.tsx` | `data-user-row-id` on both layouts so a journey addresses the row the server returned |
| `apps/admissions/src/components/admin/users/UsersTableSection.tsx` | the sort headers now carry registered backend keys |
| `apps/admissions/src/contexts/CapabilityContext.tsx` | exposes the already-fetched, already-scoped `institutions` (id/code/name) so the import's school picker does not need a second institution read with different authority |
| `apps/admissions/tests/unit/userDirectoryServerOwned.test.tsx` | **new** — 18 cases; parses the backend service, `permissions.py`, and `user_bulk_service.py`, so the parameter set, sort keys, role vocabulary, and token construction cannot drift |
| `apps/admissions/tests/harness-e2e/required/admin-user-directory.spec.ts` | **new** — the 8 required browser journeys, desktop and mobile |
| `apps/admissions/tests/unit/adminUserImportEndpointConsistency.test.ts`, `.../unit/page-verification/admin-users.test.tsx`, `.../property/admin-users-reducer.property.test.ts`, `.../unit/architectureEnforcement.test.ts` | assertions that pinned the retired shapes, updated (§13.3) |
| `docs/canonical-truth-map.md` | "Admin user directory contract" — the query authority, registered parameters, role and field contracts, sort allow-list, aggregates, facets, derived display name, import command/atomicity/binding/errors/replay, bulk command and token, export authority/ceiling/audit, redaction, disclosure, and the drift guards |

---

## 1. The totals are the server's (R6.1, ADM-03)

### 1.1 What the browser used to do

```tsx
// pages/admin/Users.tsx, before
const { data: usersData } = userQueries.useList()        // no arguments: page 1
const users = (usersData?.users || []) as UserProfile[]
const filteredUsers = useMemo(() => { /* .filter(...) over `users` */ }, …)
const sortedUsers   = useMemo(() => [...filteredUsers].sort(…localeCompare…), …)
const totalPages    = Math.max(1, Math.ceil(sortedUsers.length / PAGE_SIZE))
const paginatedUsers = sortedUsers.slice(start, start + PAGE_SIZE)
…
metrics={[{ label: 'Users', value: totalCount, helper: `${filteredCount} currently match filters` }, …]}
description={`${filteredCount} of ${totalCount} active accounts are currently shown.`}
```

Five separate answers derived from one page of twenty rows: which accounts match
a search, in what order, on which page, how many there are, and how many pages
there are. `totalCount` came from the server, so on a directory of 97 accounts the
page said "20 of 97 active accounts are currently shown" and offered exactly one
page — the other 77 were unreachable.

### 1.2 What runs now

One request, and every number in the answer:

```json
{"page": 3, "pageSize": 5, "totalCount": 97, "totalPages": 20,
 "aggregates": {"total_count": 97, "enabled_count": 97, "disabled_count": 0,
                "with_membership_count": 96, "without_membership_count": 1,
                "staff_without_membership_count": 0,
                "role_breakdown": {"student": 73, "reviewer": 19, "admin": 4, "super_admin": 1}},
 "aggregate_definitions": {"total_count": "Accounts matching the current filters, in your scope.", …}}
```

The page holds no `filteredUsers`, no `sortedUsers`, no `slice`, no `Math.ceil`
and no `localeCompare` — asserted by a source scan
(`userDirectoryServerOwned.test.tsx`), because the defect was structural rather
than arithmetic.

`staff_without_membership_count` deserves its own mention: it is the **ADM-04
population**, and it did not previously have a number anywhere. A staff account
with no active membership holds zero tenant capabilities, so it can sign in and
find nothing. Now an operator can filter for exactly that set
(`has_membership=false`) and see how large it is.

## 2. The filter options are the server's (R6.1, ADM-03)

The role select was `AVAILABLE_ROLES` — a hardcoded catalogue with no counts —
and `UserStats` derived a role distribution from a *second* one-page fetch, so the
select and the distribution could describe different data.

Facets are now SQL `GROUP BY` over the same scoped, filtered set, with **each
dimension's own filter left open** (`FACET_OPEN_DIMENSIONS`), so filtering to
`role=admin` still offers `reviewer`:

```
role           truncated=False  student=73, reviewer=19, admin=4, super_admin=1
is_active      truncated=False  Enabled=97
institution    truncated=False  KATC=95, MIHAS=1
```

The `institution` facet is joined from `user_institution_memberships` rather than
read off a column, because an account may belong to more than one school — which
the pre-9.3 page had no way to express at all.

Three filtered queries per request is the cost, stated rather than measured
against a target; the perf lane owns budgets.

## 3. An ignored field is rejected (R6.2, ADM-03)

`AdminUserUpdateSerializer` declared `role`, `is_active`, `first_name`,
`last_name`, `password`. The edit form sent `full_name`, `email`, `phone`, `role`.
So `email` and `phone` were **accepted with a 200 and discarded** — the shape of
finding ADM-03's second sentence. An operator correcting a typo in an address was
told the update succeeded.

The contract is now three explicit sets (`CREATE_FIELDS`, `UPDATE_FIELDS`,
`IMPORT_ROW_FIELDS`) and one enforcement point:

```python
UserDirectoryQueryService.reject_unsupported(payload, UPDATE_FIELDS)
# → UnsupportedUserField → 400 {"code": "UNSUPPORTED_FIELD",
#                               "data": {"unsupported_fields": ["nrc_number"]}}
```

Rejection is **whole-request**: the supported half is not applied either, because
a partially-applied update is the same problem in a smaller form. Asserted on
both sides — `test_an_unsupported_field_is_rejected_and_named` reads the row back
to confirm nothing changed, and the live run shows `first_name` still `Live` in
psql after the refusal.

`_validate_identity` is hand-rolled rather than a second `Serializer` on purpose:
a serializer with its own `ChoiceField` role list is precisely the third
disagreeing copy of the vocabulary that AUTH-04 is about.

## 4. The role vocabulary has one source (R6.2, AUTH-04)

```python
SUPPORTED_ROLES: tuple[str, ...] = tuple(
    role for role, _level in sorted(ROLE_HIERARCHY.items(), key=lambda item: item[1])
)
```

Derived, not restated — so the create validator, the update validator, the
import's per-row check, the bulk command, and the generated OpenAPI enum all read
the platform's own hierarchy. It is published on the report as `supported_roles`
so the form reads the server's list, and two drift guards parse the source: one
in the backend suite, one in the frontend suite reading `permissions.py`.

Ordered least → most authority rather than by set iteration, so the enum and the
rendered select are deterministic across processes.

Sorting by role sorts by **authority**, not the alphabet: `role_rank` is
`ROLE_HIERARCHY` expressed as a SQL `CASE`, so ascending gives
super_admin → admin → reviewer → student. Alphabetically it would be
admin → reviewer → student → super_admin, which is a fact about English.

## 5. An import states what it will do before it does it (R6.4, ADM-04)

The pre-9.3 "preview" parsed the CSV in the browser, showed the **first five
rows** as a courtesy, and enabled the import button. Whether row 340 carried an
unsupported role was discovered by importing it.

`UserImportService.plan` is now the **single validator**, and both endpoints run
it:

| Route | What it does with the plan |
|---|---|
| `POST /admin/users/batch-import/preview/` | returns it. Writes nothing |
| `POST /admin/users/batch-import/` | returns it, then applies it |

There is no second code path for the commit to disagree with, and
`test_the_preview_and_the_commit_share_one_validator` asserts the codes *and the
indices* match between the two. The answer carries `would_commit`, and the
dialog's commit button is `disabled={!preview?.would_commit}` — so the preview is
load-bearing rather than decorative.

## 6. Atomicity is declared, not assumed (R6.4)

R6.4 asks the import to "apply atomically **per declared mode**", which is the
reconciliation of two things that otherwise conflict: all-or-nothing, and
per-row error reporting.

| Mode | Behaviour |
|---|---|
| `all_or_nothing` (default) | one transaction. Any invalid row, or any write-time conflict, and **nothing** is created |
| `per_row` | a savepoint per row. A duplicate-email race on one row does not discard the rest |

Per-row savepoints run in **both** modes, for different reasons: in `per_row`
they preserve the surviving rows, and in `all_or_nothing` they preserve the
*diagnosis* — an `IntegrityError` leaves a transaction unusable, so without a
savepoint the service could not name the row that collided before rolling back.
This is the steering rule ("per-row savepoints must handle IntegrityError races
without discarding the whole batch") and the requirement's atomicity, satisfied
together rather than one at the other's expense.

An unrecognised mode is **refused** (`INVALID_IMPORT_MODE`) rather than
defaulted: the caller expressed an intent about a bulk write and the platform
does not get to substitute a different one.

The live run shows the default at work: two rows, one invalid, →
`committed: False  created: 0  rolled_back_reason: INVALID_ROWS`, and
`profiles before=127 after=127` with the valid row's existence count at `0`.

## 7. An imported account belongs to a school (R6.4, ADM-04)

The pre-9.3 loop was `Profile.objects.create(...)` and nothing else. Tenant
authority comes **only** from an active membership, so an imported `admin` had the
role string and zero capabilities — an account that can sign in and see nothing.

`institution_id` is now **required**, resolved through
`visible_institution_queryset` before any write, and the membership is created in
the same transaction as the account:

```python
with transaction.atomic():                    # the batch
    with transaction.atomic():                # this row's savepoint
        profile = Profile.objects.create(...)
        UserInstitutionMembership.objects.create(
            user_id=profile.pk, institution_id=plan.institution_id,
            role=row.role, is_active=True, created_by_id=actor_id)
```

The per-row role ceiling is `AdminCapabilityService.can_invite_staff(actor,
institution, role)` — both halves of it, the hierarchy ceiling *and* the
per-institution invite capability — checked **per row**, so a file that slips one
`super_admin` into ninety-nine students fails on that row rather than being
admitted because the first row looked harmless.

**This makes the import stricter than it was**, and the strengthening is recorded
in §13.1.

## 8. A row failure is addressable and downloadable (R6.4)

The pre-9.3 write-time failure was:

```json
{"index": null, "email": "…", "errors": {"email": ["Already exists"]}}
```

`"index": null` — the operator was told that *something* in a hundred-row file
was a duplicate. And the validation-time indices were zero-based positions in the
*filtered* list, which corresponds to no line in anything they could open.

Row numbers are now **1-based and stable**: index 1 is the first data row of the
operator's file, whether the failure came from validation or from a write-time
race. Each carries a stable code from `ROW_ERROR_CODES`, so failures can be
filtered, counted, and fixed in bulk, and `downloadImportErrors` renders them as
a CSV with `row,code,field,email,message` — R6.4 asks for *downloadable* row
failures, and a list in a dialog the operator then closes is not one.

One consequence worth naming: the address travels in the **response** (the
operator uploaded it; they already know it) and never into the **audit row**,
where only a fingerprint goes (§11).

## 9. A bulk change is one command (R6.5, ADM-03)

### 9.1 What it was

```ts
// useUserManagement.ts, before
for (const userId of userIds) {
  const success = await updateUser(userId, { role: newRole })
  if (success) result.success++; else { result.failed++; result.errors.push(…) }
}
```

Twenty-five role changes were twenty-five unrelated events: no single decision to
authorize, audit, rate limit, or replay; no way to be atomic, so a dropped
connection left half the selection changed with the only record of which half in a
dialog that then closed; and the SHA-256 confirmation token was computed in the
browser and compared in the browser, so it guarded against a mis-click and
nothing else.

### 9.2 What it is

`POST /api/v1/admin/users/bulk/` — `{operation, user_ids[], role?,
confirmation_token}`. One transaction, all-or-nothing, `MAX_BULK_SIZE = 25` (the
same batch budget `ApplicationBulkStatusView` already uses), the selection
narrowed through `scoped_users` **before** any write, per-target error codes, and
`revoke_sessions_for_authority_change` for every account whose authority moved.

The token is the **same construction** the applications bulk command uses —
SHA-256 over the sorted ids plus the operation and role — now **verified
server-side**, which is what turns it from a mis-click guard into part of the
command's identity: a token computed for one selection cannot authorise a
different one. The frontend mirror is drift-guarded against the backend source.

There is deliberately **no per-target mode** here, unlike the import. An import is
a create, and a partially-created batch is recoverable by importing the rest. A
bulk authority change is not: an operator who asked for twenty-five reviewers and
got nineteen cannot tell which six without re-reading the directory, and in the
meantime six people hold authority the operator believes they removed.

`deactivate` is also not `delete`. The old method was `bulkDeleteUsers`, and it
deactivated — a name promising something the platform must never do, because
applications, documents, and audit rows are attached to the account.

## 10. The export is page-independent, bounded, and audited (R6.5)

`UserExport.tsx` took a `users: UserProfile[]` prop — the rows the page had
loaded — offered CSV / JSON / Excel / PDF, sixteen selectable fields, and its own
role and date filters applied to that array. Its preview said "N users will be
exported" where N was the count of the loaded page after browser filtering. It is
**deleted**.

The export is now `GET /api/v1/admin/users/export/` (with
`GET /api/v1/admin/users/?export=csv` as a second spelling of the *same*
implementation): the same filters as the directory, the whole filtered set, the
capability-driven redaction, `EXPORT_ROW_LIMIT = 5000` with `EXPORT_TOO_LARGE`
rather than a silent truncation, and one `TenantAuditService.record_export` row
recording the actor, the institution scope, the filters, the row count against
the ceiling, and what redaction withheld — never the rows.

`page`/`pageSize` are dropped from the request by construction, so an export
pressed from page 2 and one pressed from page 1 are the same document. The live
run shows both returning 127 rows for a 127-account directory.

One thing this cost, and it is worth recording because it was invisible to every
other layer: the service originally sent `Accept: text/csv`, which **DRF rejects
with a 406 before the view runs** — no CSV renderer is configured. The download
never reached the handler. Found by the browser journey; fixed by not overriding
`Accept` at all, since the response's own `Content-Type` and
`Content-Disposition` are what make it a download. Task 9.1's roster export has
the same header and is therefore latently affected; that is recorded in §15 rather
than changed here.

## 11. The audit trail stops holding addresses (R6.5)

The pre-9.3 batch-import audit row was:

```python
changes={"created_count": created, "skipped_count": len(errors),
         "created_emails": created_emails}          # ← real addresses
```

The shared redactor (`PaymentAuditService._redact_pii`) masks phone / NRC /
passport / document bodies; it does **not** mask email, because email is not
usually a value one wants hashed. So a list of real addresses was persisted into
`audit_logs` under a 365-day retention window, and an address cannot be
un-persisted later.

The action string `user_batch_import` is preserved — an existing operational query
reads it — and the payload now carries `created_email_hashes`
(`email_fingerprint`: the first 16 hex chars of a SHA-256), the mode, the outcome,
the counts, the created ids, and per-row error **codes**. An operator
investigating a batch needs to know which rows failed and why; they do not need
the trail to hold the addresses.

The live run asserts it directly: **`audit rows containing an email address: 0`**
across `user_batch_import`, `user.exported` and `user_bulk_updated`.

## 12. Two defects only the browser found

Both were invisible to the API tests, which is the reason the required evidence
asks for a browser.

**12.1 The name the table renders was not searchable.** `display_name` is a
derived SQL column (`full_name`, else the first/last pair, else the email), and
the search covered the *stored* columns only. An account created by the import as
`first_name='Directory'` / `last_name='Person 07'` renders as "Directory Person
07" and searching that string matched **neither** stored field. An operator could
read a name off the table and fail to find it. Fixed by searching
`display_name__icontains` as well; pinned by
`test_search_covers_the_name_the_table_renders`.

**12.2 The export 406'd.** See §10.

**12.3 The outcome of a command was destroyed by its own success.** Two instances
of one habit. The import dialog's `onImportComplete` closed the dialog, so the
result screen — including the downloadable row failures R6.4 requires — was
unmounted the moment it had something to say. And `BulkUserOperations` renders
only while something is selected, so clearing the selection on success unmounted
the component holding the result. Both now refresh the data immediately and
release the dialog (and the selection) only when the operator dismisses it.

## 13. Contract strengthenings, and what they cost

Three, each recorded rather than absorbed.

### 13.1 The import requires a school

The pre-9.3 endpoint accepted a bare JSON array with no institution. It now
requires `institution_id` and refuses without it (`INSTITUTION_REQUIRED`, 400).

That is stricter, and it is the point: R6.4 asks the import to "require the
intended memberships", and ADM-04 is that it did not. A platform-global account
with no tenant is still creatable — through the single-user create command, where
the decision is visible one account at a time rather than a hundred at once.

A pre-9.3 client posting a bare array is still parsed (so an in-flight deploy does
not drop an operator's file) and then refused with the actionable code rather than
a parse error.

### 13.2 The directory's authority moved from platform to tenant capabilities

The routes were gated on `platform.user.manage_all` / `platform.user.create_global`.
In the capability model those are held **only** by a Super_Admin (or the dev/test
`all_access` compat branch), so under production scope the entire user directory
was super-admin-only — and the membership narrowing inside it
(`_scoped_user_ids`) was unreachable defensive code. R6.1 asks for a directory
that "preserves tenant scope in every request", which presupposes an actor who
*has* tenant scope.

Read authority is now `tenant.staff.read` (already in the default tenant read
bundle), write authority is `tenant.staff.invite`, and a deactivation
additionally requires `tenant.staff.disable` — checked from the body rather than
the method, because whether a request removes access depends on what it contains.
Export authority stays `tenant.application.export`. **No capability was
invented**; the catalogue stays at 17 + 17.

Two consequences:

- **The role ceiling became reachable.** With platform-only gating, only a
  super_admin could PATCH, and a super_admin can never breach the ceiling — so
  the AUTH-04 guards were dead code on this endpoint. They are now exercised by a
  real Tenant_Admin in `TestRoleCeilingAndSelfDeactivation`.
- **Ordering matters, and is deliberate.** A role-ceiling breach is a **403**
  even for an out-of-scope target, because the *role* is the problem and the
  refusal discloses nothing about any tenant. An out-of-scope target with an
  otherwise-legal change is a masked **404**.
  `test_the_ceiling_is_checked_before_the_scope_mask` pins both.

### 13.3 Four test files pinned shapes that no longer exist

| File | What changed |
|---|---|
| `test_admin_user_management_hardening.py` | `TestAdminUserDetailHardening` drove the view from a `SimpleTestCase` with `@patch("…Profile.objects.get")` and a `SimpleNamespace` target. That worked while the view fetched the row and *then* compared it against a scope set; the scope is now part of the query (`resolve_user`), because a row already in memory can be confirmed to exist by any later divergence in the response. The three guarantees moved to real rows in the new suite — and they had already begun failing on `DatabaseOperationForbidden` in the baseline. `TestBatchUserImportHardening` was rewritten against the service, and now additionally asserts the audit row carries no address |
| `test_admin_serializers.py` | six cases exercised `BatchUserItemSerializer` / `BatchUserImportRequestSerializer`. A DRF `Serializer` with its own `ChoiceField` role list was the third disagreeing copy of the vocabulary, and it could not do R6.4's job — a row valid *in isolation* still has to be checked against the actor's ceiling for the target school, against the other rows, and against the accounts that already exist. Replaced by the contract they became |
| `page-verification/admin-users.test.tsx` | mocked `usersData.useList` and asserted "Active user directory". Now mocks the directory report, and additionally pins the two claims a rendered page can make about ADM-03: the headline is the server's aggregate (57) and not the page length (2), and the role options carry whole-set counts |
| `adminUserImportEndpointConsistency.test.ts` | asserted the dialog contained the endpoint literal. Correct while the dialog held the endpoint; the wrong check now, because the dialog holding it is the finding. The endpoints are pinned in the service, and the dialog is asserted **not** to hold an endpoint, a role list, or its own validation |
| `architectureEnforcement.test.ts` | `UserImport.tsx` came off the raw-client allowlist — it no longer imports the raw client, and the test correctly fails on a stale allowlist entry |
| `admin-users-reducer.property.test.ts` | the sort-field names are registered backend keys now; three new cases assert `toDirectoryQuery` emits only registered parameters and that an unset tri-state filter is **absent** rather than guessed |
| `test_unscoped_endpoint_guard.py` / `test_view_auth_classification.py` | the GAP-9/GAP-10 pins and the protected-view list follow the views to their new module; the guard's `_SCOPE_SEAM_TOKENS` gained the service names, because the seam is now a service rather than an id set |

## 14. The task's own backend suite

`tests/unit/test_user_directory_9_3.py` — **63 passed**, every case under the
`production_scope` fixture so what is measured is the real membership/grant-derived
capability model and never a test-settings shortcut
([`raw/user-directory-suite.txt`](raw/user-directory-suite.txt)):

| Class | Cases | What it settles |
|---|---|---|
| `TestPageTwoAndBeyond` | 7 | paging is total and non-repeating; **every aggregate against hand-written SQL** read from page 3 of a 3-row page; every number states what it counts; search/sort/filters are the server's; an unregistered parameter is echoed; every sort key ends in a total tie-break |
| `TestFacetsAreWholeSetAndOpen` | 4 | a facet offers a value not on this page; a narrowed query still offers the other values; a facet count is a SQL count over the filtered set; every open dimension names a real filter field |
| `TestIgnoredFieldsAreRejected` | 7 | the edit form's fields are all implemented; email and phone actually change; an unsupported field is named **and nothing is applied**; a duplicate email is 409; the roles are the hierarchy and are published; an unsupported role is 400; a create with an unsupported field creates nothing |
| `TestRoleCeilingAndSelfDeactivation` | 4 | the three AUTH-04 guards against real rows, plus the deliberate ordering of the ceiling and the scope mask |
| `TestScopePrecedesLookup` | 5 | another tenant's account masked identically to an unknown one; their accounts never reach the list or the count; an out-of-scope institution filter masked **and audited without disclosing what was probed**; the platform-only columns withheld; no role string compared in the service or the views |
| `TestImportIsPreviewedTenantBoundAtomic` | 15 | the whole of §5–§8 and §11 (listed above) |
| `TestBulkIsOneServerCommand` | 7 | one command applies; a token for a different selection is refused **server-side**; one refused target stops everything; the role ceiling; self-deactivation; the size bound; the audit without PII |
| `TestExportIsPageIndependentAndAudited` | 8 | the whole of §10 (listed above) |
| `TestTheServiceIsTheOneAuthority` | 6 | one display name computed in SQL; sorting by role sorts by authority; a NULL `is_active` is enabled, not invisible; `staff_without_membership_count` names the ADM-04 population; the envelope and pagination shape preserved; the JSON row and the CSV header share one column set |

## 15. Verification (verbatim)

### 15.1 Backend accounts / authority suites, against a measured baseline

`cd backend && DATABASE_URL=<localtest 5433> TESTING=1 python3 -m pytest $(ls tests/unit/*.py tests/property/*.py | grep -iE "account|user|admin|auth|catalog|capabilit|permission|tenant|scope|import|batch") -q --tb=no -rfE -p no:randomly`
— 86 suite files, against the isolated `mihas-localtest` Postgres. Neon and
production were not touched.

| Run | Result |
|---|---|
| **baseline** — 9.3 removed (the four new backend modules moved aside, `admin_user_views.py` / `batch_views.py` / `admin_urls.py` / the registry / the four test files reverted) | **43 failed, 736 passed**, 6 skipped, 6 errors |
| **9.3** | **40 failed, 801 passed**, 6 skipped, 6 errors |

[`accounts-authority-suites.txt`](raw/accounts-authority-suites.txt) /
[`…-baseline.txt`](raw/accounts-authority-suites-baseline.txt). A *measured*
baseline, not an argument: the failing + erroring sets were diffed by name.

- **New failures: 0.** `comm -13` over the two sorted 49-entry / 46-entry sets is
  empty.
- **Resolved: 3** — the three `TestAdminUserDetailHardening` cases, which now run
  against real rows (§13.3).
- **+65 passing**: this task's 63-case suite plus the two rewritten
  `TestBatchUserImportHardening` cases.

The remaining 40 failures and 6 errors are the pre-existing clusters catalogued in
[9.2 §11.1–11.2](../9.2/README.md) and [9.1 §8.1–8.3](../9.1/README.md). Because
this task edits three drift guards, they deserve naming rather than being left
inside a count:

- `test_authority_matrix_v2.py::test_no_stale_registry_entries` and
  `::test_zero_unclassified_gate_passes_on_live_surface` fail in **both** runs,
  and the failure is the de-AI lane's two deleted routes
  (`/applications/<id>/admin-summary/`, `/applications/<id>/preview-summary/`)
  still being registered — verified by reading the assertion output. The six user
  routes this task rewrote are **not** among the stale entries, and
  `test_every_route_in_target_seven_or_approved_boundary` and
  `test_no_unregistered_admissions_route` **pass** with the new entries.
- `test_unscoped_endpoint_guard.py`'s two failures are down to four violations,
  all in other lanes' files (`interview_views.py`, `student_withdrawal_views.py`,
  `admin_amendment_views.py`). All six of this task's pins are green.
- `test_view_auth_classification.py::test_all_api_views_are_classified` is down to
  two unclassified classes, both from other lanes
  (`admin_query_views.AdminApplicationQueryView` — task 9.1;
  `student_document_views.ApplicationRequiredDocumentsView` — task 7.2). All six
  of this task's view classes are classified. Those two are deliberately **not**
  added here: registering another task's view would hide that it was omitted.

### 15.2 Frontend gates

| Gate | Result | Artifact |
|---|---|---|
| `bun run test` | **1 failed / 4013 passed / 1 skipped** (468 files) — the single failure is the pre-existing `authPageFormMarkup` copy conflict | [`frontend-test.txt`](raw/frontend-test.txt) |
| `bun run lint` | **20 errors, 0 warnings** across **17 files** — one *fewer* than 9.2's 21 errors / 18 files, and the file that came off the list is `src/components/admin/UserImport.tsx`. **None of the 20 is in a file this task touched** | [`frontend-lint.txt`](raw/frontend-lint.txt), [`frontend-lint-files.txt`](raw/frontend-lint-files.txt) |
| `bun run build` | **exit 0** (includes `tsc -p tsconfig.build.json --noEmit`, `vite build`, and the CSP gate) | [`frontend-build.txt`](raw/frontend-build.txt) |

The pre-9.3 frontend baseline is [9.2 §11.3](../9.2/README.md): **1 failed / 3984
passed / 1 skipped** across 467 files. So: **+29 passing, +1 test file, and the
same single pre-existing failure** —
[`authPageFormMarkup.test.tsx`](../../../apps/admissions/tests/unit/authPageFormMarkup.test.tsx),
the SignUp helper-copy conflict catalogued in [8.1 §4.1](../8.1/slice-2-frontend.md),
[8.3 §7.1](../8.3/README.md), [8.4 §7.3](../8.4/README.md),
[9.1 §8.4](../9.1/README.md) and [9.2 §11.3](../9.2/README.md). Unrelated to the
directory.

### 15.3 Django system checks

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
> the platform (recorded by 8.3 §7.7, 8.4 §7.5, 9.1 §8.5 and 9.2 §11.4;
> re-confirmed here).

### 15.4 OpenAPI schema

`cd backend && python3 manage.py spectacular --file /tmp/schema.yaml`

```
Warnings: 3 (3 unique)
Errors:   116 (26 unique)
SPECTACULAR_EXIT=0
```

[`spectacular.txt`](raw/spectacular.txt) — **identical counts** to 8.2, 8.3, 8.4,
9.1 and 9.2. This task adds three operations and no new schema error: all five
user operations (`admin_users_list`, `admin_users_batch_import`,
`admin_users_import_preview`, `admin_users_bulk_update`, `admin_users_export`) are
present in the generated schema and none appears in the error list. The three
warnings are the pre-existing `operationId` collisions on
`/api/v1/admin/intakes/`, `/api/v2/admin/change-requests/` and
`/api/v2/admin/onboarding/`.

### 15.5 Browser journeys

`cd apps/admissions && HARNESS_PW_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://localhost:8090 bunx playwright test -c playwright.harness.config.ts --project=chromium-required --project=mobile-required tests/harness-e2e/required/admin-user-directory.spec.ts`

```
Running 16 tests using 1 worker
  … 16 passed (42.2s)
PW_EXIT=0
```

[`harness-user-directory-journeys.txt`](raw/harness-user-directory-journeys.txt).
Run against the task-0.4 isolated harness brought up **fresh**
(`harness/bin/harness up` wipes volumes and rebuilds both the backend image and
the SPA), with the strict `harness-fixtures.ts` gates active: zero skips, no
console errors, no unasserted failed requests. The harness was torn down
afterwards (`harness/bin/harness down`, volumes wiped) — verified: no
`mihas-v2-harness-*` container remains.

`HARNESS_PW_CHANNEL=chrome` is the config's documented escape hatch: Playwright's
bundled Chromium has no build for this machine, so the required projects run
against the system Chrome. It changes the browser binary, not the assertions.

Four assertion details worth recording because each cost a run:

- **the harness serves the built SPA** (`apps/admissions/dist`) and runs the
  backend from a **built image**, so a source change needs `bun run build` (and a
  backend change needs `harness up`) before it is under test. Two apparent test
  failures were stale artefacts.
- **every account renders twice** — a desktop table and a mobile card list, one
  breakpoint-hidden — so row counts are taken over *distinct*
  `data-user-row-id` values and text assertions run against `:visible`.
- **the search is debounced (300 ms)**, so a click issued between the keystroke
  and the answer detaches. `searchAndSettle` waits for the response whose
  `searchParams.get('search')` equals the term — deterministic, where a fixed
  sleep is not.
- **the export journey declares its 403** to the request gate with
  `gate.allowRequest('/api/v1/admin/users/export/')`; the declaration **is**
  R18.4's "asserted error path".

### 15.6 The live comparison

[`raw/live-directory-comparison.txt`](raw/live-directory-comparison.txt) — against
the running harness stack, with all of its state created through platform
endpoints: 30 accounts imported through `POST /api/v1/admin/users/batch-import/`
itself. **No row was hand-edited.**

It records the whole payload (aggregates with their definitions, facets, filters,
redaction, `can_export`, `supported_roles`), then: every counter against
hand-written psql (**10 counters, `ALL_COUNTERS_MATCH: true`**), the aggregates
holding still across three pages, the export returning the whole filtered set from
two different page requests, the masked-404 pair with its `scope.denied` rows, the
`UNSUPPORTED_FIELD` refusal with the row unchanged in psql, an email + phone
correction visible in psql, an idempotent replay that imports once, a rollback
that leaves `profiles` at exactly its prior count, the four audit rows, and
**`NO_ADDRESS_IN_AUDIT: True`**.

### 15.7 Failures introduced by this task

**Zero**, against measured baselines rather than assertion:

| Scope | Evidence |
|---|---|
| Backend accounts / authority suites | baseline 43 failed / 736 passed → 40 / **801**; the new-failure diff is empty and 3 pre-existing failures are resolved (§15.1) |
| Frontend | the same single pre-existing failure; **20** lint errors across **17** files vs 9.2's 21 across 18, with none in this task's files (§15.2) |
| Build / check / schema | exit 0, no issues, unchanged counts (§15.2–15.4) |
| Browser | 16/16 on a freshly wiped harness, zero skips (§15.5) |

## 16. Not claimed here

- **The frontend admin workspace is still reachable by the admin *role* tier, not
  by capability.** A `reviewer` holding `tenant.staff.read` is routed to the
  student workspace by `isAdminRole`, so they cannot reach `/admin/users` in a
  browser even though the endpoint would answer them. That is a pre-9.3
  navigation property (and the reason the export-authority journey uses an
  `admin` with a read-only membership rather than a reviewer). The backend is the
  boundary and behaves correctly either way; aligning the *frontend route tier*
  with capabilities belongs to the navigation lane.
- **Task 9.1's roster export sends `Accept: text/csv`** and is therefore latently
  affected by the same DRF content-negotiation 406 this task hit (§10). It is
  named here rather than changed, because it is another task's file and another
  task's evidence; 9.1's own journeys do not exercise the download.
- **`profiles.created_at` / `updated_at` are written by this task's create and
  import paths** (explicitly, since the model declares no `auto_now_add`), but
  **pre-existing rows created by other paths may still be NULL** — the same
  observation 9.1 §10 recorded for `applications`. The directory's ordering is
  total regardless (`created_at, id`), and a NULL renders as "Unknown" rather than
  a fabricated date.
- **No rate limit was added.** R6.5 names "size and rate limits"; the **size**
  limits are enforced (`IMPORT_MAX_ROWS = 100`, `MAX_BULK_SIZE = 25`,
  `EXPORT_ROW_LIMIT = 5000`), and per-user throttling on admin surfaces is a
  platform-wide concern the throttling lane owns
  (`apps/common/throttling.py`, currently payment- and AI-scoped). Adding a
  fourth ad-hoc throttle scope here would be a parallel implementation of
  something the platform already centralises.
- **`tenant.audit.read` scoping of the audit UI** is task **9.5** (finding
  ADM-05). This task writes `user.exported` / `user_batch_import` /
  `user_bulk_updated` rows and reads them back in its own tests, but does not
  change who may read the audit list.
- **Staff invitation and access-grant selectors** (R6.3, finding TEN-05) are not
  in scope: `/api/v1/admin/staff/candidates/` and the grant panels landed with
  task 4.2. This task's create path accepts an `institution_id` and resolves it
  through the same capability check, but it does not touch the invitation
  workflow.
- **`UserActivityLog` and `UserEffectiveCapabilities`** are unchanged. The
  read-only effective-capabilities surface is task 2.4's (AUTH-04's other half),
  and this task consumes it rather than rewriting it.
- **A performance budget for the directory read.** It is one page query, one
  aggregate, three facet queries, and one membership-label query per page; the
  query count is stated, not measured against a target. The perf lane owns
  budgets.
