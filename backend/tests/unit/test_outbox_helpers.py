"""Unit tests for shared durable side-effect helpers."""

import os
from contextlib import nullcontext
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django

django.setup()

from django.test import SimpleTestCase, override_settings

from apps.common.outbox import create_notification, queue_email


class TestQueueEmail(SimpleTestCase):
    @patch("apps.common.outbox.transaction.on_commit", side_effect=lambda fn: fn())
    @patch("apps.common.outbox.transaction.atomic", side_effect=lambda: nullcontext())
    @patch("apps.common.outbox.dispatch_email")
    @patch("apps.common.models.OutboxEvent.objects.create")
    @patch("apps.common.models.EmailQueue.objects.create")
    def test_queue_email_persists_and_dispatches(self, mock_create, mock_outbox_create, mock_dispatch, _mock_atomic, _mock_on_commit):
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
        mock_dispatch.assert_called_once_with("email-123")

    @patch("apps.common.outbox.transaction.on_commit", side_effect=lambda fn: fn())
    @patch("apps.common.outbox.transaction.atomic", side_effect=lambda: nullcontext())
    @patch("apps.common.outbox.dispatch_email")
    @patch("apps.common.models.OutboxEvent.objects.create")
    @patch("apps.common.models.EmailQueue.objects.create")
    def test_queue_email_can_skip_dispatch(self, mock_create, mock_outbox_create, mock_dispatch, _mock_atomic, _mock_on_commit):
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
        mock_dispatch.assert_not_called()


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

        create_kwargs = mock_create.call_args.kwargs
        self.assertEqual(create_kwargs["title"], "Title")
        self.assertEqual(create_kwargs["message"], "Message")
        self.assertEqual(create_kwargs["type"], "warning")
        self.assertEqual(create_kwargs["priority"], "high")

    @patch("apps.common.outbox.transaction.atomic", side_effect=lambda: nullcontext())
    @patch("apps.common.models.OutboxEvent.objects.create")
    @patch("apps.common.models.Notification.objects.create")
    def test_create_notification_normalizes_unsafe_content(self, mock_create, mock_outbox_create, _mock_atomic):
        notification = MagicMock()
        notification.id = "notification-123"
        mock_create.return_value = notification

        create_notification(
            user_id="user-123",
            title="<strong>Title</strong>",
            message="<p>Body<br>Next</p>",
            type="general",
            priority="not-real",
            action_url="https://evil.example/path",
        )

        create_kwargs = mock_create.call_args.kwargs
        self.assertEqual(create_kwargs["title"], "Title")
        self.assertEqual(create_kwargs["message"], "Body\nNext")
        self.assertEqual(create_kwargs["type"], "info")
        self.assertEqual(create_kwargs["priority"], "normal")
        self.assertIsNone(create_kwargs["action_url"])

        payload = mock_outbox_create.call_args.kwargs["payload"]
        self.assertEqual(payload["message"], "Body\nNext")
        self.assertEqual(payload["type"], "info")
        self.assertIsNone(payload["action_url"])

    @override_settings(FRONTEND_URL="https://apply.mihas.edu.zm")
    @patch("apps.common.outbox.transaction.atomic", side_effect=lambda: nullcontext())
    @patch("apps.common.models.OutboxEvent.objects.create")
    @patch("apps.common.models.Notification.objects.create")
    def test_create_notification_converts_same_origin_action_url(self, mock_create, _mock_outbox_create, _mock_atomic):
        notification = MagicMock()
        notification.id = "notification-456"
        mock_create.return_value = notification

        create_notification(
            user_id="user-123",
            title="Title",
            message="Message",
            action_url="https://apply.mihas.edu.zm/student/communications?page=1#latest",
        )

        self.assertEqual(
            mock_create.call_args.kwargs["action_url"],
            "/student/communications?page=1#latest",
        )
