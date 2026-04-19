"""Property-based tests for rate limiting enforcement.

Feature: go-live-readiness, Property 10: Rate limiting enforcement

Tests that the RateLimitMiddleware enforces limits correctly: the first L
requests pass through and requests L+1..N return HTTP 429 with a
Retry-After header.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from unittest.mock import patch

import django

django.setup()

from django.http import JsonResponse
from django.test import SimpleTestCase
from hypothesis import given, settings
from hypothesis import strategies as st

from apps.common.middleware import RateLimitMiddleware


# ---------------------------------------------------------------------------
# Strategy: pick a scope and generate a request count that exercises both
# the allowed and the rate-limited regions.
# ---------------------------------------------------------------------------

# Each scope has a known limit. We pick one scope and generate N requests
# where N is between 1 and limit+10 to test both sides of the boundary.
_scope_configs = [
    ("/api/v1/auth/test/", "60/5m", 60, 300),
    ("/api/v1/admin/test/", "60/10m", 60, 600),
    ("/api/v1/documents/test/", "20/10m", 20, 600),
    ("/api/v1/sessions/test/", "30/10m", 30, 600),
    ("/api/v1/notifications/test/", "50/10m", 50, 600),
    ("/api/v1/errors/test/", "10/5m", 10, 300),
]

_scope_strategy = st.sampled_from(_scope_configs)

# Generate request counts that span the boundary: at least 1, up to limit+5
_request_count_strategy = st.integers(min_value=1, max_value=15)


class TestRateLimitingEnforcement(SimpleTestCase):
    """Property 10: Rate limiting enforcement.

    For any rate-limited endpoint scope with limit L requests per window W,
    and for any sequence of N requests from the same IP within window W:
    - The first L requests should receive normal responses (not 429)
    - Requests L+1 through N should receive HTTP 429 with a Retry-After header
    - The Retry-After value should equal the window duration in seconds

    Feature: go-live-readiness, Property 10: Rate limiting enforcement

    **Validates: Requirements 4.2**
    """

    @given(
        scope_config=_scope_strategy,
        extra_requests=_request_count_strategy,
    )
    @settings(max_examples=5, deadline=None)
    def test_rate_limit_enforcement(self, scope_config, extra_requests):
        """First L requests pass, subsequent requests get 429."""
        path, rate_str, limit, expected_retry_after = scope_config
        total_requests = limit + extra_requests

        # Track how many times is_ratelimited has been called for this test
        call_count = 0

        def mock_is_ratelimited(request, group, key, rate, increment):
            nonlocal call_count
            call_count += 1
            # Simulate: first `limit` calls are not limited, rest are
            return call_count > limit

        def ok_response(request):
            return JsonResponse({"success": True}, status=200)

        middleware = RateLimitMiddleware(ok_response)

        passed = 0
        blocked = 0

        with patch(
            "django_ratelimit.core.is_ratelimited",
            side_effect=mock_is_ratelimited,
        ):
            for i in range(total_requests):
                # Build a minimal request-like object
                from django.test import RequestFactory
                factory = RequestFactory()
                request = factory.get(path, REMOTE_ADDR="192.168.1.1")

                response = middleware(request)

                if response.status_code == 429:
                    blocked += 1
                    # Verify Retry-After header
                    self.assertIn(
                        "Retry-After",
                        response,
                        f"Request {i+1}: 429 response missing Retry-After header",
                    )
                    self.assertEqual(
                        response["Retry-After"],
                        str(expected_retry_after),
                        f"Request {i+1}: Retry-After should be {expected_retry_after}",
                    )
                else:
                    passed += 1

        # First `limit` requests should pass
        self.assertEqual(
            passed,
            limit,
            f"Expected {limit} requests to pass for {path} ({rate_str}), got {passed}",
        )

        # Remaining requests should be blocked
        self.assertEqual(
            blocked,
            extra_requests,
            f"Expected {extra_requests} requests blocked for {path} ({rate_str}), got {blocked}",
        )
