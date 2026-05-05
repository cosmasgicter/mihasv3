"""Unit tests for auth endpoints that issue CSRF headers.

These tests cover the server-side CSRF reissue flow used by the frontend:
- RefreshView rotates auth cookies and returns a fresh X-CSRF-Token
- SessionView returns current user info and a fresh X-CSRF-Token
"""

import os
from unittest.mock import MagicMock, patch

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

django.setup()

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from apps.accounts.authentication import JWTUser
from apps.accounts.views import LogoutView, RefreshView, SessionView


factory = APIRequestFactory()


class TestSessionViewCsrfHeader(SimpleTestCase):
    """SessionView should reissue a CSRF token for 403 recovery."""

    def test_session_view_returns_unauthenticated_envelope_for_anonymous_request(self):
        request = factory.get("/api/v1/auth/session/")
        request.user = MagicMock(is_authenticated=False)

        response = SessionView().get(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"success": True, "data": {"authenticated": False}})
        self.assertNotIn("X-CSRF-Token", response)

    @patch("apps.accounts.views._generate_csrf_token", return_value="session-csrf-token")
    def test_session_view_returns_fresh_csrf_header(self, mock_generate_csrf):
        request = factory.get("/api/v1/auth/session/")
        request.user = MagicMock(
            id="user-1",
            email="user@example.com",
            first_name="Test",
            last_name="User",
            role="student",
            is_authenticated=True,
        )

        response = SessionView().get(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["X-CSRF-Token"], "session-csrf-token")
        mock_generate_csrf.assert_called_once_with(request.user)

    @patch("apps.accounts.views._has_recent_csrf_token", return_value=True)
    @patch("apps.accounts.views._generate_csrf_token", return_value="forced-csrf-token")
    def test_session_view_forces_csrf_header_for_recovery_requests(
        self,
        mock_generate_csrf,
        mock_has_recent,
    ):
        request = factory.get("/api/v1/auth/session/?refresh_csrf=1", HTTP_X_CSRF_RECOVERY="1")
        request.user = MagicMock(
            id="user-1",
            email="user@example.com",
            first_name="Test",
            last_name="User",
            role="student",
            is_authenticated=True,
        )

        response = SessionView().get(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["X-CSRF-Token"], "forced-csrf-token")
        mock_has_recent.assert_not_called()
        mock_generate_csrf.assert_called_once_with(request.user)

    @patch("apps.accounts.views.CSRFToken.objects.create")
    @patch("apps.accounts.views.Profile.objects.get")
    def test_session_view_accepts_jwt_user_when_reissuing_csrf_header(
        self, mock_get_profile, mock_create
    ):
        profile = MagicMock()
        profile.id = "user-1"
        mock_get_profile.return_value = profile

        request = factory.get("/api/v1/auth/session/")
        request.user = JWTUser(
            {
                "user_id": "user-1",
                "email": "user@example.com",
                "role": "student",
                "first_name": "Test",
                "last_name": "User",
                "token_type": "access",
            }
        )

        response = SessionView().get(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response["X-CSRF-Token"]), 64)
        mock_get_profile.assert_called_once_with(id="user-1")
        mock_create.assert_called_once()


class TestRefreshViewCsrfHeader(SimpleTestCase):
    """RefreshView should issue a fresh CSRF token after rotating tokens."""

    @patch("apps.accounts.views._generate_csrf_token", return_value="refresh-csrf-token")
    @patch("apps.accounts.views._set_auth_cookies")
    @patch("apps.accounts.views.DeviceSession.objects.filter")
    @patch("apps.accounts.views.rotate_tokens", return_value=("new-access", "new-refresh"))
    @patch("apps.accounts.views.Profile.objects.get")
    @patch("apps.accounts.views.verify_token", return_value={"user_id": "user-1"})
    def test_refresh_view_returns_fresh_csrf_header(
        self,
        mock_verify_token,
        mock_get_user,
        mock_rotate_tokens,
        mock_filter,
        mock_set_auth_cookies,
        mock_generate_csrf,
    ):
        user = MagicMock(id="user-1", is_active=True)
        mock_get_user.return_value = user

        request = factory.post("/api/v1/auth/refresh/", {}, format="json")
        request.COOKIES["refresh_token"] = "old-refresh-token"

        response = RefreshView().post(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["X-CSRF-Token"], "refresh-csrf-token")
        mock_verify_token.assert_called_once_with("old-refresh-token", token_type="refresh")
        mock_rotate_tokens.assert_called_once_with("old-refresh-token", user=user)
        mock_set_auth_cookies.assert_called_once()
        mock_filter.return_value.update.assert_called_once()
        mock_generate_csrf.assert_called_once_with(user)


class TestLogoutViewCsrfCleanup(SimpleTestCase):
    """LogoutView should delete CSRF rows for JWT-authenticated users."""

    @patch("apps.accounts.views.CSRFToken.objects.filter")
    def test_logout_view_filters_csrf_tokens_by_user_id_for_jwt_user(self, mock_filter):
        request = factory.post("/api/v1/auth/logout/", {}, format="json")
        request.user = JWTUser(
            {
                "user_id": "user-1",
                "email": "user@example.com",
                "role": "student",
                "token_type": "access",
            }
        )

        response = LogoutView().post(request)

        self.assertEqual(response.status_code, 200)
        mock_filter.assert_called_once_with(user_id="user-1")
        mock_filter.return_value.delete.assert_called_once()
