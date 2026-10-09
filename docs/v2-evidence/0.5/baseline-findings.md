# Task 0.5 — Baseline Findings (Immutable Pre-Change Snapshot)

**Spec:** `admissions-v2-canonical-rebuild` · **Task:** 0.5 · **Requirements:**
R1.5, R18.5 · **Findings:** GOV-04, GOV-05.
**Candidate commit:** `bae29a28d9657f288b3339062adb31285959c966` (branch `main`,
working tree dirty with in-flight tasks 0.1–1.5 plus user-owned edits).
**Captured:** 2026-07-15 (UTC). Supersedes the 2026-07-13 snapshot at the same
commit (the working tree evolved as tasks 1.2–1.5 landed; see `manifest.json`
→ `capture_history`).

This file records the **current, pre-change** failures, skips, and unverified
work observed while running the baseline suites for task 0.5. It is an honest
snapshot: nothing here was fixed, and no skipped/unverified work was relabeled
as complete (R1.5). These IDs are baseline observations (prefix `BL-0.5-`) that
feed the existing `findings.md` register; they are not new spec findings.

The full machine-readable manifest is `manifest.json`; raw reports are under
`raw/`.

## Summary Of Suite Results

| Suite | Result | Key numbers |
|---|---|---|
| Backend pytest (SQLite `config.settings.test`) | FAIL | 14 failed · 3565 passed · 138 skipped · 2 xfailed · 1 xpassed / 3720 collected |
| Admissions Vitest | FAIL | 3 real test failures · 3495 passed · 1 skipped (3499); 8 test **files** failed (3 real + 5 harness collection errors) / 431 files |
| Admissions type-check | PASS | — |
| Admissions lint | FAIL | 24 errors (18 R14.3 architecture-enforcement + 6 unused-directive) |
| Admissions build | PASS | chunk-size warnings only |
| Jobs-ops type-check / lint / build | PASS / PASS / PASS | dist 356 KB / gz 103 KB |
| OpenAPI generation (drf-spectacular) | PASS w/ 20 errors | version 2.0.0 · 147 paths · 20 non-fatal errors (5 V2 demo views) |
| OpenAPI committed baseline vs candidate | DRIFT (known) | v1 1.0.0/141 · committed v2 2.0.0/142 · fresh 2.0.0/147 |
| Impeccable detect | 2 findings (non-actionable) | Inter font (mandated) |
| Admissions check:all (imports/entry/CSP) | PASS | entry 89.0 KB gz |
| Launch bundle guard | FAIL | framer-motion on entry path |
| Static schema verifier | PASS | no-DB static check |
| Live migration verifier | BLOCKED (env) | localhost:5432, no credentials (never hit Neon/prod) |
| Neon read-only DB invariants | CAPTURED | see BL-0.5-08 |
| Route inventory (0.3 generator) | PASS (reproduced) | 185 routes · zero unclassified |
| Playwright browser suites | RUNTIME-GATED | 138 tests / 8 files enumerated, skip by default |

## Delta Since 2026-07-13

The candidate evolved (tasks 1.2–1.5 landed). Notable changes recorded honestly:

- Backend failures rose **4 → 14**: the 4 prior in-flight task-0.4 harness
  failures persist, and **9 new** in-flight task-1.3 V2-endpoint/contract
  failures appeared, plus **1** student-journey failure reflecting the in-flight
  email-verification contract change (task 1.6 / STU-21).
- Vitest gained **3 real assertion failures** (previously 0) from the in-flight
  task-1.4 `ApiClient` rewrite; the 5 harness collection-error files persist.
- Admissions lint rose **3 → 24 errors** because the R14.3 architecture-
  enforcement rule now exists (task 1.5); 18 first-party files still import
  `@/services/client` directly (awaiting migration).
- OpenAPI generation now **succeeds without `--skip-checks`** (the
  `django_ratelimit.E003` blocker no longer reproduces) but **emits 20 errors**
  from the 5 new V2 demo APIViews; path count 142 → 147.
- Route count 180 → 185 (the 5 new `/api/v2` demo endpoints).
- Neon DB invariants and schema fingerprint are **unchanged**.

