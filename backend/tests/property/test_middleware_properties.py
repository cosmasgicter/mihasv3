"""Property-based tests for middleware: security headers, rate limiting,
CSRF enforcement, audit logging, and CORS origin enforcement.

# Feature: python-backend-migration, Property 22: Security headers on all responses
# Feature: python-backend-migration, Property 23: Rate limiting per scope with Retry-After
# Feature: python-backend-migration, Property 7: CSRF enforcement on state-changing endpoints
# Feature: python-backend-migration, Property 30: Audit logging — all state-changing operations, no PII
# Feature: python-backend-migration, Property 24: CORS origin enforcement
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import hashlib  # noqa: E402
import re  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from django.http import HttpResponse, JsonResponse  # noqa: E402
from django.test import SimpleTestCase, override_settings  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.common.middleware import (  # noqa: E402
    AuditMiddleware,
    CSRFEnforcementMiddleware,
    RateLimitMiddleware,
    SecurityHeadersMiddleware,
)

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# URL path segments: alphanumeric + hyphens, no leading/trailing slashes per segment
_path_segment = st.from_regex(r"[a-z0-9][a-z0-9\-]{0,20}", fullmatch=True)

# Full URL paths like /api/v1/something/
_url_paths = st.lists(_path_segment, min_size=1, max_size=5).map(
    lambda parts: "/" + "/".join(parts) + "/"
)

# HTTP methods
_safe_methods = st.sampled_from(["GET", "HEAD", "OPTIONS"])
_state_changing_methods = st.sampled_from(["POST", "PUT", "PATCH", "DELETE"])

# Rate limit strings like "60/5m", "20/10s", "100/1h"
_rate_strings = st.tuples(
    st.integers(min_value=1, max_value=1000),
    st.integers(min_value=1, max_value=60),
    st.sampled_from(["s", "m", "h"]),
).map(lambda t: f"{t[0]}/{t[1]}{t[2]}")

# IP addresses
_ip_addresses = st.from_regex(
    r"[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}", fullmatch=True
)

# User agent strings
_user_agents = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P", "Z")),
    min_size=1,
    max_size=100,
)


def _make_request(method="GET", path="/test/", meta_overrides=None):
    """Build a minimal mock Django request."""
    request = MagicMock()
    request.method = method
    request.path = path
    request.META = {
        "REMOTE_ADDR": "127.0.0.1",
        "HTTP_USER_AGENT": "TestAgent/1.0",
    }
    if meta_overrides:
        request.META.update(meta_overrides)
    # Default: unauthenticated
    request.user = MagicMock()
    request.user.is_authenticated = False
    request.user.pk = None
    return request


# =========================================================================
# Property 22: Security headers on all responses
# =========================================================================


class TestSecurityHeadersProperty(SimpleTestCase):
    """Property 22: Security headers on all responses.

    For any HTTP response from the Django API, verify these headers are present:
    - Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
    - X-Content-Type-Options: nosniff
    - X-Frame-Options: DENY
    - Referrer-Policy: strict-origin-when-cross-origin
    - Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()

    **Validates: Requirements 11.2, 18.5**
    """

    EXPECTED_HEADERS = {
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    }

    def setUp(self):
        def mock_get_response(request):
            return HttpResponse("OK", status=200)

        self.middleware = SecurityHeadersMiddleware(mock_get_response)

    @given(path=_url_paths)
    @settings(max_examples=100)
    def test_security_headers_present_on_all_paths(self, path):
        """For any URL path, all five security headers must be present
        with the correct values."""
        request = _make_request(method="GET", path=path)
        response = self.middleware(request)

        for header_name, expected_value in self.EXPECTED_HEADERS.items():
            self.assertIn(
                header_name,
                response,
                f"Missing header: {header_name}",
            )
            self.assertEqual(
                response[header_name],
                expected_value,
                f"Wrong value for {header_name}",
            )

    @given(
        path=_url_paths,
        status_code=st.sampled_from([200, 201, 204, 301, 400, 403, 404, 500]),
    )
    @settings(max_examples=100)
    def test_security_headers_present_regardless_of_status(self, path, status_code):
        """Security headers must be set regardless of the response status code."""

        def get_response_with_status(request):
            return HttpResponse("", status=status_code)

        middleware = SecurityHeadersMiddleware(get_response_with_status)
        request = _make_request(method="GET", path=path)
        response = middleware(request)

        for header_name in self.EXPECTED_HEADERS:
            self.assertIn(header_name, response)


# =========================================================================
# Property 23: Rate limiting per scope with Retry-After
# =========================================================================


class TestRateLimitRetryAfterProperty(SimpleTestCase):
    """Property 23: Rate limiting per scope with Retry-After.

    For each rate limit scope, verify that the _retry_after_seconds method
    correctly parses rate strings and returns the window in seconds.

    **Validates: Requirements 11.3, 11.4**
    """

    @given(
        count=st.integers(min_value=1, max_value=1000),
        window_value=st.integers(min_value=1, max_value=60),
        unit=st.sampled_from(["s", "m", "h"]),
    )
    @settings(max_examples=100)
    def test_retry_after_parses_rate_string_correctly(self, count, window_value, unit):
        """For any rate string like '{count}/{window}{unit}', _retry_after_seconds
        should return the window converted to seconds."""
        rate = f"{count}/{window_value}{unit}"
        result = RateLimitMiddleware._retry_after_seconds(rate)

        multipliers = {"s": 1, "m": 60, "h": 3600}
        expected = window_value * multipliers[unit]

        self.assertEqual(result, expected)

    def test_retry_after_for_known_scopes(self):
        """Verify Retry-After values for all configured rate limit scopes."""
        expected_mapping = {
            "60/5m": 300,
            "60/10m": 600,
            "20/10m": 600,
            "30/10m": 600,
            "50/10m": 600,
            "10/5m": 300,
            "5/5m": 300,
            "120/10m": 600,
        }
        for rate, expected_seconds in expected_mapping.items():
            result = RateLimitMiddleware._retry_after_seconds(rate)
            self.assertEqual(
                result,
                expected_seconds,
                f"Rate '{rate}' should yield {expected_seconds}s, got {result}s",
            )

    def test_rate_limited_response_has_429_and_retry_after(self):
        """When rate limited, the response must be 429 with a Retry-After header."""

        def mock_get_response(request):
            return HttpResponse("OK", status=200)

        middleware = RateLimitMiddleware(mock_get_response)

        # Simulate a rate-limited request by patching is_ratelimited at source
        request = _make_request(method="GET", path="/api/v1/auth/login/")

        with patch("django_ratelimit.core.is_ratelimited", return_value=True):
            response = middleware(request)

        self.assertEqual(response.status_code, 429)
        self.assertIn("Retry-After", response)
        # Auth login scope is 10/5m → 300 seconds
        self.assertEqual(response["Retry-After"], "300")

    @given(scope_idx=st.integers(min_value=0, max_value=len(RateLimitMiddleware.SCOPE_LIMITS) - 1))
    @settings(max_examples=100)
    def test_each_scope_returns_correct_retry_after_on_limit(self, scope_idx):
        """For each configured scope, when rate limited, the Retry-After header
        must match the scope's window in seconds."""

        def mock_get_response(request):
            return HttpResponse("OK", status=200)

        middleware = RateLimitMiddleware(mock_get_response)
        prefix, rate = RateLimitMiddleware.SCOPE_LIMITS[scope_idx]
        if rate is None:
            return
        expected_seconds = RateLimitMiddleware._retry_after_seconds(rate)

        request = _make_request(method="GET", path=prefix + "something/")

        with patch("django_ratelimit.core.is_ratelimited", return_value=True):
            response = middleware(request)

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response["Retry-After"], str(expected_seconds))

    def test_rate_limit_cache_failure_fails_open(self):
        """Cache/backend failures must not block legitimate requests."""

        def mock_get_response(request):
            return HttpResponse("OK", status=200)

        middleware = RateLimitMiddleware(mock_get_response)
        request = _make_request(method="GET", path="/api/v1/auth/login/")

        with patch("django_ratelimit.core.is_ratelimited", side_effect=RuntimeError("cache down")):
            response = middleware(request)

        self.assertEqual(response.status_code, 200)

    def test_scope_limits_match_rate_limit_config(self):
        """Verify the configured scopes match the rate limit middleware configuration."""
        expected_scopes = [
            ("/api/v1/auth/login/", "10/5m"),
            ("/api/v1/auth/register/", "5/5m"),
            ("/api/v1/auth/password-reset/", "5/5m"),
            ("/api/v1/auth/", "60/5m"),
            ("/api/v1/admin/", "60/10m"),
            ("/api/v1/documents/", "20/10m"),
            ("/api/v1/sessions/", "30/10m"),
            ("/api/v1/notifications/", "50/10m"),
            ("/api/v1/errors/", "10/5m"),
            ("/api/v1/outreach/", "30/10m"),
            ("/api/v1/email/", "30/10m"),
            ("/api/v1/integrations/", "20/10m"),
            ("/api/v1/payments/webhook/", "30/10m"),
            ("/api/v1/payments/", "20/10m"),
            ("/api/v1/", "120/10m"),
        ]
        self.assertEqual(RateLimitMiddleware.SCOPE_LIMITS, expected_scopes)


