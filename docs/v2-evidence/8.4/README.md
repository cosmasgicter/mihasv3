# Task 8.4 — Make fee administration and settlement server-scoped/capability-gated

Evidence index for task **8.4** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [-] 8.4 Make fee administration and settlement server-scoped/capability-gated
  - Add server filtering, pagination, aggregates, reconciliation state, export,
    redaction, and audit.
  - Remove broad fetch plus client institution filtering.
  - _Requirements: R3, R6.5, R8.3-R8.4, R12.5-R12.7_
  - _Findings: ADM-06, AUTH-02_
  - _Evidence: tenant A/B settlement/fee authority and export tests_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-06 (UTC).
- Builds on **8.1** (the quote is the money contract), **8.2** (one payment state
  machine, one reconciliation sweep), and **2.2** (`authorize_tenant_surface`,
  whose docstring already named "settlement/fee reads" as its intended callers).
  This task spends that authority vocabulary on the *admin* side; it adds none of
  its own and **invents no new capability** (§3.1).
- PBT: task 8.4 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`). Nothing is recorded via
  `update_pbt_status`.
- Schema: **no schema change, no migration.** Nothing was applied to Neon or to
  production. Everything here is query, authority, and presentation.

## The Required_Evidence claim

The `_Evidence:` line is one claim: *tenant A/B settlement/fee authority and
export tests*. The task frames it precisely — a tenant admin scoped to
institution **A** must not be able to observe, fetch, mutate, or infer
institution **B**'s fee configuration, settlement records, or aggregates through
**list, detail, search, aggregate, or export**. That is five surfaces × two
subjects (settlement, fees), plus the export authority itself.

[`backend/tests/unit/test_settlement_fee_authority_8_4.py`](../../../backend/tests/unit/test_settlement_fee_authority_8_4.py)
— **35 cases**, every one with the `production_scope` fixture active so what is
measured is the real membership/grant-derived capability model and never the
test-settings legacy-admin shortcut:

| Surface | Settlement | Fee configuration |
|---|---|---|
| **list** | A's rows only; B's id, name, and offering name absent from the whole body | A's fee only; B's `777.00` amount, offering id, and school name absent |
| **detail** | — (settlement has no per-row detail route) | B's `/programs/{id}/fees/` is the **same** masked 404 as an id that does not exist |
| **search** | searching B's exact school name returns 0 rows and the *same* body as a nonsense term | searching B's exact offering name likewise |
| **aggregate** | `payment_count == 1`, `institution_count == 1` — B's two payments are not counted, and the aggregate is identical for a probe and a nonsense search | `fee_count == 1`, `offerings_in_scope == 1`, and `peer_offering_count` (a genuinely cross-tenant number) is **withheld** from a tenant actor |
| **export** | A's CSV contains one row, B's id/name appear nowhere, and the platform-only columns are not even headers | same, and B's amount never appears |
| **mutation** | — | a write carrying B's offering id mutates nothing and discloses nothing |
| **filter substitution** | `?institution_id=<B>` and `?program_offering_id=<B's offering>` are byte-identical masked 404s to a random UUID | (the fee report shares the same resolver) |

98 passed across the five suites this task touches
([`raw/settlement-fee-authority-tests.txt`](raw/settlement-fee-authority-tests.txt)).
Nothing is mocked: each case drives the real Django endpoint against Postgres.

## What this task establishes

1. **Scope is a query, not a render.** The tenant console used to call
   `/payments/settlements/` with *no institution filter*, receive every row the
   actor could reach, and then drop the other schools' rows in the browser with
   `rows.filter(row => row.institution_id === institutionId)`. The institution is
   now a server parameter, resolved through `visible_institution_queryset`
   **before** it reaches a query (§1).
2. **The totals are the server's.** The panel summed `Number(row.gross_amount)`
   over one payload and called the result the school's total; the fee page counted
   `fees.length` and `new Set(fees.map(f => f.program_id))` and called that
   coverage. Both are now SQL aggregates over the **whole filtered set**, so
   turning a page cannot change them (§2).
3. **Authority is a capability, not a role.** `IsAdmin` / `IsSuperAdmin` are gone
   from both surfaces. A scoped Reviewer can now read the settlement report their
   membership entitles them to — the role gate denied them, which is AUTH-02's
   "legitimate reviewers are denied" — and a read-only Tenant_Admin can no longer
   write a fee, which is AUTH-02's "read-only tenant admins can mutate" (§3).
4. **Reconciliation is visible, and it is derived.** Each group and the whole
   report carry a state — reconciled, with the provider, still owed, needs
   attention — derived from 8.2's one payment state machine plus the
   reconciliation sweep's own 24-hour cutoff. No new column, no second vocabulary,
   no second number (§4).
