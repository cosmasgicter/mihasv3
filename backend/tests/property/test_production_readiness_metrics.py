"""Property-based tests for MetricsMiddleware structured logging.

# Feature: production-readiness-hardening, Property 2: MetricsMiddleware Emits Complete Structured Logs
# Feature: production-readiness-hardening, Property 3: MetricsMiddleware Skips Health Paths
# Feature: production-readiness-hardening, Property 4: MetricsMiddleware Duration Is Positive

**Validates: Requirements 2.1, 2.2, 2.3, 2.5**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import logging  # noqa: E402
from unittest.mock import MagicMock  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.common.middleware import MetricsMiddleware  # noqa: E402
from apps.common.logging import bind_request_context, clear_request_context  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

HTTP_METHODS = st.sampled_from(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])

_path_segment = st.from_regex(r"[a-z0-9\-]{1,20}", fullmatch=True)
NON_HEALTH_PATHS = st.builds(
    lambda segs: "/" + "/".join(segs) + "/",
    st.lists(_path_segment, min_size=1, max_size=5),
).filter(lambda p: p not in MetricsMiddleware.SKIP_PATHS)

HEALTH_PATHS = st.sampled_from(sorted(MetricsMiddleware.SKIP_PATHS))

STATUS_CODES = st.sampled_from([200, 201, 204, 301, 400, 401, 403, 404, 500])

# Required fields on the log record for a request_metric emission
REQUIRED_METRIC_FIELDS = {"type", "method", "path", "status_code", "duration_ms", "request_id"}


def _make_request(method: str, path: str) -> MagicMock:
    """Build a minimal fake request object."""
    req = MagicMock()
    req.method = method
    req.path = path
    req.request_id = "test-req-id"
    return req


def _make_response(status_code: int) -> MagicMock:
    """Build a minimal fake response object."""
    resp = MagicMock()
    resp.status_code = status_code
    return resp


class _LogCapture(logging.Handler):
    """Captures log records emitted during a test."""

    def __init__(self):
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record):
        self.records.append(record)


def _get_metric_records(handler: _LogCapture) -> list[logging.LogRecord]:
    """Filter captured records to only request_metric entries."""
    return [r for r in handler.records if getattr(r, "type", None) == "request_metric"]


def _run_middleware(method, path, status_code):
    """Run MetricsMiddleware and return (response, metric_records)."""
    response = _make_response(status_code)
    middleware = MetricsMiddleware(lambda req: response)
    request = _make_request(method, path)

    # Simulate RequestIDMiddleware binding the request context
    bind_request_context(request_id="test-req-id", method=method, path=path)

    handler = _LogCapture()
    mw_logger = logging.getLogger("apps.common.middleware")
    mw_logger.addHandler(handler)
    mw_logger.setLevel(logging.DEBUG)
    try:
        result = middleware(request)
    finally:
        mw_logger.removeHandler(handler)
        clear_request_context()

    return result, _get_metric_records(handler)


# =========================================================================
# Property 2: MetricsMiddleware Emits Complete Structured Logs
# =========================================================================


class TestMetricsMiddlewareStructuredLogs(SimpleTestCase):
    """Property 2: MetricsMiddleware Emits Complete Structured Logs.

    For any HTTP request to a non-health-check path, the MetricsMiddleware
    SHALL emit a structured log line containing all of: type (equal to
    "request_metric"), method, path, status_code, duration_ms, and request_id.

    # Feature: production-readiness-hardening, Property 2: MetricsMiddleware Emits Complete Structured Logs
    **Validates: Requirements 2.1, 2.5**
    """

    @given(
        method=HTTP_METHODS,
        path=NON_HEALTH_PATHS,
        status_code=STATUS_CODES,
    )
    @settings(max_examples=20, deadline=None)
    def test_emits_complete_structured_log(self, method, path, status_code):
        """Every non-health request produces a log with all required fields."""
        _, metric_records = _run_middleware(method, path, status_code)

        self.assertEqual(len(metric_records), 1, f"Expected 1 metric log, got {len(metric_records)}")

        rec = metric_records[0]
        for field in REQUIRED_METRIC_FIELDS:
            self.assertTrue(
                hasattr(rec, field),
                f"Missing field '{field}' on metric log record",
            )

        self.assertEqual(getattr(rec, "type"), "request_metric")
        self.assertEqual(getattr(rec, "method"), method)
        self.assertEqual(getattr(rec, "path"), path)
        self.assertEqual(getattr(rec, "status_code"), status_code)
        self.assertEqual(getattr(rec, "request_id"), "test-req-id")


# =========================================================================
# Property 3: MetricsMiddleware Skips Health Paths
# =========================================================================


class TestMetricsMiddlewareSkipsHealthPaths(SimpleTestCase):
    """Property 3: MetricsMiddleware Skips Health Paths.

    For any HTTP request whose path is one of /health/live/, /health/ready/,
    or /health/redis/, the MetricsMiddleware SHALL NOT emit a metric log line.

    # Feature: production-readiness-hardening, Property 3: MetricsMiddleware Skips Health Paths
    **Validates: Requirements 2.3**
    """

    @given(
        method=HTTP_METHODS,
        path=HEALTH_PATHS,
    )
    @settings(max_examples=20, deadline=None)
    def test_no_metric_log_for_health_paths(self, method, path):
        """Health-check paths produce zero metric log lines."""
        result, metric_records = _run_middleware(method, path, 200)

        self.assertEqual(
            len(metric_records), 0,
            f"Expected 0 metric logs for health path {path}, got {len(metric_records)}",
        )
        # Response should still be returned
        self.assertIsNotNone(result)


# =========================================================================
# Property 4: MetricsMiddleware Duration Is Positive
# =========================================================================


class TestMetricsMiddlewareDurationPositive(SimpleTestCase):
    """Property 4: MetricsMiddleware Duration Is Positive.

    For any HTTP request that completes through the MetricsMiddleware,
    the duration_ms field in the emitted log SHALL be a non-negative
    number (>= 0).

    # Feature: production-readiness-hardening, Property 4: MetricsMiddleware Duration Is Positive
    **Validates: Requirements 2.2**
    """

    @given(
        method=HTTP_METHODS,
        path=NON_HEALTH_PATHS,
        status_code=STATUS_CODES,
    )
    @settings(max_examples=20, deadline=None)
    def test_duration_is_non_negative(self, method, path, status_code):
        """duration_ms is always >= 0 for any completed request."""
        _, metric_records = _run_middleware(method, path, status_code)

        self.assertEqual(len(metric_records), 1)

        duration_ms = getattr(metric_records[0], "duration_ms")
        self.assertIsInstance(duration_ms, (int, float))
        self.assertGreaterEqual(duration_ms, 0, f"duration_ms should be >= 0, got {duration_ms}")


# =========================================================================
# Property 5: Payment Completion Business Metric
# =========================================================================
# Feature: production-readiness-hardening, Property 5: Payment Completion Business Metric


def _get_business_metric_records(handler: _LogCapture, metric_name: str) -> list[logging.LogRecord]:
    """Filter captured records to only business_metric entries with a given metric name."""
    return [
        r
        for r in handler.records
        if getattr(r, "type", None) == "business_metric"
        and getattr(r, "metric", None) == metric_name
    ]


# Strategies for payment property tests
PAYMENT_AMOUNTS = st.decimals(min_value=1, max_value=99999, places=2, allow_nan=False, allow_infinity=False)
CURRENCIES = st.sampled_from(["ZMW", "USD", "EUR", "GBP"])


class TestPaymentCompletionBusinessMetric(SimpleTestCase):
    """Property 5: Payment Completion Business Metric.

    For any payment that transitions to successful status, the system SHALL
    emit a structured log with type equal to "business_metric", metric equal
    to "payment_completed", and a non-empty amount field.

    # Feature: production-readiness-hardening, Property 5: Payment Completion Business Metric
    **Validates: Requirements 3.1**
    """

    @given(
        amount=PAYMENT_AMOUNTS,
        currency=CURRENCIES,
    )
    @settings(max_examples=20, deadline=None)
    def test_payment_completion_emits_business_metric(self, amount, currency):
        """Successful payment transition emits a business_metric log."""
        from unittest.mock import patch, MagicMock
        from decimal import Decimal

        # Build a fake locked payment object
        locked_payment = MagicMock()
        locked_payment.id = "pay-test-id"
        locked_payment.status = "pending"
        locked_payment.amount = Decimal(str(amount))
        locked_payment.currency = currency
        locked_payment.lenco_reference = None
        locked_payment.payment_method = None
        locked_payment.fee = None
        locked_payment.bearer = None
        locked_payment.metadata = {}
        locked_payment.application_id = "app-test-id"
        locked_payment.updated_at = None

        # Capture logs from the payment_service logger
        handler = _LogCapture()
        ps_logger = logging.getLogger("apps.documents.payment_service")
        ps_logger.addHandler(handler)
        ps_logger.setLevel(logging.DEBUG)

        try:
            # Mock the DB layer and run _update_payment_status
            with patch("apps.documents.payment_service.Payment.objects") as mock_qs, \
                 patch("apps.applications.models.Application.objects") as mock_app_qs, \
                 patch("django.db.transaction.atomic") as mock_atomic:
                # Make atomic() work as a simple context manager
                mock_atomic.return_value.__enter__ = MagicMock(return_value=None)
                mock_atomic.return_value.__exit__ = MagicMock(return_value=False)

                # select_for_update().get() returns our fake locked payment
                mock_qs.select_for_update.return_value.get.return_value = locked_payment

                # Application update returns 1 (success)
                mock_app_qs.filter.return_value.update.return_value = 1

                from apps.documents.payment_service import PaymentService
                service = PaymentService()
                service._update_payment_status(
                    locked_payment,
                    "successful",
                    {"amount": str(amount)},
                )
        finally:
            ps_logger.removeHandler(handler)

        # Verify business metric was emitted
        metric_records = _get_business_metric_records(handler, "payment_completed")
        self.assertEqual(
            len(metric_records), 1,
            f"Expected 1 payment_completed metric, got {len(metric_records)}",
        )

        rec = metric_records[0]
        self.assertEqual(getattr(rec, "type"), "business_metric")
        self.assertEqual(getattr(rec, "metric"), "payment_completed")
        self.assertTrue(
            len(getattr(rec, "amount", "")) > 0,
            "amount field should be non-empty",
        )
        self.assertEqual(getattr(rec, "currency"), currency)


# =========================================================================
# Property 6: Application Submission Business Metric
# =========================================================================
# Feature: production-readiness-hardening, Property 6: Application Submission Business Metric

PROGRAM_NAMES = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "Zs"), whitelist_characters="-_"),
    min_size=1,
    max_size=50,
)


class TestApplicationSubmissionBusinessMetric(SimpleTestCase):
    """Property 6: Application Submission Business Metric.

    For any application that transitions from draft to submitted, the system
    SHALL emit a structured log with type equal to "business_metric" and
    metric equal to "application_submitted".

    # Feature: production-readiness-hardening, Property 6: Application Submission Business Metric
    **Validates: Requirements 3.2**
    """

    @given(
        program=PROGRAM_NAMES,
    )
    @settings(max_examples=20, deadline=None)
    def test_application_submission_emits_business_metric(self, program):
        """Draft → submitted transition emits a business_metric log."""
        from unittest.mock import patch, MagicMock, PropertyMock
        import uuid

        app_id = uuid.uuid4()

        # Build a fake application object
        fake_app = MagicMock()
        fake_app.id = app_id
        fake_app.status = "draft"
        fake_app.program = program
        fake_app.intake = "2025-January"
        fake_app.user_id = "user-123"
        fake_app.payment_status = "verified"
        fake_app.submitted_at = None
        fake_app.updated_at = None
        fake_app.is_late_submission = False

        # Capture logs from the services logger
        handler = _LogCapture()
        svc_logger = logging.getLogger("apps.applications.services")
        svc_logger.addHandler(handler)
        svc_logger.setLevel(logging.DEBUG)

        try:
            with patch("apps.applications.services._application_has_completed_payment", return_value=True), \
                 patch("apps.applications.services._application_has_identity_document", return_value=True), \
                 patch("apps.applications.intake_enforcer.IntakeEnforcer") as mock_enforcer, \
                 patch("apps.applications.services.Application.objects") as mock_qs, \
                 patch("apps.applications.services.transaction.atomic") as mock_atomic, \
                 patch("apps.applications.services.transition_application_status", return_value="draft") as mock_transition, \
                 patch("apps.common.communication_service.CommunicationService") as mock_comms, \
                 patch("apps.applications.eligibility_engine.EligibilityEngine") as mock_elig, \
                 patch("apps.applications.models.ApplicationDraft") as mock_draft, \
                 patch("apps.applications.duplicate_checker.DuplicateChecker") as mock_dup:

                # Intake enforcer allows submission
                intake_result = MagicMock()
                intake_result.allowed = True
                intake_result.is_late = False
                mock_enforcer.check_submission.return_value = intake_result

                # Atomic context manager
                mock_atomic.return_value.__enter__ = MagicMock(return_value=None)
                mock_atomic.return_value.__exit__ = MagicMock(return_value=False)

                # select_for_update().get() returns our fake app
                mock_qs.select_for_update.return_value.get.return_value = fake_app

                # Duplicate checker says no duplicates
                dup_result = MagicMock()
                dup_result.has_duplicate = False
                mock_dup.check_at_submit.return_value = dup_result

                # Eligibility engine
                elig_result = MagicMock()
                elig_result.status = "eligible"
                elig_result.score = 100
                elig_result.missing_requirements = []
                mock_elig.return_value.evaluate.return_value = elig_result

                # Application filter for eligibility update
                mock_qs.filter.return_value.update.return_value = 1

                # Draft deactivation
                mock_draft.objects.filter.return_value.update.return_value = 1

                from apps.applications.services import submit_application
                submit_application(
                    application=fake_app,
                    changed_by="user-123",
                    notes="test",
                    ip_address="127.0.0.1",
                    user_agent="test-agent",
                )
        finally:
            svc_logger.removeHandler(handler)

        # Verify business metric was emitted
        metric_records = _get_business_metric_records(handler, "application_submitted")
        self.assertEqual(
            len(metric_records), 1,
            f"Expected 1 application_submitted metric, got {len(metric_records)}",
        )

        rec = metric_records[0]
        self.assertEqual(getattr(rec, "type"), "business_metric")
        self.assertEqual(getattr(rec, "metric"), "application_submitted")
        self.assertEqual(getattr(rec, "application_id"), str(app_id))
        self.assertEqual(getattr(rec, "program"), program)
