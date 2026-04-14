"""Property-based tests for bulk notification task retry logic.

# Feature: audit-remediation, Property 10: Bulk notification task retries on transient errors

For any transient error during send_bulk_notifications_task execution,
the task should call self.retry() with an exponential backoff delay of
60 * 2^attempt seconds, up to max_retries=3.

**Validates: Requirements 15.1, 15.2**
"""

import os
import uuid
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from celery.exceptions import Retry  # noqa: E402
from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.common.tasks import send_bulk_notifications_task  # noqa: E402

# Extract the raw unbound function so we can inject a mock task self
_raw_task_fn = send_bulk_notifications_task.__wrapped__.__func__


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Retry attempt numbers: 0, 1, 2 (max_retries=3 means attempts 0..2 before exhaustion)
retry_attempts = st.integers(min_value=0, max_value=2)

# Random notification ID lists (1-5 UUIDs)
notification_id_lists = st.lists(
    st.uuids().map(str),
    min_size=1,
    max_size=5,
)


# ---------------------------------------------------------------------------
# Property 10: Bulk notification task retries on transient errors
# ---------------------------------------------------------------------------


class TestBulkNotificationRetryOnTransientErrors(SimpleTestCase):
    """# Feature: audit-remediation, Property 10: Bulk notification task retries on transient errors

    For any transient error during send_bulk_notifications_task execution,
    the task should call self.retry() with an exponential backoff delay of
    60 * 2^attempt seconds, up to max_retries=3.

    **Validates: Requirements 15.1, 15.2**
    """

    @given(attempt=retry_attempts, notification_ids=notification_id_lists)
    @settings(max_examples=100, deadline=None)
    def test_retry_called_with_exponential_backoff(self, attempt, notification_ids):
        """For any retry attempt (0, 1, 2) and any notification ID list,
        when a transient error occurs, self.retry() is called with
        countdown = 60 * 2^attempt."""

        expected_countdown = 60 * (2 ** attempt)

        # Build a mock notification that will trigger the inner processing path
        mock_notification = MagicMock()
        mock_notification.id = uuid.uuid4()
        mock_notification.user_id = uuid.uuid4()

        # Build a mock task instance (self) with Celery task attributes
        mock_self = MagicMock()
        mock_self.request = MagicMock()
        mock_self.request.retries = attempt
        mock_self.max_retries = 3
        mock_self.MaxRetriesExceededError = type(
            "MaxRetriesExceededError", (Exception,), {}
        )
        # Make self.retry() raise Retry (normal Celery behavior)
        mock_self.retry = MagicMock(side_effect=Retry("retry"))

        # Mock the model classes that are lazily imported inside the task
        mock_notification_cls = MagicMock()
        mock_notification_cls.objects.filter.return_value = [mock_notification]

        mock_pref_cls = MagicMock()
        # Raise a transient error when checking user preferences
        mock_pref_cls.objects.filter.side_effect = ConnectionError(
            "transient DB error"
        )

        mock_email_cls = MagicMock()

        with patch(
            "apps.common.models.Notification", mock_notification_cls
        ), patch(
            "apps.common.models.UserNotificationPreference", mock_pref_cls
        ), patch(
            "apps.common.models.EmailQueue", mock_email_cls
        ):
            try:
                _raw_task_fn(mock_self, notification_ids)
            except Retry:
                pass  # Expected — Celery raises Retry to signal retry

        # Verify self.retry() was called
        mock_self.retry.assert_called_once()

        # Verify the countdown matches the exponential backoff formula
        call_kwargs = mock_self.retry.call_args
        actual_countdown = call_kwargs.kwargs.get(
            "countdown", call_kwargs[1].get("countdown")
        )
        self.assertEqual(
            actual_countdown,
            expected_countdown,
            f"Expected countdown={expected_countdown} for attempt={attempt}, "
            f"got {actual_countdown}",
        )
