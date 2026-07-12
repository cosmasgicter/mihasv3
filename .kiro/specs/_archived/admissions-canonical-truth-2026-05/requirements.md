# Canonical Truth Program — Requirements

## Goal

Every element of MIHAS speaks one language and agrees on one set of principles. Backend, frontend, database, tests, and documentation are aligned. Dead code is removed. The system is production-ready: zero silent failures, zero fragmented vocabularies, zero stale columns, zero un-tested critical paths.

## Functional Requirements

### F1 — Lifecycle State Machine Truth (Stream 1)
- F1.1 The application status enum has a single source of truth in `backend/apps/applications/services.py:ALLOWED_TRANSITIONS`.
- F1.2 Frontend status labels and badges are derived from `apps/admissions/src/lib/applicationStatusUi.ts` only.
- F1.3 Frontend TypeScript status enum is generated from backend OpenAPI; no hand-edited duplicates.
- F1.4 Property test asserts every code path agrees on the same status set.
- F1.5 Withdrawal is allowed from `submitted`, `under_review`, `waitlisted`, `conditionally_approved`, `approved` (Decision A1).

### F2 — Payment Truth (Stream 2)
- F2.1 `PAYMENT_TO_APP_MAP` in `payment_service.py` is the only mapping from canonical payment state to derived application payment_status.
- F2.2 Frontend `normalizePaymentStatus` in `paymentStatus.ts` matches PAYMENT_TO_APP_MAP via drift-guard test.
- F2.3 Every callsite that branches on raw payment status strings imports from a canonical helper.
- F2.4 Deferred payment counts as ready-for-decision in every operator surface (Decision A2).
- F2.5 Force-approved flows correctly through analytics, review queue, student timeline, and admin dashboards.

### F3 — Permissions/Roles Truth (Stream 3)
- F3.1 `ROLE_HIERARCHY` in `permissions.py` is the only role hierarchy.
- F3.2 Frontend `apps/admissions/src/types/roles.ts` is generated from backend; no hand-edited role checks.
- F3.3 ADR documents the 30-min/7-day/JTI auth contract.
- F3.4 No string-equality role checks in component code; all use a typed helper.

### F4 — DB Schema Truth (Stream 4)
- F4.1 `backend/scripts/00_full_schema.sql` is the single canonical bootstrap script.
- F4.2 Strict schema drift CI test asserts every `managed=False` model's columns equal `information_schema.columns`, modulo a documented `LEGACY_DEPRECATED_COLUMNS` allow-list.
- F4.3 Each legacy column has a sunset date and a ready-to-run drop migration script.
- F4.4 90-day deprecation cycle documented (Decision A4).

### F5 — System Actor Truth (Stream 5) — **Critical**
- F5.1 `SYSTEM_ACTOR_ID` constant in `services.py` is the only identifier used for automated transitions.
- F5.2 SQL seed `system_actor_seed.sql` creates the inactive system profile idempotently.
- F5.3 `transition_application_status` rejects non-UUID `changed_by` with a clear ValueError.
- F5.4 All 5 callsites (`tasks.py:197`, `tasks.py:545`, `condition_manager.py:286`, `condition_manager.py:313`, `waitlist_manager.py:114`) use `SYSTEM_ACTOR_ID`.
- F5.5 Real-DB integration tests for `draft_expiry_reminder_task`, `condition_expiry_task`, `enrollment_confirmation_expiry_task`, `WaitlistManager.promote_next` exercise the full path without mocks.
- F5.6 ADR-013 documents the system-actor pattern.

### F6 — Submission Gates Truth (Stream 6)
- F6.1 Identity-document gate excludes both `deleted` and `rejected` (Decision A9).
- F6.2 Per-program capacity is enforced inside `IntakeEnforcer.check_submission` when `ProgramIntake.max_capacity` is set.
- F6.3 `DuplicateChecker.check_at_submit` honors `multi_intake_policy`.
- F6.4 `submit_application` no longer accepts a `notes` parameter.
- F6.5 Late-fee check moved inside the row lock.
- F6.6 Every gate failure raises `ApplicationSubmissionError(code, message)` with code in the canonical error catalog.
- F6.7 `docs/admissions-submission-gates.md` documents every gate.

### F7 — Error Codes & Validation Truth (Stream 7)
- F7.1 `backend/apps/common/error_codes.py` consolidates every error code.
- F7.2 Frontend `apps/admissions/src/lib/errorMessages.ts` mirrors the backend catalog with drift-guard fixture.
- F7.3 Every ad-hoc `code:` literal in views imports from the catalog.
- F7.4 Zod schemas align with DRF serializer field rules; CI test snapshots both.

### F8 — Wizard & UX Truth (Stream 8)
- F8.1 `useWizardController.ts` is decomposed into 6 hooks under `wizard/` (Decision A6).
- F8.2 `sanitizeInput` reduced to one canonical no-op `.trim()` helper at `apps/admissions/src/lib/security.ts`.
- F8.3 `BasicKycStep.tsx` mobile attributes complete (`bday`, `tel`, `autoComplete="off"` for next-of-kin).
- F8.4 `paymentRecoveryStore` has `migrate()` callback for forward-compat schema versioning.
- F8.5 Student dashboard "priority hero card" behind `VITE_STUDENT_DASHBOARD_PRIORITY` flag.

### F9 — Backend Module Decomposition Truth (Stream 9)
- F9.1 No backend file > 60 KB.
- F9.2 `payment_service.py` split into 5 modules; `payment_service.py` re-exports for backward compat.
- F9.3 `documents/views.py` split into per-workflow modules.
- F9.4 `applications/admin_views.py` split by workflow.
- F9.5 `applications/student_views.py` split by lifecycle stage.
- F9.6 `accounts/views.py` and `accounts/admin_views.py` split by workflow.
- F9.7 All public URL paths unchanged; existing tests pass without modification.

### F10 — Operations & Production Readiness Truth (Stream 10)
- F10.1 All 8 hardening flags hardcoded `True` in `prod.py` and `staging.py` (Decision A5).
- F10.2 `manage.py check_production_state` asserts every required flag/secret (Decision A10).
- F10.3 Every silent-degradation site emits a `*.degraded` metric.
- F10.4 Idempotent Celery tasks have `max_retries=3, retry_backoff=True`.
- F10.5 `MetricsMiddleware` samples healthy 200s at 10% in production.
- F10.6 `AuditMiddleware._extract_entity_id` regex requires full UUID format.
- F10.7 CSRF token validation cached for 60 seconds.

## Non-Functional Requirements

- **NFR1** No URL changes; decomposition uses re-export shims.
- **NFR2** No status enum changes; new enum members go through the canonical lifecycle.
- **NFR3** No payment status enum changes.
- **NFR4** No schema column drops in this program; only deprecation.
- **NFR5** No flag default flips in `base.py`; only `prod.py`/`staging.py` overrides.
- **NFR6** No dropping of legacy `useWizardController.ts` — renamed and gated for one release.
- **NFR7** No product policy changes blocked on Decisions A1–A10 — those are settled.

## Acceptance Criteria

The program is complete when:
- Every backend test passes (`cd backend && python -m pytest`).
- Every admissions frontend test passes (`cd apps/admissions && bun run test`).
- Frontend type-check + lint + build pass (`cd apps/admissions && bun run type-check && bun run lint && bun run build`).
- `python manage.py check_production_state --strict` exits 0.
- `python manage.py check_schema_drift --strict` exits 0.
- Real-DB integration tests for system-actor transitions pass.
- Playwright happy-path E2E for a full student application passes.
- 30 minutes of staging traffic post-deploy with no error spike vs baseline.
