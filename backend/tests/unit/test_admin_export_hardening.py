"""Regression tests for role-aware admin export redaction."""

from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from apps.accounts.admin_views import (
    _is_super_admin as user_export_is_super_admin,
    _redact_email as redact_user_email,
    _redact_name as redact_user_name,
)
from apps.applications.admin_views import (
    ApplicationExportView,
    _is_super_admin as app_export_is_super_admin,
    _redact_email as redact_application_email,
    _redact_name as redact_application_name,
    _redact_phone as redact_application_phone,
)


class AdminExportHardeningTests(SimpleTestCase):
    def test_regular_admin_is_not_full_export_scope(self):
        user = SimpleNamespace(role="admin")

        self.assertFalse(app_export_is_super_admin(user))
        self.assertFalse(user_export_is_super_admin(user))

    def test_super_admin_is_full_export_scope(self):
        user = SimpleNamespace(role="super_admin")

        self.assertTrue(app_export_is_super_admin(user))
        self.assertTrue(user_export_is_super_admin(user))

    def test_application_export_redacts_direct_identifiers(self):
        self.assertEqual(redact_application_name("Jane Mary Doe"), "J*** M*** D***")
        self.assertEqual(redact_application_email("jane@example.com"), "j***@example.com")
        self.assertEqual(redact_application_phone("+260 971 123456"), "***3456")

    def test_user_export_redacts_direct_identifiers(self):
        self.assertEqual(redact_user_name("Jane"), "J***")
        self.assertEqual(redact_user_email("jane@example.com"), "j***@example.com")

    def test_regular_admin_application_export_is_redacted(self):
        app = SimpleNamespace(
            application_number="APP-1",
            full_name="Jane Mary Doe",
            email="jane@example.com",
            phone="+260971123456",
            program="Clinical Medicine",
            intake="July 2026",
            institution="MIHAS",
            status="submitted",
            created_at=None,
        )
        queryset = _FakeQuerySet([app])
        request = SimpleNamespace(query_params={}, user=SimpleNamespace(role="admin"))

        rows = [{
            "full_name": "Jane Mary Doe",
            "email": "jane@example.com",
            "phone": "+260971123456",
        }]
        with (
            patch("apps.applications.admin_views.Application.objects") as objects,
            patch("apps.applications.admin_export_views._with_payment_summary", return_value=queryset),
            patch("apps.applications.admin_export_views.ApplicationFilter", return_value=SimpleNamespace(qs=queryset)),
            patch("apps.applications.admin_export_views.StandardPagination") as pagination,
            patch("apps.applications.admin_export_views.ApplicationListSerializer", return_value=SimpleNamespace(data=rows)),
        ):
            objects.all.return_value = queryset
            paginator = pagination.return_value
            paginator.paginate_queryset.return_value = None
            response = ApplicationExportView().get(request)

        results = response.data["data"]["results"]
        self.assertEqual(results[0]["full_name"], "J*** M*** D***")
        self.assertEqual(results[0]["email"], "j***@example.com")
        self.assertEqual(results[0]["phone"], "***3456")

    def test_super_admin_application_export_is_full(self):
        app = SimpleNamespace(
            application_number="APP-1",
            full_name="Jane Mary Doe",
            email="jane@example.com",
            phone="+260971123456",
            program="Clinical Medicine",
            intake="July 2026",
            institution="MIHAS",
            status="submitted",
            created_at=None,
        )
        queryset = _FakeQuerySet([app])
        request = SimpleNamespace(query_params={}, user=SimpleNamespace(role="super_admin"))

        rows = [{
            "full_name": "Jane Mary Doe",
            "email": "jane@example.com",
            "phone": "+260971123456",
        }]
        with (
            patch("apps.applications.admin_views.Application.objects") as objects,
            patch("apps.applications.admin_export_views._with_payment_summary", return_value=queryset),
            patch("apps.applications.admin_export_views.ApplicationFilter", return_value=SimpleNamespace(qs=queryset)),
            patch("apps.applications.admin_export_views.StandardPagination") as pagination,
            patch("apps.applications.admin_export_views.ApplicationListSerializer", return_value=SimpleNamespace(data=rows)),
        ):
            objects.all.return_value = queryset
            paginator = pagination.return_value
            paginator.paginate_queryset.return_value = None
            response = ApplicationExportView().get(request)

        results = response.data["data"]["results"]
        self.assertEqual(results[0]["full_name"], "Jane Mary Doe")
        self.assertEqual(results[0]["email"], "jane@example.com")
        self.assertEqual(results[0]["phone"], "+260971123456")


class _FakeQuerySet(list):
    def order_by(self, *_args):
        return self

    def filter(self, **_kwargs):
        return self
