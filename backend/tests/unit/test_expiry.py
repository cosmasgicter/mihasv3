"""Unit tests for application and draft expiry (Requirement 4). Requirements: 4.1-4.11"""
import uuid
from datetime import timedelta
from unittest.mock import MagicMock, patch

from apps.applications.duplicate_checker import NON_TERMINAL_STATUSES, TERMINAL_STATUSES
from apps.applications.services import SYSTEM_ACTOR_ID


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
_BULK_TRANSITION = "apps.applications.services.transition_applications_bulk"
_NOTIFICATION = "apps.common.models.Notification"
_EMAIL_QUEUE = "apps.common.models.EmailQueue"
_SEND_EMAIL = "apps.common.tasks.send_email_task"
_PROFILE = "apps.accounts.models.Profile"
_SETTING = "apps.common.models.Setting"
_OUTBOX_NOTIFY = "apps.common.outbox.create_notification"
_OUTBOX_EMAIL = "apps.common.outbox.queue_email"
# Batched outbox helpers (system-performance-hardening R6.4).
_OUTBOX_NOTIFY_BULK = "apps.common.outbox.create_notifications_bulk"
_OUTBOX_EMAIL_BULK = "apps.common.outbox.queue_emails_bulk"


class TestDraftExpiryReminderTrigger:
    """1. 7-day reminder trigger — draft_expiry_reminder_task finds drafts older than 7 days (Req 4.1, 4.2)."""

    @patch(_OUTBOX_EMAIL_BULK)
    @patch(_OUTBOX_NOTIFY_BULK)
    @patch(_NOTIFICATION)
    @patch(_APP_MODEL)
    def test_sends_reminder_for_7_day_stale_draft(self, mock_app_cls, mock_notif, mock_notify_bulk, mock_email_bulk):
        """Drafts with no updates in 7+ days get a reminder notification + email (batched)."""
        app = _mock_app(days_since_update=10)

        mock_app_cls.objects.filter.return_value = [app]
        # Batched dedup lookup returns no already-sent keys.
        mock_notif.objects.filter.return_value.values_list.return_value = []

        from apps.applications.tasks import draft_expiry_reminder_task
        result = draft_expiry_reminder_task()

        assert result["reminders_sent"] == 1
        mock_notify_bulk.assert_called_once()
        specs = mock_notify_bulk.call_args[0][0]
        assert len(specs) == 1
        assert specs[0]["user_id"] == app.user_id
        assert specs[0]["title"] == "Complete Your Application Draft"
        mock_email_bulk.assert_called_once()

    @patch(_OUTBOX_EMAIL_BULK)
    @patch(_OUTBOX_NOTIFY_BULK)
    @patch(_NOTIFICATION)
    @patch(_APP_MODEL)
    def test_skips_already_notified_draft(self, mock_app_cls, mock_notif, mock_notify_bulk, mock_email_bulk):
        """Deduplication: skip if reminder already sent today (batched lookup)."""
        from django.utils import timezone as tz

        app = _mock_app(days_since_update=10)
        dedup_key = f"draft_reminder_{app.id}_{tz.now().strftime('%Y-%m-%d')}"

        mock_app_cls.objects.filter.return_value = [app]
        mock_notif.objects.filter.return_value.values_list.return_value = [dedup_key]

        from apps.applications.tasks import draft_expiry_reminder_task
        result = draft_expiry_reminder_task()

        assert result["reminders_sent"] == 0
        mock_notify_bulk.assert_not_called()


