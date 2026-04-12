"""
Bug 3 (HIGH) — Document/storage endpoints not backed by Django: Integration tests.

Tests that GET /documents/{id}/signed-url/, GET /documents/{id}/download/,
GET /documents/{id}/info/, and DELETE /documents/{id}/delete/ exist, return
non-404 for valid document IDs, and require authentication.

Uses SimpleTestCase with mocked DB to avoid requiring a live Postgres connection.

**Validates: Requirements 3.5**
"""

import os
import uuid
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from rest_framework.test import APIRequestFactory, force_authenticate  # noqa: E402

from apps.documents.views import (  # noqa: E402
    DocumentDeleteView,
    DocumentDownloadView,
    DocumentInfoView,
    DocumentSignedUrlView,
)


def _make_auth_user():
    """Create a mock authenticated user."""
    user = MagicMock()
    user.pk = uuid.uuid4()
    user.is_authenticated = True
    user.role = "student"
    return user


def _make_mock_document(doc_id=None):
    """Create a mock ApplicationDocument."""
    doc = MagicMock()
    doc.id = doc_id or uuid.uuid4()
    doc.document_name = "transcript.pdf"
    doc.document_type = "transcript"
    doc.file_url = "documents/app123/abc_transcript.pdf"
    doc.file_size = 102400
    doc.mime_type = "application/pdf"
    doc.verification_status = "pending"
    doc.uploaded_at = MagicMock()
    doc.uploaded_at.isoformat.return_value = "2025-01-15T10:00:00Z"
    doc.save = MagicMock()
    return doc