5. **An export is a command.** It requires the explicit
   `tenant.application.export` capability, covers the whole filtered set
   regardless of the page, redacts by capability, is bounded rather than
   truncated, and leaves a `settlement.exported` / `fee.exported` Audit_Event
   carrying the actor, scope, filters, and row count — never the rows (§5).
6. **The server is still the only money authority.** No amount is summed,
   rounded, defaulted, or re-quantised in an operator's browser either. The
   18-rule scan from 8.1 stays green at **33 rules** and gained 8 for the admin
   surfaces (§6).

## Files

```
docs/v2-evidence/8.4/
├── README.md                                ← this index
└── raw/
    ├── settlement-fee-authority-tests.txt       (98 passed — the 5 suites this task touches, verbose)
    ├── money-admin-frontend-tests.txt           (279 passed — the 10 frontend files this task touches)
    ├── payment-suites-postgres.txt              (1032 passed / 0 failed / 6 pre-existing errors)
    ├── catalog-authority-suites.txt             (568 passed / 25 pre-existing failures — §7.4)
    ├── frontend-test.txt                        (whole suite: 3915 passed, 1 pre-existing failure)
    ├── frontend-lint.txt                        (21 errors — unchanged from 8.3, none in this task's files)
    ├── frontend-build.txt                       (exit 0, incl. tsc + CSP gate)
    ├── django-check.txt                         (no issues)
    └── spectacular.txt                          (3 warnings / 116 errors — unchanged)
```

Source of the change:

| Path | What it is |
|---|---|
| `backend/apps/documents/settlement_service.py` | **new** — `SettlementQueryService`: the one place that decides which rows an actor may see, how they group, what the totals are, what reconciliation state they are in, and what an export may contain |
| `backend/apps/documents/fee_admin_views.py` | **new** — `AdminFeeListView` (`GET /api/v1/admin/fees/`) + `FeeAdminQueryService`, sharing 8.4's scope and redaction path |
| `backend/apps/documents/payment_query_views.py` | `PaymentSettlementSummaryView` rewritten; `ProgramFeeViewSet` re-gated on capabilities, scoped before lookup, and audited on every write |
| `backend/apps/catalog/tenant_audit_service.py` | `record_export` + `ACTION_SETTLEMENT_EXPORTED` / `ACTION_FEE_EXPORTED` — one audited export path for both surfaces |
| `backend/apps/documents/urls.py`, `backend/config/urls.py` | the `/api/v1/admin/fees/` route, in the canonical admin namespace |
| `scripts/authority_matrix_registry.py` | the new route registered, and the fee/settlement entries corrected to the capabilities and disclosure this task actually implements |
| `apps/admissions/src/services/admin/settlement.ts` | **new** — both reports, both export paths, and the server-CSV download; sends filters and derives nothing |
| `apps/admissions/src/hooks/admin/useMoneyAdmin.ts` | **new** — React Query hooks keyed on the whole server query |
| `apps/admissions/src/pages/admin/tenants/SettlementPanel.tsx` | rewritten: server filter, server page, server aggregates, reconciliation label, capability-gated export |
| `apps/admissions/src/pages/admin/ProgramFees.tsx` | one scoped report instead of a request per offering; `formatFeeAmount` stops re-quantising money; the headline numbers are server aggregates |
| `backend/tests/unit/test_settlement_fee_authority_8_4.py` | **new** — the 35 required A/B authority + export cases |
| `apps/admissions/tests/unit/moneyAdminServerOwned.test.tsx` | **new** — 12 wiring cases on the real panel |
| `apps/admissions/tests/unit/feeProviderSourceScan.test.ts` | 25 → **33 rules**: 8 admin-surface rules (§6) |
| `apps/admissions/src/components/admin/applications/ApplicationDetailPayment.tsx` + `applicationDetailTypes.ts` | one adjacent admin **amount column** fixed (§6.1) — `Number(payment.amount).toFixed(2)` → `formatServerAmount` |

Superseded pins, each with its claim preserved (§8): `test_payment_settlement_tenant.py`,
`test_settlement_csv_export.py`, `test_tenant_admin_endpoints.py`,
`tests/property/test_admin_fee_auth.py`, `tests/unit/adminDashboardOverhaul.test.tsx`,
`tests/property/adminDashboardOverhaul.property.test.tsx`.

---

## 1. Scope is a query, not a render (ADM-06)

### 1.1 What the browser used to do