class TestDraftExpiryTransition:
    """2. 30-day expiry transition — drafts older than 30 days transition to expired (Req 4.3, 4.4)."""

    @patch(_OUTBOX_EMAIL_BULK)
    @patch(_OUTBOX_NOTIFY_BULK)
    @patch(_BULK_TRANSITION)
    @patch(_APP_MODEL)
    def test_expires_draft_after_30_days(self, mock_app_cls, mock_bulk_transition, mock_notify_bulk, mock_email_bulk):
        """Drafts with no updates for 30+ days are transitioned to expired via the batch helper."""
        app = _mock_app(days_since_update=35)

        mock_app_cls.objects.filter.return_value = [app]
        mock_bulk_transition.return_value = [(app, "draft")]

        from apps.applications.tasks import draft_expiry_reminder_task
        result = draft_expiry_reminder_task()

        assert result["expired"] == 1
        mock_bulk_transition.assert_called_once()
        call_kwargs = mock_bulk_transition.call_args[1]
        assert call_kwargs["new_status"] == "expired"
        assert call_kwargs["changed_by"] == SYSTEM_ACTOR_ID

    @patch(_OUTBOX_EMAIL_BULK)
    @patch(_OUTBOX_NOTIFY_BULK)
    @patch(_BULK_TRANSITION)
    @patch(_APP_MODEL)
    def test_expired_draft_gets_notification_and_email(self, mock_app_cls, mock_bulk_transition, mock_notify_bulk, mock_email_bulk):
        """Expired drafts trigger both a notification and an email to the student (batched)."""
        app = _mock_app(days_since_update=31)

        mock_app_cls.objects.filter.return_value = [app]
        mock_bulk_transition.return_value = [(app, "draft")]

        from apps.applications.tasks import draft_expiry_reminder_task
        draft_expiry_reminder_task()

        mock_notify_bulk.assert_called_once()
        notif_specs = mock_notify_bulk.call_args[0][0]
        assert notif_specs[0]["title"] == "Application Draft Expired"
        assert notif_specs[0]["type"] == "warning"
        assert notif_specs[0]["priority"] == "high"
        mock_email_bulk.assert_called_once()
        email_specs = mock_email_bulk.call_args[0][0]
        assert email_specs[0]["subject"] == "Application Draft Expired"


class TestUrgencyIndicator:
    """3. Urgency indicator for days 27–30 (Req 4.9)."""

    @patch(_OUTBOX_EMAIL_BULK)
    @patch(_OUTBOX_NOTIFY_BULK)
    @patch(_NOTIFICATION)
    @patch(_APP_MODEL)
    def test_urgency_message_at_28_days(self, mock_app_cls, mock_notif, mock_notify_bulk, mock_email_bulk):
        """Draft at 28 days (2 days until expiry) includes urgency indicator."""
        app = _mock_app(days_since_update=28)

        mock_app_cls.objects.filter.return_value = [app]
        mock_notif.objects.filter.return_value.values_list.return_value = []

        from apps.applications.tasks import draft_expiry_reminder_task
        result = draft_expiry_reminder_task()

        assert result["reminders_sent"] == 1
        notif_specs = mock_notify_bulk.call_args[0][0]
        assert "expire in 2 days" in notif_specs[0]["message"]
        assert notif_specs[0]["priority"] == "high"

    @patch(_OUTBOX_EMAIL_BULK)
    @patch(_OUTBOX_NOTIFY_BULK)
    @patch(_NOTIFICATION)
    @patch(_APP_MODEL)
    def test_urgency_message_at_29_days(self, mock_app_cls, mock_notif, mock_notify_bulk, mock_email_bulk):
        """Draft at 29 days (1 day until expiry) includes singular urgency indicator."""
        app = _mock_app(days_since_update=29)

        mock_app_cls.objects.filter.return_value = [app]
        mock_notif.objects.filter.return_value.values_list.return_value = []

        from apps.applications.tasks import draft_expiry_reminder_task
        result = draft_expiry_reminder_task()

        assert result["reminders_sent"] == 1
        notif_specs = mock_notify_bulk.call_args[0][0]
        assert "expire in 1 day" in notif_specs[0]["message"]

    @patch(_OUTBOX_EMAIL_BULK)
    @patch(_OUTBOX_NOTIFY_BULK)
    @patch(_NOTIFICATION)
    @patch(_APP_MODEL)
    def test_urgent_email_subject(self, mock_app_cls, mock_notif, mock_notify_bulk, mock_email_bulk):
        """Drafts within 3 days of expiry get an urgent email subject."""
        app = _mock_app(days_since_update=27)

        mock_app_cls.objects.filter.return_value = [app]
        mock_notif.objects.filter.return_value.values_list.return_value = []

        from apps.applications.tasks import draft_expiry_reminder_task
        draft_expiry_reminder_task()

        email_specs = mock_email_bulk.call_args[0][0]
        assert email_specs[0]["subject"] == "Your Application Draft Will Expire Soon"

    @patch(_OUTBOX_EMAIL_BULK)
    @patch(_OUTBOX_NOTIFY_BULK)
    @patch(_NOTIFICATION)
    @patch(_APP_MODEL)
    def test_no_urgency_for_early_reminder(self, mock_app_cls, mock_notif, mock_notify_bulk, mock_email_bulk):
        """Drafts at 10 days (20 days until expiry) do NOT include urgency indicator."""
        app = _mock_app(days_since_update=10)

        mock_app_cls.objects.filter.return_value = [app]
        mock_notif.objects.filter.return_value.values_list.return_value = []

        from apps.applications.tasks import draft_expiry_reminder_task
        draft_expiry_reminder_task()

        notif_specs = mock_notify_bulk.call_args[0][0]
        assert "expire in" not in notif_specs[0]["message"]
        assert notif_specs[0]["priority"] == "normal"
        email_specs = mock_email_bulk.call_args[0][0]
        assert email_specs[0]["subject"] == "Reminder: Complete Your Application"


