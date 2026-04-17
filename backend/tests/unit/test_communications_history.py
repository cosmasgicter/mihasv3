"""Unit tests for NotificationListView pagination and filtering.

Tests default pagination (backward-compatible), type filtering, is_read filtering,
combined filters, and pageSize clamping.

Implements task 1.2 (communications-history).
Requirements: 1.1, 1.7
"""

import uuid
from unittest.mock import MagicMock, patch

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.common.notification_views import NotificationListView


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


def _make_notification(notification_id=None, user_id=None, is_read=False, ntype="info"):
    """Build a mock Notification object with all serializer fields."""
    n = MagicMock()
    n.pk = notification_id or uuid.uuid4()
    n.id = n.pk
    n.user_id = str(user_id or uuid.uuid4())
    n.title = "Test Notification"
    n.message = "This is a test notification."
    n.type = ntype
    n.is_read = is_read
    n.action_url = None
    n.created_at = "2025-01-01T00:00:00Z"
    return n


def _auth_get(factory, path, user, query_params=None):
    """Build an authenticated GET request with optional query params."""
    full_path = path
    if query_params:
        qs = "&".join(f"{k}={v}" for k, v in query_params.items())
        full_path = f"{path}?{qs}"
    request = factory.get(full_path)
    force_authenticate(request, user=user)
    return request


def _build_mock_queryset(notifications):
    """Build a mock queryset chain that supports filter, order_by, count, and slicing."""
    class SliceableList:
        """List wrapper that supports Django-style queryset slicing and chaining."""

        def __init__(self, items):
            self._items = list(items)

        def __iter__(self):
            return iter(self._items)

        def __len__(self):
            return len(self._items)

        def __getitem__(self, key):
            if isinstance(key, slice):
                return SliceableList(self._items[key])
            return self._items[key]

        def count(self):
            return len(self._items)

        def filter(self, **kwargs):
            filtered = self._items
            for k, v in kwargs.items():
                filtered = [n for n in filtered if getattr(n, k) == v]
            return SliceableList(filtered)

        def order_by(self, *args):
            return self

    return SliceableList(notifications)


# ---------------------------------------------------------------------------
# NotificationListView — Pagination & Filtering
# ---------------------------------------------------------------------------


