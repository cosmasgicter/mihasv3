"""Unit tests for student-facing application submit and interview list views."""

import uuid
from unittest.mock import MagicMock, patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from apps.applications.services import ApplicationSubmissionError
from apps.applications.views import ApplicationDetailView, ApplicationGradesView, ApplicationInterviewListView, ApplicationSubmitView
from apps.documents.views import DocumentUploadView


def _make_user(user_id=None, role="student"):
    uid = user_id or uuid.uuid4()
    return JWTUser({
        "user_id": str(uid),
        "email": "student@example.com",
        "role": role,
        "first_name": "Test",
        "last_name": "User",
    })


def _student_user(user_id=None):
    return _make_user(user_id=user_id, role="student")


def _admin_user(user_id=None):
    return _make_user(user_id=user_id, role="admin")


def _make_application(app_id=None, status="draft", user_id=None):
    app = MagicMock()
    app.id = app_id or uuid.uuid4()
    app.pk = app.id
    app.user_id = str(user_id or uuid.uuid4())
    app.status = status
    app.application_number = f"APP-{uuid.uuid4().hex[:8].upper()}"
    app.full_name = "Test Applicant"
    app.program = "Computer Science"
    app.intake = "January 2026"
    app.submitted_at = timezone.now()
    app.payment_status = "verified"
    return app


def _auth_request(factory, method, path, user, **kwargs):
    handler = getattr(factory, method.lower())
    request = handler(path, **kwargs)
    force_authenticate(request, user=user)
    return request


