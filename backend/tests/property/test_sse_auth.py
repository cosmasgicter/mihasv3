"""Property-based tests for SSE authentication.

# Feature: realtime-sse-system, Property 3: Unauthenticated SSE returns 401
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import asyncio  # noqa: E402
import json  # noqa: E402
import time  # noqa: E402
import uuid  # noqa: E402

import django  # noqa: E402

django.setup()

import jwt as pyjwt  # noqa: E402
from django.test import SimpleTestCase, override_settings  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

_pbt_settings = settings(max_examples=100, deadline=None)

# ---------------------------------------------------------------------------
# Constants for JWT generation
# ---------------------------------------------------------------------------

_TEST_SIGNING_KEY = "test-secret-key-for-property-tests"
_TEST_ALGORITHM = "HS256"

_SIMPLE_JWT_OVERRIDE = {
    "SIGNING_KEY": _TEST_SIGNING_KEY,
    "ALGORITHM": _TEST_ALGORITHM,
}

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Strategy for arbitrary strings that are NOT valid JWTs
_garbage_tokens = st.one_of(
    st.just(""),
    st.text(min_size=1, max_size=200),
    st.text(min_size=1, max_size=50).map(lambda s: f"not.a.jwt.{s}"),
)

# Strategy for wrong token_type values (anything except "access")
_wrong_token_types = st.text(min_size=1, max_size=30).filter(
    lambda s: s != "access"
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_request_with_cookies(cookies=None):
    """Create a minimal mock request object with COOKIES dict."""
    class FakeRequest:
        def __init__(self, cookies_dict):
            self.COOKIES = cookies_dict or {}
            self.META = {}
    return FakeRequest(cookies or {})


def _encode_jwt(payload, key=_TEST_SIGNING_KEY, algorithm=_TEST_ALGORITHM):
    """Encode a JWT payload with the given key and algorithm."""
    return pyjwt.encode(payload, key, algorithm=algorithm)


def _assert_401_json_envelope(response):
    """Assert the response is 401 with the expected JSON error envelope."""
    assert response.status_code == 401, (
        f"Expected HTTP 401, got {response.status_code}"
    )
    body = json.loads(response.content)
    assert body["success"] is False, (
        f"Expected success=false in response body, got {body}"
    )
    assert "error" in body, (
        f"Expected 'error' key in response body, got {body}"
    )
    assert "code" in body, (
        f"Expected 'code' key in response body, got {body}"
    )


# ---------------------------------------------------------------------------
# Property 3: Unauthenticated SSE returns 401
# Feature: realtime-sse-system, Property 3: Unauthenticated SSE returns 401
# ---------------------------------------------------------------------------


@override_settings(SIMPLE_JWT=_SIMPLE_JWT_OVERRIDE)
class TestUnauthenticatedSSEReturns401(SimpleTestCase):
    """Property 3: Unauthenticated SSE returns 401.

    For any request to GET /api/v1/events/stream/ that does not contain a
    valid JWT in the access_token cookie (missing cookie, expired token,
    invalid signature, wrong token_type), the endpoint should return HTTP 401
    with a JSON error envelope.

    **Validates: Requirements 1.6**
    """

    @given(data=st.data())
    @_pbt_settings
    def test_missing_cookie_returns_401(self, data):
        """Feature: realtime-sse-system, Property 3: Unauthenticated SSE returns 401

        When the request has no access_token cookie at all, sse_stream_view
        returns 401 with a JSON error envelope.
        """
        from apps.common.sse import sse_stream_view

        # Generate arbitrary cookies that do NOT include access_token
        other_keys = data.draw(
            st.lists(
                st.text(min_size=1, max_size=20).filter(
                    lambda s: s != "access_token"
                ),
                max_size=5,
            ),
            label="other_cookie_keys",
        )
        cookies = {k: "some_value" for k in other_keys}
        request = _make_request_with_cookies(cookies)

        response = asyncio.run(sse_stream_view(request))
        _assert_401_json_envelope(response)

    @given(token=_garbage_tokens)
    @_pbt_settings
    def test_invalid_signature_token_returns_401(self, token):
        """Feature: realtime-sse-system, Property 3: Unauthenticated SSE returns 401

        When the access_token cookie contains a token with an invalid
        signature (garbage string, malformed JWT), sse_stream_view returns
        401 with a JSON error envelope.
        """
        from apps.common.sse import sse_stream_view

        request = _make_request_with_cookies({"access_token": token})
        response = asyncio.run(sse_stream_view(request))
        _assert_401_json_envelope(response)

    @given(user_id=st.uuids())
    @_pbt_settings
    def test_expired_token_returns_401(self, user_id):
        """Feature: realtime-sse-system, Property 3: Unauthenticated SSE returns 401

        When the access_token cookie contains an expired JWT (valid
        signature but exp in the past), sse_stream_view returns 401.
        """
        from apps.common.sse import sse_stream_view

        expired_payload = {
            "user_id": str(user_id),
            "token_type": "access",
            "exp": int(time.time()) - 3600,  # expired 1 hour ago
        }
        token = _encode_jwt(expired_payload)
        request = _make_request_with_cookies({"access_token": token})

        response = asyncio.run(sse_stream_view(request))
        _assert_401_json_envelope(response)

    @given(user_id=st.uuids(), wrong_type=_wrong_token_types)
    @_pbt_settings
    def test_wrong_token_type_returns_401(self, user_id, wrong_type):
        """Feature: realtime-sse-system, Property 3: Unauthenticated SSE returns 401

        When the access_token cookie contains a valid JWT but with
        token_type != "access" (e.g. "refresh", arbitrary string),
        sse_stream_view returns 401.
        """
        from apps.common.sse import sse_stream_view

        payload = {
            "user_id": str(user_id),
            "token_type": wrong_type,
            "exp": int(time.time()) + 3600,
        }
        token = _encode_jwt(payload)
        request = _make_request_with_cookies({"access_token": token})

        response = asyncio.run(sse_stream_view(request))
        _assert_401_json_envelope(response)

    @given(user_id=st.uuids())
    @_pbt_settings
    def test_wrong_signing_key_returns_401(self, user_id):
        """Feature: realtime-sse-system, Property 3: Unauthenticated SSE returns 401

        When the access_token cookie contains a JWT signed with a different
        key than the server's SIGNING_KEY, sse_stream_view returns 401.
        """
        from apps.common.sse import sse_stream_view

        payload = {
            "user_id": str(user_id),
            "token_type": "access",
            "exp": int(time.time()) + 3600,
        }
        # Sign with a DIFFERENT key than the server expects
        token = _encode_jwt(payload, key="wrong-secret-key-not-matching")
        request = _make_request_with_cookies({"access_token": token})

        response = asyncio.run(sse_stream_view(request))
        _assert_401_json_envelope(response)

    @given(data=st.data())
    @_pbt_settings
    def test_missing_user_id_in_payload_returns_401(self, data):
        """Feature: realtime-sse-system, Property 3: Unauthenticated SSE returns 401

        When the access_token cookie contains a valid JWT with correct
        token_type="access" but no user_id in the payload, sse_stream_view
        returns 401.
        """
        from apps.common.sse import sse_stream_view

        # Build a payload with token_type=access but no user_id
        extra_keys = data.draw(
            st.dictionaries(
                keys=st.text(min_size=1, max_size=20).filter(
                    lambda s: s not in ("user_id", "token_type", "exp")
                ),
                values=st.text(min_size=1, max_size=20),
                max_size=3,
            ),
            label="extra_payload_keys",
        )
        payload = {
            "token_type": "access",
            "exp": int(time.time()) + 3600,
            **extra_keys,
        }
        token = _encode_jwt(payload)
        request = _make_request_with_cookies({"access_token": token})

        response = asyncio.run(sse_stream_view(request))
        _assert_401_json_envelope(response)

    @given(user_id=st.uuids())
    @_pbt_settings
    def test_empty_access_token_cookie_returns_401(self, user_id):
        """Feature: realtime-sse-system, Property 3: Unauthenticated SSE returns 401

        When the access_token cookie is present but empty, sse_stream_view
        returns 401.
        """
        from apps.common.sse import sse_stream_view

        request = _make_request_with_cookies({"access_token": ""})

        response = asyncio.run(sse_stream_view(request))
        _assert_401_json_envelope(response)
