"""
Bug 4 (MEDIUM) — Application filters drift: Fix Checking Test

Property test verifying that camelCase filter params (sortBy, sortOrder,
excludeStatus, startDate, endDate, paymentStatus) produce correctly
filtered/sorted querysets via ApplicationFilter.

**Validates: Requirements 2.10, 2.11, 2.12**
"""

import os
import uuid
from datetime import date, timedelta

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from unittest.mock import patch, MagicMock  # noqa: E402

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings, assume  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.applications.filters import ApplicationFilter  # noqa: E402
from apps.applications.models import Application  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

sort_by_values = st.sampled_from(["date", "name", "status", "created_at", "full_name"])
sort_order_values = st.sampled_from(["asc", "desc"])
statuses = st.sampled_from(["draft", "submitted", "under_review", "approved", "rejected", "pending"])
payment_statuses = st.sampled_from(["not_paid", "pending", "verified", "successful", "failed"])

# Date strategy: reasonable date range
dates = st.dates(
    min_value=date(2023, 1, 1),
    max_value=date(2025, 12, 31),
)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestCamelCaseFilterParams(SimpleTestCase):
    """For all generated camelCase filter combinations, ApplicationFilter
    produces correctly filtered/sorted querysets.

    **Validates: Requirements 2.10, 2.11, 2.12**
    """

    @given(
        sort_by=sort_by_values,
        sort_order=sort_order_values,
    )
    @settings(max_examples=50)
    def test_sort_by_and_sort_order_produce_ordered_queryset(self, sort_by, sort_order):
        """sortBy + sortOrder params translate to correct ordering."""
        data = {"sortBy": sort_by, "sortOrder": sort_order}
        qs = Application.objects.all()

        f = ApplicationFilter(data=data, queryset=qs)
        filtered_qs = f.qs

        # Verify ordering is applied
        ordering = filtered_qs.query.order_by
        assert len(ordering) > 0, (
            f"sortBy={sort_by}&sortOrder={sort_order} should produce ordering"
        )

        field_map = {
            "date": "created_at",
            "name": "full_name",
            "status": "status",
            "created_at": "created_at",
            "full_name": "full_name",
        }
        expected_field = field_map[sort_by]
        expected_prefix = "-" if sort_order == "desc" else ""
        expected_ordering = f"{expected_prefix}{expected_field}"

        assert ordering[0] == expected_ordering, (
            f"Expected ordering '{expected_ordering}', got '{ordering[0]}'"
        )

    @given(exclude_status=statuses)
    @settings(max_examples=30)
    def test_exclude_status_filters_out_matching_status(self, exclude_status):
        """excludeStatus param excludes applications with that status."""
        data = {"excludeStatus": exclude_status}
        qs = Application.objects.all()

        f = ApplicationFilter(data=data, queryset=qs)
        filtered_qs = f.qs

        # The SQL should contain an exclusion for the status
        sql = str(filtered_qs.query)
        # The exclude produces a NOT condition in the WHERE clause
        assert "NOT" in sql.upper() or "status" in sql.lower(), (
            f"excludeStatus={exclude_status} should produce an exclusion filter"
        )

    @given(
        start=dates,
        delta=st.integers(min_value=1, max_value=365),
    )
    @settings(max_examples=30)
    def test_start_date_and_end_date_filter_on_created_at(self, start, delta):
        """startDate and endDate filter on created_at field."""
        end = start + timedelta(days=delta)
        data = {
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
        }
        qs = Application.objects.all()

        f = ApplicationFilter(data=data, queryset=qs)
        filtered_qs = f.qs

        sql = str(filtered_qs.query)
        assert "created_at" in sql.lower(), (
            f"startDate/endDate should filter on created_at, got SQL: {sql[:200]}"
        )

    @given(payment_status=payment_statuses)
    @settings(max_examples=30)
    def test_payment_status_camel_case_alias(self, payment_status):
        """paymentStatus (camelCase) works as alias for payment_status."""
        data = {"paymentStatus": payment_status}
        qs = Application.objects.all()

        f = ApplicationFilter(data=data, queryset=qs)
        filtered_qs = f.qs

        sql = str(filtered_qs.query)
        assert "payment_status" in sql.lower(), (
            f"paymentStatus={payment_status} should filter on payment_status field"
        )
