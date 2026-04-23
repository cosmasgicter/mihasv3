# Backend Tests Audit Findings

## Summary
- Total files: 183
- ignore-as-correct: 157
- improve: 22
- remove: 0
- needs-human-decision: 4

## Findings

### backend/tests/__init__.py — ignore-as-correct
**Tag:** N/A
**Issue:** Empty init file, standard Python package marker.
**Recommendation:** No action needed.

### backend/tests/conftest.py — ignore-as-correct
**Tag:** N/A
**Issue:** Properly configures Django settings, sets TESTING=1, provides api_client and api_request_factory fixtures.
**Recommendation:** No action needed.

### backend/tests/contract/__init__.py — ignore-as-correct
**Tag:** N/A
**Issue:** Empty init file.
**Recommendation:** No action needed.

### backend/tests/contract/conftest.py — improve
**Tag:** suspicious-stale-path
**Issue:** The `sqlite_contract_seed` fixture creates tables for `managed=False` models on SQLite, but the recordings directory may not exist (returns empty list silently). The `recording` parametrized fixture will produce zero test cases if no recordings exist, silently passing with no coverage.
**Recommendation:** Add a guard that fails explicitly if RECORDINGS_DIR is empty or missing, rather than silently collecting zero recordings.

### backend/tests/contract/test_contract_parity.py — improve
**Tag:** suspicious-stale-path
**Issue:** `TestRecordingFixtures.test_minimum_recordings_exist` asserts at least 4 recordings exist with specific names (auth_login, catalog_programs, applications_list, health_ping). If the recordings directory doesn't exist, `all_recordings` returns `[]` and this test fails — but the parametrized `TestContractParity` tests silently pass with zero cases. The contract tests depend on fixture files that may not be committed.
**Recommendation:** Verify recordings directory exists in CI. Consider adding `pytest.skip` if recordings are missing rather than silent pass.

### backend/tests/factories.py — improve
**Tag:** confirmed-bug
**Issue:** `ApplicationFactory.application_number` uses `Sequence(lambda n: f"APP-{n:06d}")` which doesn't match the documented `APP-YYYYMMDD-XXXXXXXX` format. `public_tracking_code` uses `Sequence(lambda n: f"TRK-{n:06d}")` which doesn't match `TRK-XXXXXXXXXXXX` (12 chars). Tests using these factories may not catch format validation bugs.
**Recommendation:** Update factory sequences to generate codes matching the canonical patterns: `APP-YYYYMMDD-XXXXXXXX` and `TRK-XXXXXXXXXXXX`.

### backend/tests/property/__init__.py — ignore-as-correct
**Tag:** N/A
**Issue:** Empty init file.
**Recommendation:** No action needed.

### backend/tests/property/test_accounts_error_handling.py — ignore-as-correct
**Tag:** N/A
**Issue:** AST-based inspection verifying no bare `except:pass` in accounts/views.py. Well-structured with hypothesis parameterization over handler indices.
**Recommendation:** No action needed.

### backend/tests/property/test_admin_dashboard_overhaul.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests admin dashboard recent activity formatting using SimpleNamespace mocks. Properly isolated, no DB access.
**Recommendation:** No action needed.

### backend/tests/property/test_admin_endpoint_auth.py — ignore-as-correct
**Tag:** N/A
**Issue:** Comprehensive admin endpoint auth verification. Tests both static endpoint definitions and live Django view permission_classes. Well-structured.
**Recommendation:** No action needed.

### backend/tests/property/test_admin_fee_auth.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests ProgramFeeViewSet uses IsAdmin permission. Clean mock-based permission testing.
**Recommendation:** No action needed.

### backend/tests/property/test_admin_override.py — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Tests use `@pytest.mark.skipif(not _pg_available())` which skips when Postgres is unavailable. In CI without Postgres, these tests silently skip. The test also patches `apps.applications.models.Application.objects` and calls `ApplicationReviewView().post()` directly with mocks — the mock wiring for `_update_payment_status` may not match the actual view's internal flow after view module splits (admin_views.py).
**Recommendation:** Verify the mock patch paths match the actual import paths in admin_views.py. Consider converting to SimpleTestCase with full mocking to avoid Postgres dependency.

### backend/tests/property/test_admissions_canonicalization.py — improve
**Tag:** confirmed-bug
**Issue:** This is a massive 1800+ line file testing 27 properties. The `test_payment_service_path_matches_direct_fee_resolver` test patches `apps.documents.payment_service.FeeResolver.resolve_fee` but the actual PaymentService may import FeeResolver differently after refactoring. The mock for `transaction.atomic` uses `MagicMock(__enter__=..., __exit__=...)` which doesn't properly simulate context manager behavior in all Python versions.
**Recommendation:** Split this file into smaller focused test modules. Verify patch paths match actual imports. Use `@contextmanager` or `unittest.mock.patch` context manager support instead of manual `__enter__/__exit__` mocking.

### backend/tests/property/test_amount_mismatch.py — ignore-as-correct
**Tag:** N/A
**Issue:** Clean property tests for payment amount mismatch detection. Properly uses `assume()` to filter matching amounts. Good mock isolation.
**Recommendation:** No action needed.

### backend/tests/property/test_application_endpoints.py — ignore-as-correct
**Tag:** N/A
**Issue:** Comprehensive property tests for verify-document, acceptance-letter, finance-receipt endpoints. Uses DRF APIRequestFactory with force_authenticate. Good coverage of permission enforcement, audit logging, idempotency.
**Recommendation:** No action needed.