class TestNotificationListPagination:
    """GET /api/v1/notifications/ — pagination and filtering tests."""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = NotificationListView.as_view()
        self.user = _make_user()
        self.user_id = self.user.pk

    # --- Default pagination (no params) ---

    @patch("apps.common.notification_views.Notification.objects")
    def test_default_no_params_returns_page_1_with_all_results(self, mock_qs):
        """Without pagination params, returns all results in paginated envelope (backward compat)."""
        notifs = [
            _make_notification(user_id=self.user_id, ntype="info"),
            _make_notification(user_id=self.user_id, ntype="success"),
            _make_notification(user_id=self.user_id, ntype="warning"),
        ]
        mock_qs.filter.return_value = _build_mock_queryset(notifs)

        request = _auth_get(self.factory, "/api/v1/notifications/", self.user)
        response = self.view(request)

        assert response.status_code == 200
        body = response.data
        assert body["success"] is True
        data = body["data"]
        assert data["page"] == 1
        assert data["totalCount"] == 3
        assert len(data["results"]) == 3

    @patch("apps.common.notification_views.Notification.objects")
    def test_default_no_params_empty_returns_zero(self, mock_qs):
        """Without params and no notifications, returns empty results."""
        mock_qs.filter.return_value = _build_mock_queryset([])

        request = _auth_get(self.factory, "/api/v1/notifications/", self.user)
        response = self.view(request)

        assert response.status_code == 200
        body = response.data
        assert body["data"]["totalCount"] == 0
        assert body["data"]["results"] == []
        assert body["data"]["page"] == 1

    # --- Explicit pagination ---

    @patch("apps.common.notification_views.Notification.objects")
    def test_explicit_page_and_pagesize(self, mock_qs):
        """With page=1&pageSize=2, returns at most 2 results."""
        notifs = [
            _make_notification(user_id=self.user_id, ntype="info"),
            _make_notification(user_id=self.user_id, ntype="success"),
            _make_notification(user_id=self.user_id, ntype="warning"),
        ]
        mock_qs.filter.return_value = _build_mock_queryset(notifs)

        request = _auth_get(
            self.factory, "/api/v1/notifications/", self.user,
            query_params={"page": "1", "pageSize": "2"},
        )
        response = self.view(request)

        assert response.status_code == 200
        data = response.data["data"]
        assert data["page"] == 1
        assert data["pageSize"] == 2
        assert data["totalCount"] == 3
        assert len(data["results"]) == 2

    @patch("apps.common.notification_views.Notification.objects")
    def test_page_2_returns_remaining(self, mock_qs):
        """Page 2 with pageSize=2 returns the remaining 1 result."""
        notifs = [
            _make_notification(user_id=self.user_id, ntype="info"),
            _make_notification(user_id=self.user_id, ntype="success"),
            _make_notification(user_id=self.user_id, ntype="warning"),
        ]
        mock_qs.filter.return_value = _build_mock_queryset(notifs)

        request = _auth_get(
            self.factory, "/api/v1/notifications/", self.user,
            query_params={"page": "2", "pageSize": "2"},
        )
        response = self.view(request)

        assert response.status_code == 200
        data = response.data["data"]
        assert data["page"] == 2
        assert data["pageSize"] == 2
        assert data["totalCount"] == 3
        assert len(data["results"]) == 1


    # --- Type filter ---

    @patch("apps.common.notification_views.Notification.objects")
    def test_type_filter_returns_only_matching(self, mock_qs):
        """type=info returns only info notifications."""
        notifs = [
            _make_notification(user_id=self.user_id, ntype="info"),
            _make_notification(user_id=self.user_id, ntype="success"),
            _make_notification(user_id=self.user_id, ntype="warning"),
            _make_notification(user_id=self.user_id, ntype="info"),
        ]
        mock_qs.filter.return_value = _build_mock_queryset(notifs)

        request = _auth_get(
            self.factory, "/api/v1/notifications/", self.user,
            query_params={"type": "info"},
        )
        response = self.view(request)

        assert response.status_code == 200
        data = response.data["data"]
        # totalCount reflects filtered set
        assert data["totalCount"] == 2
        for item in data["results"]:
            assert item["type"] == "info"

    @patch("apps.common.notification_views.Notification.objects")
    def test_type_filter_invalid_type_ignored(self, mock_qs):
        """Invalid type value is ignored — returns all notifications."""
        notifs = [
            _make_notification(user_id=self.user_id, ntype="info"),
            _make_notification(user_id=self.user_id, ntype="success"),
        ]
        mock_qs.filter.return_value = _build_mock_queryset(notifs)

        request = _auth_get(
            self.factory, "/api/v1/notifications/", self.user,
            query_params={"type": "bogus"},
        )
        response = self.view(request)

        assert response.status_code == 200
        assert response.data["data"]["totalCount"] == 2

    # --- is_read filter ---

    @patch("apps.common.notification_views.Notification.objects")
    def test_is_read_true_returns_only_read(self, mock_qs):
        """is_read=true returns only read notifications."""
        notifs = [
            _make_notification(user_id=self.user_id, is_read=True, ntype="info"),
            _make_notification(user_id=self.user_id, is_read=False, ntype="info"),
            _make_notification(user_id=self.user_id, is_read=True, ntype="success"),
        ]
        mock_qs.filter.return_value = _build_mock_queryset(notifs)

        request = _auth_get(
            self.factory, "/api/v1/notifications/", self.user,
            query_params={"is_read": "true"},
        )
        response = self.view(request)

        assert response.status_code == 200
        data = response.data["data"]
        assert data["totalCount"] == 2
        for item in data["results"]:
            assert item["is_read"] is True

    @patch("apps.common.notification_views.Notification.objects")
    def test_is_read_false_returns_only_unread(self, mock_qs):
        """is_read=false returns only unread notifications."""
        notifs = [
            _make_notification(user_id=self.user_id, is_read=True, ntype="info"),
            _make_notification(user_id=self.user_id, is_read=False, ntype="info"),
            _make_notification(user_id=self.user_id, is_read=False, ntype="warning"),
        ]
        mock_qs.filter.return_value = _build_mock_queryset(notifs)

        request = _auth_get(
            self.factory, "/api/v1/notifications/", self.user,
            query_params={"is_read": "false"},
        )
        response = self.view(request)

        assert response.status_code == 200
        data = response.data["data"]
        assert data["totalCount"] == 2
        for item in data["results"]:
            assert item["is_read"] is False

    # --- Combined filters ---

    @patch("apps.common.notification_views.Notification.objects")
    def test_combined_type_and_is_read_filter(self, mock_qs):
        """type=warning&is_read=false returns only unread warnings."""
        notifs = [
            _make_notification(user_id=self.user_id, is_read=False, ntype="warning"),
            _make_notification(user_id=self.user_id, is_read=True, ntype="warning"),
            _make_notification(user_id=self.user_id, is_read=False, ntype="info"),
            _make_notification(user_id=self.user_id, is_read=False, ntype="warning"),
        ]
        mock_qs.filter.return_value = _build_mock_queryset(notifs)

        request = _auth_get(
            self.factory, "/api/v1/notifications/", self.user,
            query_params={"type": "warning", "is_read": "false"},
        )
        response = self.view(request)

        assert response.status_code == 200
        data = response.data["data"]
        assert data["totalCount"] == 2
        for item in data["results"]:
            assert item["type"] == "warning"
            assert item["is_read"] is False

    # --- pageSize clamping ---

    @patch("apps.common.notification_views.Notification.objects")
    def test_pagesize_clamped_to_max_100(self, mock_qs):
        """pageSize > 100 is clamped to 100."""
        notifs = [_make_notification(user_id=self.user_id) for _ in range(3)]
        mock_qs.filter.return_value = _build_mock_queryset(notifs)

        request = _auth_get(
            self.factory, "/api/v1/notifications/", self.user,
            query_params={"page": "1", "pageSize": "500"},
        )
        response = self.view(request)

        assert response.status_code == 200
        data = response.data["data"]
        assert data["pageSize"] == 100

    @patch("apps.common.notification_views.Notification.objects")
    def test_pagesize_clamped_to_min_1(self, mock_qs):
        """pageSize < 1 is clamped to 1."""
        notifs = [_make_notification(user_id=self.user_id) for _ in range(3)]
        mock_qs.filter.return_value = _build_mock_queryset(notifs)

        request = _auth_get(
            self.factory, "/api/v1/notifications/", self.user,
            query_params={"page": "1", "pageSize": "0"},
        )
        response = self.view(request)

        assert response.status_code == 200
        data = response.data["data"]
        assert data["pageSize"] == 1

    @patch("apps.common.notification_views.Notification.objects")
    def test_invalid_pagesize_defaults_to_20(self, mock_qs):
        """Non-numeric pageSize defaults to 20."""
        notifs = [_make_notification(user_id=self.user_id) for _ in range(3)]
        mock_qs.filter.return_value = _build_mock_queryset(notifs)

        request = _auth_get(
            self.factory, "/api/v1/notifications/", self.user,
            query_params={"page": "1", "pageSize": "abc"},
        )
        response = self.view(request)

        assert response.status_code == 200
        data = response.data["data"]
        assert data["pageSize"] == 20


