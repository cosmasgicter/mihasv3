"""Unit tests for application and draft expiry (Requirement 4). Requirements: 4.1-4.11"""
import uuid
from datetime import timedelta
from unittest.mock import MagicMock, patch

from apps.applications.duplicate_checker import NON_TERMINAL_STATUSES, TERMINAL_STATUSES


def _mock_app(status="draft", days_since_update=10, program="CS", intake="Jan 2026"):
    """Create a mock Application with configurable updated_at age."""
    from django.utils import timezone

    app = MagicMock()
    app.id = uuid.uuid4()
    app.user_id = str(uuid.uuid4())
    app.status = status
    app.program = program
    app.intake = intake
    app.full_name = "Test Student"
    app.email = "student@example.com"
    app.application_number = "APP-20250101-ABCD1234"
    app.updated_at = timezone.now() - timedelta(days=days_since_update)
    app.submitted_at = timezone.now() - timedelta(days=days_since_update)
    return app


# Patch paths — tasks use local imports so we patch the source models/services
_APP_MODEL = "apps.applications.models.Application"
_TRANSITION = "apps.applications.services.transition_application_status"
_NOTIFICATION = "apps.common.models.Notification"
_EMAIL_QUEUE = "apps.common.models.EmailQueue"
_SEND_EMAIL = "apps.common.tasks.send_email_task"
_PROFILE = "apps.accounts.models.Profile"
_SETTING = "apps.common.models.Setting"


class TestDraftExpiryReminderTrigger:
    """1. 7-day reminder trigger — draft_expiry_reminder_task finds drafts older than 7 days (Req 4.1, 4.2)."""

    @patch(_SEND_EMAIL)
    @patch(_EMAIL_QUEUE)
    @patch(_NOTIFICATION)
    @patch(_APP_MODEL)
    def test_sends_reminder_for_7_day_stale_draft(self, mock_app_cls, mock_notif, mock_email, mock_send):
        """Drafts with no updates in 7+ days get a reminder notification + email."""
        app = _mock_app(days_since_update=10)

        mock_app_cls.objects.filter.return_value = [app]
        mock_notif.objects.filter.return_value.exists.return_value = False
        mock_email.objects.create.return_value = MagicMock(id=uuid.uuid4())

        from apps.applications.tasks import draft_expiry_reminder_task
        result = draft_expiry_reminder_task()

        assert result["reminders_sent"] == 1
        mock_notif.objects.create.assert_called_once()
        notif_kwargs = mock_notif.objects.create.call_args[1]
        assert notif_kwargs["user_id"] == app.user_id
        assert notif_kwargs["title"] == "Complete Your Application Draft"
        mock_email.objects.create.assert_called_once()

    @patch(_SEND_EMAIL)
    @patch(_EMAIL_QUEUE)
    @patch(_NOTIFICATION)
    @patch(_APP_MODEL)
    def test_skips_already_notified_draft(self, mock_app_cls, mock_notif, mock_email, mock_send):
        """Deduplication: skip if reminder already sent today."""
        app = _mock_app(days_since_update=10)

        mock_app_cls.objects.filter.return_value = [app]
        mock_notif.objects.filter.return_value.exists.return_value = True  # already sent

        from apps.applications.tasks import draft_expiry_reminder_task
        result = draft_expiry_reminder_task()

        assert result["reminders_sent"] == 0
        mock_notif.objects.create.assert_not_called()


class TestDraftExpiryTransition:
    """2. 30-day expiry transition — drafts older than 30 days transition to expired (Req 4.3, 4.4)."""

    @patch(_SEND_EMAIL)
    @patch(_EMAIL_QUEUE)
    @patch(_NOTIFICATION)
    @patch(_TRANSITION)
    @patch(_APP_MODEL)
    def test_expires_draft_after_30_days(self, mock_app_cls, mock_transition, mock_notif, mock_email, mock_send):
        """Drafts with no updates for 30+ days are transitioned to expired."""
        app = _mock_app(days_since_update=35)

        mock_app_cls.objects.filter.return_value = [app]
        mock_email.objects.create.return_value = MagicMock(id=uuid.uuid4())

        from apps.applications.tasks import draft_expiry_reminder_task
        result = draft_expiry_reminder_task()

        assert result["expired"] == 1
        mock_transition.assert_called_once()
        call_kwargs = mock_transition.call_args[1]
        assert call_kwargs["new_status"] == "expired"
        assert call_kwargs["changed_by"] == "system"

    @patch(_SEND_EMAIL)
    @patch(_EMAIL_QUEUE)
    @patch(_NOTIFICATION)
    @patch(_TRANSITION)
    @patch(_APP_MODEL)
    def test_expired_draft_gets_notification_and_email(self, mock_app_cls, mock_transition, mock_notif, mock_email, mock_send):
        """Expired drafts trigger both a notification and an email to the student."""
        app = _mock_app(days_since_update=31)

        mock_app_cls.objects.filter.return_value = [app]
        mock_email.objects.create.return_value = MagicMock(id=uuid.uuid4())

        from apps.applications.tasks import draft_expiry_reminder_task
        draft_expiry_reminder_task()

        mock_notif.objects.create.assert_called_once()
        notif_kwargs = mock_notif.objects.create.call_args[1]
        assert notif_kwargs["title"] == "Application Draft Expired"
        assert notif_kwargs["type"] == "warning"
        assert notif_kwargs["priority"] == "high"
        mock_email.objects.create.assert_called_once()
        email_kwargs = mock_email.objects.create.call_args[1]
        assert email_kwargs["subject"] == "Application Draft Expired"


