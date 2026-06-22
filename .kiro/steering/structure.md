---
inclusion: always
---

# Project Structure And Code Organization

## Top-Level Layout

| Path | Purpose | Guidance |
|------|---------|----------|
| `apps/admissions/` | Admissions React app | Active frontend target |
| `apps/jobs-ops/` | AI job operations dashboard | Active frontend target |
| `apps/website/` | Future public website | Placeholder unless task says otherwise |
| `apps/student-portal/` | Future student portal | Placeholder unless task says otherwise |
| `apps/librarymanagement/` | Incomplete app directory | Treat as reserved unless task explicitly targets it |
| `backend/` | Django 5 + DRF API | Primary backend modification target |
| `shared/` | Shared package scaffold | Use only for code intentionally shared across apps |
| `docs/` | Project documentation | Modify when task requires documentation or handoff updates |
| `.kiro/` | Specs, steering, and Kiro metadata | Keep steering aligned with the real repo state |

## Canonical Truth Map

The master index of canonical sources of truth lives at `docs/canonical-truth-map.md`. It names the single authoritative location for every domain concept (application statuses, payment states, role hierarchies, error codes, etc.) and lists every consumer that mirrors or depends on it.

**Rule:** Any new domain concept added to the platform must register in the canonical truth map before merging. If the concept has a frontend mirror, a drift-guard test is required.

## Enterprise Tenant Authority Layout

Where the Beanola multi-tenant authority code lives. Model and rules:
`.kiro/steering/enterprise-tenancy.md`. Spec of record:
`.kiro/specs/enterprise-tenant-authority/`.

| Concern | Location |
|---------|----------|
| Admin capability logic + catalogue | `backend/apps/catalog/services.py` — `AdminCapabilityService` (`PLATFORM_CAPABILITIES`, `TENANT_CAPABILITIES`, `CapabilitySet`, `CapabilityResolutionError`), `DomainStatusMachine`, `InstitutionContextService.resolve` |
| Tenant services / audit | `backend/apps/catalog/tenant_audit_service.py` (`TenantAuditService`); domain verification `backend/apps/catalog/tasks.py` (`verify_institution_domain_task`) |
| DRF permission primitives | `backend/apps/catalog/permissions.py` — `HasPlatformCapability`, `TenantScopedCapabilityMixin` |
| Capability + scope endpoints | `backend/apps/accounts/admin_user_views.py` — `GET /api/v1/admin/capabilities/`, extended `GET /api/v1/admin/scope/` |
| Admin tenant API routing | `backend/apps/catalog/admin_urls.py` (mounted at `/api/v1/admin/`); views in `backend/apps/catalog/admin_views.py` |
| Capability-gated legacy catalog writes | `backend/apps/catalog/views.py` (institution/program/intake write methods) |
| Domain context endpoint | `backend/apps/catalog/views.py` — `CatalogContextView` → `GET /api/v1/catalog/context/` |
| Frontend capability hooks | `apps/admissions/src/contexts/CapabilityContext.tsx` (`useCapabilities`), `apps/admissions/src/services/admin/capabilities.ts` (`adminCapabilityService`) |
| Capability-driven navigation | `apps/admissions/src/components/navigation/tenantNav.ts` (`resolveTenantNavItem`, `useTenantNavItem`); consumed by `DesktopSidebar`, `MobileBottomNav`, `AppLayout` |
| Super-admin route guard | `apps/admissions/src/components/AdminRoute.tsx` (`RequireSuperAdmin`); route config `apps/admissions/src/routes/config.tsx` |
| Tenant console + panels | `apps/admissions/src/pages/admin/Tenants.tsx` (capability switcher) → `apps/admissions/src/pages/admin/tenants/` (`SuperAdminTenantConsole`, `TenantAdminSchoolConsole`, panels) |
| Tenant onboarding wizard | `apps/admissions/src/pages/admin/tenants/TenantOnboardingWizard.tsx` (super-admin-only stepper) |
| Permission matrix / canonical routes | `docs/canonical-truth-map.md` → "Enterprise Tenant Authority (Capabilities & Routes)" |

## Spec Completion Markers

Each spec directory under `.kiro/specs/` has a `.config.kiro` JSON file. When a spec's work is fully completed (all tasks done), add `"status": "completed"` to its `.config.kiro` file. This makes the status of past work immediately visible without reading every task file.

- Completed specs: `{"specId": "...", "workflowType": "...", "specType": "...", "status": "completed"}`
- In-progress specs: no `status` field (or omit it until done)
- New specs should follow this convention when all tasks are finished.

## Monorepo Rules

- Do not assume a root-level `src/` directory exists.
- Do not assume `django_api/`, `api-src/`, or `api/` are real runtime directories in this repo.
- Pick the package first, then work inside that package's conventions.
- Prefer app-local code over premature `shared/` extraction.

## Admissions Frontend Structure

### Important Paths

| Path | Purpose |
|------|---------|
| `apps/admissions/src/components/` | UI and feature components |
| `apps/admissions/src/pages/` | Route-level screens |
| `apps/admissions/src/hooks/` | React hooks |
| `apps/admissions/src/services/` | API-facing and domain services |
| `apps/admissions/src/lib/` | Canonical frontend helpers and infrastructure |
| `apps/admissions/src/lib/api/` | API-specific helpers still used by some flows |
| `apps/admissions/src/lib/speculativePrefetch.ts` | Instagram-style predictive data loading (login, dashboard, wizard) |
| `apps/admissions/src/lib/routePreload.ts` | Route chunk preloading (auth, student, admin workspaces) |
| `apps/admissions/tests/` | Unit, integration, and property tests |