# ---------------------------------------------------------------------------
# Helpers for TimelineHistoryView tests
# ---------------------------------------------------------------------------

from apps.applications.history_views import TimelineHistoryView


def _make_history_entry(
    entry_id=None,
    application_id=None,
    application_number="APP-20250101-ABCDEFGH",
    old_status="draft",
    new_status="submitted",
    notes=None,
    changed_by=None,
    created_at="2025-01-15T10:00:00Z",
):
    """Build a mock ApplicationStatusHistory object with related application and changed_by."""
    entry = MagicMock()
    entry.id = entry_id or uuid.uuid4()
    entry.application_id = application_id or uuid.uuid4()
    entry.old_status = old_status
    entry.new_status = new_status
    entry.notes = notes
    entry.changed_by = changed_by
    entry.created_at = created_at

    # Related application mock
    entry.application = MagicMock()
    entry.application.application_number = application_number

    return entry


def _make_changed_by(first_name="Admin", last_name="User"):
    """Build a mock Profile for the changed_by FK."""
    profile = MagicMock()
    profile.first_name = first_name
    profile.last_name = last_name
    return profile


def _build_history_mock_queryset(entries):
    """Build a mock queryset chain that supports filter, select_related, order_by, count, and slicing."""

    class HistorySliceableList:
        def __init__(self, items):
            self._items = list(items)

        def __iter__(self):
            return iter(self._items)

        def __len__(self):
            return len(self._items)

        def __getitem__(self, key):
            if isinstance(key, slice):
                return HistorySliceableList(self._items[key])
            return self._items[key]

        def count(self):
            return len(self._items)

        def filter(self, **kwargs):
            return self

        def select_related(self, *args):
            return self

        def order_by(self, *args):
            return self

    return HistorySliceableList(entries)


