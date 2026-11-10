"""Unit tests for application endpoints: verify-document, acceptance-letter, finance-receipt.

Tests authentication, authorization (admin-only), response envelope format,
error handling, audit log creation, and idempotency.

Implements task 11.1 (post-migration-cleanup).
Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
"""

import uuid
from unittest.mock import MagicMock, patch

import pytest
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.applications.document_views import (
    AcceptanceLetterView,
    ApplicationVerifyDocumentView,
    FinanceReceiptView,
)

# Patch targets:
# - Application and ApplicationDocument are module-level imports in views.py
#   → patch "apps.applications.models.Application.objects" etc.
# - AuditLog, IdempotencyKey, Payment, and tasks are lazy-imported inside methods
#   → patch at source: "apps.common.models.AuditLog.objects" etc.
_APP = "apps.applications.models.Application.objects"
_DOC = "apps.documents.models.ApplicationDocument.objects"
_AUDIT = "apps.common.models.AuditLog.objects"
_IDEM = "apps.common.models.IdempotencyKey.objects"
_PAY = "apps.documents.models.Payment.objects"
_TASK_LETTER = "apps.applications.tasks.generate_acceptance_letter_task"
_TASK_RECEIPT = "apps.applications.tasks.generate_finance_receipt_task"


@pytest.fixture(autouse=True)
def _passthrough_access_scope(request):
    """Neutralise multi-tenant application scoping for these mock-based tests.

    The document/verify/review views now route every fetch through
    ``AccessScopeService().filter_applications`` (multi-tenant Beanola). These
    SimpleTestCase-style tests mock ``Application.objects`` directly and assert
    view wiring, so the real scope service must return the (mocked) queryset
    unchanged instead of issuing its own DB query for the membership lookup.
    ``admin_review_views`` imports it lazily, so patch the canonical source for
    that path.

    Task 9.4 moved ``document_views`` onto the shared ``resolve_scoped_application``
    seam and dropped its module-level ``AccessScopeService`` import, at which point
    an unconditional ``patch`` of that name raised ``AttributeError`` **at setup**
    and every case in this file errored rather than ran. The target is therefore
    guarded: ``apps.catalog.services.AccessScopeService`` is the real seam, because
    ``resolve_scoped_application`` imports it lazily from there.
    (admissions-v2 GATE-13.1-02, closed by task 13.6.)

    A case marked ``@pytest.mark.real_tenant_scope`` opts **out**: it runs against
    a real database with real tenant rows, so the scope service, the evidence
    ledger and the committed official-document job all run for real. Those are the
    post-7.3 / post-9.4 / post-10.4 behaviours these endpoints acquired, and
    stubbing them away would delete exactly what those tasks added (remediation
    **L4**).
    """
    if request.node.get_closest_marker("real_tenant_scope"):
        yield
        return

    import contextlib

    import apps.applications.document_views as _document_views

    targets = ["apps.catalog.services.AccessScopeService"]
    if hasattr(_document_views, "AccessScopeService"):
        targets.insert(0, "apps.applications.document_views.AccessScopeService")

    with contextlib.ExitStack() as stack:
        for target in targets:
            m = stack.enter_context(patch(target))
            m.return_value.filter_applications.side_effect = lambda qs, _user: qs
        yield


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
# Real-database staff fixtures (remediation L4)
# ---------------------------------------------------------------------------
#
# The verify-document / acceptance-letter / finance-receipt success paths and the
# three non-staff refusals cannot be exercised mock-only any more. Since tasks
# 7.3, 9.4 and 10.4 they run ``resolve_scoped_application`` (a scoped SQL
# lookup), ``document_evidence.record_verification_decision`` (a transactional
# ledger write) and ``official_document_jobs.request_generation`` (a **committed**
# durable job before any 202). Mock-only, each one raised pytest-django's
# "Database access not allowed" and surfaced as a 500 — or, on the
# official-document path, as the 503 the view *correctly* answers when it cannot
# commit the job it would otherwise claim to have queued.
#
# So these cases get a real database and real tenant rows. Only the broker
# dispatch is stubbed (``_enqueue_generation`` — the single symbol
# ``official_document_views`` documents for exactly this), because there is no
# Celery broker in a unit run and dispatch is best-effort *after* the commit.


