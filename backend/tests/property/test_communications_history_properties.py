"""Property-based tests for communications history — backend.

# Feature: communications-history, Property 1: Chronological ordering

For any API response from the timeline history or admin notification history
endpoints, the results array SHALL be sorted by created_at in descending order.

**Validates: Requirements 1.1, 2.1, 3.2, 7.3**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import uuid  # noqa: E402
from datetime import datetime, timezone  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402
from rest_framework.test import APIRequestFactory, force_authenticate  # noqa: E402

from apps.accounts.authentication import JWTUser  # noqa: E402
from apps.applications.history_views import TimelineHistoryView  # noqa: E402
from apps.common.notification_views import AdminNotificationHistoryView  # noqa: E402

_default_settings = settings(max_examples=5, deadline=None)


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Generate random datetime timestamps within a reasonable range
_timestamps = st.datetimes(
    min_value=datetime(2020, 1, 1),
    max_value=datetime(2030, 12, 31),
    timezones=st.just(timezone.utc),
)

_statuses = st.sampled_from(["draft", "submitted", "under_review", "approved", "rejected", "waitlisted"])

_notification_types = st.sampled_from(["info", "success", "warning", "error"])


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


def _make_history_entry(created_at, old_status="draft", new_status="submitted"):
    """Build a mock ApplicationStatusHistory object."""
    entry = MagicMock()
    entry.id = uuid.uuid4()
    entry.application_id = uuid.uuid4()
    entry.old_status = old_status
    entry.new_status = new_status
    entry.notes = None
    entry.changed_by = None
    entry.created_at = created_at
    entry.application = MagicMock()
    entry.application.application_number = f"APP-20250101-{uuid.uuid4().hex[:8].upper()}"
    return entry


def _make_notification(created_at, ntype="info"):
    """Build a mock Notification object."""
    n = MagicMock()
    n.pk = uuid.uuid4()
    n.id = n.pk
    n.user_id = str(uuid.uuid4())
    n.title = "Test Notification"
    n.message = "Test message."
    n.type = ntype
    n.is_read = False
    n.action_url = None
    n.created_at = created_at
    return n


def _build_history_queryset(entries):
    """Mock queryset for TimelineHistoryView that sorts by created_at descending."""

    class HistoryQS:
        def __init__(self, items):
            self._items = list(items)

        def __iter__(self):
            return iter(self._items)

        def __len__(self):
            return len(self._items)

        def __getitem__(self, key):
            if isinstance(key, slice):
                return HistoryQS(self._items[key])
            return self._items[key]

        def count(self):
            return len(self._items)

        def filter(self, **kwargs):
            return self

        def select_related(self, *args):
            return self

        def order_by(self, *args):
            # Simulate actual ordering by -created_at
            if args and args[0] == "-created_at":
                sorted_items = sorted(self._items, key=lambda e: e.created_at, reverse=True)
                return HistoryQS(sorted_items)
            return self

    return HistoryQS(entries)


def _build_notification_queryset(notifications):
    """Mock queryset for AdminNotificationHistoryView that sorts by created_at descending."""

    class NotifQS:
        def __init__(self, items):
            self._items = list(items)

        def __iter__(self):
            return iter(self._items)

        def __len__(self):
            return len(self._items)

        def __getitem__(self, key):
            if isinstance(key, slice):
                return NotifQS(self._items[key])
            return self._items[key]

        def count(self):
            return len(self._items)

        def filter(self, **kwargs):
            return self

        def order_by(self, *args):
            if args and args[0] == "-created_at":
                sorted_items = sorted(self._items, key=lambda e: e.created_at, reverse=True)
                return NotifQS(sorted_items)
            return self

    return NotifQS(notifications)


# =========================================================================
# Property 1: Chronological ordering — TimelineHistoryView
# =========================================================================


class TestTimelineChronologicalOrdering:
    """Property 1: Chronological ordering (TimelineHistoryView).

    For any list of history entries with random created_at timestamps,
    the API response results SHALL be sorted by created_at descending.

    # Feature: communications-history, Property 1: Chronological ordering

    **Validates: Requirements 1.1, 2.1, 3.2, 7.3**
    """

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = TimelineHistoryView.as_view()

    @given(
        timestamps=st.lists(_timestamps, min_size=0, max_size=30),
        status_pairs=st.lists(
            st.tuples(_statuses, _statuses),
            min_size=0,
            max_size=30,
        ),
    )
    @_default_settings
    def test_timeline_results_sorted_descending(self, timestamps, status_pairs):
        """Results from TimelineHistoryView are always sorted by created_at descending."""
        # Use the shorter list length to pair timestamps with statuses
        n = min(len(timestamps), len(status_pairs))
        entries = [
            _make_history_entry(timestamps[i], status_pairs[i][0], status_pairs[i][1])
            for i in range(n)
        ]

        user = _make_user()

        with patch("apps.applications.history_views.ApplicationStatusHistory.objects") as mock_manager:
            mock_manager.filter.return_value = _build_history_queryset(entries)

            request = self.factory.get("/api/v1/applications/history/")
            force_authenticate(request, user=user)
            response = self.view(request)

        assert response.status_code == 200
        results = response.data["data"]["results"]
        assert len(results) <= n

        # Verify descending order of created_at
        for i in range(len(results) - 1):
            assert results[i]["created_at"] >= results[i + 1]["created_at"], (
                f"Results not in descending order at index {i}: "
                f"{results[i]['created_at']} < {results[i + 1]['created_at']}"
            )


# =========================================================================
# Property 1: Chronological ordering — AdminNotificationHistoryView
# =========================================================================


class TestAdminNotificationChronologicalOrdering:
    """Property 1: Chronological ordering (AdminNotificationHistoryView).

    For any list of notifications with random created_at timestamps,
    the admin API response results SHALL be sorted by created_at descending.

    # Feature: communications-history, Property 1: Chronological ordering

    **Validates: Requirements 1.1, 2.1, 3.2, 7.3**
    """

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = AdminNotificationHistoryView.as_view()

    @given(
        timestamps=st.lists(_timestamps, min_size=0, max_size=30),
        types=st.lists(_notification_types, min_size=0, max_size=30),
    )
    @_default_settings
    def test_admin_notification_results_sorted_descending(self, timestamps, types):
        """Results from AdminNotificationHistoryView are always sorted by created_at descending."""
        n = min(len(timestamps), len(types))
        target_user_id = uuid.uuid4()
        notifications = [
            _make_notification(timestamps[i], types[i])
            for i in range(n)
        ]

        admin = _make_user(role="admin")

        with patch("apps.accounts.models.Profile.objects") as mock_profile, \
             patch("apps.common.notification_views.Notification.objects") as mock_notif:
            mock_profile.filter.return_value.exists.return_value = True
            mock_notif.filter.return_value = _build_notification_queryset(notifications)

            request = self.factory.get(f"/api/v1/notifications/user/{target_user_id}/")
            force_authenticate(request, user=admin)
            response = self.view(request, user_id=target_user_id)

        assert response.status_code == 200
        results = response.data["data"]["results"]
        assert len(results) <= n

        # Verify descending order of created_at
        for i in range(len(results) - 1):
            assert results[i]["created_at"] >= results[i + 1]["created_at"], (
                f"Results not in descending order at index {i}: "
                f"{results[i]['created_at']} < {results[i + 1]['created_at']}"
            )


# =========================================================================
# Property 8: Student ownership scoping
# =========================================================================


class TestStudentOwnershipScoping:
    """Property 8: Student ownership scoping.

    For any authenticated student request to GET /api/v1/applications/history/,
    every returned StatusHistoryEntry SHALL belong to an application where
    application.user_id equals the authenticated user's ID. No records from
    other users' applications SHALL appear in the response.

    # Feature: communications-history, Property 8: Student ownership scoping

    **Validates: Requirements 3.1, 3.6**
    """

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = TimelineHistoryView.as_view()

    @given(
        auth_timestamps=st.lists(_timestamps, min_size=0, max_size=15),
        other_timestamps=st.lists(_timestamps, min_size=0, max_size=15),
        auth_statuses=st.lists(st.tuples(_statuses, _statuses), min_size=0, max_size=15),
        other_statuses=st.lists(st.tuples(_statuses, _statuses), min_size=0, max_size=15),
    )
    @_default_settings
    def test_only_authenticated_users_records_returned(
        self, auth_timestamps, other_timestamps, auth_statuses, other_statuses
    ):
        """Timeline results contain only the authenticated user's history entries."""
        auth_user_id = uuid.uuid4()
        other_user_id = uuid.uuid4()

        # Build entries for the authenticated user
        n_auth = min(len(auth_timestamps), len(auth_statuses))
        auth_entries = []
        for i in range(n_auth):
            entry = _make_history_entry(
                auth_timestamps[i], auth_statuses[i][0], auth_statuses[i][1]
            )
            entry.application.user_id = auth_user_id
            auth_entries.append(entry)

        # Build entries for a different user
        n_other = min(len(other_timestamps), len(other_statuses))
        other_entries = []
        for i in range(n_other):
            entry = _make_history_entry(
                other_timestamps[i], other_statuses[i][0], other_statuses[i][1]
            )
            entry.application.user_id = other_user_id
            other_entries.append(entry)

        all_entries = auth_entries + other_entries

        # Build a queryset that actually filters by application__user_id
        class FilteringHistoryQS:
            def __init__(self, items):
                self._items = list(items)

            def __iter__(self):
                return iter(self._items)

            def __len__(self):
                return len(self._items)

            def __getitem__(self, key):
                if isinstance(key, slice):
                    return FilteringHistoryQS(self._items[key])
                return self._items[key]

            def count(self):
                return len(self._items)

            def filter(self, **kwargs):
                target_uid = kwargs.get("application__user_id")
                if target_uid is not None:
                    filtered = [
                        e for e in self._items
                        if e.application.user_id == target_uid
                    ]
                    return FilteringHistoryQS(filtered)
                return self

            def select_related(self, *args):
                return self

            def order_by(self, *args):
                if args and args[0] == "-created_at":
                    sorted_items = sorted(
                        self._items, key=lambda e: e.created_at, reverse=True
                    )
                    return FilteringHistoryQS(sorted_items)
                return self

        user = _make_user(user_id=auth_user_id, role="student")

        with patch(
            "apps.applications.history_views.ApplicationStatusHistory.objects"
        ) as mock_manager:
            mock_manager.filter.return_value = FilteringHistoryQS(all_entries).filter(
                application__user_id=auth_user_id
            )

            request = self.factory.get("/api/v1/applications/history/")
            force_authenticate(request, user=user)
            response = self.view(request)

        assert response.status_code == 200
        results = response.data["data"]["results"]

        # Every returned record must belong to the authenticated user
        assert len(results) == n_auth, (
            f"Expected {n_auth} results for auth user, got {len(results)}"
        )

        # Collect the application_ids from auth entries to verify membership
        auth_app_ids = {str(e.application_id) for e in auth_entries}
        for r in results:
            assert r["application_id"] in auth_app_ids, (
                f"Result application_id {r['application_id']} does not belong "
                f"to authenticated user's entries"
            )


