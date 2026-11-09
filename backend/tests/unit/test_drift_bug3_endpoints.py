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


def _make_auth_user(user_id=None, role="student"):
    """Create a mock authenticated user."""
    user = MagicMock()
    user.pk = user_id or uuid.uuid4()
    user.id = user.pk
    user.is_authenticated = True
    user.role = role
    return user


def _make_mock_document(doc_id=None, owner_id=None, file_url="documents/app123/abc_transcript.pdf"):
    """Create a mock ApplicationDocument."""
    doc = MagicMock()
    doc.id = doc_id or uuid.uuid4()
    doc.application_id = uuid.uuid4()
    doc.document_name = "transcript.pdf"
    doc.document_type = "transcript"
    doc.file_url = file_url
    # No stored key: the helper falls back to file_url (SJR task 3.13).
    doc.storage_key = None
    doc.file_size = 102400
    doc.mime_type = "application/pdf"
    doc.verification_status = "pending"
    # An uploaded document is not system-generated, so it is not subject to the
    # official-document immutability gate (R4.1).
    doc.system_generated = False
    doc.uploaded_at = MagicMock()
    doc.uploaded_at.isoformat.return_value = "2025-01-15T10:00:00Z"
    doc.save = MagicMock()
    doc.application = MagicMock()
    doc.application.user_id = owner_id or uuid.uuid4()
    # A student may soft-delete their own document only while the application is
    # still editable (draft) per the existing editability policy (R4.2).
    doc.application.status = "draft"
    return doc


def _mock_document_lookup(mock_qs, document=None, side_effect=None):
    """Wire the document loader's lookups.

    SJR task 3.19 (R5-g): the loader is now ``resolve_owner_or_scoped_document``,
    which first asks ``queryset.filter(application__user_id=<actor>).get(id=...)``
    (the owner lookup) and only then the scoped lookup. The mock follows that
    shape: the owner lookup answers with ``document`` when the actor owns it and
    raises ``DoesNotExist`` otherwise; every 404, owner and envelope assertion in
    this module is unchanged. The scoped fallback is patched by ``_ScopedLookupMiss``.
    """
    from apps.documents.models import ApplicationDocument as RealModel

    base = mock_qs.select_related.return_value

    def _owner_lookup(*args, **kwargs):
        lookup = MagicMock()
        if side_effect is not None:
            lookup.get.side_effect = side_effect
        elif document is not None and str(kwargs.get("application__user_id")) == str(
            document.application.user_id
        ):
            lookup.get.return_value = document
        else:
            lookup.get.side_effect = RealModel.DoesNotExist
        return lookup

    base.filter.side_effect = _owner_lookup


class _ScopedLookupMiss(SimpleTestCase):
    """A non-owner has no tenant scope in these DB-free tests.

    The scoped fallback of ``resolve_owner_or_scoped_document`` reads
    memberships and grants, which a ``SimpleTestCase`` may not do, so it is
    patched to its real answer for an actor with no scope: the masked not-found.
    """

    def setUp(self):
        super().setUp()
        from rest_framework.exceptions import NotFound

        patcher = patch(
            "apps.common.tenant_authorization.resolve_scoped_document",
            side_effect=NotFound("Document not found"),
        )
        patcher.start()
        self.addCleanup(patcher.stop)