def _staff_jwt_user(profile):
    """A ``JWTUser`` for a persisted staff ``Profile`` (the real actor identity)."""
    return JWTUser({
        "user_id": str(profile.id),
        "email": profile.email,
        "role": profile.role,
        "first_name": profile.first_name,
        "last_name": profile.last_name,
    })


@pytest.fixture()
def staff_world(db):
    """A tenant world whose staff admin holds the mutation capabilities used here.

    ``build_tenant_world`` creates the membership with an empty ``permissions``
    bundle, which derives the tenant **read** set only (read-by-default /
    mutate-only-when-granted). ``review`` / ``verify_documents`` /
    ``verify_payments`` are granted explicitly so ``tenant.application.review``,
    ``tenant.document.verify`` and ``tenant.payment.verify`` resolve — the
    authority is derived by ``AdminCapabilityService`` here exactly as it is in
    production, never asserted from a role string.
    """
    from tests.tenant_fixtures import build_tenant_world

    world = build_tenant_world(application_status="approved")
    world.membership.permissions = ["review", "verify_documents", "verify_payments"]
    world.membership.save(update_fields=["permissions"])
    return world


def _stub_broker_dispatch(task_id):
    """Patch the official-document **dispatch** only; the commit stays real."""
    return patch(
        "apps.applications.official_document_views._enqueue_generation",
        return_value=task_id,
    )