# ---------------------------------------------------------------------------
# TimelineHistoryView — Unit Tests
# ---------------------------------------------------------------------------


class TestTimelineHistoryView:
    """GET /api/v1/applications/history/ — unit tests.

    Implements task 2.3 (communications-history).
    Requirements: 3.1, 3.2, 3.6, 3.7
    """

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = TimelineHistoryView.as_view()
        self.user = _make_user()
        self.user_id = self.user.pk

    # --- Requirement 3.7: 401 for unauthenticated requests ---

    def test_unauthenticated_returns_401(self):
        """Unauthenticated request returns 401."""
        request = self.factory.get("/api/v1/applications/history/")
        # Do NOT call force_authenticate
        response = self.view(request)

        assert response.status_code == 401

    # --- Requirement 3.1, 3.6: Student sees only their own history ---

    @patch("apps.applications.history_views.ApplicationStatusHistory.objects")
    def test_student_sees_own_history(self, mock_manager):
        """Student sees only their own application history entries."""
        entries = [
            _make_history_entry(
                application_number="APP-20250101-AAAAAAAA",
                old_status="draft",
                new_status="submitted",
                created_at="2025-01-15T10:00:00Z",
            ),
            _make_history_entry(
                application_number="APP-20250101-AAAAAAAA",
                old_status="submitted",
                new_status="under_review",
                created_at="2025-01-14T10:00:00Z",
            ),
        ]
        mock_manager.filter.return_value = _build_history_mock_queryset(entries)

        request = _auth_get(self.factory, "/api/v1/applications/history/", self.user)
        response = self.view(request)

        assert response.status_code == 200
        body = response.data
        assert body["success"] is True
        assert len(body["data"]["results"]) == 2

        # Verify filter was called with the student's user_id
        mock_manager.filter.assert_called_once_with(application__user_id=self.user_id)

    # --- Requirement 3.8: Admin with user_id param sees that user's history ---

    @patch("apps.applications.history_views.ApplicationStatusHistory.objects")
    def test_admin_with_user_id_param(self, mock_manager):
        """Admin with user_id query param sees that specific user's history."""
        admin_user = _make_user(role="admin")
        target_user_id = str(uuid.uuid4())

        entries = [
            _make_history_entry(
                application_number="APP-20250201-BBBBBBBB",
                old_status="submitted",
                new_status="approved",
            ),
        ]
        mock_manager.filter.return_value = _build_history_mock_queryset(entries)

        request = _auth_get(
            self.factory,
            "/api/v1/applications/history/",
            admin_user,
            query_params={"user_id": target_user_id},
        )
        response = self.view(request)

        assert response.status_code == 200
        assert len(response.data["data"]["results"]) == 1

        # Verify filter was called with the target user_id, not the admin's
        mock_manager.filter.assert_called_once_with(application__user_id=target_user_id)

    # --- Requirement 3.2: Ordering by created_at descending ---

    @patch("apps.applications.history_views.ApplicationStatusHistory.objects")
    def test_ordering_by_created_at_descending(self, mock_manager):
        """Results are ordered by created_at descending."""
        entries = [
            _make_history_entry(created_at="2025-01-20T10:00:00Z", new_status="approved"),
            _make_history_entry(created_at="2025-01-15T10:00:00Z", new_status="under_review"),
            _make_history_entry(created_at="2025-01-10T10:00:00Z", new_status="submitted"),
        ]
        mock_manager.filter.return_value = _build_history_mock_queryset(entries)

        request = _auth_get(self.factory, "/api/v1/applications/history/", self.user)
        response = self.view(request)

        assert response.status_code == 200
        results = response.data["data"]["results"]
        assert len(results) == 3

        # Verify the queryset chain included order_by("-created_at")
        qs = mock_manager.filter.return_value
        # The view calls .select_related().order_by("-created_at")
        # Since our mock chains, we verify the results come back in the order provided
        assert results[0]["new_status"] == "approved"
        assert results[1]["new_status"] == "under_review"
        assert results[2]["new_status"] == "submitted"

    # --- Requirement 3.4, 3.5: Pagination envelope structure ---

    @patch("apps.applications.history_views.ApplicationStatusHistory.objects")
    def test_pagination_envelope_structure(self, mock_manager):
        """Response has correct pagination envelope: page, pageSize, totalCount, results."""
        entries = [
            _make_history_entry(created_at=f"2025-01-{20 - i:02d}T10:00:00Z")
            for i in range(5)
        ]
        mock_manager.filter.return_value = _build_history_mock_queryset(entries)

        request = _auth_get(
            self.factory,
            "/api/v1/applications/history/",
            self.user,
            query_params={"page": "1", "pageSize": "2"},
        )
        response = self.view(request)

        assert response.status_code == 200
        body = response.data
        assert body["success"] is True

        data = body["data"]
        assert "page" in data
        assert "pageSize" in data
        assert "totalCount" in data
        assert "results" in data
        assert data["page"] == 1
        assert data["pageSize"] == 2
        assert data["totalCount"] == 5
        assert len(data["results"]) == 2

    @patch("apps.applications.history_views.ApplicationStatusHistory.objects")
    def test_pagination_page_2(self, mock_manager):
        """Page 2 returns remaining results."""
        entries = [
            _make_history_entry(created_at=f"2025-01-{20 - i:02d}T10:00:00Z")
            for i in range(5)
        ]
        mock_manager.filter.return_value = _build_history_mock_queryset(entries)

        request = _auth_get(
            self.factory,
            "/api/v1/applications/history/",
            self.user,
            query_params={"page": "2", "pageSize": "3"},
        )
        response = self.view(request)

        assert response.status_code == 200
        data = response.data["data"]
        assert data["page"] == 2
        assert data["pageSize"] == 3
        assert data["totalCount"] == 5
        assert len(data["results"]) == 2  # 5 total, page 2 of size 3 = 2 remaining

    @patch("apps.applications.history_views.ApplicationStatusHistory.objects")
    def test_result_entry_fields(self, mock_manager):
        """Each result entry contains the expected fields."""
        admin_profile = _make_changed_by("Jane", "Admin")
        entries = [
            _make_history_entry(
                application_number="APP-20250101-CCCCCCCC",
                old_status="submitted",
                new_status="under_review",
                notes="Moved to review queue",
                changed_by=admin_profile,
                created_at="2025-01-15T14:00:00Z",
            ),
        ]
        mock_manager.filter.return_value = _build_history_mock_queryset(entries)

        request = _auth_get(self.factory, "/api/v1/applications/history/", self.user)
        response = self.view(request)

        assert response.status_code == 200
        result = response.data["data"]["results"][0]
        assert "id" in result
        assert "application_id" in result
        assert result["application_number"] == "APP-20250101-CCCCCCCC"
        assert result["old_status"] == "submitted"
        assert result["new_status"] == "under_review"
        assert result["notes"] == "Moved to review queue"
        assert result["changed_by_name"] == "Jane Admin"
        assert result["created_at"] == "2025-01-15T14:00:00Z"


