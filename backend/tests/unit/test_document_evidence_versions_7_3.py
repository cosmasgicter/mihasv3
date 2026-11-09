"""Task 7.3 — immutable document versions and storage compensation.

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` task **7.3**
Requirements: R11.7-R11.8, R17.1-R17.4
Findings:     **STU-19** — "Document storage and database updates are not
              compensated atomically, current/superseded versions are not
              enforced, and 'Replace' may clear only local UI state."
Design:       §9.3 (lifecycle + one-current partial unique index + staged object
              key with compensation/sweeper), §17 (durable records, operator
              queues), §14.2 (database uniqueness is the final race guard).
Evidence:     ``docs/v2-evidence/7.3/``

Two layers, matching the repo convention:

* Always-on: the migration deliverable exists with a paired rollback, is
  additive-only-lint clean and idempotent, the lifecycle state machine matches
  design §9.3, the checksum is a real streamed sha256, and the legacy
  ``verification_status`` projection is exactly the one every pre-7.3 reader
  expects.
* DB-backed: version supersession, the one-current invariant, the delete command,
  verification history, extraction state that cannot clobber a human decision,
  compensation of a failed metadata commit, and the reconciliation sweeper.

The Required_Evidence for 7.3 — *failure injection between the storage and the
database steps* — is exercised end to end through the real upload endpoint in
``tests/integration/test_document_evidence_compensation_7_3.py``. Nothing in
either file is skipped or gated on a credential.
"""

from __future__ import annotations

import io
import re
import uuid
from datetime import timedelta
from pathlib import Path

import pytest
from django.db import IntegrityError, connection, transaction
from django.utils import timezone

from apps.documents import document_evidence as evidence

SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
FORWARD = SCRIPTS_DIR / "2026_07_26_01_document_evidence_lifecycle.sql"
ROLLBACK = SCRIPTS_DIR / "2026_07_26_01_document_evidence_lifecycle_rollback.sql"
ALIGN = SCRIPTS_DIR / "2026_07_26_02_document_current_slot_alignment.sql"
ALIGN_ROLLBACK = SCRIPTS_DIR / "2026_07_26_02_document_current_slot_alignment_rollback.sql"


# ---------------------------------------------------------------------------
# Layer 1 — always-on (no database)
# ---------------------------------------------------------------------------


class TestMigrationDeliverable:
    def test_forward_and_rollback_scripts_exist(self):
        assert FORWARD.exists(), "task 7.3 migration deliverable missing"
        assert ROLLBACK.exists(), "task 7.3 rollback sibling missing"

    def test_forward_script_is_additive_only(self):
        """No DROP COLUMN / DROP TABLE / TRUNCATE / unguarded DELETE.

        ``apply_sql_migrations`` refuses a non-additive migration without an
        explicit operator opt-in, so the boot sweep must be able to apply this
        script unattended.
        """
        sql = FORWARD.read_text()
        body = re.sub(r"--[^\n]*", "", sql)
        body = re.sub(r"/\*.*?\*/", "", body, flags=re.DOTALL)
        for pattern in (r"\bDROP\s+COLUMN\b", r"\bDROP\s+TABLE\b", r"\bTRUNCATE\b", r"\bDELETE\s+FROM\b"):
            assert not re.search(pattern, body, re.IGNORECASE), (
                f"non-additive operation {pattern} found in {FORWARD.name}"
            )

    def test_every_backfill_update_is_bounded(self):
        """An UPDATE without a WHERE clause would rewrite historical rows."""
        sql = re.sub(r"--[^\n]*", "", FORWARD.read_text())
        statements = [
            statement.strip()
            for statement in sql.split(";")
            if statement.strip().upper().startswith("UPDATE ")
        ]
        assert len(statements) == 2, "expected the lifecycle + extraction backfills"
        for statement in statements:
            assert re.search(r"\bWHERE\b", statement, re.IGNORECASE), (
                f"unbounded UPDATE in {FORWARD.name}: {statement[:120]}"
            )

    def test_forward_script_is_idempotent_by_construction(self):
        """Every object creation is guarded, so a re-run converges to a no-op."""
        sql = re.sub(r"--[^\n]*", "", FORWARD.read_text())
        creates = re.findall(r"CREATE\s+(?:UNIQUE\s+)?(?:INDEX|TABLE)([^\n]*)", sql, re.IGNORECASE)
        assert creates
        for fragment in creates:
            assert "IF NOT EXISTS" in fragment.upper(), fragment
        for fragment in re.findall(r"ADD COLUMN([^\n]*)", sql, re.IGNORECASE):
            assert "IF NOT EXISTS" in fragment.upper(), fragment
        # Every constraint add sits behind its own pg_constraint name guard, so a
        # re-run cannot fail with "constraint already exists".
        adds = len(re.findall(r"ADD CONSTRAINT", sql, re.IGNORECASE))
        guards = len(re.findall(r"FROM pg_constraint\s+WHERE conname", sql, re.IGNORECASE))
        assert adds > 0 and adds == guards, f"{adds} ADD CONSTRAINT vs {guards} guards"

    def test_rollback_warns_before_discarding_history(self):
        """The rollback destroys history, so it must say so and say how to keep it."""
        text = ROLLBACK.read_text().lower()
        assert "document_verification_events" in text
        assert "export" in text or "copy" in text

    def test_task_3_5_columns_are_not_re_added(self):
        """3.5 owns version/is_current/content_hash; 7.3 must not duplicate them."""
        sql = FORWARD.read_text()
        added = {
            match.lower()
            for match in re.findall(r"ADD COLUMN IF NOT EXISTS\s+(\w+)", sql, re.IGNORECASE)
        }
        assert added == {"lifecycle_state", "storage_key", "extraction_state"}, added


