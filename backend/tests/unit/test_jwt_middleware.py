"""Unit tests for JWTAuthenticationMiddleware edge cases.

Tests:
- No-token request passes through as anonymous (Requirement 1.5)
- Cookie takes precedence over Bearer header when both present (Requirement 1.9)
- Middleware does not make database queries (Requirement 1.10)
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import datetime
from unittest.mock import MagicMock, patch

import django

django.setup()

import jwt
from django.test import SimpleTestCase, override_settings

from apps.common.middleware_compat import JWTAuthenticationMiddleware

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TEST_SIGNING_KEY = "test-jwt-signing-key-for-unit-tests"
TEST_ALGORITHM = "HS256"

TEST_JWT_SETTINGS = {
    "SIGNING_KEY": TEST_SIGNING_KEY,
    "ALGORITHM": TEST_ALGORITHM,
    "ACCESS_TOKEN_LIFETIME": datetime.timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": datetime.timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}


def _encode_jwt(payload: dict, key: str = TEST_SIGNING_KEY) -> str:
    return jwt.encode(payload, key, algorithm=TEST_ALGORITHM)


def _make_request(cookie_token=None, bearer_token=None):
    """Build a minimal mock Django request."""
    request = MagicMock()
    request.method = "GET"
    request.path = "/api/v1/test/"
    request.COOKIES = {}
    request.META = {
        "REMOTE_ADDR": "127.0.0.1",
        "HTTP_USER_AGENT": "TestAgent/1.0",
    }

    if cookie_token is not None:
        request.COOKIES["access_token"] = cookie_token

    if bearer_token is not None:
        request.META["HTTP_AUTHORIZATION"] = f"Bearer {bearer_token}"

    # Default: anonymous user
    anon = MagicMock()
    anon.is_authenticated = False
    anon.pk = None
    request.user = anon

    return request


def _build_middleware():
    """Create a fresh middleware instance with a no-op get_response."""
    response = MagicMock(status_code=200)
    middleware = JWTAuthenticationMiddleware(lambda req: response)
    # Reset lazy-loaded config so override_settings takes effect
    middleware._signing_key = None
    middleware._algorithm = None
    return middleware


# =========================================================================
# Test: No-token request passes through as anonymous
# Requirement 1.5
# =========================================================================


class TestNoTokenPassesThroughAnonymous(SimpleTestCase):
    """A request with no JWT in cookie or header should pass through
    without setting request.user to an authenticated user."""

    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    def test_no_cookie_no_header_stays_anonymous(self):
        middleware = _build_middleware()
        request = _make_request()  # no tokens at all

        middleware(request)

        self.assertFalse(request.user.is_authenticated)
        self.assertIsNone(request.user.pk)

    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    def test_empty_authorization_header_stays_anonymous(self):
        """An empty Authorization header should not authenticate."""
        middleware = _build_middleware()
        request = _make_request()
        request.META["HTTP_AUTHORIZATION"] = ""

        middleware(request)

        self.assertFalse(request.user.is_authenticated)

    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    def test_non_bearer_authorization_header_stays_anonymous(self):
        """An Authorization header that doesn't start with 'Bearer ' is ignored."""
        middleware = _build_middleware()
        request = _make_request()
        request.META["HTTP_AUTHORIZATION"] = "Basic dXNlcjpwYXNz"

        middleware(request)

        self.assertFalse(request.user.is_authenticated)


# =========================================================================
# Test: Cookie takes precedence over Bearer header
# Requirement 1.9 (extraction order: cookie first, header fallback)
# =========================================================================


class TestCookiePrecedenceOverBearer(SimpleTestCase):
    """When both an access_token cookie and an Authorization: Bearer header
    are present, the middleware should use the cookie token."""

    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    def test_cookie_token_used_when_both_present(self):
        middleware = _build_middleware()

        cookie_payload = {
            "user_id": "cookie-user-id",
            "email": "cookie@example.com",
            "role": "student",
            "token_type": "access",
        }
        bearer_payload = {
            "user_id": "bearer-user-id",
            "email": "bearer@example.com",
            "role": "admin",
            "token_type": "access",
        }

        cookie_token = _encode_jwt(cookie_payload)
        bearer_token = _encode_jwt(bearer_payload)

        request = _make_request(cookie_token=cookie_token, bearer_token=bearer_token)

        middleware(request)

        # The user should come from the cookie, not the bearer header
        self.assertTrue(request.user.is_authenticated)
        self.assertEqual(request.user.id, "cookie-user-id")
        self.assertEqual(request.user.email, "cookie@example.com")
        self.assertEqual(request.user.role, "student")

    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    def test_bearer_used_when_no_cookie(self):
        """When only a Bearer header is present (no cookie), the header token is used."""
        middleware = _build_middleware()

        bearer_payload = {
            "user_id": "bearer-user-id",
            "email": "bearer@example.com",
            "role": "admin",
            "token_type": "access",
        }
        bearer_token = _encode_jwt(bearer_payload)

        request = _make_request(bearer_token=bearer_token)

        middleware(request)

        self.assertTrue(request.user.is_authenticated)
        self.assertEqual(request.user.id, "bearer-user-id")
        self.assertEqual(request.user.email, "bearer@example.com")


# =========================================================================
# Test: Middleware does not make database queries
# Requirement 1.10
# =========================================================================


class TestMiddlewareNoDatabaseQueries(SimpleTestCase):
    """The JWT middleware must be purely stateless — no database queries
    during token validation."""

    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    def test_valid_token_makes_no_db_calls(self):
        middleware = _build_middleware()

        payload = {
            "user_id": "some-user-id",
            "email": "user@example.com",
            "role": "student",
            "token_type": "access",
        }
        token = _encode_jwt(payload)
        request = _make_request(cookie_token=token)

        with patch("django.db.backends.base.base.BaseDatabaseWrapper.ensure_connection") as mock_conn:
            middleware(request)

            # Verify the user was authenticated (middleware worked)
            self.assertTrue(request.user.is_authenticated)
            # Verify no database connection was initiated
            mock_conn.assert_not_called()

    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    def test_invalid_token_makes_no_db_calls(self):
        middleware = _build_middleware()

        request = _make_request(cookie_token="invalid.jwt.token")

        with patch("django.db.backends.base.base.BaseDatabaseWrapper.ensure_connection") as mock_conn:
            middleware(request)

            # User should remain anonymous
            self.assertFalse(request.user.is_authenticated)
            # Still no database calls
            mock_conn.assert_not_called()

    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    def test_no_token_makes_no_db_calls(self):
        middleware = _build_middleware()

        request = _make_request()

        with patch("django.db.backends.base.base.BaseDatabaseWrapper.ensure_connection") as mock_conn:
            middleware(request)

            self.assertFalse(request.user.is_authenticated)
            mock_conn.assert_not_called()