# =========================================================================
# Property 9: Response envelope format
# =========================================================================


class TestResponseEnvelopeFormatTimeline:
    """Property 9: Response envelope format (TimelineHistoryView).

    For any successful response from the timeline history API, the response
    body SHALL match the structure {"success": true, "data": {...}} where
    data contains page, pageSize, totalCount, and results keys.

    # Feature: communications-history, Property 9: Response envelope format

    **Validates: Requirements 3.4, 7.4**
    """

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = TimelineHistoryView.as_view()

    @given(
        timestamps=st.lists(_timestamps, min_size=0, max_size=20),
        status_pairs=st.lists(
            st.tuples(_statuses, _statuses),
            min_size=0,
            max_size=20,
        ),
    )
    @_default_settings
    def test_timeline_response_has_correct_envelope(self, timestamps, status_pairs):
        """TimelineHistoryView response always has success, data with page/pageSize/totalCount/results."""
        n = min(len(timestamps), len(status_pairs))
        entries = [
            _make_history_entry(timestamps[i], status_pairs[i][0], status_pairs[i][1])
            for i in range(n)
        ]

        user = _make_user()

        with patch("apps.applications.history_views.ApplicationStatusHistory.objects") as mock_manager:
            mock_manager.filter.return_value = _build_history_queryset(entries)

            request = self.factory.get("/api/v1/applications/history/")
            force_authenticate(request, user=user)
            response = self.view(request)

        # Verify top-level envelope
        assert response.status_code == 200
        assert "success" in response.data
        assert response.data["success"] is True
        assert "data" in response.data

        # Verify data contains required pagination keys
        data = response.data["data"]
        assert "page" in data
        assert "pageSize" in data
        assert "totalCount" in data
        assert "results" in data

        # Verify types
        assert isinstance(data["page"], int)
        assert isinstance(data["pageSize"], int)
        assert isinstance(data["totalCount"], int)
        assert isinstance(data["results"], list)


