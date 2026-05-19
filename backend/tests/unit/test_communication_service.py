"""Unit tests for CommunicationService (Requirement 9). Requirements: 9.1-9.8"""
import uuid
from unittest.mock import MagicMock, patch

from apps.common.communication_service import (
    CommunicationService,
    _DEFAULT_BODY,
    _DEFAULT_SUBJECT,
    _html_to_notification_text,
    _substitute,
)


def _mock_template(key="test_key", subject="Hello {{student_name}}", body="<p>Dear {{student_name}}</p>", channel="both", is_active=True):
    t = MagicMock()
    t.template_key = key
    t.subject_template = subject
    t.body_template = body
    t.channel = channel
    t.is_active = is_active
    return t


def _mock_app(uid=None, aid=None):
    a = MagicMock()
    a.id = aid or uuid.uuid4()
    a.user_id = str(uid or uuid.uuid4())
    a.first_name = "John"
    a.full_name = "John Doe"
    a.application_number = "APP-20250101-ABCD1234"
    a.program = "Computer Science"
    a.intake = "Jan 2026"
    a.status = "submitted"
    a.tracking_code = "TRK-ABCDEF123456"
    a.email = "john@example.com"
    return a


class TestRenderTemplate:
    """1. Template lookup and variable substitution (Req 9.1, 9.2, 9.4)."""

    @patch("apps.common.models.CommunicationTemplate.objects")
    def test_renders_template_with_context(self, mock_qs):
        tpl = _mock_template(
            subject="Welcome {{student_name}}",
            body="<p>Hello {{student_name}}, app {{application_number}}</p>",
        )
        mock_qs.filter.return_value.first.return_value = tpl

        subject, body = CommunicationService.render_template(
            "test_key", {"student_name": "Alice", "application_number": "APP-001"}
        )
        assert subject == "Welcome Alice"
        assert "Hello Alice" in body
        assert "APP-001" in body

    @patch("apps.common.models.CommunicationTemplate.objects")
    def test_missing_variable_replaced_with_empty(self, mock_qs):
        tpl = _mock_template(subject="Hi {{student_name}}", body="{{missing_var}}")
        mock_qs.filter.return_value.first.return_value = tpl

        subject, body = CommunicationService.render_template("test_key", {})
        assert subject == "Hi "
        assert body == ""


class TestHTMLSanitization:
    """2. HTML sanitization in variable values (Req 9.7)."""

    def test_html_in_variable_is_escaped(self):
        result = _substitute(
            "Hello {{name}}", {"name": '<script>alert("xss")</script>'}
        )
        assert "<script>" not in result
        assert "&lt;script&gt;" in result

    def test_angle_brackets_escaped(self):
        result = _substitute("{{val}}", {"val": "<b>bold</b>"})
        assert "<b>" not in result
        assert "&lt;b&gt;" in result


class TestFallback:
    """3. Fallback when template not found or inactive (Req 9.5)."""

    @patch("apps.common.models.CommunicationTemplate.objects")
    def test_fallback_when_not_found(self, mock_qs):
        mock_qs.filter.return_value.first.return_value = None

        subject, body = CommunicationService.render_template("nonexistent_key", {})
        assert subject == _DEFAULT_SUBJECT
        assert body == _DEFAULT_BODY

    @patch("apps.common.models.CommunicationTemplate.objects")
    def test_fallback_on_db_error(self, mock_qs):
        mock_qs.filter.side_effect = Exception("DB error")

        subject, body = CommunicationService.render_template("broken_key", {})
        assert subject == _DEFAULT_SUBJECT
        assert body == _DEFAULT_BODY

    @patch("apps.common.models.CommunicationTemplate.objects")
    def test_payment_expired_has_specific_fallback(self, mock_qs):
        mock_qs.filter.return_value.first.return_value = None

        subject, body = CommunicationService.render_template(
            "payment_expired",
            {"student_name": "Alice", "application_number": "MIHAS202600008"},
        )

        assert subject == "Payment Expired — New Payment Required"
        assert "Dear Alice" in body
        assert "MIHAS202600008" in body
        assert "new notification from MIHAS Admissions" not in body