class TestUrgencyIndicator:
    """3. Urgency indicator for days 27–30 (Req 4.9)."""

    @patch(_SEND_EMAIL)
    @patch(_EMAIL_QUEUE)
    @patch(_NOTIFICATION)
    @patch(_APP_MODEL)
    def test_urgency_message_at_28_days(self, mock_app_cls, mock_notif, mock_email, mock_send):
        """Draft at 28 days (2 days until expiry) includes urgency indicator."""
        app = _mock_app(days_since_update=28)

        mock_app_cls.objects.filter.return_value = [app]
        mock_notif.objects.filter.return_value.exists.return_value = False
        mock_email.objects.create.return_value = MagicMock(id=uuid.uuid4())

        from apps.applications.tasks import draft_expiry_reminder_task
        result = draft_expiry_reminder_task()

        assert result["reminders_sent"] == 1
        notif_kwargs = mock_notif.objects.create.call_args[1]
        assert "expire in 2 days" in notif_kwargs["message"]
        assert notif_kwargs["priority"] == "high"

    @patch(_SEND_EMAIL)
    @patch(_EMAIL_QUEUE)
    @patch(_NOTIFICATION)
    @patch(_APP_MODEL)
    def test_urgency_message_at_29_days(self, mock_app_cls, mock_notif, mock_email, mock_send):
        """Draft at 29 days (1 day until expiry) includes singular urgency indicator."""
        app = _mock_app(days_since_update=29)

        mock_app_cls.objects.filter.return_value = [app]
        mock_notif.objects.filter.return_value.exists.return_value = False
        mock_email.objects.create.return_value = MagicMock(id=uuid.uuid4())

        from apps.applications.tasks import draft_expiry_reminder_task
        result = draft_expiry_reminder_task()

        assert result["reminders_sent"] == 1
        notif_kwargs = mock_notif.objects.create.call_args[1]
        assert "expire in 1 day" in notif_kwargs["message"]

    @patch(_SEND_EMAIL)
    @patch(_EMAIL_QUEUE)
    @patch(_NOTIFICATION)
    @patch(_APP_MODEL)
    def test_urgent_email_subject(self, mock_app_cls, mock_notif, mock_email, mock_send):
        """Drafts within 3 days of expiry get an urgent email subject."""
        app = _mock_app(days_since_update=27)

        mock_app_cls.objects.filter.return_value = [app]
        mock_notif.objects.filter.return_value.exists.return_value = False
        mock_email.objects.create.return_value = MagicMock(id=uuid.uuid4())

        from apps.applications.tasks import draft_expiry_reminder_task
        draft_expiry_reminder_task()

        email_kwargs = mock_email.objects.create.call_args[1]
        assert email_kwargs["subject"] == "Your Application Draft Will Expire Soon"

    @patch(_SEND_EMAIL)
    @patch(_EMAIL_QUEUE)
    @patch(_NOTIFICATION)
    @patch(_APP_MODEL)
    def test_no_urgency_for_early_reminder(self, mock_app_cls, mock_notif, mock_email, mock_send):
        """Drafts at 10 days (20 days until expiry) do NOT include urgency indicator."""
        app = _mock_app(days_since_update=10)

        mock_app_cls.objects.filter.return_value = [app]
        mock_notif.objects.filter.return_value.exists.return_value = False
        mock_email.objects.create.return_value = MagicMock(id=uuid.uuid4())

        from apps.applications.tasks import draft_expiry_reminder_task
        draft_expiry_reminder_task()

        notif_kwargs = mock_notif.objects.create.call_args[1]
        assert "expire in" not in notif_kwargs["message"]
        assert notif_kwargs["priority"] == "normal"
        email_kwargs = mock_email.objects.create.call_args[1]
        assert email_kwargs["subject"] == "Reminder: Complete Your Application"


