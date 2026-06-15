"""Unit tests for Celery tasks: generate_acceptance_letter_task, generate_finance_receipt_task.

Tests that each task creates an ApplicationDocument with correct fields,
uses system_generated=True, and sets the appropriate document_type.
All R2 storage calls are mocked via MediaStorage.

Implements task 11.2 (post-migration-cleanup).
Requirements: 6.1, 6.2, 6.3
"""

import io
import uuid
from unittest.mock import MagicMock, patch

from apps.applications.tasks import (
    generate_acceptance_letter_task,
    generate_finance_receipt_task,
)

# Patch targets — tasks use lazy imports inside the function body,
# so we patch at the source module where they're imported from.
_APP_MODEL = "apps.applications.models.Application.objects"
_DOC_CREATE = "apps.documents.models.ApplicationDocument.objects"
_PAY_MODEL = "apps.documents.models.Payment.objects"
_STORAGE = "apps.common.storage.MediaStorage"
# Acceptance letters are profile-required (R8.9): with no resolved
# Institution_Document_Profile the task fails and creates no document. These
# ORM-mocked unit tests run without a DB, so patch the resolver to return an
# active profile and exercise the success path.
_PROFILE_RESOLVE = "apps.catalog.services.InstitutionDocumentProfileService.resolve"


def _make_profile():
    """Minimal active profile stand-in for the acceptance-letter renderer."""
    profile = MagicMock()
    profile.id = uuid.uuid4()
    profile.version = 1
    profile.sections = {"body": "Profile body"}
    profile.fee_chart = []
    profile.bank_accounts = []
    profile.requirements = []
    profile.signatory = {"name": "Registrar", "role": "Admissions"}
    return profile


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_application(app_id=None, status="approved"):
    """Build a mock Application object matching the fields used by tasks."""
    app = MagicMock()
    app.id = app_id or uuid.uuid4()
    app.pk = app.id
    app.status = status
    app.application_number = f"APP-{uuid.uuid4().hex[:8].upper()}"
    app.full_name = "Test Applicant"
    app.program = "Computer Science"
    app.intake = "January 2025"
    app.institution = "Test University"
    # Provenance snapshot fields (R16.1) — set explicit JSON-serialisable
    # scalars so the MagicMock does not leak unserialisable attributes into
    # verification_notes.official_document. Real Applications carry UUIDs/None
    # here; None is the correct value for a fresh mock.
    app.student_number = None
    app.canonical_program_id = None
    app.program_offering_id = None
    app.intake_ref_id = None
    return app


def _make_payment():
    """Build a mock Payment object matching the fields used by the receipt PDF."""
    pay = MagicMock()
    pay.id = uuid.uuid4()
    pay.amount = 500
    pay.currency = "ZMW"
    pay.payment_method = "mobile_money"
    pay.transaction_reference = "TXN-12345"
    pay.receipt_number = "REC-001"
    pay.verified_at = MagicMock()
    pay.verified_at.strftime.return_value = "15 January 2025"
    return pay


def _mock_storage_instance():
    """Return a mock MediaStorage that simulates save + url."""
    storage = MagicMock()
    storage.save.return_value = "media/acceptance-letters/test.pdf"
    storage.url.return_value = "https://r2.example.com/media/acceptance-letters/test.pdf"
    return storage


# ---------------------------------------------------------------------------
# generate_acceptance_letter_task
# ---------------------------------------------------------------------------


