"""Draft deletion protections around payment activity."""

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from rest_framework.test import APIRequestFactory, force_authenticate

from apps.applications.student_views import ApplicationDetailView


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

    @patch("apps.applications.student_views.Payment.objects")
    @patch("apps.applications.student_views.ApplicationDetailView._get_application")
    def test_draft_with_payment_activity_is_not_deleted(self, mock_get_application, mock_payment_objects):
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
        mock_payment_objects.filter.assert_called_once_with(application_id=application.id)

    @patch("apps.applications.student_views.Payment.objects")
    @patch("apps.applications.student_views.transaction.atomic")
    @patch("apps.applications.student_views.ApplicationDetailView._get_application")
    def test_draft_without_payment_activity_is_deleted(self, mock_get_application, mock_atomic, mock_payment_objects):
        student = _user()
        application_id = uuid.uuid4()
        application = _draft_application(application_id, str(student.id))
        mock_get_application.return_value = application
        mock_atomic.return_value.__enter__.return_value = None
        mock_payment_objects.filter.return_value.exists.return_value = False

        response = self.view(_request(self.factory, student), application_id=application_id)

        assert response.status_code == 204
        application.delete.assert_called_once()

    @patch("apps.applications.student_views.ApplicationDetailView._get_application")
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
