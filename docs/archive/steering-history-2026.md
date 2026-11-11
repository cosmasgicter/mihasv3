# Steering history, 2026

Moved verbatim from `.kiro/steering/structure.md` by platform-simplification task 9.1. Source: commit `bd855b035` (`git show bd855b035:.kiro/steering/structure.md`). These "Files Added During ..." and "Files Removed During ..." tables record what earlier specs created and deleted. They describe history, not the current tree, so some paths below no longer exist. The current layout is in `structure.md`.

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

Spec: `.kiro/specs/_archived/payment-hardening/` (Phases 1–5, feature-flag-gated additive rollout).

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
| `.kiro/specs/_archived/payment-hardening/exploration-results.md` | Phase 1 checkpoint: 23-property baseline register |

### Files Added During Payment Hardening Phases 4–5

Spec: `.kiro/specs/_archived/payment-hardening/` (Phases 4–5 complete). Phase 4 shipped
frontend-only behind `VITE_PAYMENT_HARDENING_UI` and Phase 5 backend-only behind
`PAYMENT_HARDENING_RATE_LIMITS` + `PAYMENT_HARDENING_FORCE_APPROVED`;
admissions-v2 task 8.2 deleted all but the rate-limit flag along with the
duplicate implementations they selected, so everything below except the
throttle is now unconditional.

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

Payment hardening status: **Phases 1–5 complete**, converged onto a single
payment path by admissions-v2 task 8.2. Current state and real rollback
semantics live in `docs/runbooks/payment-hardening-rollout.md`.

### Files Removed During Admissions-V2 Task 8.2 (single payment path)

| Path / symbol | Reason |
|------|--------|
| `PaymentService._update_payment_status` | Second writer of `payments.status`; contradicted ADR-007 |
| `PaymentService.verify_payment` | Pre-hardening verification path; superseded by `verify` |
| `PaymentService.initiate_payment` | Pre-hardening initiation path; superseded by `initiate` |
| `PaymentService.process_webhook_event` + `_process_webhook_event_impl` | Pre-hardening callback path; superseded by `apply_webhook_event` |
| `WebhookProcessor._process_legacy`, `_payload_hash`, `_event_identity` | Second dedup contract; `WebhookEventIdentity` is canonical (ADR-004) |
| `payment_constants._ALLOWED_TRANSITIONS` | Second, narrower transition matrix |
| `payment_helpers._forward_only_enabled`, `_LEGACY_PAYMENT_TO_APP_STATUS` | Flag plumbing and legacy projection map |
| `payment_state_machine.check_legacy_mismatch` | Legacy-path integrity check; the 4-check gate is canonical |
| `poll_pending_payments_task` inline expiry loop | Expiry belongs to `PaymentService.expire_stale` |
| `apps/admissions/src/lib/paymentStatus.ts::isPaymentHardeningUiEnabled` | Build-time recovery switch |
| `backend/tests/unit/test_application_review_force_approved_legacy.py` | Existed only to pin the deleted synthetic-`successful` path |

### Files Added During Admissions-V2 Task 8.2 (single payment path)

| Path | Purpose |
|------|---------|
| `backend/apps/documents/payment_phase.py` | `derive_payment_phase` + `PHASE_UI_TIMEOUT_SECONDS` — separates *student must act* from *waiting on the provider* (STU-09). Pure, derived, never stored |
| `backend/tests/unit/test_payment_single_path_8_2.py` | The promoted outcome table + the flag/symbol drift guard |
| `backend/tests/unit/test_payment_phase_8_2.py` | Phase derivation, serializer contract, no-PII, and the two guards that parse `paymentStatus.ts` so the phase mirror cannot drift from either side |
| `backend/tests/unit/test_payment_idempotence_8_2.py` | Replay convergence for initialization, callback (service + ingress), reconciliation (verify + expiry), and the `applications.payment_status` projection |
| `apps/admissions/tests/unit/paymentPhaseUiStates.test.ts` | The two waiting states carry different affordances, and the student is chased sooner than the provider |

