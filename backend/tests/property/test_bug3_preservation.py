"""
Bug 3 (P1) — Cache-Control Preservation Tests

These tests verify baseline behavior that MUST be preserved after the fix:
1. Unauthenticated responses do NOT get Cache-Control: no-store, private
2. All responses (auth and unauth) retain the 5 existing security headers

These tests MUST PASS on unfixed code — this confirms baseline behavior to preserve.

**Validates: Requirements 3.7**
"""

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from unittest.mock import MagicMock

from django.contrib.auth.models import AnonymousUser
from django.http import HttpRequest, HttpResponse

from apps.common.middleware import SecurityHeadersMiddleware


# --- Strategies ---

PATH_SEGMENTS = st.sampled_from([
    "/api/v1/applications/",
    "/api/v1/jobs/",
    "/api/v1/job-applications/",
    "/api/v1/analytics/funnel/",
    "/api/v1/analytics/sources/",
    "/api/v1/documents/resumes/",
    "/api/v1/outreach/contacts/",
    "/api/v1/email/threads/",
    "/api/v1/automation/runs/",
    "/api/v1/meta/platform/",
    "/api/v1/catalog/programs/",
    "/api/v1/payments/",
    "/health/ready/",
])

HTTP_METHODS = st.sampled_from(["GET", "POST", "PUT", "PATCH", "DELETE"])

STATUS_CODES = st.sampled_from([200, 201, 202, 204, 301, 400, 403, 404, 500])

# The 5 security headers the middleware currently sets on every response
EXPECTED_SECURITY_HEADERS = {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
}


def _make_unauthenticated_request(path: str, method: str) -> HttpRequest:
    """Create a mock HttpRequest with an anonymous (unauthenticated) user."""
    request = HttpRequest()
    request.method = method
    request.path = path
    request.META["SERVER_NAME"] = "testserver"
    request.META["SERVER_PORT"] = "443"
    request.user = AnonymousUser()
    return request


def _make_authenticated_request(path: str, method: str) -> HttpRequest:
    """Create a mock HttpRequest with an authenticated user."""
    request = HttpRequest()
    request.method = method
    request.path = path
    request.META["SERVER_NAME"] = "testserver"
    request.META["SERVER_PORT"] = "443"

    user = MagicMock()
    user.is_authenticated = True
    user.pk = 1
    request.user = user
    return request


def _make_middleware(status_code: int) -> SecurityHeadersMiddleware:
    """Create a SecurityHeadersMiddleware that returns a response with the given status."""
    def get_response(request):
        return HttpResponse(status=status_code)
    return SecurityHeadersMiddleware(get_response)


class TestBug3UnauthenticatedCacheControlPreservation:
    """
    Preservation: unauthenticated responses must NOT have
    Cache-Control: no-store, private added by the middleware.

    The middleware currently does NOT set Cache-Control at all,
    so this passes trivially on unfixed code.
    """

    @given(
        path=PATH_SEGMENTS,
        method=HTTP_METHODS,
        status_code=STATUS_CODES,
    )
    @settings(max_examples=50, deadline=None)
    def test_unauthenticated_response_has_no_cache_control(
        self, path: str, method: str, status_code: int
    ):
        """
        For any unauthenticated request, the middleware must NOT add
        Cache-Control: no-store, private to the response.

        **Validates: Requirements 3.7**
        """
        request = _make_unauthenticated_request(path, method)
        middleware = _make_middleware(status_code)

        response = middleware(request)

        cache_control = response.get("Cache-Control", "")
        assert cache_control != "no-store, private", (
            f"Unauthenticated {method} {path} (status {status_code}) "
            f"has Cache-Control='no-store, private' — this header must NOT "
            f"be added for unauthenticated requests. "
            f"Preservation: unauthenticated responses unchanged."
        )


class TestBug3SecurityHeadersPreservation:
    """
    Preservation: all responses (authenticated and unauthenticated) must
    retain the 5 existing security headers set by SecurityHeadersMiddleware.
    """

    @given(
        path=PATH_SEGMENTS,
        method=HTTP_METHODS,
        status_code=STATUS_CODES,
    )
    @settings(max_examples=50, deadline=None)
    def test_unauthenticated_response_has_all_security_headers(
        self, path: str, method: str, status_code: int
    ):
        """
        For any unauthenticated request, all 5 security headers must be present
        with their expected values.

        **Validates: Requirements 3.7**
        """
        request = _make_unauthenticated_request(path, method)
        middleware = _make_middleware(status_code)

        response = middleware(request)

        for header, expected_value in EXPECTED_SECURITY_HEADERS.items():
            assert header in response, (
                f"Unauthenticated {method} {path} (status {status_code}) "
                f"missing security header: {header}"
            )
            assert response[header] == expected_value, (
                f"Unauthenticated {method} {path} (status {status_code}) "
                f"header {header}={response[header]!r}, "
                f"expected {expected_value!r}"
            )

    @given(
        path=PATH_SEGMENTS,
        method=HTTP_METHODS,
        status_code=STATUS_CODES,
    )
    @settings(max_examples=50, deadline=None)
    def test_authenticated_response_has_all_security_headers(
        self, path: str, method: str, status_code: int
    ):
        """
        For any authenticated request, all 5 security headers must be present
        with their expected values.

        **Validates: Requirements 3.7**
        """
        request = _make_authenticated_request(path, method)
        middleware = _make_middleware(status_code)

        response = middleware(request)

        for header, expected_value in EXPECTED_SECURITY_HEADERS.items():
            assert header in response, (
                f"Authenticated {method} {path} (status {status_code}) "
                f"missing security header: {header}"
            )
            assert response[header] == expected_value, (
                f"Authenticated {method} {path} (status {status_code}) "
                f"header {header}={response[header]!r}, "
                f"expected {expected_value!r}"
            )
