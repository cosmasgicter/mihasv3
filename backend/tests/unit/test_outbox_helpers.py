"""Unit tests for shared durable side-effect helpers."""

import os
from contextlib import nullcontext
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django

django.setup()

from django.test import SimpleTestCase

from apps.common.outbox import create_notification, queue_email


class TestQueueEmail(SimpleTestCase):
    @patch("apps.common.outbox.transaction.on_commit", side_effect=lambda fn: fn())
    @patch("apps.common.outbox.transaction.atomic", side_effect=lambda: nullcontext())
    @patch("apps.common.tasks.send_email_task.delay")
    @patch("apps.common.models.OutboxEvent.objects.create")
    @patch("apps.common.models.EmailQueue.objects.create")
    def test_queue_email_persists_and_dispatches(self, mock_create, mock_outbox_create, mock_delay, _mock_atomic, _mock_on_commit):
        email_record = MagicMock()
        email_record.id = "email-123"
        mock_create.return_value = email_record

        result = queue_email(
            recipient_email="student@example.com",
            subject="Subject",
            body="<p>Body</p>",
        )

        self.assertIs(result, email_record)
        mock_create.assert_called_once()
        mock_outbox_create.assert_called_once()
        mock_delay.assert_called_once_with("email-123")

    @patch("apps.common.outbox.transaction.on_commit", side_effect=lambda fn: fn())
    @patch("apps.common.outbox.transaction.atomic", side_effect=lambda: nullcontext())
    @patch("apps.common.tasks.send_email_task.delay")
    @patch("apps.common.models.OutboxEvent.objects.create")
    @patch("apps.common.models.EmailQueue.objects.create")
    def test_queue_email_can_skip_dispatch(self, mock_create, mock_outbox_create, mock_delay, _mock_atomic, _mock_on_commit):
        email_record = MagicMock()
        email_record.id = "email-456"
        mock_create.return_value = email_record

        queue_email(
            recipient_email="student@example.com",
            subject="Subject",
            body="<p>Body</p>",
            dispatch=False,
        )

        mock_create.assert_called_once()
        mock_outbox_create.assert_called_once()
        mock_delay.assert_not_called()


class TestCreateNotification(SimpleTestCase):
    @patch("apps.common.outbox.transaction.atomic", side_effect=lambda: nullcontext())
    @patch("apps.common.models.OutboxEvent.objects.create")
    @patch("apps.common.models.Notification.objects.create")
    def test_create_notification_persists_notification(self, mock_create, mock_outbox_create, _mock_atomic):
        notification = MagicMock()
        mock_create.return_value = notification

        result = create_notification(
            user_id="user-123",
            title="Title",
            message="Message",
            type="warning",
            priority="high",
        )

        self.assertIs(result, notification)
        mock_create.assert_called_once()
        mock_outbox_create.assert_called_once()