class TestSendNotificationCreation:
    """4. Notification and EmailQueue creation (Req 9.3, 9.4)."""

    @patch("apps.common.outbox.queue_email")
    @patch("apps.common.outbox.create_notification")
    @patch("apps.common.models.CommunicationTemplate.objects")
    def test_send_creates_notification_and_email_for_both_channel(
        self, mock_tpl_qs, mock_notif_create, mock_queue_email
    ):
        tpl = _mock_template(channel="both")
        mock_tpl_qs.filter.return_value.first.return_value = tpl

        app = _mock_app()
        CommunicationService.send("test_key", app)

        mock_notif_create.assert_called_once()
        mock_queue_email.assert_called_once()
        assert mock_notif_create.call_args.kwargs["message"] == "Dear John"

    @patch("apps.common.outbox.queue_email")
    @patch("apps.common.outbox.create_notification")
    @patch("apps.common.models.CommunicationTemplate.objects")
    def test_send_notification_only_channel(
        self, mock_tpl_qs, mock_notif_create, mock_queue_email
    ):
        tpl = _mock_template(channel="notification")
        mock_tpl_qs.filter.return_value.first.return_value = tpl

        app = _mock_app()
        CommunicationService.send("test_key", app)

        mock_notif_create.assert_called_once()
        mock_queue_email.assert_not_called()

    @patch("apps.common.outbox.queue_email")
    @patch("apps.common.outbox.create_notification")
    @patch("apps.common.models.CommunicationTemplate.objects")
    def test_send_email_only_channel(
        self, mock_tpl_qs, mock_notif_create, mock_queue_email
    ):
        tpl = _mock_template(channel="email")
        mock_tpl_qs.filter.return_value.first.return_value = tpl

        app = _mock_app()
        CommunicationService.send("test_key", app)

        mock_notif_create.assert_not_called()
        mock_queue_email.assert_called_once()

    @patch("apps.common.outbox.queue_email")
    @patch("apps.common.outbox.create_notification")
    @patch("apps.common.models.CommunicationTemplate.objects")
    def test_send_fallback_when_template_missing(
        self, mock_tpl_qs, mock_notif_create, mock_queue_email
    ):
        """Fallback uses 'both' channel when template not found."""
        mock_tpl_qs.filter.return_value.first.return_value = None

        app = _mock_app()
        CommunicationService.send("nonexistent", app)

        # Fallback channel is 'both'
        mock_notif_create.assert_called_once()
        mock_queue_email.assert_called_once()


class TestSendExtraContext:
    """5. Extra context merges into template variables."""

    @patch("apps.common.outbox.queue_email")
    @patch("apps.common.outbox.create_notification")
    @patch("apps.common.models.CommunicationTemplate.objects")
    def test_extra_context_used_in_rendering(
        self, mock_tpl_qs, mock_notif_create, mock_queue_email
    ):
        tpl = _mock_template(
            subject="Feedback: {{admin_feedback}}",
            body="<p>{{admin_feedback}}</p>",
            channel="notification",
        )
        mock_tpl_qs.filter.return_value.first.return_value = tpl

        app = _mock_app()
        CommunicationService.send("test_key", app, extra_context={"admin_feedback": "Great work"})

        call_kwargs = mock_notif_create.call_args
        assert "Great work" in call_kwargs.kwargs.get("title", "") or "Great work" in str(call_kwargs)


class TestNotificationTextRendering:
    """6. In-app notifications use readable plain text."""

    def test_html_body_converts_to_plain_text(self):
        text = _html_to_notification_text(
            "<p>Dear Alice,</p><p>Your payment expired.</p><p>Best regards,<br>MIHAS Admissions</p>"
        )

        assert text == "Dear Alice,\n\nYour payment expired.\n\nBest regards,\nMIHAS Admissions"
