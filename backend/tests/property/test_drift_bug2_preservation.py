"""
Bug 2 (HIGH) — Admin Settings drift: Preservation tests.

Verifies that existing GET/PATCH/DELETE endpoints on admin settings
continue to work identically after the import/reset endpoints were added.
Uses SimpleTestCase with mocked DB to avoid requiring a live Postgres connection.

**Validates: Requirements 3.3, 3.4, 3.5**
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
    AdminSettingDetailView,
    AdminSettingsListView,
    SettingSerializer,
    SettingUpdateSerializer,
)


def _make_admin_user():
    user = MagicMock()
    user.pk = uuid.uuid4()
    user.is_authenticated = True
    user.role = "admin"
    return user


def _make_mock_setting(key="test_key", value="test_value"):
    setting = MagicMock()
    setting.id = uuid.uuid4()
    setting.pk = setting.id
    setting.key = key
    setting.value = value
    setting.description = "A test setting"
    setting.category = "general"
    setting.is_public = False
    setting.updated_by = None
    setting.created_at = "2025-01-01T00:00:00Z"
    setting.updated_at = "2025-01-01T00:00:00Z"
    return setting


class TestSettingsListPreservation(SimpleTestCase):
    """GET /api/v1/admin/settings/ still returns settings list.

    **Validates: Requirements 3.3**
    """

    def test_list_settings_returns_200(self):
        factory = APIRequestFactory()
        request = factory.get("/api/v1/admin/settings/")
        admin = _make_admin_user()
        force_authenticate(request, user=admin)

        mock_setting = _make_mock_setting()
        mock_qs = MagicMock()
        mock_qs.order_by.return_value = mock_qs
        mock_qs.filter.return_value = mock_qs
        mock_qs.count.return_value = 1
        mock_qs.__getitem__ = MagicMock(return_value=[mock_setting])

        with patch("apps.accounts.admin_views.Setting.objects", mock_qs):
            view = AdminSettingsListView.as_view()
            response = view(request)

        self.assertEqual(response.status_code, 200)
        # Paginated response is already wrapped by the view contract.
        self.assertTrue(response.data["success"])
        self.assertIn("results", response.data["data"])


class TestSettingsDetailPreservation(SimpleTestCase):
    """GET /api/v1/admin/settings/{id}/ still returns a single setting.

    **Validates: Requirements 3.4**
    """

    def test_get_setting_by_id_returns_200(self):
        factory = APIRequestFactory()
        setting_id = uuid.uuid4()
        request = factory.get(f"/api/v1/admin/settings/{setting_id}/")
        admin = _make_admin_user()
        force_authenticate(request, user=admin)

        mock_setting = _make_mock_setting()

        with patch("apps.accounts.admin_views.Setting.objects") as mock_qs:
            mock_qs.get.return_value = mock_setting
            view = AdminSettingDetailView.as_view()
            response = view(request, pk=setting_id)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["data"]["key"], "test_key")


class TestSettingsPatchPreservation(SimpleTestCase):
    """PATCH /api/v1/admin/settings/{id}/ still updates a setting.

    **Validates: Requirements 3.4**
    """

    def test_patch_setting_returns_200(self):
        factory = APIRequestFactory()
        setting_id = uuid.uuid4()
        request = factory.patch(
            f"/api/v1/admin/settings/{setting_id}/",
            data={"value": "updated_value"},
            format="json",
        )
        admin = _make_admin_user()
        force_authenticate(request, user=admin)

        mock_setting = _make_mock_setting(value="original")
        mock_setting.save = MagicMock()

        with patch("apps.accounts.admin_views.Setting.objects") as mock_qs:
            mock_qs.get.return_value = mock_setting
            view = AdminSettingDetailView.as_view()
            response = view(request, pk=setting_id)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])


class TestSettingsDeletePreservation(SimpleTestCase):
    """DELETE /api/v1/admin/settings/{id}/ still deletes a setting.

    **Validates: Requirements 3.5**
    """

    def test_delete_setting_returns_200(self):
        factory = APIRequestFactory()
        setting_id = uuid.uuid4()
        request = factory.delete(f"/api/v1/admin/settings/{setting_id}/")
        admin = _make_admin_user()
        force_authenticate(request, user=admin)

        mock_setting = _make_mock_setting()
        mock_setting.delete = MagicMock()

        with patch("apps.accounts.admin_views.Setting.objects") as mock_qs:
            mock_qs.get.return_value = mock_setting
            view = AdminSettingDetailView.as_view()
            response = view(request, pk=setting_id)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])

    def test_delete_nonexistent_returns_404(self):
        factory = APIRequestFactory()
        setting_id = uuid.uuid4()
        request = factory.delete(f"/api/v1/admin/settings/{setting_id}/")
        admin = _make_admin_user()
        force_authenticate(request, user=admin)

        from apps.common.models import Setting  # noqa: E402

        with patch("apps.accounts.admin_views.Setting.objects") as mock_qs:
            mock_qs.get.side_effect = Setting.DoesNotExist
            view = AdminSettingDetailView.as_view()
            response = view(request, pk=setting_id)

        self.assertEqual(response.status_code, 404)


class TestSettingsValidation(SimpleTestCase):
    """Admin settings accept guided operational values and reject unsafe drift."""

    def test_create_rejects_invalid_key_shape(self):
        serializer = SettingSerializer(
            data={
                "key": "__proto__",
                "value": "x",
                "category": "general",
                "description": "",
                "is_public": False,
            }
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("key", serializer.errors)

    def test_create_rejects_known_setting_wrong_type(self):
        serializer = SettingSerializer(
            data={
                "key": "max_applications_per_user",
                "value": "not-an-integer",
                "category": "limits",
                "description": "",
                "is_public": False,
            }
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("non_field_errors", serializer.errors)

    def test_create_rejects_deep_json_payload(self):
        serializer = SettingSerializer(
            data={
                "key": "custom_setting",
                "value": {"a": {"b": {"c": {"d": {"e": "too deep"}}}}},
                "category": "general",
                "description": "",
                "is_public": False,
            }
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("non_field_errors", serializer.errors)

    def test_patch_validates_known_setting_against_existing_key(self):
        serializer = SettingUpdateSerializer(
            data={"value": "not-an-integer"},
            context={"setting_key": "max_applications_per_user"},
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("non_field_errors", serializer.errors)