class TestReviewSLABreachDetection:
    """4. SLA breach detection — review_sla_reminder_task finds apps older than threshold (Req 4.6-4.8)."""

    @patch(_OUTBOX_EMAIL)
    @patch(_OUTBOX_NOTIFY)
    @patch(_NOTIFICATION)
    @patch(_PROFILE)
    @patch(_SETTING)
    @patch(_APP_MODEL)
    def test_detects_overdue_applications(self, mock_app_cls, mock_setting, mock_profile, mock_notif, mock_outbox_notify, mock_outbox_email):
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

        from apps.applications.tasks import review_sla_reminder_task
        result = review_sla_reminder_task()

        assert result["overdue_count"] == 1
        assert result["admins_notified"] == 1
        mock_outbox_notify.assert_called_once()

    @patch(_OUTBOX_EMAIL)
    @patch(_OUTBOX_NOTIFY)
    @patch(_NOTIFICATION)
    @patch(_PROFILE)
    @patch(_SETTING)
    @patch(_APP_MODEL)
    def test_no_notification_when_no_overdue(self, mock_app_cls, mock_setting, mock_profile, mock_notif, mock_outbox_notify, mock_outbox_email):
        """Returns zero counts when no applications exceed SLA."""
        mock_setting.objects.filter.return_value.first.return_value = None

        overdue_qs = MagicMock()
        overdue_qs.exists.return_value = False
        mock_app_cls.objects.filter.return_value.order_by.return_value = overdue_qs

        from apps.applications.tasks import review_sla_reminder_task
        result = review_sla_reminder_task()

        assert result["overdue_count"] == 0
        assert result["admins_notified"] == 0
        mock_outbox_notify.assert_not_called()

    @patch(_OUTBOX_EMAIL)
    @patch(_OUTBOX_NOTIFY)
    @patch(_NOTIFICATION)
    @patch(_PROFILE)
    @patch(_SETTING)
    @patch(_APP_MODEL)
    def test_configurable_sla_threshold(self, mock_app_cls, mock_setting, mock_profile, mock_notif, mock_outbox_notify, mock_outbox_email):
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

    @patch(_OUTBOX_EMAIL)
    @patch(_OUTBOX_NOTIFY)
    @patch(_NOTIFICATION)
    @patch(_PROFILE)
    @patch(_SETTING)
    @patch(_APP_MODEL)
    def test_skips_already_notified_admin(self, mock_app_cls, mock_setting, mock_profile, mock_notif, mock_outbox_notify, mock_outbox_email):
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
        mock_outbox_notify.assert_not_called()


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
