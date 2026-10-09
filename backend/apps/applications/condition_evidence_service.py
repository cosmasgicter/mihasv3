"""Condition evidence and the offer-condition lifecycle (task 10.2).

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` — task **10.2**.
Requirements: R13.2 (the application detail shows conditions with precise dates
              and actors), R13.3-R13.4 (a condition message is delivered through
              the one delivery gate and shows up in the durable communications
              history), R13.9 ("conditional offers SHALL support per-condition
              evidence/comment submission, replacement, review, rejection
              reason, reminders, and history").
Findings:     **STU-16** — "Conditional offers are read-only for students: there
              is no condition-specific evidence, comment, replacement,
              rejection, or reminder workflow."
Design:       §11.2 — ``open -> evidence_submitted -> verified``,
              ``evidence_submitted -> changes_required -> evidence_submitted``,
              ``open|evidence_submitted -> waived`` (explicit authorized reason).

WHAT WAS WRONG
--------------
A conditionally approved student was told what they owed and given nowhere to
put it. ``GET /applications/{id}/conditions/`` published
``{id, description, condition_type, deadline, status, met_at}`` and there was no
write path at all: the only condition command was the staff
``POST .../conditions/{cid}/verify/``, which accepted ``met`` or ``waived`` and
nothing else. Concretely, five things were missing and each one is a dead end:

* **evidence** — the student could not attach the transcript / receipt / letter
  the condition asks for. The generic upload endpoint could not stand in for it:
  it refuses a non-``draft`` application for a student caller, and it resolves
  ``document_type`` against the *submission* requirement contract, which has no
  entry for "the thing this offer condition asks for";
* **a comment** — a condition is often satisfied by an explanation plus a
  document, and there was no field for either;
* **replacement** — with no upload there was nothing to replace, so a student who
  sent the wrong page had no second attempt;
* **a rejection reason** — the staff command had two outcomes, both of them
  final. A reviewer who found the evidence insufficient could only leave the
  condition ``pending``, which tells the student nothing about what to fix;
* **a reminder** — ``condition_expiry_task`` was the only scheduled work, and it
  runs *after* the deadline has already passed. The first thing the platform ever
  said about a deadline was that it had been missed.

THE SHAPE OF THE FIX
--------------------
**Condition evidence is a document version, not a new storage pipeline.** Task
7.3 already owns immutable versions, one-current provenance, checksums, staged
writes and storage compensation, and the database enforces one current row per
``(application_id, document_type)``. So a condition's evidence is an
``ApplicationDocument`` whose ``document_type`` is
``condition_evidence:{condition_id}`` (:func:`evidence_document_type`): the
per-condition type makes the platform's own partial unique index
(``uq_application_documents_one_current``) mean *exactly one current evidence
version per condition*, and a replacement supersedes the previous version through
:func:`apps.documents.document_evidence.commit_version` rather than overwriting
it. ``document_type`` is ``varchar(100)``; the prefix plus a UUID is 53
characters.

**The history is the append-only table that already exists.**
``document_verification_events`` carries ``details`` jsonb and is append-only by
contract (7.3 §1.5), so the student's comment, the reviewer's reason and every
status change are recorded there against the evidence version they concern. A
superseded version keeps its own review outcome and its own reviewer's words.

**So this task adds no table, no column and no index** — see
``docs/v2-evidence/10.2/README.md`` §3 for the verification of that claim. The
two lifecycle states the design names that the platform did not have
(``evidence_submitted``, ``changes_required``) are *values* in the existing
``application_conditions.status`` ``varchar(20)`` column, which carries no CHECK
constraint — the same shape task 4.4 used to add ``rejected`` to the domain
status machine.

Authority, in one sentence each:

* the **student** path is owner-only, and a valid-but-non-owned condition id is
  the canonical 404 mask (``authorize_owned_application``, AUTH-07);
* the **staff** path resolves ``tenant.application.review`` through
  ``AdminCapabilityService`` with scope **before** lookup
  (``resolve_scoped_application``), so no role string is compared here;
* every command is **audited** through ``TenantAuditService`` and every message
  goes through task 10.1's :func:`~apps.common.notification_preferences.deliver_message`
  with a published category — a student message may use email, a staff work item
  is inbox-only by design (10.1 §5.1).
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any, Iterable, Optional

from django.db import transaction
from django.utils import timezone

from apps.applications.models import Application, ApplicationCondition

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# The state vocabulary
# ---------------------------------------------------------------------------
#
# The stored values are the authority. Design §11.2 names the states
# conceptually (``open``/``verified``); the platform has stored ``pending``/``met``
# since the business-logic densification, and those rows are live. So the design's
# machine is spelled with the stored values — exactly how task 4.4 mapped the
# domain machine's conceptual ``pending_verification`` onto the stored
# ``pending_dns`` — and the conceptual name travels next to it in
# :data:`CONDITION_STATE_DEFINITIONS` so a reader of either document can follow.

#: The student owes evidence and has not sent any (design: ``open``).
CONDITION_OPEN = "pending"
#: Evidence is attached and the school owes a review.
CONDITION_EVIDENCE_SUBMITTED = "evidence_submitted"
#: A reviewer looked and asked for something different. The student owes a
#: replacement, and the reason they were given is part of the record.
CONDITION_CHANGES_REQUIRED = "changes_required"
#: Satisfied (design: ``verified``).
CONDITION_VERIFIED = "met"
#: Excused by an authorized reviewer, with a reason.
CONDITION_WAIVED = "waived"
#: The deadline passed with the condition still owed by the student.
CONDITION_EXPIRED = "expired"

#: Every state a condition can be in, in lifecycle order.
CONDITION_STATES: tuple[str, ...] = (
    CONDITION_OPEN,
    CONDITION_EVIDENCE_SUBMITTED,
    CONDITION_CHANGES_REQUIRED,
    CONDITION_VERIFIED,
    CONDITION_WAIVED,
    CONDITION_EXPIRED,
)

#: What each state means, and who it is waiting on. Published with the condition
#: (9.1/9.4's "a definition travels with every label") so the browser renders the
#: platform's own words instead of deriving copy from a status string.
CONDITION_STATE_DEFINITIONS: dict[str, dict[str, str]] = {
    CONDITION_OPEN: {
        "design_name": "open",
        "waiting_on": "student",
        "definition": (
            "This condition is still open. Send the evidence it asks for, with a "
            "note if that helps explain it."
        ),
    },
    CONDITION_EVIDENCE_SUBMITTED: {
        "design_name": "evidence_submitted",
        "waiting_on": "school",
        "definition": (
            "Your evidence is with the admissions team. You can replace it while "
            "it is being reviewed."
        ),
    },
    CONDITION_CHANGES_REQUIRED: {
        "design_name": "changes_required",
        "waiting_on": "student",
        "definition": (
            "The admissions team asked for something different. Their reason is "
            "shown with the condition — send a replacement before the deadline."
        ),
    },
    CONDITION_VERIFIED: {
        "design_name": "verified",
        "waiting_on": "nobody",
        "definition": "This condition has been accepted. Nothing more is needed.",
    },
    CONDITION_WAIVED: {
        "design_name": "waived",
        "waiting_on": "nobody",
        "definition": "The admissions team excused this condition.",
    },
    CONDITION_EXPIRED: {
        "design_name": "expired",
        "waiting_on": "nobody",
        "definition": (
            "The deadline passed with this condition still open. Contact the "
            "admissions team about your application."
        ),
    },
}

#: Terminal states (no outbound transition), and the set
#: ``ConditionManager.check_all_conditions_resolved`` already treats as resolved.
CONDITION_TERMINAL_STATES: frozenset[str] = frozenset(
    {CONDITION_VERIFIED, CONDITION_WAIVED, CONDITION_EXPIRED}
)

#: States in which the **student** owes the next move. These are the states a
#: reminder chases and the states the expiry sweep may expire.
CONDITION_STUDENT_OWED_STATES: frozenset[str] = frozenset(
    {CONDITION_OPEN, CONDITION_CHANGES_REQUIRED}
)


class ConditionEvidenceError(Exception):
    """A condition command was refused. Carries a stable code."""

    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class ConditionStateMachine:
    """Design §11.2's condition machine, declared once.

    Stating the transitions as a table is what lets the row lock below be checked
    against something: the condition is re-read **under** the lock and the
    transition is asserted against that value, so a decision made from a stale
    read is refused rather than silently overwriting the first one. It is the same
    shape as 9.5's ``AmendmentStateMachine``.
    """

    ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
        CONDITION_OPEN: frozenset(
            {CONDITION_EVIDENCE_SUBMITTED, CONDITION_VERIFIED, CONDITION_WAIVED, CONDITION_EXPIRED}
        ),
        CONDITION_EVIDENCE_SUBMITTED: frozenset(
            {
                CONDITION_EVIDENCE_SUBMITTED,  # a replacement while under review
                CONDITION_VERIFIED,
                CONDITION_CHANGES_REQUIRED,
                CONDITION_WAIVED,
            }
        ),
        CONDITION_CHANGES_REQUIRED: frozenset(
            {CONDITION_EVIDENCE_SUBMITTED, CONDITION_VERIFIED, CONDITION_WAIVED, CONDITION_EXPIRED}
        ),
        CONDITION_VERIFIED: frozenset(),
        CONDITION_WAIVED: frozenset(),
        CONDITION_EXPIRED: frozenset(),
    }

    #: Outcomes a **review** command may request. ``expired`` is deliberately not
    #: one of them: it is the deadline sweep's outcome, not a reviewer's verdict.
    REVIEW_OUTCOMES: frozenset[str] = frozenset(
        {CONDITION_VERIFIED, CONDITION_CHANGES_REQUIRED, CONDITION_WAIVED}
    )

    #: Review outcomes that require the reviewer to say why. Asking a student for
    #: something different without saying what is the STU-16 dead end this task
    #: exists to remove, and a waiver is an authorized exception to a published
    #: condition (design §11.2: "waived (explicit authorized reason)").
    OUTCOMES_REQUIRING_REASON: frozenset[str] = frozenset(
        {CONDITION_CHANGES_REQUIRED, CONDITION_WAIVED}
    )

    #: The floor on that reason. Long enough to be a sentence a student can act
    #: on; the platform's other reason fields use the same order of magnitude.
    MIN_REASON_CHARS = 10
    MAX_REASON_CHARS = 1000

    @classmethod
    def normalise(cls, value: Any) -> str:
        return (str(value or "")).strip().lower()

    @classmethod
    def can_transition(cls, from_state: Any, to_state: Any) -> bool:
        return cls.normalise(to_state) in cls.ALLOWED_TRANSITIONS.get(
            cls.normalise(from_state), frozenset()
        )

    @classmethod
    def assert_transition(cls, from_state: Any, to_state: Any) -> None:
        current = cls.normalise(from_state)
        target = cls.normalise(to_state)
        if cls.can_transition(current, target):
            return
        if current in CONDITION_TERMINAL_STATES:
            raise ConditionEvidenceError(
                "CONDITION_ALREADY_RESOLVED",
                f"This condition is already {current} and cannot be changed.",
                status_code=409,
            )
        raise ConditionEvidenceError(
            "CONDITION_TRANSITION_REJECTED",
            f"A condition cannot move from {current or 'unknown'} to {target or 'unknown'}.",
            status_code=409,
        )


# ---------------------------------------------------------------------------
# Evidence identity
# ---------------------------------------------------------------------------

#: The ``document_type`` prefix condition evidence is stored under. The condition
#: id is part of the type on purpose: the database's one-current partial unique
#: index is ``(application_id, document_type) WHERE is_current``, so a
#: per-condition type is what makes "exactly one current evidence version per
#: condition" an invariant the database enforces rather than a convention.
CONDITION_EVIDENCE_TYPE_PREFIX = "condition_evidence:"

#: The document-history event types this module appends (7.3's
#: ``document_verification_events``). ``document.`` prefixed so the audit
#: category vocabulary (9.5's ``CATEGORY_PREFIXES``) classifies them with the rest
#: of the document history.
EVENT_CONDITION_EVIDENCE_SUBMITTED = "document.condition.evidence_submitted"
EVENT_CONDITION_REVIEWED = "document.condition.reviewed"

#: The metadata key the student's comment travels under, in the append-only
#: history row's ``details``. A comment is *about* one evidence version, which is
#: why it lives with that version rather than on the condition row (where a
#: replacement would overwrite it).
COMMENT_KEY = "student_comment"

#: A student comment is optional, and bounded. The bound matters because the
#: value is rendered back to staff.
MAX_COMMENT_CHARS = 1000


def evidence_document_type(condition_id: Any) -> str:
    """The ``document_type`` this condition's evidence versions are stored under."""
    return f"{CONDITION_EVIDENCE_TYPE_PREFIX}{condition_id}"


