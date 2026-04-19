"""Property-based tests for webhook settlement metadata update.

# Feature: lenco-payment-integration, Property 16: Webhook settlement metadata update

For any collection.settled webhook event with valid signature, the matching
Payment record's metadata should contain the settlement details from the
event payload.

**Validates: Requirements 4.5**
"""

import os
from decimal import Decimal
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
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

# Settlement detail dictionaries with varying shapes
settlement_details = st.fixed_dictionaries(
    {
        "amount": st.floats(min_value=0.01, max_value=99999.99, allow_nan=False, allow_infinity=False),
    },
    optional={
        "lencoReference": lenco_references,
        "settledAt": st.text(min_size=5, max_size=30),
        "accountNumber": st.text(
            alphabet=st.sampled_from("0123456789"),
            min_size=5,
            max_size=15,
        ),
        "bankName": st.text(min_size=2, max_size=30),
    },
)

# Payment statuses — settlement events can arrive for any status
payment_statuses = st.sampled_from(["pending", "successful", "failed"])


def _make_payment(payment_id, application_id, amount, reference, status="pending"):
    """Create a mock Payment object."""
    payment = MagicMock()
    payment.id = payment_id
    payment.application_id = application_id
    payment.status = status
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


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestWebhookSettlementMetadataUpdate(SimpleTestCase):
    """A collection.settled webhook event should update the matching
    Payment record's metadata with settlement details from the payload.

    **Validates: Requirements 4.5**
    """

    @given(
        payment_id=uuids,
        application_id=uuids,
        amount=amounts,
        reference=references,
        settlement=settlement_details,
        status=payment_statuses,
    )
    @settings(max_examples=5)
    def test_settlement_details_stored_in_metadata(
        self,
        payment_id,
        application_id,
        amount,
        reference,
        settlement,
        status,
    ):
        """For any collection.settled event, the Payment metadata should
        contain the settlement details from the event payload."""
        payload = {
            "data": {
                "reference": reference,
                "settlement": settlement,
            }
        }

        service = PaymentService()
        payment = _make_payment(payment_id, application_id, amount, reference, status)

        with patch("apps.documents.payment_service.Payment.objects") as mock_pay:
            mock_pay.get.return_value = payment

            service.process_webhook_event(
                event_type="collection.settled",
                reference=reference,
                payload=payload,
            )

        # The payment metadata should contain the settlement key
        self.assertIn(
            "settlement",
            payment.metadata,
            "Payment metadata should contain 'settlement' key after "
            "collection.settled event",
        )

        # The settlement value should match the payload's settlement data
        self.assertEqual(
            payment.metadata["settlement"],
            settlement,
            "Settlement metadata should match the event payload settlement details",
        )

        # save should have been called with the metadata update
        payment.save.assert_called_once()
        call_kwargs = payment.save.call_args
        self.assertIn(
            "metadata",
            call_kwargs.kwargs.get("update_fields", call_kwargs[1].get("update_fields", [])),
            "save should include 'metadata' in update_fields",
        )

    @given(
        payment_id=uuids,
        application_id=uuids,
        amount=amounts,
        reference=references,
        settlement=settlement_details,
    )
    @settings(max_examples=5)
    def test_settlement_does_not_change_payment_status(
        self,
        payment_id,
        application_id,
        amount,
        reference,
        settlement,
    ):
        """A collection.settled event should update metadata only — the
        payment status should remain unchanged."""
        payload = {
            "data": {
                "reference": reference,
                "settlement": settlement,
            }
        }

        service = PaymentService()
        payment = _make_payment(payment_id, application_id, amount, reference, "successful")

        with patch("apps.documents.payment_service.Payment.objects") as mock_pay:
            mock_pay.get.return_value = payment

            service.process_webhook_event(
                event_type="collection.settled",
                reference=reference,
                payload=payload,
            )

        self.assertEqual(
            payment.status,
            "successful",
            "collection.settled should not change payment status",
        )