class TestGenerateAcceptanceLetterTask:
    """Tests for generate_acceptance_letter_task."""

    @patch(_PROFILE_RESOLVE)
    @patch(_STORAGE)
    @patch(_DOC_CREATE)
    @patch(_APP_MODEL)
    def test_creates_application_document_with_correct_fields(
        self, mock_app_qs, mock_doc_qs, mock_storage_cls, mock_resolve
    ):
        """Task creates an ApplicationDocument with document_type='acceptance_letter'."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        mock_app_qs.get.return_value = application
        mock_resolve.return_value = _make_profile()

        storage_instance = _mock_storage_instance()
        mock_storage_cls.return_value = storage_instance

        generate_acceptance_letter_task(str(app_id))

        mock_doc_qs.create.assert_called_once()
        call_kwargs = mock_doc_qs.create.call_args[1]
        assert call_kwargs["application"] == application
        assert call_kwargs["document_type"] == "acceptance_letter"
        assert call_kwargs["system_generated"] is True
        assert call_kwargs["verification_status"] == "verified"
        assert call_kwargs["mime_type"] == "application/pdf"

    @patch(_PROFILE_RESOLVE)
    @patch(_STORAGE)
    @patch(_DOC_CREATE)
    @patch(_APP_MODEL)
    def test_document_name_contains_applicant_name(
        self, mock_app_qs, mock_doc_qs, mock_storage_cls, mock_resolve
    ):
        """Document name includes the applicant's full name."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        mock_app_qs.get.return_value = application
        mock_resolve.return_value = _make_profile()

        storage_instance = _mock_storage_instance()
        mock_storage_cls.return_value = storage_instance

        generate_acceptance_letter_task(str(app_id))

        call_kwargs = mock_doc_qs.create.call_args[1]
        assert "Test Applicant" in call_kwargs["document_name"]

    @patch(_PROFILE_RESOLVE)
    @patch(_STORAGE)
    @patch(_DOC_CREATE)
    @patch(_APP_MODEL)
    def test_stores_pdf_in_r2_via_media_storage(
        self, mock_app_qs, mock_doc_qs, mock_storage_cls, mock_resolve
    ):
        """Task uploads the generated PDF to R2 via MediaStorage."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        mock_app_qs.get.return_value = application
        mock_resolve.return_value = _make_profile()

        storage_instance = _mock_storage_instance()
        mock_storage_cls.return_value = storage_instance

        generate_acceptance_letter_task(str(app_id))

        storage_instance.save.assert_called_once()
        save_args = storage_instance.save.call_args
        # First arg is the filename path, second is the buffer
        assert "acceptance-letters" in save_args[0][0]
        assert save_args[0][0].endswith(".pdf")

    @patch(_PROFILE_RESOLVE)
    @patch(_STORAGE)
    @patch(_DOC_CREATE)
    @patch(_APP_MODEL)
    def test_file_url_set_from_storage(
        self, mock_app_qs, mock_doc_qs, mock_storage_cls, mock_resolve
    ):
        """ApplicationDocument.file_url is set from storage.url()."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        mock_app_qs.get.return_value = application
        mock_resolve.return_value = _make_profile()

        storage_instance = _mock_storage_instance()
        mock_storage_cls.return_value = storage_instance

        generate_acceptance_letter_task(str(app_id))

        call_kwargs = mock_doc_qs.create.call_args[1]
        assert call_kwargs["file_url"] == "https://r2.example.com/media/acceptance-letters/test.pdf"

    @patch(_DOC_CREATE)
    @patch(_APP_MODEL)
    def test_missing_application_does_not_create_document(
        self, mock_app_qs, mock_doc_qs
    ):
        """Task exits early without creating a document if application is missing."""
        from apps.applications.models import Application

        mock_app_qs.get.side_effect = Application.DoesNotExist

        generate_acceptance_letter_task(str(uuid.uuid4()))

        mock_doc_qs.create.assert_not_called()


# ---------------------------------------------------------------------------
# generate_finance_receipt_task
# ---------------------------------------------------------------------------


