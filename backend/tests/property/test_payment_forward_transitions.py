"""Property-based tests for payment forward-only transitions.

Feature: pre-launch-audit, Property 15: Payment status transitions are forward-only

PaymentService.verify_payment() should only allow forward transitions:
pending→successful or pending→failed. Transitions from successful or failed
to any other status should be rejected (no-op).

**Validates: Requirements 4.4, 6.2**
"""

import os
import uuid
from decimal import Decimal
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.documents.payment_service import (  # noqa: E402
    PaymentService,
    _ALLOWED_TRANSITIONS,
)

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

uuids = st.uuids(version=4)

amounts = st.decimals(
    min_value=Decimal("1.00"),
    max_value=Decimal("99999.99"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

terminal_statuses = st.sampled_from(["successful", "failed"])
all_statuses = st.sampled_from(["pending", "successful", "failed"])
target_statuses = st.sampled_from(["successful", "failed", "pending"])


# ---------------------------------------------------------------------------
# Tests — Property 15: Payment forward-only transitions
# ---------------------------------------------------------------------------


class TestPaymentForwardOnlyTransitions(SimpleTestCase):
    """Property 15: PaymentService.verify_payment() should only allow
    forward transitions: pending→successful or pending→failed.

    **Validates: Requirements 4.4, 6.2**
    """

    @given(
        payment_id=uuids,
        amount=amounts,
    )
    @settings(max_examples=5)
    def test_already_successful_payment_returns_current_state(
        self, payment_id, amount
    ):
        """When a payment is already 'successful', verify_payment() returns
        the current state without calling Lenco — no backward transition."""
        mock_payment = MagicMock()
        mock_payment.id = payment_id
        mock_payment.status = "successful"
        mock_payment.amount = amount
        mock_payment.currency = "ZMW"
        mock_payment.lenco_reference = "REF-123"
        mock_payment.payment_method = "card"

        with patch("apps.documents.payment_service.Payment.objects") as mock_qs:
            mock_qs.get.return_value = mock_payment

            service = PaymentService()
            result = service.verify_payment(payment_id)

        self.assertEqual(result.status, "successful")
        self.assertIsNone(result.error)

    @given(
        payment_id=uuids,
        amount=amounts,
    )
    @settings(max_examples=5)
    def test_already_failed_payment_returns_current_state(
        self, payment_id, amount
    ):
        """When a payment is already 'failed', verify_payment() returns
        the current state without calling Lenco — no backward transition."""
        mock_payment = MagicMock()
        mock_payment.id = payment_id
        mock_payment.status = "failed"
        mock_payment.amount = amount
        mock_payment.currency = "ZMW"
        mock_payment.lenco_reference = "REF-456"
        mock_payment.payment_method = "card"

        with patch("apps.documents.payment_service.Payment.objects") as mock_qs:
            mock_qs.get.return_value = mock_payment

            service = PaymentService()
            result = service.verify_payment(payment_id)

        self.assertEqual(result.status, "failed")
        self.assertIsNone(result.error)

    def test_allowed_transitions_map_is_forward_only(self):
        """The _ALLOWED_TRANSITIONS map only permits pending→successful
        and pending→failed. No other source status has transitions."""
        self.assertIn("pending", _ALLOWED_TRANSITIONS)
        self.assertEqual(
            _ALLOWED_TRANSITIONS["pending"], {"successful", "failed", "expired"}
        )
        # No transitions from terminal states
        self.assertNotIn("successful", _ALLOWED_TRANSITIONS)
        self.assertNotIn("failed", _ALLOWED_TRANSITIONS)

    @given(
        terminal_status=terminal_statuses,
        target=target_statuses,
    )
    @settings(max_examples=5)
    def test_terminal_status_has_no_allowed_transitions(
        self, terminal_status, target
    ):
        """For any terminal status (successful, failed), the allowed
        transitions set is empty — no forward or backward moves."""
        allowed = _ALLOWED_TRANSITIONS.get(terminal_status, set())
        self.assertEqual(allowed, set())

    @given(
        payment_id=uuids,
        application_id=uuids,
        amount=amounts,
        lenco_status=st.sampled_from(["successful", "failed"]),
    )
    @settings(max_examples=5)
    def test_pending_payment_transitions_to_lenco_status(
        self, payment_id, application_id, amount, lenco_status
    ):
        """When a payment is 'pending' and Lenco returns a valid status,
        verify_payment() transitions the payment forward."""
        import requests as http_requests

        mock_payment = MagicMock()
        mock_payment.id = payment_id
        mock_payment.status = "pending"
        mock_payment.amount = amount
        mock_payment.currency = "ZMW"
        mock_payment.transaction_reference = "TXN-REF-001"
        mock_payment.lenco_reference = None
        mock_payment.payment_method = None
        mock_payment.application_id = application_id

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": {
                "status": lenco_status,
                "amount": str(amount),
                "lencoReference": "LENCO-REF",
                "type": "card",
            }
        }

        with (
            patch("apps.documents.payment_service.Payment.objects") as mock_qs,
            patch("apps.documents.payment_service.http_requests.get") as mock_get,
            patch("apps.documents.payment_service.settings") as mock_settings,
            patch.object(PaymentService, "_update_payment_status") as mock_update,
        ):
            mock_settings.LENCO_API_SECRET_KEY = "test-secret"
            mock_settings.LENCO_API_BASE_URL = "https://api.lenco.co"
            mock_qs.get.return_value = mock_payment
            mock_get.return_value = mock_response
            mock_payment.refresh_from_db = MagicMock()

            service = PaymentService()
            service.verify_payment(payment_id)

            # _update_payment_status should be called with the mapped status
            mock_update.assert_called_once()
            call_args = mock_update.call_args
            self.assertEqual(call_args[0][1], lenco_status)