## Baseline Findings

### BL-0.5-01 — Backend suite: 14 failing tests (all in in-flight V2 work)
Feeds: GOV-04, GOV-05. Severity: P2 (in-flight, not shipped-product regressions).
- **Task-0.4 harness (4, same as 2026-07-13):**
  - `tests/unit/test_harness_seed_tenants_command.py::test_seeds_two_tenants_with_active_domains_and_shared_canonical` — `Program.MultipleObjectsReturned`.
  - `tests/unit/test_perf_catalog_cache.py::test_neutral_request_never_served_a_tenant_cached_entry` — `assert 3 == 2`.
  - `tests/unit/test_perf_catalog_cache.py::test_tenant_request_never_served_the_neutral_cached_entry` — `assert 3 == 2`.
  - `tests/unit/test_brand_drift_guard.py::...::test_no_non_allowlisted_brand_strings_in_backend_apps` — `harness_seed_tenants` not on the brand allowlist.
- **Task-1.3 V2 endpoints/contract (9, new):**
  - `tests/contract/test_v2_endpoint_contract.py::TestV2SessionEndpoint::test_success_anonymous_user` — `KeyError: 'success'`.
  - `...TestV2SessionEndpoint::test_success_authenticated_user` — `KeyError: 'success'`.
  - `...TestV2ProgramListEndpoint::test_success_with_programs` — view returned a `MagicMock` instead of a `Response`.
  - `...TestV2ApplicationDetailEndpoint::test_success_owner_read` — `KeyError: 'success'`.
  - `...TestV2FeeResolveEndpoint::test_success_fee_resolved` — `KeyError: 'success'`.
  - `...TestV2DocumentListEndpoint::test_success_with_documents` — `apps.documents.models has no attribute 'Document'`.
  - `tests/unit/test_launch_verification_spectacular.py::...::test_schema_generation_emits_zero_errors` — `20 != 0` (the 20 V2-view spectacular errors).
  - `tests/unit/test_public_endpoint_policy.py::test_every_allow_any_view_has_public_endpoint_classification` — `V2SessionView` unclassified.
  - `tests/unit/test_schema_tags.py::test_no_operation_is_tagged_only_api` — 5 V2 operations tagged only `api`.
- **Task-1.6 / STU-21 email verification (1, new behavioral):**
  - `tests/integration/test_student_journey_e2e.py::...::test_full_student_journey` — `assert True is False` at line 303: a newly-registered account is now `email_verified=True`, but the test asserts it is `False`. Reflects the in-flight email-verification contract decision.
- Raw: `raw/backend-pytest.txt`, `raw/backend-pytest-junit.xml`, `raw/parse_junit_failures.py`.

### BL-0.5-02 — Backend suite: 138 skipped tests, not relabeled
Feeds: GOV-04, DATA-08. Severity: informational.
- Dominant reasons: Postgres-only checks skipped on SQLite (`pg_indexes`, jsonb
  `has_key`, `CREATE INDEX CONCURRENTLY`, `information_schema` FK joins, partial
  unique indexes, EXPLAIN plans) and Phase-gated future-work enforcement anchors
  (payment sensitive-fields lock Task 17.1, `RECEIPT_NOT_ELIGIBLE` gate,
  dev-bypass Phase 5, tenant-migration idempotency requiring
  `TENANT_MIGRATION_NEON_BRANCH=1`). A handful are stale (CSRF middleware
  refactor, pre-admin-force submission gates, "Database not available", legacy
  lenco archive absent).
- Consequence: the SQLite baseline does NOT prove Postgres schema/index/jsonb
  behavior. That must be exercised on a real Postgres (tasks 3.x/13.x).
- Raw: `raw/backend-pytest-skips.txt`.

### BL-0.5-03 — Vitest: 3 real failures + 5 harness collection-error files
Feeds: GOV-04. Severity: P2 (in-flight).
- **3 real assertion failures**, all from the in-flight task-1.4 `ApiClient`
  rewrite (`src/services/client.ts` modified):
  - `tests/property/refreshDeduplication.property.test.ts` — Property 7
    (N concurrent 401s → exactly 1 refresh) fails (fast-check).
  - `tests/property/test_bug4_preservation.test.ts` — Property 2b (successful
    401 refresh retries exactly once) fails (fast-check).
  - `tests/unit/sessionHardening.test.ts` — source-string assertion that
    `client.ts` contains `isPermissionDenial` no longer matches the rewritten file.