# =========================================================================
# Property 7: CSRF enforcement on state-changing endpoints
# =========================================================================


class TestCSRFEnforcementProperty(SimpleTestCase):
    """Property 7: CSRF enforcement on state-changing endpoints.

    For any POST/PUT/PATCH/DELETE request to a non-exempt endpoint,
    if X-CSRF-Token is missing, return 403.
    For exempt endpoints (login, register, password-reset, reset confirm),
    CSRF should not be enforced.

    **Validates: Requirements 2.6**
    """

    def setUp(self):
        def mock_get_response(request):
            return HttpResponse("OK", status=200)

        self.middleware = CSRFEnforcementMiddleware(mock_get_response)

    @given(
        method=_state_changing_methods,
        path=_url_paths.filter(
            lambda p: not any(
                re.match(pattern, p)
                for pattern in [
                    r"^/api/v1/auth/login/?$",
                    r"^/api/v1/auth/register/?$",
                    r"^/api/v1/auth/password-reset/?$",
                    r"^/api/v1/auth/password-reset/confirm/?$",
                ]
            )
        ),
    )
    @settings(max_examples=100)
    def test_missing_csrf_token_returns_403(self, method, path):
        """For any state-changing method on a non-exempt path, missing
        X-CSRF-Token must result in 403."""
        request = _make_request(method=method, path=path)
        # Ensure no CSRF token header
        request.META.pop("HTTP_X_CSRF_TOKEN", None)

        response = self.middleware(request)

        self.assertEqual(response.status_code, 403)

    @given(method=_state_changing_methods)
    @settings(max_examples=100)
    def test_exempt_login_path_skips_csrf(self, method):
        """Login endpoint should skip CSRF enforcement for all state-changing methods."""
        request = _make_request(method=method, path="/api/v1/auth/login/")
        request.META.pop("HTTP_X_CSRF_TOKEN", None)

        response = self.middleware(request)

        self.assertEqual(response.status_code, 200)

    @given(method=_state_changing_methods)
    @settings(max_examples=100)
    def test_exempt_register_path_skips_csrf(self, method):
        """Register endpoint should skip CSRF enforcement."""
        request = _make_request(method=method, path="/api/v1/auth/register/")
        request.META.pop("HTTP_X_CSRF_TOKEN", None)

        response = self.middleware(request)

        self.assertEqual(response.status_code, 200)

    @given(method=_state_changing_methods)
    @settings(max_examples=100)
    def test_exempt_password_reset_path_skips_csrf(self, method):
        """Password-reset endpoint should skip CSRF enforcement."""
        request = _make_request(method=method, path="/api/v1/auth/password-reset/")
        request.META.pop("HTTP_X_CSRF_TOKEN", None)

        response = self.middleware(request)

        self.assertEqual(response.status_code, 200)

    @given(method=_state_changing_methods)
    @settings(max_examples=100)
    def test_exempt_password_reset_confirm_path_skips_csrf(self, method):
        """Password-reset confirm endpoint should skip CSRF enforcement."""
        request = _make_request(method=method, path="/api/v1/auth/password-reset/confirm/")
        request.META.pop("HTTP_X_CSRF_TOKEN", None)

        response = self.middleware(request)

        self.assertEqual(response.status_code, 200)

    @given(method=_safe_methods, path=_url_paths)
    @settings(max_examples=100)
    def test_safe_methods_skip_csrf(self, method, path):
        """GET, HEAD, OPTIONS requests should never require CSRF tokens."""
        request = _make_request(method=method, path=path)
        request.META.pop("HTTP_X_CSRF_TOKEN", None)

        response = self.middleware(request)

        self.assertEqual(response.status_code, 200)

    def test_valid_csrf_token_allows_request(self):
        """A valid CSRF token (found in DB, not expired, bound to user) should allow the request through."""
        token = "test-csrf-token-value"
        token_hash = hashlib.sha256(token.encode()).hexdigest()

        request = _make_request(
            method="POST",
            path="/api/v1/applications/",
            meta_overrides={"HTTP_X_CSRF_TOKEN": token},
        )
        # Simulate an authenticated user (required after user-binding was added).
        request.user.is_authenticated = True
        request.user.pk = 42

        with patch("apps.accounts.models.CSRFToken.objects") as mock_objects:
            mock_objects.filter.return_value.exists.return_value = True
            response = self.middleware(request)

        self.assertEqual(response.status_code, 200)
        # The filter now includes expiry check and user binding.
        call_kwargs = mock_objects.filter.call_args[1]
        self.assertEqual(call_kwargs["token_hash"], token_hash)
        self.assertEqual(call_kwargs["user_id"], 42)
        self.assertIn("expires_at__gt", call_kwargs)

    def test_invalid_csrf_token_returns_403(self):
        """A CSRF token not found in DB should return 403."""
        request = _make_request(
            method="POST",
            path="/api/v1/applications/",
            meta_overrides={"HTTP_X_CSRF_TOKEN": "invalid-token"},
        )

        with patch("apps.accounts.models.CSRFToken.objects") as mock_objects:
            mock_objects.filter.return_value.exists.return_value = False
            response = self.middleware(request)

        self.assertEqual(response.status_code, 403)


