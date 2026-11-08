"""R2 exploration: server-side upload acceptance.

Spec: student-journey-repair task 1.2, clauses 1.8 and 1.9 (design R2-b, R2-c).

* A retry that carries the key of an attempt that ended uncommitted (storage
  write failed, stage compensated) is answered 409 ``DOCUMENT_UPLOAD_IN_PROGRESS``
  forever, because ``mark_stage`` never clears the key and ``open_stage`` trips the
  unique index.
* The declared type is checked before the magic bytes, so a valid PDF declared
  ``application/octet-stream`` and a JPEG declared ``image/jpg`` are refused.
* A malformed ``Idempotency-Key`` is accepted without validation.

Storage is mocked at the provider boundary only, the same double the task 7.3
endpoint tests use. Counterexamples are recorded from ``--runxfail``.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from apps.documents.models import ApplicationDocument, DocumentUploadStage
from tests.tenant_fixtures import build_tenant_world

pytestmark = pytest.mark.django_db(transaction=True)

UPLOAD_URL = "/api/v1/documents/upload/"
PDF = b"%PDF-1.7\nsjr exploration payload\n%%EOF"
# Smallest well-formed JPEG header + body + EOI; the validators read the signature.
JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00sjr payload\xff\xd9"


def _client(profile) -> APIClient:
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(profile.id),
                "email": profile.email,
                "role": profile.role,
                "first_name": profile.first_name,
                "last_name": profile.last_name,
                "token_type": "access",
            }
        )
    )
    return client


@pytest.fixture()
def upload_world():
    DocumentUploadStage.objects.all().delete()
    world = build_tenant_world(application_status="draft")
    Application.objects.filter(id=world.application.id).update(
        payment_status="verified",
        requirements_snapshot=[
            {
                "document_type": "result_slip",
                "label": "Grade 12 result slip",
                "required": True,
                "rules": {
                    "accepted_mime_types": ["application/pdf", "image/jpeg", "image/png"]
                },
            }
        ],
        configuration_version="cfg-sjr-r2",
    )
    world.application.refresh_from_db()
    return world, _client(world.student)


@pytest.fixture()
def object_storage():
    with patch("apps.common.storage.MediaStorage") as storage_cls:
        storage = MagicMock()
        storage.save.side_effect = lambda key, file_obj: key
        storage.url.side_effect = lambda key: f"https://r2.test/{key}"
        storage.delete.return_value = None
        storage_cls.return_value = storage
        yield storage


def _post(client, world, *, content: bytes, name: str, content_type: str, key: str | None):
    extra = {"HTTP_IDEMPOTENCY_KEY": key} if key is not None else {}
    return client.post(
        UPLOAD_URL,
        {
            "file": SimpleUploadedFile(name, content, content_type=content_type),
            "application_id": str(world.application.id),
            "document_type": "result_slip",
        },
        format="multipart",
        **extra,
    )


def test_retry_with_the_key_of_a_compensated_attempt_is_accepted(upload_world, object_storage):
    world, client = upload_world
    key = "retry-after-failed-write-0001"

    object_storage.save.side_effect = RuntimeError("provider is down")
    failed = _post(client, world, content=PDF, name="slip.pdf", content_type="application/pdf", key=key)
    assert failed.status_code == 500, failed.content
    assert failed.json()["code"] == "STORAGE_ERROR"

    object_storage.save.side_effect = lambda k, f: k
    retry = _post(client, world, content=PDF, name="slip.pdf", content_type="application/pdf", key=key)

    # HEAD: 409 DOCUMENT_UPLOAD_IN_PROGRESS, every time, for the life of the row.
    assert retry.status_code == 201, retry.content
    assert ApplicationDocument.objects.filter(
        application_id=world.application.id, document_type="result_slip", is_current=True
    ).count() == 1


def test_valid_pdf_declared_octet_stream_is_accepted_and_detected_type_recorded(
    upload_world, object_storage
):
    world, client = upload_world
    response = _post(
        client, world, content=PDF, name="scan.pdf", content_type="application/octet-stream", key=None
    )

    assert response.status_code == 201, response.content
    document = ApplicationDocument.objects.get(id=response.json()["data"]["id"])
    assert document.mime_type == "application/pdf"


def test_jpeg_declared_image_jpg_is_accepted_and_detected_type_recorded(upload_world, object_storage):
    world, client = upload_world
    response = _post(
        client, world, content=JPEG, name="photo.jpg", content_type="image/jpg", key=None
    )

    assert response.status_code == 201, response.content
    document = ApplicationDocument.objects.get(id=response.json()["data"]["id"])
    assert document.mime_type == "image/jpeg"


@pytest.mark.parametrize(
    "bad_key",
    [
        "short",  # fewer than 8 characters
        "has spaces in the middle",
        "semi;colon-and-<script>",
        "k" * 129,  # one over the 128 limit
    ],
)
def test_malformed_idempotency_key_is_refused_without_echo(upload_world, object_storage, bad_key):
    world, client = upload_world
    response = _post(
        client, world, content=PDF, name="slip.pdf", content_type="application/pdf", key=bad_key
    )

    assert response.status_code == 400, response.content
    body = response.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert "Idempotency-Key" in body["details"]
    assert bad_key not in response.content.decode()
    object_storage.save.assert_not_called()
