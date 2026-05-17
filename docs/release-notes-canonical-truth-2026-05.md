# Release Notes — Canonical Truth Program (May 2026)

This release lands the admissions canonical-truth program. Backend, frontend,
and database now agree on every domain concept, with drift-guard tests in CI
that fail on divergence.

## Visible behavior changes

### For students

- **Submission requires a non-rejected identity document.** If you uploaded an NRC or passport that an admin rejected, you must re-upload before submitting. The previous behavior accepted any non-deleted upload.
- **Per-program capacity is now enforced.** If a program for a specific intake is full (`ProgramIntake.max_capacity` reached), submission returns `PROGRAM_CAPACITY_REACHED` with the message "This program for the selected intake is full."
- **Withdrawal is now allowed from `conditionally_approved` and `approved` statuses** in the frontend. The backend already supported all five statuses (`submitted`, `under_review`, `waitlisted`, `conditionally_approved`, `approved`); the UI was over-restrictive (Decision A1).

### For admins

- **Dashboard urgency counters are now live.** Wave 1 of the program (May 17) added "expiring conditions", "overdue review", "pending documents", and "upcoming interviews" counters. This release fixes the underlying system-actor bug (ADR-013) so the queues actually drain — drafts auto-expire at 30 days, conditions auto-reject at deadline, enrollments auto-release after deadline, waitlist auto-promotes when spots open.
- **`PROGRAM_CAPACITY_REACHED`** is a new error code surfaced by submission attempts when per-program capacity is reached.
- **Triage filters** for review-queue, overdue-review, pending-documents, upcoming-interviews are now wired end-to-end (already in Wave 1).

### For operators

- **`manage.py check_production_state`** is a new pre-deploy gate that asserts every required flag/secret is correctly configured. Run it before every prod deploy.
- **8 hardening flags** are now hardcoded `True` in `prod.py` and `staging.py` (4 payment-hardening + 4 AI-hardening). Env vars remain the rollback lever per the existing pattern.

## Internal changes (no user-visible effect)

- **Backend module decomposition**: 5 large modules split into 21 per-workflow submodules. URLs and import paths unchanged — original modules are now thin re-export shims.
- **Wizard hooks decomposition** (Phase 1 of 6): `useWizardNavigation` extracted from the 2,332-line `useWizardController.ts`. Five remaining hooks ship in subsequent PRs per Decision A6.
- **One canonical `sanitizeInput`** at `apps/admissions/src/lib/security.ts`. Previous duplicates removed.
- **TypeScript role helpers** at `apps/admissions/src/types/roles.ts` mirror `backend/apps/accounts/permissions.py:ROLE_HIERARCHY` with a drift-guard test.
- **One error-code catalog** at `backend/apps/common/error_codes.py` with frontend mirror at `apps/admissions/src/lib/errorMessages.ts`.
- **Legacy column inventory** at `backend/apps/common/legacy_columns.py` documents 12 stale columns + the deprecated `error_logs` table with a 2026-08-15 sunset date and a ready-to-run drop migration.

## Critical bug fix

- **System-actor FK type mismatch** (ADR-013): 4 daily Celery tasks (`draft_expiry_reminder_task`, `condition_expiry_task`, `enrollment_confirmation_expiry_task`, `WaitlistManager.promote_next`) silently failed in production because `changed_by="system"` was rejected by Postgres as an invalid UUID. Tasks reported success while doing nothing. Fix: introduce `SYSTEM_ACTOR_ID` UUID constant, seed a real inactive `profiles` row, add a UUID guard in `transition_application_status` that converts the silent failure into a loud `ValueError`. Real-DB integration tests at `backend/tests/integration/test_system_actor_transitions.py` are the regression net.

## Drift guards added (CI-blocking)

- `applicationStatusDriftGuard.test.ts`
- `paymentStatusMappingDriftGuard.test.ts`
- `errorCodesDriftGuard.test.ts`
- `rolesBackendMirror.test.ts`
- `sanitizeInputCanonical.test.ts`
- `wizardBasicKycMobileAttributes.test.tsx`
- `paymentRecoveryStoreMigration.test.ts`
- `useWizardNavigation.test.tsx`
- `backend/tests/property/test_lifecycle_canonical.py`
- `backend/tests/property/test_schema_drift_strict.py`
- `backend/tests/unit/test_error_codes_canonical.py`
- `backend/tests/unit/test_payment_status_canonical.py`
- `backend/tests/unit/test_payment_force_approved_propagation.py`
- `backend/tests/unit/test_legacy_columns_no_writes.py`
- `backend/tests/unit/test_check_production_state.py`
- `backend/tests/unit/test_prod_settings_required_flags.py`
- `backend/tests/unit/test_submission_gates.py`
- `backend/tests/unit/test_withdrawal_eligibility.py`
- `backend/tests/integration/test_system_actor_transitions.py`

## Documentation added

- `docs/canonical-truth-map.md` — master index of every canonical source
- `docs/admissions-submission-gates.md` — every submission gate documented
- `docs/runbooks/feature-flags-2026-05-17.md` — every flag inventoried
- `docs/runbooks/legacy-column-deprecation.md` — 90-day deprecation playbook
- `docs/runbooks/post-deploy-smoke-canonical-truth.md` — release-specific smoke
- `docs/adrs/ADR-013-system-actor.md` — system-actor pattern
- `docs/adrs/ADR-014-auth-cookie-csrf-design.md` — cookie + CSRF auth contract

## Deferred work (tracked in canonical-truth program)

- `payment_service.py` decomposition (104 KB) — highest-risk file, ships in a separate spec to limit blast radius.
- 5 remaining wizard hooks (`useWizardForm`, `useWizardDraft`, `useWizardSubmission`, `useWizardProfile`, `useWizardRecovery`) — ship as 5 sequential PRs per Decision A6.
- Day-90 legacy column drop migration (scheduled 2026-08-15).
- CSRF token validation cache (60-second Redis cache) — perf improvement, not a correctness fix.
- `MetricsMiddleware` request log sampling at 10% — log-volume optimization.
- AuditMiddleware async write via Celery outbox — perf improvement.

## Rollback

Each behavior change is gated by a feature flag or has a documented rollback
path. See `docs/runbooks/feature-flags-2026-05-17.md` for the rollback order
and procedures.

The system-actor fix (ADR-013) is non-revertible (the seed row stays; the
SYSTEM_ACTOR_ID constant stays). Rollback would mean re-introducing the silent
production bug — not acceptable.

## Acknowledgements

Decisions A1–A10 reviewed and approved by the user 2026-05-17.
Wave 1 alignment work (16 actions) completed by the user prior to this release.
Wave 0–6 canonical-truth program executed in a single working day.