def condition_id_from_document_type(document_type: str) -> Optional[str]:
    """The condition id a document type belongs to, or ``None``."""
    value = str(document_type or "")
    if not value.startswith(CONDITION_EVIDENCE_TYPE_PREFIX):
        return None
    return value[len(CONDITION_EVIDENCE_TYPE_PREFIX) :] or None


def _bounded(value: Any, limit: int) -> str:
    text = str(value or "").strip()
    return text[:limit]


def _iso(value: Any) -> Optional[str]:
    """Total over what a timestamp can be handed as (10.1 §6's lesson).

    A model field, a jsonb string and an already-serialised row all reach the
    read path, and assuming ``datetime`` is what made the student's own inbox
    answer 500. A read on the surface R13.9 exists to make legible must not fail
    on the shape of a timestamp.
    """
    if value is None or value == "":
        return None
    isoformat = getattr(value, "isoformat", None)
    if callable(isoformat):
        return isoformat()
    return str(value)


# ---------------------------------------------------------------------------
# Reading a condition
# ---------------------------------------------------------------------------


def _evidence_rows(application_id: Any, document_types: Iterable[str]) -> dict[str, list[dict]]:
    """Every evidence version for the given per-condition document types.

    One query for the whole page, never one per condition (9.3/10.1's rule). The
    checksum and the storage key are deliberately **not** published: a student
    reading their own conditions needs to know which file is current and what
    happened to it, and a storage key is an internal locator.
    """
    from apps.documents.models import ApplicationDocument

    types = [t for t in document_types if t]
    if not types:
        return {}
    grouped: dict[str, list[dict]] = {}
    rows = ApplicationDocument.objects.filter(
        application_id=application_id, document_type__in=types
    ).values(
        "id",
        "document_type",
        "document_name",
        "version",
        "is_current",
        "lifecycle_state",
        "verification_status",
        "mime_type",
        "file_size",
        "uploaded_at",
        "superseded_at",
        "created_at",
    )
    for row in rows:
        grouped.setdefault(str(row["document_type"]), []).append(dict(row))
    for entries in grouped.values():
        entries.sort(key=lambda entry: (entry.get("version") or 0), reverse=True)
    return grouped


