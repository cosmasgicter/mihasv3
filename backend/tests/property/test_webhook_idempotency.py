"""Property-based tests for webhook processing idempotency.

# Feature: lenco-payment-integration, Property 5: Webhook processing idempotency

For any valid webhook event, processing it N times (where N >= 1) should
produce the same Payment record state as processing it exactly once.

**Validates: Requirements 4.8**
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

payment_types = st.sampled_from(["card", "bank_transfer", "mobile_money"])

# Webhook event types that trigger status changes
status_changing_events = st.sampled_from([
    "collection.successful",
    "collection.failed",
])

# Number of times to re-process the same webhook (1 to 10)
repeat_counts = st.integers(min_value=1, max_value=10)


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


def _build_webhook_payload(amount, lenco_ref, payment_type):
    """Build a Lenco webhook payload dict."""
    return {
        "data": {
            "amount": float(amount),
            "reference": "ignored-here",
            "lencoReference": lenco_ref,
            "type": payment_type,
        }
    }


def _snapshot_payment(payment):
    """Capture the mutable state of a mock payment for comparison."""
    return {
        "status": payment.status,
        "lenco_reference": payment.lenco_reference,
        "payment_method": payment.payment_method,
        "fee": payment.fee,
        "bearer": payment.bearer,
        "metadata": dict(payment.metadata) if payment.metadata else {},
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestWebhookProcessingIdempotency(SimpleTestCase):
    """Processing the same webhook event N times must produce the same
    Payment record state as processing it exactly once.

    **Validates: Requirements 4.8**
    """

    @given(
        payment_id=uuids,
        application_id=uuids,
        amount=amounts,
        reference=references,
        lenco_ref=lenco_references,
        payment_type=payment_types,
        event_type=status_changing_events,
        n=repeat_counts,
    )
    @settings(max_examples=100)
    def test_processing_n_times_equals_processing_once(
        self,
        payment_id,
        application_id,
        amount,
        reference,
        lenco_ref,
        payment_type,
        event_type,
        n,
    ):
        """Process a webhook event once, snapshot the state, then process
        the same event N-1 more times on a fresh payment. The final state
        after N processings must equal the state after 1 processing."""
        payload = _build_webhook_payload(amount, lenco_ref, payment_type)

        # --- Process once ---
        service_once = PaymentService()
        payment_once = _make_pending_payment(
            payment_id, application_id, amount, reference
        )

        with patch(
            "apps.documents.payment_service.Payment.objects"
        ) as mock_pay, patch(
            "apps.documents.payment_service.Application.objects"
        ) as mock_app:
            mock_pay.get.return_value = payment_once
            mock_app.filter.return_value.update.return_value = 1

            service_once.process_webhook_event(
                event_type=event_type,
                reference=reference,
                payload=payload,
            )

        state_after_once = _snapshot_payment(payment_once)

        # --- Process N times on the same payment object ---
        service_n = PaymentService()
        payment_n = _make_pending_payment(
            payment_id, application_id, amount, reference
        )

        with patch(
            "apps.documents.payment_service.Payment.objects"
        ) as mock_pay, patch(
            "apps.documents.payment_service.Application.objects"
        ) as mock_app:
            mock_pay.get.return_value = payment_n
            mock_app.filter.return_value.update.return_value = 1

            for _ in range(n):
                service_n.process_webhook_event(
                    event_type=event_type,
                    reference=reference,
                    payload=payload,
                )

        state_after_n = _snapshot_payment(payment_n)

        self.assertEqual(
            state_after_once,
            state_after_n,
            f"State after 1 processing should equal state after {n} processings "
            f"for event_type={event_type}",
        )

    @given(
        payment_id=uuids,
        application_id=uuids,
        amount=amounts,
        reference=references,
        lenco_ref=lenco_references,
        payment_type=payment_types,
        n=repeat_counts,
    )
    @settings(max_examples=100)
    def test_settled_event_idempotent_metadata(
        self,
        payment_id,
        application_id,
        amount,
        reference,
        lenco_ref,
        payment_type,
        n,
    ):
        """collection.settled events update metadata only. Processing N
        times should produce the same metadata as processing once."""
        payload = {
            "data": {
                "reference": "ignored",
                "settlement": {
                    "amount": float(amount),
                    "lencoReference": lenco_ref,
                },
            }
        }

        # --- Process once ---
        service_once = PaymentService()
        payment_once = _make_pending_payment(
            payment_id, application_id, amount, reference
        )

        with patch(
            "apps.documents.payment_service.Payment.objects"
        ) as mock_pay:
            mock_pay.get.return_value = payment_once

            service_once.process_webhook_event(
                event_type="collection.settled",
                reference=reference,
                payload=payload,
            )

        state_after_once = _snapshot_payment(payment_once)

        # --- Process N times ---
        service_n = PaymentService()
        payment_n = _make_pending_payment(
            payment_id, application_id, amount, reference
        )

        with patch(
            "apps.documents.payment_service.Payment.objects"
        ) as mock_pay:
            mock_pay.get.return_value = payment_n

            for _ in range(n):
                service_n.process_webhook_event(
                    event_type="collection.settled",
                    reference=reference,
                    payload=payload,
                )

        state_after_n = _snapshot_payment(payment_n)

        self.assertEqual(
            state_after_once,
            state_after_n,
            f"Settlement metadata after 1 processing should equal after {n} "
            f"processings",
        )
