"""Property tests for admin dashboard recent activity formatting.

# Feature: admin-dashboard-overhaul
"""

import os
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.accounts.admin_views import AdminDashboardView  # noqa: E402


BASE_TIME = datetime(2026, 4, 18, 10, 0, tzinfo=timezone.utc)


def make_application(application_number):
    return SimpleNamespace(application_number=application_number)


def make_status_entry(application_number, old_status, new_status, offset_seconds):
    return SimpleNamespace(
        id=uuid.uuid4(),
        application=make_application(application_number),
        changed_by=SimpleNamespace(first_name="Admin", last_name="User"),
        old_status=old_status,
        new_status=new_status,
        created_at=BASE_TIME + timedelta(seconds=offset_seconds),
    )


def make_payment(application_number, status, offset_seconds):
    return SimpleNamespace(
        id=uuid.uuid4(),
        application=make_application(application_number),
        status=status,
        updated_at=BASE_TIME + timedelta(seconds=offset_seconds),
    )


safe_text = st.text(min_size=0, max_size=40)
status_text = st.text(min_size=1, max_size=30)


class AdminDashboardRecentActivityProperties(SimpleTestCase):
    @settings(max_examples=5)
    @given(safe_text, status_text, status_text, st.integers(min_value=0, max_value=100000))
    def test_status_activity_entries_are_complete_and_not_audit_log_shaped(
        self, application_number, old_status, new_status, offset_seconds
    ):
        """Feature: admin-dashboard-overhaul, Property 4: Recent activity entry completeness."""

        activity = AdminDashboardView._format_recent_activity(
            [make_status_entry(application_number, old_status, new_status, offset_seconds)],
            [],
        )

        self.assertEqual(len(activity), 1)
        item = activity[0]
        for field in ("id", "application_number", "old_status", "new_status", "timestamp", "message"):
            self.assertIn(field, item)
            self.assertIsNotNone(item[field])
        self.assertEqual(item["type"], "status_change")
        self.assertNotIn("entity_type", item)
        self.assertNotIn("retention_category", item)

    @settings(max_examples=5)
    @given(st.lists(st.integers(min_value=0, max_value=100000), min_size=0, max_size=25))
    def test_recent_activity_is_ordered_descending_and_limited(self, offsets):
        """Feature: admin-dashboard-overhaul, Property 5: Recent activity ordering and limiting."""

        status_entries = [
            make_status_entry(f"APP-{index}", "submitted", "approved", offset)
            for index, offset in enumerate(offsets)
        ]
        payments = [
            make_payment(f"PAY-{index}", "paid", offset + 1)
            for index, offset in enumerate(offsets[:5])
        ]

        activity = AdminDashboardView._format_recent_activity(status_entries, payments)
        timestamps = [item["timestamp"] for item in activity]

        self.assertLessEqual(len(activity), 10)
        self.assertEqual(timestamps, sorted(timestamps, reverse=True))

    @settings(max_examples=5)
    @given(safe_text, st.sampled_from(["paid", "successful", "verified"]))
    def test_payment_events_are_included_when_recent(self, application_number, status):
        """Feature: admin-dashboard-overhaul, Property 6: Payment events in activity feed."""

        payment = make_payment(application_number, status, 100)
        activity = AdminDashboardView._format_recent_activity([], [payment])

        self.assertEqual(len(activity), 1)
        self.assertEqual(activity[0]["type"], "payment")
        self.assertEqual(activity[0]["new_status"], status)
        self.assertIn("Payment", activity[0]["message"])