### Admissions High-Risk Flow Paths

| Path | Purpose |
|------|---------|
| `apps/admissions/src/pages/student/applicationWizard/` | Core student application and payment flow |
| `apps/admissions/src/pages/student/Dashboard.tsx` | Student overview and recovery entry point |
| `apps/admissions/src/pages/student/Payment.tsx` | Read-only payment history and payment guidance |
| `apps/admissions/src/pages/student/Interview.tsx` | Student interview schedule and join actions |
| `apps/admissions/src/pages/student/ApplicationStatus.tsx` | Student status tracking and next actions |
| `apps/admissions/src/pages/student/Settings.tsx` | Student profile/settings form with dirty-state risk |
| `backend/apps/applications/views.py` | Legacy re-exports for URL compatibility (imports from split modules) |
| `backend/apps/applications/student_views.py` | Student-facing endpoints: submit, withdraw, email-slip, enrollment, amendments |
| `backend/apps/applications/admin_views.py` | Admin endpoints: review, assign, bulk status, fee waiver, conditions |
| `backend/apps/applications/public_views.py` | Unauthenticated endpoints: track application |
| `backend/apps/applications/document_views.py` | Document list and detail endpoints per application |
| `backend/apps/applications/interview_views.py` | Interview scheduling and list endpoints |
| `backend/apps/applications/history_views.py` | Application history/timeline endpoints |
| `backend/apps/applications/_view_helpers.py` | Shared helpers: permission checks, queryset builders |
| `backend/apps/applications/services.py` | Submission and transition enforcement |
| `backend/apps/documents/payment_service.py` | Lenco payment lifecycle and state transitions |

### Placement Guidance

| Adding | Place It In | Notes |
|--------|-------------|-------|
| Page or route screen | `apps/admissions/src/pages/` | Register with the existing routing setup |
| Reusable component | `apps/admissions/src/components/{domain}/` | Follow existing domain organization |
| App-specific service | `apps/admissions/src/services/` | Prefer `apiClient` over ad hoc fetch logic |
| Shared frontend helper | `apps/admissions/src/lib/` | Prefer this over `src/utils/` for new code |
| Tests | `apps/admissions/tests/` | Keep coverage close to changed behavior |

## Jobs Ops Frontend Structure

### Important Paths

| Path | Purpose |
|------|---------|
| `apps/jobs-ops/src/app/` | App shell, providers, router |
| `apps/jobs-ops/src/app/layout/` | Shell layout and navigation |
| `apps/jobs-ops/src/components/ui/` | Shared UI primitives |
| `apps/jobs-ops/src/features/` | Route-level feature slices |
| `apps/jobs-ops/src/lib/` | Formatting, env, and helpers |
| `apps/jobs-ops/src/services/api/` | Backend-facing API services |
| `apps/jobs-ops/src/stores/` | Zustand stores |

### Feature Areas

| Path | Purpose |
|------|---------|
| `apps/jobs-ops/src/features/overview/` | Command-center dashboard |
| `apps/jobs-ops/src/features/jobs/` | Jobs inbox and job detail |
| `apps/jobs-ops/src/features/job-applications/` | Pursuit queue |
| `apps/jobs-ops/src/features/automation/` | Rules and runs |
| `apps/jobs-ops/src/features/outreach/` | CRM and campaigns |
| `apps/jobs-ops/src/features/email/` | Threads and reply intelligence |
| `apps/jobs-ops/src/features/documents/` | Resume lab |
| `apps/jobs-ops/src/features/integrations/` | Provider/configuration view |
| `apps/jobs-ops/src/features/sources/` | Discovery source health |
| `apps/jobs-ops/src/features/analytics/` | Reports and digest views |
| `apps/jobs-ops/src/features/review/` | Human-in-the-loop workbench |
| `apps/jobs-ops/src/features/audit/` | Operational timeline |

### Jobs Ops Placement Guidance

| Adding | Place It In | Notes |
|--------|-------------|-------|
| New operator page | Matching folder in `apps/jobs-ops/src/features/` | Keep pages domain-scoped |
| Shared dashboard UI primitive | `apps/jobs-ops/src/components/ui/` | Reuse instead of page-local duplication |
| Backend service mapping | `apps/jobs-ops/src/services/api/` | Keep response mapping close to API surface |
| App shell behavior | `apps/jobs-ops/src/app/` | Router, providers, layout only |

## Backend Structure

### Important Paths

| Path | Purpose |
|------|---------|
| `backend/apps/accounts/` | Auth, sessions, admin user management |
| `backend/apps/applications/` | Admissions application domain |
| `backend/apps/catalog/` | Programs, intakes, subjects, institutions, intake automation |
| `backend/apps/documents/` | Documents, OCR, payment-related endpoints |
| `backend/apps/common/` | Shared middleware, renderers, health, notifications, error monitoring, shared jobs-ops seed data |
| `backend/apps/jobs/` | Jobs and job-application APIs |
| `backend/apps/outreach/` | Contacts, campaigns, messaging |
| `backend/apps/automation/` | Rules and runs |
| `backend/apps/integrations/` | Telegram, OpenAI, email integration views |
| `backend/apps/analytics/` | Analytics and report endpoints |
| `backend/config/` | Django settings and URL routing |
| `backend/tests/unit/` | Unit and regression tests |
| `backend/tests/property/` | Hypothesis property tests |

