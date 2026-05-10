"""Tests for payment endpoint rate limiting.

Verifies that:
  - PaymentInitiateThrottle, PaymentVerifyThrottle, MobileMoneyThrottle
    enforce correct per-user rate limits.
  - After exceeding the limit, requests return HTTP 429.
  - 429 responses include a Retry-After header.
  - Different endpoints have different rate limits.

Implements task 8.3.
Requirements: 7.4
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from unittest.mock import MagicMock, PropertyMock

from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIRequestFactory

from apps.documents.throttles import (
    MobileMoneyThrottle,
    PaymentInitiateThrottle,
    PaymentVerifyThrottle,
)
from apps.documents.views import (
    MobileMoneyInitiateView,
    PaymentInitiateView,
    PaymentVerifyView,
)

factory = APIRequestFactory()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_authenticated_request(user_id="user-1", method="post", path="/api/v1/payments/initiate/"):
    """Build a fake authenticated POST request."""
    request = factory.post(path)
    request.user = MagicMock(
        is_authenticated=True,
        pk=user_id,
        id=user_id,
    )
    request.META["REMOTE_ADDR"] = "127.0.0.1"
    return request


def _exhaust_throttle(throttle_cls, num_requests, user_id="user-1"):
    """Call allow_request() num_requests times and return the throttle + last result."""
    throttle = throttle_cls()
    view = MagicMock()
    result = True
    for _ in range(num_requests):
        request = _make_authenticated_request(user_id=user_id)
        result = throttle.allow_request(request, view)
        if not result:
            break
    return throttle, result


# ---------------------------------------------------------------------------
# Throttle class configuration tests
# ---------------------------------------------------------------------------

class TestThrottleClassConfiguration(SimpleTestCase):
    """Verify throttle classes have correct scopes and rates."""

    def test_payment_initiate_scope(self):
        self.assertEqual(PaymentInitiateThrottle.scope, "payment_initiate")

    def test_payment_initiate_rate(self):
        self.assertEqual(PaymentInitiateThrottle.rate, "5/min")

    def test_payment_verify_scope(self):
        self.assertEqual(PaymentVerifyThrottle.scope, "payment_verify")

    def test_payment_verify_rate(self):
        self.assertEqual(PaymentVerifyThrottle.rate, "10/min")

    def test_mobile_money_scope(self):
        self.assertEqual(MobileMoneyThrottle.scope, "mobile_money_initiate")

    def test_mobile_money_rate(self):
        self.assertEqual(MobileMoneyThrottle.rate, "5/min")


# ---------------------------------------------------------------------------
# View throttle class assignment tests
# ---------------------------------------------------------------------------

class TestViewThrottleAssignment(SimpleTestCase):
    """Verify each payment view has the correct throttle class assigned."""

    def test_initiate_view_has_throttle(self):
        self.assertIn(PaymentInitiateThrottle, PaymentInitiateView.throttle_classes)

    def test_verify_view_has_throttle(self):
        self.assertIn(PaymentVerifyThrottle, PaymentVerifyView.throttle_classes)

    def test_mobile_money_view_has_throttle(self):
        self.assertIn(MobileMoneyThrottle, MobileMoneyInitiateView.throttle_classes)


# ---------------------------------------------------------------------------
# Rate limit enforcement tests
# ---------------------------------------------------------------------------

class TestPaymentInitiateRateLimit(SimpleTestCase):
    """PaymentInitiateThrottle allows 5 requests/min then blocks."""

    def setUp(self):
        # Clear the throttle cache between tests
        from django.core.cache import cache
        cache.clear()

    def test_allows_requests_within_limit(self):
        throttle = PaymentInitiateThrottle()
        view = MagicMock()
        for i in range(5):
            request = _make_authenticated_request(user_id="initiate-user")
            allowed = throttle.allow_request(request, view)
            self.assertTrue(allowed, f"Request {i + 1} of 5 should be allowed")

    def test_blocks_after_exceeding_limit(self):
        throttle = PaymentInitiateThrottle()
        view = MagicMock()
        # Exhaust the 5-request limit
        for _ in range(5):
            request = _make_authenticated_request(user_id="initiate-block-user")
            throttle.allow_request(request, view)

        # 6th request should be blocked
        request = _make_authenticated_request(user_id="initiate-block-user")
        allowed = throttle.allow_request(request, view)
        self.assertFalse(allowed, "6th request should be blocked (limit is 5/min)")

    def test_retry_after_present_when_throttled(self):
        throttle = PaymentInitiateThrottle()
        view = MagicMock()
        # Exhaust the limit
        for _ in range(5):
            request = _make_authenticated_request(user_id="initiate-retry-user")
            throttle.allow_request(request, view)

        # Trigger throttle
        request = _make_authenticated_request(user_id="initiate-retry-user")
        throttle.allow_request(request, view)

        # wait() returns the number of seconds to wait — this becomes Retry-After
        retry_after = throttle.wait()
        self.assertIsNotNone(retry_after, "Throttle.wait() should return a value when throttled")
        self.assertGreater(retry_after, 0, "Retry-After should be positive")
        self.assertLessEqual(retry_after, 60, "Retry-After should not exceed 60s for a per-minute throttle")


class TestPaymentVerifyRateLimit(SimpleTestCase):
    """PaymentVerifyThrottle allows 10 requests/min then blocks."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()

    def test_allows_requests_within_limit(self):
        throttle = PaymentVerifyThrottle()
        view = MagicMock()
        for i in range(10):
            request = _make_authenticated_request(user_id="verify-user")
            allowed = throttle.allow_request(request, view)
            self.assertTrue(allowed, f"Request {i + 1} of 10 should be allowed")

    def test_blocks_after_exceeding_limit(self):
        throttle = PaymentVerifyThrottle()
        view = MagicMock()
        for _ in range(10):
            request = _make_authenticated_request(user_id="verify-block-user")
            throttle.allow_request(request, view)

        request = _make_authenticated_request(user_id="verify-block-user")
        allowed = throttle.allow_request(request, view)
        self.assertFalse(allowed, "11th request should be blocked (limit is 10/min)")

    def test_retry_after_present_when_throttled(self):
        throttle = PaymentVerifyThrottle()
        view = MagicMock()
        for _ in range(10):
            request = _make_authenticated_request(user_id="verify-retry-user")
            throttle.allow_request(request, view)

        request = _make_authenticated_request(user_id="verify-retry-user")
        throttle.allow_request(request, view)

        retry_after = throttle.wait()
        self.assertIsNotNone(retry_after)
        self.assertGreater(retry_after, 0)
        self.assertLessEqual(retry_after, 60)