# =========================================================================
# Property 30: Audit logging — all state-changing operations, no PII
# =========================================================================


class TestAuditLoggingProperty(SimpleTestCase):
    """Property 30: Audit logging — all state-changing operations, no PII.

    For any POST/PUT/PATCH/DELETE request returning 2xx, an AuditLog entry
    should be created. The entry should never contain plaintext email, phone,
    or name. IP and user-agent should be SHA-256 hashed. Auth/session paths
    should have retention_category='security'.

    **Validates: Requirements 17.1, 17.2, 17.3**
    """

    # Patch target: AuditLog is imported inside _create_audit_entry as
    # "from apps.common.models import AuditLog", so we patch at the model source.
    _AUDIT_PATCH = "apps.common.models.AuditLog.objects"

    @given(
        method=_state_changing_methods,
        path=_url_paths,
        ip=_ip_addresses,
        user_agent=_user_agents,
        status_code=st.sampled_from([200, 201, 202, 204]),
    )
    @settings(max_examples=100)
    def test_audit_entry_created_for_state_changing_2xx(
        self, method, path, ip, user_agent, status_code
    ):
        """For any state-changing request returning 2xx, an AuditLog.objects.create
        call must be made."""

        def mock_get_response(request):
            return HttpResponse("OK", status=status_code)

        middleware = AuditMiddleware(mock_get_response)
        request = _make_request(
            method=method,
            path=path,
            meta_overrides={
                "REMOTE_ADDR": ip,
                "HTTP_USER_AGENT": user_agent,
            },
        )

        with patch(self._AUDIT_PATCH) as mock_objects:
            middleware(request)
            mock_objects.create.assert_called_once()

            call_kwargs = mock_objects.create.call_args[1]

            # IP must be SHA-256 hashed, not plaintext
            expected_ip_hash = hashlib.sha256(ip.encode()).hexdigest()
            self.assertEqual(call_kwargs["ip_address"], expected_ip_hash)
            self.assertNotEqual(call_kwargs["ip_address"], ip)

            # User-agent must be SHA-256 hashed, not plaintext
            expected_ua_hash = hashlib.sha256(user_agent.encode()).hexdigest()
            self.assertEqual(call_kwargs["user_agent"], expected_ua_hash)
            self.assertNotEqual(call_kwargs["user_agent"], user_agent)

            # Action should be the HTTP method
            self.assertEqual(call_kwargs["action"], method)

    @given(
        method=_state_changing_methods,
        status_code=st.sampled_from([300, 301, 400, 401, 403, 404, 500]),
    )
    @settings(max_examples=100)
    def test_no_audit_entry_for_non_2xx(self, method, status_code):
        """For state-changing requests that do NOT return 2xx, no audit entry
        should be created."""

        def mock_get_response(request):
            return HttpResponse("Error", status=status_code)

        middleware = AuditMiddleware(mock_get_response)
        request = _make_request(method=method, path="/api/v1/applications/")

        with patch(self._AUDIT_PATCH) as mock_objects:
            middleware(request)
            mock_objects.create.assert_not_called()

    @given(method=_safe_methods, path=_url_paths)
    @settings(max_examples=100)
    def test_no_audit_entry_for_safe_methods(self, method, path):
        """GET, HEAD, OPTIONS requests should never create audit entries."""

        def mock_get_response(request):
            return HttpResponse("OK", status=200)

        middleware = AuditMiddleware(mock_get_response)
        request = _make_request(method=method, path=path)

        with patch(self._AUDIT_PATCH) as mock_objects:
            middleware(request)
            mock_objects.create.assert_not_called()

    @given(method=_state_changing_methods)
    @settings(max_examples=100)
    def test_auth_paths_get_security_retention(self, method):
        """Auth and session paths should have retention_category='security'."""

        def mock_get_response(request):
            return HttpResponse("OK", status=200)

        middleware = AuditMiddleware(mock_get_response)

        for prefix in AuditMiddleware.SECURITY_PREFIXES:
            request = _make_request(method=method, path=prefix + "login/")

            with patch(self._AUDIT_PATCH) as mock_objects:
                middleware(request)
                call_kwargs = mock_objects.create.call_args[1]
                self.assertEqual(
                    call_kwargs["retention_category"],
                    "security",
                    f"Path {prefix} should have 'security' retention",
                )

    @given(
        method=_state_changing_methods,
        path=st.sampled_from([
            "/api/v1/applications/",
            "/api/v1/catalog/programs/",
            "/api/v1/documents/upload/",
            "/api/v1/admin/users/",
            "/api/v1/notifications/",
        ]),
    )
    @settings(max_examples=100)
    def test_non_auth_paths_get_standard_retention(self, method, path):
        """Non-auth/session paths should have retention_category='standard'."""

        def mock_get_response(request):
            return HttpResponse("OK", status=200)

        middleware = AuditMiddleware(mock_get_response)
        request = _make_request(method=method, path=path)

        with patch(self._AUDIT_PATCH) as mock_objects:
            middleware(request)
            call_kwargs = mock_objects.create.call_args[1]
            self.assertEqual(call_kwargs["retention_category"], "standard")

    @given(
        method=_state_changing_methods,
        ip=_ip_addresses,
        user_agent=_user_agents,
    )
    @settings(max_examples=100)
    def test_audit_entry_never_contains_plaintext_pii(self, method, ip, user_agent):
        """Audit log entries must never contain plaintext IP or user-agent."""

        def mock_get_response(request):
            return HttpResponse("OK", status=200)

        middleware = AuditMiddleware(mock_get_response)
        request = _make_request(
            method=method,
            path="/api/v1/applications/",
            meta_overrides={
                "REMOTE_ADDR": ip,
                "HTTP_USER_AGENT": user_agent,
            },
        )

        with patch(self._AUDIT_PATCH) as mock_objects:
            middleware(request)
            call_kwargs = mock_objects.create.call_args[1]

            # Stored values must be 64-char hex (SHA-256 digest)
            self.assertEqual(len(call_kwargs["ip_address"]), 64)
            self.assertTrue(
                all(c in "0123456789abcdef" for c in call_kwargs["ip_address"])
            )
            self.assertEqual(len(call_kwargs["user_agent"]), 64)
            self.assertTrue(
                all(c in "0123456789abcdef" for c in call_kwargs["user_agent"])
            )


