"""Property-based tests for security headers middleware.

# Feature: audit-remediation, Property 8: Security headers present on all responses

For any HTTP response from the backend, the response should include
X-XSS-Protection: 1; mode=block and a Content-Security-Policy header
with a non-empty directive.

**Validates: Requirements 12.1, 12.2, 12.3**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.http import HttpRequest, HttpResponse  # noqa: E402
from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.common.middleware import SecurityHeadersMiddleware  # noqa: E402


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Random URL paths: realistic path segments joined by /
path_segment = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyz0123456789-_",
    min_size=1,
    max_size=30,
)

request_paths = st.lists(path_segment, min_size=1, max_size=5).map(
    lambda parts: "/" + "/".join(parts) + "/"
)

# HTTP status codes covering all standard ranges
status_codes = st.sampled_from([200, 201, 204, 301, 302, 400, 401, 403, 404, 500])


# ---------------------------------------------------------------------------
# Property 8: Security headers present on all responses
# ---------------------------------------------------------------------------


class TestSecurityHeadersPresentOnAllResponses(SimpleTestCase):
    """# Feature: audit-remediation, Property 8: Security headers present on all responses

    For any HTTP response from the backend, the response should include
    X-XSS-Protection: 1; mode=block and a Content-Security-Policy header
    with a non-empty directive.

    **Validates: Requirements 12.1, 12.2, 12.3**
    """

    @given(path=request_paths, status_code=status_codes)
    @settings(max_examples=100, deadline=None)
    def test_xss_protection_header_present(self, path, status_code):
        """For any request path and response status, the middleware sets
        X-XSS-Protection to '1; mode=block'."""
        request = HttpRequest()
        request.method = "GET"
        request.path = path
        request.META["SERVER_NAME"] = "testserver"
        request.META["SERVER_PORT"] = "80"

        def get_response(req):
            return HttpResponse(status=status_code)

        middleware = SecurityHeadersMiddleware(get_response)
        response = middleware(request)

        self.assertIn("X-XSS-Protection", response)
        self.assertEqual(response["X-XSS-Protection"], "1; mode=block")

    @given(path=request_paths, status_code=status_codes)
    @settings(max_examples=100, deadline=None)
    def test_csp_header_present_and_non_empty(self, path, status_code):
        """For any request path and response status, the middleware sets
        a Content-Security-Policy header with a non-empty directive."""
        request = HttpRequest()
        request.method = "GET"
        request.path = path
        request.META["SERVER_NAME"] = "testserver"
        request.META["SERVER_PORT"] = "80"

        def get_response(req):
            return HttpResponse(status=status_code)

        middleware = SecurityHeadersMiddleware(get_response)
        response = middleware(request)

        self.assertIn("Content-Security-Policy", response)
        csp = response["Content-Security-Policy"]
        self.assertTrue(len(csp) > 0, "CSP header must be non-empty")
        self.assertIn("default-src", csp, "CSP must include a default-src directive")
