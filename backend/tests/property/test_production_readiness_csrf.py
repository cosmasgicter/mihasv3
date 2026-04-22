"""Property-based tests for CSRF middleware Redis resilience.

# Feature: production-readiness-hardening, Property 10: CSRF Validation Works During Redis Downtime
# Feature: production-readiness-hardening, Property 11: CSRF Logs Warning During Redis Downtime

**Validates: Requirements 6.1, 6.3**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import hashlib  # noqa: E402
import logging  # noqa: E402
import time  # noqa: E402
from datetime import timedelta  # noqa: E402
from unittest.mock import MagicMock, patch, PropertyMock  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from django.utils import timezone as tz  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

import apps.common.middleware as mw_module  # noqa: E402
from apps.common.middleware_compat import CSRFEnforcementMiddleware  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Generate random CSRF tokens (non-empty ASCII strings)
CSRF_TOKENS = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N")),
    min_size=8,
    max_size=64,
)

# State-changing HTTP methods
STATE_CHANGING_METHODS = st.sampled_from(["POST", "PUT", "PATCH", "DELETE"])

# Request paths that are NOT exempt
NON_EXEMPT_PATHS = st.sampled_from([
    "/api/v1/applications/123/submit/",
    "/api/v1/applications/",
    "/api/v1/sessions/",
    "/api/v1/applications/456/withdraw/",
])

# Request IDs
REQUEST_IDS = st.text(min_size=8, max_size=36, alphabet=st.characters(whitelist_categories=("L", "N")))


def _build_request(method, path, csrf_token=None, user=None, request_id=None):
    """Build a minimal fake request object."""
    request = MagicMock()
    request.method = method
    request.path = path
    request.request_id = request_id
    request.META = {}
    if csrf_token:
        request.META["HTTP_X_CSRF_TOKEN"] = csrf_token
    if user is not None:
        request.user = user
    else:
        request.user = None
    return request


def _build_authenticated_user(user_id=1):
    """Build a fake authenticated user."""
    user = MagicMock()
    user.is_authenticated = True
    user.pk = user_id
    return user



# =========================================================================
# Property 10: CSRF Validation Works During Redis Downtime
# =========================================================================


class TestCSRFValidationDuringRedisDowntime(SimpleTestCase):
    """Property 10: CSRF Validation Works During Redis Downtime.

    For any state-changing request with a valid CSRF token in the csrf_tokens
    Postgres table, the CSRFEnforcementMiddleware SHALL successfully validate
    the token regardless of Redis availability.

    # Feature: production-readiness-hardening, Property 10: CSRF Validation Works During Redis Downtime
    **Validates: Requirements 6.1**
    """

    @given(
        method=STATE_CHANGING_METHODS,
        path=NON_EXEMPT_PATHS,
        csrf_token=CSRF_TOKENS,
        redis_available=st.booleans(),
    )
    @settings(max_examples=20, deadline=None)
    def test_csrf_validates_via_postgres_regardless_of_redis(
        self, method, path, csrf_token, redis_available,
    ):
        """CSRF validation succeeds via Postgres whether Redis is up or down."""
        user = _build_authenticated_user(user_id=42)
        request = _build_request(method, path, csrf_token=csrf_token, user=user)

        # Track whether get_response was called (meaning validation passed).
        response_sentinel = MagicMock(status_code=200)
        get_response = MagicMock(return_value=response_sentinel)

        middleware = CSRFEnforcementMiddleware(get_response)

        token_hash = hashlib.sha256(csrf_token.encode()).hexdigest()

        # Mock the CSRFToken queryset to simulate a valid token in Postgres.
        mock_qs = MagicMock()
        mock_qs.filter.return_value.exists.return_value = True

        # Mock Redis: either works or raises an exception.
        if redis_available:
            cache_mock = MagicMock()
            cache_mock.set.return_value = True
            cache_mock.get.return_value = "1"
        else:
            cache_mock = MagicMock()
            cache_mock.set.side_effect = Exception("Redis connection refused")
            cache_mock.get.side_effect = Exception("Redis connection refused")

        # Reset rate-limit timer so the warning path is exercised.
        original_time = mw_module._last_redis_warning_time
        mw_module._last_redis_warning_time = 0.0

        try:
            with patch("apps.accounts.models.CSRFToken.objects", mock_qs), \
                 patch("apps.common.middleware.cache", cache_mock, create=True), \
                 patch.dict("sys.modules", {}), \
                 patch("django.core.cache.cache", cache_mock):
                response = middleware(request)
        finally:
            mw_module._last_redis_warning_time = original_time

        # The middleware must have called get_response (CSRF passed).
        get_response.assert_called_once_with(request)
        self.assertEqual(response.status_code, 200)

    @given(
        method=STATE_CHANGING_METHODS,
        path=NON_EXEMPT_PATHS,
        csrf_token=CSRF_TOKENS,
    )
    @settings(max_examples=20, deadline=None)
    def test_invalid_csrf_rejected_even_when_redis_down(
        self, method, path, csrf_token,
    ):
        """Invalid CSRF tokens are still rejected when Redis is unavailable."""
        user = _build_authenticated_user(user_id=42)
        request = _build_request(method, path, csrf_token=csrf_token, user=user)

        get_response = MagicMock(return_value=MagicMock(status_code=200))
        middleware = CSRFEnforcementMiddleware(get_response)

        # Mock the CSRFToken queryset to simulate an INVALID token.
        mock_qs = MagicMock()
        mock_qs.filter.return_value.exists.return_value = False

        # Redis is down.
        cache_mock = MagicMock()
        cache_mock.set.side_effect = Exception("Redis connection refused")
        cache_mock.get.side_effect = Exception("Redis connection refused")

        original_time = mw_module._last_redis_warning_time
        mw_module._last_redis_warning_time = 0.0

        try:
            with patch("apps.accounts.models.CSRFToken.objects", mock_qs), \
                 patch("django.core.cache.cache", cache_mock):
                response = middleware(request)
        finally:
            mw_module._last_redis_warning_time = original_time

        # The middleware must NOT have called get_response (CSRF rejected).
        get_response.assert_not_called()
        self.assertEqual(response.status_code, 403)


# =========================================================================
# Property 11: CSRF Logs Warning During Redis Downtime
# =========================================================================


class TestCSRFLogsWarningDuringRedisDowntime(SimpleTestCase):
    """Property 11: CSRF Logs Warning During Redis Downtime.

    For any state-changing request processed while Redis is unavailable, the
    CSRFEnforcementMiddleware SHALL emit a warning-level structured log
    indicating Postgres-only CSRF validation.

    # Feature: production-readiness-hardening, Property 11: CSRF Logs Warning During Redis Downtime
    **Validates: Requirements 6.3**
    """

    @given(
        method=STATE_CHANGING_METHODS,
        path=NON_EXEMPT_PATHS,
        request_id=REQUEST_IDS,
    )
    @settings(max_examples=20, deadline=None)
    def test_warning_logged_when_redis_unavailable(
        self, method, path, request_id,
    ):
        """A warning with type 'csrf_redis_warning' is logged when Redis is down."""
        user = _build_authenticated_user(user_id=42)
        request = _build_request(
            method, path, csrf_token="valid-token", user=user, request_id=request_id,
        )

        get_response = MagicMock(return_value=MagicMock(status_code=200))
        middleware = CSRFEnforcementMiddleware(get_response)

        # Mock valid CSRF token in Postgres.
        mock_qs = MagicMock()
        mock_qs.filter.return_value.exists.return_value = True

        # Redis is down.
        cache_mock = MagicMock()
        cache_mock.set.side_effect = Exception("Redis connection refused")
        cache_mock.get.side_effect = Exception("Redis connection refused")

        # Reset rate-limit timer so warning fires.
        original_time = mw_module._last_redis_warning_time
        mw_module._last_redis_warning_time = 0.0

        try:
            with patch("apps.accounts.models.CSRFToken.objects", mock_qs), \
                 patch("django.core.cache.cache", cache_mock), \
                 patch.object(mw_module.logger, "warning") as mock_warn:
                response = middleware(request)
        finally:
            mw_module._last_redis_warning_time = original_time

        # Warning must have been emitted.
        mock_warn.assert_called_once()
        call_args = mock_warn.call_args

        # First positional arg is the message.
        self.assertEqual(call_args[0][0], "redis_degraded")

        # Extra dict must contain the required fields.
        extra = call_args[1]["extra"]
        self.assertEqual(extra["type"], "csrf_redis_warning")
        self.assertIn("detail", extra)
        self.assertEqual(extra["request_id"], request_id)

    @given(
        method=STATE_CHANGING_METHODS,
        path=NON_EXEMPT_PATHS,
    )
    @settings(max_examples=20, deadline=None)
    def test_no_warning_when_redis_available(self, method, path):
        """No warning is logged when Redis is healthy."""
        user = _build_authenticated_user(user_id=42)
        request = _build_request(method, path, csrf_token="valid-token", user=user)

        get_response = MagicMock(return_value=MagicMock(status_code=200))
        middleware = CSRFEnforcementMiddleware(get_response)

        # Mock valid CSRF token in Postgres.
        mock_qs = MagicMock()
        mock_qs.filter.return_value.exists.return_value = True

        # Redis is healthy.
        cache_mock = MagicMock()
        cache_mock.set.return_value = True
        cache_mock.get.return_value = "1"

        original_time = mw_module._last_redis_warning_time
        mw_module._last_redis_warning_time = 0.0

        try:
            with patch("apps.accounts.models.CSRFToken.objects", mock_qs), \
                 patch("django.core.cache.cache", cache_mock), \
                 patch.object(mw_module.logger, "warning") as mock_warn:
                response = middleware(request)
        finally:
            mw_module._last_redis_warning_time = original_time

        # No warning should have been emitted.
        mock_warn.assert_not_called()

    @given(
        method=STATE_CHANGING_METHODS,
        path=NON_EXEMPT_PATHS,
    )
    @settings(max_examples=20, deadline=None)
    def test_warning_rate_limited_to_60_seconds(self, method, path):
        """Warning is rate-limited: not emitted if last warning was < 60s ago."""
        user = _build_authenticated_user(user_id=42)
        request = _build_request(method, path, csrf_token="valid-token", user=user)

        get_response = MagicMock(return_value=MagicMock(status_code=200))
        middleware = CSRFEnforcementMiddleware(get_response)

        # Mock valid CSRF token in Postgres.
        mock_qs = MagicMock()
        mock_qs.filter.return_value.exists.return_value = True

        # Redis is down.
        cache_mock = MagicMock()
        cache_mock.set.side_effect = Exception("Redis connection refused")
        cache_mock.get.side_effect = Exception("Redis connection refused")

        # Set last warning time to "just now" so rate-limit suppresses.
        original_time = mw_module._last_redis_warning_time
        mw_module._last_redis_warning_time = time.monotonic()

        try:
            with patch("apps.accounts.models.CSRFToken.objects", mock_qs), \
                 patch("django.core.cache.cache", cache_mock), \
                 patch.object(mw_module.logger, "warning") as mock_warn:
                response = middleware(request)
        finally:
            mw_module._last_redis_warning_time = original_time

        # Warning should NOT have been emitted (rate-limited).
        mock_warn.assert_not_called()
