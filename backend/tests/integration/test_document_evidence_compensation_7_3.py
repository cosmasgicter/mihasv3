"""Endpoint evidence for immutable document versions and storage compensation.

Spec:         admissions-v2-canonical-rebuild task 7.3
Requirements: R11.7-R11.8, R17.1-R17.4
Finding:      STU-19

These tests inject failures at the real upload command boundary: object storage
has accepted the bytes, then the metadata transaction fails. They prove that the
prior current version remains authoritative, the staged object is compensated,
and a failed compensating delete becomes durable work for the reconciliation
sweeper. They also drive a successful replacement through the HTTP endpoint and
re-read the required-document contract, proving the UI-facing record changed on
the server rather than only in local state.

**Validates: Requirements R11.7, R11.8, R17.1, R17.2, R17.3, R17.4**
"""

from __future__ import annotations

import hashlib
from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from apps.documents import document_evidence as evidence
from apps.documents.models import (
    ApplicationDocument,
    DocumentUploadStage,
    DocumentVerificationEvent,
)
from tests.tenant_fixtures import build_tenant_world

pytestmark = pytest.mark.django_db(transaction=True)

UPLOAD_URL = "/api/v1/documents/upload/"
CONTRACT_URL = "/api/v1/applications/{application_id}/required-documents/"
DELETE_URL = "/api/v1/documents/{document_id}/delete/"


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


def _pdf(label: bytes) -> bytes:
    return b"%PDF-1.7\n" + label + b"\n%%EOF"


def _upload(client: APIClient, application_id, *, name: str, content: bytes):
    return client.post(
        UPLOAD_URL,
        {
            "file": SimpleUploadedFile(name, content, content_type="application/pdf"),
            "application_id": str(application_id),
            "document_type": "result_slip",
        },
        format="multipart",
        HTTP_IDEMPOTENCY_KEY=f"task-7-3-{name}",
    )


def _contract_row(client: APIClient, application_id) -> dict:
    response = client.get(CONTRACT_URL.format(application_id=application_id))
    assert response.status_code == 200, response.content
    rows = response.json()["data"]["requirements"]
    return next(row for row in rows if row["document_type"] == "result_slip")


@pytest.fixture()
def upload_world():
    # ``document_upload_stages`` is unmanaged, so pytest-django's flush leaves its
    # rows behind. The reconciliation sweeper is global by design, so a stale row
    # from an earlier test would be swept inside this one's assertions.
    DocumentUploadStage.objects.all().delete()
    world = build_tenant_world(application_status="draft")
    Application.objects.filter(id=world.application.id).update(
        payment_status="verified",
        requirements_snapshot=[
            {
                "document_type": "result_slip",
                "label": "Grade 12 result slip",
                "required": True,
                "rules": {"accepted_mime_types": ["application/pdf"]},
            }
        ],
        configuration_version="cfg-task-7-3",
    )
    world.application.refresh_from_db()
    return world, _client(world.student)


@pytest.fixture()
def object_storage():
    """One deterministic object-store double at the provider boundary only."""
    with patch("apps.common.storage.MediaStorage") as storage_cls:
        storage = MagicMock()
        storage.save.side_effect = lambda key, file_obj: key
        storage.url.side_effect = lambda key: f"https://r2.test/{key}"
        storage.delete.return_value = None
        storage_cls.return_value = storage
        yield storage


