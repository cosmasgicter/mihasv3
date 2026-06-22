# Implementation Plan: Beanola Launch Verification

## Overview

This plan builds the launch-verification evidence harness in dependency order:
the shared `Evidence_Artifact` envelope, the secret-redaction helper, the evidence
store layout, and the rollup aggregator (Gate 12) come first because every gate
feeds them. Each of the 11 gates is then built **pure-logic core first**
(property-tested predicates/evaluators) before its integration/execution wrapper.
CI wiring, operator/deployed-target runbooks, and the final rollup output close
the plan.

Conventions honored throughout (per steering): `python3` + `pytest`/`hypothesis`
for `backend/` and root `scripts/launch-verification/`, Bun + Vitest/`fast-check`
for `apps/admissions`, routes under `/api/v1/`, no public Postgres port,
Neon-first/operator-gated production writes, and no PII/secret logging. Property
tests run a minimum of 100 iterations and are tagged
`Feature: beanola-launch-verification, Property {n}: {text}`.

Execution against live/deployed/production targets (running Lighthouse, driving a
live browser, SSHing to EC2, applying SQL) is **operator-run or deployed-target**
and is documented in runbooks — it is **not auto-run in CI**. The coding tasks
below write the scripts, pure-logic cores, and tests over fixtures.

## Tasks

- [x] 1. Shared evidence foundation
  - [x] 1.1 Define the Evidence_Artifact envelope, types, and evidence-store layout
    - Implement `backend/apps/common/launch_verification/evidence.py` with the common envelope (`gate_id`, `requirement`, `status` closed enum `passed|failed|unknown`, `generated_at`, `generated_by`, `summary`, `checks[]`, `assets[]`, `failures[]`) plus JSON (de)serialize helpers
    - Mirror the envelope as TS types in `apps/admissions/tests/contract/evidenceArtifact.ts` for the TS-side gates
    - Create the `docs/launch-evidence/` store layout (`01-migration/` … `11-scope/`, `rollup.json`, `launch-readiness.md`) with `.gitkeep` placeholders
    - _Requirements: 12.6_
  - [x] 1.2 Implement the shared secret-redaction helper
    - Implement `backend/apps/common/launch_verification/redaction.py` that strips connection strings, DB passwords, API keys, raw phone numbers, NRC/passport values, and document bodies; every gate writes artifacts through it
    - _Requirements: 1.9, 9.4, 9.9_
  - [x]* 1.3 Write property test for the redaction helper
    - **Property 16: Evidence artifacts never contain a secret value (redaction)**
    - **Validates: Requirements 1.9, 9.4, 9.9**
    - `backend/tests/property/test_launch_verification_redaction.py` (hypothesis, ≥100 iterations)
  - [x] 1.4 Define the rollup status object schema
    - Extend `evidence.py` with the rollup record: `verdict` closed enum (`production-launch-ready|not-production-launch-ready`), enumerated `gates[]` (with `artifact` + `artifact_readable`), `not_passed[]`, and `missing_or_unreadable[]`
    - _Requirements: 12.1_

- [x] 2. Gate 12 — Rollup aggregator
  - [x] 2.1 Implement the rollup aggregator
    - Implement `scripts/launch-verification/rollup.py` as a pure read of the 11 gate artifacts plus a filesystem readability probe; conservative default (missing/unknown/unreadable ⇒ not passed); enumerate all 11 gates; write `docs/launch-evidence/rollup.json`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_
  - [x]* 2.2 Write property test for the launch-ready verdict
    - **Property 1: Rollup is launch-ready iff every gate passed and every artifact is readable**
    - **Validates: Requirements 12.1, 12.2, 12.4, 12.5**
    - `backend/tests/property/test_launch_verification_rollup.py` (hypothesis, ≥100 iterations)
  - [x]* 2.3 Write property test for the conservative default
    - **Property 2: Missing, unknown, or unreadable gates force not-ready (conservative default)**
    - **Validates: Requirements 12.3, 2.6, 6.7, 6.8**
    - Same file as 2.2
  - [x]* 2.4 Write integration test over a fixture evidence store
    - Cover all-pass, one-fail, missing-gate, and unreadable-artifact cases
    - _Requirements: 12.1, 12.2, 12.3, 12.5_