```ts
// SettlementPanel.tsx, before
const settlementQuery = useQuery({
  queryKey: ['admin', 'tenants', 'settlements'],
  queryFn: () => tenantAdminService.listSettlements(),   // no institution filter
})
const rows = (settlementQuery.data || [])
  .filter(row => String(row.institution_id || '') === String(institutionId))
```

Three defects in six lines: the request asked for everything the actor could
reach, the institution boundary was applied *after* the data had crossed the
network, and the query key did not contain the institution — so the same cached
payload was re-filtered for whichever tenant was selected.

The fee page had the same shape in a different guise: `useProgramFees(programs)`
fired **one `/programs/{id}/fees/` request per offering** and flattened the
results, so the request count grew with the catalogue.

### 1.2 What runs now

| Filter | Where it runs | Out-of-scope behaviour |
|---|---|---|
| `institution_id` | SQL, after `visible_institution_queryset` confirms the id is in scope | masked **404** + `scope.denied` Audit_Event |
| `program_offering_id` | SQL, resolved inside the actor's visible institutions | masked **404** + `scope.denied` |
| `currency`, `status`, date range | SQL | — |
| `reconciliation` bucket | SQL, as a **payment-row** predicate (never over assembled groups) | — |
| `search` | SQL, over the settlement snapshot labels | 0 rows, identical body to a nonsense term |
| page / pageSize | SQL `LIMIT/OFFSET` over the grouped result | — |

The base queryset composes the platform's own payment scope
(`AccessScopeService.filter_payments`, which honours institution, offering, and
application grants) with the institution set derived from
`visible_institution_queryset`. Neither is a role comparison, and neither runs in
the browser.

**Why an out-of-scope id is a 404 and not an empty page.** A 200 with zero rows
answers a question the actor was not entitled to ask: it confirms the id is a
real, resolvable offering, because a nonsense id would have behaved differently.
Both now collapse to one indistinguishable response, and the probe is recorded —
that is R3.2's "cross-tenant object substitution returns an indistinguishable
404" applied to a *filter* rather than a path segment.

### 1.3 The grouping moved into the database

The old implementation iterated **every** payment the actor could reach in a
Python loop to build its groups. The new one groups in SQL by
`(institution_ref_id, program_offering_id, currency, institution_label,
offering_label)` — canonical ids are the scoping authority; the labels come from
the `payments.metadata` settlement snapshot with the legacy display column as
fallback and an explicit `Unassigned` bucket, so a renamed school's historical
rows keep the name the money was collected under.

`test_grouping_and_counting_happen_in_sql` makes two claims a query-count test
usually cannot: **every** query touching `payments` contains `GROUP BY`, `COUNT(`,
or `SUM(` — none reads rows to add them up in Python — and **doubling the ledger
does not change the number of queries**.

## 2. The totals are the server's, and paging cannot move them

The response is the canonical paginated envelope plus two blocks the finding
requires:

```json
{"success": true, "data": {
  "page": 1, "pageSize": 20, "totalCount": 37, "totalPages": 2,
  "results": [ … ],
  "aggregates": { "payment_count": 40, "settled_count": 20, "pending_count": 10,
                  "stale_pending_count": 5, "failed_count": 5, "expired_count": 0,
                  "deferred_count": 0, "institution_count": 1, "offering_count": 4,
                  "totals_by_currency": [ {"currency": "ZMW", "gross_amount": "6120.00", … } ],
                  "reconciliation_state": "attention_required",
                  "reconciliation_stale_hours": 24, "row_limit": 5000 },
  "filters": { … applied filters, echoed … },
  "redaction": { "applied": true, "withheld_fields": ["collector", "quarantined_count"] },
  "can_export": false
}}
```

`aggregates` is computed over the **whole filtered set**, not the page — proven
twice, once per side:

- backend `test_pagination_is_server_side_and_scoped`: page 1 and page 2 return
  different single rows, and `aggregates.payment_count` is `2` on both;
- frontend `keeps the aggregate stable across pages`: the rendered total is
  `K6120.00` before and after pressing Next, while the row on screen carries
  `K306.00`.

`totalPages` is the server's arithmetic too. That is not ceremony: the alternative
was `Math.ceil(totalCount / pageSize)` in the browser, and this task's own scan
rule forbids rounding on a money surface. Letting the server answer removed the
last division from both pages.

**The default status filter changed.** The old report silently narrowed to the
four settled statuses, so the surface whose job is to show what has *not* settled
could not show a failed or expired attempt. It now defaults to every status and
`filters.status` is `[]`, which is what makes the reconciliation counters
meaningful (`test_default_status_filter_keeps_reconciliation_complete`).

## 3. Authority is a capability (AUTH-02)

### 3.1 No new capability was invented

The task permits registering a new capability. It was not needed, and inventing
one would have been worse than reusing:

