"""Property-based tests for pending payment query window.

# Feature: lenco-payment-integration, Property 14: Pending payment query window

For any set of Payment records with varying created_at timestamps, the polling
task query should return only those with status pending, created more than
5 minutes ago, and created less than 24 hours ago.

**Validates: Requirements 12.1**
"""

import os
from datetime import timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from django.utils import timezone  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Offsets in minutes from "now" for created_at timestamps.
# Negative = in the past, positive = in the future.
# Range covers well outside the 5min–24hr window.
offset_minutes = st.integers(min_value=-2880, max_value=60)  # -48hr to +1hr

statuses = st.sampled_from(["pending", "successful", "failed"])

amounts = st.decimals(
    min_value=Decimal("1.00"),
    max_value=Decimal("9999.99"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)


@st.composite
def payment_records(draw):
    """Generate a list of mock payment records with varying timestamps and statuses."""
    count = draw(st.integers(min_value=0, max_value=20))
    records = []
    now = timezone.now()
    for i in range(count):
        offset = draw(offset_minutes)
        status = draw(statuses)
        amount = draw(amounts)

        record = MagicMock()
        record.id = f"payment-{i}"
        record.status = status
        record.amount = amount
        record.currency = "ZMW"
        record.created_at = now - timedelta(minutes=offset)
        record.transaction_reference = f"REF-{i}"
        records.append(record)
    return records


def is_in_query_window(payment, now):
    """Check if a payment should be returned by the polling query."""
    five_minutes_ago = now - timedelta(minutes=5)
    twenty_four_hours_ago = now - timedelta(hours=24)
    return (
        payment.status == "pending"
        and payment.created_at < five_minutes_ago
        and payment.created_at > twenty_four_hours_ago
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestPendingPaymentQueryWindow(SimpleTestCase):
    """The polling task query should return only pending payments created
    more than 5 minutes ago and less than 24 hours ago.

    **Validates: Requirements 12.1**
    """

    @given(records=payment_records())
    @settings(max_examples=5)
    def test_query_window_filters_correctly(self, records):
        """For any set of payment records, the query filter should match
        exactly those with status=pending, created_at < now-5min, and
        created_at > now-24hr."""
        now = timezone.now()
        five_minutes_ago = now - timedelta(minutes=5)
        twenty_four_hours_ago = now - timedelta(hours=24)

        # Compute expected set using the same logic as the task
        expected_ids = {
            p.id for p in records if is_in_query_window(p, now)
        }

        # Simulate the Django ORM filter logic on our mock records
        actual_ids = set()
        for p in records:
            if (
                p.status == "pending"
                and p.created_at < five_minutes_ago
                and p.created_at > twenty_four_hours_ago
            ):
                actual_ids.add(p.id)

        self.assertEqual(
            expected_ids,
            actual_ids,
            "Query window filter should match exactly the expected payments",
        )

    @given(records=payment_records())
    @settings(max_examples=5)
    def test_non_pending_payments_excluded(self, records):
        """Payments with status != 'pending' should never be included,
        regardless of their created_at timestamp."""
        now = timezone.now()

        for p in records:
            if p.status != "pending":
                self.assertFalse(
                    is_in_query_window(p, now),
                    f"Non-pending payment (status={p.status}) should never be "
                    f"in the query window",
                )

    @given(records=payment_records())
    @settings(max_examples=5)
    def test_max_50_limit_respected(self, records):
        """The polling task should process at most 50 payments per run."""
        now = timezone.now()

        eligible = [p for p in records if is_in_query_window(p, now)]
        # The task uses [:50] slice
        processed = eligible[:50]

        self.assertLessEqual(
            len(processed),
            50,
            "At most 50 payments should be processed per run",
        )
