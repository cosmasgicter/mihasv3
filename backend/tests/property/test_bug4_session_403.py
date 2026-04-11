"""Bug condition exploration test — Session 403 expired JWT.

Property 1: Bug Condition — Expired JWT Returns 403 Instead of 401

This test encodes the EXPECTED (fixed) behavior:
- When an expired-but-present JWT is sent, the middleware should set
  `request._jwt_expired = True` and the downstream response should be 401
  (not 403).

On UNFIXED code, this test MUST FAIL because:
- The middleware returns None on ExpiredSignatureError without setting the flag
- DRF's IsAuthenticated returns 403 for AnonymousUser

**Validates: Requirements 1.7, 1.8, 1.9**
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


def _make_request(cookie_token: str | None = None, bearer_token: str | None = None):
    request = MagicMock()
    request.method = "GET"
    request.path = "/api/v1/auth/session/"
    request.COOKIES = {}
    request.META = {
        "REMOTE_ADDR": "127.0.0.1",
        "HTTP_USER_AGENT": "TestAgent/1.0",
    }

    if cookie_token is not None:
        request.COOKIES["access_token"] = cookie_token

    if bearer_token is not None:
        request.META["HTTP_AUTHORIZATION"] = f"Bearer {bearer_token}"

    # Default: anonymous user (no _jwt_expired attribute)
    request.user = MagicMock()
    request.user.is_authenticated = False
    request.user.pk = None

    # Ensure _jwt_expired is not set by default
    if hasattr(request, "_jwt_expired"):
        del request._jwt_expired

    return request


def _make_expired_token(user_id: str, email: str, role: str) -> str:
    """Create a JWT that is expired (exp in the past)."""
    payload = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "token_type": "access",
        "exp": datetime.datetime(2020, 1, 1, tzinfo=datetime.timezone.utc),
    }
    return _encode_jwt(payload)


# =========================================================================
# Property 1: Bug Condition — Expired JWT sets _jwt_expired flag
# =========================================================================


class TestExpiredJWTSetsExpiredFlag(SimpleTestCase):
    """Property 1: Bug Condition — Expired JWT Returns 403 Instead of 401.

    For any expired-but-present JWT token (token_type=access, valid signature,
    exp in the past), the middleware SHOULD set `request._jwt_expired = True`
    so that downstream auth classes can return 401 instead of 403.

    On UNFIXED code, the middleware catches ExpiredSignatureError and returns
    None without setting the flag, so this test will FAIL.

    **Validates: Requirements 1.7, 1.8, 1.9**
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
    def test_expired_cookie_token_sets_jwt_expired_flag(self, user_id, email, role):
        """An expired JWT in the access_token cookie should set
        request._jwt_expired = True on the request object.

        Bug condition: accessTokenPresent == true AND accessTokenExpired == true
        Expected: request._jwt_expired == True (so downstream returns 401)
        Actual (unfixed): _jwt_expired is never set (downstream returns 403)
        """
        self.middleware._signing_key = None
        self.middleware._algorithm = None

        token = _make_expired_token(user_id, email, role)
        request = _make_request(cookie_token=token)

        self.middleware(request)

        # EXPECTED behavior (will FAIL on unfixed code):
        # The middleware should mark the request as having an expired JWT
        self.assertTrue(
            getattr(request, "_jwt_expired", False),
            "Middleware should set request._jwt_expired = True for expired tokens. "
            f"Bug condition: expired JWT for user {user_id} — middleware returned None "
            "without setting the flag, causing DRF to return 403 instead of 401.",
        )

    @given(user_id=_user_ids, email=_emails, role=_roles)
    @settings(max_examples=50, deadline=None)
    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    def test_expired_bearer_token_sets_jwt_expired_flag(self, user_id, email, role):
        """An expired JWT in the Authorization: Bearer header should set
        request._jwt_expired = True on the request object.

        Bug condition: accessTokenPresent == true AND accessTokenExpired == true
        Expected: request._jwt_expired == True
        Actual (unfixed): _jwt_expired is never set
        """
        self.middleware._signing_key = None
        self.middleware._algorithm = None

        token = _make_expired_token(user_id, email, role)
        request = _make_request(bearer_token=token)

        self.middleware(request)

        self.assertTrue(
            getattr(request, "_jwt_expired", False),
            "Middleware should set request._jwt_expired = True for expired Bearer tokens. "
            f"Bug condition: expired JWT for user {user_id} — middleware returned None "
            "without setting the flag.",
        )