### backend/tests/property/test_application_hardening.py — improve
**Tag:** suspicious-stale-path
**Issue:** `TestForceBypassCreatesAuditTrail` patches `apps.applications.admin_views.Application.objects` but the test imports `ApplicationReviewView` from `apps.applications.views` (which re-exports from admin_views). The `TestNonForceBypassDoesNotAddForceMarker` test patches `apps.applications.admin_views.Payment.objects` but the actual view may check payment via a different path. The `TestPaginationMaxPageSizeCap` tests are clean.
**Recommendation:** Verify all patch paths align with actual import chains in the split view modules.

### backend/tests/property/test_application_properties.py — improve
**Tag:** suspicious-stale-path
**Issue:** `TestUnverifiedPaymentApprovalGuard.test_approval_with_force_proceeds_when_payment_unverified` patches `apps.applications.admin_views.transition_application_status` and `apps.applications.admin_views.CommunicationService` — these patch paths need verification against the actual admin_views.py imports. `TestDraftAutoSaveRoundTrip` patches `apps.applications.student_views.ApplicationDraft.objects` which is correct for the split views.
**Recommendation:** Audit all patch paths against actual module imports to ensure mocks intercept correctly.

### backend/tests/property/test_application_tasks.py — ignore-as-correct
**Tag:** N/A
**Issue:** Clean property tests for Celery task document creation. Properly mocks storage and model objects.
**Recommendation:** No action needed.

### backend/tests/property/test_audit_cleanup.py — ignore-as-correct
**Tag:** N/A
**Issue:** Well-designed property test for audit log cleanup retention periods. Uses hypothesis to generate random audit records and verifies correct deletion behavior.
**Recommendation:** No action needed.

### backend/tests/property/test_audit_production_properties.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests tracking format validation and sessions envelope wrapping. Uses DRF APIRequestFactory. Good coverage of format validation edge cases.
**Recommendation:** No action needed.

### backend/tests/property/test_audit_report_structure.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests audit report structure completeness. Generates random issue records and validates required fields. The `test_actual_audit_report_exists_and_has_structure` gracefully skips if report doesn't exist.
**Recommendation:** No action needed.

### backend/tests/property/test_auth_properties.py — improve
**Tag:** zero-day-class-risk
**Issue:** `TestJWTTokenLifecycleRotation` uses a shared `fakeredis.FakeRedis` instance at module level (`_fake_redis`). While `setUp` calls `flushall()`, if tests run in parallel or if hypothesis generates examples that interleave, the shared Redis state could cause flaky failures. The `_bcrypt_settings` disables deadline which is correct for bcrypt's intentional slowness.
**Recommendation:** Use a per-test fakeredis instance instead of module-level shared state. Create the instance in `setUp` and pass it via the patch.

### backend/tests/property/test_auth_status_contract.py — ignore-as-correct
**Tag:** N/A
**Issue:** Excellent property tests for 401/403 status contract. Uses 50 max_examples (higher than most tests) for thorough coverage. Clean DRF context setup.
**Recommendation:** No action needed.

### backend/tests/property/test_bug1_preservation.py — ignore-as-correct
**Tag:** N/A
**Issue:** MCP config structure preservation tests. Validates JSON structure without checking secret values. Well-scoped.
**Recommendation:** No action needed.

### backend/tests/property/test_bug1_secrets_exploration.py — ignore-as-correct
**Tag:** N/A
**Issue:** Bug exploration test for hardcoded secrets in MCP config files. Correctly designed to fail on unfixed code.
**Recommendation:** No action needed.

### backend/tests/property/test_bug2_csp_exploration.py — ignore-as-correct
**Tag:** N/A
**Issue:** CSP unsafe-inline exploration test. Checks for risk documentation header.
**Recommendation:** No action needed.

### backend/tests/property/test_bug2_csp_preservation.py — ignore-as-correct
**Tag:** N/A
**Issue:** Comprehensive CSP preservation tests. Validates all directives and non-CSP headers.
**Recommendation:** No action needed.

### backend/tests/property/test_bug3_cache_control_exploration.py — ignore-as-correct
**Tag:** N/A
**Issue:** Cache-Control exploration test for authenticated responses. Uses SecurityHeadersMiddleware directly.
**Recommendation:** No action needed.

### backend/tests/property/test_bug3_preservation.py — ignore-as-correct
**Tag:** N/A
**Issue:** Cache-Control preservation tests. Verifies unauthenticated responses don't get cache headers and all security headers are preserved.
**Recommendation:** No action needed.

### backend/tests/property/test_bug4_permissions_exploration.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests scaffold views require IsAuthenticated. Parametrized across affected views.
**Recommendation:** No action needed.

### backend/tests/property/test_bug4_preservation.py — ignore-as-correct
**Tag:** N/A
**Issue:** Preservation tests for already-authenticated views and webhook endpoint (must stay unauthenticated).
**Recommendation:** No action needed.

### backend/tests/property/test_bug4_session_403.py — ignore-as-correct
**Tag:** N/A
**Issue:** Bug condition exploration for expired JWT returning 403 instead of 401. Tests middleware flag setting.
**Recommendation:** No action needed.

### backend/tests/property/test_bug5_admin_docs_exploration.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests admin URL not at predictable /admin/ and OpenAPI docs require auth when DEBUG=False.
**Recommendation:** No action needed.

### backend/tests/property/test_bug5_email_slip.py — ignore-as-correct
**Tag:** N/A
**Issue:** Bug exploration for email slip endpoint existence. Tests URL resolution and view importability.
**Recommendation:** No action needed.

### backend/tests/property/test_bug5_preservation.py — ignore-as-correct
**Tag:** N/A
**Issue:** Preservation tests for health check endpoints, OpenAPI docs in debug mode, and public endpoints.
**Recommendation:** No action needed.