| Decision | Capability | Why |
|---|---|---|
| Read the settlement report | `tenant.payment.read` | already in the default tenant read bundle, so a scoped Reviewer/Tenant_Admin holds it for their own schools |
| Read fee configuration | `tenant.program.read` | fees are offering configuration; the same bundle carries it |
| Write a fee | `platform.program_assignment.manage` | preserves today's super-admin-only write while removing the role string. Per the tenancy model a Tenant_Admin may only *request* an offering change |
| Export either report | `tenant.application.export` | the platform's **one** tenant export grant: `AdminCapabilityService._GRANTED_MUTATION_CAPABILITIES` maps the `export` membership/grant permission onto it |

A new `tenant.payment.export` would have had **no derivation path** — no
membership or grant permission maps to it — so nobody except an all-access actor
could ever hold it. A capability that cannot be granted is not authority; it is a
constant. The catalogue therefore stays at 17 `platform.*` + 17 `tenant.*`, and
the authority mapping is registered in `docs/canonical-truth-map.md` →
"Settlement + fee administration".

### 3.2 The decisions this changes

| Actor | Before | Now |
|---|---|---|
| Scoped **Reviewer** reading settlement | `403` — `IsAdmin` requires role ≥ admin | **200**, scoped to their institutions |
| **Student** on either report | `403 INSUFFICIENT_PERMISSIONS` (a distinguishable answer) | masked **404** |
| `admin` role with **no membership** | `200` with an empty page | masked **404** (§8.1) |
| Read-only **Tenant_Admin** writing a fee | reached `IsSuperAdmin` → 403, but authority was a role ladder | **403** resolved through `AdminCapabilityService`, and the refusal is audited |
| Read-only **Tenant_Admin** exporting | export was implied by read access | **403** + `auth.denied` (§8.2) |
| **Super_Admin** | everything | everything, plus the platform-only columns |

The one **pre-existing failing test this task fixes** is the task-2.1 authority
matrix case
`test_admissions_v2_authority_policies.py::test_scoped_reviewer_can_reach_read_surfaces[/api/v1/payments/settlements/]`,
which had been red since task 2.2 registered the intent: it asserts a scoped
reviewer gets 200 on the settlement report, and the `IsAdmin` gate returned 403.

### 3.3 Scope before lookup, everywhere

`ProgramFeeViewSet.get_queryset` resolves the URL's offering through
`resolve_scoped_program` — which filters by the actor's visible institutions
**before** the `.get()` — so a fee list can never confirm another tenant's
offering exists. Both 8.4 report views resolve their identifier filters the same
way before any data query.

Every write emits `tenant.fee.created` / `tenant.fee.updated` /
`tenant.fee.deactivated` through `TenantAuditService.record_config_change`, scoped
to the owning institution, carrying the fee type, residency, amount, and currency
— and, on an update, the previous amount and currency. IP and user agent are
SHA-256 digests; `test_super_admin_can_write_a_fee_and_it_is_audited` asserts the
64-hex shape, so a raw address cannot slip in.

## 4. Reconciliation state, derived from what already exists

"Reconciliation state" adds no column and no state machine. It is a read of
8.2's one payment state machine plus the age of an in-flight attempt, and the age
threshold is **the reconciliation sweep's own cutoff** —
`PaymentService.expire_stale(older_than_hours=24)`, dispatched by
`poll_pending_payments_task` every ten minutes — rather than a second number that
could drift from it.

| Verdict | When | What it tells an operator |
|---|---|---|
| `attention_required` | a failure, or a `pending` row older than the sweep's cutoff | a human is needed: the sweep should already have expired it |
| `in_flight` | `pending` within the cutoff | wait; the wait is legitimate |
| `uncollected` | deferred or expired only | the fee is still owed, and nothing went wrong |
| `settled` | every attempt settled | reconciled |
| `no_activity` | no attempts match the filters | an honest empty, not a healthy zero |

The counters behind it (`settled_count`, `pending_count`, `stale_pending_count`,
`failed_count`, `expired_count`, `deferred_count`) are SQL `COUNT(… FILTER …)`
expressions, so the row and the aggregate agree by construction. The
`?reconciliation=` filter narrows **payment rows**, not assembled groups, which is
why a filtered page and its aggregates always describe the same set
(`test_reconciliation_filter_narrows_rows_and_aggregates_together`).

The panel renders the verdict as a `StatusBadge` **label** — never colour alone —
and states the server's own window ("5 pending over 24h") rather than restating a
threshold of its own.

## 5. The export is a command (R6.5)

