"""
Bug 1 (HIGH) — Payment verification returns stale status: Fix Checking Test

Property test verifying that verify_payment() returns the DB-consistent status
after _update_payment_status() writes a new status. For all valid Lenco status
mappings on pending payments, verify_payment() must return the mapped status,
not 'pending'.

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

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Only statuses that actually map to a new internal status (successful, failed)
lenco_api_statuses = st.sampled_from(list(_LENCO_STATUS_MAP.keys()))

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
    @settings(max_examples=100)
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

        def simulate_db_write_and_refresh(p, new_status, data):
            """Simulate _update_payment_status writing to DB, then
            refresh_from_db picking up the new status."""
            p.status = new_status
            p.lenco_reference = data.get("lencoReference")
            p.payment_method = data.get("type")

        with (
            patch("apps.documents.payment_service.Payment.objects") as mock_payment_qs,
            patch("apps.documents.payment_service.http_requests") as mock_http,
            patch.object(
                PaymentService,
                "_update_payment_status",
                side_effect=simulate_db_write_and_refresh,
            ),
            patch("apps.documents.payment_service.settings") as mock_settings,
        ):
            mock_settings.LENCO_API_SECRET_KEY = "test-secret"
            mock_settings.LENCO_API_BASE_URL = "https://api.lenco.test"
            mock_payment_qs.get.return_value = payment
            mock_http.get.return_value = mock_http_response
            mock_http.RequestException = Exception

            service = PaymentService()
            result = service.verify_payment(payment_id)

        self.assertIsInstance(result, PaymentVerificationResult)
        self.assertEqual(
            result.status,
            expected_status,
            f"verify_payment() returned '{result.status}' but expected "
            f"'{expected_status}' after Lenco reported '{lenco_status}'",
        )
        self.assertIsNone(result.error)