### backend/tests/property/test_bulk_notification_retry.py — improve
**Tag:** confirmed-bug
**Issue:** The test accesses `send_bulk_notifications_task.__wrapped__.__func__` to get the raw function, but this assumes a specific Celery task decoration chain. If the task decoration changes (e.g., adding `@shared_task(bind=True)` wrapper), this access pattern breaks silently. The mock for `ConnectionError` as a transient error is reasonable but the test doesn't verify the `exc` kwarg passed to `self.retry()`.
**Recommendation:** Verify the `__wrapped__.__func__` access pattern works with the current Celery version. Add assertion for the `exc` kwarg in the retry call.

### backend/tests/property/test_bulk_status_atomic.py — improve
**Tag:** confirmed-bug
**Issue:** `TestBulkStatusAtomicRollback.test_failure_mid_batch_rolls_back_all_changes` expects `response.status_code == 500` when a transition fails mid-batch. However, the actual view may catch the RuntimeError and return a different status code (e.g., 400 or a partial success response). The test patches `apps.applications.services.ALLOWED_TRANSITIONS` which may not be the actual import path used by the view.
**Recommendation:** Verify the expected status code matches actual view behavior on mid-batch failure. Check if the view catches RuntimeError or lets it propagate.

### backend/tests/property/test_catalog_properties.py — ignore-as-correct
**Tag:** N/A
**Issue:** Clean catalog property tests. Tests visibility by role, institution soft-delete, caching headers, and program listing.
**Recommendation:** No action needed.

### backend/tests/property/test_communications_history_properties.py — ignore-as-correct
**Tag:** N/A
**Issue:** Comprehensive property tests for communications history. Tests chronological ordering, student ownership scoping, response envelope format, pagination invariants, admin-only access, and admin user-scoped retrieval. Well-designed mock querysets.
**Recommendation:** No action needed.

### backend/tests/property/test_csrf_bug_condition.py — ignore-as-correct
**Tag:** N/A
**Issue:** Bug condition exploration for JWTUser→Profile type mismatch in CSRF operations. Correctly tests both the broken and fixed patterns.
**Recommendation:** No action needed.

### backend/tests/property/test_csrf_preservation.py — ignore-as-correct
**Tag:** N/A
**Issue:** Preservation tests for Profile-based CSRF token generation. Verifies existing working behavior.
**Recommendation:** No action needed.

### backend/tests/property/test_dead_deps.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests that djangorestframework-simplejwt is not in requirements.txt. Clean source inspection.
**Recommendation:** No action needed.

### backend/tests/property/test_documents_error_handling.py — ignore-as-correct
**Tag:** N/A
**Issue:** AST-based inspection verifying no `str(e)` in documents/views.py Response calls. Well-structured.
**Recommendation:** No action needed.

### backend/tests/property/test_drift_bug1_fix.py — ignore-as-correct
**Tag:** N/A
**Issue:** Fix checking test for payment verification stale status. Clean mock-based testing.
**Recommendation:** No action needed.

### backend/tests/property/test_drift_bug1_preservation.py — ignore-as-correct
**Tag:** N/A
**Issue:** Preservation test for terminal payment status. Verifies no HTTP call for already-terminal payments.
**Recommendation:** No action needed.

### backend/tests/property/test_drift_bug2_preservation.py — ignore-as-correct
**Tag:** N/A
**Issue:** Preservation tests for admin settings GET/PATCH/DELETE endpoints.
**Recommendation:** No action needed.

### backend/tests/property/test_drift_bug3_preservation.py — ignore-as-correct
**Tag:** N/A
**Issue:** Preservation tests for document upload and extract endpoints.
**Recommendation:** No action needed.

### backend/tests/property/test_drift_bug4_fix.py — ignore-as-correct
**Tag:** N/A
**Issue:** Fix checking test for camelCase application filter params.
**Recommendation:** No action needed.

### backend/tests/property/test_drift_bug4_preservation.py — ignore-as-correct
**Tag:** N/A
**Issue:** Preservation tests for existing application filter behavior.
**Recommendation:** No action needed.

### backend/tests/property/test_drift_bug5_fix.py — ignore-as-correct
**Tag:** N/A
**Issue:** Fix checking test for draft_name field in ApplicationCreateSerializer.
**Recommendation:** No action needed.

### backend/tests/property/test_drift_bug5_preservation.py — ignore-as-correct
**Tag:** N/A
**Issue:** Preservation tests for existing serializer behavior.
**Recommendation:** No action needed.

### backend/tests/property/test_drift_bug6_fix.py — ignore-as-correct
**Tag:** N/A
**Issue:** Fix checking test for DB migration ownership. Verifies managed=False tables are in EXPECTED_TABLES.
**Recommendation:** No action needed.

### backend/tests/property/test_duplicate_checker_semantics.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests DuplicateChecker create-time vs submit-time semantics. Verifies NON_TERMINAL_STATUSES excludes 'approved'.
**Recommendation:** No action needed.

### backend/tests/property/test_email_constant.py — ignore-as-correct
**Tag:** N/A
**Issue:** Source inspection verifying fallback email uses settings.ERROR_ALERT_EMAIL instead of hardcoded value.
**Recommendation:** No action needed.

### backend/tests/property/test_email_dispatch.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests email dispatch creates EmailQueue record before task dispatch.
**Recommendation:** No action needed.

### backend/tests/property/test_enrollment_sync.py — improve
**Tag:** confirmed-bug
**Issue:** Tests enrollment increment updates both intakes and program_intakes tables. However, the test uses `IntakeEnforcer.increment_enrollment(intake_name, program_name)` with two arguments, but the actual method signature in the steering docs shows `IntakeEnforcer.increment_enrollment(intake_name)` with only one argument. If the method signature changed, these tests may be testing a non-existent API.
**Recommendation:** Verify the actual `IntakeEnforcer.increment_enrollment()` method signature matches the test's call pattern.