- [x] 3. Checkpoint — foundation and rollup
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Gate 5 — Bundle_Guard
  - [x] 4.1 Implement the pure bundle predicate (exclusion + size thresholds)
    - Implement `apps/admissions/scripts/launchBundlePredicate.ts`: forbidden-marker exclusion set (`@react-pdf`, `vendor-pdf`, `jspdf`, `pdf-lib`, `html2canvas`, OCR/`tesseract`, chart/`recharts`, admin-only page chunks, public-route `vendor-sentry`), the 150 KB-gz entry budget, and the 772 KB-gz document-generation budget
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_
  - [x]* 4.2 Write property test for the entry-path exclusion check
    - **Property 3: The bundle entry-path guard fails iff an excluded chunk is present**
    - **Validates: Requirements 5.1, 5.2, 5.7, 5.8**
    - `apps/admissions/tests/property/launchVerificationBundle.property.test.ts` (fast-check, ≥100 iterations)
  - [x]* 4.3 Write property test for the size-threshold checks
    - **Property 4: Size-threshold checks fail iff a measured size exceeds its budget**
    - **Validates: Requirements 5.3, 5.4, 5.5, 5.6**
    - Same file as 4.2
  - [x] 4.4 Implement the launch-bundle-guard wrapper and evidence emission
    - Implement `apps/admissions/scripts/launch-bundle-guard.ts` extending `check:entry`; emit `docs/launch-evidence/05-bundle/bundle-evidence.json` via the shared envelope; return non-zero exit on any violation
    - _Requirements: 5.1, 5.3, 5.5, 5.7_
  - [x]* 4.5 Write unit test for the bundle guard against a fixture `dist/`
    - `apps/admissions/tests/unit/launchBundleGuard.test.ts` — confirm budget + exclusion behavior
    - _Requirements: 5.2, 5.4, 5.6, 5.8_

- [x] 5. Gate 4 — Mobile_UI_Gate
  - [x] 5.1 Extract the pure DOM defect detectors
    - Implement `apps/admissions/tests/playwright/detectors.ts` with the six deterministic detectors (horizontal overflow, clipped button text, undersized touch target, icon-only control without accessible name, overlapping layout regions, broken dialog)
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_
  - [x]* 5.2 Write property test for detector determinism
    - **Property 5: Mobile-UI defect detectors are deterministic and fire exactly when their defect is present**
    - **Validates: Requirements 4.3, 4.4, 4.5, 4.6, 4.7, 4.8**
    - `apps/admissions/tests/property/launchVerificationDetectors.property.test.ts` (fast-check over synthetic DOM fixtures, ≥100 iterations)
  - [x]* 5.3 Write property test for the route+viewport matrix rollup
    - **Property 6: A route+viewport matrix passes overall iff every cell passes**
    - **Validates: Requirements 4.10**
    - Same file as 5.2
  - [x] 5.4 Implement the Playwright mobile-UI spec (deployed-target; not auto-run in CI)
    - Implement `apps/admissions/tests/playwright/launch-mobile-ui.spec.ts` driving the detectors across viewports 360×800, 390×844, 768×1024, 1024×768, 1440×900 over the public/auth/student/admin route sets; capture labeled screenshots for `/admin/tenants` and `/admin/applications` at each viewport; emit `docs/launch-evidence/04-mobile-ui/mobile-ui-evidence.json`
    - _Requirements: 4.1, 4.2, 4.9, 4.11_

- [x] 6. Gate 3 — Performance_Gate
  - [x] 6.1 Implement the performance pure-logic evaluator
    - Implement `scripts/launch-verification/performance_eval.py`: median-of-≥3-runs Lighthouse scoring with route-class thresholds (Public ≥ 90, Authenticated/admin ≥ 80), and the p50/p95 percentile + ≥100-sample-count evaluation across the 12 API surfaces with measured-vs-target recording
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - [x]* 6.2 Write property test for Lighthouse median/threshold scoring
    - **Property 8: Lighthouse scoring uses the median of runs and passes against the class threshold**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.6**
    - `backend/tests/property/test_launch_verification_performance.py` (hypothesis, ≥100 iterations)
  - [x]* 6.3 Write property test for API timing percentiles and sample sufficiency
    - **Property 9: API timing uses correct percentiles and requires sufficient samples**
    - **Validates: Requirements 3.4, 3.7**
    - Same file as 6.2
  - [x] 6.4 Implement the Lighthouse runner and API timing sampler (deployed-target; operator/scheduled, not auto-run in CI)
    - Implement `scripts/launch-verification/run-lighthouse.mjs` and `scripts/launch-verification/sample-api-timings.py`; feed the evaluator and emit `docs/launch-evidence/03-performance/performance-evidence.json` plus raw Lighthouse HTML/JSON and the timing CSV
    - _Requirements: 3.1, 3.4, 3.5_

