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
    @settings(max_examples=100)
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
    @settings(max_examples=100)
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
