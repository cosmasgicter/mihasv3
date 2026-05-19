"""Tests for channel-aware notification body (Task 4).

Verifies that in-app notifications do NOT contain email-only copy like
'Please log in to your account' when the user is already logged in.
"""
import uuid
from unittest.mock import MagicMock, patch

import pytest

from apps.common.communication_service import (
    CommunicationService,
    _DEFAULT_NOTIFICATION_TEXT,
    _strip_email_chrome_for_notification,
)


def _mock_app():
    a = MagicMock()
    a.id = uuid.uuid4()
    a.user_id = str(uuid.uuid4())
    a.first_name = "John"
    a.full_name = "John Doe"
    a.application_number = "APP-20250101-ABCD1234"
    a.program = "Computer Science"
    a.intake = "Jan 2026"
    a.status = "submitted"
    a.tracking_code = "TRK-ABCDEF123456"
    a.email = "john@example.com"
    return a


class TestStripEmailChrome:
    """_strip_email_chrome_for_notification removes email-only paragraphs."""

    def test_removes_please_log_in_paragraph(self):
        html = "<p>Dear Alice,</p><p>Please log in to your account for details.</p>"
        result = _strip_email_chrome_for_notification(html)
        assert "Please log in" not in result
        assert "Dear Alice" in result

    def test_removes_best_regards_paragraph(self):
        html = "<p>Your app was submitted.</p><p>Best regards,<br>MIHAS Admissions</p>"
        result = _strip_email_chrome_for_notification(html)
        assert "Best regards" not in result
        assert "Your app was submitted" in result

    def test_removes_best_regards_with_inner_content(self):
        html = "<p>Info here.</p><p>Best regards,<br>The MIHAS Team<br>Lusaka, Zambia</p>"
        result = _strip_email_chrome_for_notification(html)
        assert "Best regards" not in result
        assert "Info here" in result

    def test_preserves_unrelated_content(self):
        html = "<p>Your application has been approved.</p><p>Congratulations!</p>"
        result = _strip_email_chrome_for_notification(html)
        assert result == html


class TestRenderTemplateForNotification:
    """render_template with for_notification flag."""

    @patch("apps.common.models.CommunicationTemplate.objects")
    def test_missing_key_for_notification_uses_dashboard_text(self, mock_qs):
        mock_qs.filter.return_value.first.return_value = None
        _, body = CommunicationService.render_template("nonexistent", {}, for_notification=True)
        assert "Open the dashboard" in body
        assert "log in" not in body.lower()

    @patch("apps.common.models.CommunicationTemplate.objects")
    def test_missing_key_default_contains_log_in(self, mock_qs):
        mock_qs.filter.return_value.first.return_value = None
        _, body = CommunicationService.render_template("nonexistent", {}, for_notification=False)
        assert "Please log in to your account" in body


@pytest.mark.django_db
class TestSendChannelSplit:
    """End-to-end send with channel-aware body."""

    @patch("apps.common.outbox.queue_email")
    @patch("apps.common.outbox.create_notification")
    @patch("apps.common.models.CommunicationTemplate.objects")
    def test_both_channel_notification_lacks_log_in(self, mock_tpl_qs, mock_notif, mock_email):
        """Missing template + channel='both' → notification message lacks 'log in'."""
        mock_tpl_qs.filter.return_value.first.return_value = None
        app = _mock_app()
        CommunicationService.send("missing_key", app)

        mock_notif.assert_called_once()
        notif_message = mock_notif.call_args.kwargs["message"]
        assert "log in" not in notif_message.lower()
        assert "dashboard" in notif_message.lower()

        # Email should still be queued
        mock_email.assert_called_once()

    @patch("apps.common.outbox.queue_email")
    @patch("apps.common.outbox.create_notification")
    @patch("apps.common.models.CommunicationTemplate.objects")
    def test_notification_only_no_email_queued(self, mock_tpl_qs, mock_notif, mock_email):
        """channel='notification' → no email queued."""
        tpl = MagicMock()
        tpl.template_key = "test_notif_only"
        tpl.subject_template = "Hello {{student_name}}"
        tpl.body_template = "<p>Dear {{student_name}}, your app is ready.</p>"
        tpl.channel = "notification"
        tpl.is_active = True
        mock_tpl_qs.filter.return_value.first.return_value = tpl

        app = _mock_app()
        CommunicationService.send("test_notif_only", app)

        mock_notif.assert_called_once()
        mock_email.assert_not_called()
