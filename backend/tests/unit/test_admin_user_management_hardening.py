"""Unit tests for admin user-management hardening."""

import os
import uuid
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.db import IntegrityError  # noqa: E402
from django.test import SimpleTestCase  # noqa: E402
from rest_framework.test import APIRequestFactory, force_authenticate  # noqa: E402

from apps.accounts.admin_views import AdminUserDetailView  # noqa: E402
from apps.accounts.authentication import JWTUser  # noqa: E402
from apps.accounts.batch_views import BatchUserImportView  # noqa: E402


def _jwt_user(role: str, user_id=None):
    return JWTUser(
        {
            "user_id": str(user_id or uuid.uuid4()),
            "email": f"{role}@example.com",
            "role": role,
            "first_name": role.title(),
            "last_name": "User",
        }
    )


class TestAdminUserDetailHardening(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.view = AdminUserDetailView.as_view()

    @patch("apps.accounts.admin_views.Profile.objects.get")
    def test_admin_cannot_promote_user_above_own_role(self, mock_get):
        target = SimpleNamespace(
            pk=uuid.uuid4(),
            role="admin",
            is_active=True,
            first_name="Target",
            last_name="User",
            password_hash="hashed",
            save=MagicMock(),
        )
        mock_get.return_value = target

        request = self.factory.patch(
            f"/api/v1/admin/users/{target.pk}/",
            {"role": "super_admin"},
            format="json",
        )
        force_authenticate(request, user=_jwt_user("admin"))

        response = self.view(request, pk=str(target.pk))

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "INSUFFICIENT_PRIVILEGES")
        target.save.assert_not_called()

    @patch("apps.accounts.admin_views.Profile.objects.get")
    def test_admin_cannot_modify_super_admin_account(self, mock_get):
        target = SimpleNamespace(
            pk=uuid.uuid4(),
            role="super_admin",
            is_active=True,
            first_name="Root",
            last_name="User",
            password_hash="hashed",
            save=MagicMock(),
        )
        mock_get.return_value = target

        request = self.factory.patch(
            f"/api/v1/admin/users/{target.pk}/",
            {"first_name": "Changed"},
            format="json",
        )
        force_authenticate(request, user=_jwt_user("admin"))

        response = self.view(request, pk=str(target.pk))

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "INSUFFICIENT_PRIVILEGES")
        target.save.assert_not_called()

    @patch("apps.accounts.admin_views.Profile.objects.get")
    def test_admin_cannot_deactivate_own_account(self, mock_get):
        actor_id = uuid.uuid4()
        target = SimpleNamespace(
            pk=actor_id,
            role="admin",
            is_active=True,
            first_name="Self",
            last_name="Admin",
            password_hash="hashed",
            save=MagicMock(),
        )
        mock_get.return_value = target

        request = self.factory.patch(
            f"/api/v1/admin/users/{target.pk}/",
            {"is_active": False},
            format="json",
        )
        force_authenticate(request, user=_jwt_user("admin", actor_id))

        response = self.view(request, pk=str(target.pk))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "SELF_DEACTIVATION_FORBIDDEN")
        target.save.assert_not_called()


class TestBatchUserImportHardening(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.view = BatchUserImportView.as_view()

    @patch("apps.accounts.batch_views.Profile.objects.filter")
    def test_admin_cannot_batch_create_super_admin(self, mock_filter):
        mock_filter.return_value.values_list.return_value = []

        request = self.factory.post(
            "/api/v1/admin/users/batch-import/",
            [
                {
                    "email": "root@example.com",
                    "first_name": "Root",
                    "last_name": "User",
                    "role": "super_admin",
                }
            ],
            format="json",
        )
        force_authenticate(request, user=_jwt_user("admin"))

        response = self.view(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["created"], 0)
        self.assertEqual(response.data["data"]["skipped"], 1)
        self.assertIn("higher role than your own", response.data["data"]["errors"][0]["errors"]["role"][0])

    @patch("apps.accounts.batch_views.AuditLog.objects.create")
    @patch("apps.accounts.batch_views.build_audit_network_fields")
    @patch("apps.accounts.batch_views.Profile.objects.create")
    @patch("apps.accounts.batch_views.Profile.objects.filter")
    @patch("apps.accounts.batch_views.transaction.atomic")
    def test_batch_import_handles_integrity_race_and_audits_summary(
        self,
        mock_atomic,
        mock_filter,
        mock_create,
        mock_build_audit_fields,
        mock_audit_create,
    ):
        mock_atomic.return_value = nullcontext()
        mock_filter.return_value.values_list.return_value = []
        mock_create.side_effect = [None, IntegrityError("duplicate key")]
        mock_build_audit_fields.return_value = {
            "ip_address": "iphash",
            "user_agent": "uahash",
            "ip_address_encrypted": "encip",
            "user_agent_encrypted": "encua",
        }

        request = self.factory.post(
            "/api/v1/admin/users/batch-import/",
            [
                {
                    "email": "first@example.com",
                    "first_name": "First",
                    "last_name": "User",
                    "role": "student",
                },
                {
                    "email": "second@example.com",
                    "first_name": "Second",
                    "last_name": "User",
                    "role": "student",
                },
            ],
            format="json",
        )
        force_authenticate(request, user=_jwt_user("super_admin"))

        response = self.view(request)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["data"]["created"], 1)
        self.assertEqual(response.data["data"]["skipped"], 1)
        self.assertEqual(response.data["data"]["errors"][0]["errors"]["email"], ["Already exists"])
        mock_audit_create.assert_called_once()
        changes = mock_audit_create.call_args.kwargs["changes"]
        self.assertEqual(changes["created_count"], 1)
        self.assertEqual(changes["skipped_count"], 1)
        self.assertEqual(changes["created_emails"], ["first@example.com"])