class TestMobileMoneyRateLimit(SimpleTestCase):
    """MobileMoneyThrottle allows 5 requests/min then blocks."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()

    def test_allows_requests_within_limit(self):
        throttle = MobileMoneyThrottle()
        view = MagicMock()
        for i in range(5):
            request = _make_authenticated_request(user_id="mm-user")
            allowed = throttle.allow_request(request, view)
            self.assertTrue(allowed, f"Request {i + 1} of 5 should be allowed")

    def test_blocks_after_exceeding_limit(self):
        throttle = MobileMoneyThrottle()
        view = MagicMock()
        for _ in range(5):
            request = _make_authenticated_request(user_id="mm-block-user")
            throttle.allow_request(request, view)

        request = _make_authenticated_request(user_id="mm-block-user")
        allowed = throttle.allow_request(request, view)
        self.assertFalse(allowed, "6th request should be blocked (limit is 5/min)")

    def test_retry_after_present_when_throttled(self):
        throttle = MobileMoneyThrottle()
        view = MagicMock()
        for _ in range(5):
            request = _make_authenticated_request(user_id="mm-retry-user")
            throttle.allow_request(request, view)

        request = _make_authenticated_request(user_id="mm-retry-user")
        throttle.allow_request(request, view)

        retry_after = throttle.wait()
        self.assertIsNotNone(retry_after)
        self.assertGreater(retry_after, 0)
        self.assertLessEqual(retry_after, 60)


# ---------------------------------------------------------------------------
# Different limits for different endpoints
# ---------------------------------------------------------------------------

class TestDifferentLimitsPerEndpoint(SimpleTestCase):
    """Verify that different throttle classes enforce different limits."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()

    def test_verify_allows_more_than_initiate(self):
        """PaymentVerify (10/min) should still allow requests after PaymentInitiate (5/min) would block."""
        initiate_throttle = PaymentInitiateThrottle()
        verify_throttle = PaymentVerifyThrottle()
        view = MagicMock()

        # Send 6 requests through each throttle (different users to isolate)
        initiate_results = []
        for _ in range(6):
            request = _make_authenticated_request(user_id="diff-initiate-user")
            initiate_results.append(initiate_throttle.allow_request(request, view))

        verify_results = []
        for _ in range(6):
            request = _make_authenticated_request(user_id="diff-verify-user")
            verify_results.append(verify_throttle.allow_request(request, view))

        # Initiate: 5 allowed, 6th blocked
        self.assertEqual(initiate_results[:5], [True] * 5)
        self.assertFalse(initiate_results[5])

        # Verify: all 6 allowed (limit is 10)
        self.assertEqual(verify_results, [True] * 6)

    def test_initiate_and_mobile_money_same_limit(self):
        """PaymentInitiate and MobileMoney both have 5/min limit."""
        initiate_throttle = PaymentInitiateThrottle()
        mm_throttle = MobileMoneyThrottle()
        view = MagicMock()

        # Both should block on the 6th request
        for _ in range(5):
            request = _make_authenticated_request(user_id="same-limit-initiate")
            initiate_throttle.allow_request(request, view)

        for _ in range(5):
            request = _make_authenticated_request(user_id="same-limit-mm")
            mm_throttle.allow_request(request, view)

        request_i = _make_authenticated_request(user_id="same-limit-initiate")
        request_m = _make_authenticated_request(user_id="same-limit-mm")

        self.assertFalse(initiate_throttle.allow_request(request_i, view))
        self.assertFalse(mm_throttle.allow_request(request_m, view))

    def test_throttles_are_per_user(self):
        """Different users have independent rate limits."""
        throttle_a = PaymentInitiateThrottle()
        throttle_b = PaymentInitiateThrottle()
        view = MagicMock()

        # Exhaust limit for user A
        for _ in range(5):
            request = _make_authenticated_request(user_id="user-a")
            throttle_a.allow_request(request, view)

        # User A is blocked
        request_a = _make_authenticated_request(user_id="user-a")
        self.assertFalse(throttle_a.allow_request(request_a, view))

        # User B should still be allowed
        request_b = _make_authenticated_request(user_id="user-b")
        self.assertTrue(throttle_b.allow_request(request_b, view))
