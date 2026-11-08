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
_PAY_MODEL = "apps.documents.models.Payment.objects"
_STORAGE = "apps.common.storage.MediaStorage"

# admissions-v2 task 7.3 (R11.7-R11.8, STU-19): an official document is no longer
# recorded by a bare ``ApplicationDocument.objects.create``. It goes through the
# same staged-write command a student upload uses — a durable stage row committed
# before the PDF reaches object storage, then one atomic metadata commit that
# supersedes the prior version. So the seam these DB-free tests assert on is the
# COMMAND, not the ORM manager: patching ``ApplicationDocument.objects`` would now
# leave ``open_stage`` reaching for a real database (the task's whole point is that
# the stage row is durable) while asserting on kwargs the task no longer passes.
#
# ``commit_version`` receives ``application_id`` rather than an ``application``
# instance and derives ``verification_status`` from the lifecycle, so the
# assertions below read the command's arguments instead of the row's columns. The
# facts being pinned are unchanged: document type, system provenance, verified
# state, MIME type, applicant name in the document name, and the storage URL.
# The reuse/supersede decision still reads through the ORM manager
# (``_current_official_version``), so that stays mocked exactly as before — these
# tests deliberately run without a database.
_DOC_READ = "apps.documents.models.ApplicationDocument.objects"
_OPEN_STAGE = "apps.documents.document_evidence.open_stage"
_COMMIT_VERSION = "apps.documents.document_evidence.commit_version"
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
    @patch(_COMMIT_VERSION)
    @patch(_OPEN_STAGE)
    @patch(_DOC_READ)
    @patch(_APP_MODEL)
    def test_creates_application_document_with_correct_fields(
        self, mock_app_qs, mock_doc_qs, mock_open_stage, mock_commit, mock_storage_cls, mock_resolve
    ):
        """Task creates an ApplicationDocument with document_type='acceptance_letter'."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        mock_app_qs.get.return_value = application
        mock_resolve.return_value = _make_profile()

        storage_instance = _mock_storage_instance()
        mock_storage_cls.return_value = storage_instance

        generate_acceptance_letter_task(str(app_id))

        mock_commit.assert_called_once()
        call_kwargs = mock_commit.call_args[1]
        assert call_kwargs["application_id"] == application.id
        assert call_kwargs["lifecycle_state"] == "verified"
        assert call_kwargs["provenance"] == "system_generated"
        assert call_kwargs["document_type"] == "acceptance_letter"
        assert call_kwargs["mime_type"] == "application/pdf"

    @patch(_PROFILE_RESOLVE)
    @patch(_STORAGE)
    @patch(_COMMIT_VERSION)
    @patch(_OPEN_STAGE)
    @patch(_DOC_READ)
    @patch(_APP_MODEL)
    def test_document_name_contains_applicant_name(
        self, mock_app_qs, mock_doc_qs, mock_open_stage, mock_commit, mock_storage_cls, mock_resolve
    ):
        """Document name includes the applicant's full name."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        mock_app_qs.get.return_value = application
        mock_resolve.return_value = _make_profile()

        storage_instance = _mock_storage_instance()
        mock_storage_cls.return_value = storage_instance

        generate_acceptance_letter_task(str(app_id))

        call_kwargs = mock_commit.call_args[1]
        assert "Test Applicant" in call_kwargs["document_name"]

    @patch(_PROFILE_RESOLVE)
    @patch(_STORAGE)
    @patch(_COMMIT_VERSION)
    @patch(_OPEN_STAGE)
    @patch(_DOC_READ)
    @patch(_APP_MODEL)
    def test_stores_pdf_in_r2_via_media_storage(
        self, mock_app_qs, mock_doc_qs, mock_open_stage, mock_commit, mock_storage_cls, mock_resolve
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
    @patch(_COMMIT_VERSION)
    @patch(_OPEN_STAGE)
    @patch(_DOC_READ)
    @patch(_APP_MODEL)
    def test_file_url_set_from_storage(
        self, mock_app_qs, mock_doc_qs, mock_open_stage, mock_commit, mock_storage_cls, mock_resolve
    ):
        """ApplicationDocument.file_url is the stored key (SJR 3.13), not storage.url()."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        mock_app_qs.get.return_value = application
        mock_resolve.return_value = _make_profile()

        storage_instance = _mock_storage_instance()
        mock_storage_cls.return_value = storage_instance

        generate_acceptance_letter_task(str(app_id))

        call_kwargs = mock_commit.call_args[1]
        # SJR task 3.13 (design R4-a, clause 2.17): the stored key, never a
        # presigned link; URLs are signed on read.
        assert call_kwargs["file_url"] == "media/acceptance-letters/test.pdf"
        assert call_kwargs["storage_key"] == "media/acceptance-letters/test.pdf"
        storage_instance.url.assert_not_called()

    @patch(_COMMIT_VERSION)
    @patch(_OPEN_STAGE)
    @patch(_DOC_READ)
    @patch(_APP_MODEL)
    def test_missing_application_does_not_create_document(
        self, mock_app_qs, mock_doc_qs, mock_open_stage, mock_commit
    ):
        """Task exits early without creating a document if application is missing."""
        from apps.applications.models import Application

        mock_app_qs.get.side_effect = Application.DoesNotExist

        generate_acceptance_letter_task(str(uuid.uuid4()))

        mock_commit.assert_not_called()


# ---------------------------------------------------------------------------
# generate_finance_receipt_task
# ---------------------------------------------------------------------------


class TestGenerateFinanceReceiptTask:
    """Tests for generate_finance_receipt_task."""

    @patch(_STORAGE)
    @patch(_PAY_MODEL)
    @patch(_COMMIT_VERSION)
    @patch(_OPEN_STAGE)
    @patch(_DOC_READ)
    @patch(_APP_MODEL)
    def test_creates_application_document_with_correct_fields(
        self, mock_app_qs, mock_doc_qs, mock_open_stage, mock_commit, mock_pay_qs, mock_storage_cls
    ):
        """Task creates an ApplicationDocument with document_type='finance_receipt'."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        mock_app_qs.get.return_value = application
        mock_pay_qs.filter.return_value.order_by.return_value.first.return_value = _make_payment()

        storage_instance = _mock_storage_instance()
        mock_storage_cls.return_value = storage_instance

        generate_finance_receipt_task(str(app_id))

        mock_commit.assert_called_once()
        call_kwargs = mock_commit.call_args[1]
        assert call_kwargs["application_id"] == application.id
        assert call_kwargs["lifecycle_state"] == "verified"
        assert call_kwargs["provenance"] == "system_generated"
        assert call_kwargs["document_type"] == "finance_receipt"
        assert call_kwargs["mime_type"] == "application/pdf"

    @patch(_STORAGE)
    @patch(_PAY_MODEL)
    @patch(_COMMIT_VERSION)
    @patch(_OPEN_STAGE)
    @patch(_DOC_READ)
    @patch(_APP_MODEL)
    def test_document_name_contains_applicant_name(
        self, mock_app_qs, mock_doc_qs, mock_open_stage, mock_commit, mock_pay_qs, mock_storage_cls
    ):
        """Document name includes the applicant's full name."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        mock_app_qs.get.return_value = application
        mock_pay_qs.filter.return_value.order_by.return_value.first.return_value = _make_payment()

        storage_instance = _mock_storage_instance()
        mock_storage_cls.return_value = storage_instance

        generate_finance_receipt_task(str(app_id))

        call_kwargs = mock_commit.call_args[1]
        assert "Test Applicant" in call_kwargs["document_name"]

    @patch(_STORAGE)
    @patch(_PAY_MODEL)
    @patch(_COMMIT_VERSION)
    @patch(_OPEN_STAGE)
    @patch(_DOC_READ)
    @patch(_APP_MODEL)
    def test_stores_pdf_in_r2_via_media_storage(
        self, mock_app_qs, mock_doc_qs, mock_open_stage, mock_commit, mock_pay_qs, mock_storage_cls
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
    @patch(_COMMIT_VERSION)
    @patch(_OPEN_STAGE)
    @patch(_DOC_READ)
    @patch(_APP_MODEL)
    def test_file_url_set_from_storage(
        self, mock_app_qs, mock_doc_qs, mock_open_stage, mock_commit, mock_pay_qs, mock_storage_cls
    ):
        """ApplicationDocument.file_url is the stored key (SJR 3.13), not storage.url()."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        mock_app_qs.get.return_value = application
        mock_pay_qs.filter.return_value.order_by.return_value.first.return_value = _make_payment()

        storage_instance = _mock_storage_instance()
        storage_instance.url.return_value = "https://r2.example.com/media/finance-receipts/test.pdf"
        mock_storage_cls.return_value = storage_instance

        generate_finance_receipt_task(str(app_id))

        call_kwargs = mock_commit.call_args[1]
        # SJR task 3.13 (design R4-a, clause 2.17): the stored key, not storage.url().
        assert call_kwargs["file_url"] == storage_instance.save.return_value
        assert call_kwargs["storage_key"] == storage_instance.save.return_value
        storage_instance.url.assert_not_called()

    @patch(_COMMIT_VERSION)
    @patch(_OPEN_STAGE)
    @patch(_DOC_READ)
    @patch(_APP_MODEL)
    def test_missing_application_does_not_create_document(
        self, mock_app_qs, mock_doc_qs, mock_open_stage, mock_commit
    ):
        """Task exits early without creating a document if application is missing."""
        from apps.applications.models import Application

        mock_app_qs.get.side_effect = Application.DoesNotExist

        generate_finance_receipt_task(str(uuid.uuid4()))

        mock_commit.assert_not_called()

    @patch(_STORAGE)
    @patch(_PAY_MODEL)
    @patch(_COMMIT_VERSION)
    @patch(_OPEN_STAGE)
    @patch(_DOC_READ)
    @patch(_APP_MODEL)
    def test_handles_no_payment_gracefully(
        self, mock_app_qs, mock_doc_qs, mock_open_stage, mock_commit, mock_pay_qs, mock_storage_cls
    ):
        """Task exits without a document when no successful payment exists."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id)
        mock_app_qs.get.return_value = application
        mock_pay_qs.filter.return_value.order_by.return_value.first.return_value = None

        storage_instance = _mock_storage_instance()
        mock_storage_cls.return_value = storage_instance

        generate_finance_receipt_task(str(app_id))

        mock_commit.assert_not_called()
        mock_storage_cls.assert_not_called()
