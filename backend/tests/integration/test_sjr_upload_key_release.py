"""R2 preservation/coverage for key release and header validation.

Spec: student-journey-repair task 3.5 (clauses 2.8, 2.9) review follow-up.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from apps.documents import document_evidence as evidence
from apps.documents.models import DocumentUploadStage
from tests.integration.test_sjr_upload_bug_conditions import (  # noqa: F401  (fixtures)
    PDF,
    UPLOAD_URL,
    _post,
    object_storage,
    upload_world,
)

pytestmark = pytest.mark.django_db(transaction=True)


def _stage(world, key: str) -> DocumentUploadStage:
    return DocumentUploadStage.objects.create(
        application_id=world.application.id,
        document_type="result_slip",
        object_key=f"applications/{world.application.id}/result_slip/obj.pdf",
        content_hash="a" * 64,
        idempotency_key=key,
        actor_id=world.student.id,
    )


@pytest.mark.parametrize(
    "state",
    [
        evidence.STAGE_COMPENSATED,
        evidence.STAGE_COMPENSATION_PENDING,
        evidence.STAGE_WRITE_FAILED,
        evidence.STAGE_ORPHANED,
    ],
)
def test_mark_stage_releases_key_for_every_uncommitted_end_state(upload_world, state):
    world, _client = upload_world
    stage = _stage(world, "release-key-0001")
    with patch.object(evidence, "emit_metric") as emit:
        evidence.mark_stage(stage, state, error="provider down")
    stage.refresh_from_db()
    assert stage.state == state
    assert stage.idempotency_key is None
    assert stage.content_hash == "a" * 64
    assert stage.object_key.endswith("obj.pdf")
    assert stage.actor_id == world.student.id
    emit.assert_called_once()
    assert emit.call_args.args[0] == evidence.EVENT_STAGE_IDEMPOTENCY_RELEASED


def test_committed_stage_keeps_its_key_for_replay(upload_world):
    world, _client = upload_world
    stage = _stage(world, "release-key-0002")
    with patch.object(evidence, "emit_metric") as emit:
        evidence.mark_stage(stage, evidence.STAGE_COMMITTED)
    stage.refresh_from_db()
    assert stage.idempotency_key == "release-key-0002"
    emit.assert_not_called()


@pytest.mark.parametrize("bad_key", ["short", "x" * 129, "has space in it", "semi;colon-key1"])
def test_malformed_idempotency_key_is_400_and_not_echoed(upload_world, object_storage, bad_key):
    world, client = upload_world
    response = _post(
        client, world, content=PDF, name="slip.pdf", content_type="application/pdf", key=bad_key
    )
    assert response.status_code == 400, response.content
    body = response.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert bad_key not in response.content.decode()
    object_storage.save.assert_not_called()


def test_missing_idempotency_key_still_uploads(upload_world, object_storage):
    world, client = upload_world
    response = _post(
        client, world, content=PDF, name="slip.pdf", content_type="application/pdf", key=None
    )
    assert response.status_code == 201, response.content
