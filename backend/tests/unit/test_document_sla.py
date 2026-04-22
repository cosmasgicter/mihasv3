"""Unit tests for document verification SLA task (Requirement 7). Requirements: 7.1-7.8"""
import uuid
from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.utils import timezone


_DOC_MODEL = "apps.documents.models.ApplicationDocument"
_SETTING = "apps.common.models.Setting"
_PROFILE = "apps.accounts.models.Profile"
_OUTBOX_NOTIFY = "apps.common.outbox.create_notification"
_OUTBOX_EMAIL = "apps.common.outbox.queue_email"


def _mock_doc(age_days, doc_type="NRC", app_id=None):
    doc = MagicMock()
    doc.id = uuid.uuid4()
    doc.document_type = doc_type
    doc.application_id = app_id or uuid.uuid4()
    doc.verification_status = "pending"
    doc.created_at = timezone.now() - timedelta(days=age_days)
    return doc


def _mock_admin(email="admin@test.com"):
    admin = MagicMock()
    admin.id = uuid.uuid4()
    admin.email = email
    admin.role = "admin"
    return admin


class TestSLABreachDetection:
    """1. SLA breach detection at threshold (Req 7.2, 7.4)."""

    @patch(_OUTBOX_EMAIL)
    @patch(_OUTBOX_NOTIFY)
    @patch(_PROFILE)
    @patch(_SETTING)
    @patch(_DOC_MODEL)
    def test_detects_overdue_documents(
        self, mock_doc_cls, mock_setting, mock_profile, mock_outbox_notify, mock_outbox_email
    ):
        """Documents older than SLA threshold are detected and admins notified."""
        overdue_doc = _mock_doc(age_days=7)
        mock_setting.objects.filter.return_value.first.return_value = None  # default 5 days

        mock_doc_cls.objects.filter.return_value.select_related.return_value.__getitem__ = (
            MagicMock(return_value=[overdue_doc])
        )

        admin = _mock_admin()
        mock_profile.objects.filter.return_value = [admin]

        from apps.documents.tasks import document_verification_sla_task
        document_verification_sla_task()

        mock_outbox_notify.assert_called()
        mock_outbox_email.assert_called()

    @patch(_OUTBOX_EMAIL)
    @patch(_OUTBOX_NOTIFY)
    @patch(_PROFILE)
    @patch(_SETTING)
    @patch(_DOC_MODEL)
    def test_no_notification_when_no_overdue(
        self, mock_doc_cls, mock_setting, mock_profile, mock_outbox_notify, mock_outbox_email
    ):
        """No notifications when all documents are within SLA."""
        mock_setting.objects.filter.return_value.first.return_value = None

        mock_doc_cls.objects.filter.return_value.select_related.return_value.__getitem__ = (
            MagicMock(return_value=[])
        )

        from apps.documents.tasks import document_verification_sla_task
        result = document_verification_sla_task()

        mock_outbox_notify.assert_not_called()
        assert result == {"notified": 0, "escalated": 0}


class TestEscalationAt2xThreshold:
    """2. Escalation at 2x threshold (Req 7.5)."""

    @patch(_OUTBOX_EMAIL)
    @patch(_OUTBOX_NOTIFY)
    @patch(_PROFILE)
    @patch(_SETTING)
    @patch(_DOC_MODEL)
    def test_escalation_email_sent_at_2x_threshold(
        self, mock_doc_cls, mock_setting, mock_profile, mock_outbox_notify, mock_outbox_email
    ):
        """Documents older than 2x SLA threshold trigger escalation email."""
        escalation_doc = _mock_doc(age_days=12)
        mock_setting.objects.filter.return_value.first.return_value = None

        mock_doc_cls.objects.filter.return_value.select_related.return_value.__getitem__ = (
            MagicMock(return_value=[escalation_doc])
        )

        admin = _mock_admin()
        mock_profile.objects.filter.return_value = [admin]

        from apps.documents.tasks import document_verification_sla_task
        result = document_verification_sla_task()

        # At least 2 queue_email calls: one for admin summary, one for escalation
        assert mock_outbox_email.call_count >= 2
        calls = mock_outbox_email.call_args_list
        subjects = [c[1].get("subject", "") for c in calls]
        assert any("ESCALATION" in s for s in subjects)


class TestConfigurableThreshold:
    """3. Configurable threshold via SystemSetting (Req 7.3)."""

    @patch(_OUTBOX_EMAIL)
    @patch(_OUTBOX_NOTIFY)
    @patch(_PROFILE)
    @patch(_SETTING)
    @patch(_DOC_MODEL)
    def test_custom_sla_threshold(
        self, mock_doc_cls, mock_setting, mock_profile, mock_outbox_notify, mock_outbox_email
    ):
        """Custom SLA threshold from SystemSetting is respected."""
        setting = MagicMock()
        setting.value = "3"
        mock_setting.objects.filter.return_value.first.return_value = setting

        overdue_doc = _mock_doc(age_days=4)
        mock_doc_cls.objects.filter.return_value.select_related.return_value.__getitem__ = (
            MagicMock(return_value=[overdue_doc])
        )

        admin = _mock_admin()
        mock_profile.objects.filter.return_value = [admin]

        from apps.documents.tasks import document_verification_sla_task
        result = document_verification_sla_task()

        mock_outbox_notify.assert_called()
        assert result["notified"] == 1