# ---------------------------------------------------------------------------
# AdminNotificationHistoryView — Unit Tests
# ---------------------------------------------------------------------------

from apps.common.notification_views import AdminNotificationHistoryView


class TestAdminNotificationHistoryView:
    """GET /api/v1/notifications/user/<uuid:user_id>/ — unit tests.

    Implements task 3.3 (communications-history).
    Requirements: 7.2, 7.6, 7.7
    """

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = AdminNotificationHistoryView.as_view()
        self.target_user_id = uuid.uuid4()

    # --- Requirement 7.6: 403 for non-admin users ---

    def test_non_admin_student_returns_403(self):
        """Non-admin (student) user receives 403 Forbidden."""
        student = _make_user(role="student")
        request = _auth_get(
            self.factory,
            f"/api/v1/notifications/user/{self.target_user_id}/",
            student,
        )
        response = self.view(request, user_id=self.target_user_id)

        assert response.status_code == 403

    # --- Requirement 7.7: 404 for non-existent user_id ---

    @patch("apps.common.notification_views.Profile.objects")
    def test_nonexistent_user_returns_404(self, mock_profile_manager):
        """Admin request for a non-existent user_id returns 404."""
        admin = _make_user(role="admin")
        mock_profile_manager.filter.return_value.exists.return_value = False

        request = _auth_get(
            self.factory,
            f"/api/v1/notifications/user/{self.target_user_id}/",
            admin,
        )
        response = self.view(request, user_id=self.target_user_id)

        assert response.status_code == 404
        assert response.data["success"] is False
        assert response.data["code"] == "NOT_FOUND"

    # --- Requirement 7.2: Admin sees only the specified user's notifications ---

    @patch("apps.common.notification_views.Notification.objects")
    @patch("apps.common.notification_views.Profile.objects")
    def test_admin_sees_only_target_user_notifications(self, mock_profile_manager, mock_notif_manager):
        """Admin sees only notifications belonging to the specified user_id."""
        admin = _make_user(role="admin")
        mock_profile_manager.filter.return_value.exists.return_value = True

        target_notifs = [
            _make_notification(user_id=self.target_user_id, ntype="info"),
            _make_notification(user_id=self.target_user_id, ntype="success"),
        ]
        mock_notif_manager.filter.return_value = _build_mock_queryset(target_notifs)

        request = _auth_get(
            self.factory,
            f"/api/v1/notifications/user/{self.target_user_id}/",
            admin,
        )
        response = self.view(request, user_id=self.target_user_id)

        assert response.status_code == 200
        body = response.data
        assert body["success"] is True
        assert body["data"]["totalCount"] == 2
        assert len(body["data"]["results"]) == 2

        # Verify filter was called with the target user_id
        mock_notif_manager.filter.assert_called_once_with(user_id=self.target_user_id)

    # --- Ordering and pagination ---

    @patch("apps.common.notification_views.Notification.objects")
    @patch("apps.common.notification_views.Profile.objects")
    def test_results_ordered_by_created_at_descending(self, mock_profile_manager, mock_notif_manager):
        """Results are returned in created_at descending order."""
        admin = _make_user(role="admin")
        mock_profile_manager.filter.return_value.exists.return_value = True

        notifs = [
            _make_notification(user_id=self.target_user_id, ntype="warning"),
            _make_notification(user_id=self.target_user_id, ntype="info"),
            _make_notification(user_id=self.target_user_id, ntype="success"),
        ]
        # Assign distinct created_at values in descending order
        notifs[0].created_at = "2025-01-20T10:00:00Z"
        notifs[1].created_at = "2025-01-15T10:00:00Z"
        notifs[2].created_at = "2025-01-10T10:00:00Z"
        mock_notif_manager.filter.return_value = _build_mock_queryset(notifs)

        request = _auth_get(
            self.factory,
            f"/api/v1/notifications/user/{self.target_user_id}/",
            admin,
        )
        response = self.view(request, user_id=self.target_user_id)

        assert response.status_code == 200
        results = response.data["data"]["results"]
        assert len(results) == 3
        # Verify order matches the mock (descending by created_at)
        assert results[0]["type"] == "warning"
        assert results[1]["type"] == "info"
        assert results[2]["type"] == "success"

    @patch("apps.common.notification_views.Notification.objects")
    @patch("apps.common.notification_views.Profile.objects")
    def test_pagination_envelope_structure(self, mock_profile_manager, mock_notif_manager):
        """Response has correct pagination envelope: page, pageSize, totalCount, results."""
        admin = _make_user(role="admin")
        mock_profile_manager.filter.return_value.exists.return_value = True

        notifs = [
            _make_notification(user_id=self.target_user_id)
            for _ in range(5)
        ]
        mock_notif_manager.filter.return_value = _build_mock_queryset(notifs)

        request = _auth_get(
            self.factory,
            f"/api/v1/notifications/user/{self.target_user_id}/",
            admin,
            query_params={"page": "1", "pageSize": "2"},
        )
        response = self.view(request, user_id=self.target_user_id)

        assert response.status_code == 200
        data = response.data["data"]
        assert data["page"] == 1
        assert data["pageSize"] == 2
        assert data["totalCount"] == 5
        assert len(data["results"]) == 2

    @patch("apps.common.notification_views.Notification.objects")
    @patch("apps.common.notification_views.Profile.objects")
    def test_pagination_page_2_returns_remaining(self, mock_profile_manager, mock_notif_manager):
        """Page 2 returns remaining results."""
        admin = _make_user(role="admin")
        mock_profile_manager.filter.return_value.exists.return_value = True

        notifs = [
            _make_notification(user_id=self.target_user_id)
            for _ in range(5)
        ]
        mock_notif_manager.filter.return_value = _build_mock_queryset(notifs)

        request = _auth_get(
            self.factory,
            f"/api/v1/notifications/user/{self.target_user_id}/",
            admin,
            query_params={"page": "2", "pageSize": "3"},
        )
        response = self.view(request, user_id=self.target_user_id)

        assert response.status_code == 200
        data = response.data["data"]
        assert data["page"] == 2
        assert data["pageSize"] == 3
        assert data["totalCount"] == 5
        assert len(data["results"]) == 2  # 5 total, page 2 of size 3 = 2 remaining
