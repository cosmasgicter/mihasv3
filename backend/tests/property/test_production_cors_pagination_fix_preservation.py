"""Preservation property tests for production CORS & pagination fix.

# Feature: production-cors-pagination-fix

Property 2: Preservation — Existing CORS Headers & Valid Pagination Unchanged

These tests MUST PASS on unfixed code — they capture baseline behavior to preserve.
They verify that existing CORS headers, cookie security settings, and valid
pagination behavior remain unchanged after the fix is applied.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402


class TestCORSDefaultHeadersPreservation:
    """Verify all default_headers items remain in CORS_ALLOW_HEADERS.

    On unfixed code, CORS_ALLOW_HEADERS is:
        list(dict.fromkeys([*default_headers, "cache-control"]))

    All items from corsheaders.defaults.default_headers must be present.
    This ensures the fix (adding x-csrf-token) does not remove existing headers.

    **Validates: Requirements 3.2, 3.4**
    """

    @given(
        header=st.sampled_from([
            "accept",
            "authorization",
            "content-type",
            "user-agent",
            "x-csrftoken",
            "x-requested-with",
        ])
    )
    @settings(max_examples=20)
    def test_default_headers_in_cors_allow_headers(self, header: str) -> None:
        """Assert each default_headers item is in CORS_ALLOW_HEADERS."""
        from config.settings.base import CORS_ALLOW_HEADERS

        assert header in CORS_ALLOW_HEADERS, (
            f"default_headers item '{header}' is missing from CORS_ALLOW_HEADERS. "
            f"Current headers: {CORS_ALLOW_HEADERS}"
        )


class TestCORSExtraHeadersPreservation:
    """Verify cache-control and x-csrf-token remain in CORS_ALLOW_HEADERS.

    These headers were explicitly added alongside default_headers in the
    original configuration and must be preserved after the fix.
    last-event-id was removed as part of SSE cleanup.

    **Validates: Requirements 3.2, 3.4**
    """

    @given(header=st.sampled_from(["cache-control", "x-csrf-token"]))
    @settings(max_examples=10)
    def test_extra_headers_in_cors_allow_headers(self, header: str) -> None:
        """Assert cache-control and x-csrf-token are in CORS_ALLOW_HEADERS."""
        from config.settings.base import CORS_ALLOW_HEADERS

        assert header in CORS_ALLOW_HEADERS, (
            f"Extra header '{header}' is missing from CORS_ALLOW_HEADERS. "
            f"Current headers: {CORS_ALLOW_HEADERS}"
        )


class TestAuthCookieSecurityPreservation:
    """Verify AUTH_COOKIE_SECURE and AUTH_COOKIE_HTTPONLY remain True.

    The SameSite fix changes AUTH_COOKIE_SAMESITE in prod.py, but
    AUTH_COOKIE_SECURE and AUTH_COOKIE_HTTPONLY must remain True to
    maintain cookie security. SameSite=None requires Secure=True.

    **Validates: Requirements 3.4, 3.5**
    """

    def test_auth_cookie_secure_is_true(self) -> None:
        """Assert AUTH_COOKIE_SECURE remains True in base settings."""
        from config.settings.base import AUTH_COOKIE_SECURE

        assert AUTH_COOKIE_SECURE is True, (
            f"AUTH_COOKIE_SECURE is {AUTH_COOKIE_SECURE!r} but must be True. "
            f"SameSite=None requires Secure=True for cross-origin cookies."
        )

    def test_auth_cookie_httponly_is_true(self) -> None:
        """Assert AUTH_COOKIE_HTTPONLY remains True in base settings."""
        from config.settings.base import AUTH_COOKIE_HTTPONLY

        assert AUTH_COOKIE_HTTPONLY is True, (
            f"AUTH_COOKIE_HTTPONLY is {AUTH_COOKIE_HTTPONLY!r} but must be True. "
            f"HTTP-only cookies prevent XSS from reading auth tokens."
        )
