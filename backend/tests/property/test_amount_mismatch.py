"""Property-based tests for payment amount mismatch detection.

# Feature: lenco-payment-integration, Property 11: Payment amount mismatch detection

For any Payment record and Lenco verification response where the response
amount differs from the Payment record's expected amount, the PaymentService
should not mark the payment as successful.

**Validates: Requirements 10.4**
"""

import os
from contextlib import contextmanager
from decimal import Decimal
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import assume, given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.documents.payment_service import PaymentService  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

uuids = st.uuids()

amounts = st.decimals(
    min_value=Decimal("0.01"),
    max_value=Decimal("99999.99"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

references = st.text(
    alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"),
    min_size=5,
    max_size=40,
)

lenco_references = st.text(
    alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"),
    min_size=5,
    max_size=30,
)

payment_types = st.sampled_from(["card", "bank_transfer", "mobile_money"])


def _make_pending_payment(payment_id, application_id, amount, reference):
    """Create a mock Payment object in pending status."""
    payment = MagicMock()
    payment.id = payment_id
    payment.application_id = application_id
    payment.status = "pending"
    payment.amount = amount
    payment.currency = "ZMW"
    payment.transaction_reference = reference
    payment.lenco_reference = None
    payment.payment_method = None
    payment.fee = None
    payment.bearer = None
    payment.metadata = {}
    payment.save = MagicMock()
    return payment


def _build_webhook_payload(lenco_amount, lenco_ref, payment_type):
    """Build a Lenco webhook payload dict."""
    return {
        "data": {
            "amount": float(lenco_amount),
            "lencoReference": lenco_ref,
            "type": payment_type,
        }
    }


@contextmanager
def _noop_atomic():
    """A no-op context manager that replaces transaction.atomic()."""
    yield


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestAmountMismatchDetection(SimpleTestCase):
    """Payment amount mismatch must prevent successful status transition.

    **Validates: Requirements 10.4**
    """

    @given(
        payment_id=uuids,
        application_id=uuids,
        expected_amount=amounts,
        lenco_amount=amounts,
        reference=references,
        lenco_ref=lenco_references,
        payment_type=payment_types,
    )
    @settings(max_examples=5)
    def test_mismatched_amount_blocks_successful_transition(
        self,
        payment_id,
        application_id,
        expected_amount,
        lenco_amount,
        reference,
        lenco_ref,
        payment_type,
    ):
        """When the Lenco webhook reports a successful collection but the
        amount differs from the Payment record's expected amount, the
        payment must NOT be marked as successful — it stays pending."""
        assume(expected_amount != lenco_amount)

        service = PaymentService()
        payment = _make_pending_payment(
            payment_id, application_id, expected_amount, reference
        )
        payload = _build_webhook_payload(lenco_amount, lenco_ref, payment_type)

        with (
            patch("apps.documents.payment_service.Payment.objects") as mock_payment_qs,
            patch("django.db.transaction.atomic", side_effect=_noop_atomic),
        ):
            mock_payment_qs.select_for_update.return_value.get.return_value = payment

            service.process_webhook_event(
                event_type="collection.successful",
                reference=reference,
                payload=payload,
            )

        self.assertEqual(
            payment.status,
            "pending",
            f"Payment should stay 'pending' when amounts mismatch: "
            f"expected={expected_amount}, lenco={lenco_amount}",
        )

    @given(
        payment_id=uuids,
        application_id=uuids,
        amount=amounts,
        reference=references,
        lenco_ref=lenco_references,
        payment_type=payment_types,
    )
    @settings(max_examples=5)
    def test_matching_amount_allows_successful_transition(
        self,
        payment_id,
        application_id,
        amount,
        reference,
        lenco_ref,
        payment_type,
    ):
        """When the Lenco webhook reports a successful collection and the
        amount matches the Payment record's expected amount, the payment
        transitions to successful."""
        service = PaymentService()
        payment = _make_pending_payment(
            payment_id, application_id, amount, reference
        )
        # Use the exact same amount in the webhook payload
        payload = _build_webhook_payload(amount, lenco_ref, payment_type)

        with (
            patch("apps.documents.payment_service.Payment.objects") as mock_payment_qs,
            patch("apps.documents.payment_service.Application.objects") as mock_app_qs,
            patch("django.db.transaction.atomic", side_effect=_noop_atomic),
        ):
            mock_payment_qs.select_for_update.return_value.get.return_value = payment
            mock_app_qs.filter.return_value.update.return_value = 1

            service.process_webhook_event(
                event_type="collection.successful",
                reference=reference,
                payload=payload,
            )

        self.assertEqual(
            payment.status,
            "successful",
            f"Payment should transition to 'successful' when amounts match: "
            f"expected={amount}, lenco={amount}",
        )