| R6.5 requirement | How it is met |
|---|---|
| explicit capability | `tenant.application.export`, checked separately from the read; a read-only tenant admin is refused |
| audit | `TenantAuditService.record_export` → `settlement.exported` / `fee.exported`, `security` retention, recording actor, actor role, institution scope, the applied filters, the row count against the ceiling, and what redaction withheld — **never the rows** |
| redaction | the platform-only columns are absent from a tenant's file, not blanked: they are not even headers |
| size limit | `EXPORT_ROW_LIMIT = 5000`; over-limit returns `EXPORT_TOO_LARGE` (400) with the counts. A financial export that silently truncated would be worse than none |
| not the loaded page | the export drops `page`/`pageSize` and covers the whole filtered set — asserted on both sides: `test_export_is_page_independent` (page 2 of a 1-row page still exports 2 rows) and the frontend's `settlementExportPath` rule in the source scan |
| refusal is audited | a denied export emits `auth.denied` with the required capability recorded |

The browser's part is deliberately small: `downloadExport` fetches with
credentials, saves the blob, and turns a non-OK response into the server's own
message instead of saving an error page as a `.csv`
(`surfaces the server refusal instead of saving an error as a file`).

### 5.1 What "redaction" means here, honestly

Scope decides *which rows* an actor sees; redaction decides which **platform**
columns travel with them. The withheld columns are platform facts, not tenant
facts:

| Column | Surface | Why it is platform-only |
|---|---|---|
| `collector` | settlement | the Beanola central-collection marker — how the *platform* settles money, not the school |
| `quarantined_count` | settlement | payments preserved by the task-3.5 orphan-remediation ledger: a platform data-repair state that would only mislead a school reading its own report |
| `peer_offering_count` | fees | how many **other** institutions offer the same canonical program. A Platform_Admin legitimately compares tenants; a tenant operator inferring another school's catalogue from their own fee page is exactly the cross-tenant inference R3.2 forbids |

`peer_offering_count` is not merely hidden — it is **not computed** for a tenant
actor, so the query that would produce the inference is never run. Both worlds in
`test_peer_offering_count_is_platform_only` offer the same canonical program, so
the number is real (`2`) and its absence is a decision rather than a coincidence.

## 6. The scan grew the admin-surface rules

`apps/admissions/tests/unit/feeProviderSourceScan.test.ts` was 8.1's guard against
an invented fee returning and 8.3's guard against hardcoded support copy. It stays
green at **33 tests** (from 25) and now scans the four admin money files for the
absences this task created — because a rendering test proves the right number
appears today, and only a scan keeps the next panel from summing rows again:

| Rule | Fails when |
|---|---|
| no client institution predicate | `.filter(… institution_id …)` or `institution_id ===` appears on an admin money surface |
| the institution is a server filter | the panel stops passing `institutionId` into the query, or the service stops sending `institution_id` |
| no admin money arithmetic | `toFixed`, `Math.round/floor/ceil`, `parseFloat`, arithmetic on an `amount`/`gross`/`total` identifier, or the retired `+= Number(row.gross_amount)` accumulator |
| one money formatter | either page stops formatting through `formatServerAmount` |
| no page-derived total | `fees.length` used as a *number the operator reads*, `new Set(`, or `.reduce(`; and both pages must read the server's `aggregates` |
| export is the server's | the export URL stops dropping the page, the button stops gating on `can_export`, or a `role === 'admin'` comparison appears |
| no legacy tenant | a literal `MIHAS` / `KATC` appears on an admin money surface |

Two existing rules were made *more precise* rather than looser, and both
refinements are recorded in the file: the "no invented amount" rule now excludes
`*_count` identifiers (a zeroed **tally** in an empty-aggregate shape is not an
invented **amount** — the finding was `amount = 150`), and the page-derived-total
rule allows `fees.length === 0` as an emptiness test while still forbidding a
loaded-row count from being displayed.

### 6.1 One adjacent admin amount column

[8.3 §8](../8.3/README.md) left "`ProgramFees.tsx` `formatFeeAmount` **and the
admin amount columns**" to this task. Sweeping `toFixed` across the admin tree
found one more money column outside the fee and settlement surfaces: the review
workspace's payment history rendered
`{payment.currency} {Number(payment.amount).toFixed(2)}`, with `'—'` only for a
null. It now renders `formatServerAmount(...)`, and `PaymentRecord.amount` is
widened from `number | null` to `number | string | null` — the truthful shape,
matching `services/payments.ts`, because DRF serialises `DecimalField` as an
already-quantised string (`COERCE_DECIMAL_TO_STRING` defaults to true).