class TestGenerateFinanceReceiptTask:
    """Tests for generate_finance_receipt_task."""

    @patch(_STORAGE)
    @patch(_PAY_MODEL)
    @patch(_DOC_CREATE)
    @patch(_APP_MODEL)
    def test_creates_application_document_with_correct_fields(
        self, mock_app_qs, mock_doc_qs, mock_pay_qs, mock_storage_cls
    ):
        """Task creates an ApplicationDocument with document_type='finance_receipt'."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        mock_app_qs.get.return_value = application
        mock_pay_qs.filter.return_value.order_by.return_value.first.return_value = _make_payment()

        storage_instance = _mock_storage_instance()
        mock_storage_cls.return_value = storage_instance

        generate_finance_receipt_task(str(app_id))

        mock_doc_qs.create.assert_called_once()
        call_kwargs = mock_doc_qs.create.call_args[1]
        assert call_kwargs["application"] == application
        assert call_kwargs["document_type"] == "finance_receipt"
        assert call_kwargs["system_generated"] is True
        assert call_kwargs["verification_status"] == "verified"
        assert call_kwargs["mime_type"] == "application/pdf"

    @patch(_STORAGE)
    @patch(_PAY_MODEL)
    @patch(_DOC_CREATE)
    @patch(_APP_MODEL)
    def test_document_name_contains_applicant_name(
        self, mock_app_qs, mock_doc_qs, mock_pay_qs, mock_storage_cls
    ):
        """Document name includes the applicant's full name."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        mock_app_qs.get.return_value = application
        mock_pay_qs.filter.return_value.order_by.return_value.first.return_value = _make_payment()

        storage_instance = _mock_storage_instance()
        mock_storage_cls.return_value = storage_instance

        generate_finance_receipt_task(str(app_id))

        call_kwargs = mock_doc_qs.create.call_args[1]
        assert "Test Applicant" in call_kwargs["document_name"]

    @patch(_STORAGE)
    @patch(_PAY_MODEL)
    @patch(_DOC_CREATE)
    @patch(_APP_MODEL)
    def test_stores_pdf_in_r2_via_media_storage(
        self, mock_app_qs, mock_doc_qs, mock_pay_qs, mock_storage_cls
    ):
        """Task uploads the generated PDF to R2 via MediaStorage."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        mock_app_qs.get.return_value = application
        mock_pay_qs.filter.return_value.order_by.return_value.first.return_value = _make_payment()

        storage_instance = _mock_storage_instance()
        mock_storage_cls.return_value = storage_instance

        generate_finance_receipt_task(str(app_id))

        storage_instance.save.assert_called_once()
        save_args = storage_instance.save.call_args
        assert "finance-receipts" in save_args[0][0]
        assert save_args[0][0].endswith(".pdf")

    @patch(_STORAGE)
    @patch(_PAY_MODEL)
    @patch(_DOC_CREATE)
    @patch(_APP_MODEL)
    def test_file_url_set_from_storage(
        self, mock_app_qs, mock_doc_qs, mock_pay_qs, mock_storage_cls
    ):
        """ApplicationDocument.file_url is set from storage.url()."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        mock_app_qs.get.return_value = application
        mock_pay_qs.filter.return_value.order_by.return_value.first.return_value = _make_payment()

        storage_instance = _mock_storage_instance()
        storage_instance.url.return_value = "https://r2.example.com/media/finance-receipts/test.pdf"
        mock_storage_cls.return_value = storage_instance

        generate_finance_receipt_task(str(app_id))

        call_kwargs = mock_doc_qs.create.call_args[1]
        assert call_kwargs["file_url"] == "https://r2.example.com/media/finance-receipts/test.pdf"

    @patch(_DOC_CREATE)
    @patch(_APP_MODEL)
    def test_missing_application_does_not_create_document(
        self, mock_app_qs, mock_doc_qs
    ):
        """Task exits early without creating a document if application is missing."""
        from apps.applications.models import Application

        mock_app_qs.get.side_effect = Application.DoesNotExist

        generate_finance_receipt_task(str(uuid.uuid4()))

        mock_doc_qs.create.assert_not_called()

    @patch(_STORAGE)
    @patch(_PAY_MODEL)
    @patch(_DOC_CREATE)
    @patch(_APP_MODEL)
    def test_handles_no_payment_gracefully(
        self, mock_app_qs, mock_doc_qs, mock_pay_qs, mock_storage_cls
    ):
        """Task exits without a document when no successful payment exists."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        mock_app_qs.get.return_value = application
        mock_pay_qs.filter.return_value.order_by.return_value.first.return_value = None

        storage_instance = _mock_storage_instance()
        mock_storage_cls.return_value = storage_instance

        generate_finance_receipt_task(str(app_id))

        mock_doc_qs.create.assert_not_called()
        mock_storage_cls.assert_not_called()
