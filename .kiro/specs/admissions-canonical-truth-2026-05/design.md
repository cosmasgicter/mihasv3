# Admissions Canonical Truth Program — Design

## Problem

Backend, frontend, and database had drifted into mutually-inconsistent vocabularies:

- 5 callsites of `transition_application_status(changed_by="system")` silently failed at the Postgres FK layer because `"system"` is not a UUID. Four daily Celery tasks (draft expiry, condition expiry, enrollment expiry, waitlist auto-promote) were no-ops in production.
- AI hardening flags (PII redaction, circuit breaker, cache, rate limits) defaulted to `False` and were not overridden in `prod.py`. Production was sending raw PII to the upstream AI Gateway.
- Frontend role checks used ad-hoc `user.role === 'admin'` strings; no drift guard.
- Wizard `useWizardController.ts` was 2,332 lines and growing.
- 5 backend modules exceeded 50 KB; one was 104 KB.
- DB had 12 stale columns + an entire stale table (`error_logs`) with no documented sunset.
- Submission gate accepted identity documents with `verification_status='rejected'`.
- `IntakeEnforcer.check_submission` ignored per-program capacity.
- `DuplicateChecker.check_at_submit` ignored `multi_intake_policy`.
- Three duplicate `sanitizeInput` definitions in the wizard alone.
- No production-state assertion at deploy time.

The pattern is fragmentation: every domain concept had multiple owners; no drift guard caught divergence; dead code accumulated.

## Goal

One language, one set of principles. Each domain concept has exactly one source of truth; every other reference is a drift-guarded consumer. Production-ready means: zero silent failures, zero unverified hardening flags, zero un-tested critical paths.

## Solution Architecture

Ten parallel "truth streams", each owning one domain concept and responsible for backend, frontend, DB, tests, and docs alignment within its domain.

### Stream 5 — System Actor (Critical, Wave 1)

The single highest-leverage fix. Replaces the literal string `"system"` with a UUID constant `SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000001"` backed by a real inactive `profiles` row. A UUID guard at `transition_application_status` entry converts the silent FK error into a loud `ValueError`. ADR-013 documents the pattern.

Why this ships first: every other stream's tests depend on automated transitions actually working. Wave 1 dashboard counters added in May 2026 also depend on this fix to be meaningful.

### Stream 7 — Error Code Catalog

`backend/apps/common/error_codes.py` becomes the single backend catalog. Frontend `apps/admissions/src/lib/errorMessages.ts` is the mirror. A drift-guard test reads the Python file at test time and asserts every code has a TS message.

### Stream 10 — Operations & Production Readiness

Hardcode all 8 hardening flags `True` in `prod.py` and `staging.py`, mirroring the existing payment-hardening pattern. Add `manage.py check_production_state --strict` as a deploy gate that asserts every required flag/secret. Tests assert prod.py has the overrides.

### Stream 6 — Submission Gates

Identity-document gate excludes both `deleted` and `rejected`. Per-program capacity check added to `IntakeEnforcer.check_submission`. `DuplicateChecker.check_at_submit` honors `multi_intake_policy`. `submit_application(notes=...)` parameter removed (latent footgun).

### Stream 1 — Lifecycle State Machine

`backend/apps/applications/services.py:ALLOWED_TRANSITIONS` is the source of truth. `apps/admissions/src/types/applicationStatus.ts` is generated-style mirror. Drift-guard test reads the Python file. `apps/admissions/src/lib/withdrawalEligibility.ts:canWithdraw` is the canonical helper for withdraw eligibility (Decision A1 — all 5 statuses).

### Stream 2 — Payment Truth

`PAYMENT_TO_APP_MAP` in `payment_service.py` is the only mapping. Frontend `normalizePaymentStatus` mirrors it. `force_approved` propagation verified across analytics, review queue, admin views, and frontend. Audit doc captures every callsite that branches on raw status strings.

### Stream 4 — DB Schema Truth

`legacy_columns.py:LEGACY_DEPRECATED_COLUMNS` inventories 12 deprecated columns + the `error_logs` table. Strict drift-guard test asserts every `managed=False` model's columns equal `information_schema` modulo the allow-list. Drop migration `legacy_columns_drop_2026_08_15.sql` ready with a date guard (raises before sunset). 90-day deprecation runbook documents the cycle.