class TestCurrentSlotAlignmentDeliverable:
    """``2026_07_26_02`` repairs rows already stuck in the wrong state.

    The runtime command fixes new writes; this script fixes the data that reached
    the defect before it. Sorts after ``_01`` in the sweep's filename order.
    """

    def test_forward_and_rollback_scripts_exist(self):
        assert ALIGN.exists(), "current-slot alignment migration missing"
        assert ALIGN_ROLLBACK.exists(), "alignment rollback sibling missing"

    def test_it_sorts_after_the_lifecycle_script(self):
        assert sorted([FORWARD.name, ALIGN.name]) == [FORWARD.name, ALIGN.name]

    def test_it_passes_the_additive_only_lint(self):
        from apps.common.management.commands.apply_sql_migrations import (
            _find_non_additive_violations,
        )

        assert _find_non_additive_violations(ALIGN.read_text()) == []
        assert _find_non_additive_violations(ALIGN_ROLLBACK.read_text()) == []

    def test_it_adds_no_schema(self):
        """Data-only: the columns it touches were added by 3.5 and 7.3-01."""
        body = re.sub(r"--[^\n]*", "", ALIGN.read_text())
        for pattern in (r"\bALTER\s+TABLE\b", r"\bCREATE\s+", r"\bDROP\b"):
            assert not re.search(pattern, body, re.IGNORECASE), pattern

    def test_every_update_is_bounded(self):
        body = re.sub(r"--[^\n]*", "", ALIGN.read_text())
        statements = [
            statement.strip()
            for statement in body.split(";")
            if re.search(r"\bUPDATE\s+application_documents\b", statement, re.IGNORECASE)
        ]
        assert len(statements) == 2, "expected the release + promote statements"
        for statement in statements:
            assert re.search(r"\bWHERE\b", statement, re.IGNORECASE), statement[:160]

    def test_the_promote_step_cannot_create_a_second_current_row(self):
        """Its guard is what makes the script re-runnable against a fixed database."""
        body = ALIGN.read_text()
        assert "NOT EXISTS" in body
        assert "peer.is_current     = true" in body

    def test_the_rollback_preserves_corrected_document_state(self):
        text = ALIGN_ROLLBACK.read_text().lower()
        body = re.sub(r"--[^\n]*", "", text)
        assert "corrected document state therefore remains intact" in text
        assert "update application_documents" not in body
        assert "delete from migration_history" in body


class TestLifecycleStateMachine:
    """Design §9.3, spelled out as assertions rather than prose."""

    def test_documented_forward_path(self):
        assert evidence.can_transition(evidence.UPLOADED, evidence.SCANNING)
        assert evidence.can_transition(evidence.SCANNING, evidence.READY_FOR_REVIEW)
        assert evidence.can_transition(evidence.READY_FOR_REVIEW, evidence.VERIFIED)

    def test_rejected_branch_and_replacement(self):
        assert evidence.can_transition(evidence.READY_FOR_REVIEW, evidence.REJECTED)
        assert evidence.can_transition(evidence.REJECTED, evidence.SUPERSEDED)

    def test_processing_failed_retry(self):
        assert evidence.can_transition(evidence.UPLOADED, evidence.PROCESSING_FAILED)
        assert evidence.can_transition(evidence.SCANNING, evidence.PROCESSING_FAILED)
        assert evidence.can_transition(evidence.PROCESSING_FAILED, evidence.SCANNING)

    def test_superseded_and_deleted_are_terminal(self):
        for terminal in (evidence.SUPERSEDED, evidence.DELETED):
            for target in evidence.LIFECYCLE_STATES:
                if target == terminal:
                    continue
                assert not evidence.can_transition(terminal, target), (
                    f"{terminal} must be terminal but allows -> {target}"
                )

    def test_a_document_cannot_skip_straight_to_verified_from_upload(self):
        """A reviewer decides on evidence that is ready for review, not on bytes
        that just landed. The upload command sets ``ready_for_review`` explicitly
        after the synchronous content screen; it never jumps to ``verified``."""
        assert not evidence.can_transition(evidence.UPLOADED, evidence.VERIFIED)

    def test_states_match_the_database_check_vocabulary(self):
        sql = FORWARD.read_text()
        match = re.search(
            r"chk_application_documents_lifecycle_state.*?IN \((.*?)\)",
            sql,
            re.DOTALL,
        )
        assert match, "lifecycle CHECK not found in the migration"
        in_sql = {value.strip().strip("'") for value in match.group(1).split(",")}
        assert in_sql == set(evidence.LIFECYCLE_STATES)


class TestLegacyProjection:
    def test_pending_states_project_to_pending(self):
        for state in (
            evidence.UPLOADED,
            evidence.SCANNING,
            evidence.READY_FOR_REVIEW,
            evidence.PROCESSING_FAILED,
        ):
            assert evidence.legacy_status_for(state) == "pending"

    def test_human_decisions_project_verbatim(self):
        assert evidence.legacy_status_for(evidence.VERIFIED) == "verified"
        assert evidence.legacy_status_for(evidence.REJECTED) == "rejected"
        assert evidence.legacy_status_for(evidence.DELETED) == "deleted"

    def test_superseded_preserves_the_prior_review_outcome(self):
        """R11.8 — a superseded version keeps its own verification status.

        Rewriting it to "superseded" would erase the fact that a reviewer had
        already verified the evidence being replaced, and would hand every legacy
        reader a value it has no branch for.
        """
        assert evidence.legacy_status_for(evidence.SUPERSEDED, fallback="verified") == "verified"

    def test_lifecycle_is_derived_for_a_pre_7_3_row(self):
        class Row:
            lifecycle_state = None
            is_current = True
            verification_status = "verified"

        assert evidence.lifecycle_of(Row()) == evidence.VERIFIED

        class Superseded(Row):
            is_current = False

        assert evidence.lifecycle_of(Superseded()) == evidence.SUPERSEDED

        class Unknown(Row):
            verification_status = "ocr_processing"

        assert evidence.lifecycle_of(Unknown()) == evidence.READY_FOR_REVIEW