### Backend Placement Guidance

| Adding | Place It In | Notes |
|--------|-------------|-------|
| Jobs-ops API view or serializer | Matching domain app under `backend/apps/` | Keep domains explicit |
| Shared jobs-ops seeded state | `backend/apps/common/jobs_ops_seed.py` | Keep sample state centralized |
| Shared middleware or renderer | `backend/apps/common/` | Reuse before creating new cross-cutting modules |
| New route | App `urls.py` plus `backend/config/urls.py` include if needed | Backend routes are resource-style under `/api/v1/` |
| Tests | `backend/tests/{unit,property,contract}/` | Match the behavior and risk level |

### Files Added During Lenco Payment Integration

| Path | Purpose |
|------|---------|
| `backend/apps/documents/payment_service.py` | `PaymentService` — payment lifecycle: initiate, verify, webhook processing, forward-only status transitions |
| `backend/apps/documents/fee_resolver.py` | `FeeResolver` — dynamic fee resolution by program code + residency (local/international) |
| `backend/apps/documents/webhook_processor.py` | `WebhookProcessor` — HMAC-SHA512 signature validation, event logging, delegation to PaymentService |
| `backend/scripts/lenco_payment_integration.sql` | SQL migration: `program_fees`, `webhook_event_logs` tables, `payments` column additions, `applications.payment_status` default change |
| `apps/admissions/src/components/student/PaymentForm.tsx` | Shared payment form with mobile money + card method selection |
| `apps/admissions/src/hooks/useLencoWidget.ts` | Dynamic Lenco widget script loading and `LencoPay.getPaid` wrapper |
| `apps/admissions/src/hooks/useFeeResolver.ts` | Frontend fee resolution hook (calls `/api/v1/payments/resolve-fee/`) |
| `apps/admissions/src/hooks/usePaymentStatus.ts` | Payment status polling hook |

### Files Removed During Lenco Payment Integration

| Path | Reason |
|------|--------|
| `apps/admissions/src/config/payments.ts` | Hardcoded K153 fee and mobile money phone numbers — replaced by dynamic fee resolution |
| `apps/admissions/tests/unit/paymentFlow.test.ts` | Tests for deleted paymentFlow module |

| Path | Purpose |
|------|---------|
| `backend/apps/common/error_urls.py` | URL patterns for `/api/v1/errors/` (error report endpoint) |
| `backend/apps/common/error_views.py` | `ErrorReportView` — accepts frontend error reports, forwards to GlitchTip via `sentry_sdk.capture_message()` |
| `apps/admissions/src/lib/errorReporter.ts` | Frontend error reporter — initializes `@sentry/react` for GlitchTip error capture |
| `backend/scripts/create_error_logs_table.sql` | SQL migration script to create the `error_logs` table (used instead of Django migrations because `managed = False`) |
| `docs/runbooks/secrets-rotation.md` | Runbook for rotating production secrets (JWT key, DB credentials, API keys) |

### Files Added During Production Stability Hardening

| Path | Purpose |
|------|---------|
| `backend/apps/catalog/intake_date_computer.py` | Pure functions for computing intake dates (11-month lead, 2-month deadline) |
| `backend/apps/catalog/tasks.py` | `intake_manager_task` Celery task — ensures ≥2 open intakes exist |
| `backend/apps/catalog/management/commands/manage_intakes.py` | Management command wrapper for `intake_manager_task` |
| `apps/admissions/src/lib/speculativePrefetch.ts` | Speculative prefetch triggers (email blur, login success, dashboard mount) |

### Files Added During Business Logic Densification

| Path | Purpose |
|------|---------|
| `backend/scripts/business_logic_densification.sql` | SQL migration: new columns on `applications` and `intakes`, 5 new tables (`application_conditions`, `communication_templates`, `academic_calendar_events`, `fee_waivers`, `application_amendments`), indexes, and 20 seeded communication templates |
| `backend/apps/applications/withdrawal_service.py` | `WithdrawalService` — student withdrawal with enrollment decrement and waitlist promotion |
| `backend/apps/applications/interview_service.py` | `InterviewService` — interview scheduling with 48h notice, conflict detection, mode validation |
| `backend/apps/applications/waitlist_manager.py` | `WaitlistManager` — position assignment, auto-promotion, reindexing |
| `backend/apps/applications/condition_manager.py` | `ConditionManager` — conditional admission lifecycle |
| `backend/apps/applications/enrollment_service.py` | `EnrollmentService` — enrollment confirmation and deadline computation |
| `backend/apps/applications/amendment_service.py` | `AmendmentService` — student amendment requests with admin approval |
| `backend/apps/common/communication_service.py` | `CommunicationService` — template-based notifications and emails |
| `backend/apps/common/template_views.py` | Admin endpoints for communication template management |
| `backend/apps/common/template_urls.py` | URL patterns for `/api/v1/admin/templates/` |
| `backend/apps/documents/fee_waiver_service.py` | `FeeWaiverService` — fee waiver granting and effective fee computation |
| `backend/tests/unit/test_withdrawal.py` | Unit tests for withdrawal service and endpoint |
| `backend/tests/unit/test_interview_scheduling.py` | Unit tests for interview scheduling business rules |
| `backend/tests/unit/test_waitlist.py` | Unit tests for waitlist position and auto-promotion |
| `backend/tests/unit/test_expiry.py` | Unit tests for draft expiry and review SLA |
| `backend/tests/unit/test_conditions.py` | Unit tests for conditional admission |
| `backend/tests/unit/test_late_applications.py` | Unit tests for late application handling |
| `backend/tests/unit/test_communication_service.py` | Unit tests for communication template service |
| `backend/tests/unit/test_document_sla.py` | Unit tests for document verification SLA |
| `backend/tests/unit/test_payment_expiry.py` | Unit tests for payment expiry and retry limits |
| `backend/tests/unit/test_enrollment.py` | Unit tests for enrollment confirmation |
| `backend/tests/unit/test_reviewer_assignment.py` | Unit tests for reviewer assignment |
| `backend/tests/unit/test_fee_waivers.py` | Unit tests for fee waivers |
| `backend/tests/unit/test_batch_operations.py` | Unit tests for batch operation safety |
| `backend/tests/unit/test_amendments.py` | Unit tests for application amendments |
| `backend/tests/unit/test_multi_intake.py` | Unit tests for multi-intake application rules |

