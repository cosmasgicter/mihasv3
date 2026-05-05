"""Unit tests for application endpoints: verify-document, acceptance-letter, finance-receipt.

Tests authentication, authorization (admin-only), response envelope format,
error handling, audit log creation, and idempotency.

Implements task 11.1 (post-migration-cleanup).
Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
"""

import uuid
from unittest.mock import MagicMock, patch

from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.applications.views import (
    AcceptanceLetterView,
    ApplicationVerifyDocumentView,
    FinanceReceiptView,
)

# Patch targets:
# - Application and ApplicationDocument are module-level imports in views.py
#   → patch "apps.applications.views.Application.objects" etc.
# - AuditLog, IdempotencyKey, Payment, and tasks are lazy-imported inside methods
#   → patch at source: "apps.common.models.AuditLog.objects" etc.
_APP = "apps.applications.views.Application.objects"
_DOC = "apps.applications.views.ApplicationDocument.objects"
_AUDIT = "apps.common.models.AuditLog.objects"
_IDEM = "apps.common.models.IdempotencyKey.objects"
_PAY = "apps.documents.models.Payment.objects"
_TASK_LETTER = "apps.applications.tasks.generate_acceptance_letter_task"
_TASK_RECEIPT = "apps.applications.tasks.generate_finance_receipt_task"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(user_id=None, role="student"):
    """Build a JWTUser for testing."""
    uid = user_id or uuid.uuid4()
    return JWTUser({
        "user_id": str(uid),
        "email": "test@example.com",
        "role": role,
        "first_name": "Test",
        "last_name": "User",
    })


def _admin_user(user_id=None):
    return _make_user(user_id=user_id, role="admin")


def _student_user(user_id=None):
    return _make_user(user_id=user_id, role="student")


def _make_application(app_id=None, status="draft", user_id=None):
    """Build a mock Application object."""
    app = MagicMock()
    app.id = app_id or uuid.uuid4()
    app.pk = app.id
    app.user_id = str(user_id or uuid.uuid4())
    app.status = status
    app.application_number = f"APP-{uuid.uuid4().hex[:8].upper()}"
    app.full_name = "Test Applicant"
    app.program = "Computer Science"
    app.intake = "January 2025"
    app.institution = "Test University"
    return app


def _make_document(doc_id=None, application_id=None):
    """Build a mock ApplicationDocument object."""
    doc = MagicMock()
    doc.id = doc_id or uuid.uuid4()
    doc.pk = doc.id
    doc.application_id = application_id or uuid.uuid4()
    doc.document_type = "nrc"
    doc.document_name = "NRC Document"
    doc.file_url = "https://example.com/doc.pdf"
    doc.file_size = 1024
    doc.mime_type = "application/pdf"
    doc.verification_status = "pending"
    doc.verified_by = None
    doc.verified_at = None
    doc.verification_notes = ""
    doc.system_generated = False
    doc.uploaded_at = timezone.now()
    doc.extracted_text = ""
    doc.created_at = timezone.now()
    doc.updated_at = timezone.now()
    return doc


def _auth_request(factory, method, path, user, **kwargs):
    """Build an authenticated request via APIRequestFactory + force_authenticate."""
    handler = getattr(factory, method.lower())
    request = handler(path, **kwargs)
    force_authenticate(request, user=user)
    return request


# ---------------------------------------------------------------------------
# Verify Document Endpoint
# ---------------------------------------------------------------------------