- [x] 7. Checkpoint — frontend and performance gate logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Gate 2 — Smoke_Test_Gate
  - [x] 8.1 Implement the smoke reachability predicate
    - Implement `scripts/launch-verification/smoke_eval.py` (pure): a surface passes iff status is non-error and latency ≤ 10000 ms; `/admin/tenants` and `/beanola-admin-panel/` are always two distinct results; a state-changing request without valid cookie auth + CSRF passes only if rejected
    - _Requirements: 2.2, 2.3, 2.4, 2.5_
  - [x]* 8.2 Write property test for surface reachability
    - **Property 7: A reachability surface passes iff it responds non-error within the timeout**
    - **Validates: Requirements 2.2, 2.3, 2.4**
    - `backend/tests/property/test_launch_verification_smoke.py` (hypothesis, ≥100 iterations)
  - [x] 8.3 Implement the run-smoke-gate wrapper (deployed-target; not auto-run in CI)
    - Implement `scripts/launch-verification/run-smoke-gate.py` wrapping `scripts/smoke-production.sh` and `backend/scripts/staging_smoke.py`, adding the two distinct admin-surface checks and the unauth/no-CSRF rejection probe; emit `docs/launch-evidence/02-smoke/smoke-evidence.json`
    - _Requirements: 2.1, 2.5, 2.6_

- [x] 9. Gate 7 — Brand_Scan_Gate
  - [x] 9.1 Implement the brand-leak predicate and allowlist validator
    - Implement `scripts/launch-verification/brand_eval.py` (pure): leak-set-outside-allowlist predicate, allowlist JSON validity, per-entry single-existing-file + single-classification + live-pattern (staleness) checks
    - _Requirements: 7.1, 7.2, 7.4, 7.6_
  - [x]* 9.2 Write property test for the leak-set acceptance
    - **Property 10: The brand scan passes iff the leak set outside the allowlist is empty**
    - **Validates: Requirements 7.1, 7.7**
    - `backend/tests/property/test_launch_verification_brand.py` (hypothesis, ≥100 iterations)
  - [x]* 9.3 Write property test for allowlist validity
    - **Property 11: An allowlist is valid iff every entry references one existing file with one classification and a live pattern**
    - **Validates: Requirements 7.4, 7.5, 7.6**
    - Same file as 9.2
  - [x] 9.4 Implement the run-brand-scan wrapper and evidence
    - Implement `scripts/launch-verification/run-brand-scan.py` running the scan across guard-defined active source paths and validating `docs/legacy-brand-allowlist.json`; emit `docs/launch-evidence/07-brand/brand-evidence.json`; record parse errors with no passing result; non-zero exit on leak/parse-error/stale-entry
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.7_

- [x] 10. Gate 8 — Contract_Sync_Gate
  - [x] 10.1 Implement the pure contract comparator and coverage logic
    - Implement `apps/admissions/tests/contract/contractComparator.ts`: field-for-field request/response shape comparison including the `{"success": true, "data": ...}` envelope, backend-error-code mapping coverage, and tenant-admin-tab coverage
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6_
  - [x]* 10.2 Write property test for shape-divergence detection
    - **Property 12: The contract comparator reports divergence iff a frontend shape differs from its serializer**
    - **Validates: Requirements 8.2, 8.5**
    - `apps/admissions/tests/property/launchVerificationContract.property.test.ts` (fast-check, ≥100 iterations)
  - [x]* 10.3 Write property test for error-code mapping coverage
    - **Property 13: Error-code mapping coverage holds iff every backend code is mapped on the frontend**
    - **Validates: Requirements 8.4, 8.6**
    - Same file as 10.2
  - [x]* 10.4 Write property test for tenant-admin tab coverage
    - **Property 14: Tenant-admin tab coverage holds iff every listed tab has at least one checked endpoint**
    - **Validates: Requirements 8.3**
    - Same file as 10.2
  - [x] 10.5 Implement the check-contract-sync orchestrator
    - Implement `scripts/launch-verification/check-contract-sync.py` generating the OpenAPI artifact in the same run, running the comparator over `apps/admissions/src/services/admin/tenants.ts` shapes for all eleven tabs; emit `docs/launch-evidence/08-contract/contract-evidence.json` + `openapi.yaml`; fail on divergence/unmapped code recording field name + endpoint path
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6_