### Stream 9 — Backend Module Decomposition

5 large modules split into 21 per-workflow submodules. Original modules become thin re-export shims (42-62 lines each). All URLs and import paths preserved. `payment_service.py` (104 KB) intentionally deferred to a separate spec to limit blast radius.

### Stream 8 — Wizard Decomposition (Phase 1 of 6)

`useWizardNavigation` extracted from the 2,332-line `useWizardController.ts`. One canonical `sanitizeInput` at `lib/security.ts`; duplicates removed. `BasicKycStep.tsx` mobile attributes complete. `paymentRecoveryStore` has `migrate()` callback.

### Stream 3 — Permissions & Roles

`apps/admissions/src/types/roles.ts` is the canonical TS source. `lib/auth/roles.ts` becomes a thin re-export shim for back-compat. Drift-guard test reads `permissions.py` at test time. ADR-014 documents the cookie + CSRF auth contract.

### Wave 4 — Dead Code + Docs

Aggressive single-pass dead-code scan (Decision A3). `audit-results/README.md` archives historical reports. `docs/canonical-truth-map.md` is the master index. `docs/runbooks/feature-flags-2026-05-17.md` is the flag inventory.

## Execution Model

Subagent-driven parallel execution:

- **Wave 0** (sequential, 30 min): spec scaffold + decisions captured + verification baseline.
- **Wave 1** (sequential, 2 hr): Stream 5 ships first.
- **Wave 2** (parallel, 4-6 hr): Streams 6, 7, 10.
- **Wave 3** (parallel, 6-8 hr): Streams 1, 2, 4, 8, 9.
- **Wave 4** (parallel, 2-3 hr): Stream 3, dead-code scan, docs consolidation.
- **Wave 5** (sequential, 1 hr): final integration — regenerate OpenAPI, run full test suites, schema drift, smoke.
- **Wave 6** (sequential, 1 hr): production readiness gates G1-G8.

Total: ≈1 working day with parallel execution.

## Constraints (Non-Functional)

- **No URL changes** — decomposition uses re-export shims.
- **No status enum changes** — the canonical state machine is preserved bit-identical.
- **No payment-status enum changes**.
- **No schema column drops in this program** — only deprecation. Drop migration scheduled 2026-08-15.
- **No `base.py` flag default flips** — only `prod.py`/`staging.py` overrides (matches existing pattern).
- **Original `useWizardController.ts` remains during decomposition** — Phase 1 only extracts `useWizardNavigation`.

## Key Decisions

See `.kiro/specs/admissions-canonical-truth-2026-05/decisions.md` for A1–A10.

## Drift-Guard Strategy

Every canonical concept has at least one drift-guard test that fails CI when frontend and backend diverge. The guards work by either:

1. Reading the canonical Python file at TS test time (filesystem read + regex parse).
2. Reading the canonical TS file at Python test time (filesystem read + regex parse).
3. Property tests asserting set/dict equality against fixture mirrors.

The drift guards are intentionally CI-blocking. A team member adding a new status, error code, or role must update both sides or the test fails.

## What This Design Does Not Do

- Does not consolidate `payment_service.py`. That file's complexity warrants its own spec.
- Does not overhaul the frontend dashboard density (Wave 4 #1 in v2 plan deferred).
- Does not switch the application-number generator to a Postgres sequence yet (Stream still listed but deferred to a separate PR for safety).
- Does not implement CSRF cache, audit-middleware async writes, or metrics-middleware sampling (perf improvements deferred).

These deferrals are tracked in `docs/release-notes-canonical-truth-2026-05.md` and the v3 plan.

## ADRs Referenced

- `docs/adrs/ADR-013-system-actor.md` — Stream 5
- `docs/adrs/ADR-014-auth-cookie-csrf-design.md` — Stream 3

## Test Strategy

The full regression net consists of:

- 20+ new drift-guard tests (CI-blocking).
- 1 real-DB integration test for system-actor transitions (`backend/tests/integration/test_system_actor_transitions.py`).
- Existing 100+ unit tests + 80+ property tests must continue to pass.
- Frontend type-check, lint, build must continue to pass.
- Schema-drift CI test for every `managed=False` model.

If any drift-guard fails, the canonical truth has been violated and the change must be reconciled or the canonical source updated explicitly.
