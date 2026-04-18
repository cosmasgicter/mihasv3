"""Unit coverage for the admin dashboard overhaul."""

import os
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402

from apps.accounts.admin_views import (  # noqa: E402
    AdminDashboardActivitySerializer,
    AdminDashboardView,
)


class AdminDashboardOverhaulUnitTests(SimpleTestCase):
    def test_activity_serializer_matches_new_recent_activity_shape(self):
        serializer = AdminDashboardActivitySerializer(
            data={
                "id": str(uuid.uuid4()),
                "type": "status_change",
                "application_number": "APP-001",
                "old_status": "submitted",
                "new_status": "under_review",
                "timestamp": "2026-04-18T10:00:00+00:00",
                "actor_name": "Admin User",
                "message": "APP-001: submitted -> under_review",
            }
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertNotIn("entity_type", serializer.validated_data)
        self.assertNotIn("retention_category", serializer.validated_data)

    def test_recent_activity_formatter_combines_status_and_payment_entries(self):
        application = SimpleNamespace(application_number="APP-001")
        actor = SimpleNamespace(first_name="Admin", last_name="User")
        status_entry = SimpleNamespace(
            id=uuid.uuid4(),
            application=application,
            changed_by=actor,
            old_status="submitted",
            new_status="approved",
            created_at=datetime(2026, 4, 18, 10, 0, tzinfo=timezone.utc),
        )
        payment = SimpleNamespace(
            id=uuid.uuid4(),
            application=application,
            status="paid",
            updated_at=datetime(2026, 4, 18, 11, 0, tzinfo=timezone.utc),
        )

        activity = AdminDashboardView._format_recent_activity([status_entry], [payment])

        self.assertEqual([item["type"] for item in activity], ["payment", "status_change"])
        self.assertEqual(activity[0]["application_number"], "APP-001")
        self.assertEqual(activity[1]["actor_name"], "Admin User")