def _history_events(application_id: Any, document_types: Iterable[str]) -> dict[str, list[dict]]:
    """The append-only condition history, grouped by document type.

    Read from ``document_verification_events`` — the table 7.3 already appends a
    document's lifecycle to — so a condition's history and its evidence's history
    are the same record rather than two that can disagree.
    """
    from apps.documents.models import ApplicationDocument, DocumentVerificationEvent

    types = [t for t in document_types if t]
    if not types:
        return {}

    doc_types: dict[str, str] = {
        str(row["id"]): str(row["document_type"])
        for row in ApplicationDocument.objects.filter(
            application_id=application_id, document_type__in=types
        ).values("id", "document_type")
    }
    if not doc_types:
        return {}

    grouped: dict[str, list[dict]] = {}
    events = DocumentVerificationEvent.objects.filter(
        application_id=application_id, document_id__in=list(doc_types.keys())
    ).values(
        "id",
        "document_id",
        "event_type",
        "from_state",
        "to_state",
        "actor_id",
        "actor_role",
        "details",
        "document_version",
        "created_at",
    )
    for event in events:
        document_type = doc_types.get(str(event["document_id"]))
        if not document_type:
            continue
        details = event.get("details") or {}
        grouped.setdefault(document_type, []).append(
            {
                "id": str(event["id"]),
                "event_type": event["event_type"],
                "from_state": event["from_state"],
                "to_state": event["to_state"],
                # Ids, never names or addresses — the same rule 9.5's recipient
                # payload follows.
                "actor_id": str(event["actor_id"]) if event["actor_id"] else None,
                "actor_role": event.get("actor_role"),
                "document_version": event.get("document_version"),
                "comment": _bounded(details.get(COMMENT_KEY), MAX_COMMENT_CHARS) or None,
                "reason": _bounded(details.get("reason"), ConditionStateMachine.MAX_REASON_CHARS)
                or None,
                "condition_status": details.get("condition_status"),
                "created_at": _iso(event.get("created_at")),
            }
        )
    for entries in grouped.values():
        entries.sort(key=lambda entry: (entry.get("created_at") or ""), reverse=True)
    return grouped


def allowed_actions(condition: ApplicationCondition, *, is_owner: bool) -> list[str]:
    """What the reader may do to this condition next.

    Server-authored, so the browser does not decide from a status string which
    control to render (R13.1/R8.4's "allowed next actions" applied per condition).
    """
    state = ConditionStateMachine.normalise(getattr(condition, "status", ""))
    if state in CONDITION_TERMINAL_STATES:
        return []
    if is_owner:
        if state in (CONDITION_OPEN, CONDITION_CHANGES_REQUIRED):
            return ["submit_evidence"]
        if state == CONDITION_EVIDENCE_SUBMITTED:
            return ["replace_evidence"]
        return []
    outcomes = sorted(
        outcome
        for outcome in ConditionStateMachine.REVIEW_OUTCOMES
        if ConditionStateMachine.can_transition(state, outcome)
    )
    return [f"review:{outcome}" for outcome in outcomes]


