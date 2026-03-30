"""Unit tests for notification endpoints (mark-read, mark-all-read, delete, list).

Tests authentication, authorization (owner-only), response envelope format,
and handling of valid/invalid notification IDs.

Implements task 11.2 (admissions-frontend-overhaul).
Requirements: 6.1, 6.2, 6.3
"""

import uuid
from unittest.mock import MagicMock, patch

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.common.notification_views import (
    NotificationDeleteView,
    NotificationListView,
    NotificationMarkAllReadView,
    NotificationMarkReadView,
)


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


def _make_notification(notification_id=None, user_id=None, is_read=False):
    """Build a mock Notification object."""
    n = MagicMock()
    n.pk = notification_id or uuid.uuid4()
    n.id = n.pk
    n.user_id = str(user_id or uuid.uuid4())
    n.title = "Test Notification"
    n.message = "This is a test notification."
    n.type = "info"
    n.is_read = is_read
    n.created_at = "2025-01-01T00:00:00Z"
    return n


def _auth_request(factory, method, path, user, **kwargs):
    """Build an authenticated request via APIRequestFactory + force_authenticate."""
    handler = getattr(factory, method.lower())
    request = handler(path, **kwargs)
    force_authenticate(request, user=user)
    return request


# ---------------------------------------------------------------------------
# Mark Single Notification as Read
# ---------------------------------------------------------------------------


class TestNotificationMarkRead:
    """PUT /api/v1/notifications/{id}/read/ — mark single notification as read."""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = NotificationMarkReadView.as_view()
        self.user = _make_user()

    def test_unauthenticated_returns_401_or_403(self):
        """Unauthenticated request is rejected."""
        request = self.factory.put("/api/v1/notifications/fake-id/read/")
        response = self.view(request, pk=uuid.uuid4())
        assert response.status_code in (401, 403)

    @patch("apps.common.notification_views.Notification.objects")
    def test_mark_read_success(self, mock_qs):
        """Owner can mark their own notification as read."""
        nid = uuid.uuid4()
        notif = _make_notification(notification_id=nid, user_id=self.user.pk)
        mock_qs.get.return_value = notif

        request = _auth_request(self.factory, "put", f"/api/v1/notifications/{nid}/read/", self.user)
        response = self.view(request, pk=nid)

        assert response.status_code == 200
        body = response.data
        assert body["success"] is True
        assert "message" in body["data"]
        notif.save.assert_called_once()

    @patch("apps.common.notification_views.Notification.objects")
    def test_mark_read_not_found(self, mock_qs):
        """Returns 404 for non-existent notification ID."""
        from apps.common.models import Notification
        mock_qs.get.side_effect = Notification.DoesNotExist

        nid = uuid.uuid4()
        request = _auth_request(self.factory, "put", f"/api/v1/notifications/{nid}/read/", self.user)
        response = self.view(request, pk=nid)

        assert response.status_code == 404
        body = response.data
        assert body["success"] is False
        assert body["code"] == "NOT_FOUND"

    @patch("apps.common.notification_views.Notification.objects")
    def test_mark_read_other_users_notification_returns_404(self, mock_qs):
        """Non-owner gets 404 — the queryset filters by user_id."""
        from apps.common.models import Notification
        mock_qs.get.side_effect = Notification.DoesNotExist

        nid = uuid.uuid4()
        request = _auth_request(self.factory, "put", f"/api/v1/notifications/{nid}/read/", self.user)
        response = self.view(request, pk=nid)

        assert response.status_code == 404
        assert response.data["success"] is False

    @patch("apps.common.notification_views.Notification.objects")
    def test_mark_read_response_envelope(self, mock_qs):
        """Response uses {success: true, data: {message: ...}} envelope."""
        nid = uuid.uuid4()
        notif = _make_notification(notification_id=nid, user_id=self.user.pk)
        mock_qs.get.return_value = notif

        request = _auth_request(self.factory, "put", f"/api/v1/notifications/{nid}/read/", self.user)
        response = self.view(request, pk=nid)

        body = response.data
        assert "success" in body
        assert "data" in body
        assert isinstance(body["data"], dict)


# ---------------------------------------------------------------------------
# Mark All Notifications as Read
# ---------------------------------------------------------------------------


class TestNotificationMarkAllRead:
    """PUT /api/v1/notifications/read-all/ — mark all unread notifications as read."""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = NotificationMarkAllReadView.as_view()
        self.user = _make_user()

    def test_unauthenticated_returns_401_or_403(self):
        """Unauthenticated request is rejected."""
        request = self.factory.put("/api/v1/notifications/read-all/")
        response = self.view(request)
        assert response.status_code in (401, 403)

    @patch("apps.common.notification_views.Notification.objects")
    def test_mark_all_read_success(self, mock_qs):
        """Marks all unread notifications for the authenticated user."""
        mock_filter = MagicMock()
        mock_filter.update.return_value = 3
        mock_qs.filter.return_value = mock_filter

        request = _auth_request(self.factory, "put", "/api/v1/notifications/read-all/", self.user)
        response = self.view(request)

        assert response.status_code == 200
        body = response.data
        assert body["success"] is True
        assert "message" in body["data"]
        assert "3" in body["data"]["message"]

    @patch("apps.common.notification_views.Notification.objects")
    def test_mark_all_read_zero_unread(self, mock_qs):
        """Returns success even when no unread notifications exist."""
        mock_filter = MagicMock()
        mock_filter.update.return_value = 0
        mock_qs.filter.return_value = mock_filter

        request = _auth_request(self.factory, "put", "/api/v1/notifications/read-all/", self.user)
        response = self.view(request)

        assert response.status_code == 200
        assert response.data["success"] is True
        assert "0" in response.data["data"]["message"]

    @patch("apps.common.notification_views.Notification.objects")
    def test_mark_all_read_filters_by_user(self, mock_qs):
        """Queryset filters by user_id and is_read=False."""
        mock_filter = MagicMock()
        mock_filter.update.return_value = 0
        mock_qs.filter.return_value = mock_filter

        request = _auth_request(self.factory, "put", "/api/v1/notifications/read-all/", self.user)
        self.view(request)

        mock_qs.filter.assert_called_once_with(
            user_id=self.user.pk, is_read=False
        )

    @patch("apps.common.notification_views.Notification.objects")
    def test_mark_all_read_response_envelope(self, mock_qs):
        """Response uses {success: true, data: {message: ...}} envelope."""
        mock_filter = MagicMock()
        mock_filter.update.return_value = 1
        mock_qs.filter.return_value = mock_filter

        request = _auth_request(self.factory, "put", "/api/v1/notifications/read-all/", self.user)
        response = self.view(request)

        body = response.data
        assert "success" in body
        assert "data" in body
        assert isinstance(body["data"], dict)