class TestChecksum:
    def test_streamed_sha256_matches_hashlib_and_rewinds(self):
        import hashlib

        payload = b"%PDF-1.4 evidence bytes" * 5000
        stream = io.BytesIO(payload)
        digest, size = evidence.compute_checksum(stream)
        assert digest == hashlib.sha256(payload).hexdigest()
        assert size == len(payload)
        # The caller hands the same stream to the storage backend next: a
        # non-rewound stream would store a zero-byte object.
        assert stream.read() == payload

    def test_identical_bytes_hash_identically_across_file_names(self):
        first, _ = evidence.compute_checksum(io.BytesIO(b"same bytes"))
        second, _ = evidence.compute_checksum(io.BytesIO(b"same bytes"))
        assert first == second

    def test_object_key_is_unique_per_attempt_and_carries_context(self):
        application_id = uuid.uuid4()
        first = evidence.build_object_key(application_id, "result_slip", mime_type="application/pdf")
        second = evidence.build_object_key(application_id, "result_slip", mime_type="application/pdf")
        assert first != second, "a retry must not overwrite a previous attempt's object"
        assert str(application_id) in first and "result_slip" in first

    def test_object_name_is_sanitised(self):
        assert evidence.safe_object_name("../../etc/passwd") == "passwd"
        assert evidence.safe_object_name("a b;rm -rf.pdf") == "a b_rm -rf.pdf"
        assert evidence.safe_object_name(None) == "unnamed"


# ---------------------------------------------------------------------------
# Layer 2 — database-backed behaviour
# ---------------------------------------------------------------------------


@pytest.fixture()
def evidence_world(tenant_world):
    """One draft application plus a committed version-1 result slip.

    Also clears the staged-write ledger. ``document_upload_stages`` is an
    unmanaged model, and pytest-django's ``transaction=True`` flush only truncates
    *managed* tables, so rows would otherwise survive into the next test — and the
    reconciliation sweeper is deliberately global, so a leftover stale stage would
    be swept by an unrelated test's assertion.
    """
    from apps.documents.models import ApplicationDocument, DocumentUploadStage

    DocumentUploadStage.objects.all().delete()

    application = tenant_world.application
    application.status = "draft"
    application.save(update_fields=["status"])

    document = ApplicationDocument.objects.create(
        application=application,
        document_type="result_slip",
        document_name="slip-v1.pdf",
        file_url="https://example.invalid/media/documents/slip-v1.pdf",
        storage_key="documents/slip-v1.pdf",
        file_size=1024,
        mime_type="application/pdf",
        content_hash="a" * 64,
        version=1,
        is_current=True,
        lifecycle_state=evidence.READY_FOR_REVIEW,
        verification_status="pending",
        uploaded_at=timezone.now(),
    )
    return application, document


def _stage_for(application, document_type="result_slip", content_hash="b" * 64):
    return evidence.open_stage(
        application_id=application.id,
        document_type=document_type,
        object_key=evidence.build_object_key(application.id, document_type, mime_type="application/pdf"),
        content_hash=content_hash,
        file_size=2048,
        mime_type="application/pdf",
    )