def condition_payload(
    condition: ApplicationCondition,
    *,
    is_owner: bool,
    evidence: Optional[list[dict]] = None,
    history: Optional[list[dict]] = None,
    include_history: bool = True,
) -> dict[str, Any]:
    """One condition, with its state definition, evidence and history.

    Additive over the pre-10.2 shape: ``id``, ``description``, ``condition_type``,
    ``deadline``, ``status``, ``met_at`` and ``notes`` are unchanged, so every
    existing reader keeps working.
    """
    state = ConditionStateMachine.normalise(getattr(condition, "status", "")) or CONDITION_OPEN
    definition = CONDITION_STATE_DEFINITIONS.get(
        state, CONDITION_STATE_DEFINITIONS[CONDITION_OPEN]
    )
    versions = list(evidence or [])
    current = next((row for row in versions if row.get("is_current")), None)
    superseded = [row for row in versions if not row.get("is_current")]

    deadline = getattr(condition, "deadline", None)
    days_remaining: Optional[int] = None
    if isinstance(deadline, date):
        days_remaining = (deadline - timezone.now().date()).days

    payload: dict[str, Any] = {
        "id": str(condition.id),
        "application_id": str(getattr(condition, "application_id", "") or ""),
        "description": condition.description,
        "condition_type": condition.condition_type,
        "deadline": _iso(deadline),
        "days_remaining": days_remaining,
        "status": state,
        "state": state,
        "state_design_name": definition["design_name"],
        "waiting_on": definition["waiting_on"],
        "state_definition": definition["definition"],
        "met_at": _iso(getattr(condition, "met_at", None)),
        "verified_by": (
            str(condition.verified_by_id) if getattr(condition, "verified_by_id", None) else None
        ),
        "updated_at": _iso(getattr(condition, "updated_at", None)),
        # ``notes`` is the existing column and is where a reviewer's most recent
        # reason lives. It is published under both names: ``notes`` for the
        # readers that already expect it, ``review_reason`` because that is what
        # it now means (R13.9's "rejection reason").
        "notes": getattr(condition, "notes", None),
        "review_reason": getattr(condition, "notes", None),
        "evidence": current,
        "evidence_versions": len(versions),
        "superseded_evidence": superseded,
        "allowed_actions": allowed_actions(condition, is_owner=is_owner),
        "evidence_document_type": evidence_document_type(condition.id),
    }
    if include_history:
        payload["history"] = list(history or [])
    return payload


def conditions_payload(
    application: Application, conditions: Iterable[ApplicationCondition], *, is_owner: bool
) -> list[dict[str, Any]]:
    """The whole condition list for one application, in two extra queries."""
    rows = list(conditions)
    types = [evidence_document_type(row.id) for row in rows]
    evidence = _evidence_rows(application.id, types)
    history = _history_events(application.id, types)
    return [
        condition_payload(
            row,
            is_owner=is_owner,
            evidence=evidence.get(evidence_document_type(row.id)),
            history=history.get(evidence_document_type(row.id)),
        )
        for row in rows
    ]


def condition_vocabulary() -> dict[str, Any]:
    """The published state vocabulary, so the browser derives no copy."""
    return {
        "states": [
            {
                "key": state,
                "design_name": CONDITION_STATE_DEFINITIONS[state]["design_name"],
                "waiting_on": CONDITION_STATE_DEFINITIONS[state]["waiting_on"],
                "definition": CONDITION_STATE_DEFINITIONS[state]["definition"],
                "terminal": state in CONDITION_TERMINAL_STATES,
            }
            for state in CONDITION_STATES
        ],
        "review_outcomes": sorted(ConditionStateMachine.REVIEW_OUTCOMES),
        "outcomes_requiring_reason": sorted(ConditionStateMachine.OUTCOMES_REQUIRING_REASON),
        "min_reason_chars": ConditionStateMachine.MIN_REASON_CHARS,
        "max_comment_chars": MAX_COMMENT_CHARS,
    }


# ---------------------------------------------------------------------------
# Resolving a condition for a caller
# ---------------------------------------------------------------------------


def resolve_condition(application: Application, condition_id: Any, *, lock: bool = False):
    """Load one condition **already scoped to its application**.

    The application is resolved by the caller's own authority seam (owner or
    tenant capability) *before* this runs, so a condition id belonging to another
    application — or to another tenant's application — cannot be confirmed to
    exist: it simply is not in this queryset.
    """
    query = ApplicationCondition.objects.filter(application_id=application.id)
    if lock:
        query = query.select_for_update()
    try:
        return query.get(id=condition_id)
    except (ApplicationCondition.DoesNotExist, ValueError, TypeError):
        raise ConditionEvidenceError(
            "NOT_FOUND", "Condition not found", status_code=404
        )


# ---------------------------------------------------------------------------
# The student command: submit (or replace) evidence
# ---------------------------------------------------------------------------


