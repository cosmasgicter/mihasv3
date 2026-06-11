"""Property-based tests for Celery tasks: generate_acceptance_letter_task, generate_finance_receipt_task.

# Feature: post-migration-cleanup, Property 8: Celery tasks create correct ApplicationDocument records

Uses hypothesis for property-based testing with the same mock patterns as the unit tests.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import io  # noqa: E402
import uuid  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.applications.tasks import (  # noqa: E402
    generate_acceptance_letter_task,
    generate_finance_receipt_task,
)

_default_settings = settings(max_examples=5, deadline=None)

# Patch targets (same as unit tests)
_APP_MODEL = "apps.applications.models.Application.objects"
_DOC_CREATE = "apps.documents.models.ApplicationDocument.objects"
_PAY_MODEL = "apps.documents.models.Payment.objects"
_STORAGE = "apps.common.storage.MediaStorage"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_application(app_id=None, status="approved"):
    app = MagicMock()
    app.id = app_id or uuid.uuid4()
    app.pk = app.id
    app.status = status
    app.application_number = f"APP-{uuid.uuid4().hex[:8].upper()}"
    app.full_name = "Test Applicant"
    app.program = "Computer Science"
    app.intake = "January 2025"
    app.institution = "Test University"
    return app


def _make_payment():
    pay = MagicMock()
    pay.amount = 500
    pay.currency = "ZMW"
    pay.payment_method = "mobile_money"
    pay.transaction_reference = "TXN-12345"
    pay.receipt_number = "REC-001"
    pay.verified_at = MagicMock()
    pay.verified_at.strftime.return_value = "15 January 2025"
    return pay


def _mock_storage_instance():
    storage = MagicMock()
    storage.save.return_value = "media/test/test.pdf"
    storage.url.return_value = "https://r2.example.com/media/test/test.pdf"
    return storage


# =========================================================================
# Property 8: Celery tasks create correct ApplicationDocument records
# =========================================================================


class TestCeleryTaskApplicationDocumentCreation:
    """Property 8: Celery tasks create correct ApplicationDocument records.

    For any application ID, when generate_acceptance_letter_task or
    generate_finance_receipt_task completes successfully, an
    ApplicationDocument record shall exist with application_id matching
    the input, system_generated=True, and document_type equal to
    "acceptance_letter" or "finance_receipt" respectively.

    **Validates: Requirements 4.3, 5.3**
    """

    # Feature: post-migration-cleanup, Property 8: Celery tasks create correct ApplicationDocument records

    @given(
        doc_type=st.sampled_from(["acceptance_letter", "finance_receipt"]),
    )
    @_default_settings
    def test_task_creates_document_with_correct_type_and_system_generated(self, doc_type):
        """Both tasks create ApplicationDocument with system_generated=True and correct document_type."""
        app_id = uuid.uuid4()
        application = _make_application(app_id=app_id)

        with patch(_APP_MODEL) as mock_app_qs, \
             patch(_DOC_CREATE) as mock_doc_qs, \
             patch(_PAY_MODEL) as mock_pay_qs, \
             patch("apps.applications.tasks.pdf_generation._render_official_pdf") as mock_render, \
             patch(_STORAGE) as mock_storage_cls:
            mock_app_qs.get.return_value = application
            mock_pay_qs.filter.return_value.first.return_value = _make_payment()
            # Render seam is exercised by the dedicated renderer/profile tests.
            # Here we only assert ApplicationDocument.create wiring, so return a
            # clean PDF buffer + JSON-serialisable metadata (bypassing the
            # tenant profile gate, which has its own coverage).
            mock_render.return_value = (io.BytesIO(b"%PDF-1.4 test"), {"document_type": doc_type})

            storage_instance = _mock_storage_instance()
            mock_storage_cls.return_value = storage_instance

            if doc_type == "acceptance_letter":
                generate_acceptance_letter_task(str(app_id))
            else:
                generate_finance_receipt_task(str(app_id))

            mock_doc_qs.create.assert_called_once()
            call_kwargs = mock_doc_qs.create.call_args[1]
            assert call_kwargs["application"] == application
            assert call_kwargs["document_type"] == doc_type
            assert call_kwargs["system_generated"] is True
            assert call_kwargs["verification_status"] == "verified"
            assert call_kwargs["mime_type"] == "application/pdf"
