"""R4 exploration: store keys, not expiring links.

Spec: student-journey-repair task 1.4, clauses 1.16, 1.17, 1.18, 1.20
(design R4-a, R4-b, R4-c).

At HEAD every document writer persists ``storage.url()`` (a 15-minute presigned
URL) into ``file_url`` and into the application's snapshot column; the
``varchar(500)`` snapshot overflows for long names *after* the version has
committed; the legacy reader cannot tell a presence marker from a link; and new
object keys carry the client's filename.

Storage is replaced at the provider boundary only, by a real filesystem storage
whose ``url()`` returns what the S3 backend returns: a presigned URL. A row with
only a presigned ``file_url`` and no ``storage_key`` already opens at HEAD, so
that case is preservation property (h), task 2.2, not an exploration case.
"""
from __future__ import annotations

import uuid
from urllib.parse import quote
from unittest.mock import patch

import pytest
from django.core.files.storage import InMemoryStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from apps.documents.models import ApplicationDocument, DocumentUploadStage
from tests.tenant_fixtures import build_document, build_tenant_world

pytestmark = pytest.mark.django_db(transaction=True)

UPLOAD_URL = "/api/v1/documents/upload/"
PDF = b"%PDF-1.7\nsjr keys payload\n%%EOF"
SIGNATURE = "a1b2c3d4" * 8


def _presigned(name: str) -> str:
    return (
        f"https://r2.test/mihas-bucket/media/{quote(name, safe='/')}"
        "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAFAKE%2F20261108%2Fauto%2Fs3%2Faws4_request"
        "&X-Amz-Date=20261108T120000Z&X-Amz-Expires=900&X-Amz-SignedHeaders=host"
        f"&X-Amz-Signature={SIGNATURE}"
    )


def _client(profile, **kwargs) -> APIClient:
    client = APIClient(**kwargs)
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
def provider_storage(monkeypatch):
    """One in-memory object store that answers ``url()`` like S3 does: presigned.

    In memory rather than on disk because an S3 key may be up to 1024 bytes while
    a filesystem component is capped at 255, so a disk-backed double would fail
    for a reason production never has.
    """

    class PresigningStorage(InMemoryStorage):
        def url(self, name):  # mirrors S3Boto3Storage.url
            return _presigned(name)

    shared = PresigningStorage()
    monkeypatch.setattr("apps.common.storage.MediaStorage", lambda *a, **k: shared)
    yield shared


@pytest.fixture()
def world_with_contract():
    """A draft application whose contract accepts result slip, NRC and passport."""
    DocumentUploadStage.objects.all().delete()
    world = build_tenant_world(application_status="draft")
    pdf_rules = {"accepted_mime_types": ["application/pdf"]}
    Application.objects.filter(id=world.application.id).update(
        payment_status="verified",
        requirements_snapshot=[
            {"document_type": "result_slip", "label": "Result slip", "required": True, "rules": pdf_rules},
            {"document_type": "nrc", "label": "NRC", "required": True, "rules": pdf_rules},
            {"document_type": "passport", "label": "Passport", "required": False, "rules": pdf_rules},
        ],
        configuration_version="cfg-sjr-r4",
    )
    world.application.refresh_from_db()
    return world, _client(world.student, raise_request_exception=False)


def _upload(client, world, *, name="slip.pdf", document_type="result_slip", key=None):
    extra = {"HTTP_IDEMPOTENCY_KEY": key} if key else {}
    return client.post(
        UPLOAD_URL,
        {
            "file": SimpleUploadedFile(name, PDF, content_type="application/pdf"),
            "application_id": str(world.application.id),
            "document_type": document_type,
        },
        format="multipart",
        **extra,
    )


def _list(client, application_id):
    response = client.get(f"/api/v1/applications/{application_id}/documents/")
    assert response.status_code == 200, response.content
    return response.json()["data"]


# --- R4-a: keys persisted, URLs signed at read time (task 3.13) ------------


@pytest.mark.xfail(strict=True, reason="SJR R4: fixed in task 3.13")
def test_upload_persists_a_key_not_a_presigned_url(world_with_contract, provider_storage):
    world, client = world_with_contract

    response = _upload(client, world)

    assert response.status_code == 201, response.content
    document = ApplicationDocument.objects.get(id=response.json()["data"]["id"])
    assert "X-Amz-" not in (document.file_url or ""), "file_url holds a presigned URL"
    assert document.file_url == document.storage_key
    world.application.refresh_from_db()
    assert "X-Amz-" not in (world.application.result_slip_url or "")


