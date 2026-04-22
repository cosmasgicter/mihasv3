"""Property-based tests for the enhanced ReadinessView probe.

# Feature: production-readiness-hardening, Property 7: Readiness Probe Redis Status and Latency
# Feature: production-readiness-hardening, Property 8: Readiness Probe 503 Only On DB Failure

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import time  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.common.health import ReadinessView  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Redis can either succeed or fail
REDIS_OK = st.just(True)
REDIS_FAIL = st.just(False)
REDIS_STATUS = st.booleans()  # True = ok, False = fail

# DB can either succeed or fail
DB_STATUS = st.booleans()  # True = ok, False = fail

# Simulated Redis latency in seconds (0ms to 2000ms)
REDIS_LATENCY_SECONDS = st.floats(min_value=0.0, max_value=2.0, allow_nan=False, allow_infinity=False)


def _build_view_and_request():
    """Create a ReadinessView instance and a minimal fake request."""
    view = ReadinessView()
    request = MagicMock()
    request.method = "GET"
    request.path = "/health/ready/"
    return view, request


# =========================================================================
# Property 7: Readiness Probe Redis Status and Latency
# =========================================================================


class TestReadinessProbeRedisStatusAndLatency(SimpleTestCase):
    """Property 7: Readiness Probe Redis Status and Latency.

    For any readiness probe request, the response body SHALL contain a `redis`
    field (either "ok" or "degraded") and a `redis_latency_ms` field that is a
    non-negative number. When Redis responds successfully, `redis` SHALL be
    "ok". When Redis fails or times out, `redis` SHALL be "degraded" and the
    HTTP status SHALL be 200.

    # Feature: production-readiness-hardening, Property 7: Readiness Probe Redis Status and Latency
    **Validates: Requirements 4.1, 4.2, 4.3**
    """

    @given(redis_ok=REDIS_STATUS, latency=REDIS_LATENCY_SECONDS)
    @settings(max_examples=20, deadline=None)
    def test_redis_status_and_latency_in_response(self, redis_ok, latency):
        """Response always contains redis status and non-negative latency_ms."""
        view, request = _build_view_and_request()

        def fake_check_redis_with_latency(self_inner):
            status = "ok" if redis_ok else "degraded"
            latency_ms = round(latency * 1000, 1)
            return status, latency_ms

        with patch.object(ReadinessView, "_check_db", return_value=True), \
             patch.object(ReadinessView, "_check_redis_with_latency", fake_check_redis_with_latency):
            response = view.get(request)

        data = response.data

        # Response must contain redis field
        self.assertIn("redis", data)
        self.assertIn(data["redis"], ("ok", "degraded"))

        # Response must contain redis_latency_ms field
        self.assertIn("redis_latency_ms", data)
        self.assertIsInstance(data["redis_latency_ms"], (int, float))
        self.assertGreaterEqual(data["redis_latency_ms"], 0)

        # When Redis is ok, status should be "ok"
        if redis_ok:
            self.assertEqual(data["redis"], "ok")

        # When Redis fails, status should be "degraded" and HTTP 200
        if not redis_ok:
            self.assertEqual(data["redis"], "degraded")
            self.assertEqual(response.status_code, 200)

    @given(latency=REDIS_LATENCY_SECONDS)
    @settings(max_examples=20, deadline=None)
    def test_redis_failure_returns_degraded_with_200(self, latency):
        """Redis failure always returns 'degraded' with HTTP 200 (not 503)."""
        view, request = _build_view_and_request()

        def fake_check_redis_fail(self_inner):
            latency_ms = round(latency * 1000, 1)
            return "degraded", latency_ms

        with patch.object(ReadinessView, "_check_db", return_value=True), \
             patch.object(ReadinessView, "_check_redis_with_latency", fake_check_redis_fail):
            response = view.get(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["redis"], "degraded")
        self.assertEqual(response.data["status"], "ok")


# =========================================================================
# Property 8: Readiness Probe 503 Only On DB Failure
# =========================================================================


class TestReadinessProbe503OnlyOnDBFailure(SimpleTestCase):
    """Property 8: Readiness Probe 503 Only On DB Failure.

    For any combination of database status (ok/fail) and Redis status
    (ok/fail), the readiness probe SHALL return HTTP 503 if and only if the
    database check fails. Redis failure alone SHALL NOT cause 503.

    # Feature: production-readiness-hardening, Property 8: Readiness Probe 503 Only On DB Failure
    **Validates: Requirements 4.4**
    """

    @given(db_ok=DB_STATUS, redis_ok=REDIS_STATUS, latency=REDIS_LATENCY_SECONDS)
    @settings(max_examples=20, deadline=None)
    def test_503_iff_db_fails(self, db_ok, redis_ok, latency):
        """HTTP 503 occurs if and only if the database check fails."""
        view, request = _build_view_and_request()

        def fake_check_redis(self_inner):
            status = "ok" if redis_ok else "degraded"
            latency_ms = round(latency * 1000, 1)
            return status, latency_ms

        with patch.object(ReadinessView, "_check_db", return_value=db_ok), \
             patch.object(ReadinessView, "_check_redis_with_latency", fake_check_redis):
            response = view.get(request)

        if db_ok:
            # DB healthy → always HTTP 200, regardless of Redis
            self.assertEqual(
                response.status_code, 200,
                f"Expected 200 when DB is ok (redis_ok={redis_ok}), got {response.status_code}",
            )
        else:
            # DB unhealthy → always HTTP 503, regardless of Redis
            self.assertEqual(
                response.status_code, 503,
                f"Expected 503 when DB fails (redis_ok={redis_ok}), got {response.status_code}",
            )
