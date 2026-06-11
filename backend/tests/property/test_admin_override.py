"""Property-based tests for admin payment status override audit trail.

# Feature: production-payment-hardening, Property 10: Admin payment status override records audit trail

For any admin payment status override request with notes, the
ApplicationReviewView SHALL update the application's payment_status field,
set admin_feedback to the provided notes, and set admin_feedback_by to the
admin's user ID.

**Validates: Requirements 4.2, 4.4, 4.5**
"""

import os
import uuid
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

import pytest  # noqa: E402
from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

valid_payment_statuses = st.sampled_from(["not_paid", "pending_review", "verified", "rejected"])

admin_notes = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P")),
    min_size=1,
    max_size=200,
).map(lambda s: s.strip()).filter(lambda s: len(s) > 0)


def _build_mock_app(application_id, student_user_id):
    mock_app = MagicMock()
    mock_app.id = application_id
    mock_app.user_id = student_user_id
    mock_app.payment_status = "pending"
    mock_app.admin_feedback = None
    mock_app.admin_feedback_date = None
    mock_app.admin_feedback_by_id = None
    return mock_app


def _build_mock_request(admin_id, data):
    mock_request = MagicMock()
    mock_request.user.id = admin_id
    mock_request.user.is_authenticated = True
    mock_request.user.role = "admin"
    mock_request.user.pk = admin_id
    mock_request.data = data
    mock_request.META = {}
    return mock_request


# ---------------------------------------------------------------------------
# Property 10: Admin payment status override records audit trail
# ---------------------------------------------------------------------------


class TestAdminPaymentStatusOverride(SimpleTestCase):
    """# Feature: production-payment-hardening, Property 10

    **Validates: Requirements 4.2, 4.4, 4.5**
    """

    @given(new_payment_status=valid_payment_statuses, notes=admin_notes)
    @settings(max_examples=5)
    def test_override_updates_status_and_records_audit_trail(self, new_payment_status, notes):
        """Admin payment status override sets payment_status, admin_feedback, and admin_feedback_by."""
        application_id = uuid.uuid4()
        admin_id = str(uuid.uuid4())
        mock_app = _build_mock_app(application_id, str(uuid.uuid4()))
        mock_request = _build_mock_request(admin_id, {"payment_status": new_payment_status, "notes": notes})

        with patch("apps.applications.admin_views.Application.objects") as mock_qs, \
             patch("apps.catalog.services.AccessScopeService") as mock_scope, \
             patch("apps.documents.payment_service.PaymentService.review_application_payment") as mock_review:
            mock_scope.return_value.filter_applications.side_effect = lambda qs, _u: qs
            mock_qs.all.return_value = mock_qs
            mock_qs.get.return_value = mock_app
            # Simulate PaymentService updating the app and returning it
            def side_effect(application_id, payment_status, reviewed_by_id, notes):
                mock_app.payment_status = payment_status
                mock_app.admin_feedback = notes
                mock_app.admin_feedback_by_id = reviewed_by_id
                return mock_app
            mock_review.side_effect = side_effect

            from apps.applications.admin_views import ApplicationReviewView

            view = ApplicationReviewView()
            response = view.post(mock_request, application_id)

            self.assertEqual(mock_app.payment_status, new_payment_status)
            self.assertEqual(mock_app.admin_feedback, notes)
            self.assertEqual(mock_app.admin_feedback_by_id, admin_id)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["data"]["payment_status"], new_payment_status)

    @given(new_payment_status=valid_payment_statuses)
    @settings(max_examples=5)
    def test_override_without_notes_still_updates_status(self, new_payment_status):
        """Admin override without notes still updates payment_status."""
        application_id = uuid.uuid4()
        admin_id = str(uuid.uuid4())
        mock_app = _build_mock_app(application_id, str(uuid.uuid4()))
        mock_request = _build_mock_request(admin_id, {"payment_status": new_payment_status, "notes": ""})

        with patch("apps.applications.admin_views.Application.objects") as mock_qs, \
             patch("apps.catalog.services.AccessScopeService") as mock_scope, \
             patch("apps.documents.payment_service.PaymentService.review_application_payment") as mock_review:
            mock_scope.return_value.filter_applications.side_effect = lambda qs, _u: qs
            mock_qs.all.return_value = mock_qs
            mock_qs.get.return_value = mock_app
            def side_effect(application_id, payment_status, reviewed_by_id, notes):
                mock_app.payment_status = payment_status
                return mock_app
            mock_review.side_effect = side_effect

            from apps.applications.admin_views import ApplicationReviewView

            view = ApplicationReviewView()
            response = view.post(mock_request, application_id)

            self.assertEqual(mock_app.payment_status, new_payment_status)
            self.assertEqual(response.status_code, 200)