class TestServerBackedReplacement:
    def test_replace_creates_version_two_and_contract_preserves_version_one(
        self, upload_world, object_storage
    ):
        """STU-19: replacement is a persisted command, not a local reset."""
        world, client = upload_world
        first_bytes = _pdf(b"first version")
        second_bytes = _pdf(b"second version")

        first_response = _upload(
            client, world.application.id, name="result-v1.pdf", content=first_bytes
        )
        second_response = _upload(
            client, world.application.id, name="result-v2.pdf", content=second_bytes
        )

        assert first_response.status_code == 201, first_response.content
        assert second_response.status_code == 201, second_response.content
        first_id = first_response.json()["data"]["id"]
        second = second_response.json()["data"]
        assert second["id"] != first_id
        assert second["version"] == 2
        assert second["is_current"] is True
        assert second["content_hash"] == hashlib.sha256(second_bytes).hexdigest()
        assert second["supersedes_id"] == first_id

        first = ApplicationDocument.objects.get(id=first_id)
        assert first.is_current is False
        assert first.lifecycle_state == evidence.SUPERSEDED
        assert first.storage_key
        assert ApplicationDocument.objects.filter(
            application_id=world.application.id,
            document_type="result_slip",
            is_current=True,
        ).count() == 1

        # The same contract the UI re-reads publishes immutable identity and
        # prior-version history. A local filename change cannot satisfy this.
        row = _contract_row(client, world.application.id)
        assert row["document"]["id"] == second["id"]
        assert row["document"]["version"] == 2
        assert row["document"]["checksum"] == hashlib.sha256(second_bytes).hexdigest()
        assert [(entry["id"], entry["version"], entry["lifecycle_state"]) for entry in row["history"]] == [
            (first_id, 1, evidence.SUPERSEDED)
        ]

        stages = list(
            DocumentUploadStage.objects.filter(application_id=world.application.id).order_by(
                "created_at"
            )
        )
        assert [stage.state for stage in stages] == [
            evidence.STAGE_COMMITTED,
            evidence.STAGE_COMMITTED,
        ]
        assert str(stages[-1].document_id) == second["id"]

        world.application.refresh_from_db()
        # SJR task 3.14 (design R4-b, clause 2.19): the snapshot is a presence
        # marker holding the current document's id, written in the version
        # transaction; it used to hold the (presigned) object URL.
        assert world.application.result_slip_url == second["id"]

    def test_delete_command_keeps_immutable_history_and_clears_current_projection(
        self, upload_world, object_storage
    ):
        world, client = upload_world
        response = _upload(
            client,
            world.application.id,
            name="remove-me.pdf",
            content=_pdf(b"remove me"),
        )
        assert response.status_code == 201, response.content
        document_id = response.json()["data"]["id"]

        deleted = client.delete(
            DELETE_URL.format(document_id=document_id),
            {"reason": "wrong evidence selected"},
            format="json",
        )

        assert deleted.status_code == 200, deleted.content
        document = ApplicationDocument.objects.get(id=document_id)
        assert document.is_current is False
        assert document.lifecycle_state == evidence.DELETED
        assert document.storage_key, "delete retains the immutable object"
        assert not ApplicationDocument.objects.filter(
            application_id=world.application.id,
            document_type="result_slip",
            is_current=True,
        ).exists()
        event = DocumentVerificationEvent.objects.get(
            document_id=document_id,
            event_type=evidence.EVENT_VERSION_DELETED,
        )
        assert event.details["reason"] == "wrong evidence selected"
        assert event.details["object_retained"] is True
        object_storage.delete.assert_not_called()

        world.application.refresh_from_db()
        assert world.application.result_slip_url is None
        row = _contract_row(client, world.application.id)
        assert row["state"] == "missing"
        assert row["document"] is None
        assert row["history"][0]["id"] == document_id
        assert row["history"][0]["lifecycle_state"] == evidence.DELETED