class TestApplicationVerifyDocument:
    """POST /api/v1/applications/{id}/verify-document/"""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = ApplicationVerifyDocumentView.as_view()
        self.admin = _admin_user()

    def test_unauthenticated_returns_401_or_403(self):
        """Unauthenticated request is rejected."""
        app_id = uuid.uuid4()
        request = self.factory.post(
            f"/api/v1/applications/{app_id}/verify-document/",
            data={"documentId": str(uuid.uuid4()), "status": "verified"},
            format="json",
        )
        response = self.view(request, application_id=app_id)
        assert response.status_code in (401, 403)

    @patch(_AUDIT)
    @patch(_DOC)
    @patch(_APP)
    def test_successful_verification(self, mock_app_qs, mock_doc_qs, mock_audit):
        """Admin can verify a document — returns 200 with envelope."""
        app_id = uuid.uuid4()
        doc_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        document = _make_document(doc_id=doc_id, application_id=app_id)

        mock_app_qs.select_related.return_value.get.return_value = application
        mock_doc_qs.select_related.return_value.get.return_value = document

        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{app_id}/verify-document/",
            self.admin,
            data={"documentId": str(doc_id), "status": "verified", "notes": "Looks good"},
            format="json",
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 200
        body = response.data
        assert body["success"] is True
        assert "data" in body
        document.save.assert_called_once()
        mock_audit.create.assert_called_once()

    @patch(_APP)
    def test_missing_application_returns_404(self, mock_app_qs):
        """Returns 404 when application does not exist."""
        from apps.applications.models import Application
        mock_app_qs.select_related.return_value.get.side_effect = Application.DoesNotExist

        app_id = uuid.uuid4()
        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{app_id}/verify-document/",
            self.admin,
            data={"documentId": str(uuid.uuid4()), "status": "verified"},
            format="json",
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 404
        assert response.data["success"] is False
        assert response.data["code"] == "NOT_FOUND"

    @patch(_DOC)
    @patch(_APP)
    def test_document_not_belonging_to_application_returns_404(self, mock_app_qs, mock_doc_qs):
        """Returns 404 when document doesn't belong to the application."""
        from apps.documents.models import ApplicationDocument
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        mock_app_qs.select_related.return_value.get.return_value = application
        mock_doc_qs.select_related.return_value.get.side_effect = ApplicationDocument.DoesNotExist

        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{app_id}/verify-document/",
            self.admin,
            data={"documentId": str(uuid.uuid4()), "status": "verified"},
            format="json",
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 404
        assert response.data["success"] is False
        assert "Document not found" in response.data["error"]

    def test_unauthorized_student_returns_403(self):
        """Non-admin user gets 403."""
        student = _student_user()
        app_id = uuid.uuid4()
        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{app_id}/verify-document/",
            student,
            data={"documentId": str(uuid.uuid4()), "status": "verified"},
            format="json",
        )
        response = self.view(request, application_id=app_id)
        assert response.status_code == 403

    @patch(_APP)
    def test_invalid_request_body_returns_400(self, mock_app_qs):
        """Returns 400 when request body is invalid (missing required fields)."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        mock_app_qs.select_related.return_value.get.return_value = application

        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{app_id}/verify-document/",
            self.admin,
            data={"documentId": str(uuid.uuid4())},
            format="json",
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 400
        assert response.data["success"] is False
        assert response.data["code"] == "VALIDATION_ERROR"

    @patch(_AUDIT)
    @patch(_DOC)
    @patch(_APP)
    def test_response_envelope_format(self, mock_app_qs, mock_doc_qs, mock_audit):
        """Response uses {success: true, data: {...}} envelope."""
        app_id = uuid.uuid4()
        doc_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        document = _make_document(doc_id=doc_id, application_id=app_id)

        mock_app_qs.select_related.return_value.get.return_value = application
        mock_doc_qs.select_related.return_value.get.return_value = document

        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{app_id}/verify-document/",
            self.admin,
            data={"documentId": str(doc_id), "status": "rejected", "notes": "Blurry"},
            format="json",
        )
        response = self.view(request, application_id=app_id)

        body = response.data
        assert "success" in body
        assert "data" in body
        assert isinstance(body["data"], dict)

    @patch(_AUDIT)
    @patch(_DOC)
    @patch(_APP)
    def test_audit_log_created_on_success(self, mock_app_qs, mock_doc_qs, mock_audit):
        """Audit log entry is created with correct entity_type and actor_id."""
        app_id = uuid.uuid4()
        doc_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        document = _make_document(doc_id=doc_id, application_id=app_id)

        mock_app_qs.select_related.return_value.get.return_value = application
        mock_doc_qs.select_related.return_value.get.return_value = document

        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{app_id}/verify-document/",
            self.admin,
            data={"documentId": str(doc_id), "status": "verified"},
            format="json",
        )
        self.view(request, application_id=app_id)

        mock_audit.create.assert_called_once()
        call_kwargs = mock_audit.create.call_args[1]
        assert call_kwargs["entity_type"] == "application_documents"
        assert call_kwargs["actor_id"] == str(self.admin.id)
        assert call_kwargs["action"] == "document_verified"


# ---------------------------------------------------------------------------
# Acceptance Letter Endpoint
# ---------------------------------------------------------------------------


class TestAcceptanceLetter:
    """POST /api/v1/applications/{id}/acceptance-letter/"""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = AcceptanceLetterView.as_view()
        self.admin = _admin_user()

    def test_unauthenticated_returns_401_or_403(self):
        """Unauthenticated request is rejected."""
        app_id = uuid.uuid4()
        request = self.factory.post(f"/api/v1/applications/{app_id}/acceptance-letter/")
        response = self.view(request, application_id=app_id)
        assert response.status_code in (401, 403)

    @patch(_AUDIT)
    @patch(_IDEM)
    @patch(_TASK_LETTER)
    @patch(_APP)
    def test_successful_202_response(self, mock_app_qs, mock_task, mock_idem_qs, mock_audit):
        """Admin gets 202 for approved application."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, status="approved")
        mock_app_qs.select_related.return_value.get.return_value = application

        # No existing idempotency key
        mock_idem_qs.filter.return_value.first.return_value = None

        # Mock Celery task
        mock_result = MagicMock()
        mock_result.id = "celery-task-id-123"
        mock_task.delay.return_value = mock_result

        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{app_id}/acceptance-letter/",
            self.admin,
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 202
        body = response.data
        assert body["success"] is True
        assert body["data"]["task_id"] == "celery-task-id-123"
        assert body["data"]["application_id"] == str(app_id)
        assert body["data"]["status"] == "queued"
        mock_task.delay.assert_called_once_with(str(app_id))

    @patch(_APP)
    def test_missing_application_returns_404(self, mock_app_qs):
        """Returns 404 when application does not exist."""
        from apps.applications.models import Application
        mock_app_qs.select_related.return_value.get.side_effect = Application.DoesNotExist

        app_id = uuid.uuid4()
        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{app_id}/acceptance-letter/",
            self.admin,
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 404
        assert response.data["success"] is False
        assert response.data["code"] == "NOT_FOUND"

    @patch(_APP)
    def test_non_approved_application_returns_400(self, mock_app_qs):
        """Returns 400 when application is not in approved status."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, status="draft")
        mock_app_qs.select_related.return_value.get.return_value = application

        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{app_id}/acceptance-letter/",
            self.admin,
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 400
        assert response.data["success"] is False
        assert response.data["code"] == "INVALID_STATUS"

    def test_unauthorized_student_returns_403(self):
        """Non-admin user gets 403."""
        student = _student_user()
        app_id = uuid.uuid4()
        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{app_id}/acceptance-letter/",
            student,
        )
        response = self.view(request, application_id=app_id)
        assert response.status_code == 403

    @patch(_IDEM)
    @patch(_APP)
    def test_idempotency_returns_cached_response(self, mock_app_qs, mock_idem_qs):
        """Duplicate request within TTL returns cached response without new task."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, status="approved")
        mock_app_qs.select_related.return_value.get.return_value = application

        cached_response = {
            "task_id": "cached-task-id",
            "application_id": str(app_id),
            "status": "queued",
        }
        existing_key = MagicMock()
        existing_key.response_body = cached_response
        mock_idem_qs.filter.return_value.first.return_value = existing_key

        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{app_id}/acceptance-letter/",
            self.admin,
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 202
        assert response.data["data"]["task_id"] == "cached-task-id"

    @patch(_AUDIT)
    @patch(_IDEM)
    @patch(_TASK_LETTER)
    @patch(_APP)
    def test_audit_log_created_on_success(self, mock_app_qs, mock_task, mock_idem_qs, mock_audit):
        """Audit log entry is created with correct entity_type and actor_id."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, status="approved")
        mock_app_qs.select_related.return_value.get.return_value = application
        mock_idem_qs.filter.return_value.first.return_value = None

        mock_result = MagicMock()
        mock_result.id = "task-id-audit"
        mock_task.delay.return_value = mock_result

        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{app_id}/acceptance-letter/",
            self.admin,
        )
        self.view(request, application_id=app_id)

        mock_audit.create.assert_called_once()
        call_kwargs = mock_audit.create.call_args[1]
        assert call_kwargs["entity_type"] == "applications"
        assert call_kwargs["actor_id"] == str(self.admin.id)
        assert call_kwargs["action"] == "generate_acceptance_letter"


# ---------------------------------------------------------------------------
# Finance Receipt Endpoint
# ---------------------------------------------------------------------------


class TestFinanceReceipt:
    """POST /api/v1/applications/{id}/finance-receipt/"""

    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = FinanceReceiptView.as_view()
        self.admin = _admin_user()

    def test_unauthenticated_returns_401_or_403(self):
        """Unauthenticated request is rejected."""
        app_id = uuid.uuid4()
        request = self.factory.post(f"/api/v1/applications/{app_id}/finance-receipt/")
        response = self.view(request, application_id=app_id)
        assert response.status_code in (401, 403)

    @patch(_AUDIT)
    @patch(_IDEM)
    @patch(_TASK_RECEIPT)
    @patch(_PAY)
    @patch(_APP)
    def test_successful_202_response(self, mock_app_qs, mock_pay_qs, mock_task, mock_idem_qs, mock_audit):
        """Admin gets 202 for application with verified payment."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, status="approved")
        mock_app_qs.select_related.return_value.get.return_value = application
        mock_pay_qs.filter.return_value.exists.return_value = True
        mock_idem_qs.filter.return_value.first.return_value = None

        mock_result = MagicMock()
        mock_result.id = "celery-receipt-task-123"
        mock_task.delay.return_value = mock_result

        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{app_id}/finance-receipt/",
            self.admin,
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 202
        body = response.data
        assert body["success"] is True
        assert body["data"]["task_id"] == "celery-receipt-task-123"
        assert body["data"]["application_id"] == str(app_id)
        assert body["data"]["status"] == "queued"
        mock_task.delay.assert_called_once_with(str(app_id))

    @patch(_APP)
    def test_missing_application_returns_404(self, mock_app_qs):
        """Returns 404 when application does not exist."""
        from apps.applications.models import Application
        mock_app_qs.select_related.return_value.get.side_effect = Application.DoesNotExist

        app_id = uuid.uuid4()
        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{app_id}/finance-receipt/",
            self.admin,
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 404
        assert response.data["success"] is False
        assert response.data["code"] == "NOT_FOUND"

    @patch(_PAY)
    @patch(_APP)
    def test_no_verified_payment_returns_400(self, mock_app_qs, mock_pay_qs):
        """Returns 400 when no verified payment exists."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, status="approved")
        mock_app_qs.select_related.return_value.get.return_value = application
        mock_pay_qs.filter.return_value.exists.return_value = False

        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{app_id}/finance-receipt/",
            self.admin,
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 400
        assert response.data["success"] is False
        assert response.data["code"] == "PAYMENT_REQUIRED"

    def test_unauthorized_student_returns_403(self):
        """Non-admin user gets 403."""
        student = _student_user()
        app_id = uuid.uuid4()
        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{app_id}/finance-receipt/",
            student,
        )
        response = self.view(request, application_id=app_id)
        assert response.status_code == 403

    @patch(_IDEM)
    @patch(_PAY)
    @patch(_APP)
    def test_idempotency_returns_cached_response(self, mock_app_qs, mock_pay_qs, mock_idem_qs):
        """Duplicate request within TTL returns cached response without new task."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, status="approved")
        mock_app_qs.select_related.return_value.get.return_value = application
        mock_pay_qs.filter.return_value.exists.return_value = True

        cached_response = {
            "task_id": "cached-receipt-task-id",
            "application_id": str(app_id),
            "status": "queued",
        }
        existing_key = MagicMock()
        existing_key.response_body = cached_response
        mock_idem_qs.filter.return_value.first.return_value = existing_key

        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{app_id}/finance-receipt/",
            self.admin,
        )
        response = self.view(request, application_id=app_id)

        assert response.status_code == 202
        assert response.data["data"]["task_id"] == "cached-receipt-task-id"

    @patch(_AUDIT)
    @patch(_IDEM)
    @patch(_TASK_RECEIPT)
    @patch(_PAY)
    @patch(_APP)
    def test_audit_log_created_on_success(self, mock_app_qs, mock_pay_qs, mock_task, mock_idem_qs, mock_audit):
        """Audit log entry is created with correct entity_type and actor_id."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, status="approved")
        mock_app_qs.select_related.return_value.get.return_value = application
        mock_pay_qs.filter.return_value.exists.return_value = True
        mock_idem_qs.filter.return_value.first.return_value = None

        mock_result = MagicMock()
        mock_result.id = "task-id-receipt-audit"
        mock_task.delay.return_value = mock_result

        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{app_id}/finance-receipt/",
            self.admin,
        )
        self.view(request, application_id=app_id)

        mock_audit.create.assert_called_once()
        call_kwargs = mock_audit.create.call_args[1]
        assert call_kwargs["entity_type"] == "applications"
        assert call_kwargs["actor_id"] == str(self.admin.id)
        assert call_kwargs["action"] == "generate_finance_receipt"