### Files Added During Admissions-V2 Task 8.3 (student payment ownership split)

Evidence: `docs/v2-evidence/8.3/README.md`.

| Path | Purpose |
|------|---------|
| `apps/admissions/src/components/student/payment/PaymentApplicationCard.tsx` | One submitted application's payment state, the single action for it, and its history. Reads the server's `phase`; never offers a second collection while one is open |
| `apps/admissions/src/lib/paymentRecovery.ts` | `PAYMENT_RECOVERY_PRESENTATION` — a **total** `Record<PaymentUiState, …>` plus the `deferred` override and the resend rule. `allowsInitiate` is the double-charge guard as data. Adds no state vocabulary: the keys are task 8.2's `PaymentUiState`, and the 120 s / 600 s budgets are read from `PAYMENT_WAITING_STATES`, never restated |
| `apps/admissions/src/lib/tenantSupport.ts` | `resolveTenantSupportContact` — the support affordance from resolved tenant context, with the neutral in-app `/contact` route as the only fallback (STU-24). Never a hardcoded address, never MIHAS/KATC |
| `apps/admissions/tests/unit/paymentOwnershipSplit.test.tsx` | Every post-submission state renders; no indefinite disabled control; support comes from context |
| `apps/admissions/tests/unit/paymentRecoveryPresentation.test.ts` | The pure mapper, including totality over `PaymentUiState` and the resend asymmetry |
| `apps/admissions/tests/unit/tenantSupportContact.test.ts` | Both resolver outcomes; no platform or legacy-school address is ever emitted |
| `apps/admissions/tests/property/paymentRecovery.property.test.ts` | 6 fast-check invariants over the mapper's whole input space: the double-charge guard, the resend implication, no spent budget rendered as a failure, and purity. Task invariants, not numbered spec properties |
| `apps/admissions/tests/harness-e2e/required/payment-ownership-split.spec.ts` | The 7 required browser journeys (golden + one per recovery state + STU-24), desktop and mobile |

### Files Added During Admissions-V2 Task 8.4 (server-scoped settlement + fee administration)

Evidence: `docs/v2-evidence/8.4/README.md`. Findings **ADM-06** (broad fetch plus
client-side institution filtering and browser-side totals) and **AUTH-02**
(role-based fee/settlement authority).

| Path | Purpose |
|------|---------|
| `backend/apps/documents/settlement_service.py` | **new** — `SettlementQueryService`: the one settlement/fee query authority. Scope before lookup, SQL filters + grouping, whole-filtered-set aggregates, derived reconciliation state, capability-driven `RedactionPolicy`, page-independent export with `EXPORT_ROW_LIMIT` |
| `backend/apps/documents/fee_admin_views.py` | **new** — `AdminFeeListView` (`GET /api/v1/admin/fees/`) + `FeeAdminQueryService`: the scoped fee report that replaces the admin page's per-offering fetch |
| `backend/apps/catalog/tenant_audit_service.py` | `record_export` + `ACTION_SETTLEMENT_EXPORTED` / `ACTION_FEE_EXPORTED` — a bulk export is a recorded command (actor, scope, filters, row count, redaction; never the rows) |
| `backend/apps/documents/payment_query_views.py` | `PaymentSettlementSummaryView` rewritten (capability-gated, paginated, aggregated, reconciliation-aware, audited export); `ProgramFeeViewSet` re-gated on capabilities and every write audited |
| `backend/tests/unit/test_settlement_fee_authority_8_4.py` | **new** — 35 cases: tenant A/B authority across list/detail/search/aggregate/export, reconciliation state, redaction, export capability + audit, and "the server owns the numbers" |
| `apps/admissions/src/services/admin/settlement.ts` | **new** — settlement + fee report reads, export paths, and the server-CSV download; sends filters, derives nothing |
| `apps/admissions/src/hooks/admin/useMoneyAdmin.ts` | **new** — React Query hooks whose key is the whole server query |
| `apps/admissions/src/pages/admin/tenants/SettlementPanel.tsx` | rewritten: institution is a server filter, totals are the server's aggregates, reconciliation state is rendered as a label, export follows `can_export` |
| `apps/admissions/src/pages/admin/ProgramFees.tsx` | reads the one scoped fee report; `formatFeeAmount` no longer re-quantises money (`formatServerAmount`), and the headline numbers are server aggregates |
| `apps/admissions/tests/unit/moneyAdminServerOwned.test.tsx` | **new** — 12 cases proving the wiring: institution reaches the server, aggregates survive paging, export authority comes from the backend |

