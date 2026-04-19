"""Property-based tests for payment reference uniqueness and format.

# Feature: lenco-payment-integration, Property 1: Payment reference uniqueness and format

For any application number and any two distinct timestamps, the generated payment
references should both contain the application number and should be distinct from
each other.

**Validates: Requirements 1.6**
"""

import os
import re
from unittest.mock import patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import assume, given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.documents.payment_service import _generate_reference  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Application numbers: alphanumeric with dashes, like "APP-2025-0001"
application_numbers = st.from_regex(r"[A-Z0-9\-]{1,30}", fullmatch=True)

# Timestamps in milliseconds (realistic range: 2020-01-01 to 2040-01-01)
timestamps_ms = st.integers(
    min_value=1_577_836_800_000,  # 2020-01-01 00:00:00 UTC
    max_value=2_208_988_800_000,  # 2040-01-01 00:00:00 UTC
)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestPaymentReferenceFormat(SimpleTestCase):
    """Payment references must follow the MIHAS-{app_number}-{timestamp_ms} format.

    **Validates: Requirements 1.6**
    """

    @given(app_number=application_numbers, ts_ms=timestamps_ms)
    @settings(max_examples=5)
    def test_reference_contains_mihas_prefix(self, app_number, ts_ms):
        """For any application number and timestamp, the generated reference
        should start with 'MIHAS-'."""
        with patch("apps.documents.payment_service.time") as mock_time:
            mock_time.time.return_value = ts_ms / 1000.0
            ref = _generate_reference(app_number)

        self.assertTrue(
            ref.startswith("MIHAS-"),
            f"Reference should start with 'MIHAS-', got: {ref}",
        )

    @given(app_number=application_numbers, ts_ms=timestamps_ms)
    @settings(max_examples=5)
    def test_reference_contains_application_number(self, app_number, ts_ms):
        """For any application number and timestamp, the generated reference
        should contain the application number."""
        with patch("apps.documents.payment_service.time") as mock_time:
            mock_time.time.return_value = ts_ms / 1000.0
            ref = _generate_reference(app_number)

        self.assertIn(
            app_number,
            ref,
            f"Reference should contain app number '{app_number}', got: {ref}",
        )

    @given(app_number=application_numbers, ts_ms=timestamps_ms)
    @settings(max_examples=5)
    def test_reference_matches_expected_format(self, app_number, ts_ms):
        """For any application number and timestamp, the generated reference
        should match the format MIHAS-{app_number}-{digits}."""
        with patch("apps.documents.payment_service.time") as mock_time:
            mock_time.time.return_value = ts_ms / 1000.0
            ref = _generate_reference(app_number)

        # Verify structural format: MIHAS-{app_number}-{digits}
        # Note: we check the pattern rather than exact timestamp because
        # float64 precision can cause ±1ms drift for large timestamps.
        expected_prefix = f"MIHAS-{app_number}-"
        self.assertTrue(
            ref.startswith(expected_prefix),
            f"Reference should start with '{expected_prefix}', got: {ref}",
        )
        suffix = ref[len(expected_prefix):]
        self.assertTrue(
            suffix.isdigit() and len(suffix) > 0,
            f"Reference suffix should be digits, got: '{suffix}'",
        )


class TestPaymentReferenceUniqueness(SimpleTestCase):
    """Two references with different timestamps must be distinct.

    **Validates: Requirements 1.6**
    """

    @given(
        app_number=application_numbers,
        ts_ms_1=timestamps_ms,
        ts_ms_2=timestamps_ms,
    )
    @settings(max_examples=5)
    def test_distinct_timestamps_produce_distinct_references(
        self, app_number, ts_ms_1, ts_ms_2
    ):
        """For any application number and any two distinct timestamps,
        the generated payment references should be distinct."""
        assume(ts_ms_1 != ts_ms_2)

        with patch("apps.documents.payment_service.time") as mock_time:
            mock_time.time.return_value = ts_ms_1 / 1000.0
            ref_1 = _generate_reference(app_number)

        with patch("apps.documents.payment_service.time") as mock_time:
            mock_time.time.return_value = ts_ms_2 / 1000.0
            ref_2 = _generate_reference(app_number)

        self.assertNotEqual(
            ref_1,
            ref_2,
            f"References with different timestamps should be distinct: "
            f"ref_1={ref_1}, ref_2={ref_2}",
        )

        # Both should still contain the application number
        self.assertIn(app_number, ref_1)
        self.assertIn(app_number, ref_2)