- [x] 11. Gate 6 — Suite_Execution_Gate
  - [x] 11.1 Resolve the `CanonicalProgramSerializer.get_available_offerings` spectacular warning
    - Annotate `get_available_offerings` (e.g. `@extend_schema_field`) in the backend serializer so `manage.py spectacular` emits zero warnings — this is a real backend code change
    - _Requirements: 6.6_
  - [x]* 11.2 Write unit test asserting zero spectacular warnings
    - `backend/tests/unit/test_launch_verification_spectacular.py` — assert zero warnings including resolution of the `get_available_offerings` warning
    - _Requirements: 6.5, 6.6_
  - [x] 11.3 Implement the suite-results collector
    - Implement `scripts/launch-verification/collect-suite-results.py` parsing exit code, executed/passed/failed/skipped counts, and error/warning counts for each required suite (admissions type-check, lint `--max-warnings 0`, build, unit, property, Playwright smoke; backend `manage.py check`, full `pytest`, `manage.py spectacular`); emit `docs/launch-evidence/06-suite/suite-evidence.json` with conservative pass rollup
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_
  - [x]* 11.4 Write unit test for the suite-results parser over sample outputs
    - `backend/tests/unit/test_launch_verification_suite_collector.py`
    - _Requirements: 6.7, 6.8_

- [x] 12. Gate 11 — Scope_Gate
  - [x] 12.1 Implement the scope reachability predicate
    - Implement `scripts/launch-verification/scope_eval.py` (pure): `ENABLE_JOBS_OPS_ROUTES` must be `False`; a jobs/automation/integrations stub route under `/api/v1/` without a recorded ship decision passes only if it is unreachable (request rejected as not found rather than served)
    - _Requirements: 11.1, 11.2, 11.3, 11.4_
  - [x]* 12.2 Write property test for un-shipped stub-route scope
    - **Property 20: An un-shipped stub route passes scope only if it is unreachable**
    - **Validates: Requirements 11.3, 11.4**
    - `backend/tests/property/test_launch_verification_scope.py` (hypothesis, ≥100 iterations)
  - [x] 12.3 Implement the check-launch-scope wrapper and evidence
    - Implement `scripts/launch-verification/check-launch-scope.py` asserting the flag and probing stub routes against `backend/config/urls.py`; emit `docs/launch-evidence/11-scope/scope-evidence.json`; block launch and record the value / full route paths on failure
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 13. Checkpoint — automated CI gate logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Gate 1 — Migration_Evidence_Gate
  - [x] 14.1 Implement the migration invariant and idempotency/backup-timing evaluator
    - Implement `scripts/launch-verification/migration_eval.py` (pure): tenant invariant evaluation (`canonical_programs ≥ 1`, active `institutions ≥ 1`, zero duplicate hostnames, zero duplicate slugs, active memberships ≥ 1), idempotent zero-delta second-apply check, backup-precedes-apply-by-≤-60-min check, and dry-run-error withholding posture
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.10_
  - [x]* 14.2 Write property test for invariant evaluation
    - **Property 17: Migration invariant evaluation passes iff all tenant invariants hold**
    - **Validates: Requirements 1.4, 1.5**
    - `backend/tests/property/test_launch_verification_migration.py` (hypothesis, ≥100 iterations)
  - [x]* 14.3 Write property test for idempotency and backup timing
    - **Property 18: Idempotent re-apply produces a zero delta, and backup precedes apply within the window**
    - **Validates: Requirements 1.3, 1.6**
    - Same file as 14.2
  - [x] 14.4 Implement the record-migration-evidence script (operator-gated, read-only capture)
    - Implement `scripts/launch-verification/record-migration-evidence.py` collecting operator command output (Neon dry-run, staging apply, idempotency apply, validation SQL, backup proof, rollback/disable posture) into `docs/launch-evidence/01-migration/migration-evidence.json` through the redaction helper; it performs no production writes itself
    - _Requirements: 1.1, 1.2, 1.7, 1.8, 1.9, 1.10_
  - [x]* 14.5 Write unit test for the recorder over captured-output fixtures
    - `backend/tests/unit/test_launch_verification_migration_recorder.py`
    - _Requirements: 1.2, 1.8, 1.9_

