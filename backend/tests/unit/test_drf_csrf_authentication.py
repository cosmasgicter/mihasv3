import os
from unittest.mock import patch

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

django.setup()

from django.test import SimpleTestCase, override_settings
from rest_framework.exceptions import PermissionDenied
from rest_framework.test import APIRequestFactory

from apps.accounts.authentication import (
    CSRFPermissionDenied,
    JWTCookieAuthentication,
)


TEST_JWT_SETTINGS = {
    "SIGNING_KEY": "test-jwt-signing-key-for-unit-tests",
    "ALGORITHM": "HS256",
}


class TestDrfCsrfAuthentication(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.auth = JWTCookieAuthentication()

    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    @patch("apps.accounts.authentication.validate_csrf_token_for_user")
    @patch.object(JWTCookieAuthentication, "_decode_token")
    def test_cookie_post_enforces_csrf_after_jwt_auth(
        self,
        mock_decode_token,
        mock_validate_csrf,
    ):
        mock_decode_token.return_value = {
            "user_id": "user-1",
            "email": "user@example.com",
            "role": "student",
            "token_type": "access",
        }

        request = self.factory.post("/api/v1/applications/", {}, format="json")
        request.COOKIES["access_token"] = "cookie-token"
        request.META["HTTP_X_CSRF_TOKEN"] = "csrf-token"

        user, payload = self.auth.authenticate(request)

        self.assertEqual(user.id, "user-1")
        self.assertEqual(payload["user_id"], "user-1")
        mock_validate_csrf.assert_called_once_with("user-1", "csrf-token")

    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    @patch("apps.accounts.authentication.validate_csrf_token_for_user")
    @patch.object(JWTCookieAuthentication, "_decode_token")
    def test_cookie_post_enforces_csrf_for_payment_initiation(
        self,
        mock_decode_token,
        mock_validate_csrf,
    ):
        mock_decode_token.return_value = {
            "user_id": "user-1",
            "email": "user@example.com",
            "role": "student",
            "token_type": "access",
        }

        request = self.factory.post("/api/v1/payments/initiate/", {}, format="json")
        request.COOKIES["access_token"] = "cookie-token"
        request.META["HTTP_X_CSRF_TOKEN"] = "csrf-token"

        user, payload = self.auth.authenticate(request)

        self.assertEqual(user.id, "user-1")
        self.assertEqual(payload["user_id"], "user-1")
        mock_validate_csrf.assert_called_once_with("user-1", "csrf-token")

    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    @patch("apps.accounts.authentication.validate_csrf_token_for_user")
    @patch.object(JWTCookieAuthentication, "_decode_token")
    def test_cookie_post_enforces_csrf_for_payment_verification(
        self,
        mock_decode_token,
        mock_validate_csrf,
    ):
        mock_decode_token.return_value = {
            "user_id": "user-1",
            "email": "user@example.com",
            "role": "student",
            "token_type": "access",
        }

        request = self.factory.post("/api/v1/payments/123e4567-e89b-12d3-a456-426614174000/verify/", {}, format="json")
        request.COOKIES["access_token"] = "cookie-token"
        request.META["HTTP_X_CSRF_TOKEN"] = "csrf-token"

        user, payload = self.auth.authenticate(request)

        self.assertEqual(user.id, "user-1")
        self.assertEqual(payload["user_id"], "user-1")
        mock_validate_csrf.assert_called_once_with("user-1", "csrf-token")

    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    @patch.object(JWTCookieAuthentication, "_decode_token")
    def test_cookie_post_missing_csrf_raises_recoverable_permission_denied(
        self,
        mock_decode_token,
    ):
        mock_decode_token.return_value = {
            "user_id": "user-1",
            "email": "user@example.com",
            "role": "student",
            "token_type": "access",
        }

        request = self.factory.post("/api/v1/applications/", {}, format="json")
        request.COOKIES["access_token"] = "cookie-token"

        with self.assertRaises(CSRFPermissionDenied) as ctx:
            self.auth.authenticate(request)

        self.assertEqual(ctx.exception.get_codes(), "CSRF_MISSING")

    @override_settings(SIMPLE_JWT=TEST_JWT_SETTINGS)
    @patch("apps.accounts.authentication.validate_csrf_token_for_user")
    @patch.object(JWTCookieAuthentication, "_decode_token")
    def test_bearer_post_skips_csrf_validation(
        self,
        mock_decode_token,
        mock_validate_csrf,
    ):
        mock_decode_token.return_value = {
            "user_id": "user-1",
            "email": "user@example.com",
            "role": "student",
            "token_type": "access",
        }

        request = self.factory.post("/api/v1/applications/", {}, format="json")
        request.META["HTTP_AUTHORIZATION"] = "Bearer header-token"

        user, payload = self.auth.authenticate(request)

        self.assertEqual(user.id, "user-1")
        self.assertEqual(payload["user_id"], "user-1")
        mock_validate_csrf.assert_not_called()


class Test403CodePreservation(SimpleTestCase):
    def test_csrf_permission_denied_uses_explicit_code(self):
        exc = CSRFPermissionDenied(code="CSRF_INVALID")

        self.assertIsInstance(exc, PermissionDenied)
        self.assertEqual(exc.get_codes(), "CSRF_INVALID")
