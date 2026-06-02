"""
Bug 1 (HIGH) — Payment verification returns stale status: Preservation Test

Property test verifying that payments already in terminal states (successful,
failed) are returned as-is without making any HTTP call to the Lenco API.

**Validates: Requirements 3.1**
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
    PaymentVerificationResult,
)

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

terminal_statuses = st.sampled_from(["successful", "failed"])

amounts = st.decimals(
    min_value=Decimal("0.01"),
    max_value=Decimal("99999.99"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

lenco_references = st.one_of(
    st.none(),
    st.text(
        alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"),
        min_size=5,
        max_size=30,
    ),
)

payment_methods = st.one_of(
    st.none(),
    st.sampled_from(["card", "bank_transfer", "mobile_money"]),
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_terminal_payment(payment_id, status, amount, lenco_ref, payment_method):
    """Create a mock Payment object in a terminal state."""
    payment = MagicMock()
    payment.id = payment_id
    payment.application_id = uuid.uuid4()
    payment.status = status
    payment.amount = amount
    payment.currency = "ZMW"
    payment.transaction_reference = f"TXN-{payment_id}"
    payment.lenco_reference = lenco_ref
    payment.payment_method = payment_method
    return payment


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestTerminalPaymentsNotReVerified(SimpleTestCase):
    """For all payments in terminal states, verify_payment() returns the
    current status without making any HTTP call to the Lenco API.

    **Validates: Requirements 3.1**
    """

    @given(
        payment_id=st.uuids(),
        terminal_status=terminal_statuses,
        amount=amounts,
        lenco_ref=lenco_references,
        payment_method=payment_methods,
    )
    @settings(max_examples=5)
    def test_terminal_payment_returns_current_status_no_http(
        self,
        payment_id,
        terminal_status,
        amount,
        lenco_ref,
        payment_method,
    ):
        """When a payment is already in a terminal state (successful/failed),
        verify_payment() must return that status and must NOT call Lenco."""
        payment = _make_terminal_payment(
            payment_id, terminal_status, amount, lenco_ref, payment_method
        )

        with (
            patch("apps.documents.payment_service_mixins._verification.Payment.objects") as mock_payment_qs,
            patch("apps.documents.payment_service_mixins._verification._call_lenco_collection_status") as mock_lenco,
        ):
            mock_payment_qs.get.return_value = payment

            service = PaymentService()
            result = service.verify_payment(payment_id)

        # Terminal payments must NOT hit Lenco at all.
        mock_lenco.assert_not_called()

        # Assert returned status matches the terminal state
        self.assertIsInstance(result, PaymentVerificationResult)
        self.assertEqual(
            result.status,
            terminal_status,
            f"verify_payment() returned '{result.status}' but expected "
            f"'{terminal_status}' for a terminal-state payment",
        )
        self.assertEqual(result.amount, amount)
        self.assertEqual(result.currency, "ZMW")
        self.assertEqual(result.lenco_reference, lenco_ref)
        self.assertEqual(result.payment_method, payment_method)
        self.assertIsNone(result.error)
