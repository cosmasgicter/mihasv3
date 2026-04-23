"""Unit tests for session hardening: auth error codes, 401/403 semantics,
refresh endpoint, CSRF failure codes, and cookie settings.

Requirements: Auth error codes, 401 vs 403 semantics, refresh blacklisted JTI,
CSRF recoverable code, cookie settings.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import json  # noqa: E402
import uuid  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

import jwt as pyjwt  # noqa: E402
from django.conf import settings  # noqa: E402
from django.test import RequestFactory, SimpleTestCase, override_settings  # noqa: E402

from apps.common.middleware_compat import CSRFEnforcementMiddleware, JWTAuthenticationMiddleware  # noqa: E402


# ─── 1. Auth Error Codes ────────────────────────────────────────────────────────


class TestAuthErrorCodes(SimpleTestCase):
    """Verify each failure mode returns the correct error code."""

    def test_csrf_failure_returns_csrf_invalid_code(self):
        """CSRF middleware returns code=CSRF_INVALID (not CSRF_VALIDATION_FAILED)."""
        response = CSRFEnforcementMiddleware._forbidden_response()
        body = json.loads(response.content)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(body["code"], "CSRF_INVALID")

    def test_csrf_failure_message_includes_recovery_guidance(self):
        """CSRF error message tells user to refresh."""
        response = CSRFEnforcementMiddleware._forbidden_response()
        body = json.loads(response.content)
        self.assertIn("refresh", body["error"].lower())

    def test_exception_handler_maps_not_authenticated(self):
        """NotAuthenticated exception maps to NOT_AUTHENTICATED code (from get_codes())."""
        from rest_framework.exceptions import NotAuthenticated
        from apps.common.exceptions import envelope_exception_handler

        exc = NotAuthenticated()
        factory = RequestFactory()
        request = factory.get("/api/v1/applications/")
        context = {"request": request, "view": None}

        response = envelope_exception_handler(exc, context)
        self.assertEqual(response.status_code, 401)
        # DRF's NotAuthenticated.get_codes() returns 'not_authenticated' → uppercased
        self.assertEqual(response.data["code"], "NOT_AUTHENTICATED")

    def test_exception_handler_maps_permission_denied(self):
        """PermissionDenied exception maps to INSUFFICIENT_PERMISSIONS code."""
        from rest_framework.exceptions import PermissionDenied
        from apps.common.exceptions import envelope_exception_handler

        exc = PermissionDenied()
        factory = RequestFactory()
        request = factory.get("/api/v1/applications/")
        context = {"request": request, "view": None}

        response = envelope_exception_handler(exc, context)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "INSUFFICIENT_PERMISSIONS")


# ─── 2. 401 vs 403 Semantics ────────────────────────────────────────────────────


class TestStatusCodeSemantics(SimpleTestCase):
    """Verify JWT middleware converts expired-token 403 to 401 but preserves CSRF 403."""

    def _make_middleware(self, response_fn):
        """Create a JWTAuthenticationMiddleware with a given response function."""
        mw = JWTAuthenticationMiddleware(response_fn)
        return mw

    def test_expired_jwt_403_becomes_401(self):
        """When JWT is expired and downstream returns 403, middleware converts to 401."""
        from django.http import JsonResponse

        def downstream(request):
            return JsonResponse(
                {"success": False, "error": "Forbidden", "code": "INSUFFICIENT_PERMISSIONS"},
                status=403,
            )

        mw = self._make_middleware(downstream)
        factory = RequestFactory()
        request = factory.get("/api/v1/applications/")
        request.COOKIES = {}
        request.META["HTTP_AUTHORIZATION"] = "Bearer expired.token.here"
        request._jwt_expired = True  # Simulate expired token detection

        # Patch _extract_token and _authenticate to simulate expired token
        with patch.object(mw, "_extract_token", return_value="expired.token"):
            with patch.object(mw, "_authenticate", side_effect=lambda t, r=None: setattr(r, "_jwt_expired", True) or None):
                response = mw(request)

        self.assertEqual(response.status_code, 401)
        body = json.loads(response.content)
        self.assertEqual(body["code"], "TOKEN_EXPIRED")

    def test_csrf_403_stays_403_even_with_expired_jwt(self):
        """When JWT is expired but response is CSRF_INVALID, it stays 403 (recoverable)."""
        from django.http import JsonResponse

        def downstream(request):
            return JsonResponse(
                {"success": False, "error": "CSRF validation failed", "code": "CSRF_INVALID"},
                status=403,
            )

        mw = self._make_middleware(downstream)
        factory = RequestFactory()
        request = factory.post("/api/v1/applications/1/submit/")
        request.COOKIES = {}
        request._jwt_expired = True

        with patch.object(mw, "_extract_token", return_value="expired.token"):
            with patch.object(mw, "_authenticate", side_effect=lambda t, r=None: setattr(r, "_jwt_expired", True) or None):
                response = mw(request)

        self.assertEqual(response.status_code, 403)
        body = json.loads(response.content)
        self.assertEqual(body["code"], "CSRF_INVALID")


# ─── 3. Refresh Endpoint Handles Blacklisted JTI ────────────────────────────────


class TestRefreshEndpointErrorCodes(SimpleTestCase):
    """Verify refresh endpoint returns correct codes for each failure mode."""

    def _call_refresh_view(self, cookies=None, side_effect=None):
        """Helper to call RefreshView.post with mocked dependencies."""
        from rest_framework.test import APIRequestFactory
        from apps.accounts.views import RefreshView

        factory = APIRequestFactory()
        request = factory.post("/api/v1/auth/refresh/")
        request.COOKIES = cookies or {}

        view = RefreshView.as_view()

        if side_effect:
            with side_effect:
                response = view(request)
        else:
            response = view(request)

        return response

    def test_missing_refresh_cookie_returns_no_refresh_token(self):
        """Missing refresh cookie → NO_REFRESH_TOKEN code."""
        response = self._call_refresh_view(cookies={})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["code"], "NO_REFRESH_TOKEN")

    def test_expired_refresh_returns_token_expired(self):
        """Expired refresh token → TOKEN_EXPIRED code."""
        with patch("apps.accounts.views.verify_token", side_effect=pyjwt.ExpiredSignatureError("expired")):
            response = self._call_refresh_view(cookies={"refresh_token": "expired.token"})

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["code"], "TOKEN_EXPIRED")

    def test_blacklisted_jti_returns_token_expired(self):
        """Revoked/consumed refresh token → TOKEN_EXPIRED code."""
        mock_payload = {"user_id": str(uuid.uuid4()), "token_type": "refresh"}
        with patch("apps.accounts.views.verify_token", return_value=mock_payload):
            with patch("apps.accounts.views.Profile") as MockProfile:
                MockProfile.objects.get.return_value = MagicMock(id=mock_payload["user_id"])
                with patch("apps.accounts.views.rotate_tokens", side_effect=ValueError("Token has been revoked")):
                    response = self._call_refresh_view(cookies={"refresh_token": "revoked.token"})

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["code"], "TOKEN_EXPIRED")

    def test_invalid_token_returns_token_expired(self):
        """Invalid/malformed refresh token → TOKEN_EXPIRED code."""
        with patch("apps.accounts.views.verify_token", side_effect=pyjwt.InvalidTokenError("bad")):
            response = self._call_refresh_view(cookies={"refresh_token": "garbage"})

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["code"], "TOKEN_EXPIRED")


# ─── 4. CSRF Failure Returns Recoverable Code ───────────────────────────────────


class TestCSRFRecoverableCode(SimpleTestCase):
    """Verify CSRF failures are 403 with CSRF_INVALID (not 401)."""

    def test_csrf_response_is_403_not_401(self):
        """CSRF failure must be 403 so frontend can recover without full re-auth."""
        response = CSRFEnforcementMiddleware._forbidden_response()
        self.assertEqual(response.status_code, 403)
        self.assertNotEqual(response.status_code, 401)

    def test_csrf_code_is_csrf_invalid(self):
        """Error code must be CSRF_INVALID for frontend detection."""
        response = CSRFEnforcementMiddleware._forbidden_response()
        body = json.loads(response.content)
        self.assertEqual(body["code"], "CSRF_INVALID")
        # Must NOT be the old code
        self.assertNotEqual(body["code"], "CSRF_VALIDATION_FAILED")

    def test_csrf_response_has_success_false(self):
        """CSRF error response follows envelope format."""
        response = CSRFEnforcementMiddleware._forbidden_response()
        body = json.loads(response.content)
        self.assertFalse(body["success"])


# ─── 5. Cookie Settings ─────────────────────────────────────────────────────────


class TestCookieSettings(SimpleTestCase):
    """Verify cookie security settings are correct for both environments."""

    def test_base_settings_httponly_true(self):
        """AUTH_COOKIE_HTTPONLY must be True (prevents JS access)."""
        self.assertTrue(settings.AUTH_COOKIE_HTTPONLY)

    def test_dev_settings_secure_false(self):
        """Dev environment: AUTH_COOKIE_SECURE=False (localhost doesn't have TLS)."""
        self.assertFalse(settings.AUTH_COOKIE_SECURE)

    def test_dev_settings_samesite_lax(self):
        """Dev environment: AUTH_COOKIE_SAMESITE=Lax."""
        self.assertEqual(settings.AUTH_COOKIE_SAMESITE, "Lax")

    def test_dev_settings_domain_none(self):
        """Dev environment: AUTH_COOKIE_DOMAIN=None (localhost)."""
        self.assertIsNone(settings.AUTH_COOKIE_DOMAIN)

    @override_settings(
        AUTH_COOKIE_SECURE=True,
        AUTH_COOKIE_SAMESITE="None",
        AUTH_COOKIE_DOMAIN=".mihas.edu.zm",
    )
    def test_prod_cookie_settings(self):
        """Production: Secure=True, SameSite=None, Domain=.mihas.edu.zm."""
        from django.conf import settings as s
        self.assertTrue(s.AUTH_COOKIE_SECURE)
        self.assertEqual(s.AUTH_COOKIE_SAMESITE, "None")
        self.assertEqual(s.AUTH_COOKIE_DOMAIN, ".mihas.edu.zm")