class TestUploadReplayIdentity:
    """R17.1: what counts as "the same command" at the endpoint.

    Two obligations pull in opposite directions and both have to hold. A student
    on a weak connection whose 201 never arrived must not end up with two
    versions of one document. A student who deliberately uploads a different file
    must not be told "created" while the server keeps the old one — that is
    STU-19's "'Replace' may clear only local UI state" with the server as the
    thing that failed to change.
    """

    def test_the_same_file_uploaded_twice_returns_the_same_version(
        self, upload_world, object_storage
    ):
        """A retry: identical bytes, identical name, identical declared type."""
        world, client = upload_world
        content = _pdf(b"one and only")

        first = _upload(client, world.application.id, name="slip.pdf", content=content)
        second = _upload(client, world.application.id, name="slip.pdf", content=content)

        assert first.status_code == 201, first.content
        assert second.status_code == 201, second.content
        assert second.json()["data"]["id"] == first.json()["data"]["id"]
        assert second.json()["data"]["version"] == 1
        assert (
            ApplicationDocument.objects.filter(
                application_id=world.application.id, document_type="result_slip"
            ).count()
            == 1
        ), "a lost response must not become version 2"

    def test_identical_bytes_under_a_new_name_replace_the_current_version(
        self, upload_world, object_storage
    ):
        """The 7.2 ↔ 7.3 contract answer, proved through the endpoint.

        This is the shape ``test_required_documents_contract_7_2.py``'s
        replacement case takes: the student picks a second file whose bytes happen
        to match (a re-export, or the same scan saved under a new name). It is a
        new command, so the contract must report the new document as current with
        the previous one preserved as history.
        """
        world, client = upload_world
        content = _pdf(b"same bytes, new intent")

        first = _upload(client, world.application.id, name="first.pdf", content=content)
        second = _upload(client, world.application.id, name="second.pdf", content=content)

        assert first.status_code == 201, first.content
        assert second.status_code == 201, second.content
        first_id = first.json()["data"]["id"]
        second_data = second.json()["data"]
        assert second_data["id"] != first_id
        assert second_data["version"] == 2
        assert second_data["supersedes_id"] == first_id
        # Same checksum on both versions: the bytes are genuinely identical, and
        # the version chain still records the two distinct commands.
        assert second_data["content_hash"] == hashlib.sha256(content).hexdigest()

        row = _contract_row(client, world.application.id)
        assert row["document"]["id"] == second_data["id"]
        assert row["document"]["document_name"] == "second.pdf"
        assert [entry["id"] for entry in row["history"]] == [first_id]

    def test_a_repeated_idempotency_key_replays_the_committed_document(
        self, upload_world, object_storage
    ):
        """The caller-declared identity wins even when the file differs.

        ``uq_document_upload_stages_idempotency`` makes the key unique per
        (application, type), so without reading the ledger first this retry failed
        on the stage insert with an integrity error the client could not act on.
        """
        world, client = upload_world
        key = "client-declared-retry"

        def _send(name: str, payload: bytes):
            return client.post(
                UPLOAD_URL,
                {
                    "file": SimpleUploadedFile(name, payload, content_type="application/pdf"),
                    "application_id": str(world.application.id),
                    "document_type": "result_slip",
                },
                format="multipart",
                HTTP_IDEMPOTENCY_KEY=key,
            )

        first = _send("keyed.pdf", _pdf(b"keyed payload"))
        assert first.status_code == 201, first.content
        replay = _send("keyed-retry.pdf", _pdf(b"a different payload"))

        assert replay.status_code == 201, replay.content
        assert replay.json()["data"]["id"] == first.json()["data"]["id"]
        assert (
            ApplicationDocument.objects.filter(
                application_id=world.application.id, document_type="result_slip"
            ).count()
            == 1
        )

    def test_a_concurrent_attempt_on_the_same_key_is_a_stable_retryable_conflict(
        self, upload_world, object_storage
    ):
        """An in-flight attempt has no evidence to replay, so say so honestly."""
        world, client = upload_world
        key = "in-flight-key"
        # A staged-but-unresolved attempt is exactly what an in-flight request
        # looks like from the next request's point of view.
        evidence.open_stage(
            application_id=world.application.id,
            document_type="result_slip",
            object_key=evidence.build_object_key(
                world.application.id, "result_slip", mime_type="application/pdf"
            ),
            content_hash="c" * 64,
            file_size=32,
            mime_type="application/pdf",
            idempotency_key=key,
        )

        response = client.post(
            UPLOAD_URL,
            {
                "file": SimpleUploadedFile(
                    "second.pdf", _pdf(b"second attempt"), content_type="application/pdf"
                ),
                "application_id": str(world.application.id),
                "document_type": "result_slip",
            },
            format="multipart",
            HTTP_IDEMPOTENCY_KEY=key,
        )

        assert response.status_code == 409, response.content
        body = response.json()
        assert body["success"] is False
        assert body["code"] == "DOCUMENT_UPLOAD_IN_PROGRESS"
        assert body["retryable"] is True
        # Nothing was written, so there is nothing to compensate.
        object_storage.save.assert_not_called()