def _legacy_audit_rows(entity_type, action=None, entity_id=None):
    """The persisted legacy ``audit_logs`` rows for one entity type / action / id.

    ``entity_id`` matters under Hypothesis: the ``db`` fixture wraps the whole
    test *function*, so every example shares one transaction and rows accumulate
    across examples. Scoping to the row this example created keeps the assertion
    about this example.
    """
    from apps.common.models import AuditLog

    queryset = AuditLog.objects.filter(entity_type=entity_type)
    if action is not None:
        queryset = queryset.filter(action=action)
    if entity_id is not None:
        queryset = queryset.filter(entity_id=entity_id)
    return list(queryset)


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

    @pytest.mark.real_tenant_scope
    @pytest.mark.django_db
    def test_successful_verification(self, staff_world):
        """Scoped staff can verify a document — 200, envelope, real ledger write.

        Real database: the scoped lookup, the evidence-ledger transition (task
        7.3) and the ``audit_logs`` row are all genuine. The decision is read
        back from the persisted document rather than from a mock's attribute, so
        the assertion is that the platform *stored* the decision — not merely
        that a setter was called.
        """
        from tests.tenant_fixtures import build_document

        application = staff_world.application
        document = build_document(application=application)
        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{application.id}/verify-document/",
            _staff_jwt_user(staff_world.staff),
            data={"documentId": str(document.id), "status": "verified", "notes": "Looks good"},
            format="json",
        )
        response = self.view(request, application_id=application.id)

        assert response.status_code == 200, response.data
        body = response.data
        assert body["success"] is True
        assert "data" in body
        document.refresh_from_db()
        assert document.verification_status == "verified"
        assert document.lifecycle_state == "verified"
        assert str(document.verified_by_id) == str(staff_world.staff.id)
        # Legacy audit row plus the additive tenant Audit_Event
        # (enterprise-tenant-authority R10.5/R10.8) both land in ``audit_logs``;
        # assert the legacy document-verification row was written.
        assert len(
            _legacy_audit_rows(
                "application_documents", "document_verified", entity_id=document.id
            )
        ) == 1

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

    @pytest.mark.real_tenant_scope
    @pytest.mark.django_db
    def test_unauthorized_student_returns_403(self, staff_world):
        """A student who does not own the application is refused — masked 404.

        Post-9.4 authority for this endpoint is the derived
        ``tenant.document.verify`` capability resolved by
        ``resolve_scoped_application``, not a role-string permission class. A
        caller with no scope over the application is therefore refused with the
        **indistinguishable 404** the disclosure policy requires (R4.4 / AUTH-07)
        — a 403 would confirm the application exists. This is the same masked-404
        conversion ``test_waitlist.py::test_non_owner_non_admin_404_mask``
        records, and it discloses strictly less than the 403 it replaces.
        """
        from tests.tenant_fixtures import build_document, build_profile

        application = staff_world.application
        document = build_document(application=application)
        outsider = build_profile(role="student")
        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{application.id}/verify-document/",
            _staff_jwt_user(outsider),
            data={"documentId": str(document.id), "status": "verified"},
            format="json",
        )
        response = self.view(request, application_id=application.id)

        assert response.status_code == 404
        assert response.data["success"] is False
        document.refresh_from_db()
        assert document.verification_status == "pending"

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

    @pytest.mark.real_tenant_scope
    @pytest.mark.django_db
    def test_response_envelope_format(self, staff_world):
        """Response uses {success: true, data: {...}} envelope."""
        from tests.tenant_fixtures import build_document

        application = staff_world.application
        document = build_document(application=application)
        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{application.id}/verify-document/",
            _staff_jwt_user(staff_world.staff),
            data={"documentId": str(document.id), "status": "rejected", "notes": "Blurry"},
            format="json",
        )
        response = self.view(request, application_id=application.id)

        assert response.status_code == 200, response.data
        body = response.data
        assert "success" in body
        assert "data" in body
        assert isinstance(body["data"], dict)

    @pytest.mark.real_tenant_scope
    @pytest.mark.django_db
    def test_audit_log_created_on_success(self, staff_world):
        """Audit log entry is persisted with correct entity_type, action, actor."""
        from tests.tenant_fixtures import build_document

        application = staff_world.application
        document = build_document(application=application)
        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{application.id}/verify-document/",
            _staff_jwt_user(staff_world.staff),
            data={"documentId": str(document.id), "status": "verified"},
            format="json",
        )
        response = self.view(request, application_id=application.id)
        assert response.status_code == 200, response.data

        # Legacy audit row plus the additive tenant Audit_Event
        # (enterprise-tenant-authority R10.5/R10.8) both land in ``audit_logs``.
        # Locate the legacy document-verification row and assert its fields.
        rows = _legacy_audit_rows(
            "application_documents", "document_verified", entity_id=document.id
        )
        assert len(rows) == 1
        row = rows[0]
        assert row.entity_type == "application_documents"
        assert str(row.actor_id) == str(staff_world.staff.id)
        assert row.action == "document_verified"
        assert str(row.entity_id) == str(document.id)


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

    @pytest.mark.real_tenant_scope
    @pytest.mark.django_db
    def test_successful_202_response(self, staff_world):
        """Scoped staff gets 202 for an approved application — and a committed job.

        Task 10.4: a 202 is only answered on the far side of a **committed**
        durable job, so this case needs a real database. The job commit and the
        legacy audit row run for real; only the broker dispatch is stubbed,
        because a unit run has no broker and dispatch is deliberately
        best-effort *after* the commit.
        """
        from apps.applications import official_document_jobs as jobs

        application = staff_world.application
        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{application.id}/acceptance-letter/",
            _staff_jwt_user(staff_world.staff),
        )
        with _stub_broker_dispatch("celery-task-id-123") as mock_dispatch:
            response = self.view(request, application_id=application.id)

        assert response.status_code == 202, response.data
        body = response.data
        assert body["success"] is True
        assert body["data"]["task_id"] == "celery-task-id-123"
        assert body["data"]["application_id"] == str(application.id)
        assert body["data"]["status"] == "queued"
        mock_dispatch.assert_called_once()
        # The 202 is backed by a record, which is the whole point of 10.4.
        job = jobs.read_job(application.id, "acceptance_letter")
        assert job is not None
        assert job.task_id == "celery-task-id-123"

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

    @pytest.mark.real_tenant_scope
    @pytest.mark.django_db
    def test_unauthorized_student_returns_403(self, staff_world):
        """A student with no scope over the application is refused — masked 404.

        Post-9.4 the authority is the derived ``tenant.application.review``
        capability resolved by ``resolve_scoped_application``, so an out-of-scope
        caller receives the indistinguishable 404 required by R4.4 / AUTH-07
        rather than a 403 that would confirm the application exists. Nothing is
        queued.
        """
        from apps.applications import official_document_jobs as jobs
        from tests.tenant_fixtures import build_profile

        application = staff_world.application
        outsider = build_profile(role="student")
        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{application.id}/acceptance-letter/",
            _staff_jwt_user(outsider),
        )
        response = self.view(request, application_id=application.id)

        assert response.status_code == 404
        assert response.data["success"] is False
        assert jobs.read_job(application.id, "acceptance_letter") is None

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

    @pytest.mark.real_tenant_scope
    @pytest.mark.django_db
    def test_audit_log_created_on_success(self, staff_world):
        """Audit log entry is persisted with correct entity_type, action, actor."""
        application = staff_world.application
        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{application.id}/acceptance-letter/",
            _staff_jwt_user(staff_world.staff),
        )
        with _stub_broker_dispatch("task-id-audit"):
            response = self.view(request, application_id=application.id)
        assert response.status_code == 202, response.data

        rows = _legacy_audit_rows(
            "applications", "generate_acceptance_letter", entity_id=application.id
        )
        assert len(rows) == 1
        row = rows[0]
        assert row.entity_type == "applications"
        assert str(row.actor_id) == str(staff_world.staff.id)
        assert row.action == "generate_acceptance_letter"


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

    @pytest.mark.real_tenant_scope
    @pytest.mark.django_db
    def test_successful_202_response(self, staff_world):
        """Scoped staff gets 202 for an application with a completed payment.

        Real database (task 10.4): the completed ``Payment`` row is the real gate
        input and the 202 is backed by a committed job. Only the broker dispatch
        is stubbed.
        """
        from apps.applications import official_document_jobs as jobs
        from tests.tenant_fixtures import build_payment

        application = staff_world.application
        build_payment(application=application, status="successful")
        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{application.id}/finance-receipt/",
            _staff_jwt_user(staff_world.staff),
        )
        with _stub_broker_dispatch("celery-receipt-task-123") as mock_dispatch:
            response = self.view(request, application_id=application.id)

        assert response.status_code == 202, response.data
        body = response.data
        assert body["success"] is True
        assert body["data"]["task_id"] == "celery-receipt-task-123"
        assert body["data"]["application_id"] == str(application.id)
        assert body["data"]["status"] == "queued"
        mock_dispatch.assert_called_once()
        job = jobs.read_job(application.id, "finance_receipt")
        assert job is not None
        assert job.task_id == "celery-receipt-task-123"

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

    @pytest.mark.real_tenant_scope
    @pytest.mark.django_db
    def test_unauthorized_student_returns_403(self, staff_world):
        """A student with no scope over the application is refused — masked 404.

        Authority here is the derived ``tenant.payment.read`` capability resolved
        by ``resolve_scoped_application``; an out-of-scope caller gets the
        indistinguishable 404 (R4.4 / AUTH-07), and nothing is queued.
        """
        from apps.applications import official_document_jobs as jobs
        from tests.tenant_fixtures import build_payment, build_profile

        application = staff_world.application
        build_payment(application=application, status="successful")
        outsider = build_profile(role="student")
        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{application.id}/finance-receipt/",
            _staff_jwt_user(outsider),
        )
        response = self.view(request, application_id=application.id)

        assert response.status_code == 404
        assert response.data["success"] is False
        assert jobs.read_job(application.id, "finance_receipt") is None

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

    @pytest.mark.real_tenant_scope
    @pytest.mark.django_db
    def test_audit_log_created_on_success(self, staff_world):
        """Audit log entry is persisted with correct entity_type, action, actor."""
        from tests.tenant_fixtures import build_payment

        application = staff_world.application
        build_payment(application=application, status="successful")
        request = _auth_request(
            self.factory, "post",
            f"/api/v1/applications/{application.id}/finance-receipt/",
            _staff_jwt_user(staff_world.staff),
        )
        with _stub_broker_dispatch("task-id-receipt-audit"):
            response = self.view(request, application_id=application.id)
        assert response.status_code == 202, response.data

        rows = _legacy_audit_rows(
            "applications", "generate_finance_receipt", entity_id=application.id
        )
        assert len(rows) == 1
        row = rows[0]
        assert row.entity_type == "applications"
        assert str(row.actor_id) == str(staff_world.staff.id)
        assert row.action == "generate_finance_receipt"
