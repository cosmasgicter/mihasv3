"""Property-based tests for admin payment status override audit trail.

# Feature: production-payment-hardening, Property 10: Admin payment status override records audit trail

For any admin payment status override request with notes, the
ApplicationReviewView SHALL update the application's payment_status field,
set admin_feedback to the provided notes, and set admin_feedback_by to the
admin's user ID.

**Validates: Requirements 4.2, 4.4, 4.5**
"""

import os
import socket
import uuid
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

import pytest  # noqa: E402
from django.test import TransactionTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402


def _pg_available(host="localhost", port=5432):
    try:
        with socket.create_connection((host, port), timeout=1):
            return True
    except OSError:
        return False

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Must match PaymentStatusUpdateSerializer.PAYMENT_STATUS_CHOICES
valid_payment_statuses = st.sampled_from(["not_paid", "pending_review", "verified", "rejected"])

admin_notes = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P")),
    min_size=1,
    max_size=200,
).map(lambda s: s.strip()).filter(lambda s: len(s) > 0)


# ---------------------------------------------------------------------------
# Property 10: Admin payment status override records audit trail
# ---------------------------------------------------------------------------


@pytest.mark.skipif(not _pg_available(), reason="Local Postgres not available")
class TestAdminPaymentStatusOverride(TransactionTestCase):
    databases = ['default']
    """# Feature: production-payment-hardening, Property 10: Admin payment status override records audit trail

    **Validates: Requirements 4.2, 4.4, 4.5**
    """

    @given(
        new_payment_status=valid_payment_statuses,
        notes=admin_notes,
    )
    @settings(max_examples=5)
    def test_override_updates_status_and_records_audit_trail(
        self, new_payment_status, notes
    ):
        """Admin payment status override sets payment_status, admin_feedback,
        and admin_feedback_by."""
        application_id = uuid.uuid4()
        admin_id = str(uuid.uuid4())
        student_user_id = str(uuid.uuid4())

        mock_app = MagicMock()
        mock_app.id = application_id
        mock_app.user_id = student_user_id
        mock_app.payment_status = "pending"
        mock_app.admin_feedback = None
        mock_app.admin_feedback_date = None
        mock_app.admin_feedback_by_id = None

        mock_request = MagicMock()
        mock_request.user.id = admin_id
        mock_request.user.is_authenticated = True
        mock_request.user.role = "admin"
        mock_request.user.pk = admin_id
        mock_request.data = {
            "payment_status": new_payment_status,
            "notes": notes,
        }
        mock_request.META = {}

        with (
            patch("apps.applications.models.Application.objects") as mock_app_qs,
        ):
            mock_app_qs.get.return_value = mock_app

            from apps.applications.views import ApplicationReviewView

            view = ApplicationReviewView()
            response = view.post(mock_request, application_id)

            # Verify payment_status was updated
            self.assertEqual(mock_app.payment_status, new_payment_status)

            # Verify admin_feedback was set (notes is non-empty)
            self.assertEqual(mock_app.admin_feedback, notes)

            # Verify admin_feedback_by was set to admin's ID
            self.assertEqual(mock_app.admin_feedback_by_id, admin_id)

            # Verify save was called with correct update_fields
            mock_app.save.assert_called_once()
            save_kwargs = mock_app.save.call_args[1]
            self.assertIn("payment_status", save_kwargs["update_fields"])
            self.assertIn("admin_feedback", save_kwargs["update_fields"])
            self.assertIn("admin_feedback_by", save_kwargs["update_fields"])

            # Verify response
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["payment_status"], new_payment_status)

    @given(
        new_payment_status=valid_payment_statuses,
    )
    @settings(max_examples=5)
    def test_override_without_notes_still_updates_status(self, new_payment_status):
        """Admin override without notes still updates payment_status."""
        application_id = uuid.uuid4()
        admin_id = str(uuid.uuid4())
        student_user_id = str(uuid.uuid4())

        mock_app = MagicMock()
        mock_app.id = application_id
        mock_app.user_id = student_user_id
        mock_app.payment_status = "pending"
        mock_app.admin_feedback = None
        mock_app.admin_feedback_date = None
        mock_app.admin_feedback_by_id = None

        mock_request = MagicMock()
        mock_request.user.id = admin_id
        mock_request.user.is_authenticated = True
        mock_request.user.role = "admin"
        mock_request.user.pk = admin_id
        mock_request.data = {
            "payment_status": new_payment_status,
            "notes": "",
        }
        mock_request.META = {}

        with (
            patch("apps.applications.models.Application.objects") as mock_app_qs,
        ):
            mock_app_qs.get.return_value = mock_app

            from apps.applications.views import ApplicationReviewView

            view = ApplicationReviewView()
            response = view.post(mock_request, application_id)

            self.assertEqual(mock_app.payment_status, new_payment_status)
            mock_app.save.assert_called_once()
            self.assertEqual(response.status_code, 200)
