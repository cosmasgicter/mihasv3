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

import pytest

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
            # SJR task 3.19: the loader's owner lookup is
            # ``queryset.filter(application__user_id=...).get(...)``.
            mock_doc_qs.select_related.return_value.filter.return_value.get.return_value = mock_doc
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

        from rest_framework.exceptions import NotFound

        # SJR task 3.19: owner lookup misses, and the scoped fallback (which reads
        # memberships, not allowed in a SimpleTestCase) answers as for an actor
        # with no scope: the masked not-found.
        with patch("apps.documents.document_storage_views.ApplicationDocument.objects") as mock_doc_qs, \
             patch("apps.common.tenant_authorization.resolve_scoped_document", side_effect=NotFound("Document not found")):
            mock_doc_qs.select_related.return_value.filter.return_value.get.side_effect = RealModel.DoesNotExist
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


# ---------------------------------------------------------------------------
# The legacy ``applications.*_url`` projection — proven against REAL rows
# ---------------------------------------------------------------------------
#
# This claim used to be made from the ``SimpleTestCase`` class above with a
# blanket ``patch(...ApplicationDocument.objects)``. Admissions-v2 task 7.3
# (R11.7-R11.8, STU-19) then put the document-evidence lifecycle in front of the
# write: before creating a version the upload command asks
# ``find_replay_by_idempotency_key`` / ``find_identical_current_version`` whether
# this command already produced evidence. Those lookups run through the same
# manager, so a blanket MagicMock answered "yes, a replay exists" — the view
# correctly returned that replay with a 201 and never reached the legacy
# projection, and the assertion read a MagicMock attribute. The replay branch is
# right (it is what makes the upload idempotent); the mock was too permissive to
# express "this is a first upload".
#
# Reproducing the whole lifecycle under mocks would need the stage ledger, the
# object verification and the metadata commit neutralised too — more mock, and a
# test that asserts a line of code exists. So the claim is made where it is
# actually decidable: real rows, with one deterministic double at the object-store
# boundary, which is the shape task 7.3's own endpoint evidence uses
# (``tests/integration/test_document_evidence_compensation_7_3.py``). The claim,
# the endpoint and both document types are unchanged.


@pytest.fixture()
def _mirror_world():
    """A draft application whose contract accepts both mirrored document types."""
    from apps.applications.models import Application as _Application
    from apps.documents.models import DocumentUploadStage

    from tests.tenant_fixtures import build_tenant_world

    # ``document_upload_stages`` is unmanaged, so pytest-django's flush leaves its
    # rows behind and the global reconciliation sweeper would see them mid-test.
    DocumentUploadStage.objects.all().delete()
    world = build_tenant_world(application_status="draft")
    _Application.objects.filter(id=world.application.id).update(
        payment_status="verified",
        requirements_snapshot=[
            {
                "document_type": document_type,
                "label": label,
                "required": True,
                "rules": {"accepted_mime_types": ["application/pdf"]},
            }
            for document_type, label in (
                ("result_slip", "Grade 12 result slip"),
                ("extra_kyc", "Identity document"),
            )
        ],
        configuration_version="cfg-m8-mirror",
    )
    world.application.refresh_from_db()
    return world


@pytest.fixture()
def _object_store():
    """One deterministic object-store double at the provider boundary only."""
    with patch("apps.common.storage.MediaStorage") as storage_cls:
        storage = MagicMock()
        storage.save.side_effect = lambda key, file_obj: key
        storage.url.side_effect = lambda key: f"https://r2.test/{key}"
        storage.delete.return_value = None
        storage_cls.return_value = storage
        yield storage


@pytest.mark.django_db(transaction=True)
def test_upload_persists_application_document_url_fields(_mirror_world, _object_store):
    """Result slip and identity uploads update the application draft URLs."""
    from rest_framework.test import APIClient

    from apps.accounts.authentication import JWTUser

    world = _mirror_world
    student = world.student
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(student.id),
                "email": student.email,
                "role": student.role,
                "first_name": student.first_name,
                "last_name": student.last_name,
                "token_type": "access",
            }
        )
    )

    for document_type, expected_field in (
        ("result_slip", "result_slip_url"),
        ("extra_kyc", "extra_kyc_url"),
    ):
        response = client.post(
            "/api/v1/documents/upload/",
            {
                "file": SimpleUploadedFile(
                    f"{document_type}.pdf",
                    b"%PDF-1.7\n" + document_type.encode() + b"\n%%EOF",
                    content_type="application/pdf",
                ),
                "application_id": str(world.application.id),
                "document_type": document_type,
            },
            format="multipart",
            HTTP_IDEMPOTENCY_KEY=f"m8-mirror-{document_type}",
        )
        assert response.status_code == 201, (document_type, response.content)

        world.application.refresh_from_db()
        mirrored = getattr(world.application, expected_field)
        assert mirrored, (document_type, expected_field, mirrored)
        # The projection names the version that was just committed, not a stale
        # one. SJR task 3.14 (design R4-b, clause 2.19): it holds that document's
        # id; it used to hold the persisted URL, which file_url no longer is now
        # that file_url is signed on read (task 3.13).
        assert mirrored == response.json()["data"]["id"], (
            document_type,
            expected_field,
            mirrored,
        )