def submit_evidence(
    *,
    application: Application,
    condition: ApplicationCondition,
    file_obj: Any,
    comment: str = "",
    actor_id: Any = None,
    actor_role: str = "student",
    idempotency_key: Optional[str] = None,
    request: Any = None,
) -> dict[str, Any]:
    """Attach evidence to one condition, superseding any previous version.

    The write is task 7.3's command, unchanged and not re-implemented: hash ->
    replay short-circuit -> **commit** a stage row -> write the object ->
    **verify** the object -> **commit** metadata in one transaction ->
    compensate on failure. What this function adds is the condition itself: the
    student's comment goes on the append-only history row for the version it
    describes, and the condition's status moves under a row lock.

    Returns the refreshed condition payload. Raises
    :class:`ConditionEvidenceError` with a stable code on refusal.
    """
    from apps.applications.required_documents import (
        PLATFORM_ACCEPTED_MIME_TYPES,
        PLATFORM_MAX_UPLOAD_BYTES,
    )
    from apps.documents import document_evidence as evidence
    from apps.documents.validators import (
        scan_document_for_active_content,
        validate_file_magic_bytes,
    )

    state = ConditionStateMachine.normalise(condition.status)
    # Checked before a byte is read: a terminal condition takes no evidence, and
    # telling the student that after a 10 MB upload would be rude as well as
    # wasteful.
    ConditionStateMachine.assert_transition(state, CONDITION_EVIDENCE_SUBMITTED)

    if file_obj is None:
        raise ConditionEvidenceError(
            "EMPTY_FILE", "Attach the evidence file for this condition."
        )
    size = getattr(file_obj, "size", None)
    if size == 0:
        raise ConditionEvidenceError(
            "EMPTY_FILE", "That file is empty. Please choose the file again."
        )
    if size is not None and size > PLATFORM_MAX_UPLOAD_BYTES:
        raise ConditionEvidenceError("FILE_TOO_LARGE", "File size exceeds 10MB limit")

    declared_mime = getattr(file_obj, "content_type", "") or ""
    if declared_mime not in PLATFORM_ACCEPTED_MIME_TYPES:
        raise ConditionEvidenceError(
            "UNSUPPORTED_MIME_TYPE",
            "Attach a PDF, JPEG or PNG file.",
        )

    bounded_comment = _bounded(comment, MAX_COMMENT_CHARS)
    if comment and len(str(comment).strip()) > MAX_COMMENT_CHARS:
        raise ConditionEvidenceError(
            "COMMENT_TOO_LONG",
            f"Keep your note under {MAX_COMMENT_CHARS} characters.",
        )

    try:
        validate_file_magic_bytes(file_obj, declared_mime)
    except Exception:
        raise ConditionEvidenceError("INVALID_FILE", "Invalid file format")
    try:
        scan_document_for_active_content(file_obj)
    except Exception as exc:
        detail = getattr(exc, "detail", None)
        message = str(detail[0]) if isinstance(detail, list) and detail else str(detail or exc)
        raise ConditionEvidenceError("UNSAFE_FILE_CONTENT", message)

    document_type = evidence_document_type(condition.id)
    safe_name = evidence.safe_object_name(getattr(file_obj, "name", "") or "evidence")
    try:
        content_hash, hashed_size = evidence.compute_checksum(file_obj)
    except Exception:
        raise ConditionEvidenceError("INVALID_FILE", "File could not be read")

    # Replay identity, strongest first — 7.3 §2.1's layering, reused rather than
    # restated. A lost-response retry resends the same bytes under the same name
    # and gets the same version back; a deliberate second attempt with a
    # different file becomes version n+1.
    replay = evidence.find_replay_by_idempotency_key(
        application.id, document_type, idempotency_key
    ) or evidence.find_identical_current_version(
        application.id, [document_type], content_hash, document_name=safe_name
    )
    if replay is not None:
        return _read_back(application, condition, is_owner=True)

    object_key = evidence.build_object_key(application.id, document_type, safe_name)
    try:
        stage = evidence.open_stage(
            application_id=application.id,
            document_type=document_type,
            object_key=object_key,
            content_hash=content_hash,
            file_size=hashed_size or size,
            mime_type=declared_mime or None,
            actor_id=actor_id,
            idempotency_key=idempotency_key,
        )
    except evidence.DocumentCommandError as exc:
        raise ConditionEvidenceError(exc.code, exc.message, status_code=exc.status_code)

    try:
        from apps.common.storage import MediaStorage

        storage = MediaStorage()
        saved_name = storage.save(object_key, file_obj)
        file_url = storage.url(saved_name)
    except Exception as exc:  # pragma: no cover - provider failure path
        logger.exception("Condition evidence object write failed for condition %s", condition.id)
        evidence.compensate_stage(stage, reason=f"object write failed: {exc}")
        raise ConditionEvidenceError("STORAGE_ERROR", "File storage error", status_code=500)

    try:
        evidence.verify_stored_object(
            storage, saved_name or object_key, expected_size=hashed_size or None
        )
    except evidence.DocumentCommandError as exc:
        logger.error(
            "Condition evidence failed storage verification (condition=%s); refusing to record it",
            condition.id,
        )
        evidence.compensate_stage(stage, reason=f"storage verification failed: {exc.code}")
        raise ConditionEvidenceError(exc.code, exc.message, status_code=exc.status_code)

    try:
        document = evidence.commit_version(
            stage=stage,
            application_id=application.id,
            document_type=document_type,
            document_name=safe_name,
            file_url=file_url,
            storage_key=saved_name or object_key,
            file_size=hashed_size or size,
            mime_type=declared_mime or None,
            content_hash=content_hash,
            uploaded_by_id=actor_id,
            actor_role=actor_role,
            provenance=evidence.PROVENANCE_STUDENT,
        )
    except evidence.DocumentCommandError as exc:
        raise ConditionEvidenceError(exc.code, exc.message, status_code=exc.status_code)
    except Exception as exc:
        logger.exception("Condition evidence metadata commit failed for condition %s", condition.id)
        evidence.compensate_stage(stage, reason=f"metadata commit failed: {exc}")
        raise ConditionEvidenceError(
            "DOCUMENT_COMMIT_FAILED",
            "Your file could not be recorded. Please try again.",
            status_code=500,
        )

    # The condition's own transition, under a lock, asserted against the status as
    # re-read *inside* it — so a reviewer deciding at the same moment produces one
    # outcome rather than two.
    with transaction.atomic():
        locked = resolve_condition(application, condition.id, lock=True)
        previous_state = ConditionStateMachine.normalise(locked.status)
        ConditionStateMachine.assert_transition(previous_state, CONDITION_EVIDENCE_SUBMITTED)
        locked.status = CONDITION_EVIDENCE_SUBMITTED
        locked.updated_at = timezone.now()
        locked.save(update_fields=["status", "updated_at"])

    evidence.record_event(
        document=document,
        from_state=previous_state,
        to_state=CONDITION_EVIDENCE_SUBMITTED,
        event_type=EVENT_CONDITION_EVIDENCE_SUBMITTED,
        actor_id=actor_id,
        actor_role=actor_role,
        details={
            "condition_id": str(condition.id),
            "condition_status": CONDITION_EVIDENCE_SUBMITTED,
            "previous_condition_status": previous_state,
            COMMENT_KEY: bounded_comment,
            "replacement": previous_state == CONDITION_CHANGES_REQUIRED
            or previous_state == CONDITION_EVIDENCE_SUBMITTED,
        },
    )

    _record_audit(
        action=ACTION_CONDITION_EVIDENCE_SUBMITTED,
        condition=locked,
        application=application,
        actor_id=actor_id,
        actor_role=actor_role,
        request=request,
        extra={
            "document_id": str(document.id),
            "document_version": document.version,
            "previous_status": previous_state,
            "new_status": CONDITION_EVIDENCE_SUBMITTED,
            # The comment is the applicant's own words about their evidence, so
            # it is not repeated into the audit trail. Whether one was left is.
            "has_comment": bool(bounded_comment),
        },
    )

    notify_staff_of_condition_evidence(application, locked, document=document)
    return _read_back(application, locked, is_owner=True)


