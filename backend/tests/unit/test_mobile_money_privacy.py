"""Tests for mobile money phone PII masking (Phase 4 fix)."""
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from django.test import SimpleTestCase

from apps.documents.mobile_money_views import MobileMoneyInitiateView
from apps.documents.payment_helpers import _normalize_phone_e164


class TestMobileMoneyPrivacy(SimpleTestCase):
    def test_mask_phone_standard(self):
        self.assertEqual(MobileMoneyInitiateView._mask_phone("+260977123456"), "*********3456")

    def test_mask_phone_short(self):
        self.assertEqual(MobileMoneyInitiateView._mask_phone("1234"), "****")

    def test_mask_phone_nine_digits(self):
        self.assertEqual(MobileMoneyInitiateView._mask_phone("977123456"), "*****3456")

    def test_normalize_phone_e164_valid(self):
        self.assertEqual(_normalize_phone_e164("0977123456"), "+260977123456")
        self.assertEqual(_normalize_phone_e164("977123456"), "+260977123456")
        self.assertEqual(_normalize_phone_e164("+260977123456"), "+260977123456")

    def test_normalize_phone_e164_invalid_raises(self):
        with self.assertRaises(ValueError):
            _normalize_phone_e164("123")
        with self.assertRaises(ValueError):
            _normalize_phone_e164("")
        with self.assertRaises(ValueError):
            _normalize_phone_e164("abc")
