"""Property-based tests for JWTAuthenticationMiddleware.

# Feature: cto-assessment-remediation, Property 1: Valid JWT produces authenticated request.user

Tests that for any valid JWT payload with user_id, email, role, and
token_type=access, encoding it with the configured signing key and placing it
in either the access_token cookie or the Authorization: Bearer header causes
the middleware to attach a JWTUser to request.user with matching fields — and
the result is identical regardless of extraction path.
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
    """Encode a JWT payload with the given signing key."""
    return jwt.encode(payload, key, algorithm=TEST_ALGORITHM)


def _make_request(cookie_token: str | None = None, bearer_token: str | None = None):
    """Build a minimal mock Django request with optional JWT in cookie or header."""
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
    request.user = MagicMock()
    request.user.is_authenticated = False
    request.user.pk = None

    return request


# =========================================================================
# Property 1: Valid JWT produces authenticated request.user
# =========================================================================


class TestValidJWTProducesAuthenticatedUser(SimpleTestCase):
    """Property 1: Valid JWT produces authenticated request.user.

    For any valid JWT payload containing user_id, email, role, and
    token_type=access, encoding it with the configured signing key and
    placing it in either the access_token cookie or the Authorization:
    Bearer header, the middleware should attach a JWTUser to request.user
    with matching id, email, and role fields — and the result should be
    identical regardless of which extraction path (cookie vs. header) was
    used.

    **Validates: Requirements 1.1, 1.2**
    """

    def setUp(self):
        self.response_returned = MagicMock(status_code=200)

        def mock_get_response(request):
            return self.response_returned

        self.middleware = JWTAuthenticationMiddleware(mock_get_response)
        # Reset lazy-loaded config so override_settings takes effect
        self.middleware._signing_key = None
        self.middleware._algorithm = None

    @given(user_id=_user_ids, email=_emails, role=_roles)
    @settings(max_examples=5, deadline=None)
    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    def test_cookie_jwt_sets_authenticated_user(self, user_id, email, role):
        """A valid JWT in the access_token cookie produces an authenticated
        request.user with matching id, email, and role."""
        # Reset lazy config each iteration
        self.middleware._signing_key = None
        self.middleware._algorithm = None

        payload = {
            "user_id": user_id,
            "email": email,
            "role": role,
            "token_type": "access",
        }
        token = _encode_jwt(payload)
        request = _make_request(cookie_token=token)

        self.middleware(request)

        self.assertTrue(request.user.is_authenticated)
        self.assertEqual(request.user.id, user_id)
        self.assertEqual(request.user.email, email)
        self.assertEqual(request.user.role, role)

    @given(user_id=_user_ids, email=_emails, role=_roles)
    @settings(max_examples=5, deadline=None)
    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    def test_bearer_jwt_sets_authenticated_user(self, user_id, email, role):
        """A valid JWT in the Authorization: Bearer header produces an
        authenticated request.user with matching id, email, and role."""
        self.middleware._signing_key = None
        self.middleware._algorithm = None

        payload = {
            "user_id": user_id,
            "email": email,
            "role": role,
            "token_type": "access",
        }
        token = _encode_jwt(payload)
        request = _make_request(bearer_token=token)

        self.middleware(request)

        self.assertTrue(request.user.is_authenticated)
        self.assertEqual(request.user.id, user_id)
        self.assertEqual(request.user.email, email)
        self.assertEqual(request.user.role, role)

    @given(user_id=_user_ids, email=_emails, role=_roles)
    @settings(max_examples=5, deadline=None)
    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    def test_cookie_and_bearer_produce_identical_user(self, user_id, email, role):
        """The same JWT payload delivered via cookie or Bearer header must
        produce identical JWTUser attributes."""
        self.middleware._signing_key = None
        self.middleware._algorithm = None

        payload = {
            "user_id": user_id,
            "email": email,
            "role": role,
            "token_type": "access",
        }
        token = _encode_jwt(payload)

        # Cookie path
        cookie_request = _make_request(cookie_token=token)
        self.middleware(cookie_request)

        # Bearer path
        bearer_request = _make_request(bearer_token=token)
        self.middleware._signing_key = None
        self.middleware._algorithm = None
        self.middleware(bearer_request)

        # Both paths must produce identical user attributes
        self.assertEqual(cookie_request.user.id, bearer_request.user.id)
        self.assertEqual(cookie_request.user.email, bearer_request.user.email)
        self.assertEqual(cookie_request.user.role, bearer_request.user.role)
        self.assertEqual(
            cookie_request.user.is_authenticated,
            bearer_request.user.is_authenticated,
        )


# =========================================================================
# Property 2: Invalid JWT does not set request.user
# Feature: cto-assessment-remediation, Property 2: Invalid JWT does not set request.user
# =========================================================================

# ---------------------------------------------------------------------------
# Additional strategies for invalid tokens
# ---------------------------------------------------------------------------

_wrong_keys = st.text(min_size=10, max_size=50).filter(lambda k: k != TEST_SIGNING_KEY)

_non_access_token_types = st.sampled_from(["refresh", "verify", "reset", ""])

_malformed_tokens = st.one_of(
    st.text(min_size=0, max_size=200),  # arbitrary strings
    st.just(""),  # empty string
    st.just("not.a.jwt"),  # dot-separated but not valid
    st.just("eyJhbGciOiJIUzI1NiJ9.."),  # partial JWT structure
    st.binary(min_size=1, max_size=100).map(lambda b: b.hex()),  # hex garbage
)

_empty_user_ids = st.sampled_from(["", None])


class TestInvalidJWTDoesNotSetUser(SimpleTestCase):
    """Property 2: Invalid JWT does not set request.user.

    For any invalid JWT token — including expired tokens, tokens signed with
    the wrong key, malformed strings, tokens with token_type != 'access', and
    tokens with missing or empty user_id — the middleware should allow the
    request to proceed without setting request.user to an authenticated user.

    **Validates: Requirements 1.3, 1.4, 1.6, 1.7**
    """

    def setUp(self):
        self.response_returned = MagicMock(status_code=200)

        def mock_get_response(request):
            return self.response_returned

        self.middleware = JWTAuthenticationMiddleware(mock_get_response)
        self.middleware._signing_key = None
        self.middleware._algorithm = None

    def _assert_user_not_authenticated(self, request):
        """Assert that request.user was NOT replaced with an authenticated JWTUser."""
        # The middleware should either leave the original mock user untouched
        # (is_authenticated=False) or not set request.user at all.
        self.assertFalse(
            getattr(request.user, "is_authenticated", False),
            "request.user should not be authenticated for an invalid token",
        )

    @given(user_id=_user_ids, email=_emails, role=_roles)
    @settings(max_examples=5, deadline=None)
    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    def test_expired_token_does_not_set_user(self, user_id, email, role):
        """An expired JWT should not set request.user to an authenticated user."""
        self.middleware._signing_key = None
        self.middleware._algorithm = None

        payload = {
            "user_id": user_id,
            "email": email,
            "role": role,
            "token_type": "access",
            "exp": datetime.datetime(2020, 1, 1, tzinfo=datetime.timezone.utc),
        }
        token = _encode_jwt(payload)
        request = _make_request(cookie_token=token)

        self.middleware(request)

        self._assert_user_not_authenticated(request)

    @given(user_id=_user_ids, email=_emails, role=_roles, wrong_key=_wrong_keys)
    @settings(max_examples=5, deadline=None)
    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    def test_wrong_key_token_does_not_set_user(self, user_id, email, role, wrong_key):
        """A JWT signed with the wrong key should not set request.user."""
        self.middleware._signing_key = None
        self.middleware._algorithm = None

        payload = {
            "user_id": user_id,
            "email": email,
            "role": role,
            "token_type": "access",
        }
        token = _encode_jwt(payload, key=wrong_key)
        request = _make_request(bearer_token=token)

        self.middleware(request)

        self._assert_user_not_authenticated(request)

    @given(malformed=_malformed_tokens)
    @settings(max_examples=5, deadline=None)
    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    def test_malformed_token_does_not_set_user(self, malformed):
        """A malformed string should not set request.user."""
        self.middleware._signing_key = None
        self.middleware._algorithm = None

        request = _make_request(cookie_token=malformed)

        self.middleware(request)

        self._assert_user_not_authenticated(request)

    @given(
        user_id=_user_ids,
        email=_emails,
        role=_roles,
        bad_type=_non_access_token_types,
    )
    @settings(max_examples=5, deadline=None)
    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    def test_wrong_token_type_does_not_set_user(self, user_id, email, role, bad_type):
        """A JWT with token_type != 'access' should not set request.user."""
        self.middleware._signing_key = None
        self.middleware._algorithm = None

        payload = {
            "user_id": user_id,
            "email": email,
            "role": role,
            "token_type": bad_type,
        }
        token = _encode_jwt(payload)
        request = _make_request(cookie_token=token)

        self.middleware(request)

        self._assert_user_not_authenticated(request)

    @given(email=_emails, role=_roles, empty_id=_empty_user_ids)
    @settings(max_examples=5, deadline=None)
    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    def test_missing_or_empty_user_id_does_not_set_user(self, email, role, empty_id):
        """A JWT with missing or empty user_id should not set request.user."""
        self.middleware._signing_key = None
        self.middleware._algorithm = None

        payload = {
            "email": email,
            "role": role,
            "token_type": "access",
        }
        if empty_id is not None:
            payload["user_id"] = empty_id
        # If empty_id is None, user_id key is omitted entirely

        token = _encode_jwt(payload)
        request = _make_request(bearer_token=token)

        self.middleware(request)

        self._assert_user_not_authenticated(request)
