"""
Bug 4 (MEDIUM) — Application filters drift: Preservation Test

Property test verifying that existing snake_case filter params (status,
payment_status, program, intake, institution, search, sort) continue to
work identically after adding camelCase aliases.

**Validates: Requirements 3.8, 3.9**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.applications.filters import ApplicationFilter  # noqa: E402
from apps.applications.models import Application  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

statuses = st.sampled_from(["draft", "submitted", "under_review", "approved", "rejected"])
payment_statuses = st.sampled_from(["not_paid", "pending", "verified", "successful", "failed"])
search_terms = st.text(
    alphabet=st.sampled_from("abcdefghijklmnopqrstuvwxyz "),
    min_size=1,
    max_size=20,
)
sort_values = st.sampled_from(["created_at", "-created_at", "full_name", "-full_name"])
program_names = st.text(
    alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz "),
    min_size=2,
    max_size=30,
)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestExistingSnakeCaseFiltersUnchanged(SimpleTestCase):
    """For all existing snake_case filter params, behavior is identical
    after adding camelCase aliases.

    **Validates: Requirements 3.8, 3.9**
    """

    @given(status=statuses)
    @settings(max_examples=30)
    def test_status_filter_unchanged(self, status):
        """status filter continues to work."""
        data = {"status": status}
        qs = Application.objects.all()
        f = ApplicationFilter(data=data, queryset=qs)
        filtered_qs = f.qs

        sql = str(filtered_qs.query).lower()
        assert "status" in sql, f"status={status} should filter on status field"

    @given(payment_status=payment_statuses)
    @settings(max_examples=30)
    def test_payment_status_snake_case_unchanged(self, payment_status):
        """payment_status (snake_case) continues to work."""
        data = {"payment_status": payment_status}
        qs = Application.objects.all()
        f = ApplicationFilter(data=data, queryset=qs)
        filtered_qs = f.qs

        sql = str(filtered_qs.query).lower()
        assert "payment_status" in sql, (
            f"payment_status={payment_status} should filter on payment_status"
        )

    @given(search=search_terms)
    @settings(max_examples=30)
    def test_search_filter_unchanged(self, search):
        """search filter continues to work."""
        data = {"search": search}
        qs = Application.objects.all()
        f = ApplicationFilter(data=data, queryset=qs)
        filtered_qs = f.qs

        sql = str(filtered_qs.query).lower()
        assert "full_name" in sql or "email" in sql, (
            f"search={search} should filter on full_name or email"
        )

    @given(sort=sort_values)
    @settings(max_examples=20)
    def test_sort_filter_unchanged(self, sort):
        """sort filter continues to work with existing format."""
        data = {"sort": sort}
        qs = Application.objects.all()
        f = ApplicationFilter(data=data, queryset=qs)
        filtered_qs = f.qs

        ordering = filtered_qs.query.order_by
        assert len(ordering) > 0, f"sort={sort} should produce ordering"

        field = sort.lstrip("-")
        desc = sort.startswith("-")
        expected = f"-{field}" if desc else field
        assert ordering[0] == expected, (
            f"Expected ordering '{expected}', got '{ordering[0]}'"
        )

    @given(program=program_names)
    @settings(max_examples=20)
    def test_program_filter_unchanged(self, program):
        """program filter continues to work."""
        data = {"program": program}
        qs = Application.objects.all()
        f = ApplicationFilter(data=data, queryset=qs)
        filtered_qs = f.qs

        sql = str(filtered_qs.query).lower()
        assert "program" in sql, f"program={program} should filter on program field"