# ---------------------------------------------------------------------------
# The staff command: review one condition
# ---------------------------------------------------------------------------


def review_condition(
    *,
    application: Application,
    condition: ApplicationCondition,
    outcome: str,
    reason: str = "",
    actor_id: Any = None,
    actor_role: Optional[str] = None,
    request: Any = None,
) -> dict[str, Any]:
    """Verify, request changes on, or waive one condition.

    ``changes_required`` and ``waived`` require a reason (design §11.2's
    "explicit authorized reason", and STU-16's "rejection reason"). The whole
    decision — the condition status, the reason on the condition row, and the
    append-only history row against the evidence version being judged — commits
    inside one lock, so a student cannot read "changes required" without also
    being able to read why.
    """
    target = ConditionStateMachine.normalise(outcome)
    if target not in ConditionStateMachine.REVIEW_OUTCOMES:
        raise ConditionEvidenceError(
            "CONDITION_TRANSITION_REJECTED",
            "outcome must be one of: "
            + ", ".join(sorted(ConditionStateMachine.REVIEW_OUTCOMES)),
        )

    bounded_reason = _bounded(reason, ConditionStateMachine.MAX_REASON_CHARS)
    if (
        target in ConditionStateMachine.OUTCOMES_REQUIRING_REASON
        and len(bounded_reason) < ConditionStateMachine.MIN_REASON_CHARS
    ):
        raise ConditionEvidenceError(
            "CONDITION_REASON_REQUIRED",
            f"Give the applicant a reason of at least "
            f"{ConditionStateMachine.MIN_REASON_CHARS} characters.",
        )

    document = current_evidence_document(application.id, condition.id)

    with transaction.atomic():
        locked = resolve_condition(application, condition.id, lock=True)
        previous_state = ConditionStateMachine.normalise(locked.status)
        ConditionStateMachine.assert_transition(previous_state, target)

        now = timezone.now()
        locked.status = target
        locked.updated_at = now
        fields = ["status", "updated_at"]
        if bounded_reason:
            locked.notes = bounded_reason
            fields.append("notes")
        if target in (CONDITION_VERIFIED, CONDITION_WAIVED):
            locked.met_at = now
            locked.verified_by_id = actor_id
            fields.extend(["met_at", "verified_by"])
        locked.save(update_fields=fields)

    if document is not None:
        from apps.documents import document_evidence as evidence

        evidence.record_event(
            document=document,
            from_state=previous_state,
            to_state=target,
            event_type=EVENT_CONDITION_REVIEWED,
            actor_id=actor_id,
            actor_role=actor_role,
            details={
                "condition_id": str(condition.id),
                "condition_status": target,
                "previous_condition_status": previous_state,
                "reason": bounded_reason,
            },
        )

    _record_audit(
        action=ACTION_CONDITION_REVIEWED,
        condition=locked,
        application=application,
        actor_id=actor_id,
        actor_role=actor_role,
        request=request,
        extra={
            "previous_status": previous_state,
            "new_status": target,
            "reason": bounded_reason,
            "document_id": str(document.id) if document is not None else None,
        },
    )

    notify_student_of_condition_review(
        application, locked, outcome=target, reason=bounded_reason
    )

    # A verification can be the last one outstanding, in which case the
    # application itself is promoted. That decision belongs to
    # ``ConditionManager`` — it owns the application-level transition, its lock
    # and its forward-only rules — so it is called, not copied.
    if target in (CONDITION_VERIFIED, CONDITION_WAIVED):
        try:
            from apps.applications.condition_manager import ConditionManager

            ConditionManager.auto_promote_if_all_met(str(application.id))
        except Exception:  # pragma: no cover - promotion must not fail the review
            logger.exception(
                "Auto-promotion check failed after condition review (application=%s)",
                application.id,
            )

    return _read_back(application, locked, is_owner=False)


def current_evidence_document(application_id: Any, condition_id: Any):
    """The condition's current evidence version, or ``None``."""
    from apps.documents.models import ApplicationDocument

    return (
        ApplicationDocument.objects.filter(
            application_id=application_id,
            document_type=evidence_document_type(condition_id),
            is_current=True,
        )
        .order_by("-version")
        .first()
    )


def _read_back(
    application: Application, condition: ApplicationCondition, *, is_owner: bool
) -> dict[str, Any]:
    """Re-read one condition so a command answers with the committed state."""
    fresh = ApplicationCondition.objects.filter(id=condition.id).first() or condition
    document_type = evidence_document_type(fresh.id)
    return condition_payload(
        fresh,
        is_owner=is_owner,
        evidence=_evidence_rows(application.id, [document_type]).get(document_type),
        history=_history_events(application.id, [document_type]).get(document_type),
    )


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------

#: A student attached evidence to one condition. A tenant-scoped write, so it
#: appears in the school's own audit feed (9.5 §1).
ACTION_CONDITION_EVIDENCE_SUBMITTED = "condition.evidence_submitted"
#: A reviewer verified / requested changes on / waived one condition. Distinct
#: from 9.4's ``condition.verification_decided`` — which the pre-10.2
#: two-outcome ``verify`` command still emits — because this command has three
#: outcomes and carries the reason the student is shown.
ACTION_CONDITION_REVIEWED = "condition.reviewed"