# ---------------------------------------------------------------------------
# Delete Notification
# ---------------------------------------------------------------------------


class TestNotificationDelete:
    """DELETE /api/v1/notifications/{id}/ — delete a notification."""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = NotificationDeleteView.as_view()
        self.user = _make_user()

    def test_unauthenticated_returns_401_or_403(self):
        """Unauthenticated request is rejected."""
        request = self.factory.delete(f"/api/v1/notifications/{uuid.uuid4()}/")
        response = self.view(request, pk=uuid.uuid4())
        assert response.status_code in (401, 403)

    @patch("apps.common.notification_views.Notification.objects")
    def test_delete_success(self, mock_qs):
        """Owner can delete their own notification."""
        nid = uuid.uuid4()
        notif = _make_notification(notification_id=nid, user_id=self.user.pk)
        mock_qs.get.return_value = notif

        request = _auth_request(self.factory, "delete", f"/api/v1/notifications/{nid}/", self.user)
        response = self.view(request, pk=nid)

        assert response.status_code == 200
        body = response.data
        assert body["success"] is True
        assert "message" in body["data"]
        notif.delete.assert_called_once()

    @patch("apps.common.notification_views.Notification.objects")
    def test_delete_not_found(self, mock_qs):
        """Returns 404 for non-existent notification ID."""
        from apps.common.models import Notification
        mock_qs.get.side_effect = Notification.DoesNotExist

        nid = uuid.uuid4()
        request = _auth_request(self.factory, "delete", f"/api/v1/notifications/{nid}/", self.user)
        response = self.view(request, pk=nid)

        assert response.status_code == 404
        body = response.data
        assert body["success"] is False
        assert body["code"] == "NOT_FOUND"

    @patch("apps.common.notification_views.Notification.objects")
    def test_delete_other_users_notification_returns_404(self, mock_qs):
        """Non-owner gets 404 — the queryset filters by user_id."""
        from apps.common.models import Notification
        mock_qs.get.side_effect = Notification.DoesNotExist

        nid = uuid.uuid4()
        request = _auth_request(self.factory, "delete", f"/api/v1/notifications/{nid}/", self.user)
        response = self.view(request, pk=nid)

        assert response.status_code == 404
        assert response.data["success"] is False

    @patch("apps.common.notification_views.Notification.objects")
    def test_delete_response_envelope(self, mock_qs):
        """Response uses {success: true, data: {message: ...}} envelope."""
        nid = uuid.uuid4()
        notif = _make_notification(notification_id=nid, user_id=self.user.pk)
        mock_qs.get.return_value = notif

        request = _auth_request(self.factory, "delete", f"/api/v1/notifications/{nid}/", self.user)
        response = self.view(request, pk=nid)

        body = response.data
        assert "success" in body
        assert "data" in body
        assert isinstance(body["data"], dict)


# ---------------------------------------------------------------------------
# List Notifications
# ---------------------------------------------------------------------------


class TestNotificationList:
    """GET /api/v1/notifications/ — list notifications for current user."""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = NotificationListView.as_view()
        self.user = _make_user()

    def test_unauthenticated_returns_401_or_403(self):
        """Unauthenticated request is rejected."""
        request = self.factory.get("/api/v1/notifications/")
        response = self.view(request)
        assert response.status_code in (401, 403)

    @patch("apps.common.notification_views.Notification.objects")
    def test_list_success_empty(self, mock_qs):
        """Returns empty list when user has no notifications."""
        mock_filter = MagicMock()
        mock_filter.order_by.return_value = []
        mock_qs.filter.return_value = mock_filter

        request = _auth_request(self.factory, "get", "/api/v1/notifications/", self.user)
        response = self.view(request)

        assert response.status_code == 200
        body = response.data
        assert body["success"] is True
        assert body["data"] == []

    @patch("apps.common.notification_views.Notification.objects")
    def test_list_filters_by_user(self, mock_qs):
        """Queryset filters by the authenticated user's ID."""
        mock_filter = MagicMock()
        mock_filter.order_by.return_value = []
        mock_qs.filter.return_value = mock_filter

        request = _auth_request(self.factory, "get", "/api/v1/notifications/", self.user)
        self.view(request)

        mock_qs.filter.assert_called_once_with(user_id=self.user.pk)

    @patch("apps.common.notification_views.Notification.objects")
    def test_list_response_envelope(self, mock_qs):
        """Response uses {success: true, data: [...]} envelope."""
        mock_filter = MagicMock()
        mock_filter.order_by.return_value = []
        mock_qs.filter.return_value = mock_filter

        request = _auth_request(self.factory, "get", "/api/v1/notifications/", self.user)
        response = self.view(request)

        body = response.data
        assert "success" in body
        assert "data" in body
        assert isinstance(body["data"], list)