### Files Added During Production Audit Fixes

| Path | Purpose |
|------|---------|
| `apps/admissions/tests/property/auditProductionBugCondition.property.test.ts` | Bug condition exploration tests — Settings isDirty, ErrorDisplay empty alert, font chain |
| `apps/admissions/tests/property/auditProductionPreservation.property.test.ts` | Preservation tests — dirty detection, validation errors, real errors, image fallback |
| `apps/admissions/tests/property/auditProductionFixValidation.property.test.ts` | Property-based fix validation — Settings reset merge, ErrorDisplay rendering (fast-check) |
| `apps/admissions/tests/property/authFormsAuditBugCondition.property.test.ts` | Auth forms bug condition tests — autocomplete, inputmode, form attributes |
| `apps/admissions/tests/property/authFormsAuditPreservation.property.test.ts` | Auth forms preservation tests — existing form behavior |
| `apps/admissions/tests/property/scoutqaLandingPageBugCondition.property.test.ts` | ScoutQA landing page bug condition tests |
| `apps/admissions/tests/property/scoutqaLandingPagePreservation.property.test.ts` | ScoutQA landing page preservation tests |
| `apps/admissions/tests/unit/authFormAttributes.test.ts` | Auth form HTML attribute validation tests |
| `apps/admissions/tests/unit/authLayoutMobileOverflow.test.ts` | Auth layout mobile overflow tests |
| `apps/admissions/tests/unit/contactPageContrast.test.ts` | Contact page color contrast tests |
| `apps/admissions/tests/unit/optimizedImageWebpNative.test.ts` | OptimizedImage WebP native support tests |
| `backend/tests/unit/test_audit_production_bug_conditions.py` | Backend bug condition tests — sessions envelope, refresh error code, tracking format |
| `backend/tests/unit/test_audit_production_preservation.py` | Backend preservation tests — sessions data shape, revoke, refresh, tracking |
| `backend/tests/property/test_audit_production_properties.py` | Backend property-based tests — tracking format validation, sessions envelope (hypothesis) |

### Documentation Files

| Path | Purpose |
|------|---------|
| `docs/schema-ownership.md` | Table-level ownership map for the Neon database |
| `docs/redis-dependency-tiers.md` | Redis key usage, TTLs, and failure impact tiers |
| `shared/PLATFORM_CONTRACT.md` | Cross-app API and data contract |
| `docs/runbooks/secrets-rotation.md` | Production secret rotation runbook |
| `docs/runbooks/redis-recovery.md` | Redis failure recovery procedures |
| `docs/runbooks/scaling-playbook.md` | Scaling playbook for Koyeb workers and Neon |
| `docs/runbooks/release-and-rollback.md` | Release process and rollback procedures |
| `docs/runbooks/post-deploy-smoke-check.md` | Post-deployment verification checklist |
| `docs/runbooks/database-backup-restore.md` | Neon database backup and restore |
| `docs/runbooks/local-parity.md` | Local dev environment parity with production |
| `docs/runbooks/redis-incident-response.md` | Redis incident response playbook |
| `docs/security-api-audit-2026-04.md` | April 2026 security and API audit report |
| `docs/full-audit-report-2026-04-22.md` | Full codebase audit report (April 22, 2026) |
| `AUDIT-REPORT-2026-04-24.md` | April 24 exhaustive repository audit — 335/520 items, 18 bugs, 9 zero-day risks |
| `all-files.txt` | File-by-file audit status inventory with classification markers |

### Files Added During Production Readiness Hardening

| Path | Purpose |
|------|---------|
| `backend/apps/applications/student_views.py` | Student-facing view module (split from monolithic views.py) |
| `backend/apps/applications/admin_views.py` | Admin view module with role-level privilege escalation guards |
| `backend/apps/applications/public_views.py` | Public/unauthenticated view module |
| `backend/apps/applications/document_views.py` | Document view module |
| `backend/apps/applications/interview_views.py` | Interview view module |
| `backend/apps/applications/history_views.py` | Timeline/history view module |
| `backend/apps/applications/_view_helpers.py` | Shared view utilities (permissions, pagination) |
| `backend/config/settings/staging.py` | Staging environment settings |
| `backend/apps/common/celery_signals.py` | Celery task signal handlers for monitoring |
| `backend/apps/common/management/commands/check_missed_tasks.py` | Management command to detect missed Celery Beat tasks |
| `backend/scripts/check_circular_imports.py` | Script to detect circular import chains |
| `backend/tests/property/test_production_readiness_*.py` | Property tests for CSRF, health, JTI, metrics, views, Celery, test isolation |