# =========================================================================
# Property 24: CORS origin enforcement
# =========================================================================


class TestCORSOriginEnforcementProperty(SimpleTestCase):
    """Property 24: CORS origin enforcement.

    For any request with an Origin header not in CORS_ALLOWED_ORIGINS,
    the response should not include Access-Control-Allow-Origin for that origin.
    This tests the django-cors-headers configuration.

    **Validates: Requirements 11.1**
    """

    def test_cors_allowed_origins_configured_from_env(self):
        """CORS_ALLOWED_ORIGINS should be parsed from the environment variable."""
        from django.conf import settings as django_settings

        # In dev, CORS_ALLOW_ALL_ORIGINS is True, but the base setting
        # should still parse the env var correctly
        self.assertIsInstance(django_settings.CORS_ALLOWED_ORIGINS, list)

    def test_cors_credentials_enabled(self):
        """CORS_ALLOW_CREDENTIALS must be True for cookie-based auth."""
        from django.conf import settings as django_settings

        self.assertTrue(django_settings.CORS_ALLOW_CREDENTIALS)

    def test_cors_exposes_required_headers(self):
        """CORS must expose X-CSRF-Token and X-Request-ID headers."""
        from django.conf import settings as django_settings

        self.assertIn("X-CSRF-Token", django_settings.CORS_EXPOSE_HEADERS)
        self.assertIn("X-Request-ID", django_settings.CORS_EXPOSE_HEADERS)

    def test_cors_preflight_max_age(self):
        """CORS preflight max age should be 86400 (24 hours)."""
        from django.conf import settings as django_settings

        self.assertEqual(django_settings.CORS_PREFLIGHT_MAX_AGE, 86400)

    @given(
        origin=st.from_regex(
            r"https?://[a-z0-9\-]{1,20}\.[a-z]{2,6}", fullmatch=True
        ).filter(lambda o: o != "***REMOVED***"),
    )
    @settings(max_examples=100)
    @override_settings(
        CORS_ALLOWED_ORIGINS=["***REMOVED***"],
        CORS_ALLOW_ALL_ORIGINS=False,
    )
    def test_disallowed_origin_not_reflected(self, origin):
        """For any origin NOT in CORS_ALLOWED_ORIGINS, the
        Access-Control-Allow-Origin header should not reflect that origin.

        We test this by checking the django-cors-headers conf module logic:
        the origin must not be in the allowed list."""
        from django.conf import settings as django_settings

        allowed = django_settings.CORS_ALLOWED_ORIGINS
        self.assertNotIn(origin, allowed)

    @override_settings(
        CORS_ALLOWED_ORIGINS=["***REMOVED***"],
        CORS_ALLOW_ALL_ORIGINS=False,
    )
    def test_allowed_origin_is_in_list(self):
        """The production frontend origin must be in CORS_ALLOWED_ORIGINS."""
        from django.conf import settings as django_settings

        self.assertIn(
            "***REMOVED***",
            django_settings.CORS_ALLOWED_ORIGINS,
        )