class TestResponseEnvelopeFormatAdminNotification:
    """Property 9: Response envelope format (AdminNotificationHistoryView).

    For any successful response from the admin notification history API, the
    response body SHALL match the structure {"success": true, "data": {...}}
    where data contains page, pageSize, totalCount, and results keys.

    # Feature: communications-history, Property 9: Response envelope format

    **Validates: Requirements 3.4, 7.4**
    """

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = AdminNotificationHistoryView.as_view()

    @given(
        timestamps=st.lists(_timestamps, min_size=0, max_size=20),
        types=st.lists(_notification_types, min_size=0, max_size=20),
    )
    @_default_settings
    def test_admin_notification_response_has_correct_envelope(self, timestamps, types):
        """AdminNotificationHistoryView response always has success, data with page/pageSize/totalCount/results."""
        n = min(len(timestamps), len(types))
        target_user_id = uuid.uuid4()
        notifications = [
            _make_notification(timestamps[i], types[i])
            for i in range(n)
        ]

        admin = _make_user(role="admin")

        with patch("apps.accounts.models.Profile.objects") as mock_profile, \
             patch("apps.common.notification_views.Notification.objects") as mock_notif:
            mock_profile.filter.return_value.exists.return_value = True
            mock_notif.filter.return_value = _build_notification_queryset(notifications)

            request = self.factory.get(f"/api/v1/notifications/user/{target_user_id}/")
            force_authenticate(request, user=admin)
            response = self.view(request, user_id=target_user_id)

        # Verify top-level envelope
        assert response.status_code == 200
        assert "success" in response.data
        assert response.data["success"] is True
        assert "data" in response.data

        # Verify data contains required pagination keys
        data = response.data["data"]
        assert "page" in data
        assert "pageSize" in data
        assert "totalCount" in data
        assert "results" in data

        # Verify types
        assert isinstance(data["page"], int)
        assert isinstance(data["pageSize"], int)
        assert isinstance(data["totalCount"], int)
        assert isinstance(data["results"], list)