- **5 collection-error files**: `bun x vitest run` still picks up the task-0.4
  `tests/harness-e2e/**/*.spec.ts` Playwright specs and errors with
  "Playwright Test did not expect test()/test.describe()/test.afterAll()". The
  vitest config needs to exclude `tests/harness-e2e/`.
- Note: these are pre-existing/in-flight tests encountered during baseline
  capture; per task 0.5 they were recorded, not fixed.
- Raw: `raw/admissions-vitest.txt`, `raw/admissions-vitest.json`, `raw/parse_vitest.py`.

### BL-0.5-04 — Admissions lint fails: 24 errors (architecture rule now live)
Feeds: GOV-04, API-02, REL-01. Severity: P2 (in-flight / awaiting migration).
- 18 `no-restricted-imports` errors: the R14.3 architecture-enforcement rule
  (added by task 1.5 in `eslint.config.js`) forbids pages/components/hooks from
  importing `@/services/client` directly. 18 first-party files still do, awaiting
  migration to domain services by tasks 2.x/8.x/9.x/10.x.
- 6 `unused-eslint-disable-directive` errors (`useWizardController.ts`,
  `EducationStep.tsx`, `SubmitStep.tsx`, and task-0.4 harness `harness-fixtures.ts` ×2,
  `helpers/ops.ts` ×1).
- Change from 2026-07-13 (3 errors, all harness) because the rule now exists.
- Raw: `raw/admissions-lint.txt`.

### BL-0.5-05 — OpenAPI generation emits 20 non-fatal errors (V2 demo views)
Feeds: GOV-05. Severity: P2 (in-flight task 1.3).
- `manage.py spectacular` now **succeeds without `--skip-checks`** (the prior
  `django_ratelimit.E003` "LocMemCache is not a shared cache" system-check
  blocker no longer reproduces in this environment). However it emits **20
  errors (5 unique)** because the new V2 demo APIViews
  (`apps/common/v2/demo_views.py`: `V2SessionView`, `V2ProgramListView`,
  `V2FeeResolveView`, `V2ApplicationDetailView`, `V2DocumentListView`) lack a
  `serializer_class` and fall back gracefully. Version 2.0.0, 147 paths.
- Raw: `raw/openapi-candidate.yaml`, `raw/openapi-generation.txt`.

### BL-0.5-06 — Launch bundle guard fails (framer-motion on entry path)
Feeds: MAINT/REL bundle budgets. Severity: P2 (real regression in product build).
- `Bundle_Guard FAILED: Forbidden chunk(s) on entry path:
  vendor-framer-motion-*.js (framer-motion)`. Entry path 144.1 KB gz over 19
  chunks (under the 150 KB budget); first PDF action 766.4 KB gz (under the
  772 KB budget). Only the forbidden-chunk rule fails. Unchanged since 2026-07-13.
- Raw: `raw/admissions-launch-bundle-guard.txt`.

### BL-0.5-07 — Contract drift: committed baselines vs freshly generated candidate
Feeds: GOV-05, REL-01. Severity: known/expected.
- `backend/schema/openapi.v1.baseline.yaml` frozen at 1.0.0/141 (sha `371587…`).
- `backend/schema/openapi.v2.candidate.yaml` committed at 2.0.0/142 (sha
  `233e75…`) is already **stale** vs the source freshly generated at 2.0.0/147
  (sha `5bb6ab…`) because tasks 1.3/1.5 remain in flight. A stabilized V2
  baseline is owned by tasks 1.2/1.5.

### BL-0.5-08 — Neon authoring DB lacks canonical assignment data/columns
Feeds: DATA-01, DATA-02, DATA-07, DATA-11, STU-01. Severity: P0 (data integrity;
must be reconciled before V2 canonical cutover). **Scope: Neon authoring/dev DB,
NOT production.** Unchanged since 2026-07-13.
- All 33 `applications` rows have NULL `institution_id`, `program_offering_id`,
  and `intake_id`.