def _record_audit(
    *,
    action: str,
    condition: ApplicationCondition,
    application: Application,
    actor_id: Any,
    actor_role: Optional[str],
    request: Any,
    extra: Optional[dict[str, Any]] = None,
) -> None:
    """Record one condition command as a tenant Audit_Event. Never raises."""
    try:
        from apps.catalog.tenant_audit_service import TenantAuditService

        TenantAuditService.record_event(
            action=action,
            entity_type="application_condition",
            entity_id=condition.id,
            actor_id=actor_id,
            actor_role=actor_role,
            institution_id=getattr(application, "institution_ref_id", None),
            metadata={
                "object_type": "application_condition",
                "condition_id": str(condition.id),
                "application_id": str(application.id),
                "condition_type": condition.condition_type,
                **(extra or {}),
            },
            request=request,
        )
    except Exception:  # pragma: no cover - audit must never block a write
        logger.warning(
            "Failed to record condition audit event %s for condition=%s",
            action,
            condition.id,
            exc_info=True,
        )


# ---------------------------------------------------------------------------
# Communication (task 10.1's gate, not a fire-and-forget call)
# ---------------------------------------------------------------------------


def notify_student_of_condition_review(
    application: Application,
    condition: ApplicationCondition,
    *,
    outcome: str,
    reason: str = "",
) -> None:
    """Tell the student what happened to their condition.

    Goes through task 10.1's :func:`deliver_message` with the **mandatory**
    ``application_updates`` category: a condition outcome is a deadline that can
    cost a place, so no stored setting suppresses it, and the delivery decision
    is recorded on the notification for the communications history (R13.4).
    """
    try:
        from apps.common.notification_preferences import (
            CATEGORY_APPLICATION_UPDATES,
            deliver_message,
        )

        headline = {
            CONDITION_VERIFIED: "Condition accepted",
            CONDITION_WAIVED: "Condition waived",
            CONDITION_CHANGES_REQUIRED: "Condition needs a different document",
        }.get(outcome, "Condition updated")

        message = f"{headline}: {condition.description}"
        if outcome == CONDITION_CHANGES_REQUIRED and reason:
            message = (
                f"{headline}: {condition.description}. The admissions team said: "
                f"{reason} Send a replacement before {condition.deadline}."
            )
        elif outcome == CONDITION_WAIVED and reason:
            message = f"{headline}: {condition.description}. Reason: {reason}"

        email_body = (
            f"<p>Dear {application.full_name},</p>"
            f"<p>{message}</p>"
            f"<p>Sign in to your application to see the full list of conditions.</p>"
        )

        deliver_message(
            user_id=application.user_id,
            category=CATEGORY_APPLICATION_UPDATES,
            title=headline,
            message=message,
            email_subject=f"{headline} — {application.program}",
            email_body=email_body,
            recipient_email=getattr(application, "email", "") or None,
            recipient_name=getattr(application, "full_name", "") or "",
            action_url=f"/student/application/{application.id}",
            # One notification per (condition, outcome, decision time): a replayed
            # command converges instead of telling the student twice.
            idempotency_key=(
                f"condition:{condition.id}:review:{outcome}:"
                f"{_iso(getattr(condition, 'updated_at', None)) or ''}"
            ),
            template_key=CONDITION_REVIEW_TEMPLATE_KEY,
            application_id=application.id,
            institution_id=getattr(application, "institution_ref_id", None),
        )
    except Exception:  # pragma: no cover - a message must not fail the command
        logger.warning(
            "Failed to notify student of condition review (condition=%s)",
            condition.id,
            exc_info=True,
        )


def notify_staff_of_condition_evidence(
    application: Application, condition: ApplicationCondition, *, document: Any = None
) -> None:
    """Tell the school's authorized reviewers that evidence is waiting.

    Recipients resolve through 9.5's ``TenantStaffRecipientService`` — the staff
    holding ``tenant.application.review`` for **this application's own
    institution** — and the fan-out is the same durable, idempotent bulk insert.
    Nothing is broadcast to every platform admin, and a school with no authorized
    reviewer leaves a logged gap rather than a wider fan-out (9.5 §5.3).

    The message is a **staff** class, so it is inbox-only by design and carries
    10.1's ``staff_delivery_metadata`` saying so — without it the communications
    history would report its email channel as ``unknown``, i.e. "predates
    delivery tracking", which would be false.
    """
    try:
        from apps.applications.amendment_service import AMENDMENT_RECIPIENT_CAPABILITY
        from apps.catalog.tenant_recipients import TenantStaffRecipientService
        from apps.common.notification_preferences import (
            CATEGORY_STAFF_ACTION_REQUIRED,
            staff_delivery_metadata,
        )
        from apps.common.outbox import create_notifications_bulk

        resolved = TenantStaffRecipientService.recipients_for_institution(
            getattr(application, "institution_ref_id", None),
            AMENDMENT_RECIPIENT_CAPABILITY,
            exclude_user_ids=[getattr(application, "user_id", None)],
        )
        if not resolved.profiles:
            logger.warning(
                "Condition evidence on application %s has no tenant-authorized "
                "recipient (institution=%s reason=%s)",
                application.id,
                resolved.institution_id,
                resolved.empty_reason,
            )
            return

        delivery = staff_delivery_metadata(
            category=CATEGORY_STAFF_ACTION_REQUIRED,
            application_id=application.id,
            institution_id=resolved.institution_id,
        )
        version = getattr(document, "version", None)
        create_notifications_bulk(
            [
                {
                    "user_id": profile.id,
                    "title": "Condition evidence submitted",
                    "message": (
                        f"Evidence was submitted for a condition on application "
                        f"{application.application_number} and is waiting for review."
                    ),
                    "type": "info",
                    "priority": "normal",
                    "action_url": f"/admin/applications/{application.id}",
                    "idempotency_key": (
                        f"condition:{condition.id}:evidence:{version}:recipient:{profile.id}"
                    ),
                    "metadata": dict(delivery),
                }
                for profile in resolved.profiles
            ]
        )
    except Exception:  # pragma: no cover - a message must not fail the command
        logger.warning(
            "Failed to notify reviewers of condition evidence (condition=%s)",
            condition.id,
            exc_info=True,
        )