This is a one-line display fix on a surface the review lane (task 9.x) owns, so it
is called out rather than folded in silently: nothing about the review workspace's
data, authority, or layout changed, and leaving a `toFixed` on a **ledger** amount
while adding a scan rule against exactly that pattern would have been incoherent.
The two remaining `toFixed` calls in the admin tree are not money —
a file-size label (`file_size / 1024`) and the decimal **setting** normaliser in
`settingsValidation.ts`.

## 7. Verification (verbatim)

### 7.1 Backend payment / fee / document / webhook suites

`cd backend && DATABASE_URL=<localtest 5433> TESTING=1 python3 -m pytest $(ls tests/unit/*.py tests/property/*.py | grep -iE "payment|fee|document|webhook|settlement")`
— the same selection 8.1 §4.3, 8.2 §6.1, and 8.3 §7.3 used, against the isolated
`mihas-localtest` Postgres. Neon and production were not touched.

| Run | Result |
|---|---|
| 8.3 final | 0 failed, 988 passed, 64 skipped, 2 xfailed, 1 xpassed, **6 errors** |
| **8.4** | **0 failed, 1032 passed**, 64 skipped, 2 xfailed, 1 xpassed, **6 errors** |

[`payment-suites-postgres.txt`](raw/payment-suites-postgres.txt). The 6 errors are
**byte-identical by name** to 8.2's and 8.3's (the three
`test_application_review_payment_gate` reversal/legacy cases and the three
`test_payment_review_reopen` cases). +44 passing: this task's 35 new cases plus
the extended settlement/fee/CSV/property suites.

### 7.2 The task's own suites, verbose

`tests/unit/test_settlement_fee_authority_8_4.py`,
`test_payment_settlement_tenant.py`, `test_settlement_csv_export.py`,
`tests/property/test_admin_fee_auth.py`, `test_tenant_admin_endpoints.py` —
**98 passed** ([`settlement-fee-authority-tests.txt`](raw/settlement-fee-authority-tests.txt)).

### 7.3 Frontend gates

| Gate | Result | Artifact |
|---|---|---|
| `bun run test` | **1 failed / 3915 passed / 1 skipped** (464 files) — the single failure is the pre-existing `authPageFormMarkup` copy conflict | [`frontend-test.txt`](raw/frontend-test.txt) |
| `bun run lint` | **21 errors, 0 warnings** — identical count to 8.3, none in this task's files | [`frontend-lint.txt`](raw/frontend-lint.txt) |
| `bun run build` | **exit 0** (includes `tsc -p tsconfig.build.json --noEmit`, `vite build`, and the CSP gate) | [`frontend-build.txt`](raw/frontend-build.txt) |
| the 10 frontend files this task touches | **279 passed** | [`money-admin-frontend-tests.txt`](raw/money-admin-frontend-tests.txt) |
| `tsc -p tsconfig.build.json --noEmit` | exit 0 | (inside `bun run build`) |

vs 8.3's run: **+21 tests passing, +1 test file**, same single failure. That
failure is `tests/unit/authPageFormMarkup.test.tsx`, which asserts the SignUp
helper copy "We'll verify this address." while the page in this worktree says
"We'll send account updates here." — another in-flight task's edit, catalogued in
[8.1 §4.1](../8.1/slice-2-frontend.md), the task 7.5 evidence, and
[8.3 §7.1](../8.3/README.md). Unrelated to money administration.

### 7.4 Catalog / capability / authority suites

`python3 -m pytest $(ls tests/unit/*.py tests/property/*.py | grep -iE "catalog|capabilit|permission|authorit|tenant|scope|cross_tenant")`
— run because this task changes an authority gate and adds a route.

| Run | Result |
|---|---|
| before this task's edits | 28 failed, 565 passed, 6 skipped |
| **after** | **25 failed, 568 passed**, 6 skipped |

[`catalog-authority-suites.txt`](raw/catalog-authority-suites.txt). The three that
turned green are this task's: the scoped-reviewer settlement case (§3.2), the fee
list's cross-tenant mask, and two authority-matrix registry cases
(`test_every_route_in_target_seven_or_approved_boundary`,
`test_no_unregistered_admissions_route`) that failed until `/api/v1/admin/fees/`
was registered.

The remaining **25 are pre-existing and belong to other lanes**. None of them
exercises a fee or settlement endpoint — mechanically checked: the eight files
holding 23 of the failures contain **zero** references to `settlement`, `/fees/`,
or `ProgramFee`, and in the two files that do reference them
(`test_cross_tenant_isolation.py`, `test_cross_tenant_invisibility.py`) the
settlement cases **pass** while the failures are `applications_export` and an
application-grant scope case. Their causes:

