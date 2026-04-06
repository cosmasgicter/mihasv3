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

from apps.accounts.views import RefreshView, SessionView


factory = APIRequestFactory()


class TestSessionViewCsrfHeader(SimpleTestCase):
    """SessionView should reissue a CSRF token for 403 recovery."""

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