# ---------------------------------------------------------------------------
# Reminders
# ---------------------------------------------------------------------------

#: The template key the review/reminder messages are classified under. There is no
#: seeded ``communication_templates`` row for it and there does not need to be:
#: :func:`deliver_message` renders the body here, and the key is what the
#: communications history and the delivery record name the message class by.
CONDITION_REVIEW_TEMPLATE_KEY = "condition_reviewed"
CONDITION_REMINDER_TEMPLATE_KEY = "condition_reminder"

#: How many days before a deadline the platform starts chasing, and the windows
#: it chases in. One reminder per window per condition, keyed on the window — so
#: a student is reminded at a week out and again the day before, and never twice
#: for the same window however often the sweep runs.
CONDITION_REMINDER_WINDOWS: tuple[int, ...] = (7, 3, 1)

#: Bound the per-run work, like every other sweep in ``apps/applications/tasks``.
MAX_REMINDERS_PER_RUN = 200


def reminder_window_for(days_remaining: int) -> Optional[int]:
    """The smallest configured window a deadline this close falls inside.

    ``None`` when the deadline is further away than the widest window, or already
    past — an overdue condition is the expiry sweep's business, and a reminder
    that arrives after the deadline is the defect STU-16 names, not the fix.
    """
    if days_remaining < 0:
        return None
    for window in sorted(CONDITION_REMINDER_WINDOWS):
        if days_remaining <= window:
            return window
    return None


def conditions_due_for_reminder(*, limit: int = MAX_REMINDERS_PER_RUN) -> list[ApplicationCondition]:
    """Conditions the **student** still owes whose deadline is close.

    Only ``pending`` / ``changes_required``: an ``evidence_submitted`` condition
    is waiting on the school, and chasing a student for something they have
    already sent is worse than saying nothing.
    """
    today = timezone.now().date()
    horizon = today + timedelta(days=max(CONDITION_REMINDER_WINDOWS))
    return list(
        ApplicationCondition.objects.filter(
            status__in=sorted(CONDITION_STUDENT_OWED_STATES),
            deadline__gte=today,
            deadline__lte=horizon,
            application__status="conditionally_approved",
        ).select_related("application")[:limit]
    )


def send_condition_reminder(condition: ApplicationCondition, *, window: int) -> bool:
    """Remind the owning student about one condition. Returns whether it was sent.

    Mandatory ``application_updates``, through the one delivery gate: a missed
    condition deadline auto-rejects the application, so this is transactional
    rather than an optional notification a student could switch off. Idempotent on
    ``(condition, window)`` through ``Notification.idempotency_key``, which is why
    the reminder needs no new column to remember what it has already sent.
    """
    from apps.common.notification_preferences import (
        DIRECT_PRODUCER_CATEGORIES,
        deliver_message,
    )

    application = condition.application
    key = f"condition:{condition.id}:reminder:{window}"
    days_remaining = (condition.deadline - timezone.now().date()).days
    when = "tomorrow" if days_remaining <= 1 else f"in {days_remaining} days"

    title = "Condition deadline approaching"
    message = (
        f"A condition on your application {application.application_number} is due "
        f"{when}: {condition.description}."
    )
    if ConditionStateMachine.normalise(condition.status) == CONDITION_CHANGES_REQUIRED:
        message = (
            f"The admissions team asked for a different document for a condition on "
            f"application {application.application_number}, due {when}: "
            f"{condition.description}."
        )

    delivered = deliver_message(
        user_id=application.user_id,
        category=DIRECT_PRODUCER_CATEGORIES[CONDITION_REMINDER_TEMPLATE_KEY],
        title=title,
        message=message,
        email_subject=f"{title} — {application.program}",
        email_body=(
            f"<p>Dear {application.full_name},</p>"
            f"<p>{message}</p>"
            f"<p>Sign in to your application to send it.</p>"
        ),
        recipient_email=getattr(application, "email", "") or None,
        recipient_name=getattr(application, "full_name", "") or "",
        action_url=f"/student/application/{application.id}",
        idempotency_key=key,
        template_key=CONDITION_REMINDER_TEMPLATE_KEY,
        application_id=application.id,
        institution_id=getattr(application, "institution_ref_id", None),
    )
    return delivered.notification is not None


def already_reminded(condition_id: Any, window: int) -> bool:
    """Whether this condition's reminder for this window has already been written."""
    from apps.common.models import Notification

    return Notification.objects.filter(
        idempotency_key=f"condition:{condition_id}:reminder:{window}"
    ).exists()


__all__ = [
    "CONDITION_OPEN",
    "CONDITION_EVIDENCE_SUBMITTED",
    "CONDITION_CHANGES_REQUIRED",
    "CONDITION_VERIFIED",
    "CONDITION_WAIVED",
    "CONDITION_EXPIRED",
    "CONDITION_STATES",
    "CONDITION_STATE_DEFINITIONS",
    "CONDITION_TERMINAL_STATES",
    "CONDITION_STUDENT_OWED_STATES",
    "CONDITION_EVIDENCE_TYPE_PREFIX",
    "CONDITION_REMINDER_WINDOWS",
    "CONDITION_REMINDER_TEMPLATE_KEY",
    "CONDITION_REVIEW_TEMPLATE_KEY",
    "COMMENT_KEY",
    "MAX_COMMENT_CHARS",
    "MAX_REMINDERS_PER_RUN",
    "EVENT_CONDITION_EVIDENCE_SUBMITTED",
    "EVENT_CONDITION_REVIEWED",
    "ACTION_CONDITION_EVIDENCE_SUBMITTED",
    "ACTION_CONDITION_REVIEWED",
    "ConditionEvidenceError",
    "ConditionStateMachine",
    "evidence_document_type",
    "condition_id_from_document_type",
    "allowed_actions",
    "condition_payload",
    "conditions_payload",
    "condition_vocabulary",
    "resolve_condition",
    "submit_evidence",
    "review_condition",
    "current_evidence_document",
    "notify_student_of_condition_review",
    "notify_staff_of_condition_evidence",
    "reminder_window_for",
    "conditions_due_for_reminder",
    "send_condition_reminder",
    "already_reminded",
]