| Cluster | Cause (not this task) |
|---|---|
| `test_authority_matrix_v2.py::test_no_stale_registry_entries`, `test_zero_unclassified_gate_passes_on_live_surface`, `test_unscoped_endpoint_guard.py` (2) | the AI admin-summary / preview-summary routes and `ApplicationAdminSummaryView` were **deleted** by the de-AI lane; the registry and gap-register pins for them are stale. Verified: neither route exists in the URLConf and the class is gone |
| `test_cross_tenant_invisibility`, `test_cross_tenant_isolation` export cases | `/api/v1/applications/export/` requires `tenant.application.export` since task 2.2; the fixtures' staff hold no export grant |
| `test_capability_endpoint_shape`, `test_admin_scope_endpoint`, `test_no_scope_empty`, `test_perf_capability_invalidation` (5), `test_scoped_access_matrix` (4), `test_production_scope_masking_properties` (3), `test_capability_gated_writes`, `test_admissions_v2_authority_policies` (2) | task 2.2's `authorize_tenant_surface` masks a no-scope actor as 404 on admin surfaces (`/admin/capabilities/`, the dashboard), plus application-scope cases in the 2.2/9.x lanes |

### 7.5 Django system checks

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
> the platform (recorded by 8.3 §7.7 and re-confirmed here).

### 7.6 OpenAPI schema

`cd backend && python3 manage.py spectacular --file /tmp/schema.yaml`

```
Warnings: 3 (3 unique)
Errors:   116 (26 unique)
SPECTACULAR_EXIT=0
```

[`spectacular.txt`](raw/spectacular.txt) — identical to 8.2's and 8.3's counts.
The new `/api/v1/admin/fees/` operation declares its parameters and responses
through `extend_schema`, so it adds no "unable to guess serializer" error.

### 7.7 Failures introduced by this task

**Zero.**

| Scope | Evidence |
|---|---|
| Backend payment/fee suites | 0 failed (1032 passed), same 6 errors by name (§7.1) |
| Backend authority suites | 28 → 25 failures; the 3 that turned green are this task's, and the 25 remaining reproduce without a fee or settlement call (§7.4) |
| Frontend | same 1 pre-existing failure; lint count unchanged at 21, none in this task's files |
| Build / check / schema | exit 0, no issues, unchanged counts (§7.3, §7.5, §7.6) |

## 8. The pins this task supersedes

Six existing tests pinned behaviour this task deliberately changes. None of their
claims was dropped; each was restated against the stronger contract, with the
reason written into the test.

### 8.1 A no-scope actor is masked, not answered

| Test | Was | Now |
|---|---|---|
| `test_payment_settlement_tenant.py::test_no_scope_staff_settlement_summary_is_masked` | `200` + empty `results` | masked **404**, and no institution id or name anywhere in the body |
| `test_settlement_csv_export.py::test_no_scope_staff_gets_no_file_at_all` | header-only CSV | masked **404** — no file at all |
| `test_tenant_admin_endpoints.py::test_tenant_admin_program_fee_list_is_scoped_to_own_offering` | other tenant's offering → `200` + empty list | masked **404**, byte-identical to a random UUID |

Each old response confirmed two facts the actor was not entitled to: that the
surface exists, and that this particular id resolves. A header-only CSV is the
clearest case — it is a *file* asserting "you have no rows here". The original
claim in every case was "never another school's rows, never a global total", and
that holds strictly more strongly when there is nothing to read.

### 8.2 An export is a separate authority

`test_settlement_csv_export.py`'s scoped staff now hold the `export` grant
(`_staff_client` adds it), because R6.5 makes a bulk export a command with its own
capability. Every scoping claim in that file is unchanged; what changed is that
reading the report and downloading it are no longer the same permission. The
refusal path is covered by
`test_settlement_fee_authority_8_4.py::test_read_only_tenant_admin_cannot_export`.

The file's `EXPECTED_HEADER` also grew the reconciliation columns and lost the
platform-only ones — which is itself the redaction assertion for a tenant actor.

### 8.3 The fee gate is a capability, not `IsAdmin`

`tests/property/test_admin_fee_auth.py` asserted
`IsAdmin in ProgramFeeViewSet.permission_classes`. That is precisely the AUTH-02
defect, so the pin was rewritten around the primitives that replaced it:
`HasTenantCapability` + `tenant.program.read` for reads,
`HasPlatformCapability` + `platform.program_assignment.manage` for writes, and an
explicit assertion that **neither role class remains** on any action. The original
property — "no unauthenticated request reaches a fee endpoint, by any method" —
is re-pinned as a Hypothesis property over both gates, and a new case covers a
failure mode the role gate never had: a capability gate with no declared
capability must **deny**, not admit.

### 8.4 Money formatting moved to the server

