"""Tests for document extract and payment receipt envelope format (Phase 1 fix)."""
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import uuid
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from apps.documents.views import DocumentExtractView, PaymentReceiptView

factory = APIRequestFactory()


class TestDocumentExtractEnvelope(SimpleTestCase):
    @patch("apps.documents.views.ApplicationDocument.objects")
    def test_extract_returns_envelope(self, mock_doc_qs):
        doc_id = str(uuid.uuid4())
        app_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        mock_doc = MagicMock(id=doc_id, application_id=app_id)
        mock_doc_qs.select_related.return_value.get.return_value = mock_doc

        with patch("apps.applications.models.Application.objects") as mock_app_qs:
            mock_app = MagicMock(user_id=user_id)
            mock_app_qs.get.return_value = mock_app
            # The authorized-document loader reads ``document.application``
            # directly (via ``select_related``); wire the owning application
            # onto the document so the owner check passes.
            mock_doc.application = mock_app

            with patch("apps.documents.tasks.extract_document_text_task") as mock_task:
                mock_task.delay.return_value = MagicMock(id="task-123")

                request = factory.post(f"/api/v1/documents/{doc_id}/extract/")
                request.user = MagicMock(id=user_id, role="student")
                request.data = {}

                response = DocumentExtractView().post(request, document_id=doc_id)

        self.assertEqual(response.status_code, 202)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["data"]["status"], "queued")


class TestPaymentReceiptEnvelope(SimpleTestCase):
    @patch("apps.documents.views.Payment.objects")
    def test_receipt_returns_envelope(self, mock_pay_qs):
        pay_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        mock_payment = MagicMock(
            id=pay_id, user_id=user_id, amount=150,
            currency="ZMW", status="successful",
            created_at=MagicMock(isoformat=lambda: "2026-01-01T00:00:00"),
            application_id=str(uuid.uuid4()),
        )
        mock_pay_qs.get.return_value = mock_payment

        with patch("apps.applications.models.Application.objects") as mock_app_qs:
            mock_app = MagicMock(
                application_number="APP-001", program="CS", full_name="Test User"
            )
            mock_app_qs.get.return_value = mock_app

            request = factory.get(f"/api/v1/payments/{pay_id}/receipt/")
            request.user = MagicMock(id=user_id, role="student")

            response = PaymentReceiptView().get(request, payment_id=pay_id)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        self.assertIn("payment_id", response.data["data"])
