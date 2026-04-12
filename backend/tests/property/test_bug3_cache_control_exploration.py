"""
Bug 3 (P1) — Missing Cache-Control on Authenticated Responses: Exploration Test

This test encodes the EXPECTED (fixed) behavior. It MUST FAIL on unfixed code,
confirming that authenticated responses lack Cache-Control headers.

**Validates: Requirements 2.5**
"""

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from unittest.mock import MagicMock

from django.http import HttpRequest, HttpResponse

from apps.common.middleware import SecurityHeadersMiddleware


# --- Strategies ---

# Common API path segments for generating realistic request paths
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

SUCCESS_STATUS_CODES = st.sampled_from([200, 201, 202, 204])


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


class TestBug3CacheControlExploration:
    """
    Bug condition exploration: authenticated responses must include
    Cache-Control: no-store, private.

    The middleware currently does NOT set Cache-Control, so these tests
    MUST FAIL on unfixed code — failure confirms the bug exists.
    """

    @given(
        path=PATH_SEGMENTS,
        method=HTTP_METHODS,
        status_code=SUCCESS_STATUS_CODES,
    )
    @settings(max_examples=50, deadline=None)
    def test_authenticated_response_has_cache_control(
        self, path: str, method: str, status_code: int
    ):
        """
        For any authenticated request returning a success status code,
        the response MUST include Cache-Control: no-store, private.

        **Validates: Requirements 2.5**
        """
        request = _make_authenticated_request(path, method)
        middleware = _make_middleware(status_code)

        response = middleware(request)

        assert "Cache-Control" in response, (
            f"Authenticated {method} {path} (status {status_code}) "
            f"returned response WITHOUT Cache-Control header. "
            f"Bug condition: request.user.is_authenticated=True, "
            f"status_code={status_code}, 'Cache-Control' NOT IN response.headers"
        )
        assert response["Cache-Control"] == "no-store, private", (
            f"Authenticated {method} {path} (status {status_code}) "
            f"has Cache-Control={response.get('Cache-Control')!r} "
            f"but expected 'no-store, private'"
        )
