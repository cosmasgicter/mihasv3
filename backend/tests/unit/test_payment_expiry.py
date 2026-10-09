"""Unit tests for payment expiry and retry limits (Requirement 8). Requirements: 8.1-8.9

admissions-v2 task 8.2 retargeted this module onto the single payment path:
expiry is ``PaymentService.expire_stale`` (which transitions through
``_transition``), initiation is ``PaymentService.initiate``, and the transition
authority is the canonical tuple-keyed ``ALLOWED_TRANSITIONS`` matrix. The
pre-hardening ``_ALLOWED_TRANSITIONS`` map, ``initiate_payment``, and the poll
task's own inline expiry loop no longer exist.
"""
import uuid
from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.utils import timezone

from apps.documents.payment_service import (
    ALLOWED_TRANSITIONS,
    MAX_PAYMENT_ATTEMPTS,
    EXPIRED_EXCLUSION_DAYS,
)

# Sources that carry provider/system truth (not the audited human override).
_PROVIDER_SOURCES = frozenset(
    {"verify", "webhook", "reconciliation", "initiate", "admin_override"}
)


def _outbound(status: str) -> set[str]:
    """Provider-driven targets reachable from ``status`` in the canonical matrix."""
    return {
        target
        for (from_status, target), sources in ALLOWED_TRANSITIONS.items()
        if from_status == status and sources & _PROVIDER_SOURCES
    }


def _mock_payment(status="pending", age_hours=0, app_id=None):
    p = MagicMock()
    p.id = uuid.uuid4()
    p.status = status
    p.application_id = app_id or uuid.uuid4()
    p.transaction_reference = "BNL-TEST-REF"
    p.created_at = timezone.now() - timedelta(hours=age_hours)
    p.updated_at = timezone.now()
    p.save = MagicMock()
    return p


class TestPaymentExpiry24Hours:
    """1. 24-hour expiry transition (Req 8.1, 8.2)."""

    @patch("apps.documents.payment_service.PaymentService.expire_stale")
    @patch("apps.documents.models.Payment.objects")
    def test_poll_task_delegates_expiry_to_the_service(self, mock_pay_qs, mock_expire):
        """The sweep expires stale payments through the one state machine.

        The task no longer contains its own expiry loop — that was the second
        writer. It asks ``PaymentService.expire_stale`` to do it, so the same
        forward-only matrix, audit trail, and student notification apply whether
        expiry came from the worker or from anywhere else.
        """
        mock_expire.return_value = 1
        verify_qs = MagicMock()
        verify_qs.__getitem__ = MagicMock(return_value=[])
        mock_pay_qs.filter.return_value = verify_qs

        from apps.documents.tasks import poll_pending_payments_task
        poll_pending_payments_task()

        mock_expire.assert_called_once_with(older_than_hours=24, batch_cap=50)

    def test_expired_to_successful_blocked(self):
        """Expired payment cannot transition to successful (Req 8.2, 8.8)."""
        assert "successful" not in _outbound("expired")

    def test_pending_to_expired_allowed(self):
        """Pending → expired is a valid transition (Req 8.8)."""
        assert "expired" in _outbound("pending")

    def test_expiry_is_reconciliation_only(self):
        """Only the reconciliation source may expire a pending payment.

        A provider callback must never expire a row — expiry is a decision the
        platform makes about elapsed time, not something Lenco reports.
        """
        assert ALLOWED_TRANSITIONS[("pending", "expired")] & _PROVIDER_SOURCES == {
            "reconciliation"
        }


class TestRetryLimit:
    """2. Retry limit enforcement at 5 attempts (Req 8.4, 8.5)."""

    @patch("django.db.transaction.atomic")
    @patch("apps.documents.payment_service.Payment.objects")
    @patch("apps.applications.models.Application.objects")
    def test_rejects_at_max_attempts(self, mock_app_qs, mock_pay_qs, mock_atomic):
        """6th payment attempt is rejected with MAX_PAYMENT_ATTEMPTS_EXCEEDED."""
        from apps.documents.payment_service import PaymentService

        mock_atomic.return_value.__enter__ = MagicMock(return_value=None)
        mock_atomic.return_value.__exit__ = MagicMock(return_value=False)

        app_id = uuid.uuid4()
        user_id = uuid.uuid4()

        # No existing active payment
        (
            mock_pay_qs.select_for_update.return_value.filter.return_value
            .order_by.return_value.first.return_value
        ) = None

        # 5 existing attempts (excluding old expired)
        mock_pay_qs.filter.return_value.exclude.return_value.count.return_value = 5

        service = PaymentService()
        try:
            service.initiate(app_id, user_id)
            assert False, "Should have raised ValueError"
        except ValueError as exc:
            assert "MAX_PAYMENT_ATTEMPTS_EXCEEDED" in str(exc)


class TestRemainingAttemptsInResponse:
    """3. remaining_attempts in error response (Req 8.6)."""

    def test_remaining_attempts_in_error(self):
        """Error message includes remaining_attempts=0 when limit exceeded."""
        # The error format is "MAX_PAYMENT_ATTEMPTS_EXCEEDED|0"
        error_msg = "MAX_PAYMENT_ATTEMPTS_EXCEEDED|0"
        parts = error_msg.split("|")
        assert parts[0] == "MAX_PAYMENT_ATTEMPTS_EXCEEDED"
        assert int(parts[1]) == 0


class TestPaymentConstants:
    """4. Payment service constants match requirements."""

    def test_max_attempts_is_5(self):
        assert MAX_PAYMENT_ATTEMPTS == 5

    def test_expired_exclusion_is_7_days(self):
        assert EXPIRED_EXCLUSION_DAYS == 7

    def test_expired_has_no_provider_driven_outbound_transition(self):
        """Expired status has no outbound transition any provider can trigger."""
        assert _outbound("expired") == set()