@pytest.mark.django_db(transaction=True)
class TestVersionCommands:
    def test_replace_creates_version_2_and_supersedes_version_1(self, evidence_world):
        """STU-19's core claim: replace must change the *server* record."""
        application, first = evidence_world
        stage = _stage_for(application)

        second = evidence.commit_version(
            stage=stage,
            application_id=application.id,
            document_type="result_slip",
            document_name="slip-v2.pdf",
            file_url="https://example.invalid/media/documents/slip-v2.pdf",
            storage_key=stage.object_key,
            file_size=2048,
            mime_type="application/pdf",
            content_hash="b" * 64,
        )

        first.refresh_from_db()
        assert second.id != first.id
        assert second.version == 2
        assert second.is_current is True
        assert second.supersedes_id == first.id
        assert second.lifecycle_state == evidence.READY_FOR_REVIEW
        assert second.content_hash == "b" * 64

        # Prior evidence preserved, not overwritten (R11.8).
        assert first.is_current is False
        assert first.superseded_at is not None
        assert first.lifecycle_state == evidence.SUPERSEDED
        assert first.file_url.endswith("slip-v1.pdf")

        stage.refresh_from_db()
        assert stage.state == evidence.STAGE_COMMITTED
        assert stage.document_id == second.id

    def test_the_database_rejects_a_second_current_version(self, evidence_world):
        """Design §14.2 — uniqueness is the final race guard, not the service."""
        from apps.documents.models import ApplicationDocument

        application, _ = evidence_world
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                ApplicationDocument.objects.create(
                    application=application,
                    document_type="result_slip",
                    document_name="rogue.pdf",
                    version=2,
                    is_current=True,
                    lifecycle_state=evidence.READY_FOR_REVIEW,
                    verification_status="pending",
                    uploaded_at=timezone.now(),
                )

    def test_a_verified_version_keeps_its_status_when_superseded(self, evidence_world):
        application, first = evidence_world
        evidence.record_verification_decision(
            document=first, decision=evidence.VERIFIED, actor_id=None, notes="looks right"
        )

        evidence.commit_version(
            stage=_stage_for(application),
            application_id=application.id,
            document_type="result_slip",
            document_name="slip-v2.pdf",
            file_url="https://example.invalid/media/documents/slip-v2.pdf",
            storage_key="documents/slip-v2.pdf",
            file_size=2048,
            mime_type="application/pdf",
            content_hash="b" * 64,
        )

        first.refresh_from_db()
        assert first.lifecycle_state == evidence.SUPERSEDED
        assert first.verification_status == "verified"
        assert first.verification_notes == "looks right"

    def test_a_requirement_with_several_accepted_types_keeps_one_current(self, evidence_world):
        """The identity requirement accepts nrc/passport/extra_kyc.

        A new passport must supersede the NRC that was satisfying the same
        requirement, otherwise the contract reports two current documents for one
        requirement and the student sees stale evidence.
        """
        from apps.documents.models import ApplicationDocument

        application, _ = evidence_world
        nrc = ApplicationDocument.objects.create(
            application=application,
            document_type="nrc",
            document_name="nrc.jpg",
            version=1,
            is_current=True,
            lifecycle_state=evidence.READY_FOR_REVIEW,
            verification_status="pending",
            uploaded_at=timezone.now(),
        )

        passport = evidence.commit_version(
            stage=_stage_for(application, document_type="passport", content_hash="c" * 64),
            application_id=application.id,
            document_type="passport",
            document_name="passport.jpg",
            file_url="https://example.invalid/media/documents/passport.jpg",
            storage_key="documents/passport.jpg",
            file_size=900,
            mime_type="image/jpeg",
            content_hash="c" * 64,
            supersede_document_types=["nrc", "passport", "extra_kyc"],
        )

        nrc.refresh_from_db()
        assert nrc.is_current is False
        assert passport.is_current is True
        assert passport.supersedes_id == nrc.id
        assert passport.version == 2, "the version chain spans the requirement, not one type"

    def test_delete_removes_current_evidence_and_keeps_history(self, evidence_world):
        from apps.documents.models import DocumentVerificationEvent

        _, document = evidence_world
        evidence.delete_document(document=document, actor_role="student", reason="wrong file")

        document.refresh_from_db()
        assert document.lifecycle_state == evidence.DELETED
        assert document.is_current is False
        assert document.verification_status == "deleted"
        # The object is retained deliberately: prior evidence survives (R11.8).
        assert document.storage_key == "documents/slip-v1.pdf"

        event = DocumentVerificationEvent.objects.filter(
            document_id=document.id, event_type=evidence.EVENT_VERSION_DELETED
        ).first()
        assert event is not None
        assert event.details["reason"] == "wrong file"
        assert event.details["object_retained"] is True

    def test_delete_is_idempotent(self, evidence_world):
        _, document = evidence_world
        evidence.delete_document(document=document)
        evidence.delete_document(document=document)
        document.refresh_from_db()
        assert document.lifecycle_state == evidence.DELETED

    def test_a_deleted_version_frees_the_one_current_slot(self, evidence_world):
        """After a delete, a fresh upload must be able to become current again."""
        application, document = evidence_world
        evidence.delete_document(document=document)

        replacement = evidence.commit_version(
            stage=_stage_for(application),
            application_id=application.id,
            document_type="result_slip",
            document_name="slip-v2.pdf",
            file_url="https://example.invalid/media/documents/slip-v2.pdf",
            storage_key="documents/slip-v2.pdf",
            file_size=2048,
            mime_type="application/pdf",
            content_hash="b" * 64,
        )
        assert replacement.is_current is True
        assert replacement.version == 2
        # A deleted row is history, not the parent of the new version.
        assert replacement.supersedes_id is None

    def test_identical_bytes_are_recognised_as_the_same_version(self, evidence_world):
        """R17.1 idempotency: a lost response must not produce a second version."""
        application, first = evidence_world
        found = evidence.find_identical_current_version(
            application.id, ["result_slip"], first.content_hash
        )
        assert found is not None and found.id == first.id

        assert (
            evidence.find_identical_current_version(application.id, ["result_slip"], "z" * 64)
            is None
        )

    def test_a_retry_of_the_same_file_replays(self, evidence_world):
        """Same bytes AND same name is the only shape a lost-response retry takes."""
        application, first = evidence_world
        found = evidence.find_identical_current_version(
            application.id,
            ["result_slip"],
            first.content_hash,
            document_name=first.document_name,
        )
        assert found is not None and found.id == first.id

    def test_identical_bytes_under_a_new_name_are_not_a_replay(self, evidence_world):
        """The 7.2 <-> 7.3 contract answer: a deliberate re-upload is a new command.

        Byte-identity alone would report the *old* document as current after an
        action the student experienced as a replacement — STU-19's "'Replace' may
        clear only local UI state", reappearing on the server side.
        """
        application, first = evidence_world
        assert (
            evidence.find_identical_current_version(
                application.id,
                ["result_slip"],
                first.content_hash,
                document_name="a-different-name.pdf",
            )
            is None
        )

    def test_a_deleted_row_holding_the_slot_does_not_block_a_new_version(
        self, evidence_world
    ):
        """A soft-deleted row must not permanently occupy the one-current slot.

        The pre-7.3 delete path left ``verification_status='deleted'`` with
        ``is_current`` untouched, and task 3.5's backfill assigns ``is_current`` by
        newest ``uploaded_at`` without consulting the deletion. Such a row is
        invisible to every reader yet holds the slot the database enforces, so the
        requirement could never be satisfied again.
        """
        from apps.documents.models import ApplicationDocument

        application, first = evidence_world
        # Reproduce the legacy shape: deleted, but still holding the slot.
        ApplicationDocument.objects.filter(id=first.id).update(
            verification_status="deleted",
            lifecycle_state=evidence.DELETED,
            is_current=True,
        )

        replacement = evidence.commit_version(
            stage=_stage_for(application),
            application_id=application.id,
            document_type="result_slip",
            document_name="slip-v2.pdf",
            file_url=None,
            storage_key="documents/slip-v2.pdf",
            file_size=2048,
            mime_type="application/pdf",
            content_hash="b" * 64,
        )

        assert replacement.is_current is True
        first.refresh_from_db()
        # The slot is released, and the deletion is still the truth about the row.
        assert first.is_current is False
        assert first.lifecycle_state == evidence.DELETED
        assert first.verification_status == "deleted"
        # A deleted row is history, never the parent of a new version.
        assert replacement.supersedes_id is None
        assert (
            ApplicationDocument.objects.filter(
                application_id=application.id, document_type="result_slip", is_current=True
            ).count()
            == 1
        )


