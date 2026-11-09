"""R3 exploration: OCR has a pending state and a missing-job signal.

Spec: student-journey-repair task 1.3, clause 1.14 (design R3-c, DEC-2).

At HEAD ``POST /documents/{id}/extract/`` enqueues and returns 202 without
recording that a job exists, so ``/info/`` reports ``ocr_state: null`` for both
"queued" and "never started", and the client polls blindly. A broker failure is
an unhandled 500. The task's no-file path returns without a terminal state.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.documents.models import ApplicationDocument
from tests.tenant_fixtures import build_document, build_tenant_world

pytestmark = pytest.mark.django_db(transaction=True)


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
def owned_document():
    world = build_tenant_world(application_status="draft")
    document = build_document(application=world.application, document_type="result_slip")
    return world, document


def test_extract_records_pending_and_info_reports_ocr_pending(owned_document):
    world, document = owned_document
    client = _client(world.student)

    with patch("apps.documents.tasks.extract_document_text_task.delay") as delay:
        delay.return_value = MagicMock(id="task-1")
        response = client.post(f"/api/v1/documents/{document.id}/extract/", {}, format="json")

    assert response.status_code == 202, response.content
    document.refresh_from_db()
    assert document.extraction_state == "pending"
    info = client.get(f"/api/v1/documents/{document.id}/info/")
    assert info.status_code == 200, info.content
    assert info.json()["data"]["ocr_state"] == "ocr_pending"


def test_broker_failure_is_a_retryable_503_and_restores_the_state(owned_document):
    world, document = owned_document
    client = _client(world.student, raise_request_exception=False)

    with patch(
        "apps.documents.tasks.extract_document_text_task.delay",
        side_effect=ConnectionError("broker unreachable"),
    ):
        response = client.post(f"/api/v1/documents/{document.id}/extract/", {}, format="json")

    assert response.status_code == 503, response.content
    body = response.json()
    assert body["code"] == "OCR_QUEUE_UNAVAILABLE"
    assert body["retryable"] is True
    document.refresh_from_db()
    assert document.extraction_state is None  # restored, not left pending


def test_task_with_no_file_records_ocr_failed(owned_document):
    from apps.documents.tasks import extract_document_text_task

    _, document = owned_document
    assert not (document.file_url or document.storage_key)

    extract_document_text_task.apply(args=(str(document.id),))

    stored = ApplicationDocument.objects.get(id=document.id)
    # HEAD returns without a terminal state, so a client would wait forever.
    assert stored.extraction_state == "ocr_failed"