Two documented contract strengthenings shipped with it (both recorded in the
evidence README): a no-scope actor is **masked 404** on the settlement report and
the fee list instead of receiving a confirming empty page, and an **export
requires the explicit `tenant.application.export` capability** rather than being
implied by read access.

Two harness-level changes shipped with 8.3, both documented in
`docs/v2-evidence/8.3/README.md` §4:

- `tests/harness-e2e/harness-fixtures.ts` — a `net::ERR_ABORTED` is recorded as a
  **cancellation** (`gate.cancelledRequests`), not a failed request: the browser
  withdrew the call, so the platform never answered. Every other transport failure
  and every HTTP >= 400 still fails a run, and all four gatecheck probes still fire.
- `tests/harness-e2e/helpers/ops.ts` — `runReconciliationExpirySweep` (the platform's
  own `expire_stale`, 24 h cutoff compressed to zero) and
  `closeAbandonedAdapterCollection` (tell the simulator a collection was abandoned on
  purpose, which is what `expired` means, so the drain gate stops waiting for it).

### Files Added During Student Journey Repair

Spec: `.kiro/specs/student-journey-repair/` (Spec A, P0a tasks 1-3). The R7 tests
keep strict markers until task 5.6.

| Path | Purpose |
|------|---------|
| `apps/admissions/src/services/uploadTransport.ts` | The one upload transport (R2): honest progress, one retry policy; `requiredDocumentsService.upload` is its only caller |
| `apps/admissions/src/lib/imageDownscale.ts` | Client-side image downscale before upload (R2) |
| `apps/admissions/src/lib/rateLimitCopy.ts` | Student-facing copy for a `RATE_LIMITED` (429) answer with `Retry-After` (R3) |
| `apps/admissions/src/lib/documentOpen.ts` | Query grammar of the document opener (`documentOpenHref`, `parseDocumentOpenSearch`) (R5-a) |
| `apps/admissions/src/pages/student/DocumentOpen.tsx` | `/student/documents/open`: the one place a student opens a stored document (R5-a) |
| `apps/admissions/src/pages/student/applicationWizard/lib/draftGrades.ts` | Grades as a draft-machine channel with partial adapters (R6-b) |
| `apps/admissions/src/pages/student/applicationWizard/lib/pageSaveView.ts` | `deriveWizardPageSaveView`: the draft machine's view composed with document commands (R6-b) |
| `apps/admissions/src/hooks/auth/useSessionRestoreOnce.ts` | One session-restore attempt per guard mount; `suppressSessionRestore()` / `allowSessionRestore()` (R8-a) |
| `backend/apps/common/ratelimit_metrics.py` | The `ratelimit.limited` counter (labels `scope`, `key_kind` only) (R3) |
| `backend/apps/common/management/commands/storage_roundtrip_check.py` | Put/get/delete round trip against the configured object store (R1) |
| `backend/.env.local.test.example` | Tracked template for the local-test stack (R1) |
| `backend/scripts/2026_11_02_01_repair_document_snapshot_presence.sql` (+ `_rollback`) | Data-only, idempotent repair of NULL document snapshot columns (R4-d) |
| `backend/tests/db_host_guard.py` | Refuses a test database host that is not local (task 2.1) |
| `apps/admissions/tests/unit/__fixtures__/zambianMsisdnVectors.json` | Shared MSISDN vectors for the frontend/backend drift guard (R8-b) |
| `apps/admissions/tests/unit/__fixtures__/readinessInput.ts` | Shared fixture for the one submit-readiness computation (R6-a) |
| `apps/admissions/tests/unit/zambianMsisdnVectors.test.ts` + `backend/tests/unit/test_zambian_msisdn_vectors.py` | MSISDN drift guard (R8-b) |
| `apps/admissions/tests/unit/sjr*.test.ts(x)`, `apps/admissions/tests/property/sjr*.property.test.ts(x)` | Exploration (bug condition) and preservation tests for R2, R3, R5, R6, R7, R8, R10 |
| `backend/tests/unit/test_sjr_*.py`, `backend/tests/integration/test_sjr_*.py`, `backend/tests/property/test_sjr_preservation_properties.py` | Exploration and preservation tests for R1-R8 |
| `backend/tests/unit/test_no_persisted_signed_urls_sjr.py`, `test_document_key_resolution_sjr.py`, `test_storage_settings_contract.py`, `test_startup_env_validation.py`, `test_documented_env_vars_are_read.py` | Drift guards for storage keys, storage settings, startup refusal and documented environment variables (R1, R4) |
| `.github/workflows/student-journey-gate.yml` | Blocking CI: jobs `journey-gate` and `local-stack-storage`; no `paths:` filter, relevance decided in-job so required checks report on unrelated changes (R9-e) |
| `apps/admissions/playwright.journey-gate.config.ts` | Gate config: projects `journey-gate-mobile` (390x844, Chromium) and `journey-gate-desktop` (1440x900), retries 0, workers 1 (R9-b) |
| `apps/admissions/tests/harness-e2e/journey-gate/` | `student-journey-gate.spec.ts`, `submit-desktop.spec.ts`, `upload-near-limit.spec.ts`, `a11y-surfaces.spec.ts`, plus `strictStatusGuard.ts`, `rateLimitHeadroom.ts`, `gate-fixtures.ts`, `gate-api.ts`, `journey-steps.ts` and `fixtures.ts` (files generated at test time) (R9-b) |
| `harness/checks/edge_two_clients.py` | Two client addresses behind Caddy have independent rate-limit buckets; stdlib only, run in two `adapters` containers (R9-c) |
| `apps/admissions/tests/unit/journeyGateGuards.test.ts`, `backend/tests/unit/test_journey_gate_configuration_sjr.py` | Drift guards for the gate's guards and configuration (R9) |