@pytest.mark.django_db(transaction=True)
class TestIdempotencyKeyReplay:
    """R17.1: the caller-declared command identity, read through the stage ledger.

    ``uq_document_upload_stages_idempotency`` already made
    ``(application, document_type, idempotency_key)`` unique, but nothing read it,
    so a client that retried with the same key hit an ``IntegrityError`` on the
    stage insert instead of the replay the header was asking for.
    """

    def test_a_committed_idempotency_key_replays_its_document(self, evidence_world):
        application, _ = evidence_world
        stage = evidence.open_stage(
            application_id=application.id,
            document_type="result_slip",
            object_key=evidence.build_object_key(application.id, "result_slip", mime_type="application/pdf"),
            content_hash="b" * 64,
            file_size=2048,
            mime_type="application/pdf",
            idempotency_key="client-key-1",
        )
        document = evidence.commit_version(
            stage=stage,
            application_id=application.id,
            document_type="result_slip",
            document_name="slip-v2.pdf",
            file_url=None,
            storage_key=stage.object_key,
            file_size=2048,
            mime_type="application/pdf",
            content_hash="b" * 64,
        )

        replay = evidence.find_replay_by_idempotency_key(
            application.id, "result_slip", "client-key-1"
        )
        assert replay is not None and replay.id == document.id
        # An unseen key, and no key at all, are both "not a replay".
        assert (
            evidence.find_replay_by_idempotency_key(application.id, "result_slip", "other")
            is None
        )
        assert evidence.find_replay_by_idempotency_key(application.id, "result_slip", None) is None

    def test_an_uncommitted_idempotency_key_does_not_replay(self, evidence_world):
        """A staged-but-never-committed attempt has no evidence to return.

        Returning something here would be worse than a conflict: the client would
        be told its upload succeeded while the bytes were compensated away.
        """
        application, _ = evidence_world
        stage = evidence.open_stage(
            application_id=application.id,
            document_type="result_slip",
            object_key=evidence.build_object_key(application.id, "result_slip", mime_type="application/pdf"),
            content_hash="b" * 64,
            file_size=2048,
            mime_type="application/pdf",
            idempotency_key="client-key-2",
        )
        assert (
            evidence.find_replay_by_idempotency_key(
                application.id, "result_slip", "client-key-2"
            )
            is None
        )

        evidence.mark_stage(stage, evidence.STAGE_COMPENSATED, error="metadata failed")
        assert (
            evidence.find_replay_by_idempotency_key(
                application.id, "result_slip", "client-key-2"
            )
            is None
        )

    def test_a_duplicate_idempotency_key_is_a_stable_conflict(self, evidence_world):
        """``uq_document_upload_stages_idempotency`` surfaces as a code, not a 500."""
        application, _ = evidence_world

        def _open():
            return evidence.open_stage(
                application_id=application.id,
                document_type="result_slip",
                object_key=evidence.build_object_key(
                    application.id, "result_slip", mime_type="application/pdf"
                ),
                content_hash="b" * 64,
                file_size=2048,
                mime_type="application/pdf",
                idempotency_key="client-key-3",
            )

        _open()
        with pytest.raises(evidence.DocumentCommandError) as excinfo:
            _open()
        assert excinfo.value.code == "DOCUMENT_UPLOAD_IN_PROGRESS"
        assert excinfo.value.status_code == 409


@pytest.mark.django_db(transaction=True)
class TestVerificationHistory:
    def test_a_commit_records_a_history_event(self, evidence_world):
        from apps.documents.models import DocumentVerificationEvent

        application, _ = evidence_world
        document = evidence.commit_version(
            stage=_stage_for(application),
            application_id=application.id,
            document_type="result_slip",
            document_name="slip-v2.pdf",
            file_url=None,
            storage_key="documents/slip-v2.pdf",
            file_size=2048,
            mime_type="application/pdf",
            content_hash="b" * 64,
        )
        events = list(
            DocumentVerificationEvent.objects.filter(application_id=application.id).order_by(
                "created_at"
            )
        )
        types = {event.event_type for event in events}
        assert evidence.EVENT_VERSION_COMMITTED in types
        assert evidence.EVENT_VERSION_SUPERSEDED in types
        committed = next(e for e in events if e.event_type == evidence.EVENT_VERSION_COMMITTED)
        assert committed.document_id == document.id
        assert committed.to_state == evidence.READY_FOR_REVIEW
        assert committed.document_version == 2

    def test_two_reviewer_decisions_both_survive(self, evidence_world):
        """The single ``verification_notes`` column keeps only the latest note.

        History is what makes the earlier decision recoverable — without it, a
        rejection reason disappears the moment a second reviewer verifies.
        """
        from apps.documents.models import DocumentVerificationEvent

        _, document = evidence_world
        evidence.record_verification_decision(
            document=document, decision=evidence.REJECTED, notes="page 2 is unreadable"
        )
        evidence.record_verification_decision(
            document=document, decision=evidence.VERIFIED, notes="rescan is clear"
        )

        notes = [
            event.details.get("notes")
            for event in DocumentVerificationEvent.objects.filter(
                document_id=document.id, event_type=evidence.EVENT_VERIFICATION_DECIDED
            ).order_by("created_at")
        ]
        assert notes == ["page 2 is unreadable", "rescan is clear"]
        document.refresh_from_db()
        assert document.verification_status == "verified"

    def test_history_publishes_only_non_current_versions(self, evidence_world):
        application, first = evidence_world
        evidence.commit_version(
            stage=_stage_for(application),
            application_id=application.id,
            document_type="result_slip",
            document_name="slip-v2.pdf",
            file_url=None,
            storage_key="documents/slip-v2.pdf",
            file_size=2048,
            mime_type="application/pdf",
            content_hash="b" * 64,
        )

        history = evidence.history_rows(application.id)
        rows = history.get("result_slip", [])
        assert [row["id"] for row in rows] == [str(first.id)]
        assert rows[0]["lifecycle_state"] == evidence.SUPERSEDED
        # A history entry answers "what happened", not "what was in the file".
        assert "checksum" not in rows[0] and "file_url" not in rows[0]


@pytest.mark.django_db(transaction=True)
class TestExtractionStateSeparation:
    def test_extraction_never_overwrites_a_human_decision(self, evidence_world):
        """R11.7 — the pre-7.3 defect: a re-extract erased ``verified``."""
        _, document = evidence_world
        evidence.record_verification_decision(
            document=document, decision=evidence.VERIFIED, notes="checked"
        )

        evidence.record_extraction_state(document, "ocr_processing")

        document.refresh_from_db()
        assert document.extraction_state == "ocr_processing"
        assert document.verification_status == "verified", (
            "OCR progress must not overwrite the reviewer's decision"
        )
        assert document.lifecycle_state == evidence.VERIFIED

    def test_extraction_still_projects_for_an_undecided_document(self, evidence_world):
        """Existing clients derive ``ocr_state`` from ``verification_status``."""
        _, document = evidence_world
        evidence.record_extraction_state(document, "ocr_complete")
        document.refresh_from_db()
        assert document.extraction_state == "ocr_complete"
        assert document.verification_status == "ocr_complete"

    def test_an_unknown_extraction_value_is_normalised(self, evidence_world):
        _, document = evidence_world
        evidence.record_extraction_state(document, "not-a-state")
        document.refresh_from_db()
        assert document.extraction_state == "pending"