### Files Added During April 2026 Security Audit

| Path | Purpose |
|------|---------|
| `AUDIT-REPORT-2026-04-24.md` | Full repository audit report with 18 confirmed bugs, 9 zero-day risks, priority action plan |
| `all-files.txt` | File-by-file audit status inventory (~335 of 520 items audited) |
| `backend/tests/unit/test_admin_user_management_hardening.py` | Tests for privilege escalation guards and batch import audit trail |
| `backend/tests/unit/test_bulk_notification_task.py` | Tests for bulk notification retry dedup fix |
| `backend/tests/unit/test_application_review_payment_gate.py` | Tests for payment review gate status alignment |
| `backend/tests/unit/test_tracked_env_files.py` | Tests verifying no tracked env files contain real secrets |

### Files Removed During April 2026 Security Audit

| Path | Reason |
|------|--------|
| `.env.development` | Tracked placeholder file — removed to prevent confusion with gitignored real env files |
| `.env.production` | Tracked placeholder file — removed; `.env.example` is the canonical template |

### Files Added During Payment Hardening

Spec: `.kiro/specs/payment-hardening/` (Phases 1–5, feature-flag-gated additive rollout).

| Path | Purpose |
|------|---------|
| `docs/adrs/ADR-001-payment-is-source-of-truth.md` | ADR-1: Payment is the canonical source of truth; `applications.payment_status` is a derived summary |
| `docs/adrs/ADR-002-force-approved-distinct-status.md` | ADR-2: `force_approved` is a first-class ledger status |
| `docs/adrs/ADR-003-reuse-audit-logs.md` | ADR-3: Payment corrections + risk flags reuse `audit_logs` with `entity_type='payment'` |
| `docs/adrs/ADR-004-canonical-json-webhook-dedup.md` | ADR-4: Canonical JSON + `WebhookEventIdentity` for webhook dedup |
| `docs/adrs/ADR-005-metadata-jsonb-over-new-columns.md` | ADR-5: Snapshot/risk_flags/override fields live in `payments.metadata` jsonb |
| `docs/adrs/ADR-006-feature-flagged-additive-rollout.md` | ADR-6: Five-phase feature-flagged rollout with additive schema |
| `docs/adrs/ADR-007-single-mutation-entry-point.md` | ADR-7: `PaymentService._transition()` is the sole payment-status writer |
| `backend/scripts/payment_hardening_receipt_indexes.sql` | Phase 1 SQL: `uq_payments_receipt_number` + `idx_payments_user_status` |
| `backend/scripts/payment_hardening_receipt_indexes_rollback.sql` | Phase 1 SQL rollback |
| `backend/scripts/payment_snapshot_backfill.py` | Phase 1: populate `metadata.snapshot` on legacy Payment rows |
| `backend/apps/documents/payment_audit_service.py` | `PaymentAuditService` — payment audit writes + PII redaction |
| `backend/apps/documents/payment_metrics.py` | Counter registry with PII label guardrails (`PAYMENT_COUNTERS`, `ALLOWED_LABEL_VALUES`) |
| `backend/apps/documents/payment_error_codes.py` | Stable error-code catalogue (`PAYMENT_ERROR_CODES`) |
| `apps/admissions/src/lib/paymentErrorCodes.ts` | Frontend mirror of the stable-code catalogue + user-facing copy |
| `apps/admissions/tests/unit/__fixtures__/paymentErrorCodesBackendMirror.ts` | Drift-guard fixture for stable-code parity |
| `apps/admissions/tests/unit/paymentErrorCodes.test.ts` | Frontend ↔ backend stable-code drift test |
| `apps/admissions/tests/unit/paymentStatusLegacy.test.ts` | Regression: legacy `verified`/`paid`/`force_approved` → verified |
| `apps/admissions/tests/unit/paymentStepLegacyPath.test.tsx` | Regression: mobile-money-first UX preserved |
| `backend/tests/unit/test_payment_migration_indexes.py` | Phase 1: all 8 migration indexes exist on Postgres |
| `backend/tests/unit/test_payment_snapshot_backfill.py` | Phase 1: snapshot backfill idempotence + ambiguous-row skip |
| `backend/tests/unit/test_payment_backward_compatibility.py` | Regression: 50 legacy Payment-row shapes remain readable |
| `backend/tests/unit/test_payment_api_contract_preservation.py` | Regression: payment URLs + envelope shape unchanged |
| `backend/tests/unit/test_payment_service_transitions.py` | Phase 2 TDD: `_transition()` forward-only matrix + integrity gate |
| `backend/tests/unit/test_payment_service_sole_authority.py` | Phase 2 TDD: grep guard — no out-of-band `payments.status` writes |
| `backend/tests/unit/test_payment_audit_service.py` | `PaymentAuditService` unit tests |
| `backend/tests/unit/test_payment_metrics_registry.py` | Counter-registry + PII guardrail tests |
| `backend/tests/unit/test_payment_envelope_contract.py` | Envelope + stable-code contract across every payment endpoint |
| `backend/tests/unit/test_payment_sensitive_fields_lock.py` | Phase 2: sensitive-fields lock (skipped until API-layer lock ships) |
| `backend/tests/unit/test_payment_receipt_generation.py` | Phase 2: receipt idempotence + force-approved label |
| `backend/tests/unit/test_payment_dev_bypass_404.py` | Phase 2: dev-bypass lockout baseline (Phase 5 extends) |
| `backend/tests/unit/test_payment_reconciliation_task.py` | Phase 2+: reconciliation sweep behaviour |
| `backend/tests/unit/test_mobile_money_view_normalization.py` | Phase 2: MSISDN normalisation + operator derivation |
| `backend/tests/unit/test_payment_service_force_approve.py` | Phase 2: `force_approve` guards + audit retention |
| `backend/tests/unit/test_payment_error_codes_snapshot.py` | Phase 3: stable-code catalogue snapshot pin |
| `backend/tests/unit/test_webhook_processor_signature.py` | Phase 3: HMAC-SHA512 signature validation paths |
| `backend/tests/unit/test_webhook_processor_dedup.py` | Phase 3: `compute_identity` + `is_duplicate` tests |
| `backend/tests/unit/test_payment_webhook_out_of_order.py` | Phase 3: settled → successful → failed replay |
| `backend/tests/unit/test_webhook_processor_canonical_json.py` | Phase 3: canonical-JSON failure is logged, not propagated |
| `backend/tests/unit/test_webhook_processor_unknown_event.py` | Phase 3: unknown event types are logged, not mutating |
| `backend/tests/unit/test_payment_structured_logging.py` | Phase 3: structured-log tagging (xfailed until service code adds tags) |
| `backend/tests/unit/test_payment_webhook_returns_200.py` | Phase 3 regression: webhook 200-on-every-outcome contract |
| `backend/tests/property/test_payment_state_machine_properties.py` | Phase 2 PBTs — Properties 1, 2, 13, 14, 19, 23 |
| `backend/tests/property/test_payment_webhook_properties.py` | Phase 2 + 3 PBTs — Properties 5, 3, 4, 20, 21, 22 |
| `backend/tests/property/test_payment_fee_resolver_properties.py` | Phase 2 PBTs — Properties 10, 11, 15 (skipped), 16 |
| `backend/tests/property/test_payment_receipt_properties.py` | Phase 2 + 3 PBTs — Properties 17, 12, 6, 7, 8, 9 |
| `.kiro/specs/payment-hardening/exploration-results.md` | Phase 1 checkpoint: 23-property baseline register |

