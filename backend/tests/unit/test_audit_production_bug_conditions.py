"""Bug condition exploration tests for audit production fixes (Bugs 6, 7, 8).

These tests are EXPECTED TO FAIL on unfixed code — failure confirms the bugs exist.
DO NOT attempt to fix the tests or the code when they fail.

Validates: Requirements 1.12, 1.13, 1.14, 1.15, 1.16, 1.17
"""

import uuid
from unittest.mock import MagicMock, patch

from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.accounts.session_views import SessionListView
from apps.accounts.views import RefreshView
from apps.applications.public_views import ApplicationTrackView


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(user_id=None, role="student"):
    """Build a JWTUser for testing."""
    uid = user_id or uuid.uuid4()
    return JWTUser({
        "user_id": str(uid),
        "email": "test@example.com",
        "role": role,
        "first_name": "Test",
        "last_name": "User",
    })


def _auth_request(factory, method, path, user, **kwargs):
    """Build an authenticated request via APIRequestFactory + force_authenticate."""
    handler = getattr(factory, method.lower())
    request = handler(path, **kwargs)
    force_authenticate(request, user=user)
    return request


# ---------------------------------------------------------------------------
# Bug 6 — Sessions endpoint returns raw list instead of envelope
# Validates: Requirements 1.12
# ---------------------------------------------------------------------------


class TestBug6SessionsEnvelope:
    """GET /api/v1/sessions/ should return {"success": true, "data": [...]} envelope."""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = SessionListView.as_view()
        self.user = _make_user()

    @patch("apps.accounts.session_views.DeviceSession.objects")
    def test_sessions_response_has_envelope_format(self, mock_qs):
        """Bug 6: Response body must have 'success' and 'data' keys.

        On UNFIXED code this FAILS because response is a raw list.
        """
        mock_qs.filter.return_value.order_by.return_value = []

        request = _auth_request(
            self.factory, "get", "/api/v1/sessions/", self.user,
        )
        response = self.view(request)

        assert response.status_code == 200
        body = response.data
        # The response must be a dict with envelope keys, not a raw list
        assert isinstance(body, dict), f"Expected dict envelope, got {type(body).__name__}: {body}"
        assert "success" in body, f"Missing 'success' key in response: {body}"
        assert "data" in body, f"Missing 'data' key in response: {body}"
        assert body["success"] is True


# ---------------------------------------------------------------------------
# Bug 6b — Sessions empty user_id causes 500 instead of 401
# Validates: Requirements 1.13
# ---------------------------------------------------------------------------


class TestBug6bSessionsEmptyUserId:
    """GET /api/v1/sessions/ with empty/invalid user_id should return 401, not 500."""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = SessionListView.as_view()

    def test_empty_user_id_returns_401_not_500(self):
        """Bug 6b: Empty user_id must return 401, not cause a database error.

        On UNFIXED code this FAILS with a 500 database type mismatch error.
        """
        # Create a user with empty id to simulate edge case
        user = JWTUser({
            "user_id": "",
            "email": "test@example.com",
            "role": "student",
        })

        request = _auth_request(
            self.factory, "get", "/api/v1/sessions/", user,
        )
        response = self.view(request)

        # Should be 401 (authentication required), not 500 (server error)
        assert response.status_code == 401, (
            f"Expected 401 for empty user_id, got {response.status_code}: {response.data}"
        )


# ---------------------------------------------------------------------------
# Bug 7 — Refresh error code is INVALID_TOKEN instead of NO_REFRESH_TOKEN
# Validates: Requirements 1.14, 1.15
# ---------------------------------------------------------------------------


class TestBug7RefreshErrorCode:
    """POST /api/v1/auth/refresh/ without cookie should return NO_REFRESH_TOKEN code."""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = RefreshView.as_view()

    def test_missing_cookie_returns_no_refresh_token_code(self):
        """Bug 7: Missing refresh cookie must return code 'NO_REFRESH_TOKEN'.

        On UNFIXED code this FAILS because code is 'INVALID_TOKEN'.
        """
        request = self.factory.post("/api/v1/auth/refresh/")
        # No cookies set — simulates missing refresh_token cookie
        response = self.view(request)

        assert response.status_code == 401
        body = response.data
        assert body.get("code") == "NO_REFRESH_TOKEN", (
            f"Expected error code 'NO_REFRESH_TOKEN', got '{body.get('code')}'"
        )


# ---------------------------------------------------------------------------
# Bug 8 — Tracking format validation returns 404 instead of 400
# Validates: Requirements 1.16, 1.17
# ---------------------------------------------------------------------------


class TestBug8TrackingFormatValidation:
    """GET /api/v1/applications/track/?code=INVALID123 should return 400 with format guidance."""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = ApplicationTrackView.as_view()

    @patch("apps.applications.public_views.Application.objects")
    def test_invalid_format_code_returns_400_with_guidance(self, mock_qs):
        """Bug 8: Invalid format code must return 400 with format guidance.

        On UNFIXED code this FAILS because it returns 404 with generic message.
        """
        from apps.applications.models import Application
        mock_qs.get.side_effect = Application.DoesNotExist

        request = self.factory.get("/api/v1/applications/track/?code=INVALID123")
        response = self.view(request)

        # Should be 400 (bad format), not 404 (not found)
        assert response.status_code == 400, (
            f"Expected 400 for invalid format code, got {response.status_code}: {response.data}"
        )
        body = response.data
        assert "INVALID_FORMAT" in str(body.get("code", "")), (
            f"Expected error code containing 'INVALID_FORMAT', got '{body.get('code')}'"
        )


# ---------------------------------------------------------------------------
# Bug 8b — Tracking descriptive 404 message
# Validates: Requirements 1.16
# ---------------------------------------------------------------------------


class TestBug8bTrackingDescriptive404:
    """GET /api/v1/applications/track/ with valid-format non-existent code should return descriptive 404."""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = ApplicationTrackView.as_view()

    @patch("apps.applications.public_views.Application.objects")
    def test_valid_format_not_found_returns_descriptive_message(self, mock_qs):
        """Bug 8b: Valid-format code that doesn't exist must return descriptive 404.

        On UNFIXED code this FAILS because message is just 'Application not found'.
        """
        from apps.applications.models import Application
        mock_qs.get.side_effect = Application.DoesNotExist

        # Use a valid-format tracking code that doesn't exist
        request = self.factory.get("/api/v1/applications/track/?code=APP-20250101-ABCD1234")
        response = self.view(request)

        assert response.status_code == 404
        body = response.data
        error_msg = body.get("error", "")
        # The message should be more descriptive than just "Application not found"
        assert error_msg != "Application not found", (
            f"Expected descriptive 404 message, got generic: '{error_msg}'"
        )
        assert len(error_msg) > len("Application not found"), (
            f"Expected a more descriptive error message, got: '{error_msg}'"
        )
