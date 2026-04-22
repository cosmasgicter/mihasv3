"""Preservation tests for audit production fixes.

These tests MUST PASS on unfixed code — they verify existing correct behavior
that must not regress when fixes are applied.

Validates: Requirements 3.15, 3.16, 3.17, 3.18, 3.19
"""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.accounts.session_views import SessionListView, SessionRevokeView
from apps.accounts.views import RefreshView
from apps.applications.views import ApplicationTrackView


# ---------------------------------------------------------------------------
# Helpers (reused from test_audit_production_bug_conditions.py)
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
# Preservation: Sessions data shape (Requirement 3.15)
# ---------------------------------------------------------------------------


class TestPreservationSessionsDataShape:
    """GET /api/v1/sessions/ returns session objects with expected fields."""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = SessionListView.as_view()
        self.user = _make_user()

    @patch("apps.accounts.session_views.DeviceSession.objects")
    def test_sessions_contain_expected_fields(self, mock_qs):
        """Preservation: Session objects must include id, device_info, last_active, created_at.

        Validates: Requirements 3.15
        """
        now = datetime.now(timezone.utc)
        mock_session = MagicMock()
        mock_session.id = uuid.uuid4()
        mock_session.device_info = '{"user_agent": "Mozilla/5.0"}'
        mock_session.last_activity = now
        mock_session.created_at = now - timedelta(hours=1)

        mock_qs.filter.return_value.order_by.return_value = [mock_session]

        request = _auth_request(self.factory, "get", "/api/v1/sessions/", self.user)
        response = self.view(request)

        assert response.status_code == 200

        # The response data may be a list (current unfixed) or dict envelope (fixed).
        # For preservation, we check the session objects have the right fields.
        if isinstance(response.data, dict) and "data" in response.data:
            sessions = response.data["data"]
        else:
            sessions = response.data

        assert len(sessions) == 1
        session = sessions[0]
        assert "id" in session, f"Missing 'id' field in session: {session}"
        assert "device_info" in session, f"Missing 'device_info' field in session: {session}"
        assert "last_active" in session, f"Missing 'last_active' field in session: {session}"
        assert "created_at" in session, f"Missing 'created_at' field in session: {session}"
        assert session["device_info"] == '{"user_agent": "Mozilla/5.0"}'


# ---------------------------------------------------------------------------
# Preservation: Session revoke (Requirement 3.16)
# ---------------------------------------------------------------------------


class TestPreservationSessionRevoke:
    """POST /api/v1/sessions/{id}/revoke/ deactivates the session."""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = SessionRevokeView.as_view()
        self.user = _make_user()

    @patch("apps.accounts.session_views._try_blacklist_refresh_for_session")
    @patch("apps.accounts.session_views.DeviceSession.objects")
    def test_session_revoke_deactivates_session(self, mock_qs, mock_blacklist):
        """Preservation: Revoking a session sets is_active=False.

        Validates: Requirements 3.16
        """
        session_id = uuid.uuid4()
        mock_session = MagicMock()
        mock_session.id = session_id
        mock_session.is_active = True
        mock_session.save = MagicMock()

        mock_qs.get.return_value = mock_session

        request = _auth_request(
            self.factory, "post", f"/api/v1/sessions/{session_id}/revoke/", self.user,
        )
        response = self.view(request, session_id=str(session_id))

        assert response.status_code == 200
        # Verify the session was deactivated
        assert mock_session.is_active is False
        mock_session.save.assert_called_once_with(update_fields=["is_active"])


# ---------------------------------------------------------------------------
# Preservation: Refresh valid token (Requirement 3.17)
# ---------------------------------------------------------------------------


class TestPreservationRefreshValidToken:
    """POST /api/v1/auth/refresh/ with valid refresh cookie returns 200."""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = RefreshView.as_view()

    @patch("apps.accounts.views.DeviceSession.objects")
    @patch("apps.accounts.views._generate_csrf_token", return_value="csrf-test-token")
    @patch("apps.accounts.views.rotate_tokens")
    @patch("apps.accounts.views.verify_token")
    @patch("apps.accounts.views.Profile.objects")
    def test_valid_refresh_returns_200_with_cookies(
        self, mock_profile_qs, mock_verify, mock_rotate, mock_csrf, mock_device_qs,
    ):
        """Preservation: Valid refresh token rotates and returns 200.

        Validates: Requirements 3.17
        """
        user_id = uuid.uuid4()
        mock_user = MagicMock()
        mock_user.id = user_id
        mock_user.email = "test@example.com"
        mock_user.role = "student"
        mock_user.first_name = "Test"
        mock_user.last_name = "User"

        mock_verify.return_value = {"user_id": str(user_id), "token_type": "refresh"}
        mock_profile_qs.get.return_value = mock_user
        mock_rotate.return_value = ("new-access-token", "new-refresh-token")
        mock_device_qs.filter.return_value.update.return_value = 1

        request = self.factory.post("/api/v1/auth/refresh/")
        request.COOKIES["refresh_token"] = "valid-refresh-token"
        response = self.view(request)

        assert response.status_code == 200, (
            f"Expected 200 for valid refresh, got {response.status_code}: {response.data}"
        )
        body = response.data
        assert body.get("success") is True
        # Verify cookies are set on the response
        assert "access_token" in response.cookies or "Set-Cookie" in str(response)


# ---------------------------------------------------------------------------
# Preservation: Tracking valid code (Requirement 3.19)
# ---------------------------------------------------------------------------


class TestPreservationTrackingValidCode:
    """GET /api/v1/applications/track/?code=<valid> returns tracking data."""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = ApplicationTrackView.as_view()

    @patch("apps.applications.public_views.Application.objects")
    def test_valid_code_returns_tracking_data(self, mock_qs):
        """Preservation: Valid tracking code returns application tracking data.

        Validates: Requirements 3.19
        """
        mock_app = MagicMock()
        mock_app.application_number = "APP-20250101-ABCD1234"
        mock_app.public_tracking_code = "TRK-ABCDEF123456"
        mock_app.status = "submitted"
        mock_app.payment_status = "paid"
        mock_app.program = "Computer Science"
        mock_app.intake = "January 2026"
        mock_app.created_at = datetime.now(timezone.utc)
        mock_app.submitted_at = datetime.now(timezone.utc)

        mock_qs.get.return_value = mock_app

        request = self.factory.get("/api/v1/applications/track/?code=TRK-ABCDEF123456")
        response = self.view(request)

        assert response.status_code == 200, (
            f"Expected 200 for valid tracking code, got {response.status_code}: {response.data}"
        )
        body = response.data
        assert "application_number" in body or "status" in body, (
            f"Expected tracking data in response, got: {body}"
        )


# ---------------------------------------------------------------------------
# Preservation: Tracking missing code (Requirement 3.18)
# ---------------------------------------------------------------------------


class TestPreservationTrackingMissingCode:
    """GET /api/v1/applications/track/ without code returns 400."""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = ApplicationTrackView.as_view()

    def test_missing_code_returns_400(self):
        """Preservation: Missing code parameter returns 400.

        Validates: Requirements 3.18
        """
        request = self.factory.get("/api/v1/applications/track/")
        response = self.view(request)

        assert response.status_code == 400, (
            f"Expected 400 for missing code, got {response.status_code}: {response.data}"
        )
        body = response.data
        error_msg = body.get("error", "")
        assert "required" in error_msg.lower() or "tracking" in error_msg.lower(), (
            f"Expected error about missing code, got: '{error_msg}'"
        )
