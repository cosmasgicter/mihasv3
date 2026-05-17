# MIHAS Canonical Truth Map

This is the master index of canonical sources of truth in the admissions system.
Every domain concept has exactly one source of truth; every other reference is a
consumer. Drift-guard tests catch divergence at CI time.

**Rule:** Any new domain concept added to the platform must register in this map
before merging. If it has a frontend mirror, a drift-guard test is required.

## Application Lifecycle

| Concept | Source of truth | Consumers (drift-guarded) |
|---------|-----------------|----------------------------|
| Status enum & transitions | `backend/apps/applications/services.py:ALLOWED_TRANSITIONS` | `apps/admissions/src/types/applicationStatus.ts` |
| Status UI labels/badges | `apps/admissions/src/lib/applicationStatusUi.ts` | (consumers via import) |
| Terminal statuses | `apps/admissions/src/types/applicationStatus.ts:TERMINAL_STATUSES` | `backend/apps/applications/duplicate_checker.py:TERMINAL_STATUSES` |
| Withdrawal eligibility | `apps/admissions/src/lib/withdrawalEligibility.ts:canWithdraw` | `backend/tests/unit/test_withdrawal_eligibility.py` |
| Drift guards | `apps/admissions/tests/unit/applicationStatusDriftGuard.test.ts` + `backend/tests/property/test_lifecycle_canonical.py` |

## Payment

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Canonical payment status enum | `backend/apps/documents/payment_service.py:CanonicalStatus` | `PAYMENT_TO_APP_MAP` |
| Derived app payment_status | `backend/apps/documents/payment_service.py:PAYMENT_TO_APP_MAP` | `apps/admissions/src/lib/paymentStatus.ts:normalizePaymentStatus` |
| State transitions | `backend/apps/documents/payment_service.py:ALLOWED_TRANSITIONS` | `_transition()` (sole writer) |
| Force-approved propagation | `review_queue.py:PAYMENT_READY_STATUSES`, `admin_views.py:_RESOLVED_PAYMENT_STATUSES`, analytics, frontend `normalizePaymentStatus` | drift-guarded |
| Payment error codes | `backend/apps/documents/payment_error_codes.py:PAYMENT_ERROR_CODES` | `apps/admissions/src/lib/paymentErrorCodes.ts` |
| Webhook event identity | `backend/apps/documents/webhook_processor.py:WebhookEventIdentity` | dedup table `webhook_event_logs` |
| Drift guards | `apps/admissions/tests/unit/paymentStatusMappingDriftGuard.test.ts` + `backend/tests/unit/test_payment_status_canonical.py` + `test_payment_force_approved_propagation.py` |

## Permissions & Roles

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Role hierarchy | `backend/apps/accounts/permissions.py:ROLE_HIERARCHY` | `apps/admissions/src/types/roles.ts:ROLE_HIERARCHY` |
| Role helpers | `apps/admissions/src/types/roles.ts` (`hasRole`, `isAdmin`, `isSuperAdmin`, `isReviewer`, `isStudent`) | all component role checks |
| Legacy shim | `apps/admissions/src/lib/auth/roles.ts` (re-exports from `types/roles.ts`) | back-compat |
| Auth contract | `docs/adrs/ADR-014-auth-cookie-csrf-design.md` | reference |
| Drift guard | `apps/admissions/tests/unit/rolesBackendMirror.test.ts` |

## Error Codes

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Catalog | `backend/apps/common/error_codes.py:ERROR_CODES` | views (via reference), tests |
| Frontend mirror | `apps/admissions/src/lib/errorMessages.ts` | UI components |
| Drift guards | `apps/admissions/tests/unit/errorCodesDriftGuard.test.ts` + `backend/tests/unit/test_error_codes_canonical.py` |

## System Actor (Automated Transitions)

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| UUID constant | `backend/apps/applications/services.py:SYSTEM_ACTOR_ID` | `tasks.py`, `condition_manager.py`, `waitlist_manager.py` |
| DB seed | `backend/scripts/system_actor_seed.sql` | manual application |
| UUID guard | `backend/apps/applications/services.py:transition_application_status` (validates `changed_by` is a UUID) | runtime |
| Pattern documentation | `docs/adrs/ADR-013-system-actor.md` | reference |
| Regression net | `backend/tests/integration/test_system_actor_transitions.py` |

