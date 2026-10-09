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
    hash_key = hashlib.sha256(api_secret.encode("utf-8")).hexdigest()
    return hmac.new(hash_key.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()


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
            mock_payment_svc.apply_webhook_event.assert_not_called()

            # Verify the reason was recorded. The canonical path writes
            # ``processing_error`` in the same INSERT as the log row (task 8.2)
            # instead of creating the row and then patching it, so a persisted
            # row can never be missing its reason.
            self.assertEqual(
                create_kwargs["processing_error"],
                "Invalid webhook signature",
            )

# ---------------------------------------------------------------------------
# Property 12 (webhook processing idempotence) moved in admissions-v2 task 8.2
# ---------------------------------------------------------------------------
#
# It used to live here as a mock-driven test of the deleted
# ``PaymentService.process_webhook_event``: it asserted that a MagicMock's
# ``status`` attribute stayed ``"successful"``. The property now runs against a
# real database, over the surviving ``apply_webhook_event`` path, comparing full
# row snapshots plus the derived application summary:
#
#   tests/property/test_webhook_idempotency.py
#     ::test_processing_n_times_equals_processing_once
#     ::test_settled_event_idempotent_metadata
#     ::test_receipt_is_allocated_once_across_replays