### Files Added During PDF & Email Redesign (May 2026)

Historical note: the frontend React-PDF files below remain useful for dev
preview or explicitly non-official preview work, but they are no longer the
authority for production official student/admin documents. Official documents
are backend-generated through
`backend/apps/applications/official_document_views.py` and the tenant-aware PDF
renderers under `backend/apps/applications/tasks/pdf/`, using
`InstitutionDocumentProfile` and `InstitutionAsset` tenant configuration.
Student/admin official download and email flows should consume
`apps/admissions/src/services/officialDocuments.ts`.

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

## Platform simplification and polish (Spec B): files added and removed

Recorded by task 36 against the base `fix/student-journey-repair` (merge-base to the head of `feat/platform-simplification-and-polish`). Regenerate with `git diff --name-status <base>...HEAD` and keep `A` and `D` rows. The raw evidence directories are removed from the tree only, not purged from history (D2, D11).

### Removed in bulk

| Path prefix | Files removed | Task |
|---|---|---|
| `.agenthub/` | 8 | D15 removals, see tasks.md |
| `.agents/` | 142 | see tasks.md |
| `.kiro/skills/` | 3807 | 8.2 (skills pruned to the keep list) |
| `apps/admissions/src/lib/pdf/` | 31 | D15 removals, see tasks.md |
| `apps/admissions/tests/unit/pdf/` | 12 | D15 removals, see tasks.md |
| `docs/v2-evidence/` | 2270 | 11.1 (raw artefacts untracked, D2) |
| `scripts/agenthub/` | 6 | D15 removals, see tasks.md |
| `scripts/launch-verification/` | 12 | D15 removals, see tasks.md |

