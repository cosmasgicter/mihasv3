"""R5 exploration: students and staff open the documents they may open.

Spec: student-journey-repair task 1.5, clauses 1.22-1.28 (design R5-d, R5-e,
R5-g, R5-h). Filename-free keys moved to task 1.4 (R4 fixes them); an unassigned
reviewer already gets the masked 404 at HEAD, so that case is preservation (i),
task 2.2.

* A non-owner student is answered 403 ``INSUFFICIENT_PERMISSIONS`` by the
  document list and the required-documents contract, which confirms the
  application exists. Every other surface answers the byte-identical 404.
* A reviewer assigned to an in-scope application is masked out of the document
  endpoints because they fall through ``IsOwnerOrAdmin``.
* An official-document signing failure is a WARNING and the envelope carries no
  code, so the UI reads it as "not ready".
* A slip issued before a status change is hidden from the student ("not
  requested") instead of served as historical.
* Presigned URLs carry no ``ResponseContentDisposition``.
"""
from __future__ import annotations

import json
import logging
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications import official_document_views as odv
from apps.applications.models import Application
from apps.catalog.services import AccessScopeService
from apps.documents.models import ApplicationDocument
from tests.tenant_fixtures import (
    build_document,
    build_membership,
    build_profile,
    build_tenant_world,
)

pytestmark = pytest.mark.django_db(transaction=True)

UNKNOWN_ID = "00000000-0000-4000-8000-000000000000"


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


@pytest.fixture(autouse=True)
def production_scope(monkeypatch):
    """Measure the real membership/grant model, never the test admin shortcut."""
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


def _normalised(response) -> dict:
    """The body without the per-request correlation id."""
    body = json.loads(response.content)
    body.pop("request_id", None)
    return body


# --- R5-g: one masked 404 for a non-owner (task 3.19; markers removed at 3.21) ---


@pytest.mark.parametrize("path", ["documents", "required-documents"])
def test_a_non_owner_student_gets_the_unknown_id_answer(path):
    world = build_tenant_world(application_status="draft")
    intruder = build_profile(role="student")
    client = _client(intruder)

    theirs = client.get(f"/api/v1/applications/{world.application.id}/{path}/")
    unknown = client.get(f"/api/v1/applications/{UNKNOWN_ID}/{path}/")

    # HEAD: 403 INSUFFICIENT_PERMISSIONS for the real id, 404 for the unknown one.
    assert theirs.status_code == unknown.status_code == 404, (
        theirs.status_code,
        unknown.status_code,
    )
    assert _normalised(theirs) == _normalised(unknown)


def test_an_assigned_in_scope_reviewer_can_open_a_document():
    world = build_tenant_world(application_status="submitted")
    reviewer = build_profile(role="reviewer")
    build_membership(
        user=reviewer,
        institution=world.institution,
        role="reviewer",
        permissions=["read", "review"],
    )
    Application.objects.filter(id=world.application.id).update(assigned_reviewer_id=reviewer.id)
    # Precondition (true at HEAD): the reviewer holds the tenant capability, so the
    # only thing standing between them and the document is the role-string branch.
    from apps.catalog.services import AdminCapabilityService

    held = AdminCapabilityService().get_institution_capabilities(reviewer, world.institution)
    assert "tenant.document.read" in held
    document = build_document(
        application=world.application,
        document_type="result_slip",
        file_url="documents/a/result_slip/k.pdf",
        storage_key="documents/a/result_slip/k.pdf",
        is_current=True,
    )

    with patch(
        "apps.common.storage.generate_signed_url",
        return_value="https://signed.test/documents/a/result_slip/k.pdf?X-Amz-Signature=x",
    ):
        response = _client(reviewer).get(f"/api/v1/documents/{document.id}/signed-url/")

    # HEAD: every reviewer is masked as not-found by the role-string branch.
    assert response.status_code == 200, response.content


# --- R5-d: a signing failure is not "not ready" (task 3.19) ----------------


def test_an_official_document_signing_failure_is_logged_at_error_with_a_code(caplog):
    document = SimpleNamespace(
        id=uuid.uuid4(),
        file_url="application-slips/abc/def.pdf",
        storage_key="application-slips/abc/def.pdf",
        uploaded_at=None,
        verification_notes=None,
    )
    application = SimpleNamespace(institution_ref_id=uuid.uuid4())

    with caplog.at_level(logging.DEBUG), patch(
        "apps.common.storage.generate_signed_url", side_effect=RuntimeError("signer down")
    ):
        data = odv._build_envelope(
            application, "application_slip", document=document, status_value="ready"
        )

    assert "download_url" not in data
    assert data.get("error_code") == "DOCUMENT_LINK_UNAVAILABLE"
    errors = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert any("sign" in r.getMessage().lower() for r in errors), (
        "a signing failure must be logged at ERROR, not WARNING"
    )


# --- R5-e: an issued slip survives a status change (task 3.19) -------------


def test_a_student_is_served_the_issued_slip_after_a_status_change():
    world = build_tenant_world(application_status="submitted")
    ApplicationDocument.objects.create(
        application=world.application,
        document_type="application_slip",
        document_name="application_slip.pdf",
        file_url="application-slips/x/y.pdf",
        storage_key="application-slips/x/y.pdf",
        file_size=2048,
        mime_type="application/pdf",
        system_generated=True,
        verification_status="verified",
        verification_notes=json.dumps({"official_document": {"fingerprint": "fp-issued"}}),
        uploaded_at=timezone.now(),
    )
    # The status is printed on the slip, so this retires its fingerprint.
    Application.objects.filter(id=world.application.id).update(status="under_review")

    with patch(
        "apps.common.storage.generate_signed_url",
        return_value="https://signed.test/application-slips/x/y.pdf?X-Amz-Signature=x",
    ):
        response = _client(world.student).get(
            f"/api/v1/applications/{world.application.id}/official-documents/application_slip/"
        )

    assert response.status_code == 200, response.content
    data = response.json()["data"]
    # HEAD: "not_requested" - the student is told to ask for a slip they hold.
    assert data["status"] == "ready"
    assert data["historical"] is True


# --- R5-h: Content-Disposition on presigned reads (task 3.19) --------------


def test_presign_parameters_include_a_content_disposition(monkeypatch):
    from apps.common import storage

    client = MagicMock()
    client.generate_presigned_url.return_value = "https://signed.test/x"
    monkeypatch.setattr(storage, "get_s3_client", lambda: client)
    if hasattr(storage, "get_presign_client"):
        monkeypatch.setattr(storage, "get_presign_client", lambda: client)

    storage.generate_signed_url("documents/a/result_slip/k.pdf", filename="My Result Slip.pdf")

    params = client.generate_presigned_url.call_args.kwargs["Params"]
    assert "ResponseContentDisposition" in params
    assert 'filename="My Result Slip.pdf"' in params["ResponseContentDisposition"]
