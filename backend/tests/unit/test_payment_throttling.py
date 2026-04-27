"""Tests for PaymentVerifyView throttle class (Phase 4 fix)."""
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from django.test import SimpleTestCase

from apps.documents.views import PaymentVerifyThrottle, PaymentVerifyView


class TestPaymentVerifyThrottle(SimpleTestCase):
    def test_throttle_class_exists(self):
        self.assertEqual(PaymentVerifyThrottle.scope, "payment_verify")

    def test_verify_view_has_throttle(self):
        self.assertIn(PaymentVerifyThrottle, PaymentVerifyView.throttle_classes)