| Test | Was | Now |
|---|---|---|
| `adminDashboardOverhaul.test.tsx` | `formatFeeAmount('ZMW','153') === 'ZMW 153.00'` | `formatFeeAmount('ZMW','153.00') === 'K153.00'`, `USD → $`, unknown currency → `CODE amount`, and a missing amount → `—` |
| `adminDashboardOverhaul.property.test.tsx` | generated `double`s and asserted `^CURRENCY \d+\.\d{2}$` | generates the **decimal strings** the server sends and asserts the digits survive untouched; a second property asserts no amount is invented for a missing one |

The old property pinned the browser *deciding the scale of money* — the STU-08
defect wearing a different hat. The two-decimal guarantee did not disappear: it is
asserted where it is now decided
(`test_settlement_fee_authority_8_4.py::test_amounts_are_quantised_decimal_strings`,
where `100.10 + 53.20` becomes the server's `"153.30"`).

## 9. Constraints held through the change

| Constraint | How it is held |
|---|---|
| Success/data envelope on every authenticated endpoint | both reports return `{"success": true, "data": {…}}`; `test_tenant_api_contract_preservation.py::test_settlement_summary_preserves_envelope` still passes |
| Paginated shape `page`/`pageSize`/`totalCount`/`results` inside `data` | asserted in `test_list_and_aggregates_exclude_the_other_tenant`; `aggregates`/`filters`/`redaction`/`can_export`/`totalPages` are additive keys |
| Server is the sole money authority — no client arithmetic | `feeProviderSourceScan.test.ts` (33 rules) now scans the admin surfaces too; the last browser-side division (`Math.ceil` for the page count) was removed by having the server send `totalPages` |
| The 18-rule fee/provider scan stays green | **33 passed**, and it gained 8 admin rules (§6) |
| Payment stays the source of truth (ADR-001) | nothing here writes a payment; the report reads the ledger and derives its verdicts |
| Every authority decision resolves through `AdminCapabilityService` | `HasTenantCapability` / `HasPlatformCapability` / `authorize_tenant_surface` / `resolve_scoped_program` / `visible_institution_queryset`; no role string is compared in either view |
| Tenant-sensitive querysets scoped before lookup | identifier filters resolve through `visible_institution_queryset` before any data query; the fee list resolves its offering before reading a fee row |
| Out-of-scope → 404 or non-revealing 403, disclosing nothing | asserted byte-for-byte against a random UUID on four paths (§1.2) |
| Writes and failed authorizations audited, SHA-256 IP/UA, no raw PII | `tenant.fee.<verb>`, `settlement.exported`, `fee.exported`, `auth.denied`, `scope.denied`; the 64-hex digest shape is asserted |
| Export page-independent, audited, capability-redacted | §5 |
| New capability registered before merging | none was added, and the reasoning + authority mapping are registered in `docs/canonical-truth-map.md` (§3.1) |
| Additive SQL only, Neon-first, never production | **no schema change** and no migration; the only database touched was the throwaway localtest Postgres |
| Design rules | one `PageShell` / `SectionCard` per section, `EmptyState` and `ErrorDisplay` for the empty and failed cases, Lucide only, no gradient/glass/nested cards; the reconciliation verdict is always a `StatusBadge` **label**, never colour alone; the filter control carries `min-h-touch` and an explicit `aria-label`; the responsive record-row/table split `adminTenantPolishGuard.test.ts` pins is preserved |

## 10. Not claimed here

- **A browser journey.** The task's Required_Evidence is "tenant A/B settlement/fee
  authority and export tests", and those are the 35 API-level cases plus the 12
  rendering cases. The design's §16 journey table lists
  "Audit/settlement/export … page 2+, cross-tenant query, redaction" under the
  **390** viewport set, which belongs to the Phase 13 verification lane; no
  harness spec is added here. What a journey would add over these tests is the
  browser transport, not the authority claim.
- **The applications export.** `/api/v1/applications/export/` is task 9.x's
  surface (R6.5's roster half). Its capability gate came from task 2.2 and its two
  failing fixtures are catalogued in §7.4, not fixed here.
- **The admin dashboard's own aggregates** (ADM-02) and the applications query
  contract (ADM-01) are tasks **9.1** and **9.2**. This task changed nothing in
  either, and deliberately did not widen its scope to the dashboard's settlement
  tile.
- **Fee-quote authority** (8.1) and the payment state machine (8.2) are read here,
  never re-decided.
- **The 2 stale authority-matrix registry entries and the gap-register pin** for
  the deleted AI summary views (§7.4) are the de-AI lane's cleanup. Fixing them
  here would mean editing another task's registry rows on a guess about its intent.