- `applications.canonical_program_id` and `applications.intake_offering_id`
  columns **do not exist** on this database.
- `canonical_programs` table is empty (0 rows).
- `user_institution_memberships` has 0 active rows.
- `payments`: 21 rows, 0 with NULL `application` (no orphan payments here).
- 2 active institutions; 0 duplicate active hostnames.
- Schema fingerprint (sha256): `c48f57d9b789631f041026fa1568e49ca9a22b5e58f3abd9b39dec6755af4a2b`;
  73 public tables, 788 columns, 93 FKs (0 NOT VALID), 299 indexes, 44
  migration_history rows.
- Note: this contradicts the "canonical IDs populated" claim recorded for
  DATA-01, which referenced production evidence. The authoring DB and production
  clearly differ; tasks 3.x must reconcile both.
- Raw: `raw/db-invariants.json`, `raw/db_readonly_introspect.py`.

### BL-0.5-09 — Live migration verifier cannot run in this environment
Feeds: DATA-08, DATA-09. Severity: informational (env blocker). Unchanged.
- `scripts/verify_migration.py` uses `config.settings.dev` → `localhost:5432`;
  all 30 table checks fail with `fe_sendauth: no password supplied` (59 errors).
  It never connected to Neon or production. Read-only Neon introspection
  (BL-0.5-08) was captured instead.
- Raw: `raw/verify_migration-attempt.json`.

### BL-0.5-10 — Browser journey suites are runtime-gated (GOV-04, confirmed)
Feeds: GOV-04. Severity: P1 (until the 0.4 harness fully supersedes them).
- The 8 legacy Playwright e2e specs (`accessibility`, `adminJourney`,
  `applicationFlow`, `canonicalMultiTenantAlignment`, `mobileBreakpointScreenshots`,
  `studentJourney`, `styling-smoke`, `whiteLabelHostOverride`) enumerate 138
  tests but skip by default: gated behind env flags (`STUDENT_JOURNEY_E2E`,
  `ADMIN_JOURNEY_E2E`, `WHITE_LABEL_E2E`, `CANONICAL_MULTI_TENANT_E2E`,
  `UI_SCREENSHOTS_E2E`) and requiring external storage state
  (`PLAYWRIGHT_STORAGE_STATE` / role storage states), an external base URL, and
  staff credentials (28 `test.skip` guards observed). They were NOT run and are
  NOT counted as passing. The un-gated replacement is the task-0.4 harness
  (`playwright.harness.config.ts` + `harness/bin/harness smoke`), evidenced in
  `docs/v2-evidence/0.4/`.
- Raw: `raw/playwright-e2e-list.txt`.

### BL-0.5-11 — Impeccable detect: 2 findings conflicting with mandated Inter font
Feeds: design steering. Severity: non-actionable.
- Both findings are `[overused-font]` on `Inter` in `src/index.css` (lines 16,
  52). Inter (with full fallback chain) is a mandated product decision; recorded
  as a tool/steering conflict, not a defect.
- Raw: `raw/impeccable-detect.txt`.

## Environment Notes

- Backend tests run on **SQLite** (`config.settings.test`); the repo documents
  this as the fast local suite and explicitly defers Postgres-specific checks.
- Toolchain: bun 1.3.14, node v24.15.0, python 3.14.4 (backend `.venv`), docker
  29.1.3. Steering (`tech.md`) targets Python 3.12+; the venv runs 3.14.4.
- DB facts come from **read-only** SELECT introspection of the Neon authoring
  database via `backend/.env` `DATABASE_URL` inside a `READ ONLY` transaction —
  no writes, no DDL, no production access.
- No product source was modified for this capture. The one guard-generated file
  a measurement command touched (`docs/launch-evidence/05-bundle/bundle-evidence.json`)
  was restored to its committed state; the stray `verify_migration` run-log was
  removed. The worktree was left as found apart from `docs/v2-evidence/0.5/**`.