@pytest.mark.django_db(transaction=True)
class TestStorageCompensation:
    """Failure injection *between* the storage write and the metadata write."""

    def test_compensation_deletes_the_staged_object(self, evidence_world, monkeypatch):
        application, _ = evidence_world
        stage = _stage_for(application)
        deleted: list[str] = []
        monkeypatch.setattr(evidence, "delete_staged_object", lambda key: deleted.append(key))

        result = evidence.compensate_stage(stage, reason="metadata commit failed")

        assert result == evidence.STAGE_COMPENSATED
        assert deleted == [stage.object_key]
        stage.refresh_from_db()
        assert stage.state == evidence.STAGE_COMPENSATED
        assert stage.resolved_at is not None
        assert "metadata commit failed" in (stage.last_error or "")

    def test_a_failed_compensation_is_left_for_the_sweeper(self, evidence_world, monkeypatch):
        """Marking it compensated would make the orphan permanent and invisible."""
        application, _ = evidence_world
        stage = _stage_for(application)

        def _boom(_key):
            raise RuntimeError("R2 unreachable")

        monkeypatch.setattr(evidence, "delete_staged_object", _boom)
        result = evidence.compensate_stage(stage, reason="metadata commit failed")

        assert result == evidence.STAGE_COMPENSATION_PENDING
        stage.refresh_from_db()
        assert stage.state == evidence.STAGE_COMPENSATION_PENDING
        assert stage.attempts == 1
        assert stage.resolved_at is None
        assert "R2 unreachable" in (stage.last_error or "")

    def test_an_error_message_cannot_overflow_the_column(self, evidence_world, monkeypatch):
        application, _ = evidence_world
        stage = _stage_for(application)
        monkeypatch.setattr(
            evidence,
            "delete_staged_object",
            lambda key: (_ for _ in ()).throw(RuntimeError("x" * 5000)),
        )
        evidence.compensate_stage(stage, reason="metadata commit failed")
        stage.refresh_from_db()
        assert len(stage.last_error) <= 500

    def test_the_stage_row_is_committed_before_the_object_write(self, evidence_world):
        """Design §17 — "queued" means a committed durable record exists.

        A stage row that only existed in the request's own transaction would be
        invisible to the sweeper, which is the whole failure mode STU-19 names.
        """
        from apps.documents.models import DocumentUploadStage

        application, _ = evidence_world
        stage = _stage_for(application)
        assert DocumentUploadStage.objects.filter(id=stage.id, state=evidence.STAGE_STAGED).exists()
        assert stage.created_at is not None


class _FakeStorage:
    """A storage double whose durability answers are chosen by the test.

    ``exists``/``size`` are the two questions the verification seam asks. Setting
    either to ``None`` models a backend that does not implement that probe.
    """

    def __init__(self, *, exists=True, size=None, raises=None):
        self._exists = exists
        self._size = size
        self._raises = raises
        self.probed: list[str] = []

    def exists(self, key):
        self.probed.append(f"exists:{key}")
        if self._raises is not None:
            raise self._raises
        return self._exists

    def size(self, key):
        self.probed.append(f"size:{key}")
        if self._raises is not None:
            raise self._raises
        return self._size


class TestStoredObjectVerification:
    """The other direction of the gap: the write "succeeded" but is not durable.

    Compensation can delete an object the database never recorded. Nothing can
    recover bytes the provider never kept — so the metadata commit is ordered
    *after* proof of durability, and this is that proof.
    """

    def test_a_verified_object_lets_the_commit_proceed(self):
        storage = _FakeStorage(exists=True, size=2048)
        evidence.verify_stored_object(storage, "documents/x.pdf", expected_size=2048)
        assert storage.probed == ["exists:documents/x.pdf", "size:documents/x.pdf"]

    def test_a_missing_object_is_refused_with_a_stable_code(self):
        storage = _FakeStorage(exists=False)
        with pytest.raises(evidence.DocumentCommandError) as excinfo:
            evidence.verify_stored_object(storage, "documents/gone.pdf", expected_size=2048)
        assert excinfo.value.code == "DOCUMENT_STORAGE_UNVERIFIED"
        assert excinfo.value.status_code == 500

    def test_a_truncated_object_is_refused(self):
        """A short write is the corruption an existence check cannot see."""
        storage = _FakeStorage(exists=True, size=17)
        with pytest.raises(evidence.DocumentCommandError) as excinfo:
            evidence.verify_stored_object(storage, "documents/short.pdf", expected_size=2048)
        assert excinfo.value.code == "DOCUMENT_STORAGE_UNVERIFIED"

    def test_a_zero_length_object_is_refused(self):
        storage = _FakeStorage(exists=True, size=0)
        with pytest.raises(evidence.DocumentCommandError):
            evidence.verify_stored_object(storage, "documents/empty.pdf", expected_size=2048)

    def test_a_provider_error_fails_closed(self):
        """An unanswerable question about durability is not a yes."""
        storage = _FakeStorage(raises=RuntimeError("R2 HEAD timeout"))
        with pytest.raises(evidence.DocumentCommandError) as excinfo:
            evidence.verify_stored_object(storage, "documents/x.pdf", expected_size=2048)
        assert excinfo.value.code == "DOCUMENT_STORAGE_UNVERIFIED"

    def test_a_backend_without_probes_does_not_block_the_upload(self):
        """Trading a rare silent corruption for a total outage is the worse deal."""

        class _NoProbes:
            pass

        evidence.verify_stored_object(_NoProbes(), "documents/x.pdf", expected_size=2048)

    def test_an_unreportable_size_is_treated_as_unknown_not_as_a_mismatch(self):
        storage = _FakeStorage(exists=True, size=None)
        evidence.verify_stored_object(storage, "documents/x.pdf", expected_size=2048)
        assert "size:documents/x.pdf" in storage.probed

    def test_the_size_probe_is_skipped_when_the_streamed_length_is_unknown(self):
        storage = _FakeStorage(exists=True, size=99)
        evidence.verify_stored_object(storage, "documents/x.pdf", expected_size=None)
        assert storage.probed == ["exists:documents/x.pdf"]


