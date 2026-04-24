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
