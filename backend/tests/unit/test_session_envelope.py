"""Tests for SessionView envelope format (Phase 1 fix)."""
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from apps.accounts.views import SessionView

factory = APIRequestFactory()


class TestSessionEnvelope(SimpleTestCase):
    def test_unauthenticated_returns_envelope_with_null_data(self):
        request = factory.get("/api/v1/auth/session/")
        request.user = MagicMock(is_authenticated=False)
        response = SessionView().get(request)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        self.assertIsNone(response.data["data"])

    @patch("apps.accounts.views._has_recent_csrf_token", return_value=True)
    def test_authenticated_returns_envelope_with_user_data(self, _mock_csrf):
        request = factory.get("/api/v1/auth/session/")
        request.user = MagicMock(
            is_authenticated=True,
            id="user-1",
            email="test@example.com",
            first_name="Test",
            last_name="User",
            role="student",
        )
        request.GET = {}
        request.query_params = {}
        response = SessionView().get(request)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        data = response.data["data"]
        self.assertEqual(data["id"], "user-1")
        self.assertEqual(data["email"], "test@example.com")
        self.assertEqual(data["role"], "student")

    @patch("apps.accounts.views._generate_csrf_token", return_value="fresh-csrf")
    @patch("apps.accounts.views._has_recent_csrf_token", return_value=False)
    def test_refresh_csrf_returns_header(self, _mock_recent, _mock_gen):
        request = factory.get("/api/v1/auth/session/?refresh_csrf=1")
        request.user = MagicMock(
            is_authenticated=True,
            id="user-1",
            email="test@example.com",
            first_name="Test",
            last_name="User",
            role="student",
        )
        request.GET = {"refresh_csrf": "1"}
        request.query_params = {"refresh_csrf": "1"}
        response = SessionView().get(request)
        self.assertEqual(response["X-CSRF-Token"], "fresh-csrf")