### Removed individually

- `===`
- `apps/admissions/scripts/render-pdf-samples.tsx`
- `apps/admissions/src/components/8starlabs/index.ts`
- `apps/admissions/src/components/8starlabs/timeline.tsx`
- `apps/admissions/src/components/admin/AdminCommunicationsPanel.tsx`
- `apps/admissions/src/components/admin/index.ts`
- `apps/admissions/src/components/auth/index.ts`
- `apps/admissions/src/components/motion/Confetti.tsx`
- `apps/admissions/src/components/navigation/BaseNavigation.tsx`
- `apps/admissions/src/components/navigation/Breadcrumbs.tsx`
- `apps/admissions/src/components/navigation/index.ts`
- `apps/admissions/src/components/smoothui/animated-counter.tsx`
- `apps/admissions/src/components/smoothui/shape-landing-hero.tsx`
- `apps/admissions/src/components/ui/AppShellSkeleton.tsx`
- `apps/admissions/src/components/ui/AuthLoadingOverlay.tsx`
- `apps/admissions/src/components/ui/DataPopulationConfirmation.tsx`
- `apps/admissions/src/components/ui/FocusTrap.tsx`
- `apps/admissions/src/components/ui/FormError.tsx`
- `apps/admissions/src/components/ui/FormFeedback.tsx`
- `apps/admissions/src/components/ui/InlineLoader.tsx`
- `apps/admissions/src/components/ui/LoadingButton.tsx`
- `apps/admissions/src/components/ui/LoadingFallback.tsx`
- `apps/admissions/src/components/ui/LoadingOverlay.tsx`
- `apps/admissions/src/components/ui/LoadingSpinner.tsx`
- `apps/admissions/src/components/ui/PageLoadingFallback.tsx`
- `apps/admissions/src/components/ui/ProgressIndicator.tsx`
- `apps/admissions/src/components/ui/Radio.tsx`
- `apps/admissions/src/components/ui/SafeHtml.tsx`
- `apps/admissions/src/components/ui/SaveStatusIndicator.tsx`
- `apps/admissions/src/components/ui/Spinner.tsx`
- `apps/admissions/src/components/ui/Stepper.tsx`
- `apps/admissions/src/components/ui/form-radio-group.tsx`
- `apps/admissions/src/forms/applicationSchema.ts`
- `apps/admissions/src/hooks/auth/useRoleVerification.ts`
- `apps/admissions/src/hooks/queries/index.ts`
- `apps/admissions/src/hooks/queries/useApplicationDataQueries.ts`
- `apps/admissions/src/hooks/queries/useApplicationQueries.ts`
- `apps/admissions/src/hooks/useApplicationSubmit.ts`
- `apps/admissions/src/hooks/useStyleInjection.ts`
- `apps/admissions/src/hooks/useUserManagement.ts`
- `apps/admissions/src/lib/applicationSlip.ts`
- `apps/admissions/src/lib/applicationSlip.types.ts`
- `apps/admissions/src/lib/applicationSlipStorage.ts`
- `apps/admissions/src/lib/applicationStats.ts`
- `apps/admissions/src/lib/gradeValidation.ts`
- `apps/admissions/src/lib/institutionFacts.ts`
- `apps/admissions/src/lib/slipService.ts`
- `apps/admissions/src/lib/storage.ts`
- `apps/admissions/src/pages/dev/AcceptanceLetterPreview.tsx`
- `apps/admissions/src/pages/dev/DocumentPreview.tsx`
- `apps/admissions/src/pages/dev/hooks/useDocumentGeneration.ts`
- `apps/admissions/src/pages/dev/hooks/usePaymentReceipt.ts`
- `apps/admissions/src/pages/student/applicationWizard/components/ApplicationPreview.tsx`
- `apps/admissions/src/pages/student/applicationWizard/components/StepChecklist.tsx`
- `apps/admissions/src/pages/student/applicationWizard/components/WizardContextPanel.tsx`
- `apps/admissions/src/pages/student/applicationWizard/constants.ts`
- `apps/admissions/src/pages/student/applicationWizard/hooks/useOverallProgress.ts`
- `apps/admissions/src/pages/student/applicationWizard/hooks/wizard/index.ts`
- `apps/admissions/src/pages/student/applicationWizard/hooks/wizard/state/useWizardState.ts`
- `apps/admissions/src/pages/student/applicationWizard/hooks/wizard/useWizardFileUploads.ts`
- `apps/admissions/src/pages/student/applicationWizard/hooks/wizard/utils/wizardUtils.ts`
- `apps/admissions/src/pages/student/applicationWizard/lib/wizardChecklist.ts`
- `apps/admissions/src/services/csrfManager.ts`
- `apps/admissions/src/types/application.ts`
- `apps/admissions/src/types/dashboard.ts`
- `apps/admissions/src/types/eligibility.ts`
- `apps/admissions/src/types/eligibilityAssessment.ts`
- `apps/admissions/src/types/errors.ts`
- `apps/admissions/src/types/users.ts`
- `apps/admissions/tests/property/applicationStats.property.test.ts`
- `apps/admissions/tests/property/keyboard-navigation.property.test.tsx`
- `apps/admissions/tests/property/style-injection.property.test.tsx`
- `apps/admissions/tests/property/test_bug5_preservation.test.ts`
- `apps/admissions/tests/unit/appShellSkeleton.test.tsx`
- `apps/admissions/tests/unit/applicationStats.test.ts`
- `apps/admissions/tests/unit/documentUploadPayload.test.ts`
- `apps/admissions/tests/unit/shapeLandingHero.test.tsx`
- `apps/admissions/tests/unit/slipServiceEmail.test.ts`
- `apps/admissions/tests/unit/useApplicationSubmitSafety.test.ts`
- `apps/admissions/tests/unit/useDocumentGeneration.test.tsx`
- `apps/student-portal/README.md`
- `apps/student-portal/package.json`
- `apps/website/README.md`
- `apps/website/package.json`
- `backend/.env.local.test.example`
- `backend/apps/applications/views.py`
- `backend/apps/common/v2/demo_views.py`
- `backend/docker-compose.local-real.yml`
- `backend/docker-compose.local-test.yml`
- `backend/docker-compose.yml`
- `backend/tests/integration/test_agenthub_smoke.py`
- `backend/tests/integration/test_launch_verification_rollup_store.py`
- `backend/tests/property/test_launch_verification_migration.py`
- `backend/tests/property/test_launch_verification_onboarding.py`
- `backend/tests/property/test_launch_verification_operational.py`
- `backend/tests/property/test_launch_verification_performance.py`
- `backend/tests/property/test_launch_verification_rollup.py`
- `backend/tests/unit/test_agenthub_layout.py`
- `backend/tests/unit/test_board_manager.py`
- `backend/tests/unit/test_dag_analyzer.py`
- `backend/tests/unit/test_hub_init.py`
- `backend/tests/unit/test_launch_verification_migration_recorder.py`
- `backend/tests/unit/test_launch_verification_operational_checker.py`
- `backend/tests/unit/test_launch_verification_suite_collector.py`
- `backend/tests/unit/test_result_ranker.py`
- `docs/launch-evidence/launch-readiness.md`
- `docs/launch-evidence/rollup.json`
- `scripts/check-pdf-chunk-load.mjs`