@pytest.mark.django_db(transaction=True)
class TestReconciliationSweeper:
    def _age(self, stage, seconds):
        from apps.documents.models import DocumentUploadStage

        DocumentUploadStage.objects.filter(id=stage.id).update(
            created_at=timezone.now() - timezone.timedelta(seconds=seconds)
            if hasattr(timezone, "timedelta")
            else timezone.now()
        )

    def test_an_abandoned_stage_is_reconciled(self, evidence_world, monkeypatch):
        from datetime import timedelta

        from apps.documents.models import DocumentUploadStage
        from apps.documents.tasks import reconcile_document_storage_task

        application, _ = evidence_world
        stage = _stage_for(application)
        DocumentUploadStage.objects.filter(id=stage.id).update(
            created_at=timezone.now() - timedelta(hours=2)
        )
        deleted: list[str] = []
        monkeypatch.setattr(evidence, "delete_staged_object", lambda key: deleted.append(key))

        summary = reconcile_document_storage_task()

        assert summary["reconciled"] == 1
        assert deleted == [stage.object_key]
        stage.refresh_from_db()
        assert stage.state == evidence.STAGE_COMPENSATED

    def test_a_recent_stage_is_left_alone(self, evidence_world, monkeypatch):
        """A live upload may be seconds from committing its metadata."""
        from apps.documents.tasks import reconcile_document_storage_task

        application, _ = evidence_world
        stage = _stage_for(application)
        deleted: list[str] = []
        monkeypatch.setattr(evidence, "delete_staged_object", lambda key: deleted.append(key))

        summary = reconcile_document_storage_task()

        assert summary["reconciled"] == 0
        assert deleted == []
        stage.refresh_from_db()
        assert stage.state == evidence.STAGE_STAGED

    def test_a_committed_document_is_never_deleted_by_the_sweeper(
        self, evidence_world, monkeypatch
    ):
        """Self-healing: stale bookkeeping is not an orphan.

        Deleting the object of a committed version would destroy live evidence —
        the one outcome worse than leaving an orphan behind.
        """
        from datetime import timedelta

        from apps.documents.models import ApplicationDocument, DocumentUploadStage
        from apps.documents.tasks import reconcile_document_storage_task

        application, document = evidence_world
        stage = evidence.open_stage(
            application_id=application.id,
            document_type="result_slip",
            object_key=document.storage_key,
            content_hash=document.content_hash,
            file_size=document.file_size,
            mime_type=document.mime_type,
        )
        DocumentUploadStage.objects.filter(id=stage.id).update(
            created_at=timezone.now() - timedelta(hours=2)
        )
        deleted: list[str] = []
        monkeypatch.setattr(evidence, "delete_staged_object", lambda key: deleted.append(key))

        summary = reconcile_document_storage_task()

        assert summary["recovered"] == 1
        assert deleted == []
        stage.refresh_from_db()
        assert stage.state == evidence.STAGE_COMMITTED
        assert stage.document_id == document.id
        assert ApplicationDocument.objects.filter(id=document.id).exists()

    def test_compensation_retries_are_bounded_then_terminal(self, evidence_world, monkeypatch):
        """R17.4 — bounded retries; an exhausted row becomes operator-visible."""
        from datetime import timedelta

        from apps.documents.models import DocumentUploadStage
        from apps.documents.tasks import reconcile_document_storage_task

        application, _ = evidence_world
        stage = _stage_for(application)
        DocumentUploadStage.objects.filter(id=stage.id).update(
            created_at=timezone.now() - timedelta(hours=2),
            state=evidence.STAGE_COMPENSATION_PENDING,
            attempts=evidence.MAX_COMPENSATION_ATTEMPTS,
        )
        monkeypatch.setattr(
            evidence,
            "delete_staged_object",
            lambda key: (_ for _ in ()).throw(AssertionError("must not retry")),
        )

        summary = reconcile_document_storage_task()

        assert summary["orphaned"] == 1
        stage.refresh_from_db()
        assert stage.state == evidence.STAGE_ORPHANED
        assert stage.resolved_at is not None

    def test_the_sweeper_never_raises(self, evidence_world, monkeypatch):
        from datetime import timedelta

        from apps.documents.models import DocumentUploadStage
        from apps.documents.tasks import reconcile_document_storage_task

        application, _ = evidence_world
        stage = _stage_for(application)
        DocumentUploadStage.objects.filter(id=stage.id).update(
            created_at=timezone.now() - timedelta(hours=2)
        )
        monkeypatch.setattr(
            evidence,
            "compensate_stage",
            lambda *a, **k: (_ for _ in ()).throw(RuntimeError("unexpected")),
        )
        summary = reconcile_document_storage_task()
        assert summary["pending"] == 1

    def test_the_sweeper_is_registered_on_the_beat_schedule(self):
        """A sweeper nothing runs is not durable reconciliation (R17.4)."""
        from django.conf import settings

        tasks = {
            entry["task"] for entry in settings.CELERY_BEAT_SCHEDULE.values()
        }
        assert "apps.documents.tasks.reconcile_document_storage_task" in tasks


def _apply(path: Path) -> None:
    """Run a migration script body inside the current test transaction.

    ``BEGIN``/``COMMIT`` are stripped so the statements join the test's
    transaction (and roll back with it) instead of committing through it. Every
    other statement — and therefore every behaviour asserted below — is the file
    ``apply_sql_migrations`` runs verbatim.
    """
    body = re.sub(r"(?im)^\s*(BEGIN|COMMIT)\s*;\s*$", "", path.read_text())
    with connection.cursor() as cursor:
        cursor.execute(body)


def _columns(table: str) -> set[str]:
    with connection.cursor() as cursor:
        return {
            column.name
            for column in connection.introspection.get_table_description(cursor, table)
        }