### Files Added During Payment Hardening Phases 4–5

Spec: `.kiro/specs/payment-hardening/` (Phases 4–5 complete). Phase 4 is
frontend-only and gated on `VITE_PAYMENT_HARDENING_UI`; Phase 5 is
backend-only and gated on `PAYMENT_HARDENING_RATE_LIMITS` +
`PAYMENT_HARDENING_FORCE_APPROVED`.

| Path | Purpose |
|------|---------|
| `apps/admissions/src/stores/paymentRecoveryStore.ts` | Phase 4: Zustand + localStorage recovery store keyed by `application_id` with 24-hour TTL |
| `apps/admissions/src/lib/paymentNextActions.ts` | Phase 4: `PaymentNextAction` stable-code union with user-facing copy |
| `apps/admissions/src/lib/zambianMsisdn.ts` | Phase 4: client-side Zambian MSISDN validation + normalisation (no operator inference) |
| `backend/apps/common/dev_bypass.py` | Phase 5: `require_not_dev_bypass_in_production` decorator + dev-bypass vector catalogue |
| `backend/apps/common/throttling.py` | Phase 5: `PaymentUserScopedRateThrottle` keyed by `user.pk` (auth) or client IP (anon) |
| `backend/apps/documents/risk_views.py` | Phase 5: `RiskFlagsListView` — `GET /api/v1/payments/risk-flags/` super-admin-only paginated list |
| `apps/admissions/tests/property/paymentRecoveryStore.property.test.ts` | Phase 4: fast-check round-trip + TTL + prune idempotence PBTs |
| `apps/admissions/tests/property/paymentStateMachine.property.test.ts` | Phase 4: Property 18 (UI state matrix determinism) enforcement PBT |
| `apps/admissions/tests/property/paymentErrorCodes.property.test.ts` | Phase 4: Property 16 frontend half (MSISDN idempotence) + stable-code copy completeness PBT |
| `apps/admissions/tests/unit/paymentErrorCodesCoverage.test.ts` | Phase 4: stable-code union vs copy map coverage snapshot |
| `apps/admissions/tests/unit/paymentRecoveryStorePersistence.test.ts` | Phase 4: recovery store survives page refresh via localStorage |
| `apps/admissions/tests/unit/derivePaymentUiState.test.ts` | Phase 4: exhaustive UI state matrix table |
| `apps/admissions/tests/unit/paymentFormButtonDisable.test.tsx` | Phase 4: initiate-button disabled while inflight or pending |
| `apps/admissions/tests/unit/usePaymentStatusTimeout.test.ts` | Phase 4: polling timeout sets `pollingExceededTimeout`, not `failed` |
| `apps/admissions/tests/unit/usePaymentStatusNoFailedOnTimeout.test.ts` | Phase 4 regression: status never transitions to `failed` on timeout |
| `apps/admissions/tests/unit/paymentStepLegacyMode.test.tsx` | Phase 4 regression: legacy mode unchanged under flag off |
| `apps/admissions/tests/unit/settingsDirtyStatePhase4.test.tsx` | Phase 4 regression: Settings `isDirty` guard preserved |
| `apps/admissions/tests/unit/paymentStepAccessibilityPhase4.test.tsx` | Phase 4 regression: focus-on-state-change + `aria-live` preserved |
| `apps/admissions/tests/unit/paymentStepMobileMoneyFirstPhase4.test.tsx` | Phase 4 regression: mobile-money tab remains primary |
| `apps/admissions/tests/integration/paymentStepUiStateMatrix.test.tsx` | Phase 4: each `PaymentUiState` renders correct affordances |
| `apps/admissions/tests/integration/paymentStepRecoveryRehydration.test.tsx` | Phase 4: mount rehydrates pending Payment from `paymentRecoveryStore` |
| `backend/tests/unit/test_payment_dev_bypass_404_phase5.py` | Phase 5: dev-bypass 404 for payment views (production settings) |
| `backend/tests/unit/test_payment_dev_bypass_audit.py` | Phase 5: `payment.dev_bypass_used` audit emitted in non-production |
| `backend/tests/unit/test_payment_dev_bypass_dev_passthrough_phase5.py` | Phase 5 regression: decorator is no-op absent a bypass vector |
| `backend/tests/unit/test_payment_rate_limiting.py` | Phase 5: per-scope rate-limit enforcement |
| `backend/tests/unit/test_payment_rate_limiting_webhook_exempt.py` | Phase 5: webhook ingress exempt from DRF throttle |
| `backend/tests/unit/test_payment_rate_limiting_flag_default.py` | Phase 5 regression: flag off preserves legacy throttle behaviour |
| `backend/tests/unit/test_payment_rate_limiting_envelope.py` | Phase 5: 429 envelope + `payment.rate_limited` audit + counter |
| `backend/tests/unit/test_application_review_force_approved.py` | Phase 5: force-approved path creates canonical ledger row |
| `backend/tests/unit/test_application_review_force_approved_legacy.py` | Phase 5 regression: legacy synthetic `successful` path preserved when flag off |
| `backend/tests/unit/test_super_admin_payment_correction.py` | Phase 5: super-admin correction permission matrix + audit-ordering guard |
| `backend/tests/unit/test_super_admin_payment_correction_routing.py` | Phase 5: `/correct/` route does not conflict with `/verify/` |
| `backend/tests/unit/test_payment_risk_flags_endpoint.py` | Phase 5: risk-flags permission matrix + filtering |
| `backend/tests/unit/test_phase5_endpoints_dev_bypass_404.py` | Phase 5: correction + risk-flags endpoints return 404 on any dev-bypass vector |

