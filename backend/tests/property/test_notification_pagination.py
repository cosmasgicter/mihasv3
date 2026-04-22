"""Property-based tests for notification list pagination.

# Feature: audit-remediation, Property 7: Notification list is paginated

For any user with N notifications where N exceeds the page size,
GET /api/v1/notifications/ returns at most pageSize results and includes
page, pageSize, totalCount, and results in the response envelope.

**Validates: Requirements 11.1, 11.2**
"""

import os
import uuid
from datetime import datetime, timezone as tz
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from django.test.client import RequestFactory  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402
from rest_framework.request import Request  # noqa: E402

from apps.common.notification_views import NotificationListView  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_PAGE_SIZE = 20


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Number of notifications: always > page size to exercise pagination
notification_counts = st.integers(min_value=DEFAULT_PAGE_SIZE + 1, max_value=200)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_fake_notification(index: int) -> MagicMock:
    """Build a mock notification object with realistic field values."""
    n = MagicMock()
    n.id = uuid.uuid4()
    n.title = f"Notification {index}"
    n.message = f"Message body {index}"
    n.type = "general"
    n.is_read = False
    n.created_at = datetime(2025, 1, 1, 0, 0, index % 60, tzinfo=tz.utc)
    # Support dict-style access for serializer
    n.pk = n.id
    return n


def _build_mock_queryset(count: int):
    """Return a list of mock notifications wrapped to behave like a queryset."""
    return [_make_fake_notification(i) for i in range(count)]


# ---------------------------------------------------------------------------
# Property 7: Notification list is paginated
# ---------------------------------------------------------------------------


class TestNotificationListPaginated(SimpleTestCase):
    """# Feature: audit-remediation, Property 7: Notification list is paginated

    For any user with N notifications where N exceeds the page size,
    GET /api/v1/notifications/ returns at most pageSize results and includes
    page, pageSize, totalCount, and results in the response envelope.

    **Validates: Requirements 11.1, 11.2**
    """

    @given(n=notification_counts)
    @settings(max_examples=5, deadline=None)
    def test_paginated_response_envelope(self, n):
        """For any N > DEFAULT_PAGE_SIZE, the response contains the
        pagination envelope with results capped at pageSize."""
        fake_notifications = _build_mock_queryset(n)

        factory = RequestFactory()
        django_request = factory.get("/api/v1/notifications/", {"page": "1", "pageSize": "20"})
        # Attach a mock authenticated user
        django_request.user = MagicMock()
        django_request.user.pk = uuid.uuid4()
        django_request.user.is_authenticated = True
        # Wrap in DRF Request so query_params is available
        request = Request(django_request)

        with patch(
            "apps.common.notification_views.Notification.objects"
        ) as mock_manager:
            mock_qs = MagicMock()
            mock_manager.filter.return_value = mock_qs
            mock_ordered = MagicMock()
            mock_ordered.__iter__ = MagicMock(return_value=iter(fake_notifications))
            mock_ordered.__len__ = MagicMock(return_value=len(fake_notifications))
            mock_ordered.__getitem__ = MagicMock(side_effect=lambda s: fake_notifications[s] if isinstance(s, int) else fake_notifications[s.start:s.stop])
            mock_ordered.count.return_value = len(fake_notifications)
            mock_qs.order_by.return_value = mock_ordered

            view = NotificationListView()
            view.request = request
            response = view.get(request)

        data = response.data

        # Handle envelope format: {"success": true, "data": {...}}
        if "data" in data and "success" in data:
            data = data["data"]

        # Envelope must contain all four pagination keys
        self.assertIn("page", data)
        self.assertIn("pageSize", data)
        self.assertIn("totalCount", data)
        self.assertIn("results", data)

        # Results count must not exceed page size
        self.assertLessEqual(
            len(data["results"]),
            data["pageSize"],
            f"Expected at most {data['pageSize']} results, got {len(data['results'])}",
        )

        # totalCount must reflect the full notification set
        self.assertEqual(
            data["totalCount"],
            n,
            f"totalCount should be {n}, got {data['totalCount']}",
        )

        # First page should be page 1
        self.assertEqual(data["page"], 1)

        # pageSize should match the default
        self.assertEqual(data["pageSize"], DEFAULT_PAGE_SIZE)
