"""Tests for PaymentVerifyView throttle hardening."""
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from django.test import SimpleTestCase

from apps.common.throttling import PaymentUserScopedRateThrottle
from apps.documents.payment_query_views import PaymentVerifyView
from apps.documents.throttles import PaymentVerifyThrottle


class TestPaymentVerifyThrottle(SimpleTestCase):
    def test_throttle_class_exists(self):
        self.assertEqual(PaymentVerifyThrottle.scope, "payment_verify")

    def test_verify_view_uses_hardened_scoped_throttle(self):
        self.assertIn(PaymentUserScopedRateThrottle, PaymentVerifyView.throttle_classes)
