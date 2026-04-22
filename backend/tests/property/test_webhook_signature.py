"""Property-based tests for webhook signature validation round-trip.

# Feature: lenco-payment-integration, Property 4: Webhook signature validation round-trip

For any raw request body and any API secret key, computing the webhook signature
(HMAC-SHA512 of body using SHA-256 of secret key) and then validating it should
return true. Conversely, for any body and any incorrect signature, validation
should return false.

**Validates: Requirements 4.1, 4.2**
"""

import hashlib
import hmac
import os
from unittest.mock import patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import assume, given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.documents.webhook_processor import WebhookProcessor  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Raw request bodies: arbitrary non-empty bytes
raw_bodies = st.binary(min_size=1, max_size=4096)

# API secret keys: non-empty text (printable ASCII to avoid encoding edge cases)
api_secret_keys = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P", "S")),
    min_size=1,
    max_size=128,
)

# Random hex strings that look like signatures but are incorrect
random_hex_signatures = st.binary(min_size=32, max_size=64).map(lambda b: b.hex())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def compute_signature(raw_body: bytes, api_secret: str) -> str:
    """Reproduce the Lenco webhook signature algorithm."""
    hash_key = hashlib.sha256(api_secret.encode("utf-8")).digest()
    return hmac.new(hash_key, raw_body, hashlib.sha512).hexdigest()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestWebhookSignatureRoundTrip(SimpleTestCase):
    """A correctly computed signature must always validate as true.

    **Validates: Requirements 4.1, 4.2**
    """

    @given(raw_body=raw_bodies, api_secret=api_secret_keys)
    @settings(max_examples=5)
    def test_valid_signature_always_accepted(self, raw_body: bytes, api_secret: str):
        """For any body and any secret key, computing the correct signature
        and then validating it should return True."""
        correct_sig = compute_signature(raw_body, api_secret)

        processor = WebhookProcessor()
        with patch("apps.documents.webhook_processor.settings") as mock_settings:
            mock_settings.LENCO_API_SECRET_KEY = api_secret
            result = processor.validate_signature(raw_body, correct_sig)

        self.assertTrue(
            result,
            f"validate_signature should return True for a correctly computed signature. "
            f"body length={len(raw_body)}, secret length={len(api_secret)}",
        )


class TestWebhookSignatureRejectsIncorrect(SimpleTestCase):
    """An incorrect signature must always be rejected.

    **Validates: Requirements 4.1, 4.2**
    """

    @given(
        raw_body=raw_bodies,
        api_secret=api_secret_keys,
        bad_signature=random_hex_signatures,
    )
    @settings(max_examples=5)
    def test_incorrect_signature_always_rejected(
        self, raw_body: bytes, api_secret: str, bad_signature: str
    ):
        """For any body and any incorrect signature, validation should
        return False."""
        correct_sig = compute_signature(raw_body, api_secret)
        assume(bad_signature != correct_sig)

        processor = WebhookProcessor()
        with patch("apps.documents.webhook_processor.settings") as mock_settings:
            mock_settings.LENCO_API_SECRET_KEY = api_secret
            result = processor.validate_signature(raw_body, bad_signature)

        self.assertFalse(
            result,
            f"validate_signature should return False for an incorrect signature. "
            f"bad_sig={bad_signature[:20]}..., correct_sig={correct_sig[:20]}...",
        )


# ---------------------------------------------------------------------------
# Feature: production-payment-hardening — Properties 5 and 12
# ---------------------------------------------------------------------------

from decimal import Decimal  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402


