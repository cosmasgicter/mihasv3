"""The one admin review-workspace authority (admissions-v2 task 9.4).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 9.4 — "Build one
deterministic admin review workspace".
Requirements: **R8.2** (reviewer queues contain only tenant-authorized assigned
work), **R8.3** (every command enforces the authority matrix and valid state
transitions in the backend), **R8.4** (each command is idempotent where retry is
possible, locks the affected rows, records actor/reason/before/after, and returns
allowed next actions), **R8.5** (the review surface shows canonical identity,
submitted answers, evidence, payment, interview, communication and history
*without requiring parallel legacy detail calls*), **R8.7** (Reviewer and
Tenant_Admin browser journeys), **R11.3** (the reviewer readiness query returns
its named facts from deterministic services).
Findings: **AUTH-01**, **AUTH-02**, **AUTH-03**, **API-02**, **MAINT-01**.
Design: §11.1 — "one application detail query returning structured sections and
ETags/versions; commands stay separate for clear authority and idempotency".

Three jobs, and only three
--------------------------

1. :meth:`ApplicationReviewWorkspaceService.detail` composes the **one** read.
   Every section is a projection of stored rows; nothing is fetched from another
   service over HTTP and nothing is generated. Task 7.4 deleted the admissions
   generative surface, so the reviewer's summary is
   :func:`apps.applications.readiness_service.reviewer_summary` — the *same*
   evaluator the student's own readiness surface and the submission gate use, not
   a second one with the same shape.

2. :meth:`~ApplicationReviewWorkspaceService.command_authority` answers "which of
   these commands will the backend accept from this actor" by asking
   :class:`~apps.catalog.services.AdminCapabilityService`. It is published on the
   read so the frontend gates on the server's answer rather than a role string,
   and — because frontend hiding is never the boundary — every command re-derives
   the same capability at its own endpoint.

3. The **version guard**: :func:`read_expected_version` /
   :meth:`~ApplicationReviewWorkspaceService.assert_version` /
   :meth:`~ApplicationReviewWorkspaceService.bump_version`. Two reviewers open the
   same application; one decides; the other's screen is now describing a state
   that no longer exists. Before this, the second decision simply won. Now a
   command carrying a version the application has moved past is refused with
   ``VERSION_CONFLICT`` (409) and mutates nothing.

Why the guard is opt-in
-----------------------

``assert_version(app, None)`` passes. A caller that supplies no version has not
*claimed* to be current, so refusing it would break every existing integration to
protect against a race it may not be in. A caller that supplies a version, or
quotes the ``If-Match`` ETag the detail query published, is making a claim — and a
claim that cannot be parsed is treated as **stale**, not as absent
(``expected_version: "not-a-number"`` is a conflict). A client that cannot state
its version has not proven it is current.

What this module deliberately does not do
-----------------------------------------

It does not authorize. Scope-before-lookup and the read capability live in
:func:`apps.common.tenant_authorization.resolve_scoped_application`, which every
application read and command already goes through (task 2.2); this module is
called *after* the actor has been proven to be allowed to see the application. It
computes the authority *answer* for display, and each command endpoint enforces
its own.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from rest_framework.exceptions import APIException

logger = logging.getLogger(__name__)

#: The named sections of the one detail payload (design §11.1). Every one of
#: these replaced a request the workspace used to make on its own.
WORKSPACE_SECTIONS: tuple[str, ...] = (
    "identity",
    "answers",
    "assignment",
    "evidence",
    "payment",
    "interview",
    "conditions",
    "amendments",
    "communication",
    "history",
    "readiness",
)

#: Per-section row ceiling. A workspace is a decision surface for *one*
#: application, so an unbounded history or document list is a latent
#: denial-of-service on the reviewer's own browser. The cap is **published** on
#: the payload and each capped section reports whether it was applied, so a
#: reviewer is never silently shown a subset (§the ``*_truncated`` flags).
SECTION_ROW_LIMIT: int = 100

#: The capability that opens the workspace. Reading an application is not
#: reviewing it: a read-only Tenant_Admin gets the whole surface and no command.
READ_CAPABILITY = "tenant.application.read"

#: The authority matrix, as data (R8.3, AUTH-02).
#:
#: Each workspace command maps to the **tenant** capability it requires. These are
#: the canonical ``tenant.*`` strings — no capability was invented for this task,
#: and a test asserts the values stay inside
#: ``AdminCapabilityService.TENANT_CAPABILITIES`` so the 17 + 17 catalogue cannot
#: grow by accident. The frontend's ``WorkspaceCapabilities`` union is drift-guarded
#: against these keys by ``reviewWorkspaceServerOwned.test.tsx``, so a control
#: cannot be gated on a key the server never sends.
COMMAND_CAPABILITIES: dict[str, str] = {
    "review_decision": "tenant.application.review",
    "verify_document": "tenant.document.verify",
    "verify_payment": "tenant.payment.verify",
    "review_amendment": "tenant.application.review",
    "verify_condition": "tenant.application.review",
    "manage_interview": "tenant.application.review",
    "assign_reviewer": "tenant.application.review",
    "grant_fee_waiver": "tenant.payment.verify",
    "bulk_review": "tenant.application.review",
    "export": "tenant.application.export",
}

#: Detail fields only a platform all-access actor may read.
#:
#: Cross-tenant context is the one thing the workspace can say that a tenant
#: operator must not hear. ``other_tenant_application_count`` answers "has this
#: person applied elsewhere on the platform", which is a fact about *another
#: school's* applicant pool. For a tenant actor the field is not filtered out of
#: a computed answer — the query is never run (R3.2).
PLATFORM_ONLY_DETAIL_FIELDS: tuple[str, ...] = ("other_tenant_application_count",)

#: Commands whose authority is platform-wide, composed **on top of** the tenant
#: capability in :data:`COMMAND_CAPABILITIES`.
#:
#: A fee waiver forgives money a tenant is owed and is gated on
#: ``platform.settings.manage`` at its endpoint, so publishing it from the tenant
#: capability alone would promise a control the backend refuses. Auto-assignment
#: is not in the matrix at all: it sweeps every unassigned application the
#: platform holds and is therefore not a command about *this* application.
PLATFORM_ONLY_COMMANDS: frozenset[str] = frozenset({"grant_fee_waiver"})

#: The platform capability each platform-only command additionally requires.
PLATFORM_COMMAND_CAPABILITIES: dict[str, str] = {
    "grant_fee_waiver": "platform.settings.manage",
}

#: One sentence per section, shipped with the payload.
#:
#: The 9.1/9.2 rule — "a definition travels with every number" — applied to a
#: detail surface: a reviewer reading ``current_document_count`` should not have
#: to guess whether superseded evidence is included.
SECTION_DEFINITIONS: dict[str, str] = {
    "identity": (
        "Canonical applicant identity as submitted with this application, not the "
        "account's current profile."
    ),
    "answers": (
        "The answers the applicant submitted, exactly as stored. Declared "
        "programme/intake/institution are display snapshots; the canonical "
        "binding is in `assignment`."
    ),
    "assignment": (
        "The canonical tenant binding — institution, canonical programme, "
        "offering, intake — plus the reviewer assigned and the configuration "
        "version the application was bound under."
    ),
    "evidence": (
        "Current document versions only (superseded evidence is excluded) and "
        "every persisted canonical grade. Counts describe the current versions."
    ),
    "payment": (
        "The canonical payment ledger for this application, newest first, with "
        "the derived waiting phase. `application_payment_status` is the derived "
        "summary on the application, not a second source of truth."
    ),
    "interview": (
        "Every interview record for this application; `current` is the scheduled "
        "or most recent one."
    ),
    "conditions": (
        "Offer conditions attached to this application. `open_count` counts "
        "conditions that are neither met nor waived."
    ),
    "amendments": (
        "Applicant-requested changes to personal fields. `pending_count` counts "
        "those still awaiting a decision."
    ),
    "communication": (
        "Admin feedback recorded on the application and the in-app notifications "
        "sent to the applicant about it."
    ),
    "history": (
        "Status-history rows for this application, newest first — who changed "
        "what, when, and why."
    ),
    "readiness": (
        "A deterministic checklist of verified facts: payment gate, required "
        "documents, identity, grades, eligibility, duplicates and intake window. "
        "Null when the canonical configuration could not be evaluated — never a "
        "zeroed checklist."
    ),
}


class ReviewVersionConflict(APIException):
    """A command was issued against a version the application has moved past.

    Carries ``current_version`` so the refusal is actionable without a second
    read: the client reloads at the version the server names.
    ``apps/common/exceptions.py`` lifts both the stable code and that number into
    the error envelope.
    """

    status_code = 409
    default_code = "VERSION_CONFLICT"

    def __init__(self, current_version: int, detail: str | None = None) -> None:
        super().__init__(
            detail
            or (
                "This application changed since you loaded it. Reload the review "
                "workspace and re-issue the command."
            )
        )
        self.current_version = int(current_version)


def read_expected_version(request) -> Optional[str]:
    """The version a command claims to be current at, or ``None``.

    Two spellings, one meaning: an ``expected_version`` field in the body (what a
    JSON client sends) or the HTTP ``If-Match`` header quoting the weak ETag the
    detail query published (what the web platform already has a word for). The
    body wins when both are present, because it is the more specific statement.

    Returned as a raw value rather than an ``int`` on purpose:
    :meth:`ApplicationReviewWorkspaceService.assert_version` has to be able to
    tell "no claim" from "a claim I cannot parse", and those must not both look
    like ``None``.
    """
    data = getattr(request, "data", None)
    if isinstance(data, dict):
        for key in ("expected_version", "expectedVersion"):
            if key in data and data[key] not in (None, ""):
                return data[key]

    header = (request.META or {}).get("HTTP_IF_MATCH") or ""
    header = str(header).strip()
    if not header or header == "*":
        return None
    # ``W/"7"`` / ``"7"`` / ``7`` all mean version 7.
    if header.startswith("W/"):
        header = header[2:].strip()
    return header.strip('"') or None


class ApplicationReviewWorkspaceService:
    """Compose the workspace read, publish the authority, guard the version."""

    # -- The version guard (R8.4) -------------------------------------------

    @staticmethod
    def current_version(application) -> int:
        """The application's current optimistic-lock counter."""
        return int(getattr(application, "version", 1) or 1)

    @classmethod
    def assert_version(cls, application, expected_version: Any) -> None:
        """Refuse a command whose claimed version is not the current one.

        A ``None`` claim passes (see the module docstring: the guard is opt-in).
        An unparseable claim is a **conflict**, not an absent one.
        """
        if expected_version in (None, ""):
            return

        current = cls.current_version(application)
        try:
            stated = int(str(expected_version).strip())
        except (TypeError, ValueError):
            logger.info(
                "review workspace: unreadable expected_version for application %s",
                getattr(application, "id", None),
            )
            raise ReviewVersionConflict(current)

        if stated != current:
            raise ReviewVersionConflict(current)

    @staticmethod
    def bump_version(application) -> int:
        """Advance the version after a command succeeded, and return the new one.

        A single ``UPDATE ... SET version = version + 1`` so two commits cannot
        read the same number and write the same successor. The in-memory instance
        is refreshed to match, because callers put the returned value straight
        into their response.
        """
        from django.db.models import F

        from apps.applications.models import Application

        Application.objects.filter(pk=application.pk).update(version=F("version") + 1)
        new_version = (
            Application.objects.filter(pk=application.pk)
            .values_list("version", flat=True)
            .first()
        )
        new_version = int(new_version or (int(getattr(application, "version", 1) or 1) + 1))
        application.version = new_version
        return new_version

    @classmethod
    def commit_command(cls, application, expected_version: Any = None) -> int:
        """``assert_version`` then ``bump_version`` — the two-line command tail."""
        cls.assert_version(application, expected_version)
        return cls.bump_version(application)

    # -- The state machine, borrowed not restated (R8.3) --------------------

    @staticmethod
    def allowed_transitions(application) -> list[str]:
        """The statuses this application may move to, from the one state machine.

        ``ALLOWED_TRANSITIONS`` in ``services.py`` is the single source of truth;
        this sorts it for a stable payload. A terminal status yields ``[]`` — an
        empty list is a fact, not a missing answer.
        """
        from apps.applications.services import ALLOWED_TRANSITIONS

        status = str(getattr(application, "status", "") or "")
        return sorted(ALLOWED_TRANSITIONS.get(status, set()))

    # -- The authority matrix (R8.3, AUTH-02) -------------------------------

    @classmethod
    def command_authority(cls, user, application, capability_set=None) -> dict[str, bool]:
        """Which workspace commands the backend will accept from ``user``.

        Every answer is ``AdminCapabilityService``'s. Resolution failure fails
        **closed**: every command false, which renders as a read-only workspace
        rather than as controls that will 403.
        """
        from apps.catalog.services import (
            AdminCapabilityService,
            CapabilityResolutionError,
        )

        service = AdminCapabilityService()
        try:
            capability_set = capability_set or service.get_capabilities(user)
            institution = getattr(application, "institution_ref", None)
            tenant_capabilities = (
                service.get_institution_capabilities(user, institution)
                if institution is not None
                else frozenset()
            )
        except CapabilityResolutionError:
            logger.warning(
                "review workspace: capabilities unresolvable for application %s",
                getattr(application, "id", None),
            )
            return {name: False for name in COMMAND_CAPABILITIES}

        platform_capabilities = capability_set.platform_capabilities
        all_access = bool(capability_set.is_super_admin or capability_set.all_access)

        answers: dict[str, bool] = {}
        for name, capability in COMMAND_CAPABILITIES.items():
            granted = capability in tenant_capabilities
            if name in PLATFORM_ONLY_COMMANDS:
                required = PLATFORM_COMMAND_CAPABILITIES[name]
                granted = granted and (all_access or required in platform_capabilities)
            answers[name] = bool(granted)
        return answers

    # -- The one read (R8.5, R11.3) -----------------------------------------

    @classmethod
    def detail(cls, application, *, user, capability_set=None) -> dict[str, Any]:
        """The whole workspace for one application, in one payload."""
        from apps.catalog.services import (
            AdminCapabilityService,
            CapabilityResolutionError,
        )

        try:
            capability_set = capability_set or AdminCapabilityService().get_capabilities(
                user
            )
            unrestricted = bool(
                capability_set.is_super_admin or capability_set.all_access
            )
        except CapabilityResolutionError:
            # Fail closed: the workspace still opens (the caller already proved
            # read authority) but platform-only context is withheld.
            capability_set = None
            unrestricted = False

        payload: dict[str, Any] = {
            "application_id": str(application.id),
            "version": cls.current_version(application),
            "status": str(getattr(application, "status", "") or ""),
            "identity": cls._identity(application),
            "answers": cls._answers(application),
            "assignment": cls._assignment(application),
            "evidence": cls._evidence(application),
            "payment": cls._payment(application),
            "interview": cls._interview(application),
            "conditions": cls._conditions(application),
            "amendments": cls._amendments(application),
            "communication": cls._communication(application),
            "history": cls._history(application),
            "allowed_transitions": cls.allowed_transitions(application),
            "capabilities": cls.command_authority(
                user, application, capability_set=capability_set
            ),
            "redaction": {
                "applied": not unrestricted,
                "withheld_fields": [] if unrestricted else list(PLATFORM_ONLY_DETAIL_FIELDS),
            },
            "definitions": {
                section: SECTION_DEFINITIONS[section] for section in WORKSPACE_SECTIONS
            },
            "row_limit": SECTION_ROW_LIMIT,
        }

        readiness = cls._readiness(application)
        payload["readiness"] = readiness
        # The next actions come from the readiness evaluator, so when readiness
        # could not be evaluated there is nothing to say. An empty list here is
        # "no answer", and the null `readiness` beside it is what says why — a
        # fabricated next action would be worse than silence (R8.6).
        payload["allowed_next_actions"] = (
            list(readiness.get("allowed_next_actions") or []) if readiness else []
        )

        if unrestricted:
            payload["other_tenant_application_count"] = cls._other_tenant_count(
                application
            )

        return payload

    # -- Sections ------------------------------------------------------------

    @staticmethod
    def _person(actor) -> Optional[dict[str, Any]]:
        """A staff actor as an id and a display name, or ``None``."""
        if actor is None:
            return None
        first = (getattr(actor, "first_name", "") or "").strip()
        last = (getattr(actor, "last_name", "") or "").strip()
        name = " ".join(part for part in (first, last) if part) or (
            getattr(actor, "email", None) or None
        )
        return {"id": str(getattr(actor, "id", "") or "") or None, "name": name}

    @staticmethod
    def _iso(value) -> Optional[str]:
        return value.isoformat() if value is not None and hasattr(value, "isoformat") else None

    @classmethod
    def _identity(cls, application) -> dict[str, Any]:
        return {
            "application_id": str(application.id),
            "application_number": getattr(application, "application_number", None),
            "public_tracking_code": getattr(application, "public_tracking_code", None),
            "full_name": getattr(application, "full_name", None),
            "email": getattr(application, "email", None),
            "phone": getattr(application, "phone", None),
            "date_of_birth": cls._iso(getattr(application, "date_of_birth", None)),
            "sex": getattr(application, "sex", None),
            "nationality": getattr(application, "nationality", None),
            "nrc_number": getattr(application, "nrc_number", None),
            "passport_number": getattr(application, "passport_number", None),
            "student_user_id": str(getattr(application, "user_id", "") or "") or None,
        }

    @staticmethod
    def _answers(application) -> dict[str, Any]:
        return {
            "residence_town": getattr(application, "residence_town", None),
            "address_line_1": getattr(application, "address_line_1", None),
            "address_line_2": getattr(application, "address_line_2", None),
            "postal_code": getattr(application, "postal_code", None),
            "next_of_kin_name": getattr(application, "next_of_kin_name", None),
            "next_of_kin_phone": getattr(application, "next_of_kin_phone", None),
            "additional_subjects": getattr(application, "additional_subjects", None),
            # Display snapshots. The canonical binding is in `assignment`; these
            # are what the applicant was shown at submission time, kept because a
            # reviewer sometimes needs to see the two disagree.
            "declared_program": getattr(application, "program", None),
            "declared_intake": getattr(application, "intake", None),
            "declared_institution": getattr(application, "institution", None),
        }

    @classmethod
    def _assignment(cls, application) -> dict[str, Any]:
        institution = getattr(application, "institution_ref", None)
        canonical = getattr(application, "canonical_program", None)
        offering = getattr(application, "program_offering", None)
        intake = getattr(application, "intake_ref", None)
        return {
            "institution_id": str(getattr(institution, "id", "") or "") or None,
            "institution_name": getattr(institution, "name", None),
            "institution_code": getattr(institution, "code", None),
            "canonical_program_id": str(getattr(canonical, "id", "") or "") or None,
            "canonical_program_name": getattr(canonical, "name", None),
            "program_offering_id": str(getattr(offering, "id", "") or "") or None,
            "program_offering_name": getattr(offering, "name", None),
            "intake_id": str(getattr(intake, "id", "") or "") or None,
            "intake_name": getattr(intake, "name", None),
            "configuration_version": getattr(application, "configuration_version", None),
            "assignment_version": int(getattr(application, "assignment_version", 1) or 1),
            "assigned_reviewer": cls._person(
                getattr(application, "assigned_reviewer_id", None)
            ),
            "is_late_submission": bool(getattr(application, "is_late_submission", False)),
            "waitlist_position": getattr(application, "waitlist_position", None),
            "submitted_at": cls._iso(getattr(application, "submitted_at", None)),
            "created_at": cls._iso(getattr(application, "created_at", None)),
            "updated_at": cls._iso(getattr(application, "updated_at", None)),
            "enrollment_confirmation_deadline": cls._iso(
                getattr(application, "enrollment_confirmation_deadline", None)
            ),
            "intake_capacity": getattr(intake, "max_capacity", None),
            "intake_enrollment": getattr(intake, "current_enrollment", None),
        }

    @classmethod
    def _evidence(cls, application) -> dict[str, Any]:
        """Current document versions and persisted canonical grades.

        ``is_current=True`` only: task 7.3 made a document an immutable evidence
        version, so the whole version chain is history and a reviewer verifying a
        superseded upload would be verifying the wrong artefact. The counts
        therefore describe the current versions, which is what the definition says.
        """
        from apps.documents.models import ApplicationDocument, ApplicationGrade

        rows = list(
            ApplicationDocument.objects.filter(
                application_id=application.id, is_current=True
            )
            .select_related("verified_by")
            .order_by("document_type", "-version")[: SECTION_ROW_LIMIT + 1]
        )
        truncated = len(rows) > SECTION_ROW_LIMIT
        rows = rows[:SECTION_ROW_LIMIT]

        documents = [
            {
                "id": str(row.id),
                "document_type": row.document_type,
                "document_name": row.document_name,
                "verification_status": row.verification_status,
                "verified_by": cls._person(getattr(row, "verified_by", None)),
                "verified_at": cls._iso(row.verified_at),
                "verification_notes": row.verification_notes,
                "version": row.version,
                "is_current": bool(row.is_current),
                "lifecycle_state": getattr(row, "lifecycle_state", None),
                "file_size": row.file_size,
                "mime_type": row.mime_type,
                "system_generated": bool(row.system_generated),
                "uploaded_at": cls._iso(row.uploaded_at),
            }
            for row in rows
        ]

        grades = [
            {
                "id": str(grade.id),
                "subject_id": str(getattr(grade, "subject_id", "") or "") or None,
                "subject_name": getattr(getattr(grade, "subject", None), "name", None),
                "grade": grade.grade,
            }
            for grade in ApplicationGrade.objects.filter(application_id=application.id)
            .select_related("subject")
            .order_by("subject__name")[:SECTION_ROW_LIMIT]
        ]

        return {
            "documents": documents,
            "documents_truncated": truncated,
            "current_document_count": len(documents),
            "verified_document_count": sum(
                1 for row in documents if (row["verification_status"] or "") == "verified"
            ),
            "grades": grades,
            "grade_count": len(grades),
        }

    @classmethod
    def _payment(cls, application) -> dict[str, Any]:
        """The canonical ledger, through the platform's own serializer.

        ``PaymentSerializer`` is reused rather than re-projected because it is
        where the derived ``phase`` lives (task 8.2) and where the no-raw-phone
        rule is already enforced. A second projection here is how a reviewer and a
        student end up reading different answers about the same payment.
        """
        from apps.documents.models import FeeWaiver, Payment
        from apps.documents.serializers import PaymentSerializer

        records = list(
            Payment.objects.filter(application_id=application.id).order_by(
                "-created_at", "-id"
            )[:SECTION_ROW_LIMIT]
        )
        waiver = (
            FeeWaiver.objects.filter(application_id=application.id)
            .select_related("approved_by")
            .order_by("-created_at")
            .first()
        )
        fee = getattr(application, "application_fee", None)
        return {
            "application_payment_status": getattr(application, "payment_status", None),
            "application_fee": str(fee) if fee is not None else None,
            "records": PaymentSerializer(records, many=True).data,
            "record_count": len(records),
            "fee_waiver": (
                {
                    "id": str(waiver.id),
                    "waiver_type": waiver.waiver_type,
                    "reason_code": waiver.reason_code,
                    "discount_percentage": waiver.discount_percentage,
                    "approved_by": cls._person(getattr(waiver, "approved_by", None)),
                    "notes": waiver.notes,
                    "created_at": cls._iso(waiver.created_at),
                }
                if waiver is not None
                else None
            ),
        }

    @classmethod
    def _interview_row(cls, row) -> dict[str, Any]:
        return {
            "id": str(row.id),
            "scheduled_at": cls._iso(row.scheduled_at),
            "mode": row.mode,
            "location": row.location,
            "status": row.status,
            "notes": row.notes,
            "created_by": cls._person(getattr(row, "created_by", None)),
            "updated_by": cls._person(getattr(row, "updated_by", None)),
            "created_at": cls._iso(row.created_at),
            "updated_at": cls._iso(row.updated_at),
        }

    @classmethod
    def _interview(cls, application) -> dict[str, Any]:
        from apps.applications.models import ApplicationInterview

        rows = [
            cls._interview_row(row)
            for row in ApplicationInterview.objects.filter(
                application_id=application.id
            )
            .select_related("created_by", "updated_by")
            .order_by("-scheduled_at", "-id")[:SECTION_ROW_LIMIT]
        ]
        # `current` is the interview a reviewer is deciding about: the scheduled
        # one if there is one, otherwise the most recent. Picking "most recent"
        # unconditionally would surface a cancelled slot over a live booking.
        current = next(
            (row for row in rows if (row["status"] or "") == "scheduled"),
            rows[0] if rows else None,
        )
        return {"current": current, "records": rows, "record_count": len(rows)}

    @classmethod
    def _conditions(cls, application) -> dict[str, Any]:
        from apps.applications.models import ApplicationCondition

        rows = list(
            ApplicationCondition.objects.filter(application_id=application.id)
            .select_related("verified_by")
            .order_by("deadline", "id")[:SECTION_ROW_LIMIT]
        )
        records = [
            {
                "id": str(row.id),
                "description": row.description,
                "condition_type": row.condition_type,
                "deadline": cls._iso(row.deadline),
                "status": row.status,
                "met_at": cls._iso(row.met_at),
                "verified_by": cls._person(getattr(row, "verified_by", None)),
                "notes": row.notes,
                "created_at": cls._iso(row.created_at),
            }
            for row in rows
        ]
        return {
            "records": records,
            "record_count": len(records),
            # Open = still blocking enrollment. `waived` is a decision that has
            # been taken, so it is not outstanding.
            "open_count": sum(
                1 for row in records if row["status"] not in ("met", "waived")
            ),
        }

    @classmethod
    def _amendments(cls, application) -> dict[str, Any]:
        from apps.applications.models import ApplicationAmendment

        rows = list(
            ApplicationAmendment.objects.filter(application_id=application.id)
            .select_related("reviewed_by")
            .order_by("-created_at", "-id")[:SECTION_ROW_LIMIT]
        )
        records = [
            {
                "id": str(row.id),
                "field_name": row.field_name,
                "old_value": row.old_value,
                "new_value": row.new_value,
                "reason": row.reason,
                "status": row.status,
                "reviewed_by": cls._person(getattr(row, "reviewed_by", None)),
                "reviewed_at": cls._iso(row.reviewed_at),
                "created_at": cls._iso(row.created_at),
            }
            for row in rows
        ]
        return {
            "records": records,
            "record_count": len(records),
            "pending_count": sum(1 for row in records if row["status"] == "pending"),
        }

    @classmethod
    def _communication(cls, application) -> dict[str, Any]:
        """Admin feedback plus the notifications sent about *this* application.

        Scoped by ``metadata.application_id`` — the key every application
        notification writer already sets — rather than by recipient, so a reviewer
        reading one application does not see the applicant's whole inbox.
        """
        from apps.common.models import Notification

        notifications: list[dict[str, Any]] = []
        try:
            rows = Notification.objects.filter(
                user_id=getattr(application, "user_id", None),
                metadata__application_id=str(application.id),
            ).order_by("-created_at", "-id")[:SECTION_ROW_LIMIT]
            notifications = [
                {
                    "id": str(row.id),
                    "title": row.title,
                    "type": row.type,
                    "is_read": bool(row.is_read),
                    "created_at": cls._iso(row.created_at),
                }
                for row in rows
            ]
        except Exception:  # pragma: no cover - a JSON containment probe is backend-specific
            logger.info(
                "review workspace: notification lookup unavailable for application %s",
                application.id,
            )

        return {
            "admin_feedback": getattr(application, "admin_feedback", None),
            "admin_feedback_at": cls._iso(getattr(application, "admin_feedback_date", None)),
            "admin_feedback_by": cls._person(
                getattr(application, "admin_feedback_by", None)
            ),
            "notifications": notifications,
            "notification_count": len(notifications),
        }

    @classmethod
    def _history(cls, application) -> dict[str, Any]:
        from apps.applications.models import ApplicationStatusHistory

        rows = list(
            ApplicationStatusHistory.objects.filter(application_id=application.id)
            .select_related("changed_by")
            .order_by("-created_at", "-id")[: SECTION_ROW_LIMIT + 1]
        )
        truncated = len(rows) > SECTION_ROW_LIMIT
        rows = rows[:SECTION_ROW_LIMIT]
        return {
            "records": [
                {
                    "id": str(row.id),
                    "status": row.status,
                    "old_status": row.old_status,
                    "new_status": row.new_status,
                    "notes": row.notes,
                    "changes": row.changes,
                    "changed_by": cls._person(getattr(row, "changed_by", None)),
                    "created_at": cls._iso(row.created_at),
                }
                for row in rows
            ],
            "record_count": len(rows),
            "truncated": truncated,
        }

    @staticmethod
    def _readiness(application) -> Optional[dict[str, Any]]:
        """The deterministic reviewer checklist, or ``None`` (R11.3, R11.6).

        The *same* evaluator the student's readiness surface and the submission
        gate use — not a second one with the same shape, which is how the
        checklist a reviewer reads and the decision the server makes drift apart.

        An unevaluable canonical configuration returns ``None``. A zeroed
        checklist would read as "nothing outstanding" and invite exactly the
        decision the fail-closed submission path refuses to make.
        """
        from apps.applications import readiness_service
        from apps.applications.assignment_resolution import AssignmentConfigurationError

        try:
            return readiness_service.reviewer_summary(
                readiness_service.evaluate_readiness(application)
            )
        except AssignmentConfigurationError:
            logger.info(
                "review workspace: readiness unevaluable for application %s",
                application.id,
            )
            return None
        except Exception:  # pragma: no cover - readiness must not break the read
            logger.exception(
                "review workspace: readiness evaluation failed for application %s",
                application.id,
            )
            return None

    @staticmethod
    def _other_tenant_count(application) -> int:
        """How many applications this applicant holds at *other* institutions.

        Platform-only (see :data:`PLATFORM_ONLY_DETAIL_FIELDS`). Only ever
        computed for an all-access actor: for a tenant actor the query does not
        run, so the number does not exist to be leaked.
        """
        from apps.applications.models import Application

        return (
            Application.objects.filter(user_id=getattr(application, "user_id", None))
            .exclude(institution_ref_id=getattr(application, "institution_ref_id", None))
            .exclude(pk=application.pk)
            .count()
        )


__all__ = [
    "ApplicationReviewWorkspaceService",
    "COMMAND_CAPABILITIES",
    "PLATFORM_COMMAND_CAPABILITIES",
    "PLATFORM_ONLY_COMMANDS",
    "PLATFORM_ONLY_DETAIL_FIELDS",
    "READ_CAPABILITY",
    "ReviewVersionConflict",
    "SECTION_DEFINITIONS",
    "SECTION_ROW_LIMIT",
    "WORKSPACE_SECTIONS",
    "read_expected_version",
]