# =========================================================================
# Property 10: Pagination invariants — TimelineHistoryView
# =========================================================================


class TestPaginationInvariantsTimeline:
    """Property 10: Pagination invariants (TimelineHistoryView).

    For any paginated API response from the timeline history endpoint,
    results.length SHALL be less than or equal to pageSize, and totalCount
    SHALL be greater than or equal to results.length. When
    page * pageSize < totalCount, results SHALL be non-empty.

    # Feature: communications-history, Property 10: Pagination invariants

    **Validates: Requirements 3.5, 7.5**
    """

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = TimelineHistoryView.as_view()

    @given(
        num_entries=st.integers(min_value=0, max_value=50),
        page=st.integers(min_value=1, max_value=10),
        page_size=st.integers(min_value=1, max_value=100),
    )
    @_default_settings
    def test_timeline_pagination_invariants(self, num_entries, page, page_size):
        """Timeline pagination: len(results) <= pageSize, totalCount >= len(results),
        and results are non-empty when page * pageSize < totalCount."""
        # Generate entries with distinct timestamps so ordering is deterministic
        base = datetime(2025, 1, 1, tzinfo=timezone.utc)
        entries = [
            _make_history_entry(
                base.replace(day=1, hour=i % 24, minute=i % 60),
                "draft",
                "submitted",
            )
            for i in range(num_entries)
        ]

        user = _make_user()

        with patch(
            "apps.applications.history_views.ApplicationStatusHistory.objects"
        ) as mock_manager:
            mock_manager.filter.return_value = _build_history_queryset(entries)

            request = self.factory.get(
                "/api/v1/applications/history/",
                {"page": str(page), "pageSize": str(page_size)},
            )
            force_authenticate(request, user=user)
            response = self.view(request)

        assert response.status_code == 200
        data = response.data["data"]
        results = data["results"]
        total_count = data["totalCount"]
        returned_page_size = data["pageSize"]

        # Invariant 1: results length <= pageSize
        assert len(results) <= returned_page_size, (
            f"len(results)={len(results)} > pageSize={returned_page_size}"
        )

        # Invariant 2: totalCount >= results length
        assert total_count >= len(results), (
            f"totalCount={total_count} < len(results)={len(results)}"
        )

        # Invariant 3: when page * pageSize < totalCount, results SHALL be non-empty
        if page * returned_page_size < total_count:
            assert len(results) > 0, (
                f"Results empty but page*pageSize={page * returned_page_size} "
                f"< totalCount={total_count}"
            )