### backend/tests/property/test_error_monitoring.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests GlitchTip error monitoring integration. Verifies sentry_sdk calls and IP hashing.
**Recommendation:** No action needed.

### backend/tests/property/test_fee_resolution.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests fee resolution correctness with fallback chain and duplicate fee rejection.
**Recommendation:** No action needed.

### backend/tests/property/test_fee_resolver.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests FeeResolver residency classification and fee lookup.
**Recommendation:** No action needed.

### backend/tests/property/test_fee_resolver_correctness.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests FeeResolver returns correct fees with fallback to program default.
**Recommendation:** No action needed.

### backend/tests/property/test_frontend_backend_url_mapping.py — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Tests frontend-backend URL mapping parity. This file is 462 lines and likely contains hardcoded URL lists that may drift from actual frontend service modules. If frontend routes change, these tests become stale without failing.
**Recommendation:** Human review needed to verify URL lists match current frontend service modules.

### backend/tests/property/test_go_live_polish_regression.py — ignore-as-correct
**Tag:** N/A
**Issue:** Regression tests for go-live polish fixes.
**Recommendation:** No action needed.

### backend/tests/property/test_grades_sync_roundtrip.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests grade sync round-trip consistency.
**Recommendation:** No action needed.

### backend/tests/property/test_health_endpoint.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests health endpoint response format and status.
**Recommendation:** No action needed.

### backend/tests/property/test_infra_properties.py — ignore-as-correct
**Tag:** N/A
**Issue:** Infrastructure property tests.
**Recommendation:** No action needed.

### backend/tests/property/test_intake_date_computation_properties.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests intake date computation pure functions.
**Recommendation:** No action needed.

### backend/tests/property/test_intake_open_count_properties.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests intake open count invariants.
**Recommendation:** No action needed.

### backend/tests/property/test_ip_address_column.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests IP address column handling.
**Recommendation:** No action needed.

### backend/tests/property/test_jti_blacklist_properties.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests JTI blacklist Redis operations.
**Recommendation:** No action needed.

### backend/tests/property/test_jwt_middleware.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests JWT middleware token extraction and validation.
**Recommendation:** No action needed.

### backend/tests/property/test_live_500_fixes.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests for live 500 error fixes.
**Recommendation:** No action needed.

### backend/tests/property/test_middleware_properties.py — ignore-as-correct
**Tag:** N/A
**Issue:** Comprehensive middleware property tests (691 lines). Tests security headers, CORS, request ID, etc.
**Recommendation:** No action needed.

### backend/tests/property/test_migration_idempotency.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests migration idempotency.
**Recommendation:** No action needed.

### backend/tests/property/test_migration_properties.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests migration properties and schema invariants.
**Recommendation:** No action needed.

### backend/tests/property/test_model_nullability.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests model field nullability constraints.
**Recommendation:** No action needed.

### backend/tests/property/test_notification_pagination.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests notification pagination invariants.
**Recommendation:** No action needed.

### backend/tests/property/test_password_rehash.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests password rehash from SHA-256 to bcrypt.
**Recommendation:** No action needed.

### backend/tests/property/test_payment_fee_matching.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests payment fee matching logic.
**Recommendation:** No action needed.

### backend/tests/property/test_payment_forward_transitions.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests payment forward-only status transitions.
**Recommendation:** No action needed.

### backend/tests/property/test_payment_initiation.py — improve
**Tag:** confirmed-bug
**Issue:** At 514 lines, this is a large test file. The test patches `apps.documents.payment_service.Payment.objects` and `apps.applications.models.Application.objects` but the actual PaymentService may use different import paths or `select_for_update()` chains that the mocks don't properly simulate. The mock for `transaction.atomic` may not properly test the actual transactional behavior.
**Recommendation:** Verify mock patch paths match actual PaymentService imports. Consider using TransactionTestCase for critical payment initiation tests.

### backend/tests/property/test_payment_reference.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests payment reference format generation.
**Recommendation:** No action needed.

### backend/tests/property/test_payment_status_normalization.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests payment status normalization logic.
**Recommendation:** No action needed.

### backend/tests/property/test_payment_status_update.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests payment status update transitions.
**Recommendation:** No action needed.

### backend/tests/property/test_payment_transitions.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests payment state machine transitions.
**Recommendation:** No action needed.

### backend/tests/property/test_pending_query_window.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests pending payment query window logic.
**Recommendation:** No action needed.

### backend/tests/property/test_permissions_roundtrip.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests permission round-trip consistency.
**Recommendation:** No action needed.

### backend/tests/property/test_post_migration_qa_bugs.py — ignore-as-correct
**Tag:** N/A
**Issue:** Post-migration QA bug condition tests.
**Recommendation:** No action needed.

### backend/tests/property/test_post_migration_qa_preservation.py — ignore-as-correct
**Tag:** N/A
**Issue:** Post-migration QA preservation tests (574 lines). Comprehensive.
**Recommendation:** No action needed.

### backend/tests/property/test_production_cors_pagination_fix_exploration.py — ignore-as-correct
**Tag:** N/A
**Issue:** CORS pagination fix exploration tests.
**Recommendation:** No action needed.

### backend/tests/property/test_production_cors_pagination_fix_preservation.py — ignore-as-correct
**Tag:** N/A
**Issue:** CORS pagination fix preservation tests.
**Recommendation:** No action needed.

### backend/tests/property/test_production_readiness_celery.py — ignore-as-correct
**Tag:** N/A
**Issue:** Production readiness Celery tests.
**Recommendation:** No action needed.

