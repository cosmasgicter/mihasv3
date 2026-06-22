"""Draft deletion protections around payment activity."""

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from rest_framework.test import APIRequestFactory, force_authenticate

from apps.applications.student_draft_views import ApplicationDetailView

# Patch targets - the actual module where Payment.objects is looked up.
_PAYMENT_OBJECTS = "apps.applications.student_draft_views.Payment.objects"
_GET_APP = "apps.applications.student_draft_views.ApplicationDetailView._get_application"
_ATOMIC = "apps.applications.student_draft_views.transaction.atomic"


def _user(user_id: uuid.UUID | None = None, role: str = "student"):
    return SimpleNamespace(id=str(user_id or uuid.uuid4()), role=role, is_authenticated=True)


def _draft_application(application_id: uuid.UUID, user_id: str):
    application = MagicMock()
    application.id = application_id
    application.user_id = user_id
    application.status = "draft"
    return application


def _request(factory: APIRequestFactory, user):
    request = factory.delete(f"/api/v1/applications/{uuid.uuid4()}/")
    force_authenticate(request, user=user)
    return request


class TestDraftDeletePaymentProtection:
    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = ApplicationDetailView.as_view()

    @patch(_PAYMENT_OBJECTS)
    @patch(_GET_APP)
    def test_draft_with_successful_payment_is_not_deleted(self, mock_get_application, mock_payment_objects):
        """A draft with a successful payment must NOT be deletable."""
        student = _user()
        application_id = uuid.uuid4()
        application = _draft_application(application_id, str(student.id))
        mock_get_application.return_value = application
        mock_payment_objects.filter.return_value.exists.return_value = True

        response = self.view(_request(self.factory, student), application_id=application_id)

        assert response.status_code == 409
        assert response.data["success"] is False
        assert response.data["code"] == "DRAFT_HAS_PAYMENT_ACTIVITY"
        application.delete.assert_not_called()

    @patch(_PAYMENT_OBJECTS)
    @patch(_GET_APP)
    def test_draft_with_deferred_payment_is_not_deleted(self, mock_get_application, mock_payment_objects):
        """A draft with a deferred payment must NOT be deletable."""
        student = _user()
        application_id = uuid.uuid4()
        application = _draft_application(application_id, str(student.id))
        mock_get_application.return_value = application
        # Simulates a deferred payment existing in RESOLVED_PAYMENT_STATUSES
        mock_payment_objects.filter.return_value.exists.return_value = True

        response = self.view(_request(self.factory, student), application_id=application_id)

        assert response.status_code == 409
        assert response.data["success"] is False
        assert response.data["code"] == "DRAFT_HAS_PAYMENT_ACTIVITY"

    @patch(_PAYMENT_OBJECTS)
    @patch(_ATOMIC)
    @patch(_GET_APP)
    def test_draft_with_failed_payment_is_deletable(self, mock_get_application, mock_atomic, mock_payment_objects):
        """A draft with ONLY failed/expired payments CAN be deleted."""
        student = _user()
        application_id = uuid.uuid4()
        application = _draft_application(application_id, str(student.id))
        mock_get_application.return_value = application
        mock_atomic.return_value.__enter__.return_value = None
        # No payments in RESOLVED_PAYMENT_STATUSES exist (only failed/expired)
        mock_payment_objects.filter.return_value.exists.return_value = False

        response = self.view(_request(self.factory, student), application_id=application_id)

        assert response.status_code == 204
        application.delete.assert_called_once()

    @patch(_PAYMENT_OBJECTS)
    @patch(_ATOMIC)
    @patch(_GET_APP)
    def test_draft_without_any_payment_is_deleted(self, mock_get_application, mock_atomic, mock_payment_objects):
        """A draft without any payment activity CAN be deleted."""
        student = _user()
        application_id = uuid.uuid4()
        application = _draft_application(application_id, str(student.id))
        mock_get_application.return_value = application
        mock_atomic.return_value.__enter__.return_value = None
        mock_payment_objects.filter.return_value.exists.return_value = False

        response = self.view(_request(self.factory, student), application_id=application_id)

        assert response.status_code == 204
        application.delete.assert_called_once()

    @patch(_GET_APP)
    def test_non_draft_still_cannot_be_deleted(self, mock_get_application):
        student = _user()
        application_id = uuid.uuid4()
        application = _draft_application(application_id, str(student.id))
        application.status = "submitted"
        mock_get_application.return_value = application

        response = self.view(_request(self.factory, student), application_id=application_id)

        assert response.status_code == 403
        assert response.data["code"] == "APPLICATION_NOT_EDITABLE"
        application.delete.assert_not_called()

    def test_resolved_payment_statuses_includes_expected_values(self):
        """Verify the canonical set used for draft-delete blocking."""
        from apps.documents.payment_constants import RESOLVED_PAYMENT_STATUSES

        # These must block deletion
        assert "successful" in RESOLVED_PAYMENT_STATUSES
        assert "force_approved" in RESOLVED_PAYMENT_STATUSES
        assert "verified" in RESOLVED_PAYMENT_STATUSES
        assert "paid" in RESOLVED_PAYMENT_STATUSES
        assert "deferred" in RESOLVED_PAYMENT_STATUSES
        # These must NOT block deletion
        assert "failed" not in RESOLVED_PAYMENT_STATUSES
        assert "expired" not in RESOLVED_PAYMENT_STATUSES
        assert "pending" not in RESOLVED_PAYMENT_STATUSES