class TestDocumentSignedUrlEndpoint(_ScopedLookupMiss):
    """Integration tests for GET /documents/{id}/signed-url/.

    **Validates: Requirements 3.5**
    """

    def test_signed_url_returns_url_for_valid_document(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.get(f"/api/v1/documents/{doc_id}/signed-url/")
        user = _make_auth_user()
        force_authenticate(request, user=user)

        mock_doc = _make_mock_document(doc_id, owner_id=user.id)

        with patch("apps.documents.views.ApplicationDocument.objects") as mock_qs, \
             patch("apps.common.storage.generate_signed_url", return_value="https://r2.example.com/signed"):
            _mock_document_lookup(mock_qs, mock_doc)
            view = DocumentSignedUrlView.as_view()
            response = view(request, document_id=doc_id)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["data"]["url"], "https://r2.example.com/signed")

    def test_signed_url_returns_404_for_missing_document(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.get(f"/api/v1/documents/{doc_id}/signed-url/")
        user = _make_auth_user()
        force_authenticate(request, user=user)

        from apps.documents.models import ApplicationDocument as RealModel

        with patch("apps.documents.views.ApplicationDocument.objects") as mock_qs:
            _mock_document_lookup(mock_qs, side_effect=RealModel.DoesNotExist)
            view = DocumentSignedUrlView.as_view()
            response = view(request, document_id=doc_id)

        self.assertEqual(response.status_code, 404)

    def test_signed_url_forbidden_for_other_student_document(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.get(f"/api/v1/documents/{doc_id}/signed-url/")
        user = _make_auth_user()
        force_authenticate(request, user=user)

        mock_doc = _make_mock_document(doc_id, owner_id=uuid.uuid4())

        with patch("apps.documents.views.ApplicationDocument.objects") as mock_qs:
            _mock_document_lookup(mock_qs, mock_doc)
            view = DocumentSignedUrlView.as_view()
            response = view(request, document_id=doc_id)

        # Out-of-scope reads are masked as a byte-identical 404 not-found so
        # document existence cannot be inferred (R3.6, R4.3, Property 13).
        self.assertEqual(response.status_code, 404)

    def test_signed_url_passes_object_key_not_full_url(self):
        """SJR task 3.13 (clause 2.20). The old assertion signed a foreign
        ``cdn.example.com`` URL's path against our bucket, which is defect 1.18.
        A legacy-provider URL is now returned unchanged, while a presigned
        (``X-Amz-``) URL is still signed by its path."""
        factory = APIRequestFactory()
        user = _make_auth_user()
        legacy = "https://cdn.example.com/media/documents/app123/abc_transcript.pdf?signature=ignored"
        presigned = (
            "https://anyhost.example.net/media/documents/app123/abc_transcript.pdf"
            "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=old"
        )
        for file_url, expected_url, expected_key in (
            (legacy, legacy, None),
            (presigned, "https://r2.example.com/signed", "documents/app123/abc_transcript.pdf"),
        ):
            doc_id = uuid.uuid4()
            request = factory.get(f"/api/v1/documents/{doc_id}/signed-url/")
            force_authenticate(request, user=user)
            mock_doc = _make_mock_document(doc_id, owner_id=user.id, file_url=file_url)
            with patch("apps.documents.views.ApplicationDocument.objects") as mock_qs, \
                 patch("apps.common.storage.generate_signed_url", return_value="https://r2.example.com/signed") as mock_signed:
                _mock_document_lookup(mock_qs, mock_doc)
                view = DocumentSignedUrlView.as_view()
                response = view(request, document_id=doc_id)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["data"]["url"], expected_url)
            if expected_key is None:
                mock_signed.assert_not_called()
            else:
                # SJR task 3.19 (R5-h, clause 2.30): the signer is also told the
                # display name and disposition, because object keys carry no
                # client filename (R4-b). The old key-only call encoded the
                # defect (no ``ResponseContentDisposition``); the key argument is
                # asserted exactly as before.
                mock_signed.assert_called_once_with(
                    expected_key,
                    filename="transcript.pdf",
                    disposition="inline",
                    content_type="application/pdf",
                )

    def test_signed_url_requires_authentication(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.get(f"/api/v1/documents/{doc_id}/signed-url/")
        # No force_authenticate

        view = DocumentSignedUrlView.as_view()
        response = view(request, document_id=doc_id)

        self.assertIn(response.status_code, (401, 403))


class TestDocumentDownloadEndpoint(_ScopedLookupMiss):
    """Integration tests for GET /documents/{id}/download/.

    **Validates: Requirements 3.5**
    """

    def test_download_redirects_for_valid_document(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.get(f"/api/v1/documents/{doc_id}/download/")
        user = _make_auth_user()
        force_authenticate(request, user=user)

        mock_doc = _make_mock_document(doc_id, owner_id=user.id)

        with patch("apps.documents.views.ApplicationDocument.objects") as mock_qs, \
             patch("apps.common.storage.generate_signed_url", return_value="https://r2.example.com/download"):
            _mock_document_lookup(mock_qs, mock_doc)
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
            _mock_document_lookup(mock_qs, side_effect=RealModel.DoesNotExist)
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


class TestDocumentInfoEndpoint(_ScopedLookupMiss):
    """Integration tests for GET /documents/{id}/info/.

    **Validates: Requirements 3.5**
    """

    def test_info_returns_metadata_for_valid_document(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.get(f"/api/v1/documents/{doc_id}/info/")
        user = _make_auth_user()
        force_authenticate(request, user=user)

        mock_doc = _make_mock_document(doc_id, owner_id=user.id)

        with patch("apps.documents.views.ApplicationDocument.objects") as mock_qs:
            _mock_document_lookup(mock_qs, mock_doc)
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
            _mock_document_lookup(mock_qs, side_effect=RealModel.DoesNotExist)
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


class TestDocumentDeleteEndpoint(_ScopedLookupMiss):
    """Integration tests for DELETE /documents/{id}/delete/.

    **Validates: Requirements 3.5**
    """

    def test_delete_soft_deletes_valid_document(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.delete(f"/api/v1/documents/{doc_id}/delete/")
        user = _make_auth_user()
        force_authenticate(request, user=user)

        mock_doc = _make_mock_document(doc_id, owner_id=user.id)

        # Admissions-v2 task 7.3 (R11.7-R11.8, STU-19) moved this command onto the
        # document-evidence lifecycle: the view no longer soft-deletes the row
        # itself, it calls ``document_evidence.delete_document``, which opens a
        # transaction, records an immutable ``DocumentVerificationEvent``, and
        # decides whether the stored object is retained. That service is imported
        # inside ``delete``, so patching the model manager the *old* inline
        # implementation used no longer neutralises the write — the real service
        # reached for a database this ``SimpleTestCase`` has none of, which is the
        # 500. Patch the seam that replaced the inline delete, exactly as 13.6 §5.3
        # did for ``test_interview_status_validation.py``.
        #
        # ``mock_doc.save`` remains the assertion below and still means "the command
        # wrote this document": the service is the writer now, and the two added
        # assertions pin that the view handed *this* document to it. The lifecycle's
        # own behaviour — immutable history, object retention, and the legacy
        # ``result_slip_url`` projection being cleared — is proven against real rows
        # by ``tests/integration/test_document_evidence_compensation_7_3.py``.
        with patch("apps.documents.views.ApplicationDocument.objects") as mock_qs, \
             patch("apps.documents.document_evidence.delete_document") as mock_delete:
            _mock_document_lookup(mock_qs, mock_doc)
            mock_delete.side_effect = lambda *, document, **kwargs: document.save()
            view = DocumentDeleteView.as_view()
            response = view(request, document_id=doc_id)

        mock_delete.assert_called_once()
        assert mock_delete.call_args.kwargs["document"] is mock_doc
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
            _mock_document_lookup(mock_qs, side_effect=RealModel.DoesNotExist)
            view = DocumentDeleteView.as_view()
            response = view(request, document_id=doc_id)

        self.assertEqual(response.status_code, 404)

    def test_delete_forbidden_for_other_student_document(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.delete(f"/api/v1/documents/{doc_id}/delete/")
        user = _make_auth_user()
        force_authenticate(request, user=user)

        mock_doc = _make_mock_document(doc_id, owner_id=uuid.uuid4())

        with patch("apps.documents.views.ApplicationDocument.objects") as mock_qs:
            _mock_document_lookup(mock_qs, mock_doc)
            view = DocumentDeleteView.as_view()
            response = view(request, document_id=doc_id)

        # Out-of-scope reads are masked as a byte-identical 404 not-found so
        # document existence cannot be inferred (R3.6, R4.3, Property 13).
        self.assertEqual(response.status_code, 404)
        mock_doc.save.assert_not_called()

    def test_delete_requires_authentication(self):
        factory = APIRequestFactory()
        doc_id = uuid.uuid4()
        request = factory.delete(f"/api/v1/documents/{doc_id}/delete/")

        view = DocumentDeleteView.as_view()
        response = view(request, document_id=doc_id)

        self.assertIn(response.status_code, (401, 403))
