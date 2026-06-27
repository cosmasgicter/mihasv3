"""
Bug 3 (HIGH) — Document/storage endpoints: Preservation tests.

Verifies that the existing upload and extract endpoints continue to work
identically after the new signed-url, download, info, and delete endpoints
were added. Uses SimpleTestCase with mocked DB.

**Validates: Requirements 3.6**
"""

import os
import uuid
from io import BytesIO
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from django.core.files.uploadedfile import SimpleUploadedFile  # noqa: E402
from rest_framework.test import APIRequestFactory, force_authenticate  # noqa: E402

from apps.documents.document_storage_views import DocumentExtractView, DocumentUploadView  # noqa: E402


def _make_auth_user(role="student", user_id=None):
    user = MagicMock()
    user.pk = user_id or uuid.uuid4()
    user.id = user.pk
    user.is_authenticated = True
    user.role = role
    return user


class TestUploadEndpointPreservation(SimpleTestCase):
    """POST /api/v1/documents/upload/ still works after Bug 3 changes.

    **Validates: Requirements 3.6**
    """

    def test_upload_accepts_valid_file(self):
        """Upload endpoint still creates a document record for valid input."""
        factory = APIRequestFactory()
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()

        file_content = b"%PDF-1.4 fake pdf content"
        upload_file = SimpleUploadedFile(
            "test.pdf", file_content, content_type="application/pdf"
        )

        request = factory.post(
            "/api/v1/documents/upload/",
            data={
                "file": upload_file,
                "document_type": "transcript",
                "application_id": str(app_id),
            },
            format="multipart",
        )
        user = _make_auth_user(user_id=user_id)
        force_authenticate(request, user=user)

        # Mock the Application lookup
        mock_app = MagicMock()
        mock_app.id = app_id
        mock_app.user_id = user_id
        mock_app.status = "draft"

        # Mock the created document
        mock_doc = MagicMock()
        mock_doc.id = uuid.uuid4()
        mock_doc.application_id = app_id
        mock_doc.document_type = "transcript"
        mock_doc.document_name = "test.pdf"
        mock_doc.file_url = "https://r2.example.com/test.pdf"
        mock_doc.file_size = len(file_content)
        mock_doc.mime_type = "application/pdf"
        mock_doc.verification_status = "pending"
        mock_doc.system_generated = False
        mock_doc.uploaded_at = "2025-01-15T10:00:00Z"
        mock_doc.created_at = "2025-01-15T10:00:00Z"
        mock_doc.updated_at = "2025-01-15T10:00:00Z"

        with patch("apps.applications.models.Application.objects") as mock_app_qs, \
             patch("apps.documents.document_storage_views.validate_file_magic_bytes"), \
             patch("apps.common.storage.MediaStorage") as mock_storage_cls, \
             patch("apps.documents.document_storage_views.ApplicationDocument.objects") as mock_doc_qs:
            mock_app_qs.get.return_value = mock_app
            mock_storage = MagicMock()
            mock_storage.save.return_value = "documents/saved.pdf"
            mock_storage.url.return_value = "https://r2.example.com/test.pdf"
            mock_storage_cls.return_value = mock_storage
            mock_doc_qs.create.return_value = mock_doc

            view = DocumentUploadView.as_view()
            response = view(request)

        self.assertEqual(response.status_code, 201)

    def test_upload_persists_application_document_url_fields(self):
        """Result slip and identity uploads update the application draft URLs."""
        factory = APIRequestFactory()
        user_id = uuid.uuid4()
        app_id = uuid.uuid4()

        for document_type, expected_field in (
            ("result_slip", "result_slip_url"),
            ("extra_kyc", "extra_kyc_url"),
        ):
            upload_file = SimpleUploadedFile(
                f"{document_type}.pdf",
                b"%PDF-1.4 fake pdf content",
                content_type="application/pdf",
            )
            request = factory.post(
                "/api/v1/documents/upload/",
                data={
                    "file": upload_file,
                    "document_type": document_type,
                    "application_id": str(app_id),
                },
                format="multipart",
            )
            force_authenticate(request, user=_make_auth_user(user_id=user_id))

            mock_app = MagicMock()
            mock_app.id = app_id
            mock_app.user_id = user_id
            mock_app.status = "draft"

            mock_doc = MagicMock()
            mock_doc.id = uuid.uuid4()
            mock_doc.application_id = app_id
            mock_doc.document_type = document_type
            mock_doc.document_name = f"{document_type}.pdf"
            mock_doc.file_url = f"https://r2.example.com/{document_type}.pdf"
            mock_doc.file_size = len(b"%PDF-1.4 fake pdf content")
            mock_doc.mime_type = "application/pdf"
            mock_doc.verification_status = "pending"
            mock_doc.system_generated = False
            mock_doc.uploaded_at = "2025-01-15T10:00:00Z"
            mock_doc.created_at = "2025-01-15T10:00:00Z"
            mock_doc.updated_at = "2025-01-15T10:00:00Z"

            with patch("apps.applications.models.Application.objects") as mock_app_qs, \
                 patch("apps.documents.document_storage_views.validate_file_magic_bytes"), \
                 patch("apps.common.storage.MediaStorage") as mock_storage_cls, \
                 patch("apps.documents.document_storage_views.ApplicationDocument.objects") as mock_doc_qs:
                mock_app_qs.filter.return_value.exists.return_value = True
                mock_app_qs.get.return_value = mock_app
                mock_storage = MagicMock()
                mock_storage.save.return_value = f"documents/{document_type}.pdf"
                mock_storage.url.return_value = mock_doc.file_url
                mock_storage_cls.return_value = mock_storage
                mock_doc_qs.create.return_value = mock_doc

                response = DocumentUploadView.as_view()(request)

            self.assertEqual(response.status_code, 201)
            self.assertEqual(getattr(mock_app, expected_field), mock_doc.file_url)
            mock_app.save.assert_called_once_with(update_fields=[expected_field, "updated_at"])

    def test_upload_rejects_missing_file(self):
        """Upload endpoint still returns 400 for missing file."""
        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/documents/upload/",
            data={"document_type": "transcript", "application_id": str(uuid.uuid4())},
            format="multipart",
        )
        user = _make_auth_user()
        force_authenticate(request, user=user)

        # The serializer's validate_application_id hits the DB, so mock it
        with patch("apps.applications.models.Application.objects") as mock_app_qs:
            mock_app_qs.filter.return_value.exists.return_value = True
            view = DocumentUploadView.as_view()
            response = view(request)

        self.assertEqual(response.status_code, 400)

    def test_upload_requires_authentication(self):
        """Upload endpoint still requires auth."""
        factory = APIRequestFactory()
        request = factory.post("/api/v1/documents/upload/", data={}, format="multipart")

        view = DocumentUploadView.as_view()
        response = view(request)

        self.assertIn(response.status_code, (401, 403))