class TestStorageDatabaseFailureInjection:
    def _seed_first_version(self, world, client):
        response = _upload(
            client,
            world.application.id,
            name="stable-v1.pdf",
            content=_pdf(b"stable version"),
        )
        assert response.status_code == 201, response.content
        return ApplicationDocument.objects.get(id=response.json()["data"]["id"])

    def test_metadata_failure_after_object_write_deletes_stage_and_rolls_back_replacement(
        self, upload_world, object_storage
    ):
        """Required evidence: inject failure after storage.save, inside DB commit."""
        world, client = upload_world
        first = self._seed_first_version(world, client)
        original_url = first.file_url
        object_storage.reset_mock()
        object_storage.save.side_effect = lambda key, file_obj: key
        object_storage.url.side_effect = lambda key: f"https://r2.test/{key}"

        # commit_version has already locked/superseded the old row when this
        # insertion seam is reached. transaction.atomic must restore it before
        # the view compensates the object write.
        with patch.object(
            ApplicationDocument.objects,
            "create",
            side_effect=RuntimeError("injected metadata insert failure"),
        ):
            response = _upload(
                client,
                world.application.id,
                name="failing-v2.pdf",
                content=_pdf(b"metadata will fail"),
            )

        assert response.status_code == 500, response.content
        assert response.json()["code"] == "DOCUMENT_COMMIT_FAILED"
        first.refresh_from_db()
        assert first.is_current is True
        assert first.lifecycle_state == evidence.READY_FOR_REVIEW
        assert first.file_url == original_url
        assert ApplicationDocument.objects.filter(
            application_id=world.application.id,
            document_type="result_slip",
        ).count() == 1

        failed_stage = DocumentUploadStage.objects.filter(
            application_id=world.application.id,
            state=evidence.STAGE_COMPENSATED,
        ).latest("created_at")
        saved_key = object_storage.save.call_args.args[0]
        assert failed_stage.object_key == saved_key
        object_storage.delete.assert_called_once_with(saved_key)
        assert failed_stage.resolved_at is not None
        assert "metadata commit failed" in (failed_stage.last_error or "")

        world.application.refresh_from_db()
        # SJR task 3.14 (design R4-b): the snapshot still names version 1 by id.
        assert world.application.result_slip_url == str(first.id)

    def test_an_unverifiable_object_is_never_recorded_as_evidence(
        self, upload_world, object_storage
    ):
        """The other direction: storage accepted the write but has no object.

        Compensation can delete an orphan object; nothing can recover bytes the
        provider never kept. So the database is never allowed to describe an
        unverifiable object as this application's evidence — the previous version
        stays authoritative and the student gets a retryable failure instead of a
        published checksum for a document nobody can open.
        """
        world, client = upload_world
        first = self._seed_first_version(world, client)
        original_url = first.file_url
        object_storage.reset_mock()
        object_storage.save.side_effect = lambda key, file_obj: key
        object_storage.url.side_effect = lambda key: f"https://r2.test/{key}"
        # save() reports success; the object is not there.
        object_storage.exists.side_effect = lambda key: False

        response = _upload(
            client,
            world.application.id,
            name="unverifiable-v2.pdf",
            content=_pdf(b"bytes the provider dropped"),
        )

        assert response.status_code == 500, response.content
        body = response.json()
        assert body["code"] == "DOCUMENT_STORAGE_UNVERIFIED"
        assert body["retryable"] is True

        # No version 2 exists, and version 1 was never superseded.
        first.refresh_from_db()
        assert first.is_current is True
        assert first.version == 1
        assert first.lifecycle_state == evidence.READY_FOR_REVIEW
        assert first.file_url == original_url
        assert ApplicationDocument.objects.filter(
            application_id=world.application.id,
            document_type="result_slip",
        ).count() == 1

        # The staged object is compensated, not left as an invisible orphan.
        saved_key = object_storage.save.call_args.args[0]
        stage = DocumentUploadStage.objects.filter(
            application_id=world.application.id,
            object_key=saved_key,
        ).get()
        assert stage.state == evidence.STAGE_COMPENSATED
        assert stage.document_id is None
        assert "storage verification failed" in (stage.last_error or "")
        assert "DOCUMENT_STORAGE_UNVERIFIED" in (stage.last_error or "")
        object_storage.delete.assert_called_once_with(saved_key)

        # The legacy projection the student's UI reads still points at version 1.
        world.application.refresh_from_db()
        # SJR task 3.14 (design R4-b): the snapshot still names version 1 by id.
        assert world.application.result_slip_url == str(first.id)
        row = _contract_row(client, world.application.id)
        assert row["document"]["id"] == str(first.id)
        assert row["document"]["version"] == 1
        assert row["history"] == []

    def test_a_truncated_object_write_is_refused_and_the_prior_version_survives(
        self, upload_world, object_storage
    ):
        """A short write passes an existence check and would still be unreadable."""
        world, client = upload_world
        first = self._seed_first_version(world, client)
        object_storage.reset_mock()
        object_storage.save.side_effect = lambda key, file_obj: key
        object_storage.url.side_effect = lambda key: f"https://r2.test/{key}"
        object_storage.exists.side_effect = lambda key: True
        # A partially flushed object: present, but not the bytes we streamed.
        object_storage.size.side_effect = lambda key: 3

        response = _upload(
            client,
            world.application.id,
            name="truncated-v2.pdf",
            content=_pdf(b"a much longer body than three bytes"),
        )

        assert response.status_code == 500, response.content
        assert response.json()["code"] == "DOCUMENT_STORAGE_UNVERIFIED"
        first.refresh_from_db()
        assert first.is_current is True
        assert ApplicationDocument.objects.filter(
            application_id=world.application.id,
            document_type="result_slip",
        ).count() == 1
        assert not DocumentVerificationEvent.objects.filter(
            application_id=world.application.id,
            event_type=evidence.EVENT_VERSION_SUPERSEDED,
        ).exists()
        saved_key = object_storage.save.call_args.args[0]
        object_storage.delete.assert_called_once_with(saved_key)

    def test_failed_compensating_delete_is_durable_and_sweeper_reconciles_it(
        self, upload_world, object_storage
    ):
        """R17.4: a second provider failure is visible and retried later."""
        world, client = upload_world
        first = self._seed_first_version(world, client)
        object_storage.reset_mock()
        object_storage.save.side_effect = lambda key, file_obj: key
        object_storage.url.side_effect = lambda key: f"https://r2.test/{key}"
        object_storage.delete.side_effect = RuntimeError("injected R2 delete outage")

        with patch.object(
            ApplicationDocument.objects,
            "create",
            side_effect=RuntimeError("injected metadata insert failure"),
        ):
            response = _upload(
                client,
                world.application.id,
                name="pending-compensation.pdf",
                content=_pdf(b"orphan until sweep"),
            )

        assert response.status_code == 500, response.content
        pending = DocumentUploadStage.objects.get(
            application_id=world.application.id,
            state=evidence.STAGE_COMPENSATION_PENDING,
        )
        assert pending.attempts == 1
        assert pending.resolved_at is None
        assert "injected R2 delete outage" in (pending.last_error or "")
        first.refresh_from_db()
        assert first.is_current is True

        DocumentUploadStage.objects.filter(id=pending.id).update(
            created_at=timezone.now() - timedelta(hours=2)
        )
        object_storage.delete.side_effect = None
        from apps.documents.tasks import reconcile_document_storage_task

        summary = reconcile_document_storage_task()

        assert summary == {
            "reconciled": 1,
            "recovered": 0,
            "pending": 0,
            "orphaned": 0,
        }
        pending.refresh_from_db()
        assert pending.state == evidence.STAGE_COMPENSATED
        assert pending.resolved_at is not None
        object_storage.delete.assert_called_with(pending.object_key)
        assert ApplicationDocument.objects.filter(id=first.id, is_current=True).exists()
