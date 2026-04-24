"""Unit tests for bulk notification task retry behavior."""

import os
import uuid
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from celery.exceptions import Retry  # noqa: E402
from django.test import SimpleTestCase  # noqa: E402

from apps.common.tasks import send_bulk_notifications_task  # noqa: E402

_raw_task_fn = send_bulk_notifications_task.__wrapped__.__func__


class TestBulkNotificationTask(SimpleTestCase):
    def test_retry_only_reschedules_failed_tail_of_batch(self):
        first = MagicMock()
        first.id = uuid.uuid4()
        first.user_id = uuid.uuid4()
        first.title = "First"
        first.message = "First message"

        second = MagicMock()
        second.id = uuid.uuid4()
        second.user_id = uuid.uuid4()
        second.title = "Second"
        second.message = "Second message"

        third = MagicMock()
        third.id = uuid.uuid4()
        third.user_id = uuid.uuid4()
        third.title = "Third"
        third.message = "Third message"

        task_self = MagicMock()
        task_self.request = MagicMock()
        task_self.request.retries = 1
        task_self.MaxRetriesExceededError = type("MaxRetriesExceededError", (Exception,), {})
        task_self.retry = MagicMock(side_effect=Retry("retry"))

        pref_qs = MagicMock()
        pref_qs.first.side_effect = [None, ConnectionError("transient failure")]

        user_qs = MagicMock()
        user_qs.first.side_effect = [
            MagicMock(email="first@example.com"),
        ]

        with patch("apps.common.models.Notification.objects.filter", return_value=[first, second, third]), \
             patch("apps.common.models.UserNotificationPreference.objects.filter", return_value=pref_qs), \
             patch("apps.accounts.models.Profile.objects.filter", return_value=user_qs), \
             patch("apps.common.outbox.queue_email") as mock_queue_email:
            try:
                _raw_task_fn(task_self, [str(first.id), str(second.id), str(third.id)])
            except Retry:
                pass

        mock_queue_email.assert_called_once_with(
            recipient_email="first@example.com",
            subject="First",
            body="First message",
        )
        task_self.retry.assert_called_once()
        retry_kwargs = task_self.retry.call_args.kwargs
        self.assertEqual(
            retry_kwargs["args"],
            [[str(second.id), str(third.id)]],
        )
        self.assertEqual(retry_kwargs["countdown"], 120)