Payment hardening status: **Phases 1–5 complete**. Rollout matrix and
rollback order live in `docs/runbooks/payment-hardening-rollout.md`.

## Testing Layout

| Area | Location | Notes |
|------|----------|-------|
| Admissions frontend tests | `apps/admissions/tests/` | Unit, integration, and property coverage including audit fix validation |
| Admissions property tests | `apps/admissions/tests/property/` | fast-check property-based tests for bug conditions, preservation, and fix validation |
| Jobs Ops frontend validation | `apps/jobs-ops` commands | Type-check, lint, and build are current quality gates |
| Backend unit tests | `backend/tests/unit/` | Includes admissions, jobs-ops, and audit production fix coverage |
| Backend property tests | `backend/tests/property/` | Schema, middleware, validation, migration invariants, audit fix validation (hypothesis) |
| Browser automation tests | Monorepo root or app-local | Playwright for deterministic E2E flows |

## Current Migration-Sensitive Facts

- Admissions frontend calls Django `/api/v1/...` routes directly.
- Jobs-ops frontend also calls Django `/api/v1/...` routes directly.
- Jobs must use `/api/v1/job-applications/`, not admissions `/api/v1/applications/`.
- Backend only exposes `/api/v1/...` routes; there is no legacy compatibility router.
- `apps/jobs-ops` is now part of the real repo structure and must not be treated as a placeholder.
- Several legacy admissions test files still reference old paths; do not copy those assumptions into new code.

## What Not To Copy Forward

- Do not add code that assumes root `api/` or `api-src/` bundles exist.
- Do not introduce query-parameter action routes.
- Do not describe the backend as `django_api/`; the real package is `backend/`.
- Do not describe the frontend as a single root `src/`; the real apps are under `apps/`.
- Do not re-duplicate jobs-ops seeded state across multiple backend view modules.

### Files Added During PDF & Email Redesign (May 2026)

#### Admissions PDF system (`apps/admissions/src/lib/pdf/`)

