"""Property-based tests for webhook event logging completeness.

# Feature: lenco-payment-integration, Property 6: Webhook event logging completeness

For any webhook request received (regardless of signature validity), a
WebhookEventLog record should be created containing the event type,
reference, raw payload, and signature validation result.

**Validates: Requirements 4.6, 4.7**
"""

import os
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.documents.webhook_processor import WebhookProcessor  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

event_types = st.text(
    alphabet=st.sampled_from(
        "abcdefghijklmnopqrstuvwxyz.ABCDEFGHIJKLMNOPQRSTUVWXYZ_-"
    ),
    min_size=1,
    max_size=50,
)

references = st.text(
    alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"),
    min_size=1,
    max_size=40,
)

# Payloads with a nested data.reference field (mirrors real Lenco payloads)
payloads = st.fixed_dictionaries(
    {
        "data": st.fixed_dictionaries(
            {
                "reference": references,
                "amount": st.floats(
                    min_value=0.01, max_value=99999.99, allow_nan=False
                ),
            }
        ),
    }
)

signature_valid_flags = st.booleans()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestWebhookEventLoggingCompleteness(SimpleTestCase):
    """Every call to WebhookProcessor.process must create a WebhookEventLog
    record with the correct event_type, reference, payload, and
    signature_valid — regardless of whether the signature was valid.

    **Validates: Requirements 4.6, 4.7**
    """

    @given(
        event_type=event_types,
        payload=payloads,
        sig_valid=signature_valid_flags,
    )
    @settings(max_examples=100)
    def test_log_record_always_created_with_correct_fields(
        self,
        event_type,
        payload,
        sig_valid,
    ):
        """For any event type, payload, and signature validity flag,
        WebhookProcessor.process must create a WebhookEventLog record
        containing the event_type, reference (extracted from payload),
        the full payload, and the signature_valid flag."""
        expected_reference = payload.get("data", {}).get("reference", "") or ""

        processor = WebhookProcessor()

        # Mock WebhookEventLog.objects.create to capture the call args
        mock_log_entry = MagicMock()
        mock_log_entry.id = "test-log-id"

        with patch(
            "apps.documents.webhook_processor.WebhookEventLog.objects"
        ) as mock_log_objects, patch.object(
            processor, "_payment_service"
        ):
            mock_log_objects.create.return_value = mock_log_entry

            processor.process(
                event_type=event_type,
                payload=payload,
                signature_valid=sig_valid,
            )

            # Assert create was called exactly once
            mock_log_objects.create.assert_called_once()

            call_kwargs = mock_log_objects.create.call_args[1]

            # Verify all required fields are present and correct
            self.assertEqual(
                call_kwargs["event_type"],
                event_type,
                "WebhookEventLog.event_type must match the incoming event type",
            )
            self.assertEqual(
                call_kwargs["reference"],
                expected_reference,
                "WebhookEventLog.reference must match the extracted reference",
            )
            self.assertEqual(
                call_kwargs["payload"],
                payload,
                "WebhookEventLog.payload must contain the full raw payload",
            )
            self.assertEqual(
                call_kwargs["signature_valid"],
                sig_valid,
                "WebhookEventLog.signature_valid must match the signature flag",
            )