- [x] 15. Gate 9 — Operational_Readiness_Gate
  - [x] 15.1 Implement the operational-readiness settings evaluator (present/absent only)
    - Implement `scripts/launch-verification/operational_eval.py` (pure): `DEBUG` off; `SECRET_KEY` ≥ 50 chars and ≠ any tracked example/template value; secure cookies, trusted origins, CORS/CSRF hosts, HTTPS redirect, HSTS ≥ 31536000 s, CSP present and non-empty; per-user rate limit > 0 on every payment/auth/AI endpoint; audit retention 90/365; backup/restore drill RTO ≤ 60 min and 0-row RPO variance — records each failing setting **by name without its value**
    - _Requirements: 9.1, 9.2, 9.3, 9.5, 9.6, 9.7, 9.8_
  - [x]* 15.2 Write property test for the settings check
    - **Property 15: The operational-readiness settings check passes iff every required setting satisfies its rule**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.5, 9.7**
    - `backend/tests/property/test_launch_verification_operational.py` (hypothesis, ≥100 iterations)
  - [x] 15.3 Implement the check-operational-readiness script (operator-gated)
    - Implement `scripts/launch-verification/check-operational-readiness.py` inspecting production configuration and recording only credential/setting names with present/absent indicators through the redaction helper; emit `docs/launch-evidence/09-operational/operational-evidence.json`; leave production configuration unchanged
    - _Requirements: 9.4, 9.6, 9.8, 9.9_
  - [x]* 15.4 Write unit test for the operational checker over config fixtures
    - `backend/tests/unit/test_launch_verification_operational_checker.py` — confirm present/absent-only output, never values
    - _Requirements: 9.4, 9.9_

- [x] 16. Gate 10 — Onboarding_Smoke_Gate
  - [x] 16.1 Implement the onboarding step sequencer (halt-at-first-failure)
    - Implement `scripts/launch-verification/onboarding_eval.py` (pure): given a sequence of step results, halt at the first failed/errored/>60 s step, record it as the failing step, and mark no later step passed
    - _Requirements: 10.12_
  - [x]* 16.2 Write property test for halt-at-first-failure
    - **Property 19: Onboarding smoke halts at the first failing step and marks no later step passed**
    - **Validates: Requirements 10.12**
    - `backend/tests/property/test_launch_verification_onboarding.py` (hypothesis, ≥100 iterations)
  - [x] 16.3 Implement the run-onboarding-smoke script (deployed-target; not auto-run in CI)
    - Implement `scripts/launch-verification/run-onboarding-smoke.py` driving the end-to-end tenant onboarding journey against the deployed tenant-admin API with per-step scoped-to-school assertions (create school → assets → document profile/template → program/offering → membership/grant → routing simulator → student application → scoped-staff read → super-admin read → payment verified → official document); emit `docs/launch-evidence/10-onboarding/onboarding-evidence.json`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11_

- [x] 17. Checkpoint — operator-gated and deployed-target gate logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. CI wiring for the automated gates (`.github/workflows/ci.yml`)
  - [x] 18.1 Wire Bundle_Guard (Gate 5) into the `admissions` job
    - Add a step after `Build` running `launch-bundle-guard.ts`; upload the artifact and write `docs/launch-evidence/05-bundle/`
    - _Requirements: 5.1, 5.3_
  - [x] 18.2 Wire Suite_Execution_Gate (Gate 6) into the suite jobs
    - Add a `collect-suite-results.py` step across the `admissions`/`backend`/`backend-property` jobs and assert the zero-warning spectacular requirement; upload `docs/launch-evidence/06-suite/`
    - _Requirements: 6.6, 6.7_
  - [x] 18.3 Wire Brand_Scan_Gate (Gate 7) into the drift-guard jobs
    - Add `run-brand-scan.py` (scan + allowlist validity/staleness) to the drift-guard jobs; upload `docs/launch-evidence/07-brand/`
    - _Requirements: 7.1, 7.2_
  - [x] 18.4 Wire Contract_Sync_Gate (Gate 8) into the `backend` job
    - Add a step after `OpenAPI schema generation` running `check-contract-sync.py`; upload `docs/launch-evidence/08-contract/`
    - _Requirements: 8.1_
  - [x] 18.5 Wire Scope_Gate (Gate 11) into CI
    - Add a lightweight step asserting `ENABLE_JOBS_OPS_ROUTES=False` and probing un-shipped stub routes; upload `docs/launch-evidence/11-scope/`
    - _Requirements: 11.1, 11.4_