def _objects_present() -> dict[str, bool]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                (SELECT count(*) FROM pg_constraint
                  WHERE conname = 'chk_application_documents_lifecycle_state'),
                (SELECT count(*) FROM pg_constraint
                  WHERE conname = 'chk_application_documents_extraction_state'
                    AND convalidated),
                (SELECT count(*) FROM pg_indexes
                  WHERE indexname = 'idx_application_documents_lifecycle_open'),
                (SELECT count(*) FROM pg_indexes
                  WHERE indexname = 'uq_document_upload_stages_object_key'),
                (SELECT count(*) FROM pg_indexes
                  WHERE indexname = 'idx_document_verification_events_document'),
                (SELECT count(*) FROM pg_constraint
                  WHERE conname = 'chk_document_upload_stages_state')
            """
        )
        row = cursor.fetchone()
    return {
        "lifecycle_check": bool(row[0]),
        "extraction_check_validated": bool(row[1]),
        "lifecycle_open_index": bool(row[2]),
        "stage_object_key_unique": bool(row[3]),
        "history_index": bool(row[4]),
        "stage_state_check": bool(row[5]),
    }


@pytest.mark.django_db
class TestMigrationApplies:
    """The deliverable runs — twice — against a real Postgres, then reverses.

    Parsing the script proves what it says; applying it proves what it does. The
    boot sweep re-runs every migration on every deploy, so "applies cleanly a
    second time" is a production requirement, not a nicety.
    """

    def test_forward_script_applies_and_is_idempotent(self):
        if connection.vendor != "postgresql":
            pytest.skip("the migration deliverable targets Postgres")

        _apply(FORWARD)
        after_first = _objects_present()
        _apply(FORWARD)
        after_second = _objects_present()

        assert all(after_first.values()), after_first
        assert after_second == after_first
        assert {"lifecycle_state", "storage_key", "extraction_state"} <= _columns(
            "application_documents"
        )

    def test_the_backfill_derives_a_legal_lifecycle_for_every_legacy_row(
        self, tenant_world
    ):
        """A pre-7.3 row's lifecycle is derived, and the CHECK accepts it."""
        if connection.vendor != "postgresql":
            pytest.skip("the migration deliverable targets Postgres")
        from apps.documents.models import ApplicationDocument

        legacy = ApplicationDocument.objects.create(
            application=tenant_world.application,
            document_type="transcript",
            document_name="legacy.pdf",
            verification_status="ocr_processing",
            version=1,
            is_current=True,
            uploaded_at=timezone.now(),
        )
        ApplicationDocument.objects.filter(id=legacy.id).update(
            lifecycle_state=None, extraction_state=None
        )
        # Flush the deferred FK triggers the inserts above queued; Postgres
        # refuses ALTER TABLE while a table has pending trigger events, and the
        # real boot sweep never runs mid-transaction with unflushed inserts.
        with connection.cursor() as cursor:
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")

        _apply(FORWARD)

        legacy.refresh_from_db()
        assert legacy.lifecycle_state in evidence.LIFECYCLE_STATES
        # An in-flight OCR value moves to its proper home and the legacy column is
        # left exactly as it was, so an existing reader keeps working.
        assert legacy.extraction_state == "ocr_processing"
        assert legacy.verification_status == "ocr_processing"

    def test_the_rollback_removes_every_object_the_forward_script_added(self):
        """Reversible in one step, and re-appliable afterwards."""
        if connection.vendor != "postgresql":
            pytest.skip("the migration deliverable targets Postgres")

        _apply(FORWARD)
        _apply(ROLLBACK)

        remaining = _objects_present()
        assert not any(remaining.values()), remaining
        assert not {"lifecycle_state", "storage_key", "extraction_state"} & _columns(
            "application_documents"
        )
        assert "document_upload_stages" not in set(connection.introspection.table_names())

        _apply(FORWARD)
        assert all(_objects_present().values())

    def test_the_alignment_script_frees_a_stuck_slot_and_is_idempotent(
        self, tenant_world
    ):
        """The repair, against a real Postgres with the real index in place.

        Reproduces the exact production shape: a soft delete through the pre-7.3
        path (``verification_status='deleted'``, ``is_current`` left true) landing
        on the newest upload, which task 3.5's backfill would have made current.
        Before the script the requirement cannot accept a replacement at all;
        afterwards the live version holds the slot and the deletion is still the
        truth about the row it belongs to.
        """
        if connection.vendor != "postgresql":
            pytest.skip("the one-current index predicate is Postgres-specific")
        from apps.documents.models import ApplicationDocument

        application = tenant_world.application
        live = ApplicationDocument.objects.create(
            application=application,
            document_type="transcript",
            document_name="v1.pdf",
            version=1,
            is_current=False,
            lifecycle_state=evidence.READY_FOR_REVIEW,
            verification_status="pending",
            uploaded_at=timezone.now() - timedelta(hours=2),
        )
        stuck = ApplicationDocument.objects.create(
            application=application,
            document_type="transcript",
            document_name="v2.pdf",
            version=2,
            is_current=True,
            lifecycle_state=evidence.DELETED,
            verification_status="deleted",
            uploaded_at=timezone.now() - timedelta(hours=1),
        )

        # The defect: no replacement is possible while the deleted row holds it.
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                ApplicationDocument.objects.create(
                    application=application,
                    document_type="transcript",
                    document_name="v3.pdf",
                    version=3,
                    is_current=True,
                    uploaded_at=timezone.now(),
                )

        with connection.cursor() as cursor:
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        _apply(ALIGN)

        live.refresh_from_db()
        stuck.refresh_from_db()
        assert live.is_current is True, "the newest live version should hold the slot"
        assert stuck.is_current is False
        # The deletion is preserved — the script releases a slot, it does not
        # revive or rewrite evidence (R11.8).
        assert stuck.lifecycle_state == evidence.DELETED
        assert stuck.verification_status == "deleted"

        # Re-runnable: the second pass must not promote a second row.
        _apply(ALIGN)
        assert (
            ApplicationDocument.objects.filter(
                application_id=application.id, document_type="transcript", is_current=True
            ).count()
            == 1
        )


@pytest.mark.django_db(transaction=True)
class TestSchemaShape:
    """The migration's objects exist in the database the tests run against."""

    def test_one_current_partial_unique_index_exists(self):
        if connection.vendor != "postgresql":
            pytest.skip("index predicate introspection is Postgres-specific")
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT indexdef FROM pg_indexes
                WHERE tablename = 'application_documents'
                  AND indexname = 'uq_application_documents_one_current'
                """
            )
            row = cursor.fetchone()
        assert row is not None, "the one-current partial unique index is missing"
        assert "is_current" in row[0].lower()

    def test_the_new_tables_exist(self):
        tables = set(connection.introspection.table_names())
        assert "document_upload_stages" in tables
        assert "document_verification_events" in tables
