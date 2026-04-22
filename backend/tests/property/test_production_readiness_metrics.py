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
    @settings(max_examples=100, deadline=None)
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
    @settings(max_examples=100, deadline=None)
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
    @settings(max_examples=100, deadline=None)
    def test_duration_is_non_negative(self, method, path, status_code):
        """duration_ms is always >= 0 for any completed request."""
        _, metric_records = _run_middleware(method, path, status_code)

        self.assertEqual(len(metric_records), 1)

        duration_ms = getattr(metric_records[0], "duration_ms")
        self.assertIsInstance(duration_ms, (int, float))
        self.assertGreaterEqual(duration_ms, 0, f"duration_ms should be >= 0, got {duration_ms}")
