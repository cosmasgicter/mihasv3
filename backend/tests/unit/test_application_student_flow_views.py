"""Unit tests for student-facing application submit and interview list views."""

import uuid
from unittest.mock import MagicMock, patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from apps.applications.serializers import ApplicationSerializer
from apps.applications.services import ApplicationSubmissionError
from apps.applications.interview_views import ApplicationInterviewListView
from apps.applications.student_draft_views import (
    ApplicationDetailView,
    ApplicationDraftDetailView,
    ApplicationDraftListView,
)
from apps.applications.student_submission_views import (
    ApplicationGradesView,
    ApplicationSubmitView,
)
from apps.documents.document_storage_views import DocumentUploadView


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

    @patch("apps.applications.student_submission_views.ApplicationSerializer")
    @patch("apps.applications.student_submission_views.submit_application")
    @patch("apps.applications.student_submission_views.Application.objects")
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
            data={"confirm_submission": True},
            format="json",
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 200
        inner = response.data.get("data", response.data)
        assert inner["status"] == "submitted"
        # The declaration accompanies the command so submission can re-check it
        # under the row lock (admissions-v2 task 6.5, R10.6); the optimistic
        # version is optional and absent here.
        mock_submit_application.assert_called_once_with(
            application=application,
            changed_by=str(student.id),
            declarations_accepted=True,
            expected_version=None,
        )

    @patch("apps.applications.student_submission_views.submit_application")
    @patch("apps.applications.student_submission_views.Application.objects")
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
            data={"confirm_submission": True},
            format="json",
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 400
        assert response.data["success"] is False
        assert response.data["code"] == "PAYMENT_REQUIRED"

    @patch("apps.applications.student_submission_views.submit_application")
    @patch("apps.applications.student_submission_views.Application.objects")
    def test_submit_requires_final_confirmation(self, mock_app_objects, mock_submit_application):
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()
        student = _student_user(user_id=user_id)
        application = _make_application(app_id=app_id, user_id=user_id)

        mock_app_objects.select_related.return_value.get.return_value = application

        request = _auth_request(
            self.factory,
            "post",
            f"/api/v1/applications/{app_id}/submit/",
            student,
            data={"confirm_submission": False},
            format="json",
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 400
        assert response.data["code"] == "CONFIRM_SUBMISSION_REQUIRED"
        mock_submit_application.assert_not_called()

    @patch("apps.applications.student_submission_views.ApplicationSerializer")
    @patch("apps.applications.student_submission_views.submit_application")
    @patch("apps.applications.student_submission_views.Application.objects")
    def test_repeated_submit_returns_current_submitted_application(
        self,
        mock_app_objects,
        mock_submit_application,
        mock_application_serializer,
    ):
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()
        student = _student_user(user_id=user_id)
        application = _make_application(app_id=app_id, status="submitted", user_id=user_id)

        mock_app_objects.select_related.return_value.get.return_value = application
        mock_application_serializer.return_value.data = {
            "id": str(app_id),
            "status": "submitted",
        }

        request = _auth_request(
            self.factory,
            "post",
            f"/api/v1/applications/{app_id}/submit/",
            student,
            data={"confirm_submission": True},
            format="json",
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 200
        assert response.data["data"]["status"] == "submitted"
        mock_submit_application.assert_not_called()


class TestApplicationInterviewListView:
    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = ApplicationInterviewListView.as_view()

    @patch("apps.applications.interview_views.ApplicationInterviewSerializer")
    @patch("apps.applications.interview_views.ApplicationInterview.objects")
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

    @patch("apps.applications.interview_views.AdminCapabilityService")
    @patch("apps.applications.interview_views.AccessScopeService")
    @patch("apps.applications.interview_views.ApplicationInterviewSerializer")
    @patch("apps.applications.interview_views.ApplicationInterview.objects")
    def test_admin_list_without_mine_is_scope_narrowed(
        self,
        mock_interview_objects,
        mock_interview_serializer,
        mock_scope_service,
        mock_capability_service,
    ):
        """GAP-2 (R5.2/R5.9): the admin (non-`mine`) path narrows the interview
        queryset through ``AccessScopeService.filter_applications`` rather than
        returning every school's interviews unfiltered."""
        admin = _admin_user()
        queryset = MagicMock()
        scoped_queryset = MagicMock()

        mock_interview_objects.select_related.return_value = queryset
        queryset.filter.return_value = scoped_queryset
        scoped_queryset.order_by.return_value = []
        mock_interview_serializer.return_value.data = []
        # Which branch the view takes is now a *capability* decision, not a role
        # one: admissions-v2 task 2.2 made the staff path conditional on
        # ``AdminCapabilityService.get_capabilities(user)`` yielding
        # ``tenant.application.read`` for some in-scope institution (R3.1,
        # AUTH-02). This mock actor has no membership row, so the real service
        # raised ``CapabilityResolutionError``, the view failed closed to the
        # student branch, and ``filter_applications`` was never called — the
        # assertion below read "Called 0 times" for a scope narrowing the view had
        # simply not reached. Declaring the actor's resolved capabilities is the
        # same thing this test already does for the scope service one line down.
        # The capability *decision* itself is asserted against real rows by
        # ``tests/unit/test_admissions_v2_authority_policies.py`` and
        # ``test_scoped_access_matrix.py``.
        capability_set = MagicMock()
        capability_set.all_access = False
        capability_set.institution_capabilities = {
            "inst-1": frozenset({"tenant.application.read"})
        }
        mock_capability_service.return_value.get_capabilities.return_value = capability_set
        # The scope service resolves a set of in-scope application ids.
        mock_scope_service.return_value.filter_applications.return_value.values_list.return_value = ["app-1"]

        request = _auth_request(
            self.factory,
            "get",
            "/api/v1/applications/interviews/",
            admin,
        )
        response = self.view(request)

        assert response.status_code == 200
        # The admin queryset is narrowed to the scoped application ids (R5.2).
        mock_scope_service.return_value.filter_applications.assert_called_once()
        queryset.filter.assert_called_once_with(application_id__in=["app-1"])
        scoped_queryset.order_by.assert_called_once_with("scheduled_at", "-created_at")


class TestStudentPostSubmissionMutationGuards:
    def setup_method(self):
        self.factory = APIRequestFactory()

    @patch("apps.applications.student_draft_views._with_payment_summary")
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

    @patch("apps.applications.student_draft_views.ApplicationSerializer")
    @patch("apps.applications.student_draft_views.IsOwnerOrAdmin")
    @patch("apps.applications.student_draft_views._with_payment_summary")
    def test_student_generic_update_requires_canonical_versioned_draft_endpoint(
        self,
        mock_with_payment_summary,
        mock_permission,
        mock_serializer,
    ):
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()
        student = _student_user(user_id=user_id)
        application = _make_application(app_id=app_id, status="draft", user_id=user_id)
        mock_with_payment_summary.return_value.get.return_value = application
        mock_permission.return_value.has_object_permission.return_value = True

        request = _auth_request(
            self.factory,
            "patch",
            f"/api/v1/applications/{app_id}/",
            student,
            data={"full_name": "Stale browser write"},
            format="json",
        )
        response = ApplicationDetailView.as_view()(request, application_id=app_id)

        assert response.status_code == 409
        assert response.data["code"] == "CANONICAL_DRAFT_UPDATE_REQUIRED"
        mock_serializer.assert_not_called()

    @patch("apps.applications.student_draft_views.IsOwnerOrAdmin")
    @patch("apps.applications.student_draft_views._with_payment_summary")
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

    @patch("apps.applications.student_draft_views.transaction.atomic")
    @patch("apps.applications.student_draft_views.Payment.objects")
    @patch("apps.applications.student_draft_views.IsOwnerOrAdmin")
    @patch("apps.applications.student_draft_views._with_payment_summary")
    def test_student_can_delete_draft_application_via_model_delete(
        self,
        mock_with_payment_summary,
        mock_permission,
        mock_payment_objects,
        mock_atomic,
    ):
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()
        student = _student_user(user_id=user_id)
        application = _make_application(app_id=app_id, status="draft", user_id=user_id)

        mock_with_payment_summary.return_value.get.return_value = application
        mock_permission.return_value.has_object_permission.return_value = True
        mock_payment_objects.filter.return_value.exists.return_value = False
        mock_atomic.return_value.__enter__.return_value = None

        application.delete = MagicMock()

        request = _auth_request(
            self.factory,
            "delete",
            f"/api/v1/applications/{app_id}/",
            student,
        )
        response = ApplicationDetailView.as_view()(request, application_id=app_id)

        assert response.status_code == 204
        application.delete.assert_called_once_with()

    @patch("apps.applications.student_draft_views.transaction.atomic")
    @patch("apps.applications.student_draft_views.Payment.objects")
    @patch("apps.applications.student_draft_views.IsOwnerOrAdmin")
    @patch("apps.applications.student_draft_views._with_payment_summary")
    def test_delete_draft_database_failure_returns_json_error(
        self,
        mock_with_payment_summary,
        mock_permission,
        mock_payment_objects,
        mock_atomic,
    ):
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()
        student = _student_user(user_id=user_id)
        application = _make_application(app_id=app_id, status="draft", user_id=user_id)

        mock_with_payment_summary.return_value.get.return_value = application
        mock_permission.return_value.has_object_permission.return_value = True
        mock_payment_objects.filter.return_value.exists.return_value = False
        mock_atomic.return_value.__enter__.return_value = None

        application.delete = MagicMock(side_effect=RuntimeError("delete failed"))

        request = _auth_request(
            self.factory,
            "delete",
            f"/api/v1/applications/{app_id}/",
            student,
        )
        response = ApplicationDetailView.as_view()(request, application_id=app_id)

        assert response.status_code == 500
        assert response.data["code"] == "APPLICATION_DELETE_FAILED"

    @patch("apps.applications.student_submission_views.IsOwnerOrAdmin")
    @patch("apps.applications.student_submission_views.Application.objects")
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

    @patch("apps.catalog.models.Subject.objects")
    @patch("apps.applications.student_submission_views.IsOwnerOrAdmin")
    @patch("apps.applications.student_submission_views.Application.objects")
    def test_duplicate_grade_subjects_are_rejected(self, mock_app_objects, mock_permission, mock_subject_objects):
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()
        subject_id = uuid.uuid4()
        student = _student_user(user_id=user_id)
        application = _make_application(app_id=app_id, status="draft", user_id=user_id)

        mock_app_objects.get.return_value = application
        mock_permission.return_value.has_object_permission.return_value = True
        mock_subject_objects.filter.return_value.exists.return_value = True

        request = _auth_request(
            self.factory,
            "post",
            f"/api/v1/applications/{app_id}/grades/",
            student,
            data={
                "grades": [
                    {"subject_id": str(subject_id), "grade": 1},
                    {"subject_id": str(subject_id), "grade": 2},
                    {"subject_id": str(uuid.uuid4()), "grade": 3},
                    {"subject_id": str(uuid.uuid4()), "grade": 4},
                    {"subject_id": str(uuid.uuid4()), "grade": 5},
                ]
            },
            format="json",
        )
        response = ApplicationGradesView.as_view()(request, application_id=app_id)

        assert response.status_code == 400
        assert response.data["code"] == "DUPLICATE_SUBJECT"

    @patch("apps.catalog.models.Subject.objects")
    @patch("apps.applications.student_submission_views.IsOwnerOrAdmin")
    @patch("apps.applications.student_submission_views.Application.objects")
    def test_batch_grade_sync_requires_five_unique_subjects(self, mock_app_objects, mock_permission, mock_subject_objects):
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()
        student = _student_user(user_id=user_id)
        application = _make_application(app_id=app_id, status="draft", user_id=user_id)

        mock_app_objects.get.return_value = application
        mock_permission.return_value.has_object_permission.return_value = True
        mock_subject_objects.filter.return_value.exists.return_value = True

        request = _auth_request(
            self.factory,
            "post",
            f"/api/v1/applications/{app_id}/grades/",
            student,
            data={"grades": [{"subject_id": str(uuid.uuid4()), "grade": 1} for _ in range(4)]},
            format="json",
        )
        response = ApplicationGradesView.as_view()(request, application_id=app_id)

        assert response.status_code == 400
        assert response.data["code"] == "MINIMUM_SUBJECTS_REQUIRED"

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

    @patch("apps.applications.models.Application.objects")
    def test_student_cannot_upload_application_slip_after_submission(self, mock_app_objects):
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()
        student = _student_user(user_id=user_id)
        application = _make_application(app_id=app_id, status="submitted", user_id=user_id)

        mock_app_objects.filter.return_value.exists.return_value = True
        mock_app_objects.get.return_value = application

        uploaded_file = SimpleUploadedFile(
            "application-slip.pdf",
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
                "document_type": "application_slip",
                "file": uploaded_file,
            },
            format="multipart",
        )
        response = DocumentUploadView.as_view()(request)

        assert response.status_code == 403
        assert response.data["code"] == "INSUFFICIENT_PERMISSIONS"


class TestApplicationDraftListView:
    def setup_method(self):
        self.factory = APIRequestFactory()

    @patch("apps.applications.admin_review_views.ApplicationListCreateView.post")
    def test_post_with_canonical_selection_delegates_to_canonical_create(self, mock_post):
        """A draft START carrying the minimum canonical selection (program_id +
        intake_id) delegates to the canonical application create (task 6.2)."""
        student = _student_user()
        mock_post.return_value = Response({"success": True, "data": {"id": "draft-1"}}, status=201)

        request = _auth_request(
            self.factory,
            "post",
            "/api/v1/applications/drafts/",
            student,
            data={
                "full_name": "Test Student",
                "date_of_birth": "2001-01-01",
                "sex": "female",
                "phone": "+260971234567",
                "email": "student@example.com",
                "residence_town": "Lusaka",
                # Minimum canonical selection (R10.9) — canonical program + intake ids.
                "program_id": "11111111-1111-1111-1111-111111111111",
                "intake_id": "22222222-2222-2222-2222-222222222222",
            },
            format="json",
        )

        response = ApplicationDraftListView.as_view()(request)

        assert response.status_code == 201
        mock_post.assert_called_once()

    @patch("apps.applications.admin_review_views.ApplicationListCreateView.post")
    def test_post_without_canonical_selection_is_rejected_before_delegation(self, mock_post):
        """A draft START missing the canonical program+intake fails closed with
        MINIMUM_SELECTION_REQUIRED and never reaches the canonical create
        (finding STU-12: the client used to POST an empty payload here)."""
        student = _student_user()

        request = _auth_request(
            self.factory,
            "post",
            "/api/v1/applications/drafts/",
            student,
            data={
                "full_name": "Test Student",
                "date_of_birth": "2001-01-01",
                "sex": "female",
                "phone": "+260971234567",
                "email": "student@example.com",
                "residence_town": "Lusaka",
                # Legacy display strings are NOT a valid canonical selection.
                "program": "Nursing",
                "intake": "January 2026",
                "institution": "Beanola Test College",
            },
            format="json",
        )

        response = ApplicationDraftListView.as_view()(request)

        assert response.status_code == 400
        assert response.data["code"] == "MINIMUM_SELECTION_REQUIRED"
        mock_post.assert_not_called()


class TestApplicationDraftDetailView:
    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = ApplicationDraftDetailView.as_view()

    @patch("apps.applications.student_draft_views._get_owned_draft_application")
    def test_draft_detail_masks_missing_or_foreign_draft(self, mock_get_owned_draft_application):
        mock_get_owned_draft_application.return_value = None
        student = _student_user()
        app_id = uuid.uuid4()

        request = _auth_request(
            self.factory,
            "get",
            f"/api/v1/applications/drafts/{app_id}/",
            student,
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 404
        assert response.data["code"] == "NOT_FOUND"

    @patch("apps.applications.student_draft_views._get_owned_draft_application")
    def test_draft_detail_patch_requires_idempotency_key_before_lookup(self, mock_get_owned_draft_application):
        student = _student_user()
        app_id = uuid.uuid4()

        request = _auth_request(
            self.factory,
            "patch",
            f"/api/v1/applications/drafts/{app_id}/",
            student,
            data={"full_name": "Updated Student", "expected_version": 1},
            format="json",
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 400
        assert response.data["code"] == "IDEMPOTENCY_KEY_REQUIRED"
        mock_get_owned_draft_application.assert_not_called()

    @patch("apps.applications.student_draft_views.Payment.objects")
    @patch("apps.applications.student_draft_views._get_owned_draft_application")
    def test_draft_detail_delete_blocks_payment_linked_draft(self, mock_get_owned_draft_application, mock_payment_objects):
        student = _student_user()
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, status="draft", user_id=student.id)
        mock_get_owned_draft_application.return_value = application
        mock_payment_objects.filter.return_value.exists.return_value = True

        request = _auth_request(
            self.factory,
            "delete",
            f"/api/v1/applications/drafts/{app_id}/",
            student,
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 409
        assert response.data["code"] == "DRAFT_HAS_PAYMENT_ACTIVITY"
        application.delete.assert_not_called()

    @patch("apps.applications.student_draft_views.Payment.objects")
    @patch("apps.applications.student_draft_views._get_owned_draft_application")
    def test_draft_detail_delete_removes_unpaid_draft_application(self, mock_get_owned_draft_application, mock_payment_objects):
        student = _student_user()
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, status="draft", user_id=student.id)
        mock_get_owned_draft_application.return_value = application
        mock_payment_objects.filter.return_value.exists.return_value = False

        request = _auth_request(
            self.factory,
            "delete",
            f"/api/v1/applications/drafts/{app_id}/",
            student,
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 204
        application.delete.assert_called_once()


class TestApplicationDraftTimestampConsistency:
    def setup_method(self):
        self.factory = APIRequestFactory()

    def test_application_serializer_patch_advances_updated_at_and_version(self):
        student = _student_user()
        app_id = uuid.uuid4()
        application = Application(
            id=app_id,
            user_id=str(student.id),
            application_number="APP-TEST-001",
            public_tracking_code="TRKTEST001",
            full_name="Original Student",
            nrc_number="123456/78/9",
            passport_number="",
            date_of_birth="2001-01-01",
            sex="female",
            phone="+260971234567",
            email="student@example.com",
            residence_town="Lusaka",
            program="Nursing",
            intake="January 2026",
            institution="Beanola Test College",
            status="draft",
            version=3,
        )
        application.save = MagicMock()

        request = _auth_request(
            self.factory,
            "patch",
            f"/api/v1/applications/drafts/{app_id}/",
            student,
            data={"full_name": "Updated Student"},
            format="json",
        )
        request.user = student
        serializer = ApplicationSerializer(
            application,
            data={"full_name": "Updated Student"},
            partial=True,
            context={"request": request},
        )

        assert serializer.is_valid(), serializer.errors
        updated = serializer.save()

        assert updated.full_name == "Updated Student"
        assert updated.version == 4
        assert updated.updated_at is not None
        application.save.assert_called_once()
        assert "updated_at" in application.save.call_args.kwargs["update_fields"]
        assert "version" in application.save.call_args.kwargs["update_fields"]


# ---------------------------------------------------------------------------
# Regression tests for production failures (2026-04-23)
# ---------------------------------------------------------------------------


class TestDraftDeletionRegression:
    """Draft deletion must succeed with all dependent tables present."""

    factory = APIRequestFactory()

    @patch("apps.applications.student_draft_views.transaction.atomic")
    @patch("apps.applications.student_draft_views.Payment.objects")
    @patch("apps.applications.student_draft_views.IsOwnerOrAdmin")
    @patch("apps.applications.student_draft_views._with_payment_summary")
    def test_delete_draft_with_all_dependents_returns_204(
        self,
        mock_with_payment_summary,
        mock_permission,
        mock_payment_objects,
        mock_atomic,
    ):
        """Regression: raw SQL delete was failing with 500 due to table name mismatches."""
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()
        student = _student_user(user_id=user_id)
        application = _make_application(app_id=app_id, status="draft", user_id=user_id)

        mock_with_payment_summary.return_value.get.return_value = application
        mock_permission.return_value.has_object_permission.return_value = True
        mock_payment_objects.filter.return_value.exists.return_value = False
        mock_atomic.return_value.__enter__.return_value = None

        application.delete = MagicMock()

        request = _auth_request(self.factory, "delete", f"/api/v1/applications/{app_id}/", student)
        response = ApplicationDetailView.as_view()(request, application_id=app_id)

        assert response.status_code == 204
        application.delete.assert_called_once_with()


class TestSubmitAfterDeferRegression:
    """Submit must succeed when payment is deferred and identity docs exist."""

    factory = APIRequestFactory()

    @patch("apps.applications.student_submission_views.ApplicationSerializer")
    @patch("apps.applications.student_submission_views.submit_application")
    @patch("apps.applications.student_submission_views.IsOwnerOrAdmin")
    @patch("apps.applications.student_submission_views._with_payment_summary")
    def test_submit_after_defer_with_identity_doc_succeeds(
        self,
        mock_with_payment_summary,
        mock_permission,
        mock_submit,
        mock_serializer,
    ):
        """Regression: submit was returning 400 after defer because of state inconsistency."""
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()
        student = _student_user(user_id=user_id)
        application = _make_application(app_id=app_id, status="draft", user_id=user_id)
        application.payment_status = "deferred"

        mock_with_payment_summary.return_value.get.return_value = application
        mock_permission.return_value.has_object_permission.return_value = True
        mock_submit.return_value = (application, "TRK-TESTCODE123")
        mock_serializer.return_value.data = {"id": str(app_id), "status": "submitted"}

        request = _auth_request(self.factory, "post", f"/api/v1/applications/{app_id}/submit/", student, data={"confirm_submission": True}, format="json")
        response = ApplicationSubmitView.as_view()(request, application_id=app_id)

        assert response.status_code == 200
        mock_submit.assert_called_once()

    @patch("apps.applications.student_submission_views.submit_application")
    @patch("apps.applications.student_submission_views.IsOwnerOrAdmin")
    @patch("apps.applications.student_submission_views._with_payment_summary")
    def test_submit_after_defer_without_identity_doc_fails(
        self,
        mock_with_payment_summary,
        mock_permission,
        mock_submit,
    ):
        """Regression: backend must reject when identity doc is missing, even if deferred."""
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()
        student = _student_user(user_id=user_id)
        application = _make_application(app_id=app_id, status="draft", user_id=user_id)
        application.payment_status = "deferred"

        mock_with_payment_summary.return_value.get.return_value = application
        mock_permission.return_value.has_object_permission.return_value = True
        mock_submit.side_effect = ApplicationSubmissionError(
            "IDENTITY_DOCUMENT_REQUIRED",
            "An NRC or Passport document must be uploaded before submission.",
        )

        request = _auth_request(self.factory, "post", f"/api/v1/applications/{app_id}/submit/", student, data={"confirm_submission": True}, format="json")
        response = ApplicationSubmitView.as_view()(request, application_id=app_id)

        assert response.status_code == 400
        assert response.data["code"] == "IDENTITY_DOCUMENT_REQUIRED"