@pytest.mark.xfail(strict=True, reason="SJR R4: fixed in task 3.13")
def test_condition_evidence_persists_a_key(provider_storage, tenant_world):
    from datetime import timedelta

    from django.utils import timezone

    from apps.applications import condition_evidence_service as conditions
    from apps.applications.models import ApplicationCondition

    now = timezone.now()
    condition = ApplicationCondition.objects.create(
        id=uuid.uuid4(),
        application=tenant_world.application,
        description="Certified copy of your final transcript",
        condition_type="document",
        deadline=(now + timedelta(days=30)).date(),
        status=conditions.CONDITION_OPEN,
        created_at=now,
        updated_at=now,
    )
    png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06"
        b"\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf\xc0\x00\x00\x03"
        b"\x01\x01\x00\x18\xdd\x8d\xb0\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    response = _client(tenant_world.student).post(
        f"/api/v1/applications/{tenant_world.application.id}/conditions/{condition.id}/evidence/",
        {"file": SimpleUploadedFile("transcript.png", png, content_type="image/png")},
        format="multipart",
    )

    assert response.status_code == 201, response.content
    stored = ApplicationDocument.objects.get(
        application_id=tenant_world.application.id, is_current=True
    )
    assert "X-Amz-" not in (stored.file_url or "")
    assert stored.file_url == stored.storage_key


@pytest.mark.xfail(strict=True, reason="SJR R4: fixed in task 3.13")
def test_generated_official_document_persists_a_key(provider_storage):
    from apps.applications.tasks.pdf_generation import _generate_official_document_task

    world = build_tenant_world(application_status="submitted")

    class _Task:
        max_retries = 3

        class request:
            retries = 0

    _generate_official_document_task(_Task(), str(world.application.id), "application_slip")

    stored = ApplicationDocument.objects.get(
        application_id=world.application.id, document_type="application_slip", is_current=True
    )
    assert "X-Amz-" not in (stored.file_url or "")
    assert stored.file_url == stored.storage_key


@pytest.mark.xfail(strict=True, reason="SJR R4: fixed in task 3.13")
def test_the_document_list_signs_file_url_at_read_time(world_with_contract):
    world, client = world_with_contract
    row = build_document(
        application=world.application,
        document_type="result_slip",
        file_url="documents/app/result_slip/abc.pdf",
        storage_key="documents/app/result_slip/abc.pdf",
        is_current=True,
    )

    def fake_sign(key, *args, **kwargs):
        return f"https://signed.test/{key}?X-Amz-Signature=fresh"

    with patch("apps.common.storage.generate_signed_url", side_effect=fake_sign):
        rows = _list(client, world.application.id)

    listed = next(item for item in rows if item["id"] == str(row.id))
    # HEAD publishes the stored value unchanged: a raw key, never a usable link.
    assert listed["file_url"] == "https://signed.test/documents/app/result_slip/abc.pdf?X-Amz-Signature=fresh"


# --- R4-c: legacy values (task 3.13) --------------------------------------


@pytest.mark.xfail(strict=True, reason="SJR R4: fixed in task 3.13")
def test_a_legacy_provider_url_is_returned_unchanged(world_with_contract):
    world, client = world_with_contract
    legacy = "https://legacy-files.example.org/uploads/old-slip.pdf"
    row = build_document(
        application=world.application,
        document_type="result_slip",
        file_url=legacy,
        storage_key=None,
        is_current=True,
    )

    with patch(
        "apps.common.storage.generate_signed_url",
        side_effect=lambda key, *a, **k: f"https://signed.test/{key}?X-Amz-Signature=x",
    ):
        response = client.get(f"/api/v1/documents/{row.id}/signed-url/")

    assert response.status_code == 200, response.content
    # HEAD derives the key "uploads/old-slip.pdf" from the foreign URL's path and
    # signs it against OUR bucket, which cannot have that object.
    assert response.json()["data"]["url"] == legacy


@pytest.mark.xfail(strict=True, reason="SJR R4: fixed in task 3.13")
def test_a_bare_uuid_snapshot_never_reaches_signing(world_with_contract):
    world, client = world_with_contract
    marker = str(uuid.uuid4())
    Application.objects.filter(id=world.application.id).update(extra_kyc_url=marker)
    signed_keys: list[str] = []

    def record(key, *args, **kwargs):
        signed_keys.append(str(key))
        return f"https://signed.test/{key}"

    with patch("apps.common.storage.generate_signed_url", side_effect=record):
        rows = _list(client, world.application.id)

    assert marker not in signed_keys, "a presence marker was treated as an object key"
    assert not [item for item in rows if item.get("is_legacy_synthetic")]


