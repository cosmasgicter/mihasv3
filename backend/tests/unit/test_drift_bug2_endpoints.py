"""
Bug 2 (HIGH) — Admin Settings drift: Integration tests for import and reset endpoints.

Tests that POST /admin/settings/import/ and POST /admin/settings/reset/
exist, accept valid payloads, and require authentication. Uses SimpleTestCase
with mocked DB to avoid requiring a live Postgres connection.

**Validates: Requirements 2.4, 2.5**
"""

import os
import uuid
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from rest_framework.test import APIRequestFactory, force_authenticate  # noqa: E402

from apps.accounts.admin_views import (  # noqa: E402
    AdminSettingsImportView,
    AdminSettingsResetView,
    DEFAULT_GUIDED_SETTINGS,
)


def _make_user(role="admin"):
    """Create a mock authenticated user."""
    user = MagicMock()
    user.pk = uuid.uuid4()
    user.id = user.pk
    user.is_authenticated = True
    user.role = role
    return user


def _make_admin_user():
    """Create a mock admin user for authentication."""
    return _make_user("admin")


class TestAdminSettingsImportEndpoint(SimpleTestCase):
    """Integration tests for the settings import endpoint.

    **Validates: Requirements 2.4**
    """

    def test_import_valid_payload_returns_200(self):
        """POST /admin/settings/import/ with valid settings returns 200."""
        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/admin/settings/import/",
            data={
                "settings": [
                    {
                        "key": "test_setting_1",
                        "value": "hello",
                        "description": "test",
                        "category": "general",
                        "is_public": False,
                    },
                ]
            },
            format="json",
        )
        admin = _make_admin_user()
        force_authenticate(request, user=admin)

        mock_setting = MagicMock()
        with patch("apps.accounts.admin_views.Setting.objects") as mock_qs:
            mock_qs.update_or_create.return_value = (mock_setting, True)
            view = AdminSettingsImportView.as_view()
            response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["data"]["imported"], ["test_setting_1"])
        self.assertEqual(response.data["data"]["errors"], [])

    def test_import_missing_settings_key_returns_400(self):
        """POST /admin/settings/import/ without 'settings' array returns 400."""
        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/admin/settings/import/",
            data={"not_settings": []},
            format="json",
        )
        admin = _make_admin_user()
        force_authenticate(request, user=admin)

        view = AdminSettingsImportView.as_view()
        response = view(request)

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.data["success"])

    def test_import_requires_authentication(self):
        """POST /admin/settings/import/ without auth returns 403."""
        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/admin/settings/import/",
            data={"settings": []},
            format="json",
        )
        # No force_authenticate — anonymous request

        view = AdminSettingsImportView.as_view()
        response = view(request)

        self.assertIn(response.status_code, (401, 403))

    def test_import_requires_admin_role(self):
        """POST /admin/settings/import/ denies non-admin authenticated users."""
        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/admin/settings/import/",
            data={"settings": []},
            format="json",
        )
        force_authenticate(request, user=_make_user("student"))

        with patch("apps.accounts.permissions._check_permission_override", return_value=False):
            view = AdminSettingsImportView.as_view()
            response = view(request)

        self.assertEqual(response.status_code, 403)

    def test_import_multiple_settings(self):
        """POST /admin/settings/import/ with multiple settings upserts all."""
        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/admin/settings/import/",
            data={
                "settings": [
                    {"key": "key_a", "value": "val_a"},
                    {"key": "key_b", "value": "val_b"},
                ]
            },
            format="json",
        )
        admin = _make_admin_user()
        force_authenticate(request, user=admin)

        mock_setting = MagicMock()
        with patch("apps.accounts.admin_views.Setting.objects") as mock_qs:
            mock_qs.update_or_create.return_value = (mock_setting, True)
            view = AdminSettingsImportView.as_view()
            response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["imported"], ["key_a", "key_b"])


class TestAdminSettingsResetEndpoint(SimpleTestCase):
    """Integration tests for the settings reset endpoint.

    **Validates: Requirements 2.5**
    """

    def test_reset_returns_200(self):
        """POST /admin/settings/reset/ returns 200 with confirmation."""
        factory = APIRequestFactory()
        request = factory.post("/api/v1/admin/settings/reset/", format="json")
        admin = _make_admin_user()
        force_authenticate(request, user=admin)

        with (
            patch("apps.accounts.admin_views.Setting.objects") as mock_qs,
            patch("apps.accounts.admin_views.transaction.atomic"),
        ):
            mock_qs.all.return_value.delete.return_value = (3, {"common.Setting": 3})
            view = AdminSettingsResetView.as_view()
            response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        self.assertIn("guided defaults", response.data["data"]["message"].lower())
        self.assertEqual(response.data["data"]["restored"], len(DEFAULT_GUIDED_SETTINGS))
        self.assertEqual(mock_qs.bulk_create.call_count, 1)

    def test_reset_requires_authentication(self):
        """POST /admin/settings/reset/ without auth returns 403."""
        factory = APIRequestFactory()
        request = factory.post("/api/v1/admin/settings/reset/", format="json")
        # No force_authenticate — anonymous request

        view = AdminSettingsResetView.as_view()
        response = view(request)

        self.assertIn(response.status_code, (401, 403))

    def test_reset_requires_admin_role(self):
        """POST /admin/settings/reset/ denies non-admin authenticated users."""
        factory = APIRequestFactory()
        request = factory.post("/api/v1/admin/settings/reset/", format="json")
        force_authenticate(request, user=_make_user("student"))

        with patch("apps.accounts.permissions._check_permission_override", return_value=False):
            view = AdminSettingsResetView.as_view()
            response = view(request)

        self.assertEqual(response.status_code, 403)