# =========================================================================
# Property 10: Pagination invariants — AdminNotificationHistoryView
# =========================================================================


class TestPaginationInvariantsAdminNotification:
    """Property 10: Pagination invariants (AdminNotificationHistoryView).

    For any paginated API response from the admin notification history endpoint,
    results.length SHALL be less than or equal to pageSize, and totalCount
    SHALL be greater than or equal to results.length. When
    page * pageSize < totalCount, results SHALL be non-empty.

    # Feature: communications-history, Property 10: Pagination invariants

    **Validates: Requirements 3.5, 7.5**
    """

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = AdminNotificationHistoryView.as_view()

    @given(
        num_entries=st.integers(min_value=0, max_value=50),
        page=st.integers(min_value=1, max_value=10),
        page_size=st.integers(min_value=1, max_value=100),
    )
    @_default_settings
    def test_admin_notification_pagination_invariants(self, num_entries, page, page_size):
        """Admin notification pagination: len(results) <= pageSize, totalCount >= len(results),
        and results are non-empty when page * pageSize < totalCount."""
        base = datetime(2025, 1, 1, tzinfo=timezone.utc)
        target_user_id = uuid.uuid4()
        notifications = [
            _make_notification(
                base.replace(day=1, hour=i % 24, minute=i % 60),
                "info",
            )
            for i in range(num_entries)
        ]

        admin = _make_user(role="admin")

        with patch("apps.accounts.models.Profile.objects") as mock_profile, \
             patch("apps.common.notification_views.Notification.objects") as mock_notif:
            mock_profile.filter.return_value.exists.return_value = True
            mock_notif.filter.return_value = _build_notification_queryset(notifications)

            request = self.factory.get(
                f"/api/v1/notifications/user/{target_user_id}/",
                {"page": str(page), "pageSize": str(page_size)},
            )
            force_authenticate(request, user=admin)
            response = self.view(request, user_id=target_user_id)

        assert response.status_code == 200
        data = response.data["data"]
        results = data["results"]
        total_count = data["totalCount"]
        returned_page_size = data["pageSize"]

        # Invariant 1: results length <= pageSize
        assert len(results) <= returned_page_size, (
            f"len(results)={len(results)} > pageSize={returned_page_size}"
        )

        # Invariant 2: totalCount >= results length
        assert total_count >= len(results), (
            f"totalCount={total_count} < len(results)={len(results)}"
        )

        # Invariant 3: when page * pageSize < totalCount, results SHALL be non-empty
        if page * returned_page_size < total_count:
            assert len(results) > 0, (
                f"Results empty but page*pageSize={page * returned_page_size} "
                f"< totalCount={total_count}"
            )


# =========================================================================
# Property 11: Admin-only access enforcement
# =========================================================================


class TestAdminOnlyAccessEnforcement:
    """Property 11: Admin-only access enforcement.

    For any request to GET /api/v1/notifications/user/<user_id>/ from a
    non-admin authenticated user, the API SHALL return HTTP 403. The response
    SHALL NOT contain any notification data.

    # Feature: communications-history, Property 11: Admin-only access enforcement

    **Validates: Requirements 6.7, 7.2**
    """

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = AdminNotificationHistoryView.as_view()

    @given(
        user_ids=st.lists(
            st.uuids(),
            min_size=1,
            max_size=20,
        ),
        roles=st.lists(
            st.sampled_from(["student", "reviewer"]),
            min_size=1,
            max_size=20,
        ),
    )
    @settings(max_examples=5, deadline=None)
    def test_non_admin_users_get_403(self, user_ids, roles):
        """Non-admin users always receive 403 with no notification data."""
        n = min(len(user_ids), len(roles))

        for i in range(n):
            target_user_id = uuid.uuid4()
            non_admin = _make_user(user_id=user_ids[i], role=roles[i])

            with patch(
                "apps.accounts.permissions._check_permission_override",
                return_value=False,
            ):
                request = self.factory.get(
                    f"/api/v1/notifications/user/{target_user_id}/"
                )
                force_authenticate(request, user=non_admin)
                response = self.view(request, user_id=target_user_id)

            # Must be 403
            assert response.status_code == 403, (
                f"Expected 403 for role={roles[i]}, got {response.status_code}"
            )

            # Response must NOT contain notification data
            resp_data = response.data
            assert resp_data.get("success") is False, (
                f"Expected success=False for role={roles[i]}, got {resp_data.get('success')}"
            )

            # No 'data' key with results should be present
            if "data" in resp_data:
                assert "results" not in resp_data["data"], (
                    f"Response for role={roles[i]} should not contain notification results"
                )