- [x] 19. Runbook documentation for operator-gated and deployed-target gates
  - [x] 19.1 Extend `docs/runbooks/post-deploy-smoke-check.md` for Smoke_Test_Gate (Gate 2)
    - Document the `run-smoke-gate.py` operator procedure, the two distinct admin-surface checks, and the evidence location — mark as operator/post-deploy, not auto-run in CI
    - _Requirements: 2.1_
  - [x] 19.2 Create `docs/runbooks/launch-verification.md` for Gates 1, 3, 4, 9, 10
    - Document how to run the migration-evidence capture (backup-first via `deploy/backup-db.sh`, Neon-first), the Lighthouse runner + API timing sampler, the Playwright mobile-UI harness, the operational-readiness checker, and the onboarding smoke against a staging/production-like target, with each gate's evidence path; clearly mark operator-run and deployed-target steps as not auto-run in CI
    - _Requirements: 1.6, 1.7, 3.1, 4.1, 9.5, 9.8, 10.1_

- [x] 20. Final rollup wiring and launch-readiness output
  - [x] 20.1 Wire the rollup into the CI/operator flow and produce `launch-readiness.md`
    - Add a final `rollup.py` step (CI for the automated-gate verdict; operator once all artifacts are present) writing `docs/launch-evidence/rollup.json` and the human-readable `docs/launch-evidence/launch-readiness.md`; launch is approved only when the verdict is `production-launch-ready`
    - _Requirements: 12.1, 12.4, 12.6_

- [x] 21. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a
  faster MVP; core implementation tasks are never optional.
- Property tests cover all 20 correctness properties, one test per property,
  co-located with the gate they validate, ≥100 iterations, tagged
  `Feature: beanola-launch-verification, Property {n}: {text}`.
- Frontend pure-logic properties (bundle predicate, mobile-UI detectors, contract
  comparator) use **fast-check** under `apps/admissions/tests/property/`; backend
  pure-logic properties (redaction, rollup, smoke, performance, brand,
  operational, migration, scope, onboarding) use **hypothesis** under
  `backend/tests/property/`.
- Steps that execute against live/deployed/production targets (Gates 1, 2, 3, 4,
  9, 10) are **operator-run or deployed-target** and documented in runbooks; they
  are not auto-run in CI. CI runs the automated gates (5, 6, 7, 8, 11) and the
  rollup.
- All production interaction stays Neon-first, operator-gated, backup-first, with
  no public Postgres port and no PII/secret in any artifact (enforced by the
  shared redaction helper and Property 16).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4"] },
    { "id": 2, "tasks": ["2.1", "4.1", "5.1", "6.1", "8.1", "9.1", "10.1", "11.1", "12.1", "14.1", "15.1", "16.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "4.2", "4.3", "4.4", "5.2", "5.3", "5.4", "6.2", "6.3", "6.4", "8.2", "8.3", "9.2", "9.3", "9.4", "10.2", "10.3", "10.4", "10.5", "11.2", "11.3", "12.2", "12.3", "14.2", "14.3", "14.4", "15.2", "15.3", "16.2", "16.3"] },
    { "id": 4, "tasks": ["4.5", "11.4", "14.5", "15.4"] },
    { "id": 5, "tasks": ["18.1", "19.1", "19.2"] },
    { "id": 6, "tasks": ["18.2"] },
    { "id": 7, "tasks": ["18.3"] },
    { "id": 8, "tasks": ["18.4"] },
    { "id": 9, "tasks": ["18.5"] },
    { "id": 10, "tasks": ["20.1"] }
  ]
}
```
