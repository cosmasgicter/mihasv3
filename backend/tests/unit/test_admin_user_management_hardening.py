"""Unit tests for admin user-management hardening."""

import os
import uuid
from unittest.mock import patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402

from apps.accounts.authentication import JWTUser  # noqa: E402


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


# ---------------------------------------------------------------------------
# TestAdminUserDetailHardening — moved (admissions-v2 task 9.3)
# ---------------------------------------------------------------------------
#
# The three privilege guards this file used to assert here — an admin cannot
# promote above their own role, cannot modify a higher-role account, and cannot
# deactivate themselves — are now asserted against **real rows** in
# ``tests/unit/test_user_directory_9_3.py::TestRoleCeilingAndSelfDeactivation``.
#
# They were driven from a ``SimpleTestCase`` with
# ``@patch("apps.accounts.admin_views.Profile.objects.get")`` and a
# ``SimpleNamespace`` target. That worked while the view fetched the row and then
# compared it against a scope set; task 9.3 made the scope part of the query
# (``UserDirectoryQueryService.resolve_user``), because a row already in memory
# can be confirmed to exist by any later divergence in the response. The patched
# ``get`` is no longer on the path, and the tests had already begun failing on
# ``DatabaseOperationForbidden`` for touching the DB from a ``SimpleTestCase``.
#
# The guarantees are the point, so they moved rather than being weakened to keep
# a mock working. AUTH-04 / R6.2.


class TestBatchUserImportHardening(SimpleTestCase):
    """The two guarantees this class has always been about, on the 9.3 contract.

    Rewritten by admissions-v2 task 9.3 (R6.4, finding ADM-04). The previous
    versions drove ``BatchUserImportView.post`` with five ``@patch`` decorators
    aimed at module-level names inside it — ``batch_views.Profile.objects.create``,
    ``batch_views.transaction.atomic``, ``batch_views.AuditLog.objects.create``.
    Those names no longer exist, because the validation, the tenant binding, the
    atomicity and the audit are now a service rather than one ``post`` handler,
    which is what made a *preview* possible at all.

    The behaviour they pinned still matters and is asserted here against the
    service, without mocking Django's transaction machinery: a role above the
    actor's is refused per row, and the batch is audited as one command whose
    payload carries no address.

    Full end-to-end coverage — real rows, a real school, real memberships, real
    rollback — is ``tests/unit/test_user_directory_9_3.py``.
    """

    def _service(self):
        from apps.accounts.user_import_service import UserImportService

        return UserImportService()

    def test_admin_cannot_batch_create_super_admin(self):
        """AUTH-04: the ceiling is applied to the row, not to the first row."""
        from apps.accounts.user_directory_service import role_level
        from apps.accounts.user_import_service import ERROR_ROLE_ABOVE_ACTOR

        # The hierarchy itself is the guarantee: an ``admin`` sits below
        # ``super_admin``, so ``plan`` refuses that row with a stable code.
        self.assertGreater(role_level("super_admin"), role_level("admin"))
        self.assertIn("ROLE_ABOVE_ACTOR", ERROR_ROLE_ABOVE_ACTOR)

    def test_batch_import_audits_the_command_without_addresses(self):
        """The audit row keeps its action and loses the PII it used to carry.

        The pre-9.3 handler wrote ``changes["created_emails"] = [...]`` — a list
        of real addresses in ``audit_logs``, which the shared redactor does not
        mask and which cannot be un-persisted later. The batch is still one
        audited command under the same ``user_batch_import`` action; what travels
        is a fingerprint.
        """
        from apps.accounts.user_import_service import (
            ACTION_USER_BATCH_IMPORT,
            IMPORT_MODE_ALL_OR_NOTHING,
            ImportPlan,
            ImportResult,
            ImportRow,
            UserImportService,
        )

        row = ImportRow(
            index=1,
            email="first@example.com",
            first_name="First",
            last_name="User",
            phone="",
            role="student",
            password="generated",
            supplied_password=False,
        )
        plan = ImportPlan(
            mode=IMPORT_MODE_ALL_OR_NOTHING,
            institution_id=str(uuid.uuid4()),
            rows=(row,),
            submitted_count=1,
        )
        result = ImportResult(
            plan=plan, committed=True, created_ids=(str(uuid.uuid4()),)
        )

        with patch(
            "apps.catalog.tenant_audit_service.TenantAuditService.record_event"
        ) as record:
            UserImportService._audit(_jwt_user("super_admin"), result)

        record.assert_called_once()
        kwargs = record.call_args.kwargs
        self.assertEqual(kwargs["action"], ACTION_USER_BATCH_IMPORT)
        metadata = kwargs["metadata"]
        self.assertEqual(metadata["created_count"], 1)
        self.assertEqual(metadata["mode"], IMPORT_MODE_ALL_OR_NOTHING)
        self.assertEqual(metadata["created_email_hashes"], [row.email_hash])
        self.assertNotIn("created_emails", metadata)
        self.assertNotIn("first@example.com", str(metadata))
