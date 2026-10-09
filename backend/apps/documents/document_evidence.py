"""Immutable document evidence versions and storage compensation (task 7.3).

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` — task **7.3**.
Requirements: R11.7 (uploads are immutable evidence versions carrying checksum,
              owner, type, scan/extraction status, verification actor, and
              *structured* notes; extracted analysis is not overloaded into human
              verification notes), R11.8 (the database enforces one current
              version per application+requirement; replace/delete update metadata
              atomically with object-storage compensation and preserve prior
              evidence history), R17.1 (every multi-step command defines
              transaction boundaries, idempotency, retry, timeout, compensation,
              and a stable operator-visible event), R17.2 (structured logs with no
              document bytes or unnecessary PII), R17.3 (document-job metrics),
              R17.4 (durable reconciliation for the storage provider).
Findings:     **STU-19** — "Document storage and database updates are not
              compensated atomically, current/superseded versions are not
              enforced, and 'Replace' may clear only local UI state."
Design:       §9.3 — lifecycle ``uploaded -> scanning -> ready_for_review ->
              verified``, ``-> rejected -> replacement uploaded``,
              ``uploaded|scanning -> processing_failed -> retry``; "a partial
              unique index enforces one current document per application and
              requirement"; "object upload and metadata use a staged object key
              plus committed metadata; on failure, compensation deletes the staged
              object or a sweeper reconciles it". §17 — "queued" means a committed
              durable record exists; operational queues expose age and
              terminal-failure counts for document processing.

The two-writer problem this module exists to solve
--------------------------------------------------
Before 7.3 an upload was two independent writes with no relationship: put the
bytes in object storage, then insert a row. Every interleaving failure was
silent — a dead process between the two left a paid-for orphan object nobody
could find, and a second upload of the same type left two rows both claiming to
be the evidence, with "current" decided by whichever timestamp sorted last.
"Replace" inherited that: nothing superseded anything, so the prior evidence and
the new evidence were indistinguishable to the server.

The command sequence here makes that ordering explicit and recoverable:

```text
1. hash the bytes (sha256)               -> integrity + idempotency identity
2. short-circuit an identical re-upload  -> no duplicate version (R17.1)
3. COMMIT a stage row  (state=staged)    -> the object becomes discoverable
4. write the object at the staged key
5. COMMIT metadata in ONE transaction:
      lock the requirement's rows,
      supersede the current version,
      insert the new immutable version,
      append a verification-history event,
      mark the stage committed
   on failure -> compensate: delete the staged object, mark compensated;
                 if the delete also fails, leave compensation_pending for the
                 reconciliation sweeper (never a silent orphan)
```

Nothing in this module writes ``ApplicationDocument.verification_status`` for a
machine reason. ``lifecycle_state`` is the canonical state; the legacy column is
maintained purely as a projection so existing readers keep working, and OCR
progress now lives in ``extraction_state``.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import uuid
from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.common.metrics import emit_metric
from apps.documents.models import (
    ApplicationDocument,
    DocumentUploadStage,
    DocumentVerificationEvent,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifecycle (design §9.3)
# ---------------------------------------------------------------------------

UPLOADED = "uploaded"
SCANNING = "scanning"
READY_FOR_REVIEW = "ready_for_review"
VERIFIED = "verified"
REJECTED = "rejected"
PROCESSING_FAILED = "processing_failed"
SUPERSEDED = "superseded"
DELETED = "deleted"

#: Every legal lifecycle value. Mirrored by the database CHECK
#: ``chk_application_documents_lifecycle_state``.
LIFECYCLE_STATES: tuple[str, ...] = (
    UPLOADED,
    SCANNING,
    READY_FOR_REVIEW,
    VERIFIED,
    REJECTED,
    PROCESSING_FAILED,
    SUPERSEDED,
    DELETED,
)

#: The design §9.3 transition table. ``superseded`` and ``deleted`` are terminal:
#: an immutable version that has been replaced or removed is never revived — a
#: student uploads a *new* version instead, which is what keeps history honest.
LIFECYCLE_TRANSITIONS: dict[str, frozenset[str]] = {
    UPLOADED: frozenset({SCANNING, READY_FOR_REVIEW, PROCESSING_FAILED, SUPERSEDED, DELETED}),
    SCANNING: frozenset({READY_FOR_REVIEW, PROCESSING_FAILED, SUPERSEDED, DELETED}),
    READY_FOR_REVIEW: frozenset({VERIFIED, REJECTED, SCANNING, SUPERSEDED, DELETED}),
    # A reviewer may revisit their own decision (the admin verify endpoint has
    # always allowed verified <-> rejected); replacement/removal stays available.
    VERIFIED: frozenset({REJECTED, SUPERSEDED, DELETED}),
    REJECTED: frozenset({VERIFIED, SUPERSEDED, DELETED}),
    PROCESSING_FAILED: frozenset({SCANNING, READY_FOR_REVIEW, SUPERSEDED, DELETED}),
    SUPERSEDED: frozenset(),
    DELETED: frozenset(),
}

#: Lifecycle states that mean "this version is no longer the application's
#: evidence for its requirement".
NON_CURRENT_LIFECYCLE_STATES: frozenset[str] = frozenset({SUPERSEDED, DELETED})

#: Legacy ``verification_status`` projection per lifecycle state. Kept so every
#: pre-7.3 reader (the readiness gates, the student document list, the admin
#: review surfaces) sees exactly the value it saw before.
LEGACY_STATUS_PROJECTION: dict[str, str] = {
    UPLOADED: "pending",
    SCANNING: "pending",
    READY_FOR_REVIEW: "pending",
    PROCESSING_FAILED: "pending",
    VERIFIED: "verified",
    REJECTED: "rejected",
    DELETED: "deleted",
}

#: Extraction (OCR) vocabulary. Mirrored by the database CHECK
#: ``chk_application_documents_extraction_state``.
EXTRACTION_STATES: tuple[str, ...] = (
    "pending",
    "ocr_processing",
    "ocr_complete",
    "ocr_no_text",
    "ocr_no_grades",
    "ocr_failed",
    "ocr_skipped",
)

#: Provenance values published on a committed version.
PROVENANCE_STUDENT = "student_upload"
PROVENANCE_ADMIN = "admin_upload"
PROVENANCE_SYSTEM = "system_generated"

#: Stable operator-visible event names (R17.1). Written to
#: ``document_verification_events.event_type`` and emitted as metrics.
EVENT_VERSION_COMMITTED = "document.version.committed"
EVENT_VERSION_SUPERSEDED = "document.version.superseded"
EVENT_VERSION_DELETED = "document.version.deleted"
EVENT_VERIFICATION_DECIDED = "document.verification.decided"
EVENT_EXTRACTION_STATE = "document.extraction.state"
EVENT_STAGE_COMPENSATED = "document.stage.compensated"
EVENT_STAGE_UNVERIFIED = "document.stage.unverified"
EVENT_STAGE_COMPENSATION_PENDING = "document.stage.compensation_pending"
EVENT_STAGE_RECONCILED = "document.stage.reconciled"
EVENT_STAGE_ORPHANED = "document.stage.orphaned"

#: Stage ledger states (mirrored by ``chk_document_upload_stages_state``).
STAGE_STAGED = "staged"
STAGE_COMMITTED = "committed"
STAGE_COMPENSATED = "compensated"
STAGE_COMPENSATION_PENDING = "compensation_pending"
STAGE_WRITE_FAILED = "write_failed"
STAGE_ORPHANED = "orphaned"

#: How many compensation attempts a stage gets before it is declared a terminal
#: orphan that needs a human (bounded retries — R17.4).
MAX_COMPENSATION_ATTEMPTS = 5

#: Bytes read per hashing chunk. Bounded so a 10MB upload never materialises
#: twice in memory.
_HASH_CHUNK_BYTES = 64 * 1024

#: Cap on the operator-facing error text stored on a stage row. The column is
#: varchar(500); truncating here keeps a provider message from ever failing the
#: write we are performing precisely because something already failed.
_MAX_ERROR_CHARS = 480


class DocumentCommandError(Exception):
    """A document command that could not be completed, with a stable code."""

    def __init__(self, code: str, message: str, *, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


# ---------------------------------------------------------------------------
# Derivation helpers
# ---------------------------------------------------------------------------


def lifecycle_of(document) -> str:
    """The canonical lifecycle state of *document*.

    Uses the stored ``lifecycle_state`` when present and legal. Otherwise derives
    it from the legacy columns, because a pre-7.3 row's lifecycle is a fact to be
    *read*, not a default to be invented: ``is_current=False`` means superseded, a
    human decision means verified/rejected, a soft-delete means deleted, and
    anything else means the evidence is on file awaiting review.
    """
    return lifecycle_from_row(
        {
            "lifecycle_state": getattr(document, "lifecycle_state", None),
            "is_current": getattr(document, "is_current", True),
            "verification_status": getattr(document, "verification_status", None),
        }
    )


def lifecycle_from_row(row: dict[str, Any]) -> str:
    """:func:`lifecycle_of` for a ``.values()`` dict rather than a model instance.

    Keeps the derivation in exactly one place while letting the read paths use
    ``.values()`` (no model instantiation for a list of history rows).
    """
    stored = (row.get("lifecycle_state") or "").strip()
    if stored in LIFECYCLE_STATES:
        return stored
    if row.get("is_current") is False:
        return SUPERSEDED
    status = (row.get("verification_status") or "").strip().lower()
    if status == "verified":
        return VERIFIED
    if status == "rejected":
        return REJECTED
    if status == "deleted":
        return DELETED
    return READY_FOR_REVIEW


def legacy_status_for(lifecycle_state: str, *, fallback: str | None = None) -> str | None:
    """The ``verification_status`` projection for a lifecycle state.

    ``superseded`` deliberately has no projection: a superseded row keeps the
    verification status it held, so the prior evidence's own review outcome is
    preserved exactly (R11.8) rather than being rewritten to a value no legacy
    reader understands.
    """
    if lifecycle_state == SUPERSEDED:
        return fallback
    return LEGACY_STATUS_PROJECTION.get(lifecycle_state, fallback)


def can_transition(from_state: str, to_state: str) -> bool:
    """True when design §9.3 permits ``from_state -> to_state``."""
    if from_state == to_state:
        return True
    return to_state in LIFECYCLE_TRANSITIONS.get(from_state, frozenset())


def compute_checksum(file_obj) -> tuple[str, int]:
    """Stream *file_obj* once and return ``(sha256_hex, byte_length)``.

    Restores the stream position afterwards so the caller can still hand the same
    object to the storage backend. The hash is the integrity checksum stored on
    the version (R11.7) *and* the idempotency identity for a retried upload
    (R17.1) — one pass, two guarantees.
    """
    digest = hashlib.sha256()
    total = 0
    try:
        file_obj.seek(0)
    except Exception:  # pragma: no cover - not every file-like supports seek
        pass

    if hasattr(file_obj, "chunks"):
        for chunk in file_obj.chunks(_HASH_CHUNK_BYTES):
            digest.update(chunk)
            total += len(chunk)
    else:
        while True:
            chunk = file_obj.read(_HASH_CHUNK_BYTES)
            if not chunk:
                break
            digest.update(chunk)
            total += len(chunk)

    try:
        file_obj.seek(0)
    except Exception:  # pragma: no cover
        pass
    return digest.hexdigest(), total


def safe_object_name(raw_name: str | None) -> str:
    """A storage-safe basename derived from a client-supplied filename."""
    name = os.path.basename(str(raw_name or "unnamed"))
    name = re.sub(r"[^\w\s\-.]", "_", name)[:255]
    return name or "unnamed"


def build_object_key(application_id, document_type: str, file_name: str) -> str:
    """The staged object key for one upload attempt.

    Every attempt gets its own random segment, so a retry never overwrites the
    object a previous attempt may still be referenced by, and the key is unique
    (``uq_document_upload_stages_object_key``). ``document_type`` is included so an
    operator reading a bucket listing can tell what an orphan was for without a
    database round-trip.
    """
    return (
        f"documents/{application_id}/{document_type}/"
        f"{uuid.uuid4().hex}_{safe_object_name(file_name)}"
    )


def _truncate(value: Any) -> str:
    return str(value or "")[:_MAX_ERROR_CHARS]


# ---------------------------------------------------------------------------
# Verification history (append-only)
# ---------------------------------------------------------------------------


def record_event(
    *,
    document,
    from_state: str | None,
    to_state: str,
    event_type: str,
    actor_id=None,
    actor_role: str | None = None,
    details: dict[str, Any] | None = None,
) -> DocumentVerificationEvent | None:
    """Append one history row. Never raises into the caller's command.

    History is evidence about a decision, not the decision itself: a failed
    history write must not roll back a student's upload or a reviewer's verdict.
    The failure is logged with the stable event name so it is visible in
    operations rather than silent.
    """
    try:
        return DocumentVerificationEvent.objects.create(
            document_id=document.id,
            application_id=document.application_id,
            from_state=from_state,
            to_state=to_state,
            event_type=event_type,
            actor_id=actor_id,
            actor_role=actor_role,
            details=details or {},
            document_version=getattr(document, "version", None),
            created_at=timezone.now(),
        )
    except Exception:  # pragma: no cover - history must never break a command
        logger.warning(
            "document verification event write failed",
            extra={"event_type": event_type, "document_id": str(getattr(document, "id", ""))},
            exc_info=True,
        )
        return None


def history_rows(application_id, *, document_types: list[str] | None = None) -> dict[str, list[dict[str, Any]]]:
    """Non-current version history per document type, newest first.

    Returns only versions that are no longer the application's evidence, because
    the *current* version is already published by the contract's ``document``
    block; repeating it in ``history`` would make a client render one upload
    twice. Carries no checksum, URL, or file name — a history entry answers "what
    happened to this requirement", and the bytes of a superseded document are not
    part of that answer.
    """
    query = ApplicationDocument.objects.filter(application_id=application_id)
    if document_types:
        query = query.filter(document_type__in=list(document_types))

    grouped: dict[str, list[dict[str, Any]]] = {}
    rows = list(
        query.values(
            "id",
            "document_type",
            "version",
            "is_current",
            "lifecycle_state",
            "verification_status",
            "uploaded_at",
            "superseded_at",
            "created_at",
        )
    )
    for row in rows:
        lifecycle = lifecycle_from_row(row)
        if lifecycle not in NON_CURRENT_LIFECYCLE_STATES:
            continue
        document_type = str(row["document_type"])
        uploaded_at = row["uploaded_at"] or row["created_at"]
        superseded_at = row["superseded_at"]
        grouped.setdefault(document_type, []).append(
            {
                "id": str(row["id"]),
                "document_type": document_type,
                "version": row["version"],
                "lifecycle_state": lifecycle,
                "uploaded_at": uploaded_at.isoformat() if hasattr(uploaded_at, "isoformat") else uploaded_at,
                "superseded_at": superseded_at.isoformat()
                if hasattr(superseded_at, "isoformat")
                else superseded_at,
            }
        )

    for entries in grouped.values():
        entries.sort(key=lambda entry: (entry["version"] or 0), reverse=True)
    return grouped


# ---------------------------------------------------------------------------
# The staged-write command
# ---------------------------------------------------------------------------


def find_identical_current_version(
    application_id,
    document_types: list[str],
    content_hash: str,
    *,
    document_name: str | None = None,
):
    """The current version this upload is a *replay of*, if any.

    This is the upload command's implicit idempotency identity (R17.1). A student
    on a weak connection whose response was lost retries the same file; without
    this the platform would store a second identical object and call it version 2,
    making the version chain a record of network conditions rather than of
    evidence.

    Byte-identity alone is **not** that identity, and treating it as one was the
    7.2 ↔ 7.3 contract defect: a student who deliberately uploads a second file
    that happens to be byte-identical (the same scan saved under a new name, a
    re-export of the same page) is issuing a *new* command, and answering it with
    the previously stored version left the requirements contract reporting the old
    document as current after an action the student experienced as a replacement.
    That is STU-19's "'Replace' may clear only local UI state" reappearing on the
    server side — the request succeeded, the response was 201, and nothing changed.

    So when ``document_name`` is supplied it is part of the identity: the same
    bytes under the same name is the only shape a lost-response retry can take
    (a retry resends the identical multipart body), while the same bytes under a
    different name is a deliberate new version. Called without ``document_name``
    the lookup stays a pure byte-identity question, which is what the
    reconciliation and history readers want.
    """
    if not content_hash:
        return None
    query = ApplicationDocument.objects.filter(
        application_id=application_id,
        document_type__in=list(document_types),
        content_hash=content_hash,
        is_current=True,
    ).exclude(verification_status="deleted")
    if document_name is not None:
        query = query.filter(document_name=document_name)
    return query.order_by("-version").first()


def find_replay_by_idempotency_key(
    application_id, document_type: str, idempotency_key: str | None
):
    """The document a previous request with this ``Idempotency-Key`` committed.

    The caller-declared identity, and the stronger of the two: when a client says
    "this is the same command I already sent", the platform does not need to
    re-derive that from the bytes. It is also a correctness requirement rather
    than an optimisation — ``uq_document_upload_stages_idempotency`` makes
    ``(application, document_type, idempotency_key)`` unique, so a retry that was
    not short-circuited here would fail on the stage insert with an
    ``IntegrityError`` the caller cannot act on. Reading the ledger first turns
    that into the replay the header was asking for.

    Only a ``committed`` stage replays. A stage that was compensated or is still
    in flight has no evidence to return, so the retry is allowed to proceed and
    genuinely store the document.
    """
    if not idempotency_key:
        return None
    stage = (
        DocumentUploadStage.objects.filter(
            application_id=application_id,
            document_type=document_type,
            idempotency_key=idempotency_key,
            state=STAGE_COMMITTED,
        )
        .exclude(document_id=None)
        .order_by("-created_at")
        .first()
    )
    if stage is None:
        return None
    return (
        ApplicationDocument.objects.filter(id=stage.document_id)
        .exclude(verification_status="deleted")
        .first()
    )


def open_stage(
    *,
    application_id,
    document_type: str,
    object_key: str,
    content_hash: str | None,
    file_size: int | None,
    mime_type: str | None,
    actor_id=None,
    idempotency_key: str | None = None,
) -> DocumentUploadStage:
    """Commit the durable staged-write record **before** the object write.

    The commit ordering is the contract: after this returns, the object key is
    discoverable by the reconciliation sweeper, so a crash between the write and
    the metadata commit degrades to "an orphan the sweeper cleans up" instead of
    "an object nobody knows exists".

    Raises:
        DocumentCommandError: ``DOCUMENT_UPLOAD_IN_PROGRESS`` when
            ``uq_document_upload_stages_idempotency`` already holds this
            ``(application, document_type, idempotency_key)``. That means an
            earlier attempt with the same caller-declared identity is either still
            in flight or ended without committing evidence — neither of which has
            a document to replay — so the honest answer is a retryable conflict
            rather than the ``IntegrityError`` traceback the raw insert produced.
    """
    now = timezone.now()
    try:
        return DocumentUploadStage.objects.create(
            application_id=application_id,
            document_type=document_type,
            object_key=object_key,
            content_hash=content_hash,
            file_size=file_size,
            mime_type=mime_type,
            state=STAGE_STAGED,
            actor_id=actor_id,
            idempotency_key=idempotency_key,
            attempts=0,
            created_at=now,
            updated_at=now,
        )
    except IntegrityError as exc:
        raise DocumentCommandError(
            "DOCUMENT_UPLOAD_IN_PROGRESS",
            "An upload for this document is already being processed. Please try again.",
            status_code=409,
        ) from exc


def mark_stage(stage, state: str, *, error: str | None = None, document=None) -> None:
    """Move a stage row to *state*, recording a bounded operator reason."""
    stage.state = state
    stage.updated_at = timezone.now()
    fields = ["state", "updated_at"]
    if error is not None:
        stage.last_error = _truncate(error)
        fields.append("last_error")
    if document is not None:
        stage.document_id = document.id
        fields.append("document")
    if state in (STAGE_COMMITTED, STAGE_COMPENSATED, STAGE_WRITE_FAILED, STAGE_ORPHANED):
        stage.resolved_at = stage.updated_at
        fields.append("resolved_at")
    stage.save(update_fields=fields)


def delete_staged_object(object_key: str) -> None:
    """Delete one staged object from storage. Raises on provider failure."""
    from apps.common.storage import MediaStorage

    MediaStorage().delete(object_key)


def verify_stored_object(storage, object_key: str, *, expected_size: int | None = None) -> None:
    """Prove the object write is durable **before** metadata calls it evidence.

    This is the other direction of the two-writer problem, and it is closed by
    ordering rather than by an undo. Compensation can delete an object the
    database never recorded (direction A), but nothing can conjure bytes the
    provider never kept: once a version row is committed, the platform treats it
    as the application's evidence, publishes its checksum, and gates submission on
    it. A row describing an object that cannot be read is therefore *worse* than a
    failed upload — the student is told they are done, and the gap only surfaces
    when a reviewer opens an empty document weeks later.

    So the commit is allowed to happen only after the write is confirmed:

    * ``exists()`` — the provider accepted the ``save`` call, but a silently
      dropped or immediately-expired object still answers "no" here.
    * ``size()`` — a truncated / partially-flushed object is the failure a plain
      existence check cannot see. Compared against the byte count
      :func:`compute_checksum` actually streamed, so the object is verified
      against *our own* measurement of the bytes rather than a caller-supplied
      header.

    Both probes are optional-by-capability: a backend that does not implement
    them (or returns a non-integer size) is not treated as a failure, because
    refusing every upload on a storage backend that lacks a HEAD equivalent would
    trade a rare silent corruption for a total outage. A provider *exception*, by
    contrast, fails closed — an unanswerable question about durability is not a
    yes.

    Raises:
        DocumentCommandError: ``DOCUMENT_STORAGE_UNVERIFIED`` when the object is
            missing or the stored length disagrees with the streamed length.
    """
    exists_probe = getattr(storage, "exists", None)
    if callable(exists_probe):
        try:
            present = exists_probe(object_key)
        except Exception as exc:
            raise DocumentCommandError(
                "DOCUMENT_STORAGE_UNVERIFIED",
                "The upload could not be confirmed as stored. Please try again.",
                status_code=500,
            ) from exc
        if present is False:
            raise DocumentCommandError(
                "DOCUMENT_STORAGE_UNVERIFIED",
                "The upload could not be confirmed as stored. Please try again.",
                status_code=500,
            )

    size_probe = getattr(storage, "size", None)
    if expected_size and callable(size_probe):
        try:
            stored_size = size_probe(object_key)
        except Exception as exc:
            raise DocumentCommandError(
                "DOCUMENT_STORAGE_UNVERIFIED",
                "The upload could not be confirmed as stored. Please try again.",
                status_code=500,
            ) from exc
        # ``isinstance`` guard, not a truthiness guard: a backend that cannot
        # report a size returns something non-numeric, which is unknown — while a
        # genuine 0 is a real (and wrong) length worth failing on.
        if isinstance(stored_size, int) and not isinstance(stored_size, bool):
            if stored_size != expected_size:
                raise DocumentCommandError(
                    "DOCUMENT_STORAGE_UNVERIFIED",
                    "The upload could not be confirmed as stored. Please try again.",
                    status_code=500,
                )


def compensate_stage(stage, *, reason: str) -> str:
    """Undo a staged object write after the metadata commit failed.

    Returns the resulting stage state. A provider failure here is **not**
    swallowed into success: the stage stays ``compensation_pending`` so the
    reconciliation sweeper retries it (R17.4), because the alternative — marking
    it compensated and moving on — is how orphan objects become permanent.
    """
    try:
        delete_staged_object(stage.object_key)
    except Exception as exc:
        stage.attempts = (stage.attempts or 0) + 1
        stage.save(update_fields=["attempts"])
        mark_stage(
            stage,
            STAGE_COMPENSATION_PENDING,
            error=f"{reason}; compensating delete failed: {exc}",
        )
        emit_metric(
            EVENT_STAGE_COMPENSATION_PENDING,
            stage_id=str(stage.id),
            document_type=stage.document_type,
            attempts=stage.attempts,
        )
        logger.warning(
            "document staged-object compensation deferred to the sweeper",
            extra={"stage_id": str(stage.id), "document_type": stage.document_type},
        )
        return STAGE_COMPENSATION_PENDING

    mark_stage(stage, STAGE_COMPENSATED, error=reason)
    emit_metric(
        EVENT_STAGE_COMPENSATED,
        stage_id=str(stage.id),
        document_type=stage.document_type,
    )
    return STAGE_COMPENSATED


def commit_version(
    *,
    stage,
    application_id,
    document_type: str,
    document_name: str,
    file_url: str | None,
    storage_key: str,
    file_size: int | None,
    mime_type: str | None,
    content_hash: str,
    uploaded_by_id=None,
    actor_role: str | None = None,
    provenance: str = PROVENANCE_STUDENT,
    lifecycle_state: str = READY_FOR_REVIEW,
    supersede_document_types: list[str] | None = None,
    scan_reason: str | None = None,
) -> ApplicationDocument:
    """Insert the new immutable version and supersede the previous one.

    One transaction, one lock order (the requirement's rows, by primary key), so
    two concurrent uploads for the same requirement cannot both believe they are
    version *n+1*. The database's partial unique index
    ``uq_application_documents_one_current`` is the final race guard (design
    §14.2): if a competing transaction wins, the ``IntegrityError`` surfaces as a
    stable ``DOCUMENT_VERSION_CONFLICT`` rather than a 500.

    ``supersede_document_types`` covers a requirement that accepts several types
    (the identity requirement accepts ``nrc``/``passport``/``extra_kyc``): a new
    passport supersedes the NRC that was satisfying the same requirement, so the
    contract still reports exactly one current document for it.

    The slot is released from **every** row holding ``is_current``, not only from
    the rows this module considers live evidence. Those two populations can
    disagree on legacy data: a row soft-deleted through the pre-7.3 path carries
    ``verification_status='deleted'`` *and* ``is_current=true`` (the column
    default), and task 3.5's version backfill assigns ``is_current`` by newest
    ``uploaded_at`` without consulting the deletion. Such a row is invisible to
    every reader — readiness, the requirements contract, and this module's
    ``lifecycle_of`` all treat it as gone — while still occupying the one-current
    slot the database enforces, which made the requirement permanently
    un-satisfiable: the student's next upload hit a ``UniqueViolation`` and no
    replacement was possible. The database's definition of the slot is therefore
    the authority for *releasing* it; the lifecycle is the authority for what the
    release means. A live row becomes ``superseded`` with a history event; a row
    that is already deleted only has the slot released, so its own deletion
    remains the truth about it (R11.8 "preserve prior evidence history").
    """
    supersede_types = list(supersede_document_types or [document_type])
    if document_type not in supersede_types:
        supersede_types.append(document_type)

    now = timezone.now()
    with transaction.atomic():
        previous_rows = list(
            ApplicationDocument.objects.select_for_update()
            .filter(application_id=application_id, document_type__in=supersede_types)
            .order_by("id")
        )
        # Everything that holds the database's one-current slot, whatever its
        # lifecycle says.
        slot_rows = [row for row in previous_rows if row.is_current]
        # The subset that is genuinely live evidence being replaced.
        current_rows = [
            row for row in slot_rows if lifecycle_of(row) not in NON_CURRENT_LIFECYCLE_STATES
        ]
        highest_version = max((row.version or 1) for row in previous_rows) if previous_rows else 0
        # Only a *current* row is the thing being replaced; a previously deleted
        # row is history, not a parent.
        replaced = current_rows[-1] if current_rows else None

        for row in slot_rows:
            live = row in current_rows
            row.is_current = False
            row.superseded_at = now
            row.updated_at = now
            fields = ["is_current", "superseded_at", "updated_at"]
            if live:
                row.lifecycle_state = SUPERSEDED
                fields.append("lifecycle_state")
            # ``verification_status`` is deliberately NOT rewritten: the prior
            # evidence keeps its own review outcome (R11.8 "preserve prior
            # evidence history"). A already-deleted row also keeps its
            # ``lifecycle_state`` — releasing the slot is bookkeeping, not a new
            # decision about the document.
            row.save(update_fields=fields)
            if not live:
                continue
            record_event(
                document=row,
                from_state=VERIFIED if row.verification_status == "verified" else READY_FOR_REVIEW,
                to_state=SUPERSEDED,
                event_type=EVENT_VERSION_SUPERSEDED,
                actor_id=uploaded_by_id,
                actor_role=actor_role,
                details={"reason": "replaced_by_new_version", "document_type": document_type},
            )

        try:
            document = ApplicationDocument.objects.create(
                application_id=application_id,
                document_type=document_type,
                document_name=document_name,
                file_url=file_url,
                storage_key=storage_key,
                file_size=file_size,
                mime_type=mime_type,
                content_hash=content_hash,
                uploaded_by_id=uploaded_by_id,
                provenance=provenance,
                version=highest_version + 1,
                is_current=True,
                supersedes_id=replaced.id if replaced is not None else None,
                lifecycle_state=lifecycle_state,
                verification_status=legacy_status_for(lifecycle_state, fallback="pending"),
                system_generated=provenance == PROVENANCE_SYSTEM,
                uploaded_at=now,
                created_at=now,
                updated_at=now,
            )
        except IntegrityError as exc:
            raise DocumentCommandError(
                "DOCUMENT_VERSION_CONFLICT",
                "Another upload for this document finished first. Please reload and try again.",
                status_code=409,
            ) from exc

        record_event(
            document=document,
            from_state=UPLOADED,
            to_state=lifecycle_state,
            event_type=EVENT_VERSION_COMMITTED,
            actor_id=uploaded_by_id,
            actor_role=actor_role,
            details={
                "provenance": provenance,
                "supersedes_id": str(replaced.id) if replaced is not None else None,
                "scan": scan_reason or "synchronous_active_content_screen_passed",
            },
        )
        mark_stage(stage, STAGE_COMMITTED, document=document)

    emit_metric(
        EVENT_VERSION_COMMITTED,
        application_id=str(application_id),
        document_type=document_type,
        version=document.version,
        lifecycle_state=lifecycle_state,
        superseded=bool(replaced),
    )
    return document


def record_verification_decision(
    *,
    document,
    decision: str,
    actor_id=None,
    actor_role: str | None = None,
    notes: str | None = None,
) -> ApplicationDocument:
    """Apply a reviewer's verified/rejected decision to the current version.

    Writes ``lifecycle_state`` plus the legacy projection in one transaction and
    appends the decision to history with the actor and the *structured* reason
    (R11.7). The reviewer's note is preserved as history even when a later
    decision overwrites the single ``verification_notes`` column.
    """
    if decision not in (VERIFIED, REJECTED):
        raise DocumentCommandError(
            "INVALID_VERIFICATION_DECISION",
            "A document decision must be verified or rejected.",
        )

    from_state = lifecycle_of(document)
    if not can_transition(from_state, decision):
        raise DocumentCommandError(
            "DOCUMENT_TRANSITION_REJECTED",
            f"A {from_state} document cannot be marked {decision}.",
            status_code=409,
        )

    now = timezone.now()
    with transaction.atomic():
        document.lifecycle_state = decision
        document.verification_status = legacy_status_for(decision, fallback=decision)
        document.verified_by_id = actor_id
        document.verified_at = now
        document.verification_notes = notes
        document.updated_at = now
        document.save(
            update_fields=[
                "lifecycle_state",
                "verification_status",
                "verified_by",
                "verified_at",
                "verification_notes",
                "updated_at",
            ]
        )
        record_event(
            document=document,
            from_state=from_state,
            to_state=decision,
            event_type=EVENT_VERIFICATION_DECIDED,
            actor_id=actor_id,
            actor_role=actor_role,
            details={"notes": notes or "", "decision": decision},
        )

    emit_metric(
        EVENT_VERIFICATION_DECIDED,
        document_type=document.document_type,
        decision=decision,
        version=document.version,
    )
    return document


def delete_document(
    *,
    document,
    actor_id=None,
    actor_role: str | None = None,
    reason: str | None = None,
) -> ApplicationDocument:
    """Remove a document as the application's current evidence.

    The metadata command is a single atomic write: the version stops being
    current, its lifecycle becomes ``deleted``, and the removal is appended to
    history. **The stored object is deliberately retained.** R11.8 requires prior
    evidence to be preserved, and a student who removes the wrong file then has a
    reviewable record instead of a hole; hard object deletion is a retention-policy
    decision, not a click. Because no object write happens, there is nothing to
    compensate — the command is atomic by construction rather than by a
    compensating action that could itself fail.
    """
    from_state = lifecycle_of(document)
    if from_state == DELETED:
        # Idempotent: a repeated delete is the same observable end state, not an
        # error a student should have to understand (R17.1).
        return document
    if not can_transition(from_state, DELETED):
        raise DocumentCommandError(
            "DOCUMENT_TRANSITION_REJECTED",
            "This document version can no longer be removed.",
            status_code=409,
        )

    now = timezone.now()
    with transaction.atomic():
        document.lifecycle_state = DELETED
        document.verification_status = "deleted"
        document.is_current = False
        document.superseded_at = now
        document.updated_at = now
        document.save(
            update_fields=[
                "lifecycle_state",
                "verification_status",
                "is_current",
                "superseded_at",
                "updated_at",
            ]
        )
        record_event(
            document=document,
            from_state=from_state,
            to_state=DELETED,
            event_type=EVENT_VERSION_DELETED,
            actor_id=actor_id,
            actor_role=actor_role,
            details={
                "reason": reason or "removed_by_actor",
                "object_retained": True,
                "storage_key_present": bool(getattr(document, "storage_key", None)),
            },
        )

    emit_metric(
        EVENT_VERSION_DELETED,
        document_type=document.document_type,
        version=document.version,
        actor_role=actor_role or "",
    )
    return document


def record_extraction_state(
    document,
    state: str,
    *,
    lifecycle_state: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Record OCR/scan progress without touching a human's verification decision.

    This is the R11.7 half that says extracted analysis is not overloaded onto
    human verification fields. Before 7.3 the OCR task wrote ``ocr_processing``
    into ``verification_status`` — the same column a reviewer's ``verified``
    lives in — so a re-extract silently erased the decision. Extraction now owns
    ``extraction_state``; ``verification_status`` is only maintained as the legacy
    projection for a document no human has decided on yet.
    """
    if state not in EXTRACTION_STATES:
        state = "pending"

    fields = ["extraction_state", "updated_at"]
    document.extraction_state = state
    document.updated_at = timezone.now()

    current_lifecycle = lifecycle_of(document)
    if lifecycle_state and can_transition(current_lifecycle, lifecycle_state):
        document.lifecycle_state = lifecycle_state
        fields.append("lifecycle_state")

    # Legacy projection: keep publishing the ocr_* value through
    # ``verification_status`` for readers that still derive ``ocr_state`` from it,
    # but ONLY while no human decision exists to protect.
    if current_lifecycle not in (VERIFIED, REJECTED, DELETED, SUPERSEDED):
        document.verification_status = state
        fields.append("verification_status")

    document.save(update_fields=fields)
    record_event(
        document=document,
        from_state=current_lifecycle,
        to_state=document.lifecycle_state or current_lifecycle,
        event_type=EVENT_EXTRACTION_STATE,
        details={"extraction_state": state, **(details or {})},
    )
    emit_metric(
        EVENT_EXTRACTION_STATE,
        document_type=document.document_type,
        extraction_state=state,
    )


__all__ = [
    "DELETED",
    "EVENT_EXTRACTION_STATE",
    "EVENT_STAGE_COMPENSATED",
    "EVENT_STAGE_COMPENSATION_PENDING",
    "EVENT_STAGE_ORPHANED",
    "EVENT_STAGE_RECONCILED",
    "EVENT_STAGE_UNVERIFIED",
    "EVENT_VERIFICATION_DECIDED",
    "EVENT_VERSION_COMMITTED",
    "EVENT_VERSION_DELETED",
    "EVENT_VERSION_SUPERSEDED",
    "EXTRACTION_STATES",
    "LEGACY_STATUS_PROJECTION",
    "LIFECYCLE_STATES",
    "LIFECYCLE_TRANSITIONS",
    "MAX_COMPENSATION_ATTEMPTS",
    "NON_CURRENT_LIFECYCLE_STATES",
    "PROCESSING_FAILED",
    "PROVENANCE_ADMIN",
    "PROVENANCE_STUDENT",
    "PROVENANCE_SYSTEM",
    "READY_FOR_REVIEW",
    "REJECTED",
    "SCANNING",
    "STAGE_COMMITTED",
    "STAGE_COMPENSATED",
    "STAGE_COMPENSATION_PENDING",
    "STAGE_ORPHANED",
    "STAGE_STAGED",
    "STAGE_WRITE_FAILED",
    "SUPERSEDED",
    "UPLOADED",
    "VERIFIED",
    "DocumentCommandError",
    "build_object_key",
    "can_transition",
    "commit_version",
    "compensate_stage",
    "compute_checksum",
    "delete_document",
    "delete_staged_object",
    "find_identical_current_version",
    "find_replay_by_idempotency_key",
    "history_rows",
    "legacy_status_for",
    "lifecycle_from_row",
    "lifecycle_of",
    "mark_stage",
    "open_stage",
    "record_event",
    "record_extraction_state",
    "record_verification_decision",
    "safe_object_name",
    "verify_stored_object",
]
