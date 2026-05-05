"""Property-based tests for application endpoints: verify-document, acceptance-letter, finance-receipt.

# Feature: post-migration-cleanup, Property 2: Document verification updates status correctly
# Feature: post-migration-cleanup, Property 3: Admin permission enforcement on new endpoints
# Feature: post-migration-cleanup, Property 5: Audit log creation on successful operations
# Feature: post-migration-cleanup, Property 6: Acceptance letter endpoint returns 202 for approved applications
# Feature: post-migration-cleanup, Property 7: Finance receipt endpoint returns 202 for applications with verified payment
# Feature: post-migration-cleanup, Property 9: Acceptance letter rejects non-approved applications
# Feature: post-migration-cleanup, Property 10: Finance receipt rejects applications without verified payment
# Feature: post-migration-cleanup, Property 11: Idempotent generation requests

Uses hypothesis for property-based testing with the same mock patterns as the unit tests.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import uuid  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from django.utils import timezone  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402
from rest_framework.test import APIRequestFactory, force_authenticate  # noqa: E402

from apps.accounts.authentication import JWTUser  # noqa: E402
from apps.applications.views import (  # noqa: E402
    AcceptanceLetterView,
    ApplicationVerifyDocumentView,
    FinanceReceiptView,
)

_default_settings = settings(max_examples=5, deadline=None)

# Patch targets (same as unit tests)
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


def _make_application(app_id=None, status="draft"):
    app = MagicMock()
    app.id = app_id or uuid.uuid4()
    app.pk = app.id
    app.user_id = str(uuid.uuid4())
    app.status = status
    app.application_number = f"APP-{uuid.uuid4().hex[:8].upper()}"
    app.full_name = "Test Applicant"
    app.program = "Computer Science"
    app.intake = "January 2025"
    app.institution = "Test University"
    return app


def _make_document(doc_id=None, application_id=None):
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
    doc.verified_by_id = None
    doc.verified_at = None
    doc.verification_notes = ""
    doc.system_generated = False
    doc.uploaded_at = timezone.now()
    doc.extracted_text = ""
    doc.created_at = timezone.now()
    doc.updated_at = timezone.now()
    return doc


def _auth_request(factory, method, path, user, **kwargs):
    handler = getattr(factory, method.lower())
    request = handler(path, **kwargs)
    force_authenticate(request, user=user)
    return request



# =========================================================================
# Property 2: Document verification updates status correctly
# =========================================================================


class TestDocumentVerificationStatusUpdate:
    """Property 2: Document verification updates status correctly.

    For any valid application with at least one document, and for any
    verification status in {verified, rejected}, posting a verification
    request shall result in the target document's verification_status
    field being set to the requested status.

    **Validates: Requirements 3.1, 3.2**
    """

    # Feature: post-migration-cleanup, Property 2: Document verification updates status correctly

    @given(verification_status=st.sampled_from(["verified", "rejected"]))
    @_default_settings
    def test_verification_status_matches_request(self, verification_status):
        """Document verification_status is set to the requested status value."""
        factory = APIRequestFactory()
        view = ApplicationVerifyDocumentView.as_view()
        admin = _admin_user()

        app_id = uuid.uuid4()
        doc_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        document = _make_document(doc_id=doc_id, application_id=app_id)

        with patch(_APP) as mock_app_qs, \
             patch(_DOC) as mock_doc_qs, \
             patch(_AUDIT):
            mock_app_qs.get.return_value = application
            mock_doc_qs.select_related.return_value.get.return_value = document

            request = _auth_request(
                factory, "post",
                f"/api/v1/applications/{app_id}/verify-document/",
                admin,
                data={"documentId": str(doc_id), "status": verification_status},
                format="json",
            )
            response = view(request, application_id=app_id)

            assert response.status_code == 200
            assert response.data["success"] is True
            assert "data" in response.data
            # The document mock's verification_status should have been set
            assert document.verification_status == verification_status


# =========================================================================
# Property 3: Admin permission enforcement on new endpoints
# =========================================================================


class TestAdminPermissionEnforcement:
    """Property 3: Admin permission enforcement on new endpoints.

    For any user without admin or super_admin role, POST requests to all
    three new endpoints shall return HTTP 403.

    **Validates: Requirements 3.5, 4.6, 5.6**
    """

    # Feature: post-migration-cleanup, Property 3: Admin permission enforcement on new endpoints

    @given(role=st.sampled_from(["student", "reviewer"]))
    @_default_settings
    def test_non_admin_rejected_on_verify_document(self, role):
        """Non-admin users get 403 on verify-document endpoint."""
        factory = APIRequestFactory()
        view = ApplicationVerifyDocumentView.as_view()
        user = _make_user(role=role)

        app_id = uuid.uuid4()
        request = _auth_request(
            factory, "post",
            f"/api/v1/applications/{app_id}/verify-document/",
            user,
            data={"documentId": str(uuid.uuid4()), "status": "verified"},
            format="json",
        )
        response = view(request, application_id=app_id)
        assert response.status_code == 403

    @given(role=st.sampled_from(["student", "reviewer"]))
    @_default_settings
    def test_non_admin_rejected_on_acceptance_letter(self, role):
        """Non-admin users get 403 on acceptance-letter endpoint."""
        factory = APIRequestFactory()
        view = AcceptanceLetterView.as_view()
        user = _make_user(role=role)

        app_id = uuid.uuid4()
        request = _auth_request(
            factory, "post",
            f"/api/v1/applications/{app_id}/acceptance-letter/",
            user,
        )
        response = view(request, application_id=app_id)
        assert response.status_code == 403

    @given(role=st.sampled_from(["student", "reviewer"]))
    @_default_settings
    def test_non_admin_rejected_on_finance_receipt(self, role):
        """Non-admin users get 403 on finance-receipt endpoint."""
        factory = APIRequestFactory()
        view = FinanceReceiptView.as_view()
        user = _make_user(role=role)

        app_id = uuid.uuid4()
        request = _auth_request(
            factory, "post",
            f"/api/v1/applications/{app_id}/finance-receipt/",
            user,
        )
        response = view(request, application_id=app_id)
        assert response.status_code == 403



# =========================================================================
# Property 5: Audit log creation on successful operations
# =========================================================================


class TestAuditLogCreation:
    """Property 5: Audit log creation on successful operations.

    For any successful call to the verify-document, acceptance-letter, or
    finance-receipt endpoints, an AuditLog entry shall be created with the
    correct entity_type, action, and actor_id.

    **Validates: Requirements 3.8, 4.9, 5.9**
    """

    # Feature: post-migration-cleanup, Property 5: Audit log creation on successful operations

    @given(verification_status=st.sampled_from(["verified", "rejected"]))
    @_default_settings
    def test_audit_log_on_verify_document(self, verification_status):
        """Verify-document creates AuditLog with entity_type=application_documents."""
        factory = APIRequestFactory()
        view = ApplicationVerifyDocumentView.as_view()
        admin = _admin_user()

        app_id = uuid.uuid4()
        doc_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        document = _make_document(doc_id=doc_id, application_id=app_id)

        with patch(_APP) as mock_app_qs, \
             patch(_DOC) as mock_doc_qs, \
             patch(_AUDIT) as mock_audit:
            mock_app_qs.get.return_value = application
            mock_doc_qs.select_related.return_value.get.return_value = document

            request = _auth_request(
                factory, "post",
                f"/api/v1/applications/{app_id}/verify-document/",
                admin,
                data={"documentId": str(doc_id), "status": verification_status},
                format="json",
            )
            view(request, application_id=app_id)

            mock_audit.create.assert_called_once()
            call_kwargs = mock_audit.create.call_args[1]
            assert call_kwargs["entity_type"] == "application_documents"
            assert call_kwargs["action"] == f"document_{verification_status}"
            assert call_kwargs["actor_id"] == str(admin.id)

    @given(admin_id=st.uuids())
    @_default_settings
    def test_audit_log_on_acceptance_letter(self, admin_id):
        """Acceptance-letter creates AuditLog with entity_type=applications."""
        factory = APIRequestFactory()
        view = AcceptanceLetterView.as_view()
        admin = _admin_user(user_id=admin_id)

        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, status="approved")

        with patch(_APP) as mock_app_qs, \
             patch(_TASK_LETTER) as mock_task, \
             patch(_IDEM) as mock_idem_qs, \
             patch(_AUDIT) as mock_audit:
            mock_app_qs.get.return_value = application
            mock_idem_qs.filter.return_value.first.return_value = None
            mock_result = MagicMock()
            mock_result.id = "task-id"
            mock_task.delay.return_value = mock_result

            request = _auth_request(
                factory, "post",
                f"/api/v1/applications/{app_id}/acceptance-letter/",
                admin,
            )
            view(request, application_id=app_id)

            mock_audit.create.assert_called_once()
            call_kwargs = mock_audit.create.call_args[1]
            assert call_kwargs["entity_type"] == "applications"
            assert call_kwargs["action"] == "generate_acceptance_letter"
            assert call_kwargs["actor_id"] == str(admin_id)

    @given(admin_id=st.uuids())
    @_default_settings
    def test_audit_log_on_finance_receipt(self, admin_id):
        """Finance-receipt creates AuditLog with entity_type=applications."""
        factory = APIRequestFactory()
        view = FinanceReceiptView.as_view()
        admin = _admin_user(user_id=admin_id)

        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, status="approved")

        with patch(_APP) as mock_app_qs, \
             patch(_PAY) as mock_pay_qs, \
             patch(_TASK_RECEIPT) as mock_task, \
             patch(_IDEM) as mock_idem_qs, \
             patch(_AUDIT) as mock_audit:
            mock_app_qs.get.return_value = application
            mock_pay_qs.filter.return_value.exists.return_value = True
            mock_idem_qs.filter.return_value.first.return_value = None
            mock_result = MagicMock()
            mock_result.id = "task-id"
            mock_task.delay.return_value = mock_result

            request = _auth_request(
                factory, "post",
                f"/api/v1/applications/{app_id}/finance-receipt/",
                admin,
            )
            view(request, application_id=app_id)

            mock_audit.create.assert_called_once()
            call_kwargs = mock_audit.create.call_args[1]
            assert call_kwargs["entity_type"] == "applications"
            assert call_kwargs["action"] == "generate_finance_receipt"
            assert call_kwargs["actor_id"] == str(admin_id)



# =========================================================================
# Property 6: Acceptance letter endpoint returns 202 for approved applications
# =========================================================================


class TestAcceptanceLetter202Response:
    """Property 6: Acceptance letter endpoint returns 202 for approved applications.

    For any application with status="approved" and for any admin user,
    POST to acceptance-letter shall return HTTP 202 with a response body
    containing task_id (non-empty string), application_id (matching the
    request), and status="queued".

    **Validates: Requirements 4.1, 4.2**
    """

    # Feature: post-migration-cleanup, Property 6: Acceptance letter endpoint returns 202 for approved applications

    @given(admin_id=st.uuids())
    @_default_settings
    def test_approved_application_returns_202_with_correct_shape(self, admin_id):
        """Approved application returns 202 with task_id, application_id, status=queued."""
        factory = APIRequestFactory()
        view = AcceptanceLetterView.as_view()
        admin = _admin_user(user_id=admin_id)

        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, status="approved")

        with patch(_APP) as mock_app_qs, \
             patch(_TASK_LETTER) as mock_task, \
             patch(_IDEM) as mock_idem_qs, \
             patch(_AUDIT):
            mock_app_qs.get.return_value = application
            mock_idem_qs.filter.return_value.first.return_value = None
            mock_result = MagicMock()
            mock_result.id = f"celery-{uuid.uuid4().hex[:8]}"
            mock_task.delay.return_value = mock_result

            request = _auth_request(
                factory, "post",
                f"/api/v1/applications/{app_id}/acceptance-letter/",
                admin,
            )
            response = view(request, application_id=app_id)

            assert response.status_code == 202
            assert response.data["success"] is True
            data = response.data["data"]
            assert isinstance(data["task_id"], str)
            assert len(data["task_id"]) > 0
            assert data["application_id"] == str(app_id)
            assert data["status"] == "queued"


# =========================================================================
# Property 7: Finance receipt endpoint returns 202 for applications with verified payment
# =========================================================================


class TestFinanceReceipt202Response:
    """Property 7: Finance receipt endpoint returns 202 for applications with verified payment.

    For any application that has at least one Payment record with
    status="verified" and for any admin user, POST to finance-receipt
    shall return HTTP 202 with a response body containing task_id
    (non-empty string), application_id (matching the request), and
    status="queued".

    **Validates: Requirements 5.1, 5.2**
    """

    # Feature: post-migration-cleanup, Property 7: Finance receipt endpoint returns 202 for applications with verified payment

    @given(admin_id=st.uuids())
    @_default_settings
    def test_verified_payment_returns_202_with_correct_shape(self, admin_id):
        """Application with verified payment returns 202 with task_id, application_id, status=queued."""
        factory = APIRequestFactory()
        view = FinanceReceiptView.as_view()
        admin = _admin_user(user_id=admin_id)

        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, status="approved")

        with patch(_APP) as mock_app_qs, \
             patch(_PAY) as mock_pay_qs, \
             patch(_TASK_RECEIPT) as mock_task, \
             patch(_IDEM) as mock_idem_qs, \
             patch(_AUDIT):
            mock_app_qs.get.return_value = application
            mock_pay_qs.filter.return_value.exists.return_value = True
            mock_idem_qs.filter.return_value.first.return_value = None
            mock_result = MagicMock()
            mock_result.id = f"celery-{uuid.uuid4().hex[:8]}"
            mock_task.delay.return_value = mock_result

            request = _auth_request(
                factory, "post",
                f"/api/v1/applications/{app_id}/finance-receipt/",
                admin,
            )
            response = view(request, application_id=app_id)

            assert response.status_code == 202
            assert response.data["success"] is True
            data = response.data["data"]
            assert isinstance(data["task_id"], str)
            assert len(data["task_id"]) > 0
            assert data["application_id"] == str(app_id)
            assert data["status"] == "queued"



# =========================================================================
# Property 9: Acceptance letter rejects non-approved applications
# =========================================================================


class TestAcceptanceLetterRejectsNonApproved:
    """Property 9: Acceptance letter rejects non-approved applications.

    For any application with status not equal to "approved" (e.g., draft,
    submitted, under_review, rejected), POST to acceptance-letter shall
    return HTTP 400.

    **Validates: Requirements 4.5**
    """

    # Feature: post-migration-cleanup, Property 9: Acceptance letter rejects non-approved applications

    @given(app_status=st.sampled_from(["draft", "submitted", "under_review", "rejected"]))
    @_default_settings
    def test_non_approved_status_returns_400(self, app_status):
        """Non-approved application status returns 400 on acceptance-letter."""
        factory = APIRequestFactory()
        view = AcceptanceLetterView.as_view()
        admin = _admin_user()

        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, status=app_status)

        with patch(_APP) as mock_app_qs:
            mock_app_qs.get.return_value = application

            request = _auth_request(
                factory, "post",
                f"/api/v1/applications/{app_id}/acceptance-letter/",
                admin,
            )
            response = view(request, application_id=app_id)

            assert response.status_code == 400
            assert response.data["success"] is False
            assert response.data["code"] == "INVALID_STATUS"


# =========================================================================
# Property 10: Finance receipt rejects applications without verified payment
# =========================================================================


class TestFinanceReceiptRejectsNoPayment:
    """Property 10: Finance receipt rejects applications without verified payment.

    For any application that has no Payment record with status="verified",
    POST to finance-receipt shall return HTTP 400.

    **Validates: Requirements 5.5**
    """

    # Feature: post-migration-cleanup, Property 10: Finance receipt rejects applications without verified payment

    @given(app_status=st.sampled_from(["draft", "submitted", "under_review", "approved", "rejected"]))
    @_default_settings
    def test_no_verified_payment_returns_400(self, app_status):
        """Application without verified payment returns 400 on finance-receipt."""
        factory = APIRequestFactory()
        view = FinanceReceiptView.as_view()
        admin = _admin_user()

        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, status=app_status)

        with patch(_APP) as mock_app_qs, \
             patch(_PAY) as mock_pay_qs:
            mock_app_qs.get.return_value = application
            mock_pay_qs.filter.return_value.exists.return_value = False

            request = _auth_request(
                factory, "post",
                f"/api/v1/applications/{app_id}/finance-receipt/",
                admin,
            )
            response = view(request, application_id=app_id)

            assert response.status_code == 400
            assert response.data["success"] is False
            assert response.data["code"] == "PAYMENT_REQUIRED"


# =========================================================================
# Property 11: Idempotent generation requests
# =========================================================================


class TestIdempotentGenerationRequests:
    """Property 11: Idempotent generation requests.

    For any application eligible for acceptance letter or finance receipt
    generation, submitting the same POST request twice within the
    idempotency window shall return the same task_id in both responses,
    and shall not enqueue a second Celery task.

    **Validates: Requirements 4.10, 5.10**
    """

    # Feature: post-migration-cleanup, Property 11: Idempotent generation requests

    @given(admin_id=st.uuids())
    @_default_settings
    def test_acceptance_letter_idempotency(self, admin_id):
        """Second acceptance-letter request returns cached task_id, no new Celery task."""
        factory = APIRequestFactory()
        view = AcceptanceLetterView.as_view()
        admin = _admin_user(user_id=admin_id)

        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, status="approved")
        original_task_id = f"celery-{uuid.uuid4().hex[:8]}"

        with patch(_APP) as mock_app_qs, \
             patch(_TASK_LETTER) as mock_task, \
             patch(_IDEM) as mock_idem_qs, \
             patch(_AUDIT):
            mock_app_qs.get.return_value = application

            # First request: no existing idempotency key
            mock_idem_qs.filter.return_value.first.return_value = None
            mock_result = MagicMock()
            mock_result.id = original_task_id
            mock_task.delay.return_value = mock_result

            request1 = _auth_request(
                factory, "post",
                f"/api/v1/applications/{app_id}/acceptance-letter/",
                admin,
            )
            response1 = view(request1, application_id=app_id)
            assert response1.status_code == 202
            assert response1.data["data"]["task_id"] == original_task_id
            mock_task.delay.assert_called_once()

            # Second request: existing idempotency key returns cached response
            cached_response = {
                "task_id": original_task_id,
                "application_id": str(app_id),
                "status": "queued",
            }
            existing_key = MagicMock()
            existing_key.response_body = cached_response
            mock_idem_qs.filter.return_value.first.return_value = existing_key
            mock_task.delay.reset_mock()

            request2 = _auth_request(
                factory, "post",
                f"/api/v1/applications/{app_id}/acceptance-letter/",
                admin,
            )
            response2 = view(request2, application_id=app_id)
            assert response2.status_code == 202
            assert response2.data["data"]["task_id"] == original_task_id
            # No second Celery task enqueued
            mock_task.delay.assert_not_called()

    @given(admin_id=st.uuids())
    @_default_settings
    def test_finance_receipt_idempotency(self, admin_id):
        """Second finance-receipt request returns cached task_id, no new Celery task."""
        factory = APIRequestFactory()
        view = FinanceReceiptView.as_view()
        admin = _admin_user(user_id=admin_id)

        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id, status="approved")
        original_task_id = f"celery-{uuid.uuid4().hex[:8]}"

        with patch(_APP) as mock_app_qs, \
             patch(_PAY) as mock_pay_qs, \
             patch(_TASK_RECEIPT) as mock_task, \
             patch(_IDEM) as mock_idem_qs, \
             patch(_AUDIT):
            mock_app_qs.get.return_value = application
            mock_pay_qs.filter.return_value.exists.return_value = True

            # First request: no existing idempotency key
            mock_idem_qs.filter.return_value.first.return_value = None
            mock_result = MagicMock()
            mock_result.id = original_task_id
            mock_task.delay.return_value = mock_result

            request1 = _auth_request(
                factory, "post",
                f"/api/v1/applications/{app_id}/finance-receipt/",
                admin,
            )
            response1 = view(request1, application_id=app_id)
            assert response1.status_code == 202
            assert response1.data["data"]["task_id"] == original_task_id
            mock_task.delay.assert_called_once()

            # Second request: existing idempotency key returns cached response
            cached_response = {
                "task_id": original_task_id,
                "application_id": str(app_id),
                "status": "queued",
            }
            existing_key = MagicMock()
            existing_key.response_body = cached_response
            mock_idem_qs.filter.return_value.first.return_value = existing_key
            mock_task.delay.reset_mock()

            request2 = _auth_request(
                factory, "post",
                f"/api/v1/applications/{app_id}/finance-receipt/",
                admin,
            )
            response2 = view(request2, application_id=app_id)
            assert response2.status_code == 202
            assert response2.data["data"]["task_id"] == original_task_id
            # No second Celery task enqueued
            mock_task.delay.assert_not_called()
