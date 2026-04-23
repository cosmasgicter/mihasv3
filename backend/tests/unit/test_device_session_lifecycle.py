"""Unit tests for device session lifecycle hardening."""

import os
from unittest.mock import MagicMock, patch

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

django.setup()

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from apps.accounts.authentication import JWTUser
from apps.accounts.session_views import SessionListView, SessionRevokeAllView
from apps.accounts.views import LoginView, RefreshView


factory = APIRequestFactory()


def _jwt_user(user_id="6e147ead-e34d-41e2-bc05-358a653ff633"):
    return JWTUser(
        {
            "user_id": user_id,
            "email": "user@example.com",
            "role": "student",
            "first_name": "Test",
            "last_name": "User",
            "token_type": "access",
        }
    )


class TestSessionListLifecycle(SimpleTestCase):
    @patch("apps.accounts.session_views.deactivate_stale_sessions")
    @patch("apps.accounts.session_views.DeviceSession.objects")
    def test_list_marks_current_session_and_returns_ip(self, mock_objects, mock_cleanup):
        current_hash = "current-refresh-hash"
        session = MagicMock()
        session.id = "2d4b6ee2-165a-42bd-a43f-ab9623e23aab"
        session.device_info = '{"browser":"Chrome"}'
        session.ip_address = "hashed-ip"
        session.last_activity = None
        session.created_at = None
        session.session_token = current_hash

        mock_qs = mock_objects.filter.return_value.filter.return_value.filter.return_value.order_by.return_value
        mock_qs.__getitem__ = lambda self, key: [session][key] if isinstance(key, slice) else [session][key]
        mock_qs.__len__ = lambda self: 1
        mock_qs.__iter__ = lambda self: iter([session])

        request = factory.get("/api/v1/sessions/")
        request.user = _jwt_user()
        request.COOKIES["refresh_token"] = "refresh-token"

        with patch("apps.accounts.session_views._hash_value", return_value=current_hash):
            response = SessionListView().get(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"][0]["ip_address"], "hashed-ip")
        self.assertTrue(response.data["data"][0]["is_current"])
        mock_cleanup.assert_called_once_with(str(request.user.id))


class TestSessionRevokeAllLifecycle(SimpleTestCase):
    @patch("apps.accounts.session_views.deactivate_stale_sessions")
    @patch("apps.accounts.session_views.DeviceSession.objects")
    def test_revoke_all_excludes_current_session(self, mock_objects, mock_cleanup):
        active_qs = mock_objects.filter.return_value.filter.return_value
        active_qs.exclude.return_value.update.return_value = 2

        request = factory.post("/api/v1/sessions/revoke-all/", {}, format="json")
        request.user = _jwt_user()
        request.COOKIES["refresh_token"] = "refresh-token"

        with patch("apps.accounts.session_views._hash_value", return_value="current-hash"):
            response = SessionRevokeAllView().post(request)

        self.assertEqual(response.status_code, 200)
        active_qs.exclude.assert_called_once_with(session_token="current-hash")
        active_qs.exclude.return_value.update.assert_called_once()
        mock_cleanup.assert_called_once_with(str(request.user.id))


class TestRefreshBackfillsDeviceSession(SimpleTestCase):
    @patch("apps.accounts.views._generate_csrf_token", return_value="csrf-token")
    @patch("apps.accounts.views._set_auth_cookies")
    @patch("apps.accounts.views.DeviceSession.objects.create")
    @patch("apps.accounts.views.DeviceSession.objects.filter")
    @patch("apps.accounts.views.rotate_tokens", return_value=("new-access", "new-refresh"))
    @patch("apps.accounts.views.Profile.objects.get")
    @patch("apps.accounts.views.verify_token", return_value={"user_id": "6e147ead-e34d-41e2-bc05-358a653ff633"})
    def test_refresh_creates_session_when_old_hash_not_found(
        self,
        mock_verify_token,
        mock_get_profile,
        mock_rotate_tokens,
        mock_filter,
        mock_create,
        mock_set_auth_cookies,
        mock_generate_csrf,
    ):
        user = MagicMock(
            id="6e147ead-e34d-41e2-bc05-358a653ff633",
            email="user@example.com",
            role="student",
            first_name="Test",
            last_name="User",
            is_active=True,
        )
        mock_get_profile.return_value = user
        mock_filter.return_value.update.return_value = 0

        request = factory.post("/api/v1/auth/refresh/", {}, format="json")
        request.COOKIES["refresh_token"] = "old-refresh"
        request.META["HTTP_USER_AGENT"] = "Mozilla/5.0"
        request.META["REMOTE_ADDR"] = "127.0.0.1"

        response = RefreshView().post(request)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(mock_create.called)
        self.assertIn("expires_at", mock_create.call_args.kwargs)
        self.assertTrue(mock_set_auth_cookies.called)
        self.assertTrue(mock_generate_csrf.called)


class TestLoginCreatesExpiringSession(SimpleTestCase):
    @patch("apps.accounts.views._generate_csrf_token", return_value="csrf-token")
    @patch("apps.accounts.views._set_auth_cookies")
    @patch("apps.accounts.views.DeviceSession.objects.create")
    @patch("apps.accounts.views.generate_refresh_token", return_value="refresh-token")
    @patch("apps.accounts.views.generate_access_token", return_value="access-token")
    @patch("apps.accounts.views.needs_rehash", return_value=False)
    @patch("apps.accounts.views.record_login_attempt")
    @patch("apps.accounts.views.verify_password", return_value=True)
    @patch("apps.accounts.views.Profile.objects.get")
    @patch("apps.accounts.views.check_login_attempts", return_value=None)
    def test_login_creates_session_with_expiry(
        self,
        mock_check_login_attempts,
        mock_get_user,
        mock_verify_password,
        mock_record_login_attempt,
        mock_needs_rehash,
        mock_generate_access_token,
        mock_generate_refresh_token,
        mock_create,
        mock_set_auth_cookies,
        mock_generate_csrf,
    ):
        user = MagicMock(
            id="6e147ead-e34d-41e2-bc05-358a653ff633",
            email="user@example.com",
            password_hash="hashed-password",
            role="student",
            first_name="Test",
            last_name="User",
        )
        mock_get_user.return_value = user

        request = factory.post(
            "/api/v1/auth/login/",
            {"email": "user@example.com", "password": "Password123!"},
            format="json",
        )
        request.META["HTTP_USER_AGENT"] = "Mozilla/5.0"
        request.META["REMOTE_ADDR"] = "127.0.0.1"

        response = LoginView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        self.assertIn("expires_at", mock_create.call_args.kwargs)
        self.assertTrue(mock_set_auth_cookies.called)
        self.assertTrue(mock_generate_csrf.called)
