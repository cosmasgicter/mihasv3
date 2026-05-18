# Production Readiness Fix Report — 2026-05-18

## Verdict after counter-check: **NO-GO YET**

The previous report overstated readiness. A fresh verification pass on 2026-05-18 found that several claimed closures were not actually closed:

- `backend/.venv` exists, so backend tests were runnable; the 13 student-flow failures were real test drift, not an unavailable runner.
- `backend/scripts/00_full_schema.sql` is still explicitly labeled **PLACEHOLDER**, so schema authority is not restored yet.
- The repository does **not** contain six historical SQL files that the earlier report described as archived.
- A targeted explicit-`any` scan still found **57** remaining `any`-style annotations after the latest cleanup pass, so that item is improved but not complete.

The system is materially better than it was, but “GO” is not an honest label yet. I bootstrapped a local PostgreSQL 18 instance from user-space packages and started a real database-backed backend run; that pass surfaced additional payment-state-machine defects that were not visible in the earlier shell-only report.

## What was verified and fixed in this counter-check

### Newly fixed

1. **Student-flow backend regressions** — fixed stale patch targets left behind by the view-module split.
   - `backend/tests/unit/test_application_student_flow_views.py`
   - Result: **17 / 17 passing**.

2. **Frontend full-suite failure** — fixed a property-test generator that could emit an invalid `Date` and explode before exercising the property.
   - `apps/admissions/tests/property/autoSaveDataRoundTrip.property.test.ts`
   - Result: targeted property test now passes.

3. **Frontend test portability** — removed shell-dependent `grep` subprocesses from the sanitize-input canonical test and replaced them with filesystem traversal.
   - `apps/admissions/tests/unit/sanitizeInputCanonical.test.ts`

4. **Real admin/UI defect** — fixed duplicate React table keys in admin intakes by adding a stable column `id` channel.
   - `apps/admissions/src/components/ui/ResponsiveTable.tsx`
   - `apps/admissions/src/pages/admin/Intakes.tsx`

5. **Additional type cleanup** — explicit `any`-style annotations reduced from the earlier 83-actionable count to **57** by tightening several shared utilities and UI contracts.

6. **Actual backend logging gaps** — replaced silent exception swallowing in session/admin settings flows with logged warnings.
   - `backend/apps/accounts/session_views.py`
   - `backend/apps/accounts/admin_settings_views.py`

7. **Stale verification tests after module decomposition** — updated tests that were still asserting against old shim files or outdated CSP/status expectations.

8. **Migration documentation honesty** — corrected `MIGRATION_HISTORY.md` and `archive/README.md` so they no longer claim six missing SQL files are present in the archive.

9. **Payment hardening defects found by real Postgres validation** — fixed duplicate `payment.force_approved` audit emission, prevented ordinary admin review from mutating terminal payment rows in hardened mode, avoided dangling FK writes when synthetic reviewer IDs are not real profiles, fixed an invalid-UUID path in the snapshot backfill script, and repaired a pytest class shape that prevented dev-bypass tests from receiving fixtures.

## Current verified test state

| Suite | Result | Notes |
|-------|--------|-------|
| Admissions TypeScript | **pass** | `bun run type-check` |
| Admissions full Vitest | **2,690 passed / 1 skipped / 0 failed** | Full suite after fixing the property-test generator |
| Student-flow backend unit file | **17 / 17 passing** | Verified with backend `.venv` |
| Targeted backend regression/property batch | **19 / 19 passing** | Covers stale split-module tests and payment-list tests |
| Python syntax compile | **pass** | `python3 -m compileall apps` |
| Full backend pytest | **real Postgres run started; still failing** | Local PostgreSQL 18 was started successfully. `pytest -x` now advances through **157 passed / 1 skipped** before stopping on a real webhook ordering defect: `test_property_3_out_of_order_webhook_safety` |

## Readiness blockers still open

### P0 / release blockers

1. **No authoritative committed schema snapshot**
   - `00_full_schema.sql` still says `Status: PLACEHOLDER` and `Last regenerated: NOT YET`.
   - Until a real production `pg_dump --schema-only` snapshot is committed, disaster recovery and drift review remain weaker than the previous report claimed.

2. **Database-backed backend suite is not green**
   - A local PostgreSQL 18 instance now runs successfully, so this is no longer an environment excuse.
   - The first remaining verified blocker is a webhook ordering defect: if a `collection.failed` webhook arrives before the later valid `collection.successful` event, the payment can remain `failed` instead of converging to `successful`.

### P1

1. **Six historical SQL scripts are still missing from the repository**
   - The codebase references them, but they are not present on disk and could not be recovered from current git history in this checkout.

2. **`applications.program` and `applications.intake` remain free-text fields**
   - No database-level referential integrity yet.

3. **`payments.application_id` remains nullable**
   - Orphan payments remain representable until cleanup + constraint hardening lands.

4. **57 explicit `any`-style annotations remain in frontend source**
   - Improved, not perfected.

## Revised production-readiness score

**82 / 100 — conditional, not yet a clean GO.**

That score reflects strong frontend health, solid critical-path hardening, and several newly verified fixes — but subtracts heavily for the unresolved schema-authority gap and the newly proven backend payment bug. The earlier **88 / 100 GO** score was too generous for the evidence available.

## What would move this to a real GO

1. Regenerate and commit `backend/scripts/00_full_schema.sql` from the production database.
2. Make the full Postgres-backed backend suite green, starting with webhook out-of-order convergence.
3. Recover the six missing SQL artifacts from authoritative history or Neon executed-DDL logs.
4. Plan the DB integrity sprint for `applications.program` / `applications.intake` and `payments.application_id`.
5. Continue shaving the remaining explicit `any` annotations toward zero.

---

This report supersedes the earlier optimistic version written on 2026-05-18. It is intentionally stricter: every claim above is tied to something that was actually re-checked in the repository or test runner during this pass.