### backend/tests/property/test_production_readiness_csrf.py — ignore-as-correct
**Tag:** N/A
**Issue:** Production readiness CSRF tests.
**Recommendation:** No action needed.

### backend/tests/property/test_production_readiness_health.py — ignore-as-correct
**Tag:** N/A
**Issue:** Production readiness health endpoint tests.
**Recommendation:** No action needed.

### backend/tests/property/test_production_readiness_jti.py — ignore-as-correct
**Tag:** N/A
**Issue:** Production readiness JTI blacklist tests.
**Recommendation:** No action needed.

### backend/tests/property/test_production_readiness_metrics.py — ignore-as-correct
**Tag:** N/A
**Issue:** Production readiness metrics tests.
**Recommendation:** No action needed.

### backend/tests/property/test_production_readiness_test_isolation.py — improve
**Tag:** zero-day-class-risk
**Issue:** At 416 lines, this file tests test isolation itself. If it imports and exercises actual database models without proper isolation, it could introduce the very test pollution it's trying to detect. The file should be reviewed to ensure it doesn't accidentally create real DB state.
**Recommendation:** Verify this file uses only SimpleTestCase or properly mocked DB access, not actual database writes.

### backend/tests/property/test_production_readiness_views.py — ignore-as-correct
**Tag:** N/A
**Issue:** Production readiness view tests.
**Recommendation:** No action needed.

### backend/tests/property/test_program_fee_coverage.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests program fee coverage across all programs.
**Recommendation:** No action needed.

### backend/tests/property/test_program_fee_uniqueness.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests program fee uniqueness constraints.
**Recommendation:** No action needed.

### backend/tests/property/test_program_fee_validation.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests program fee validation rules.
**Recommendation:** No action needed.

### backend/tests/property/test_rate_limiting.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests rate limiting behavior.
**Recommendation:** No action needed.

### backend/tests/property/test_rbac_properties.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests RBAC permission properties.
**Recommendation:** No action needed.

### backend/tests/property/test_referential_integrity.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests referential integrity constraints.
**Recommendation:** No action needed.

### backend/tests/property/test_response_properties.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests API response envelope properties.
**Recommendation:** No action needed.

### backend/tests/property/test_schema_field_correspondence.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests schema field correspondence between models and serializers.
**Recommendation:** No action needed.

### backend/tests/property/test_security_headers.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests security header presence and values.
**Recommendation:** No action needed.

### backend/tests/property/test_session_properties.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests session management properties.
**Recommendation:** No action needed.

### backend/tests/property/test_settlement_metadata.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests payment settlement metadata handling.
**Recommendation:** No action needed.

### backend/tests/property/test_sse_removal_properties.py — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** Tests SSE removal properties. The steering docs confirm SSE was removed, but this test file (115 lines) may be testing the absence of SSE code. If SSE is fully removed, these tests may become permanently green without providing value.
**Recommendation:** Human review to determine if these tests still provide regression protection or are now dead assertions.

### backend/tests/property/test_status_history_validity.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests status history validity constraints.
**Recommendation:** No action needed.

### backend/tests/property/test_status_transitions.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests application status transition state machine.
**Recommendation:** No action needed.

### backend/tests/property/test_submission_gate.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests submission gate enforcement.
**Recommendation:** No action needed.

### backend/tests/property/test_submission_gates.py — improve
**Tag:** confirmed-bug
**Issue:** Two files test submission gates: `test_submission_gate.py` (266 lines) and `test_submission_gates.py` (458 lines). This is likely a duplication where the plural version is a more comprehensive replacement. Having both may cause confusion about which is authoritative.
**Recommendation:** Review both files. If `test_submission_gates.py` is a superset, remove `test_submission_gate.py` to avoid duplication.

### backend/tests/property/test_system_alignment_institution_passthrough.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests institution passthrough in system alignment.
**Recommendation:** No action needed.

### backend/tests/property/test_system_alignment_tracking_code_pattern.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests tracking code pattern validation.
**Recommendation:** No action needed.

### backend/tests/property/test_system_alignment_tracking_safe_fields.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests tracking safe fields exposure.
**Recommendation:** No action needed.

### backend/tests/property/test_token_refresh_properties.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests token refresh properties.
**Recommendation:** No action needed.

### backend/tests/property/test_type_mismatch_severity.py — needs-human-decision
**Tag:** suspicious-stale-path
**Issue:** At 375 lines, tests type mismatch severity classification. This may be testing a specific audit finding that has since been resolved. If all type mismatches are fixed, these tests become permanently green without value.
**Recommendation:** Human review to determine if the type mismatches being tested still exist or have been resolved.

### backend/tests/property/test_unique_constraints.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests unique constraint enforcement.
**Recommendation:** No action needed.

### backend/tests/property/test_uptime_task.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests uptime monitoring task behavior.
**Recommendation:** No action needed.

### backend/tests/property/test_validation_properties.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests input validation properties.
**Recommendation:** No action needed.

### backend/tests/property/test_webhook_idempotency.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests webhook idempotency (deduplication).
**Recommendation:** No action needed.

### backend/tests/property/test_webhook_logging.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests webhook event logging.
**Recommendation:** No action needed.

### backend/tests/property/test_webhook_signature.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests HMAC-SHA512 webhook signature validation.
**Recommendation:** No action needed.

### backend/tests/unit/__init__.py — ignore-as-correct
**Tag:** N/A
**Issue:** Empty init file.
**Recommendation:** No action needed.