class TestReviewSLABreachDetection:
    """4. SLA breach detection — review_sla_reminder_task finds apps older than threshold (Req 4.6-4.8)."""

    @patch(_SEND_EMAIL)
    @patch(_EMAIL_QUEUE)
    @patch(_NOTIFICATION)
    @patch(_PROFILE)
    @patch(_SETTING)
    @patch(_APP_MODEL)
    def test_detects_overdue_applications(self, mock_app_cls, mock_setting, mock_profile, mock_notif, mock_email, mock_send):
        """Finds submitted/under_review apps older than SLA threshold and notifies admins."""
        overdue_app = _mock_app(status="submitted", days_since_update=7)

        mock_setting.objects.filter.return_value.first.return_value = None  # default 5 days

        overdue_qs = MagicMock()
        overdue_qs.exists.return_value = True
        overdue_qs.count.return_value = 1
        overdue_qs.__iter__ = lambda self: iter([overdue_app])
        overdue_qs.__getitem__ = lambda self, key: [overdue_app][key] if isinstance(key, int) else [overdue_app]
        mock_app_cls.objects.filter.return_value.order_by.return_value = overdue_qs

        admin = MagicMock()
        admin.id = uuid.uuid4()
        admin.email = "admin@example.com"
        mock_profile.objects.filter.return_value = [admin]
        mock_notif.objects.filter.return_value.exists.return_value = False
        mock_email.objects.create.return_value = MagicMock(id=uuid.uuid4())

        from apps.applications.tasks import review_sla_reminder_task
        result = review_sla_reminder_task()

        assert result["overdue_count"] == 1
        assert result["admins_notified"] == 1
        mock_notif.objects.create.assert_called_once()

    @patch(_SEND_EMAIL)
    @patch(_EMAIL_QUEUE)
    @patch(_NOTIFICATION)
    @patch(_PROFILE)
    @patch(_SETTING)
    @patch(_APP_MODEL)
    def test_no_notification_when_no_overdue(self, mock_app_cls, mock_setting, mock_profile, mock_notif, mock_email, mock_send):
        """Returns zero counts when no applications exceed SLA."""
        mock_setting.objects.filter.return_value.first.return_value = None

        overdue_qs = MagicMock()
        overdue_qs.exists.return_value = False
        mock_app_cls.objects.filter.return_value.order_by.return_value = overdue_qs

        from apps.applications.tasks import review_sla_reminder_task
        result = review_sla_reminder_task()

        assert result["overdue_count"] == 0
        assert result["admins_notified"] == 0
        mock_notif.objects.create.assert_not_called()

    @patch(_SEND_EMAIL)
    @patch(_EMAIL_QUEUE)
    @patch(_NOTIFICATION)
    @patch(_PROFILE)
    @patch(_SETTING)
    @patch(_APP_MODEL)
    def test_configurable_sla_threshold(self, mock_app_cls, mock_setting, mock_profile, mock_notif, mock_email, mock_send):
        """SLA threshold is read from SystemSetting (key: review_sla_days)."""
        setting = MagicMock()
        setting.value = "10"
        mock_setting.objects.filter.return_value.first.return_value = setting

        overdue_qs = MagicMock()
        overdue_qs.exists.return_value = False
        mock_app_cls.objects.filter.return_value.order_by.return_value = overdue_qs

        from apps.applications.tasks import review_sla_reminder_task
        review_sla_reminder_task()

        # Verify filter was called — the SLA cutoff should use 10 days
        filter_call = mock_app_cls.objects.filter.call_args
        assert filter_call is not None
        assert "submitted_at__lt" in filter_call[1]

    @patch(_SEND_EMAIL)
    @patch(_EMAIL_QUEUE)
    @patch(_NOTIFICATION)
    @patch(_PROFILE)
    @patch(_SETTING)
    @patch(_APP_MODEL)
    def test_skips_already_notified_admin(self, mock_app_cls, mock_setting, mock_profile, mock_notif, mock_email, mock_send):
        """Deduplication: skip admin if already notified today."""
        overdue_app = _mock_app(status="submitted", days_since_update=7)
        mock_setting.objects.filter.return_value.first.return_value = None

        overdue_qs = MagicMock()
        overdue_qs.exists.return_value = True
        overdue_qs.count.return_value = 1
        overdue_qs.__iter__ = lambda self: iter([overdue_app])
        overdue_qs.__getitem__ = lambda self, key: [overdue_app][key] if isinstance(key, int) else [overdue_app]
        mock_app_cls.objects.filter.return_value.order_by.return_value = overdue_qs

        admin = MagicMock()
        admin.id = uuid.uuid4()
        admin.email = "admin@example.com"
        mock_profile.objects.filter.return_value = [admin]
        mock_notif.objects.filter.return_value.exists.return_value = True  # already notified

        from apps.applications.tasks import review_sla_reminder_task
        result = review_sla_reminder_task()

        assert result["admins_notified"] == 0
        mock_notif.objects.create.assert_not_called()


class TestExpiredExcludedFromDuplicateChecks:
    """5. Expired apps excluded from duplicate checks — expired in TERMINAL_STATUSES (Req 4.11)."""

    def test_expired_is_terminal(self):
        assert "expired" in TERMINAL_STATUSES

    def test_expired_not_non_terminal(self):
        assert "expired" not in NON_TERMINAL_STATUSES

    def test_expired_allows_reapplication(self):
        """Expired status being terminal means DuplicateChecker won't block new applications."""
        assert "expired" in TERMINAL_STATUSES
        assert "expired" not in NON_TERMINAL_STATUSES