class TestInvalidSignatureRejectionAndLogging(SimpleTestCase):
    """# Feature: production-payment-hardening, Property 5: Invalid webhook signature rejection and logging

    For any webhook event with an invalid signature, the WebhookProcessor.process
    method SHALL create a WebhookEventLog record with signature_valid=False and
    SHALL not delegate to PaymentService for status updates.

    **Validates: Requirements 16.4**
    """

    @given(
        event_type=st.sampled_from([
            "collection.successful",
            "collection.failed",
            "collection.settled",
            "unknown.event",
        ]),
        reference=st.text(
            alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"),
            min_size=1,
            max_size=30,
        ),
    )
    @settings(max_examples=5)
    def test_invalid_signature_logs_but_does_not_process(self, event_type, reference):
        """When signature_valid=False, a WebhookEventLog is created with
        signature_valid=False and PaymentService is NOT called."""
        processor = WebhookProcessor()

        payload = {"event": event_type, "data": {"reference": reference}}

        mock_log_entry = MagicMock()
        mock_log_entry.id = "test-log-id"
        mock_log_entry.processing_error = None

        with (
            patch("apps.documents.webhook_processor.WebhookEventLog.objects") as mock_log_qs,
            patch.object(processor, "_payment_service") as mock_payment_svc,
        ):
            mock_log_qs.create.return_value = mock_log_entry

            processor.process(event_type, payload, signature_valid=False)

            # Verify log was created with signature_valid=False
            create_kwargs = mock_log_qs.create.call_args[1]
            self.assertFalse(create_kwargs["signature_valid"])
            self.assertEqual(create_kwargs["event_type"], event_type)

            # Verify PaymentService was NOT called
            mock_payment_svc.process_webhook_event.assert_not_called()

            # Verify processing_error was set
            self.assertEqual(
                mock_log_entry.processing_error,
                "Invalid webhook signature",
            )


class TestWebhookProcessingIdempotence(SimpleTestCase):
    """# Feature: production-payment-hardening, Property 12: Webhook processing idempotence

    For any valid webhook event, processing it N times (N >= 1) SHALL produce
    the same final payment state as processing it exactly once.

    **Validates: Requirements 7.4**
    """

    @given(
        payment_id=st.uuids(),
        application_id=st.uuids(),
        amount=st.decimals(
            min_value=Decimal("0.01"),
            max_value=Decimal("99999.99"),
            places=2,
            allow_nan=False,
            allow_infinity=False,
        ),
        n_times=st.integers(min_value=1, max_value=5),
    )
    @settings(max_examples=5)
    def test_repeated_webhook_produces_same_state(
        self, payment_id, application_id, amount, n_times
    ):
        """Processing a successful webhook N times yields the same final
        payment status as processing it once."""
        from contextlib import contextmanager

        from apps.documents.payment_service import PaymentService

        @contextmanager
        def _noop_atomic():
            yield

        reference = f"MIHAS-TEST-{payment_id.hex[:8]}"
        payload = {
            "data": {
                "reference": reference,
                "amount": str(amount),
            }
        }

        current_status = "pending"
        service = PaymentService()

        for i in range(n_times):
            webhook_mock = MagicMock()
            webhook_mock.id = payment_id
            webhook_mock.application_id = application_id
            webhook_mock.status = current_status
            webhook_mock.amount = amount
            webhook_mock.currency = "ZMW"
            webhook_mock.transaction_reference = reference
            webhook_mock.lenco_reference = None
            webhook_mock.payment_method = None
            webhook_mock.fee = None
            webhook_mock.bearer = None
            webhook_mock.metadata = {}
            webhook_mock.updated_at = None
            webhook_mock.save = MagicMock()

            locked_mock = MagicMock()
            locked_mock.id = payment_id
            locked_mock.application_id = application_id
            locked_mock.status = current_status
            locked_mock.amount = amount
            locked_mock.currency = "ZMW"
            locked_mock.lenco_reference = None
            locked_mock.payment_method = None
            locked_mock.fee = None
            locked_mock.bearer = None
            locked_mock.metadata = {}
            locked_mock.updated_at = None
            locked_mock.save = MagicMock()

            with (
                patch(
                    "apps.documents.payment_service.Payment.objects"
                ) as mock_payment_qs,
                patch(
                    "apps.applications.models.Application.objects"
                ) as mock_app_qs,
                patch("django.db.transaction.atomic", side_effect=_noop_atomic),
            ):
                mock_payment_qs.select_for_update.return_value.get.side_effect = [
                    webhook_mock,
                    locked_mock,
                ]
                mock_app_qs.filter.return_value.update.return_value = 1

                service.process_webhook_event(
                    event_type="collection.successful",
                    reference=reference,
                    payload=payload,
                )

                if i == 0:
                    self.assertEqual(locked_mock.status, "successful")
                    current_status = "successful"
                else:
                    # Already successful — no-op, status stays successful
                    self.assertEqual(locked_mock.status, "successful")
