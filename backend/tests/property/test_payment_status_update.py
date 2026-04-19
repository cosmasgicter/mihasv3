"""Property-based tests for payment status update from Lenco response.

# Feature: lenco-payment-integration, Property 3: Payment status update from Lenco response

For any pending Payment record and any Lenco verification/webhook response, the
PaymentService should update the payment status to match the Lenco status
(successful → successful, failed → failed, pending → unchanged). When status
becomes successful, the associated application's payment_status should also be
set to paid.

**Validates: Requirements 3.2, 3.3, 3.4, 4.3, 4.4, 4.9, 12.3, 12.4**
"""

import os
import uuid
from decimal import Decimal
from unittest.mock import MagicMock, call, patch

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

# UUIDs for payment and application IDs
uuids = st.uuids()

# Positive decimal amounts
amounts = st.decimals(
    min_value=Decimal("0.01"),
    max_value=Decimal("99999.99"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

# Lenco statuses that map to internal statuses
lenco_statuses = st.sampled_from(["successful", "failed", "pending"])

# Lenco reference strings
lenco_references = st.text(
    alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"),
    min_size=5,
    max_size=30,
)

# Payment method types from Lenco
payment_types = st.sampled_from(["card", "bank_transfer", "mobile_money"])

# Fee amounts from Lenco
fee_amounts = st.one_of(
    st.none(),
    st.decimals(
        min_value=Decimal("0.01"),
        max_value=Decimal("999.99"),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    ),
)

# Bearer values
bearers = st.one_of(st.none(), st.sampled_from(["merchant", "customer"]))


def _build_lenco_data(lenco_ref, payment_type, fee, bearer_val):
    """Build a Lenco response data dict."""
    data = {}
    if lenco_ref is not None:
        data["lencoReference"] = lenco_ref
    if payment_type is not None:
        data["type"] = payment_type
    if fee is not None:
        data["fee"] = str(fee)
    if bearer_val is not None:
        data["bearer"] = bearer_val
    return data


def _make_pending_payment(payment_id, application_id, amount):
    """Create a mock Payment object in pending status."""
    payment = MagicMock()
    payment.id = payment_id
    payment.application_id = application_id
    payment.status = "pending"
    payment.amount = amount
    payment.currency = "ZMW"
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


class TestPaymentStatusUpdateFromLencoResponse(SimpleTestCase):
    """Payment status transitions must match Lenco response status.

    **Validates: Requirements 3.2, 3.3, 3.4, 4.3, 4.4, 4.9, 12.3, 12.4**
    """

    @given(
        payment_id=uuids,
        application_id=uuids,
        amount=amounts,
        lenco_ref=lenco_references,
        payment_type=payment_types,
        fee=fee_amounts,
        bearer_val=bearers,
    )
    @settings(max_examples=5)
    def test_successful_lenco_status_transitions_payment_to_successful(
        self,
        payment_id,
        application_id,
        amount,
        lenco_ref,
        payment_type,
        fee,
        bearer_val,
    ):
        """When Lenco returns 'successful', a pending payment transitions
        to 'successful'."""
        service = PaymentService()
        payment = _make_pending_payment(payment_id, application_id, amount)
        lenco_data = _build_lenco_data(lenco_ref, payment_type, fee, bearer_val)

        with patch(
            "apps.documents.payment_service.Application.objects"
        ) as mock_app_qs:
            mock_app_qs.filter.return_value.update.return_value = 1

            service._update_payment_status(payment, "successful", lenco_data)

        self.assertEqual(
            payment.status,
            "successful",
            "Payment status should be 'successful' after Lenco success",
        )
        payment.save.assert_called_once()

    @given(
        payment_id=uuids,
        application_id=uuids,
        amount=amounts,
        lenco_ref=lenco_references,
        payment_type=payment_types,
        fee=fee_amounts,
        bearer_val=bearers,
    )
    @settings(max_examples=5)
    def test_failed_lenco_status_transitions_payment_to_failed(
        self,
        payment_id,
        application_id,
        amount,
        lenco_ref,
        payment_type,
        fee,
        bearer_val,
    ):
        """When Lenco returns 'failed', a pending payment transitions
        to 'failed'."""
        service = PaymentService()
        payment = _make_pending_payment(payment_id, application_id, amount)
        lenco_data = _build_lenco_data(lenco_ref, payment_type, fee, bearer_val)

        with patch(
            "apps.documents.payment_service.Application.objects"
        ) as mock_app_qs:
            mock_app_qs.filter.return_value.update.return_value = 1

            service._update_payment_status(payment, "failed", lenco_data)

        self.assertEqual(
            payment.status,
            "failed",
            "Payment status should be 'failed' after Lenco failure",
        )
        payment.save.assert_called_once()

    @given(
        payment_id=uuids,
        application_id=uuids,
        amount=amounts,
    )
    @settings(max_examples=5)
    def test_pending_lenco_status_leaves_payment_unchanged(
        self,
        payment_id,
        application_id,
        amount,
    ):
        """When Lenco returns 'pending', the payment status stays 'pending'
        (no transition occurs because 'pending' is not in _ALLOWED_TRANSITIONS
        target set)."""
        service = PaymentService()
        payment = _make_pending_payment(payment_id, application_id, amount)

        # 'pending' is not a valid new_status in _ALLOWED_TRANSITIONS,
        # so _update_payment_status should be a no-op.
        service._update_payment_status(payment, "pending", {})

        self.assertEqual(
            payment.status,
            "pending",
            "Payment status should remain 'pending' when Lenco status is pending",
        )
        payment.save.assert_not_called()


class TestApplicationStatusSyncOnPaymentSuccess(SimpleTestCase):
    """Application payment_status must sync when payment becomes successful.

    **Validates: Requirements 4.9, 12.3, 12.4**
    """

    @given(
        payment_id=uuids,
        application_id=uuids,
        amount=amounts,
        lenco_ref=lenco_references,
        payment_type=payment_types,
    )
    @settings(max_examples=5)
    def test_application_set_to_paid_on_successful_payment(
        self,
        payment_id,
        application_id,
        amount,
        lenco_ref,
        payment_type,
    ):
        """When a payment transitions to 'successful', the associated
        application's payment_status is set to 'paid'."""
        service = PaymentService()
        payment = _make_pending_payment(payment_id, application_id, amount)
        lenco_data = _build_lenco_data(lenco_ref, payment_type, None, None)

        with patch(
            "apps.documents.payment_service.Application.objects"
        ) as mock_app_qs:
            mock_app_qs.filter.return_value.update.return_value = 1

            service._update_payment_status(payment, "successful", lenco_data)

            # Verify Application.objects.filter(id=application_id).update() was called
            mock_app_qs.filter.assert_called_once()
            filter_kwargs = mock_app_qs.filter.call_args[1]
            self.assertEqual(filter_kwargs["id"], application_id)

            update_kwargs = mock_app_qs.filter.return_value.update.call_args[1]
            self.assertEqual(
                update_kwargs["payment_status"],
                "paid",
                "Application payment_status should be set to 'paid'",
            )

    @given(
        payment_id=uuids,
        application_id=uuids,
        amount=amounts,
        lenco_ref=lenco_references,
        payment_type=payment_types,
    )
    @settings(max_examples=5)
    def test_application_set_to_failed_on_failed_payment(
        self,
        payment_id,
        application_id,
        amount,
        lenco_ref,
        payment_type,
    ):
        """When a payment transitions to 'failed', the associated
        application's payment_status is set to 'failed'."""
        service = PaymentService()
        payment = _make_pending_payment(payment_id, application_id, amount)
        lenco_data = _build_lenco_data(lenco_ref, payment_type, None, None)

        with patch(
            "apps.documents.payment_service.Application.objects"
        ) as mock_app_qs:
            mock_app_qs.filter.return_value.update.return_value = 1

            service._update_payment_status(payment, "failed", lenco_data)

            mock_app_qs.filter.assert_called_once()
            filter_kwargs = mock_app_qs.filter.call_args[1]
            self.assertEqual(filter_kwargs["id"], application_id)

            update_kwargs = mock_app_qs.filter.return_value.update.call_args[1]
            self.assertEqual(
                update_kwargs["payment_status"],
                "failed",
                "Application payment_status should be set to 'failed'",
            )

    @given(
        payment_id=uuids,
        application_id=uuids,
        amount=amounts,
    )
    @settings(max_examples=5)
    def test_application_not_updated_when_payment_stays_pending(
        self,
        payment_id,
        application_id,
        amount,
    ):
        """When payment stays 'pending', the application is not updated."""
        service = PaymentService()
        payment = _make_pending_payment(payment_id, application_id, amount)

        with patch(
            "apps.documents.payment_service.Application.objects"
        ) as mock_app_qs:
            service._update_payment_status(payment, "pending", {})

            mock_app_qs.filter.assert_not_called()


class TestLencoResponseDataStored(SimpleTestCase):
    """Lenco response data must be stored on the payment record.

    **Validates: Requirements 3.2, 3.3, 4.3, 4.4**
    """

    @given(
        payment_id=uuids,
        application_id=uuids,
        amount=amounts,
        lenco_ref=lenco_references,
        payment_type=payment_types,
        fee=fee_amounts,
        bearer_val=bearers,
    )
    @settings(max_examples=5)
    def test_lenco_fields_stored_on_successful_transition(
        self,
        payment_id,
        application_id,
        amount,
        lenco_ref,
        payment_type,
        fee,
        bearer_val,
    ):
        """When a payment transitions to 'successful', Lenco reference,
        payment method, fee, bearer, and response data are stored."""
        service = PaymentService()
        payment = _make_pending_payment(payment_id, application_id, amount)
        lenco_data = _build_lenco_data(lenco_ref, payment_type, fee, bearer_val)

        with patch(
            "apps.documents.payment_service.Application.objects"
        ) as mock_app_qs:
            mock_app_qs.filter.return_value.update.return_value = 1

            service._update_payment_status(payment, "successful", lenco_data)

        # Lenco reference stored
        self.assertEqual(payment.lenco_reference, lenco_ref)
        # Payment method stored
        self.assertEqual(payment.payment_method, payment_type)
        # Metadata contains lenco_response
        self.assertIn("lenco_response", payment.metadata)
        self.assertEqual(payment.metadata["lenco_response"], lenco_data)