### Added

- `apps/admissions/playwright.rendered-gate.config.ts`
- `apps/admissions/scripts/resourceHints.ts`
- `apps/admissions/scripts/stack-hosts.ts`
- `apps/admissions/src/components/admin/applications/ReviewNotFound.tsx`
- `apps/admissions/src/components/landing/LandingHero.tsx`
- `apps/admissions/src/components/navigation/backNavigation.ts`
- `apps/admissions/src/components/ui/OptionalMarker.tsx`
- `apps/admissions/src/hooks/admin/useQueueWidthBand.ts`
- `apps/admissions/src/hooks/useLandingProgrammes.ts`
- `apps/admissions/src/lib/adminQueueText.ts`
- `apps/admissions/src/lib/constants/landingRequirements.ts`
- `apps/admissions/src/lib/documentStatePresentation.ts`
- `apps/admissions/src/lib/landingProgrammes.ts`
- `apps/admissions/src/lib/statusTone.ts`
- `apps/admissions/src/pages/public/ForSchoolsPage.tsx`
- `apps/admissions/src/pages/student/applicationWizard/components/WizardStillNeeded.tsx`
- `apps/admissions/src/pages/student/applicationWizard/lib/subjectOptions.ts`
- `apps/admissions/src/pages/student/applicationWizard/lib/wizardFieldFocus.ts`
- `apps/admissions/src/pages/student/applicationWizard/lib/wizardProgress.ts`
- `apps/admissions/src/stores/adminQueueViewStore.ts`
- `apps/admissions/tests/harness-e2e/gatecheck/outside-host-csp.gate.spec.ts`
- `apps/admissions/tests/harness-e2e/gatecheck/outside-host-navigation.gate.spec.ts`
- `apps/admissions/tests/harness-e2e/gatecheck/outside-host-popup.gate.spec.ts`
- `apps/admissions/tests/harness-e2e/helpers/host-resolver.ts`
- `apps/admissions/tests/harness-e2e/helpers/outside-hosts.ts`
- `apps/admissions/tests/harness-e2e/rendered-gate/global-setup.ts`
- `apps/admissions/tests/harness-e2e/rendered-gate/impeccable.ts`
- `apps/admissions/tests/harness-e2e/rendered-gate/measure.ts`
- `apps/admissions/tests/harness-e2e/rendered-gate/pages.ts`
- `apps/admissions/tests/harness-e2e/rendered-gate/rendered-gate.spec.ts`
- `apps/admissions/tests/harness-e2e/rendered-gate/selector.ts`
- `apps/admissions/tests/property/platformSimplificationPolish.property.test.ts`
- `apps/admissions/tests/unit/adminQueueRows.test.tsx`
- `apps/admissions/tests/unit/adminQueueView.test.ts`
- `apps/admissions/tests/unit/adminReviewRoute.test.tsx`
- `apps/admissions/tests/unit/adminShellAndMetrics.test.tsx`
- `apps/admissions/tests/unit/assignedSchoolFeeEstimate.test.tsx`
- `apps/admissions/tests/unit/checkLocalBuildHosts.test.ts`
- `apps/admissions/tests/unit/desktopSidebarNoStatusBlock.test.ts`
- `apps/admissions/tests/unit/documentStatePresentation.test.ts`
- `apps/admissions/tests/unit/harnessDsnDefault.test.ts`
- `apps/admissions/tests/unit/landingHonestCopy.test.ts`
- `apps/admissions/tests/unit/landingProgrammes.test.tsx`
- `apps/admissions/tests/unit/letterCopyAlignment.test.ts`
- `apps/admissions/tests/unit/navLabels.test.tsx`
- `apps/admissions/tests/unit/noDeveloperNarration.test.ts`
- `apps/admissions/tests/unit/noHardcodedStudentEmail.test.ts`
- `apps/admissions/tests/unit/ocrAvailableContract.test.ts`
- `apps/admissions/tests/unit/optionalFieldMarker.test.tsx`
- `apps/admissions/tests/unit/outsideHostLog.test.ts`
- `apps/admissions/tests/unit/renderedGateRoles.test.ts`
- `apps/admissions/tests/unit/renderedGateSelector.test.ts`
- `apps/admissions/tests/unit/resourceHints.test.ts`
- `apps/admissions/tests/unit/textTokenAlpha.test.ts`
- `apps/admissions/tests/unit/unreferencedModules.test.ts`
- `apps/admissions/tests/unit/wizardBackNavigation.test.ts`
- `apps/admissions/tests/unit/wizardFieldFocus.test.ts`
- `apps/admissions/tests/unit/wizardHeadingOrder.test.ts`
- `apps/admissions/tests/unit/wizardProgressStates.test.tsx`
- `apps/jobs-ops/src/app/FeatureGate.tsx`
- `apps/jobs-ops/src/app/JobsOpsNotEnabled.tsx`
- `apps/jobs-ops/tests/unit/featureGate.test.tsx`
- `apps/jobs-ops/tests/unit/platformMeta.test.ts`
- `backend/apps/common/local_database.py`
- `backend/apps/documents/ocr_opt_in_views.py`
- `backend/apps/documents/ocr_policy.py`
- `backend/requirements-dev.in`
- `backend/requirements-dev.txt`
- `backend/requirements.in`
- `backend/tests/integration/test_unmanaged_table_cleanup.py`
- `backend/tests/jobs_ops_urls.py`
- `backend/tests/ocr_fixtures.py`
- `backend/tests/property/test_platform_simplification_properties.py`
- `backend/tests/unit/test_email_send_route_without_jobs_ops.py`
- `backend/tests/unit/test_empty_frontend_url_links.py`
- `backend/tests/unit/test_jobs_ops_route_gating_12_1.py`
- `backend/tests/unit/test_local_database_rule.py`
- `backend/tests/unit/test_ocr_available_contract_18_2.py`
- `backend/tests/unit/test_ocr_opt_in_18_1.py`
- `backend/tests/unit/test_removed_capability_grant_17_1.py`
- `backend/tests/unit/test_roster_document_counts_30_4.py`
- `backend/tests/unit/test_settings_outbound_defaults.py`
- `backend/tests/unit/test_steering_beat_table.py`
- `backend/tests/unit/test_test_settings_isolation.py`
- `docs/archive/steering-history-2026.md`
- `docs/evidence/platform-simplification-and-polish/17.3-merge-table-draft.md`
- `docs/evidence/platform-simplification-and-polish/8.1-capability-inventory.md`
- `docs/evidence/platform-simplification-and-polish/8.2-skill-keep-list.md`
- `docs/evidence/platform-simplification-and-polish/8.3-d15-items.md`
- `docs/evidence/platform-simplification-and-polish/README.md`
- `harness/bin/local-setup.sh`
- `scripts/capability_inventory.py`
- `scripts/check-local-build-hosts.ts`
- `scripts/check_backend_image.py`
- `scripts/check_doc_paths.py`
- `scripts/check_requirements_lock.py`
- `scripts/doc-paths-allowlist.json`
- `scripts/evidence_refs.py`
- `scripts/rendered-design-baseline.json`
- `scripts/rendered-gate-compare.ts`
- `scripts/rendered-gate-rules.ts`
- `scripts/route-consumers.json`
- `scripts/routes-report-baseline.json`
- `scripts/routes_report.py`
- `scripts/skill-paths-baseline.json`
- `scripts/skill_keep_list.py`
- `scripts/spec-status-exceptions.json`
- `scripts/tests/test_backend_lock_scripts.py`
- `scripts/tests/test_capability_inventory.py`
- `scripts/tests/test_check_doc_paths.py`
- `scripts/tests/test_evidence_refs.py`
- `scripts/tests/test_local_setup_doc.py`
- `scripts/tests/test_local_setup_prereqs.py`
- `scripts/tests/test_routes_report.py`
- `scripts/tests/test_skill_keep_list.py`
- `scripts/unreferenced-modules-allowlist.json`
- `scripts/unreferenced-modules-baseline.json`
- `scripts/unreferenced-modules.ts`
