"""
Bug 1 (HIGH) — Payment verification returns stale status: Fix Checking Test

Property test verifying that ``verify()`` returns the DB-consistent status after
the write lands. For all Lenco statuses that map to a new internal status,
``verify()`` must return that mapped status, not 'pending'.

admissions-v2 task 8.2 collapsed the two payment paths into one, so the write
this test observes now happens in ``PaymentService._transition`` — the sole
status writer (ADR-007) — rather than the deleted ``_update_payment_status``.
The property is unchanged; only the seam it patches moved.

**Validates: Requirements 2.1, 2.2**
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
    _LENCO_STATUS_MAP,
)
from apps.documents.payment_types import TransitionResult  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Only statuses that actually map to a new internal status (successful, failed).
# The ones that map back to 'pending' (``pending``, ``pay-offline``,
# ``otp-required``) leave the row alone by design and return the
# ``PAYMENT_PENDING`` stable code, so they are not examples of this property.
lenco_api_statuses = st.sampled_from(
    sorted(
        status
        for status, mapped in _LENCO_STATUS_MAP.items()
        if mapped != "pending"
    )
)

amounts = st.decimals(
    min_value=Decimal("0.01"),
    max_value=Decimal("99999.99"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

lenco_references = st.text(
    alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"),
    min_size=5,
    max_size=30,
)

payment_types = st.sampled_from(["card", "bank_transfer", "mobile_money"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_pending_payment(payment_id, amount):
    """Create a mock Payment object in pending status with a transaction ref."""
    payment = MagicMock()
    payment.id = payment_id
    payment.application_id = uuid.uuid4()
    payment.status = "pending"
    payment.amount = amount
    payment.currency = "ZMW"
    payment.transaction_reference = f"TXN-{payment_id}"
    payment.lenco_reference = None
    payment.payment_method = None
    payment.fee = None
    payment.bearer = None
    payment.metadata = {}
    return payment


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestVerifyPaymentReturnsDBConsistentStatus(SimpleTestCase):
    """For all valid Lenco status mappings on pending payments,
    verify_payment() returns the mapped status, not 'pending'.

    **Validates: Requirements 2.1, 2.2**
    """

    @given(
        payment_id=st.uuids(),
        amount=amounts,
        lenco_status=lenco_api_statuses,
        lenco_ref=lenco_references,
        payment_type=payment_types,
    )
    @settings(max_examples=5)
    def test_verify_payment_returns_fresh_status_after_update(
        self,
        payment_id,
        amount,
        lenco_status,
        lenco_ref,
        payment_type,
    ):
        """When Lenco returns a mapped status for a pending payment,
        verify_payment() must return that mapped status — not 'pending'."""
        expected_status = _LENCO_STATUS_MAP[lenco_status]
        payment = _make_pending_payment(payment_id, amount)

        # Build the Lenco API JSON response
        lenco_response_data = {
            "status": lenco_status,
            "lencoReference": lenco_ref,
            "type": payment_type,
            "amount": str(amount),
        }
        mock_http_response = MagicMock()
        mock_http_response.json.return_value = {"data": lenco_response_data}
        mock_http_response.raise_for_status = MagicMock()

        def simulate_db_write_and_refresh(
            p, target_status, *, source, actor, reason=None, provider_data=None
        ):
            """Simulate ``_transition`` writing to DB, then refresh_from_db
            picking up the new status."""
            data = provider_data or {}
            p.status = target_status
            p.lenco_reference = data.get("lencoReference")
            p.payment_method = data.get("type")
            return TransitionResult(
                payment_id=p.id, status=target_status, risk_flag=None
            )

        _VER = "apps.documents.payment_service_mixins._verification"
        with (
            patch(f"{_VER}.Payment.objects") as mock_payment_qs,
            patch(f"{_VER}._call_lenco_collection_status") as mock_lenco,
            patch.object(
                PaymentService,
                "_transition",
                side_effect=simulate_db_write_and_refresh,
            ),
            patch(f"{_VER}.settings") as mock_settings,
        ):
            mock_settings.LENCO_API_SECRET_KEY = "test-secret"
            mock_settings.LENCO_API_BASE_URL = "https://api.lenco.test"
            mock_payment_qs.get.return_value = payment
            # _call_lenco_collection_status returns a ``(data, error)`` tuple.
            mock_lenco.return_value = (lenco_response_data, None)

            service = PaymentService()
            result = service.verify(payment_id)

        self.assertIsInstance(result, PaymentVerificationResult)
        self.assertEqual(
            result.status,
            expected_status,
            f"verify_payment() returned '{result.status}' but expected "
            f"'{expected_status}' after Lenco reported '{lenco_status}'",
        )
        self.assertIsNone(result.error)
