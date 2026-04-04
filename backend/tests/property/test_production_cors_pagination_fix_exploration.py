"""Bug condition exploration tests for production CORS & pagination fix.

# Feature: production-cors-pagination-fix

Property 1: Bug Condition — CORS Header Missing & Pagination Zero-Page

CRITICAL: These tests MUST FAIL on unfixed code — failure confirms the bugs exist.
DO NOT attempt to fix the tests or the code when they fail.

These tests encode the expected behavior — they will validate the fixes
when they pass after implementation.

**Validates: Requirements 1.1, 1.2, 1.5, 2.1, 2.2, 2.5**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

import pytest  # noqa: E402


class TestCORSHeaderBugCondition:
    """Verify x-csrf-token is in CORS_ALLOW_HEADERS.

    On unfixed code, CORS_ALLOW_HEADERS is constructed as:
        list(dict.fromkeys([*default_headers, "cache-control", "last-event-id"]))
    which does NOT include "x-csrf-token".

    This test MUST FAIL on unfixed code — confirming the bug exists.

    **Validates: Requirements 1.1, 1.2, 1.5, 2.1, 2.2, 2.5**
    """

    def test_x_csrf_token_in_cors_allow_headers(self):
        """Assert x-csrf-token is present in CORS_ALLOW_HEADERS from base settings."""
        from config.settings.base import CORS_ALLOW_HEADERS

        assert "x-csrf-token" in CORS_ALLOW_HEADERS, (
            f"CORS_ALLOW_HEADERS does not contain 'x-csrf-token'. "
            f"Current headers: {CORS_ALLOW_HEADERS}"
        )


class TestCookieSameSiteBugCondition:
    """Verify AUTH_COOKIE_SAMESITE is "None" in production settings.

    On unfixed code, prod.py sets AUTH_COOKIE_SAMESITE = "Lax" which
    prevents cookies from being sent on cross-origin credentialed requests
    from apply.mihas.edu.zm to api.mihas.edu.zm.

    This test MUST FAIL on unfixed code — confirming the bug exists.

    **Validates: Requirements 1.1, 2.1, 2.2**
    """

    def test_auth_cookie_samesite_is_none_in_prod(self):
        """Assert AUTH_COOKIE_SAMESITE equals 'None' in production settings."""
        from config.settings.prod import AUTH_COOKIE_SAMESITE

        assert AUTH_COOKIE_SAMESITE == "None", (
            f"AUTH_COOKIE_SAMESITE is '{AUTH_COOKIE_SAMESITE}' but should be 'None' "
            f"for cross-origin credentialed requests to work."
        )