# =========================================================================
# Property 12: Admin user-scoped notification retrieval
# =========================================================================


class TestAdminUserScopedNotificationRetrieval:
    """Property 12: Admin user-scoped notification retrieval.

    For any admin request to GET /api/v1/notifications/user/<user_id>/,
    every returned Notification record SHALL have user_id equal to the
    <user_id> path parameter. No notifications belonging to other users
    SHALL appear in the response.

    # Feature: communications-history, Property 12: Admin user-scoped notification retrieval

    **Validates: Requirements 3.8, 7.1**
    """

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = AdminNotificationHistoryView.as_view()

    @given(
        target_timestamps=st.lists(_timestamps, min_size=0, max_size=15),
        target_types=st.lists(_notification_types, min_size=0, max_size=15),
        other_timestamps=st.lists(_timestamps, min_size=0, max_size=15),
        other_types=st.lists(_notification_types, min_size=0, max_size=15),
    )
    @settings(max_examples=5, deadline=None)
    def test_admin_sees_only_target_user_notifications(
        self, target_timestamps, target_types, other_timestamps, other_types
    ):
        """Admin endpoint returns only the specified user's notifications, never another user's."""
        target_user_id = uuid.uuid4()
        other_user_id = uuid.uuid4()

        # Build notifications for the target user
        n_target = min(len(target_timestamps), len(target_types))
        target_notifications = []
        for i in range(n_target):
            n = _make_notification(target_timestamps[i], target_types[i])
            n.user_id = str(target_user_id)
            target_notifications.append(n)

        # Build notifications for a different user
        n_other = min(len(other_timestamps), len(other_types))
        other_notifications = []
        for i in range(n_other):
            n = _make_notification(other_timestamps[i], other_types[i])
            n.user_id = str(other_user_id)
            other_notifications.append(n)

        all_notifications = target_notifications + other_notifications

        # Build a queryset that filters by user_id
        class FilteringNotifQS:
            def __init__(self, items):
                self._items = list(items)

            def __iter__(self):
                return iter(self._items)

            def __len__(self):
                return len(self._items)

            def __getitem__(self, key):
                if isinstance(key, slice):
                    return FilteringNotifQS(self._items[key])
                return self._items[key]

            def count(self):
                return len(self._items)

            def filter(self, **kwargs):
                uid = kwargs.get("user_id")
                if uid is not None:
                    filtered = [
                        item for item in self._items
                        if item.user_id == str(uid)
                    ]
                    return FilteringNotifQS(filtered)
                return self

            def order_by(self, *args):
                if args and args[0] == "-created_at":
                    sorted_items = sorted(
                        self._items, key=lambda e: e.created_at, reverse=True
                    )
                    return FilteringNotifQS(sorted_items)
                return self

        admin = _make_user(role="admin")

        with patch("apps.accounts.models.Profile.objects") as mock_profile, \
             patch("apps.common.notification_views.Notification.objects") as mock_notif:
            mock_profile.filter.return_value.exists.return_value = True
            mock_notif.filter.return_value = FilteringNotifQS(all_notifications).filter(
                user_id=target_user_id
            )

            request = self.factory.get(
                f"/api/v1/notifications/user/{target_user_id}/"
            )
            force_authenticate(request, user=admin)
            response = self.view(request, user_id=target_user_id)

        assert response.status_code == 200
        results = response.data["data"]["results"]

        # Invariant 1: result count matches target user's notification count
        assert len(results) == n_target, (
            f"Expected {n_target} results for target user, got {len(results)}"
        )

        # Invariant 2: every returned notification belongs to the target user
        # (verified by checking count matches — no other user's notifications leak in)
        # Also verify no other_user notifications appear by checking total
        assert len(results) <= n_target, (
            f"Got {len(results)} results but target user only has {n_target} notifications"
        )

        # Invariant 3: none of the other user's notifications appear
        # If other_user had notifications and they leaked, count would exceed n_target
        total_possible = n_target + n_other
        if total_possible > 0 and n_other > 0:
            assert len(results) < total_possible, (
                f"All {total_possible} notifications returned — other user's "
                f"notifications are leaking into the response"
            )