class TestExtractEndpointPreservation(SimpleTestCase):
    """POST /api/v1/documents/{id}/extract/ still works after Bug 3 changes.

    **Validates: Requirements 3.6**
    """

    def test_extract_queues_task_for_valid_document(self):
        """Extract endpoint still enqueues a Celery task."""
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        app_id = uuid.uuid4()
        user_id = uuid.uuid4()

        request = factory.post(f"/api/v1/documents/{doc_id}/extract/")
        user = _make_auth_user(user_id=user_id)
        force_authenticate(request, user=user)

        mock_doc = MagicMock()
        mock_doc.id = doc_id
        mock_doc.application_id = app_id

        mock_app = MagicMock()
        mock_app.id = app_id
        mock_app.user_id = user_id
        # The authorized-document loader reads ``document.application`` directly
        # (via ``select_related``) rather than issuing a separate Application
        # query, so wire the owning application onto the document.
        mock_doc.application = mock_app

        mock_task = MagicMock()
        mock_task.id = "celery-task-id-123"

        with patch("apps.documents.document_storage_views.ApplicationDocument.objects") as mock_doc_qs, \
             patch("apps.applications.models.Application.objects") as mock_app_qs, \
             patch("apps.documents.tasks.extract_document_text_task") as mock_extract:
            mock_doc_qs.select_related.return_value.get.return_value = mock_doc
            mock_app_qs.get.return_value = mock_app
            mock_extract.delay.return_value = mock_task

            view = DocumentExtractView.as_view()
            response = view(request, document_id=doc_id)

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["data"]["status"], "queued")

    def test_extract_returns_404_for_missing_document(self):
        """Extract endpoint still returns 404 for nonexistent document."""
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.post(f"/api/v1/documents/{doc_id}/extract/")
        user = _make_auth_user()
        force_authenticate(request, user=user)

        from apps.documents.models import ApplicationDocument as RealModel

        with patch("apps.documents.document_storage_views.ApplicationDocument.objects") as mock_doc_qs:
            mock_doc_qs.select_related.return_value.get.side_effect = RealModel.DoesNotExist
            view = DocumentExtractView.as_view()
            response = view(request, document_id=doc_id)

        self.assertEqual(response.status_code, 404)

    def test_extract_requires_authentication(self):
        """Extract endpoint still requires auth."""
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.post(f"/api/v1/documents/{doc_id}/extract/")

        view = DocumentExtractView.as_view()
        response = view(request, document_id=doc_id)

        self.assertIn(response.status_code, (401, 403))