class TestDocumentSignedUrlEndpoint(SimpleTestCase):
    """Integration tests for GET /documents/{id}/signed-url/.

    **Validates: Requirements 3.5**
    """

    def test_signed_url_returns_url_for_valid_document(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.get(f"/api/v1/documents/{doc_id}/signed-url/")
        user = _make_auth_user()
        force_authenticate(request, user=user)

        mock_doc = _make_mock_document(doc_id)

        with patch("apps.documents.views.ApplicationDocument.objects") as mock_qs, \
             patch("apps.common.storage.generate_signed_url", return_value="https://r2.example.com/signed"):
            mock_qs.get.return_value = mock_doc
            view = DocumentSignedUrlView.as_view()
            response = view(request, document_id=doc_id)

        self.assertEqual(response.status_code, 200)
        self.assertIn("url", response.data)
        self.assertEqual(response.data["url"], "https://r2.example.com/signed")

    def test_signed_url_returns_404_for_missing_document(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.get(f"/api/v1/documents/{doc_id}/signed-url/")
        user = _make_auth_user()
        force_authenticate(request, user=user)

        from apps.documents.models import ApplicationDocument as RealModel

        with patch("apps.documents.views.ApplicationDocument.objects") as mock_qs:
            mock_qs.get.side_effect = RealModel.DoesNotExist
            view = DocumentSignedUrlView.as_view()
            response = view(request, document_id=doc_id)

        self.assertEqual(response.status_code, 404)

    def test_signed_url_requires_authentication(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.get(f"/api/v1/documents/{doc_id}/signed-url/")
        # No force_authenticate

        view = DocumentSignedUrlView.as_view()
        response = view(request, document_id=doc_id)

        self.assertIn(response.status_code, (401, 403))


class TestDocumentDownloadEndpoint(SimpleTestCase):
    """Integration tests for GET /documents/{id}/download/.

    **Validates: Requirements 3.5**
    """

    def test_download_redirects_for_valid_document(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.get(f"/api/v1/documents/{doc_id}/download/")
        user = _make_auth_user()
        force_authenticate(request, user=user)

        mock_doc = _make_mock_document(doc_id)

        with patch("apps.documents.views.ApplicationDocument.objects") as mock_qs, \
             patch("apps.common.storage.generate_signed_url", return_value="https://r2.example.com/download"):
            mock_qs.get.return_value = mock_doc
            view = DocumentDownloadView.as_view()
            response = view(request, document_id=doc_id)

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "https://r2.example.com/download")

    def test_download_returns_404_for_missing_document(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.get(f"/api/v1/documents/{doc_id}/download/")
        user = _make_auth_user()
        force_authenticate(request, user=user)

        from apps.documents.models import ApplicationDocument as RealModel

        with patch("apps.documents.views.ApplicationDocument.objects") as mock_qs:
            mock_qs.get.side_effect = RealModel.DoesNotExist
            view = DocumentDownloadView.as_view()
            response = view(request, document_id=doc_id)

        self.assertEqual(response.status_code, 404)

    def test_download_requires_authentication(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.get(f"/api/v1/documents/{doc_id}/download/")

        view = DocumentDownloadView.as_view()
        response = view(request, document_id=doc_id)

        self.assertIn(response.status_code, (401, 403))


class TestDocumentInfoEndpoint(SimpleTestCase):
    """Integration tests for GET /documents/{id}/info/.

    **Validates: Requirements 3.5**
    """

    def test_info_returns_metadata_for_valid_document(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.get(f"/api/v1/documents/{doc_id}/info/")
        user = _make_auth_user()
        force_authenticate(request, user=user)

        mock_doc = _make_mock_document(doc_id)

        with patch("apps.documents.views.ApplicationDocument.objects") as mock_qs:
            mock_qs.get.return_value = mock_doc
            view = DocumentInfoView.as_view()
            response = view(request, document_id=doc_id)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        data = response.data["data"]
        self.assertEqual(data["document_name"], "transcript.pdf")
        self.assertEqual(data["document_type"], "transcript")
        self.assertEqual(data["verification_status"], "pending")
        self.assertEqual(data["file_size"], 102400)
        self.assertEqual(data["mime_type"], "application/pdf")

    def test_info_returns_404_for_missing_document(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.get(f"/api/v1/documents/{doc_id}/info/")
        user = _make_auth_user()
        force_authenticate(request, user=user)

        from apps.documents.models import ApplicationDocument as RealModel

        with patch("apps.documents.views.ApplicationDocument.objects") as mock_qs:
            mock_qs.get.side_effect = RealModel.DoesNotExist
            view = DocumentInfoView.as_view()
            response = view(request, document_id=doc_id)

        self.assertEqual(response.status_code, 404)

    def test_info_requires_authentication(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.get(f"/api/v1/documents/{doc_id}/info/")

        view = DocumentInfoView.as_view()
        response = view(request, document_id=doc_id)

        self.assertIn(response.status_code, (401, 403))


class TestDocumentDeleteEndpoint(SimpleTestCase):
    """Integration tests for DELETE /documents/{id}/delete/.

    **Validates: Requirements 3.5**
    """

    def test_delete_soft_deletes_valid_document(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.delete(f"/api/v1/documents/{doc_id}/delete/")
        user = _make_auth_user()
        force_authenticate(request, user=user)

        mock_doc = _make_mock_document(doc_id)

        with patch("apps.documents.views.ApplicationDocument.objects") as mock_qs:
            mock_qs.get.return_value = mock_doc
            view = DocumentDeleteView.as_view()
            response = view(request, document_id=doc_id)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        mock_doc.save.assert_called_once()

    def test_delete_returns_404_for_missing_document(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.delete(f"/api/v1/documents/{doc_id}/delete/")
        user = _make_auth_user()
        force_authenticate(request, user=user)

        from apps.documents.models import ApplicationDocument as RealModel

        with patch("apps.documents.views.ApplicationDocument.objects") as mock_qs:
            mock_qs.get.side_effect = RealModel.DoesNotExist
            view = DocumentDeleteView.as_view()
            response = view(request, document_id=doc_id)

        self.assertEqual(response.status_code, 404)

    def test_delete_requires_authentication(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.delete(f"/api/v1/documents/{doc_id}/delete/")

        view = DocumentDeleteView.as_view()
        response = view(request, document_id=doc_id)

        self.assertIn(response.status_code, (401, 403))
