"""Unit tests for email outbox claim and reclaim hardening."""

import os
from unittest.mock import MagicMock, patch, call

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django

django.setup()

from django.test import SimpleTestCase

from apps.common.tasks import (
    EMAIL_STATUS_PENDING,
    EMAIL_STATUS_PROCESSING,
    EMAIL_STATUS_RETRYING,
    _claim_email_for_delivery,
    process_pending_emails_task,
    send_email_task,
)


class TestEmailClaimHardening(SimpleTestCase):
    @patch("apps.common.models.EmailQueue.objects.filter")
    def test_claim_email_for_delivery_marks_row_processing(self, mock_filter):
        claim_qs = MagicMock()
        claim_qs.update.return_value = 1

        fetch_qs = MagicMock()
        email_record = MagicMock()
        fetch_qs.first.return_value = email_record

        mock_filter.side_effect = [claim_qs, fetch_qs]

        result = _claim_email_for_delivery("email-123")

        self.assertIs(result, email_record)
        claim_qs.update.assert_called_once_with(
            status=EMAIL_STATUS_PROCESSING,
            error_message="",
        )

    @patch("apps.common.tasks._send_via_resend")
    @patch("apps.common.tasks._send_via_smtp")
    @patch("apps.common.tasks._claim_email_for_delivery")
    @patch("apps.common.models.EmailQueue.objects.get")
    def test_duplicate_queued_task_exits_after_claim_loss(
        self,
        mock_get,
        mock_claim,
        mock_smtp,
        mock_resend,
    ):
        email_record = MagicMock()
        email_record.status = EMAIL_STATUS_PENDING
        mock_get.return_value = email_record
        mock_claim.return_value = None

        send_email_task.run("email-123")

        mock_smtp.assert_not_called()
        mock_resend.assert_not_called()


class TestEmailSweepHardening(SimpleTestCase):
    @patch("apps.common.tasks.send_email_task.delay")
    @patch("apps.common.models.EmailQueue.objects.filter")
    def test_sweep_reclaims_stale_processing_and_dispatches_retrying_and_pending(
        self,
        mock_filter,
        mock_delay,
    ):
        reclaim_qs = MagicMock()
        reclaim_qs.update.return_value = 2

        pending_qs = MagicMock()
        pending_qs.values_list.return_value = ["pending-1"]

        retrying_qs = MagicMock()
        retrying_qs.values_list.return_value = ["retry-1", "retry-2"]

        def filter_side_effect(*args, **kwargs):
            status = kwargs.get("status")
            if status == EMAIL_STATUS_PROCESSING:
                return reclaim_qs
            if status == EMAIL_STATUS_PENDING:
                return pending_qs
            if status == EMAIL_STATUS_RETRYING:
                return retrying_qs
            raise AssertionError(f"Unexpected filter kwargs: {kwargs}")

        mock_filter.side_effect = filter_side_effect

        process_pending_emails_task.run()

        reclaim_qs.update.assert_called_once_with(
            status=EMAIL_STATUS_RETRYING,
            error_message="Recovered stale processing email for re-dispatch",
        )
        mock_delay.assert_has_calls(
            [call("pending-1"), call("retry-1"), call("retry-2")]
        )
        self.assertEqual(mock_delay.call_count, 3)
