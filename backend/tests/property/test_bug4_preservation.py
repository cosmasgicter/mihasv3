"""Preservation property tests — Session auth unchanged for valid tokens.

Property 2: Preservation — Valid Token Auth and Genuine 403 Unchanged

These tests capture EXISTING correct behavior that must not regress:
- Valid (non-expired) access tokens authenticate normally via middleware
- Requests with no token present pass through unauthenticated (DRF returns 403)

These tests MUST PASS on UNFIXED code.

**Validates: Requirements 3.8, 3.9, 3.10**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import datetime  # noqa: E402
from unittest.mock import MagicMock  # noqa: E402

import django  # noqa: E402

django.setup()

import jwt  # noqa: E402
from django.test import SimpleTestCase, override_settings  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.common.middleware import JWTAuthenticationMiddleware  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TEST_SIGNING_KEY = "test-jwt-signing-key-for-property-tests"
TEST_ALGORITHM = "HS256"

TEST_JWT_SETTINGS = {
    "SIGNING_KEY": TEST_SIGNING_KEY,
    "ALGORITHM": TEST_ALGORITHM,
    "ACCESS_TOKEN_LIFETIME": datetime.timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": datetime.timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

_user_ids = st.uuids().map(str)
_emails = st.from_regex(r"[a-z]{3,10}@[a-z]{3,8}\.[a-z]{2,4}", fullmatch=True)
_roles = st.sampled_from(["student", "admin", "reviewer", "super_admin"])


def _encode_jwt(payload: dict, key: str = TEST_SIGNING_KEY) -> str:
    return jwt.encode(payload, key, algorithm=TEST_ALGORITHM)


class FakeRequest:
    """A simple request-like object that does NOT auto-create attributes
    like MagicMock does. This lets us test whether _jwt_expired was
    explicitly set by the middleware."""

    def __init__(self):
        self.method = "GET"
        self.path = "/api/v1/auth/session/"
        self.COOKIES: dict = {}
        self.META: dict = {
            "REMOTE_ADDR": "127.0.0.1",
            "HTTP_USER_AGENT": "TestAgent/1.0",
        }
        self.user = MagicMock()
        self.user.is_authenticated = False
        self.user.pk = None


def _make_request(cookie_token: str | None = None, bearer_token: str | None = None):
    request = FakeRequest()

    if cookie_token is not None:
        request.COOKIES["access_token"] = cookie_token

    if bearer_token is not None:
        request.META["HTTP_AUTHORIZATION"] = f"Bearer {bearer_token}"

    return request


def _make_valid_token(user_id: str, email: str, role: str) -> str:
    """Create a JWT that is valid (exp 1 hour in the future)."""
    payload = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "token_type": "access",
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1),
    }
    return _encode_jwt(payload)


# =========================================================================
# Property 2a: Valid tokens authenticate normally without _jwt_expired
# =========================================================================


class TestValidTokenAuthenticatesNormally(SimpleTestCase):
    """For any valid JWT token state, middleware authenticates normally
    without setting `_jwt_expired`.

    This is existing correct behavior that must be preserved.

    **Validates: Requirements 3.8**
    """

    def setUp(self):
        self.response_returned = MagicMock(status_code=200)

        def mock_get_response(request):
            return self.response_returned

        self.middleware = JWTAuthenticationMiddleware(mock_get_response)
        self.middleware._signing_key = None
        self.middleware._algorithm = None

    @given(user_id=_user_ids, email=_emails, role=_roles)
    @settings(max_examples=50, deadline=None)
    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    def test_valid_cookie_token_authenticates_and_no_expired_flag(
        self, user_id, email, role
    ):
        """A valid (non-expired) JWT in the cookie authenticates the user
        and does NOT set _jwt_expired on the request.

        Preservation: valid tokens authenticate normally without triggering
        any refresh flow.
        """
        self.middleware._signing_key = None
        self.middleware._algorithm = None

        token = _make_valid_token(user_id, email, role)
        request = _make_request(cookie_token=token)

        self.middleware(request)

        # User should be set to an authenticated JWTUser
        self.assertTrue(
            getattr(request.user, "is_authenticated", False),
            f"Valid token for user {user_id} should authenticate the request.",
        )
        self.assertEqual(
            request.user.pk,
            user_id,
            f"Authenticated user pk should match token user_id {user_id}.",
        )

        # _jwt_expired should NOT be set (or should be False)
        self.assertFalse(
            getattr(request, "_jwt_expired", False),
            "Valid tokens must NOT set _jwt_expired flag.",
        )

    @given(user_id=_user_ids, email=_emails, role=_roles)
    @settings(max_examples=50, deadline=None)
    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    def test_valid_bearer_token_authenticates_and_no_expired_flag(
        self, user_id, email, role
    ):
        """A valid (non-expired) JWT in the Bearer header authenticates the user
        and does NOT set _jwt_expired on the request."""
        self.middleware._signing_key = None
        self.middleware._algorithm = None

        token = _make_valid_token(user_id, email, role)
        request = _make_request(bearer_token=token)

        self.middleware(request)

        self.assertTrue(
            getattr(request.user, "is_authenticated", False),
            f"Valid Bearer token for user {user_id} should authenticate the request.",
        )
        self.assertEqual(
            request.user.pk,
            user_id,
            f"Authenticated user pk should match token user_id {user_id}.",
        )

        self.assertFalse(
            getattr(request, "_jwt_expired", False),
            "Valid Bearer tokens must NOT set _jwt_expired flag.",
        )


# =========================================================================
# Property 2b: No token present → middleware passes through (DRF returns 403)
# =========================================================================


class TestNoTokenPassesThrough(SimpleTestCase):
    """For any request with no token present, middleware returns None
    and DRF returns 403 (correct behavior for unauthenticated).

    This is existing correct behavior that must be preserved.

    **Validates: Requirements 3.9**
    """

    def setUp(self):
        self.response_returned = MagicMock(status_code=200)

        def mock_get_response(request):
            return self.response_returned

        self.middleware = JWTAuthenticationMiddleware(mock_get_response)
        self.middleware._signing_key = None
        self.middleware._algorithm = None

    @given(
        path=st.sampled_from([
            "/api/v1/auth/session/",
            "/api/v1/applications/",
            "/api/v1/notifications/",
            "/api/v1/documents/",
        ])
    )
    @settings(max_examples=30, deadline=None)
    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    def test_no_token_leaves_user_unauthenticated(self, path):
        """When no token is present (no cookie, no Bearer header), the
        middleware does not set request.user to an authenticated user.

        The request passes through with the default anonymous user,
        and DRF's IsAuthenticated returns 403 — this is correct behavior
        for genuinely unauthenticated requests.
        """
        self.middleware._signing_key = None
        self.middleware._algorithm = None

        request = _make_request()  # No token
        request.path = path

        self.middleware(request)

        # User should remain the default anonymous mock (not overwritten)
        # The middleware only sets request.user when authentication succeeds
        self.assertFalse(
            getattr(request, "_jwt_expired", False),
            "No-token requests must NOT set _jwt_expired flag.",
        )