# --- R4-b: snapshot in the version transaction (task 3.14) -----------------


@pytest.mark.xfail(strict=True, reason="SJR R4: fixed in task 3.14")
def test_the_snapshot_holds_the_document_id(world_with_contract, provider_storage):
    world, client = world_with_contract

    response = _upload(client, world)

    assert response.status_code == 201, response.content
    world.application.refresh_from_db()
    assert world.application.result_slip_url == response.json()["data"]["id"]


@pytest.mark.xfail(strict=True, reason="SJR R4: fixed in task 3.14")
def test_a_255_character_name_succeeds_on_the_first_attempt(world_with_contract, provider_storage):
    world, client = world_with_contract
    name = ("Résumé ñ " * 40)[:251] + ".pdf"
    assert len(name) == 255

    response = _upload(client, world, name=name, key="long-name-first-try-1")

    # HEAD: the version commits, then the varchar(500) snapshot write raises and
    # the view answers 500 for a document that exists.
    assert response.status_code == 201, response.content
    world.application.refresh_from_db()
    assert world.application.result_slip_url


@pytest.mark.xfail(strict=True, reason="SJR R4: fixed in task 3.14")
def test_new_object_keys_contain_no_filename(world_with_contract, provider_storage):
    world, client = world_with_contract

    response = _upload(client, world, name="my private transcript.pdf")

    assert response.status_code == 201, response.content
    document = ApplicationDocument.objects.get(id=response.json()["data"]["id"])
    stage = DocumentUploadStage.objects.get(document_id=document.id)
    for key in (document.storage_key, stage.object_key):
        assert "transcript" not in key.lower()
        assert key.startswith(f"documents/{world.application.id}/result_slip/")
        assert key.endswith(".pdf")


# --- R4-b: an id-aware legacy reader (task 3.14) ---------------------------


@pytest.mark.xfail(strict=True, reason="SJR R4: fixed in task 3.14")
def test_an_nrc_document_with_an_id_snapshot_lists_once_and_no_phantom_row(world_with_contract):
    world, client = world_with_contract
    nrc = build_document(
        application=world.application,
        document_type="nrc",
        file_url="documents/app/nrc/1.pdf",
        storage_key="documents/app/nrc/1.pdf",
        is_current=True,
    )
    Application.objects.filter(id=world.application.id).update(extra_kyc_url=str(nrc.id))

    with patch("apps.common.storage.generate_signed_url", return_value="https://signed.test/x"):
        rows = _list(client, world.application.id)

    identity = [item for item in rows if item["document_type"] in ("nrc", "extra_kyc")]
    assert [item["id"] for item in identity] == [str(nrc.id)]
    assert not [item for item in rows if item.get("is_legacy_synthetic")]


@pytest.mark.xfail(strict=True, reason="SJR R4: fixed in task 3.14")
def test_removing_the_newest_identity_document_leaves_no_synthetic_row(
    world_with_contract, provider_storage
):
    world, client = world_with_contract
    older = build_document(
        application=world.application,
        document_type="nrc",
        file_url="documents/app/nrc/older.pdf",
        storage_key="documents/app/nrc/older.pdf",
        is_current=True,
    )
    newer = build_document(
        application=world.application,
        document_type="passport",
        file_url="documents/app/passport/newer.pdf",
        storage_key="documents/app/passport/newer.pdf",
        is_current=True,
    )
    Application.objects.filter(id=world.application.id).update(extra_kyc_url=str(newer.id))

    removed = client.delete(
        f"/api/v1/documents/{newer.id}/delete/",
        {"reason": "wrong evidence selected"},
        format="json",
    )
    assert removed.status_code == 200, removed.content

    with patch("apps.common.storage.generate_signed_url", return_value="https://signed.test/x"):
        rows = _list(client, world.application.id)

    assert [item["id"] for item in rows if item["document_type"] in ("nrc", "passport")] == [
        str(older.id)
    ]
    # HEAD re-signs the removed file as a synthetic "Identity Support Document".
    assert not [item for item in rows if item.get("is_legacy_synthetic")]