class TestApplicationSubmitView:
    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = ApplicationSubmitView.as_view()

    @patch("apps.applications.views.ApplicationSerializer")
    @patch("apps.applications.views.submit_application")
    @patch("apps.applications.views.Application.objects")
    def test_student_owner_can_submit_application(
        self,
        mock_app_objects,
        mock_submit_application,
        mock_application_serializer,
    ):
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()
        student = _student_user(user_id=user_id)
        application = _make_application(app_id=app_id, user_id=user_id)

        mock_app_objects.select_related.return_value.get.return_value = application
        mock_submit_application.return_value = (application, "draft")
        mock_application_serializer.return_value.data = {
            "id": str(app_id),
            "status": "submitted",
        }

        request = _auth_request(
            self.factory,
            "post",
            f"/api/v1/applications/{app_id}/submit/",
            student,
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 200
        assert response.data["status"] == "submitted"
        mock_submit_application.assert_called_once_with(
            application=application,
            changed_by=str(student.id),
        )

    @patch("apps.applications.views.submit_application")
    @patch("apps.applications.views.Application.objects")
    def test_submit_validation_failure_returns_400(self, mock_app_objects, mock_submit_application):
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()
        student = _student_user(user_id=user_id)
        application = _make_application(app_id=app_id, user_id=user_id)

        mock_app_objects.select_related.return_value.get.return_value = application
        mock_submit_application.side_effect = ApplicationSubmissionError(
            "PAYMENT_REQUIRED",
            "Payment required before submission.",
        )

        request = _auth_request(
            self.factory,
            "post",
            f"/api/v1/applications/{app_id}/submit/",
            student,
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 400
        assert response.data["success"] is False
        assert response.data["code"] == "PAYMENT_REQUIRED"


class TestApplicationInterviewListView:
    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = ApplicationInterviewListView.as_view()

    @patch("apps.applications.views.ApplicationInterviewSerializer")
    @patch("apps.applications.views.ApplicationInterview.objects")
    def test_student_list_filters_to_owned_interviews(
        self,
        mock_interview_objects,
        mock_interview_serializer,
    ):
        student = _student_user()
        queryset = MagicMock()
        filtered_queryset = MagicMock()

        mock_interview_objects.select_related.return_value = queryset
        queryset.filter.return_value = filtered_queryset
        filtered_queryset.order_by.return_value = ["interview-1"]
        mock_interview_serializer.return_value.data = [{"id": "interview-1"}]

        request = _auth_request(
            self.factory,
            "get",
            "/api/v1/applications/interviews/?mine=true",
            student,
        )
        response = self.view(request)

        assert response.status_code == 200
        queryset.filter.assert_called_once_with(application__user_id=str(student.id))
        filtered_queryset.order_by.assert_called_once_with("scheduled_at", "-created_at")

    @patch("apps.applications.views.ApplicationInterviewSerializer")
    @patch("apps.applications.views.ApplicationInterview.objects")
    def test_admin_list_without_mine_uses_unfiltered_queryset(
        self,
        mock_interview_objects,
        mock_interview_serializer,
    ):
        admin = _admin_user()
        queryset = MagicMock()

        mock_interview_objects.select_related.return_value = queryset
        queryset.order_by.return_value = []
        mock_interview_serializer.return_value.data = []

        request = _auth_request(
            self.factory,
            "get",
            "/api/v1/applications/interviews/",
            admin,
        )
        response = self.view(request)

        assert response.status_code == 200
        queryset.filter.assert_not_called()
        queryset.order_by.assert_called_once_with("scheduled_at", "-created_at")


class TestStudentPostSubmissionMutationGuards:
    def setup_method(self):
        self.factory = APIRequestFactory()

    @patch("apps.applications.views._with_payment_summary")
    def test_delete_missing_application_is_idempotent(self, mock_with_payment_summary):
        app_id = uuid.uuid4()
        student = _student_user()

        mock_with_payment_summary.return_value.get.side_effect = Application.DoesNotExist

        request = _auth_request(
            self.factory,
            "delete",
            f"/api/v1/applications/{app_id}/",
            student,
        )
        response = ApplicationDetailView.as_view()(request, application_id=app_id)

        assert response.status_code == 204

    @patch("apps.applications.views.IsOwnerOrAdmin")
    @patch("apps.applications.views._with_payment_summary")
    def test_student_cannot_delete_submitted_application(self, mock_with_payment_summary, mock_permission):
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()
        student = _student_user(user_id=user_id)
        application = _make_application(app_id=app_id, status="submitted", user_id=user_id)

        mock_with_payment_summary.return_value.get.return_value = application
        mock_permission.return_value.has_object_permission.return_value = True

        request = _auth_request(
            self.factory,
            "delete",
            f"/api/v1/applications/{app_id}/",
            student,
        )
        response = ApplicationDetailView.as_view()(request, application_id=app_id)

        assert response.status_code == 403
        assert response.data["code"] == "APPLICATION_NOT_EDITABLE"

    @patch("apps.applications.views.IsOwnerOrAdmin")
    @patch("apps.applications.views.Application.objects")
    def test_student_cannot_update_grades_after_submission(self, mock_app_objects, mock_permission):
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()
        student = _student_user(user_id=user_id)
        application = _make_application(app_id=app_id, status="submitted", user_id=user_id)

        mock_app_objects.get.return_value = application
        mock_permission.return_value.has_object_permission.return_value = True

        request = _auth_request(
            self.factory,
            "post",
            f"/api/v1/applications/{app_id}/grades/",
            student,
            data={"grades": [{"subject_id": str(uuid.uuid4()), "grade": 1}]},
            format="json",
        )
        response = ApplicationGradesView.as_view()(request, application_id=app_id)

        assert response.status_code == 403
        assert response.data["code"] == "APPLICATION_NOT_EDITABLE"

    @patch("apps.applications.models.Application.objects")
    def test_student_cannot_upload_document_after_submission(self, mock_app_objects):
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()
        student = _student_user(user_id=user_id)
        application = _make_application(app_id=app_id, status="submitted", user_id=user_id)

        mock_app_objects.filter.return_value.exists.return_value = True
        mock_app_objects.get.return_value = application

        uploaded_file = SimpleUploadedFile(
            "nrc.pdf",
            b"%PDF-1.4\n%test",
            content_type="application/pdf",
        )
        request = _auth_request(
            self.factory,
            "post",
            "/api/v1/documents/upload/",
            student,
            data={
                "application_id": str(app_id),
                "document_type": "nrc",
                "file": uploaded_file,
            },
            format="multipart",
        )
        response = DocumentUploadView.as_view()(request)

        assert response.status_code == 403
        assert response.data["code"] == "APPLICATION_NOT_EDITABLE"