| Path | Purpose |
|------|---------|
| `apps/admissions/src/lib/pdf/theme/colors.ts` | Print-safe ink scale + 3 accent colors |
| `apps/admissions/src/lib/pdf/theme/spacing.ts` | 4pt baseline grid + A4 dimensions |
| `apps/admissions/src/lib/pdf/theme/typography.ts` | `Font.register` for Playfair Display + Source Sans 3 + JetBrains Mono |
| `apps/admissions/src/lib/pdf/theme/index.ts` | Theme barrel + `institutions` registry + `getInstitution()` |
| `apps/admissions/src/lib/pdf/components/BrandHeader.tsx` | Logo + institution name + doc-type banner |
| `apps/admissions/src/lib/pdf/components/BrandFooter.tsx` | Fixed footer with auto page-numbering |
| `apps/admissions/src/lib/pdf/components/MetadataStrip.tsx` | Reference · issued · status row |
| `apps/admissions/src/lib/pdf/components/SectionHeading.tsx` | Playfair Display heading with optional gold underline |
| `apps/admissions/src/lib/pdf/components/LabeledField.tsx` | UPPERCASE label + value (mono/strong/fallback) |
| `apps/admissions/src/lib/pdf/components/FieldGrid.tsx` | 1- or 2-column grid of LabeledFields |
| `apps/admissions/src/lib/pdf/components/StatusBadge.tsx` | Pill: verified / approved / conditional / pending |
| `apps/admissions/src/lib/pdf/components/VerificationBlock.tsx` | QR + "Scan to verify" caption |
| `apps/admissions/src/lib/pdf/components/SignatureBlock.tsx` | Scanned PNG signature (default: Dr Solomon Musonda, MD — Managing Director) with Pinyon Script fallback for non-default signatories |
| `apps/admissions/src/lib/pdf/components/PageFrame.tsx` | A4 Page wrapper with fixed header/footer |
| `apps/admissions/src/lib/pdf/documents/ApplicationSlip.tsx` | Student application slip generator |
| `apps/admissions/src/lib/pdf/documents/PaymentReceipt.tsx` | Payment receipt with ZMW/USD support |
| `apps/admissions/src/lib/pdf/documents/AcceptanceLetter.tsx` | Unconditional + conditional offer letter |
| `apps/admissions/src/lib/pdf/documents/types.ts` | Input data shapes + `DEFAULT_SIGNATORY` |
| `apps/admissions/src/lib/pdf/qr.ts` | `buildQrDataUrl()` — JSON payload → PNG data URL |
| `apps/admissions/src/lib/pdf/render.ts` | `renderToBlob()` — the single async render seam |
| `apps/admissions/src/lib/pdf/index.ts` | Public barrel — callers import from here |
| `apps/admissions/src/lib/pdf/README.md` | Full system docs |
| `apps/admissions/public/fonts/pdf/*.ttf` | 3 variable fonts (Playfair Display, Source Sans 3, JetBrains Mono) |

#### Backend email system (`backend/apps/common/email/`)

| Path | Purpose |
|------|---------|
| `backend/apps/common/email/__init__.py` | Package marker |
| `backend/apps/common/email/tokens.py` | Color/font/spacing tokens — mirror of PDF theme |
| `backend/apps/common/email/components.py` | HTML helpers: paragraph, section_heading, cta_button, metadata_card, notice_box, signature_block, ordered_list, divider, to_plain_text |
| `backend/apps/common/email/shell.py` | `render_shell(content, title, preheader)` — institutional shell |
| `backend/apps/common/email/messages/application_submitted.py` | Student-submitted-their-application email |
| `backend/apps/common/email/messages/payment_received.py` | Payment-verified email (ZMW/USD aware) |
| `backend/apps/common/email/messages/interview_scheduled.py` | Interview slot assigned |
| `backend/apps/common/email/messages/acceptance.py` | Unconditional admission offer |
| `backend/apps/common/email/messages/conditional_acceptance.py` | Admission offer with conditions list |
| `backend/apps/common/email/messages/rejection.py` | Respectful decline letter |
| `backend/apps/common/email/messages/password_reset.py` | Security email with time-bounded link |
| `backend/apps/common/email/render.py` | `render_message(type, context) -> (subject, html, text)` dispatcher |
| `backend/apps/common/email/README.md` | Full email system docs |

#### Deleted (replaced by the new system)

| Path | Replacement |
|------|-------------|
| `apps/admissions/src/lib/applicationSlipPdf.ts` | `apps/admissions/src/lib/pdf/documents/ApplicationSlip.tsx` |
| `apps/admissions/src/lib/receiptGenerator.ts` | `apps/admissions/src/lib/pdf/documents/PaymentReceipt.tsx` |
| `apps/admissions/src/lib/acceptanceLetterGenerator.ts` | `apps/admissions/src/lib/pdf/documents/AcceptanceLetter.tsx` |
| `apps/admissions/src/lib/pdfLayout.ts` | `apps/admissions/src/lib/pdf/components/PageFrame.tsx` |

#### Still in use (unchanged — admin-only large-table exports)

| Path | Purpose |
|------|---------|
| `apps/admissions/src/lib/auditExports.ts` | Admin audit-trail CSV/JSON/PDF export (uses jspdf for large tables) |
| `apps/admissions/src/lib/exportUtils.ts` | Admin applications-roster CSV/XLSX/PDF export (uses jspdf + pdf-lib) |

#### Tests added

| Path | Purpose |
|------|---------|
| `apps/admissions/tests/unit/pdf/theme.test.ts` | 17 tests: color scale, spacing, font registration idempotence, institutions |
| `apps/admissions/tests/unit/pdf/primitives.test.tsx` | 28 tests: all 10 primitive components render cleanly |
| `apps/admissions/tests/unit/pdf/applicationSlip.test.tsx` | Application slip generator tests |
| `apps/admissions/tests/unit/pdf/paymentReceipt.test.tsx` | Payment receipt generator tests (ZMW/USD, missing fields) |
| `apps/admissions/tests/unit/pdf/acceptanceLetter.test.tsx` | Acceptance letter tests (both variants, 1/3/10 conditions) |
| `backend/tests/unit/test_email_component_system.py` | 21 tests: tokens, shell, components, XSS safety, backward-compat shim |
| `backend/tests/unit/test_email_messages.py` | 23 tests: per-message rendering, currency variants, dispatcher registry |
