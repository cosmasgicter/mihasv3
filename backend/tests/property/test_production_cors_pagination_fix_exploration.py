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
        import os
        os.environ.setdefault("SECRET_KEY", "test-key")
        os.environ.setdefault("DATABASE_URL", "postgres://test:test@localhost/test")
        os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
        os.environ.setdefault("JWT_SIGNING_KEY", "test-jwt-key")
        os.environ.setdefault("ALLOWED_HOSTS", "localhost")
        os.environ.setdefault("CORS_ALLOWED_ORIGINS", "http://localhost")
        os.environ.setdefault("RESEND_API_KEY", "test")
        os.environ.setdefault("S3_ENDPOINT_URL", "https://test.example.com")
        os.environ.setdefault("S3_BUCKET", "test")
        os.environ.setdefault("S3_ACCESS_KEY", "test")
        os.environ.setdefault("S3_SECRET_KEY", "test")
        os.environ.setdefault("LENCO_API_SECRET_KEY", "test")
        os.environ.setdefault("LENCO_PUBLIC_KEY", "test")
        try:
            from config.settings.prod import AUTH_COOKIE_SAMESITE
        except Exception:
            pytest.skip("Cannot import prod settings without full env")
            return

        assert AUTH_COOKIE_SAMESITE == "None", (
            f"AUTH_COOKIE_SAMESITE is '{AUTH_COOKIE_SAMESITE}' but should be 'None' "
            f"for cross-origin credentialed requests to work."
        )