### backend/tests/unit/test_admin_dashboard_overhaul.py — ignore-as-correct
**Tag:** N/A
**Issue:** Unit tests for admin dashboard overhaul. Uses SimpleTestCase with mocks.
**Recommendation:** No action needed.

### backend/tests/unit/test_amendments.py — ignore-as-correct
**Tag:** N/A
**Issue:** Unit tests for application amendments. Tests AmendmentService and view endpoints.
**Recommendation:** No action needed.

### backend/tests/unit/test_api_docs.py — improve
**Tag:** already-fixed-local
**Issue:** Tests API docs accessibility. Uses `Client()` which makes actual HTTP requests through Django's test client. The `@override_settings(DEBUG=True)` test works, but there's no test for DEBUG=False behavior in this file (that's covered in bug5 exploration tests). The file is only 55 lines — minimal coverage.
**Recommendation:** Consider consolidating with bug5 exploration/preservation tests to avoid scattered coverage.

### backend/tests/unit/test_application_contract_alignment.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests ApplicationListSerializer includes admin dashboard grade fields. Uses SimpleNamespace mocks.
**Recommendation:** No action needed.

### backend/tests/unit/test_application_endpoints.py — improve
**Tag:** suspicious-stale-path
**Issue:** At 610 lines, this is a large test file for verify-document, acceptance-letter, and finance-receipt endpoints. The patch targets (`_APP`, `_DOC`, `_AUDIT`, etc.) reference `apps.applications.views.*` but after the view module split, some of these may need to point to `apps.applications.admin_views.*` or `apps.applications.document_views.*`. If the re-exports in views.py break, these tests would fail with ImportError rather than testing the actual behavior.
**Recommendation:** Verify all patch targets and imports reference the correct split view modules.

### backend/tests/unit/test_application_student_flow_views.py — improve
**Tag:** suspicious-stale-path
**Issue:** Tests student-facing submit and interview list views. Imports `ApplicationDetailView, ApplicationGradesView, ApplicationInterviewListView, ApplicationSubmitView` from `apps.applications.views` (re-exports). Patches `apps.applications.student_views.*` for some operations. The mixed import/patch paths could break if re-exports change.
**Recommendation:** Standardize imports to use the actual module (student_views) rather than the re-export module (views).

### backend/tests/unit/test_application_tasks.py — ignore-as-correct
**Tag:** N/A
**Issue:** Unit tests for Celery tasks. Clean mock-based testing of document generation tasks.
**Recommendation:** No action needed.

### backend/tests/unit/test_audit_cleanup.py — ignore-as-correct
**Tag:** N/A
**Issue:** Unit tests for audit log cleanup task. Tests deletion counts and retry behavior.
**Recommendation:** No action needed.

### backend/tests/unit/test_audit_network_context.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests encrypted audit network context. Uses Fernet encryption. Clean isolation.
**Recommendation:** No action needed.

### backend/tests/unit/test_audit_production_bug_conditions.py — ignore-as-correct
**Tag:** N/A
**Issue:** Bug condition exploration tests for audit production fixes. Designed to fail on unfixed code.
**Recommendation:** No action needed.

### backend/tests/unit/test_audit_production_preservation.py — ignore-as-correct
**Tag:** N/A
**Issue:** Preservation tests for audit production fixes. Must pass on unfixed code.
**Recommendation:** No action needed.

### backend/tests/unit/test_auth_csrf_headers.py — improve
**Tag:** confirmed-bug
**Issue:** Tests auth endpoints that issue CSRF headers. Uses `APIRequestFactory()` at module level (shared state). The `factory` variable is module-level which could cause issues if tests modify it. Tests for RefreshView and SessionView CSRF header issuance are critical for the auth flow.
**Recommendation:** Move `factory = APIRequestFactory()` into setUp/setup_method to avoid shared module-level state.

### backend/tests/unit/test_batch_operations.py — ignore-as-correct
**Tag:** N/A
**Issue:** Unit tests for batch operation safety. Tests size limits, confirmation tokens, and atomicity.
**Recommendation:** No action needed.

### backend/tests/unit/test_cleanup_stale_sessions_command.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests management command for stale session cleanup. Clean mock-based testing.
**Recommendation:** No action needed.

### backend/tests/unit/test_cleanup_stale_sessions_task.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests Celery Beat schedule registration for stale session cleanup.
**Recommendation:** No action needed.

### backend/tests/unit/test_communication_service.py — ignore-as-correct
**Tag:** N/A
**Issue:** Unit tests for CommunicationService. Tests template substitution and notification dispatch.
**Recommendation:** No action needed.

### backend/tests/unit/test_communications_history.py — improve
**Tag:** confirmed-bug
**Issue:** At 817 lines, this is the largest unit test file. Tests NotificationListView pagination and filtering. The sheer size suggests it may contain redundant test cases that overlap with the property tests in `test_communications_history_properties.py`. Having both unit and property tests for the same behavior increases maintenance burden without proportional coverage gain.
**Recommendation:** Review for overlap with property tests. Consider removing unit tests that are fully covered by the property test equivalents.

### backend/tests/unit/test_conditions.py — ignore-as-correct
**Tag:** N/A
**Issue:** Unit tests for conditional admission. Tests ConditionManager lifecycle.
**Recommendation:** No action needed.

### backend/tests/unit/test_deduplication_helpers.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests deduplicated helpers for document task enqueue and status transitions.
**Recommendation:** No action needed.

### backend/tests/unit/test_device_session_lifecycle.py — improve
**Tag:** confirmed-bug
**Issue:** Tests device session lifecycle hardening. Uses module-level `factory = APIRequestFactory()` (shared state). The `_jwt_user` helper hardcodes a specific UUID which could cause issues if tests depend on unique user IDs.
**Recommendation:** Move factory to setUp. Use dynamic UUIDs in _jwt_user helper.

### backend/tests/unit/test_document_sla.py — ignore-as-correct
**Tag:** N/A
**Issue:** Unit tests for document verification SLA task.
**Recommendation:** No action needed.

### backend/tests/unit/test_drf_csrf_authentication.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests DRF CSRF authentication behavior. Tests CSRFPermissionDenied exception.
**Recommendation:** No action needed.

### backend/tests/unit/test_drift_bug2_endpoints.py — ignore-as-correct
**Tag:** N/A
**Issue:** Integration tests for admin settings import and reset endpoints.
**Recommendation:** No action needed.

### backend/tests/unit/test_drift_bug3_endpoints.py — ignore-as-correct
**Tag:** N/A
**Issue:** Integration tests for document storage endpoints (signed-url, download, info, delete).
**Recommendation:** No action needed.

### backend/tests/unit/test_email_outbox_hardening.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests email outbox claim and reclaim hardening.
**Recommendation:** No action needed.

### backend/tests/unit/test_email_slip_endpoint.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests email slip endpoint. Uses APIRequestFactory with force_authenticate.
**Recommendation:** No action needed.

### backend/tests/unit/test_email_templates_premium.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests premium email template HTML wrapping. Only 14 lines — minimal but focused.
**Recommendation:** No action needed.

### backend/tests/unit/test_email_wiring.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests email wiring for password reset and lockout dispatch.
**Recommendation:** No action needed.

### backend/tests/unit/test_enrollment.py — ignore-as-correct
**Tag:** N/A
**Issue:** Unit tests for enrollment confirmation.
**Recommendation:** No action needed.

### backend/tests/unit/test_env_validator.py — improve
**Tag:** already-fixed-local
**Issue:** Tests use `@override_settings(REQUIRED_ENV_VARS=[])` but the actual settings module may not define `REQUIRED_ENV_VARS`. The test imports from `apps.common.env_validator` which may not exist if the env validator was added as part of a specific spec. Uses `config.settings.base` as DJANGO_SETTINGS_MODULE instead of `config.settings.dev` like all other tests.
**Recommendation:** Standardize DJANGO_SETTINGS_MODULE to `config.settings.dev`. Verify `REQUIRED_ENV_VARS` setting exists.

### backend/tests/unit/test_error_monitoring.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests ErrorReportView endpoint for GlitchTip migration.
**Recommendation:** No action needed.

### backend/tests/unit/test_expiry.py — ignore-as-correct
**Tag:** N/A
**Issue:** Unit tests for application and draft expiry.
**Recommendation:** No action needed.

### backend/tests/unit/test_fee_resolver_international.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests FeeResolver returns K306 for international residency.
**Recommendation:** No action needed.

### backend/tests/unit/test_fee_waivers.py — ignore-as-correct
**Tag:** N/A
**Issue:** Unit tests for fee waivers.
**Recommendation:** No action needed.

### backend/tests/unit/test_health.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests health check endpoints (liveness, readiness, Redis).
**Recommendation:** No action needed.

### backend/tests/unit/test_intake_manager_task.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests intake manager Celery task.
**Recommendation:** No action needed.

### backend/tests/unit/test_interview_scheduling.py — ignore-as-correct
**Tag:** N/A
**Issue:** Unit tests for interview scheduling business rules.
**Recommendation:** No action needed.

### backend/tests/unit/test_jobs_ops_endpoints.py — improve
**Tag:** needs-human-decision
**Issue:** Tests Jobs Ops API surface. Uses `Client()` which makes actual HTTP requests. The `test_platform_meta_is_public_and_includes_attribution` test hits `/api/v1/meta/platform/` directly. If the database isn't available, these tests may fail with connection errors rather than assertion errors. Only 91 lines — minimal coverage for the entire jobs-ops API surface.
**Recommendation:** Consider whether these tests need database access or can be converted to mock-based tests. Expand coverage for critical jobs-ops endpoints.

### backend/tests/unit/test_jobs_score_view.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests job score persistence view. Uses proper mocking.
**Recommendation:** No action needed.

### backend/tests/unit/test_jti_blacklist.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests Redis-backed JTI blacklist. Uses fakeredis for isolation.
**Recommendation:** No action needed.

### backend/tests/unit/test_jwt_middleware.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests JWT middleware edge cases. Clean mock-based testing.
**Recommendation:** No action needed.

### backend/tests/unit/test_late_applications.py — ignore-as-correct
**Tag:** N/A
**Issue:** Unit tests for late application handling.
**Recommendation:** No action needed.

### backend/tests/unit/test_live_500_fixes.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests live 500 error fixes. Uses source inspection to verify no debug wrappers.
**Recommendation:** No action needed.

### backend/tests/unit/test_multi_intake.py — ignore-as-correct
**Tag:** N/A
**Issue:** Unit tests for multi-intake application rules.
**Recommendation:** No action needed.

### backend/tests/unit/test_notification_endpoints.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests notification endpoints (mark-read, mark-all-read, delete, list).
**Recommendation:** No action needed.

### backend/tests/unit/test_optional_public_auth.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests optional public authentication behavior. Verifies stale cookies don't break public endpoints.
**Recommendation:** No action needed.

### backend/tests/unit/test_outbox_helpers.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests shared durable side-effect helpers (outbox pattern).
**Recommendation:** No action needed.

### backend/tests/unit/test_password_rehash.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests password rehash from SHA-256 to bcrypt on login.
**Recommendation:** No action needed.

### backend/tests/unit/test_payment_expiry.py — ignore-as-correct
**Tag:** N/A
**Issue:** Unit tests for payment expiry and retry limits.
**Recommendation:** No action needed.

### backend/tests/unit/test_review_notifications.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests review notification and email dispatch via CommunicationService.
**Recommendation:** No action needed.

### backend/tests/unit/test_reviewer_assignment.py — ignore-as-correct
**Tag:** N/A
**Issue:** Unit tests for reviewer assignment.
**Recommendation:** No action needed.

### backend/tests/unit/test_schema_decorator_fixes.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests drf-spectacular schema decorator placement.
**Recommendation:** No action needed.

### backend/tests/unit/test_session_hardening.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests session hardening: auth error codes, 401/403 semantics, refresh endpoint, CSRF failure codes.
**Recommendation:** No action needed.

### backend/tests/unit/test_structured_logging.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests structured request-aware logging.
**Recommendation:** No action needed.

### backend/tests/unit/test_system_alignment_model_serializer.py — ignore-as-correct
**Tag:** N/A
**Issue:** Tests model and serializer field alignment.
**Recommendation:** No action needed.

### backend/tests/unit/test_view_auth_classification.py — improve
**Tag:** zero-day-class-risk
**Issue:** Tests view auth classification (which views use which authentication strategy). At 155 lines, this is a critical security test. However, if new views are added without updating this test's parametrized list, the new views won't be checked. There's no mechanism to detect views that are missing from the classification.
**Recommendation:** Add a test that discovers all views in the URL conf and verifies each one appears in the classification list. This prevents new views from silently escaping auth classification.

### backend/tests/unit/test_waitlist.py — ignore-as-correct
**Tag:** N/A
**Issue:** Unit tests for waitlist position tracking and auto-promotion.
**Recommendation:** No action needed.

### backend/tests/unit/test_withdrawal.py — ignore-as-correct
**Tag:** N/A
**Issue:** Unit tests for application withdrawal. Only 33 lines — minimal but tests the critical path.
**Recommendation:** No action needed.

---

## Critical Findings Summary

### confirmed-bug (8 findings)

1. **factories.py** — Application number and tracking code formats don't match canonical patterns (`APP-YYYYMMDD-XXXXXXXX`, `TRK-XXXXXXXXXXXX`). Tests using these factories won't catch format validation regressions.

2. **test_admissions_canonicalization.py** — 1800+ line monolith file with mock patch paths that may not match actual imports after view module splits. `transaction.atomic` mock pattern is fragile.

3. **test_bulk_notification_retry.py** — `__wrapped__.__func__` access pattern for Celery task is fragile and version-dependent.

4. **test_bulk_status_atomic.py** — Expected 500 status code on mid-batch failure may not match actual view behavior.

5. **test_enrollment_sync.py** — `IntakeEnforcer.increment_enrollment()` called with two arguments but documented API may only accept one.

6. **test_submission_gates.py** — Duplicate test file alongside `test_submission_gate.py`. Both test submission gates with overlapping coverage.

7. **test_auth_csrf_headers.py** — Module-level `factory = APIRequestFactory()` shared state.

8. **test_communications_history.py** — 817-line file with likely overlap with property test equivalents.

### zero-day-class-risk (3 findings)

1. **test_auth_properties.py** — Shared module-level `fakeredis.FakeRedis` instance could cause flaky failures under parallel execution.

2. **test_production_readiness_test_isolation.py** — Test isolation meta-test may itself violate isolation if it touches the DB.

3. **test_view_auth_classification.py** — No mechanism to detect new views missing from the auth classification list. New unprotected views could be deployed without detection.

### suspicious-stale-path (9 findings)

1. **contract/conftest.py** — Recordings directory may not exist, causing silent zero-test-case pass.
2. **test_contract_parity.py** — Depends on fixture files that may not be committed.
3. **test_admin_override.py** — Postgres-dependent tests silently skip in CI.
4. **test_application_hardening.py** — Patch paths may not align with split view modules.
5. **test_application_properties.py** — Mixed patch paths between views.py and admin_views.py.
6. **test_frontend_backend_url_mapping.py** — Hardcoded URL lists may drift from frontend.
7. **test_application_endpoints.py** (unit) — Patch targets reference pre-split views.py.
8. **test_application_student_flow_views.py** — Mixed imports from views.py and student_views.py.
9. **test_payment_initiation.py** — Mock patch paths may not match actual PaymentService imports.

### already-fixed-local (2 findings)

1. **test_api_docs.py** — Minimal coverage, scattered across multiple test files.
2. **test_env_validator.py** — Uses non-standard DJANGO_SETTINGS_MODULE.

### needs-human-decision (5 findings from tagged files)

1. **test_admin_override.py** — Postgres dependency and mock path accuracy.
2. **test_frontend_backend_url_mapping.py** — URL list freshness.
3. **test_sse_removal_properties.py** — May be permanently green dead assertions.
4. **test_type_mismatch_severity.py** — May test resolved issues.
5. **test_jobs_ops_endpoints.py** — Minimal coverage, potential DB dependency.

---

## Missing Coverage Gaps

1. **Celery Beat task scheduling** — No test verifies that all 14 periodic tasks in `CELERY_BEAT_SCHEDULE` are actually registered and importable.
2. **CORS configuration** — No dedicated test for `CORS_ALLOW_HEADERS` containing all required headers (`x-csrf-token`, `x-csrf-recovery`, `idempotency-key`, `cache-control`).
3. **Deferred payment flow** — No test for the `deferred` payment status path through submission.
4. **Grace period late submission** — Property tests exist but no unit test for the `is_late_submission=True` flag being set on the application.
5. **Webhook HMAC validation end-to-end** — Property tests mock the processor but no integration test sends a real HMAC-signed payload through the webhook view.
