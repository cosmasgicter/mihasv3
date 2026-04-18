"""Unit coverage for the admin dashboard overhaul."""

import os
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402

from apps.accounts.admin_views import (  # noqa: E402
    AdminDashboardActivitySerializer,
    AdminDashboardView,
    AuditLogSerializer,
)
from apps.documents.views import ProgramFeeViewSet  # noqa: E402


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

    def test_audit_log_serializer_exposes_network_context_for_admin_trail(self):
        serializer = AuditLogSerializer(
            SimpleNamespace(
                id=uuid.uuid4(),
                actor_id=uuid.uuid4(),
                action="user_update",
                entity_type="profiles",
                entity_id=uuid.uuid4(),
                changes={"role": {"old": "student", "new": "admin"}},
                ip_address="hashed-ip",
                user_agent="hashed-agent",
                retention_category="security",
                created_at=datetime(2026, 4, 18, 10, 0, tzinfo=timezone.utc),
            )
        )

        self.assertEqual(serializer.data["ip_address"], "hashed-ip")
        self.assertEqual(serializer.data["user_agent"], "hashed-agent")

    def test_program_fee_queryset_includes_legacy_null_active_rows(self):
        viewset = ProgramFeeViewSet()
        viewset.kwargs = {"program_id": uuid.uuid4()}

        with patch("apps.documents.views.ProgramFee.objects") as manager:
            queryset = MagicMock()
            ordered = MagicMock()
            manager.filter.return_value = queryset
            queryset.order_by.return_value = ordered

            result = viewset.get_queryset()

        self.assertIs(result, ordered)
        manager.filter.assert_called_once()
        self.assertEqual(manager.filter.call_args.kwargs["program_id"], viewset.kwargs["program_id"])
