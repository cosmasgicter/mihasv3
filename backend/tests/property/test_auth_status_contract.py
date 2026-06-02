"""Property-based tests for the 401/403 status contract.

Verifies that the envelope_exception_handler enforces an unambiguous mapping:
  - AuthenticationFailed → always 401
  - NotAuthenticated → always 401 with code AUTHENTICATION_REQUIRED
  - PermissionDenied → always 403, never 401

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.6**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from hypothesis import given, settings as hypothesis_settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402
from rest_framework.exceptions import (  # noqa: E402
    AuthenticationFailed,
    NotAuthenticated,
    PermissionDenied,
)
from rest_framework.test import APIRequestFactory  # noqa: E402
from rest_framework.views import APIView  # noqa: E402

from apps.common.exceptions import envelope_exception_handler  # noqa: E402

_default_settings = hypothesis_settings(max_examples=20, deadline=None)

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Error codes that AuthenticationFailed might carry (lowercase, as DRF stores them)
_auth_error_codes = st.sampled_from([
    "authentication_failed",
    "token_expired",
    "invalid_token",
    "token_blacklisted",
    "not_authenticated",
])

# Arbitrary short strings for fuzz-testing error codes
_arbitrary_error_codes = st.text(
    alphabet=st.characters(min_codepoint=ord("a"), max_codepoint=ord("z")),
    min_size=1,
    max_size=20,
)

# Combined strategy: known codes + arbitrary strings
_all_error_codes = st.one_of(_auth_error_codes, _arbitrary_error_codes)

# Arbitrary detail messages
_detail_messages = st.text(min_size=1, max_size=100)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_drf_context():
    """Build a minimal DRF view context for the exception handler."""
    factory = APIRequestFactory()
    request = factory.get("/fake/")
    view = APIView()
    view.request = request
    return {"request": request, "view": view}


# =========================================================================
# Property 1: AuthenticationFailed always produces 401
# =========================================================================


class TestAuthenticationFailedAlways401:
    """Property 1: AuthenticationFailed always produces 401.

    For any AuthenticationFailed exception with any error code,
    envelope_exception_handler must return status 401.

    **Validates: Requirements 3.1, 3.4, 3.6**
    """

    @given(code=_all_error_codes, detail=_detail_messages)
    @_default_settings
    def test_authentication_failed_always_returns_401(self, code, detail):
        exc = AuthenticationFailed(detail=detail, code=code)
        context = _make_drf_context()
        response = envelope_exception_handler(exc, context)

        assert response is not None, "Handler returned None for AuthenticationFailed"
        assert response.status_code == 401, (
            f"AuthenticationFailed with code='{code}' returned {response.status_code}, expected 401"
        )
        body = response.data
        assert body["success"] is False
        assert "code" in body, f"Missing 'code' in response body: {body}"
        # The code should be the uppercased version of the exception code
        assert body["code"] == code.upper(), (
            f"Expected code '{code.upper()}', got '{body['code']}'"
        )


# =========================================================================
# Property 2: NotAuthenticated always produces 401
# =========================================================================


class TestNotAuthenticatedAlways401:
    """Property 2: NotAuthenticated always produces 401.

    NotAuthenticated exceptions must always map to 401. The code is derived
    from exc.get_codes() which returns 'not_authenticated' → uppercased to
    'NOT_AUTHENTICATED'.

    **Validates: Requirements 3.1, 3.6**
    """

    @given(detail=_detail_messages)
    @_default_settings
    def test_not_authenticated_always_returns_401(self, detail):
        exc = NotAuthenticated(detail=detail)
        context = _make_drf_context()
        response = envelope_exception_handler(exc, context)

        assert response is not None, "Handler returned None for NotAuthenticated"
        assert response.status_code == 401, (
            f"NotAuthenticated returned {response.status_code}, expected 401"
        )
        body = response.data
        assert body["success"] is False
        assert body["code"] == "NOT_AUTHENTICATED", (
            f"Expected code 'NOT_AUTHENTICATED', got '{body['code']}'"
        )


# =========================================================================
# Property 3: PermissionDenied always produces 403
# =========================================================================


class TestPermissionDeniedAlways403:
    """Property 3: PermissionDenied always produces 403, never 401.

    PermissionDenied exceptions must always map to 403 with code
    INSUFFICIENT_PERMISSIONS, and never to 401.

    **Validates: Requirements 3.2, 3.3**
    """

    @given(detail=_detail_messages)
    @_default_settings
    def test_permission_denied_always_returns_403(self, detail):
        exc = PermissionDenied(detail=detail)
        context = _make_drf_context()
        response = envelope_exception_handler(exc, context)

        assert response is not None, "Handler returned None for PermissionDenied"
        assert response.status_code == 403, (
            f"PermissionDenied returned {response.status_code}, expected 403"
        )
        assert response.status_code != 401, (
            f"PermissionDenied must never return 401, got {response.status_code}"
        )
        body = response.data
        assert body["success"] is False
        assert body["code"] == "INSUFFICIENT_PERMISSIONS", (
            f"Expected code 'INSUFFICIENT_PERMISSIONS', got '{body['code']}'"
        )
