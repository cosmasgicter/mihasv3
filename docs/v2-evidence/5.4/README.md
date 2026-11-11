# Task 5.4 Evidence — Replace fee defaults/name lookup with canonical fee schedules

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

_Requirements: R7.4, R7.5, R12.1, R12.2_
_Findings: DATA-05, STU-08_
_Design: design.md §7.1 (Canonical Catalog — FeeSchedule ownership + one-active-fee invariant); §6.2 (Readiness Invariants — "exactly one applicable active application fee for each enabled residency path"); §10.1 (Fee Quote — "There is no K150/USD20 default. Missing or ambiguous configuration returns FEE_NOT_CONFIGURED")._
_Required_Evidence (tasks.md): "fee invariant tests and grep report for hardcoded amounts" — realized as a same-name two-tenant fee isolation test, a fail-closed missing-fee test proving a stable configuration error rather than a default amount, the grep-loop proving zero hardcoded/default/name-lookup fee callers, plus backend suite + authority-matrix gate results._

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`).
- Candidate: working-tree changes on top of the base commit (the whole
  admissions-v2 spec is in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-07-24 (UTC).
- PBT: task 5.4 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → no `pbtResults` entry for 5.4); none to record via
  `update_pbt_status`.
- Schema: **no schema change** in 5.4. It reuses the one-active-fee DB invariant
  `uq_program_fees_one_active` shipped by Phase 3 task 3.3
  (`backend/scripts/2026_07_17_01_integrity_constraints_expand.sql`) and the
  canonical assignment snapshot columns from task 5.2. No `backend/scripts/*.sql`
  added; **no schema hash to report**.

## The two findings closed

- **DATA-05** — fee lookup resolved the offering by **display name/code** and
  fell back to an **invented program-level default** amount, so a same-name
  other tenant's offering (or a missing configuration) could yield a bogus fee.
  **Fix:** the fee is resolved **only** from a canonical `FeeSchedule`
  (`program_fees`) row keyed on the canonical **offering object** + `fee_type` +
  `residency_category`. The display-name lookup is removed; `resolve_fee` matches
  by canonical `code`/`id` only (a name now yields `Program.DoesNotExist` → 404).
  There is no program-level default fallback.
- **STU-08** — payment hardcoded a `K150/USD20` fee. **Fix:** every
  application-driven fee path (`resolve_for_application` /
  `resolve_for_payment_snapshot`) keys on the application's canonical
  `program_offering` binding (task 5.2 snapshot) and resolves the amount from the
  canonical `FeeSchedule`. A missing/ambiguous fee **fails closed** with a stable
  configuration error — never a substituted constant. The server returns the
  exact resolved amount as the payment quote.

## What 5.4 delivers

| Layer | File | Role |
|---|---|---|
| Canonical resolver | `backend/apps/documents/fee_resolver.py` | `FeeResolver` with `resolve_for_offering` (canonical entry point — offering object + server-derived residency), `resolve_fee` (code/id-only lookup, no name), `resolve_for_application` (uses `program_offering` binding), `resolve_for_payment_snapshot` (immutable `PaymentSnapshot` carrying `configuration_version` for drift detection). `_lookup_active_fee` fails closed: 0 rows → `FeeConfigurationError`/`FEE_NOT_CONFIGURED` (422, non-retryable); >1 active row → `AmbiguousFeeError`/`FEE_AMBIGUOUS` (409). Framework-neutral errors carry stable `code`/`status_code`/`retryable`. |
| One-active-fee invariant | (reused) task 3.3 `uq_program_fees_one_active` | DB enforces exactly one active `(program, fee_type, residency)` fee; a duplicate race is a stable 409 (`DUPLICATE_ACTIVE_FEE`) on the write path. The resolver additionally raises `FEE_AMBIGUOUS` if it ever observes >1 active row, so a missing/disabled index still fails closed. |
| Resolve-fee endpoint | `backend/apps/documents/payment_query_views.py` (`GET /api/v1/payments/resolve-fee/`) | Resolves by canonical code/id; `Program.DoesNotExist` → 404 `FEE_UNAVAILABLE`; `FeeConfigurationError` → the stable `FEE_NOT_CONFIGURED` / `FEE_AMBIGUOUS` envelope with the resolver's own status — never an invented default. |
| Payment initiation | `backend/apps/documents/payment_helpers.py` (`_resolve_fee_for_application`, `_build_snapshot_dict`) | Delegates to the canonical resolver; a `FeeConfigurationError` is **propagated** (never swallowed into a default). Waiver check degrades to the full canonical fee, never to a constant. |
| Onboarding/operator readiness | `backend/apps/catalog/views.py` (assignment-preview `compute()`) | Resolves the fee from the already-assigned canonical offering object (offering-keyed, tenant-scoped, fail-closed). On `FeeConfigurationError` it now returns `fee: null` **and** a named `fee_blocker` (`{code: FEE_NOT_CONFIGURED, message, residency_category}`) so onboarding/operators see the exact configuration gap (design §6.2 readiness invariant) instead of a silent null. |

## Required_Evidence

### 1. Same-name two-tenant fee isolation + fail-closed missing-fee — `raw/fee-invariant-and-readiness-tests.txt`
`backend/tests/unit/test_fee_resolver_canonical_isolation.py` (real Program +
ProgramFee rows, not mocked):
- `test_same_code_two_tenant_fee_isolation` — two tenants' offerings share the
  same canonical program **name**; each resolves to its **own** fee
  (K300 vs K450) and the shared display name resolves to **no** fee
  (`Program.DoesNotExist`). Proves R7.7 fee isolation and the removed name lookup.
- `test_missing_fee_fails_closed_not_default` — an offering carrying a non-null
  program-level `application_fee=150.00` with **no** `ProgramFee` row raises
  `FEE_NOT_CONFIGURED` (422, non-retryable). Proves the K150 default is gone
  (DATA-05/STU-08).
- `test_wrong_residency_fee_fails_closed` — a local-only fee does not satisfy an
  international student → fail closed, no default.
- `test_duplicate_active_fee_is_prevented_or_ambiguous` — the DB one-active-fee
  invariant rejects the duplicate, or the resolver raises `FEE_AMBIGUOUS` (409);
  a silently-picked arbitrary fee is never acceptable.
- `test_no_display_name_lookup` — `resolve_fee` resolves by canonical code, and
  the display name raises `Program.DoesNotExist`.
- `test_resolve_for_application_uses_canonical_offering` — an application bound to
  tenant B's offering resolves tenant B's fee, not the same-name tenant A's.

`backend/tests/unit/test_fee_resolver_international.py` — the four seeded
programs return the international `K306` fee with `source='program_fee'` (never
`program_default`) for non-Zambian residency.

### 2. Readiness-blocker exposure — `raw/fee-invariant-and-readiness-tests.txt`
`backend/tests/unit/test_assignment_preview.py::test_offering_without_fee_surfaces_readiness_blocker`
— an offering with no active fee returns `fee: null` **and** a `fee_blocker`
naming `FEE_NOT_CONFIGURED`, proving onboarding/operators see the exact blocker
rather than a default amount. The three pre-existing preview contract tests
still pass (additive `fee_blocker` field).

Result: **17 passed** (6 isolation + 7 international + 4 assignment-preview).

### 3. Grep-loop — zero hardcoded-default / name-lookup fee callers — `raw/grep-loop-no-default-name.txt`
- No `_DEFAULT_APPLICATION_FEE` / `_DEFAULT_CURRENCY` / `program_default` in
  `apps/` (or `tests/`).
- No `objects.get(name=...)` fee lookup in `apps/documents/` or
  `admin_review_views.py`.
- The only code/id `resolve_fee()` callers are the two resolve-fee HTTP
  endpoints; every application-driven path uses the offering-keyed
  `resolve_for_offering` / `resolve_for_application` / `resolve_for_payment_snapshot`.
- The only `K150/153/USD20` mentions in the fee path are doc-comments citing the
  DATA-05/STU-08 findings.

### 4. Fee + payment suite — `raw/backend-5.4-tests.txt`
Fee-resolver property/unit suite + payment fee-matching, program-fee coverage /
uniqueness / validation, and fee-waiver tests: **63 passed, 1 skipped**. Earlier
combined payment/fee run: **139 passed, 1 skipped**.

### 5. Authority-matrix gate — `raw/authority-matrix-gate.txt`
`tests/unit/test_authority_matrix_v2.py` + `tests/property/test_authority_matrix_properties.py`:
**21 passed**. The assignment-preview change adds no route and no new capability,
so the registry (`scripts/authority_matrix_registry.py`) is unchanged and the
zero-unclassified gate stays green.

### 6. Frontend drift guards — `raw/frontend-drift-guards.txt`
Payment stable-code drift guards (`errorCodesDriftGuard`, `paymentErrorCodes`,
`paymentErrorCodesCoverage`): **17 passed**. `FEE_NOT_CONFIGURED` / `FEE_AMBIGUOUS`
remain in the shared stable-code catalogue and its frontend mirror.

## Verified vs. deferred

- **Verified:** offering-keyed fail-closed fee resolution (no default, no name
  lookup); same-name two-tenant fee isolation; missing/ambiguous fee → stable
  `FEE_NOT_CONFIGURED`/`FEE_AMBIGUOUS`; server-authored quote; onboarding/operator
  readiness `fee_blocker`; grep-loop clean; backend fee/authority/drift suites
  green.
- **Deferred to task 13.2 (E2E):** the full browser journey of a student hitting
  a fee-quote fail-closed state and an operator resolving the readiness blocker.
- **Pre-existing / out of scope:** `tests/contract/test_v2_endpoint_contract.py`
  has 6 failures (session/programs/application-detail/document/fee-resolve demo
  harness) that reproduce identically on the base commit `bae29a28d` with 5.4
  changes stashed — a v2 demo-harness envelope issue, not introduced by 5.4.

## Canonical truth map

Fee resolution keys on the canonical `FeeSchedule`/offering; the stable codes
`FEE_NOT_CONFIGURED` / `FEE_AMBIGUOUS` are already registered in the payment
error-code catalogue (`backend/apps/documents/payment_error_codes.py`) with its
frontend mirror (`apps/admissions/src/lib/paymentErrorCodes.ts`) and its
drift-guard test. No new domain concept was introduced.
