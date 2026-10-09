"""Unit tests for the read-only per-user Effective_Capabilities endpoint.

Admissions-v2 task 2.4 (AUTH-04 / R3.7): the user detail surface shows the
target user's backend-derived Effective_Capabilities as read-only data. The
fake permission editor is gone; there is no mutation here. These tests exercise
the ``AdminUserEffectiveCapabilitiesView`` authority, read-only projection,
tenant-scope masking, and fail-closed behavior without a database, mirroring
the mock style of ``test_admin_user_management_hardening.py``.
"""

import os
import uuid
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from rest_framework.exceptions import PermissionDenied  # noqa: E402
from rest_framework.test import APIRequestFactory, force_authenticate  # noqa: E402

from apps.accounts.admin_views import AdminUserEffectiveCapabilitiesView  # noqa: E402
from apps.accounts.authentication import JWTUser  # noqa: E402
from apps.accounts.models import Profile  # noqa: E402
from apps.catalog.services import CapabilityResolutionError  # noqa: E402


def _jwt_user(role, user_id=None):
    return JWTUser(
        {
            "user_id": str(user_id or uuid.uuid4()),
            "email": f"{role}@example.com",
            "role": role,
            "first_name": role.title(),
            "last_name": "User",
        }
    )


def _target(pk=None, role="admin"):
    return SimpleNamespace(pk=pk or uuid.uuid4(), role=role)


_PAYLOAD = {
    "role": "admin",
    "is_super_admin": False,
    "all_access": False,
    "capabilities": [],
    "institutions": [
        {
            "id": "11111111-1111-1111-1111-111111111111",
            "code": "MIHAS",
            "name": "MIHAS",
            "capabilities": ["tenant.application.read", "tenant.document.read"],
        }
    ],
}


class TestAdminUserEffectiveCapabilities(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.view = AdminUserEffectiveCapabilitiesView.as_view()

    def _get(self, actor, pk):
        request = self.factory.get(
            f"/api/v1/admin/users/{pk}/effective-capabilities/"
        )
        force_authenticate(request, user=actor)
        return self.view(request, pk=str(pk))

    @patch(
        "apps.accounts.admin_user_views._build_capability_payload",
        return_value=dict(_PAYLOAD),
    )
    @patch("apps.accounts.admin_user_views._scoped_user_ids", return_value=None)
    @patch("apps.accounts.admin_user_views.Profile.objects.get")
    def test_super_admin_reads_target_capabilities_read_only(
        self, mock_get, _mock_scope, mock_payload
    ):
        target = _target()
        mock_get.return_value = target

        resp = self._get(_jwt_user("super_admin"), target.pk)

        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["success"])
        data = resp.data["data"]
        # Read-only projection — the panel never mutates authority.
        self.assertTrue(data["read_only"])
        # Payload is the target's backend-derived capability set, passed through.
        self.assertEqual(data["institutions"][0]["code"], "MIHAS")
        self.assertIn("tenant.application.read", data["institutions"][0]["capabilities"])
        mock_payload.assert_called_once_with(target)

    @patch(
        "apps.accounts.admin_user_views.Profile.objects.get",
        side_effect=Profile.DoesNotExist,
    )
    def test_missing_target_returns_404(self, _mock_get):
        resp = self._get(_jwt_user("super_admin"), uuid.uuid4())
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.data["code"], "NOT_FOUND")

    @patch("apps.accounts.admin_user_views._scoped_user_ids")
    @patch("apps.accounts.admin_user_views.Profile.objects.get")
    def test_out_of_scope_target_masked_as_not_found(self, mock_get, mock_scope):
        target = _target()
        mock_get.return_value = target
        # Scope resolves to a set that does NOT include the target — the read is
        # masked as a genuine not-found so existence cannot be inferred (R5.4).
        mock_scope.return_value = {str(uuid.uuid4())}

        resp = self._get(_jwt_user("super_admin"), target.pk)

        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.data["code"], "NOT_FOUND")

    @patch(
        "apps.accounts.admin_user_views._build_capability_payload",
        side_effect=CapabilityResolutionError("boom"),
    )
    @patch("apps.accounts.admin_user_views._scoped_user_ids", return_value=None)
    @patch("apps.accounts.admin_user_views.Profile.objects.get")
    def test_resolution_error_fails_closed_to_zero_authority(
        self, mock_get, _mock_scope, _mock_payload
    ):
        target = _target(role="admin")
        mock_get.return_value = target

        resp = self._get(_jwt_user("super_admin"), target.pk)

        self.assertEqual(resp.status_code, 200)
        data = resp.data["data"]
        self.assertTrue(data["resolution_error"])
        self.assertEqual(data["capabilities"], [])
        self.assertEqual(data["institutions"], [])
        self.assertTrue(data["read_only"])

    @patch("apps.catalog.permissions.AdminCapabilityService")
    @patch("apps.accounts.admin_user_views.Profile.objects.get")
    def test_actor_without_platform_capability_is_denied(
        self, mock_get, mock_service_cls
    ):
        mock_get.return_value = _target()
        mock_service_cls.return_value.require_capability.side_effect = (
            PermissionDenied("nope")
        )

        resp = self._get(_jwt_user("student"), uuid.uuid4())

        self.assertEqual(resp.status_code, 403)
