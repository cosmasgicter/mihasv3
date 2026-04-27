"""Tests for mobile money phone PII masking (Phase 4 fix)."""
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from django.test import SimpleTestCase

from apps.documents.views import MobileMoneyInitiateView


class TestMobileMoneyPrivacy(SimpleTestCase):
    def test_mask_phone_standard(self):
        self.assertEqual(MobileMoneyInitiateView._mask_phone("+260977123456"), "*********3456")

    def test_mask_phone_short(self):
        self.assertEqual(MobileMoneyInitiateView._mask_phone("1234"), "****")

    def test_mask_phone_nine_digits(self):
        self.assertEqual(MobileMoneyInitiateView._mask_phone("977123456"), "*****3456")

    def test_normalize_phone_e164(self):
        self.assertEqual(MobileMoneyInitiateView._normalize_phone_e164("0977123456"), "+260977123456")
        self.assertEqual(MobileMoneyInitiateView._normalize_phone_e164("977123456"), "+260977123456")
        self.assertEqual(MobileMoneyInitiateView._normalize_phone_e164("+260977123456"), "+260977123456")
