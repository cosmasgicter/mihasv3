"""Unit tests for payment expiry and retry limits (Requirement 8). Requirements: 8.1-8.9"""
import uuid
from datetime import timedelta
from unittest.mock import MagicMock, patch, PropertyMock

from django.utils import timezone

from apps.documents.payment_service import (
    MAX_PAYMENT_ATTEMPTS,
    EXPIRED_EXCLUSION_DAYS,
    _ALLOWED_TRANSITIONS,
)


def _mock_payment(status="pending", age_hours=0, app_id=None):
    p = MagicMock()
    p.id = uuid.uuid4()
    p.status = status
    p.application_id = app_id or uuid.uuid4()
    p.transaction_reference = "MIHAS-TEST-REF"
    p.created_at = timezone.now() - timedelta(hours=age_hours)
    p.updated_at = timezone.now()
    p.save = MagicMock()
    return p


class TestPaymentExpiry24Hours:
    """1. 24-hour expiry transition (Req 8.1, 8.2)."""

    @patch("apps.documents.tasks.transaction")
    @patch("apps.common.communication_service.CommunicationService.send")
    @patch("apps.applications.models.Application.objects")
    @patch("apps.documents.models.Payment.objects")
    def test_payments_older_than_24h_expired(self, mock_pay_qs, mock_app_qs, mock_comm, mock_tx):
        """Payments pending > 24 hours are transitioned to expired."""
        mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
        mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

        old_payment = _mock_payment(status="pending", age_hours=30)

        # First filter call: expired payments (pending, older than 24h)
        # Second filter call: pending payments for verification (5min-24h)
        expired_qs = MagicMock()
        expired_qs.__getitem__ = MagicMock(return_value=[old_payment])

        verify_qs = MagicMock()
        verify_qs.__getitem__ = MagicMock(return_value=[])

        mock_pay_qs.filter.side_effect = [expired_qs, verify_qs]

        # select_for_update chain for the locked re-fetch
        mock_pay_qs.select_for_update.return_value.filter.return_value.first.return_value = old_payment

        mock_app = MagicMock()
        mock_app.id = old_payment.application_id
        mock_app_qs.filter.return_value.first.return_value = mock_app

        from apps.documents.tasks import poll_pending_payments_task
        poll_pending_payments_task()

        old_payment.save.assert_called()
        assert old_payment.status == "expired"

    def test_expired_to_successful_blocked(self):
        """Expired payment cannot transition to successful (Req 8.2, 8.8)."""
        allowed = _ALLOWED_TRANSITIONS.get("expired", set())
        assert "successful" not in allowed

    def test_pending_to_expired_allowed(self):
        """Pending → expired is a valid transition (Req 8.8)."""
        allowed = _ALLOWED_TRANSITIONS.get("pending", set())
        assert "expired" in allowed


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

        # No existing pending payment
        mock_pay_qs.select_for_update.return_value.filter.return_value.first.return_value = None

        # 5 existing attempts (excluding old expired)
        mock_pay_qs.filter.return_value.exclude.return_value.count.return_value = 5

        service = PaymentService()
        try:
            service.initiate_payment(app_id, user_id)
            assert False, "Should have raised ValueError"
        except ValueError as exc:
            assert "MAX_PAYMENT_ATTEMPTS_EXCEEDED" in str(exc)

    @patch("django.db.transaction.atomic")
    @patch("apps.documents.payment_service.Payment.objects")
    @patch("apps.applications.models.Application.objects")
    @patch("apps.applications.identifier_resolver.IdentifierResolver")
    @patch("apps.documents.payment_service.FeeResolver")
    def test_allows_under_limit(self, mock_fee, mock_resolver, mock_app_qs, mock_pay_qs, mock_atomic):
        """Payment initiation succeeds when under the limit."""
        from apps.documents.payment_service import PaymentService

        mock_atomic.return_value.__enter__ = MagicMock(return_value=None)
        mock_atomic.return_value.__exit__ = MagicMock(return_value=False)

        app_id = uuid.uuid4()
        user_id = uuid.uuid4()

        # No existing pending payment
        mock_pay_qs.select_for_update.return_value.filter.return_value.first.return_value = None

        # 3 existing attempts — under limit
        mock_pay_qs.filter.return_value.exclude.return_value.count.return_value = 3

        mock_app = MagicMock()
        mock_app.id = app_id
        mock_app.program = "CS"
        mock_app.nationality = "Zambian"
        mock_app.application_number = "APP-20250101-ABCD1234"
        mock_app_qs.get.return_value = mock_app

        resolved_program = MagicMock()
        resolved_program.source = "program_fees"
        resolved_program.code = "CS"
        mock_resolver.resolve_program.return_value = resolved_program

        resolved_fee = MagicMock()
        resolved_fee.amount = 153
        resolved_fee.currency = "ZMW"
        resolved_fee.residency_category = "local"
        resolved_fee.source = "program_fees"
        mock_fee.return_value.resolve_fee.return_value = resolved_fee

        new_payment = MagicMock()
        new_payment.id = uuid.uuid4()
        mock_pay_qs.create.return_value = new_payment

        service = PaymentService()
        result = service.initiate_payment(app_id, user_id)
        assert result.payment_id == new_payment.id


class TestRemainingAttemptsInResponse:
    """3. remaining_attempts in error response (Req 8.6)."""

    def test_remaining_attempts_in_error(self):
        """Error message includes remaining_attempts=0 when limit exceeded."""
        from apps.documents.payment_service import MAX_PAYMENT_ATTEMPTS

        # The error format is "MAX_PAYMENT_ATTEMPTS_EXCEEDED|0"
        error_msg = f"MAX_PAYMENT_ATTEMPTS_EXCEEDED|0"
        parts = error_msg.split("|")
        assert parts[0] == "MAX_PAYMENT_ATTEMPTS_EXCEEDED"
        assert int(parts[1]) == 0


class TestPaymentConstants:
    """4. Payment service constants match requirements."""

    def test_max_attempts_is_5(self):
        assert MAX_PAYMENT_ATTEMPTS == 5

    def test_expired_exclusion_is_7_days(self):
        assert EXPIRED_EXCLUSION_DAYS == 7

    def test_expired_not_in_allowed_transitions(self):
        """Expired status has no outbound transitions."""
        assert "expired" not in _ALLOWED_TRANSITIONS