## Submission Gates

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Gate logic | `backend/apps/applications/services.py:submit_application` | `POST /api/v1/applications/{id}/submit/` |
| Identity-document gate | `backend/apps/applications/services.py:_application_has_identity_document` | internal to `submit_application` |
| Intake/program capacity | `backend/apps/applications/intake_enforcer.py:IntakeEnforcer.check_submission` | `submit_application` |
| Multi-intake duplicate | `backend/apps/applications/duplicate_checker.py:DuplicateChecker.check_at_submit` (honors `multi_intake_policy`) | `submit_application` |
| Documentation | `docs/admissions-submission-gates.md` |

## Database Schema

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Canonical schema | `backend/scripts/00_full_schema.sql` (TODO: pg_dump from prod) | new-environment bootstrap |
| Applied migrations | `backend/scripts/applied/` | historical record |
| Legacy column inventory | `backend/apps/common/legacy_columns.py:LEGACY_DEPRECATED_COLUMNS` | drift test, drop migration |
| Drop migration (Day 90) | `backend/scripts/legacy_columns_drop_2026_08_15.sql` | scheduled execution |
| Drift guard | `backend/tests/property/test_schema_drift_strict.py` |
| No-writes guard | `backend/tests/unit/test_legacy_columns_no_writes.py` |
| Deprecation runbook | `docs/runbooks/legacy-column-deprecation.md` |

## Feature Flags

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Flag inventory | `docs/runbooks/feature-flags-2026-05-17.md` | runtime + deploy |
| Production overrides | `backend/config/settings/prod.py` + `staging.py` | runtime |
| Pre-flight assertion | `backend/apps/common/management/commands/check_production_state.py` | deploy gate |

## Wizard

| Concept | Source of truth | Consumers |
|---------|-----------------|-----------|
| Wizard navigation | `apps/admissions/src/pages/student/applicationWizard/hooks/wizard/useWizardNavigation.ts` | `useWizardController` |
| Wizard state | `apps/admissions/src/pages/student/applicationWizard/hooks/wizard/state/useWizardState.ts` | `useWizardController` |
| Sanitizer | `apps/admissions/src/lib/security.ts:sanitizeInput` | wizard, services |
| Payment recovery | `apps/admissions/src/stores/paymentRecoveryStore.ts` | `PaymentStep` |

## Backend Module Decomposition

The following original modules are now thin re-export shims; the real
implementations live in per-workflow submodules:

| Original (re-export shim) | Submodules |
|--------------------------|------------|
| `backend/apps/applications/admin_views.py` | `admin_review_views.py`, `admin_assignment_views.py`, `admin_export_views.py`, `admin_bulk_views.py`, `admin_amendment_views.py` |
| `backend/apps/applications/student_views.py` | `student_draft_views.py`, `student_submission_views.py`, `student_amendment_views.py`, `student_withdrawal_views.py`, `student_document_views.py` |
| `backend/apps/documents/views.py` | `mobile_money_views.py`, `payment_widget_views.py`, `payment_admin_views.py`, `payment_query_views.py`, `lenco_webhook_views.py`, `document_storage_views.py` |
| `backend/apps/accounts/views.py` | `auth_views.py`, `password_views.py`, `profile_views.py` |
| `backend/apps/accounts/admin_views.py` | `admin_user_views.py`, `admin_settings_views.py`, `admin_audit_views.py` |

`backend/apps/documents/payment_service.py` (104 KB) is intentionally NOT
decomposed in this program — it ships in a separate spec because of its
critical-path nature.

## Drift Guard Inventory

CI-blocking tests that fail when canonical truth diverges:

- `apps/admissions/tests/unit/applicationStatusDriftGuard.test.ts`
- `apps/admissions/tests/unit/paymentStatusMappingDriftGuard.test.ts`
- `apps/admissions/tests/unit/errorCodesDriftGuard.test.ts`
- `apps/admissions/tests/unit/rolesBackendMirror.test.ts`
- `apps/admissions/tests/unit/sanitizeInputCanonical.test.ts`
- `apps/admissions/tests/unit/wizardBasicKycMobileAttributes.test.tsx`
- `apps/admissions/tests/unit/paymentRecoveryStoreMigration.test.ts`
- `apps/admissions/tests/unit/useWizardNavigation.test.tsx`
- `apps/admissions/tests/unit/paymentErrorCodes.test.ts` (existing)
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

## How To Add A New Domain Concept

1. Decide where the source of truth lives. Backend if it's authoritative business logic; frontend lib if it's purely UI.
2. If a frontend mirror is needed, add a fixture file under `__fixtures__/` and a drift-guard test.
3. Register the new concept in this file with a row in the relevant section.
4. Document the concept's contract with an ADR if it is non-trivial.
5. Add tests for both the source of truth and the drift guard.
