"""Transactional application selection change — the reroute command (task 6.4).

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/``
Requirements: R7.2, R10.5
Findings:     STU-01, DATA-01
Design:       design.md §7.2 (Application Assignment — "Generic PATCH never
              accepts assignment identifiers or their display snapshots. Before
              any payment exists, ``ChangeSelectionCommand`` may atomically
              reassign the draft, update every canonical ID/snapshot/requirement/
              eligibility/fee reference, clear invalid dependent answers, bump
              the optimistic version, and return a change summary. Payment
              activity makes assignment immutable."), §8.1/§8.2 (draft
              lifecycle), §14.2 (idempotency + optimistic version conflict).

Why this module exists
----------------------
Finding **STU-01** (P0): the draft assignment *display* fields
(``program``/``intake``/``institution``) were writable through the generic
application PATCH while the canonical routing IDs
(``institution_ref_id``/``canonical_program_id``/``program_offering_id``/
``intake_ref_id``) stayed read-only — so a student who changed programme moved
the labels but not the routing identity. That split identity is what
**DATA-01** describes on the write side.

Task 6.4 closes it from both ends:

1. ``ApplicationSerializer`` no longer accepts any assignment field (the three
   display snapshots are ``read_only`` and the canonical IDs always were), and
2. this module is the ONE command that may move an assignment — atomically,
   with revalidation, under row locks, and blocked by payment activity.

Design notes
------------
* **Canonical IDs only.** Resolution delegates to task 5.2's
  :func:`apps.applications.assignment_resolution.resolve_assignment_snapshot`,
  which reuses ``OfferingAssignmentService`` and never falls back to
  name/code lookup (R7.1, DATA-01).
* **One transaction.** The lock, revalidation, canonical-ID write, snapshot
  write, dependent-answer clearing, and version bump all happen inside a single
  ``transaction.atomic`` block. Any failure — configuration, capacity,
  duplicate, or an unexpected error — rolls the whole thing back, so a draft is
  never left half-rerouted (the "rollback" evidence case).
* **Payment activity makes assignment immutable** (R10.5). *Any* ``Payment`` row
  for the application blocks a reassignment, and the rejection carries a
  structured, non-dead-end recovery path.
* **Tenant isolation.** The caller passes the institution resolved from the
  trusted host; a mismatching explicit ``institution_id`` is rejected with
  ``INSTITUTION_OVERRIDE_NOT_PERMITTED`` and no mutation (steering:
  fail-closed tenant domains; TEN-10). Ownership is scoped before lookup so a
  non-owned draft id is indistinguishable from a missing one.
* Framework-neutral: no DRF import. Errors carry a stable ``code`` /
  ``status_code`` / ``retryable`` so the view maps them onto the canonical
  envelope (design §14.1).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Classification of a requested selection change
# ---------------------------------------------------------------------------

#: The resolved target equals the persisted canonical assignment *and* its
#: display snapshots — nothing to do. Never blocked by payment activity because
#: nothing about the student's selection changes.
UNCHANGED = "unchanged"

#: The student's selection is the same (same programme + intake + institution by
#: display identity) but the persisted row is missing canonical IDs or carries
#: stale display snapshots. Completing/refreshing the canonical identity is not
#: a reroute, so it is allowed even when payment activity exists — it moves no
#: money-bearing choice, it only repairs what the server should have stored.
CANONICALIZATION = "canonicalization"

#: A genuine reroute: the resolved canonical target differs from the persisted
#: selection. Blocked by any payment activity (R10.5).
REASSIGNMENT = "reassignment"


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class SelectionChangeError(Exception):
    """A change-selection command was rejected. Carries a stable code.

    ``recovery`` is an ordered, never-empty set of next actions for the blocked
    cases so the student is never dead-ended (the "clear recovery path" of
    task 6.4). ``details`` carries non-PII context (e.g. the existing draft id
    on a duplicate).
    """

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int = 400,
        retryable: bool = False,
        recovery: dict[str, Any] | None = None,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.retryable = retryable
        self.recovery = recovery
        self.details = details or {}


PAYMENT_LOCK_CODE = "ASSIGNMENT_LOCKED_BY_PAYMENT"
PAYMENT_LOCK_MESSAGE = (
    "This application already has payment activity, so its programme and intake "
    "can no longer be changed."
)


def _payment_lock_recovery(application) -> dict[str, Any]:
    """The ordered recovery path offered when payment activity blocks a reroute.

    Never empty (design §7.2 + the task's "expose a clear recovery path"): the
    student can continue the paid application as-is, start a separate
    application for the other choice, or ask admissions to move the payment.
    """
    return {
        "reason": "payment_activity",
        "actions": [
            {
                "action": "continue-current",
                "label": "Continue this application",
                "href": f"/student/application-wizard?mode=resume&draftId={application.id}",
            },
            {
                "action": "start-new-application",
                "label": "Start a separate application for the other choice",
                "href": "/student/application-wizard?mode=new",
            },
            {
                "action": "contact-admissions",
                "label": "Ask admissions to move this application",
                "href": "/contact",
            },
        ],
    }


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SelectionChangeResult:
    """The outcome of a change-selection command (the "change summary")."""

    application: Any
    classification: str
    changed: bool
    previous: dict[str, Any]
    current: dict[str, Any]
    cleared_fields: list[str] = field(default_factory=list)
    requirements_added: list[dict[str, Any]] = field(default_factory=list)
    requirements_removed: list[dict[str, Any]] = field(default_factory=list)
    documents_no_longer_required: list[str] = field(default_factory=list)
    documents_missing_for_new_selection: list[dict[str, Any]] = field(default_factory=list)

    def summary(self) -> dict[str, Any]:
        """Serializable change summary returned to the client."""
        return {
            "changed": self.changed,
            "classification": self.classification,
            "previous": self.previous,
            "current": self.current,
            "cleared_fields": list(self.cleared_fields),
            "requirements_added": list(self.requirements_added),
            "requirements_removed": list(self.requirements_removed),
            "documents_no_longer_required": list(self.documents_no_longer_required),
            "documents_missing_for_new_selection": list(
                self.documents_missing_for_new_selection
            ),
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _str_or_none(value: Any) -> str | None:
    return str(value) if value else None


def _normalized(value: Any) -> str:
    return str(value or "").strip().casefold()


def _assignment_identity(application) -> dict[str, Any]:
    """The persisted canonical + display assignment identity of an application."""
    return {
        "institution_id": _str_or_none(getattr(application, "institution_ref_id", None)),
        "canonical_program_id": _str_or_none(getattr(application, "canonical_program_id", None)),
        "program_offering_id": _str_or_none(getattr(application, "program_offering_id", None)),
        "intake_id": _str_or_none(getattr(application, "intake_ref_id", None)),
        "institution": getattr(application, "institution", None),
        "program": getattr(application, "program", None),
        "intake": getattr(application, "intake", None),
        "configuration_version": getattr(application, "configuration_version", None),
        "assignment_version": getattr(application, "assignment_version", None),
    }


def _snapshot_identity(snapshot) -> dict[str, Any]:
    return {
        "institution_id": snapshot.institution_id,
        "canonical_program_id": snapshot.canonical_program_id,
        "program_offering_id": snapshot.program_offering_id,
        "intake_id": snapshot.intake_id,
        "institution": snapshot.institution_name,
        "program": snapshot.program_name,
        "intake": snapshot.intake_name,
        "configuration_version": snapshot.configuration_version,
    }


def classify_selection_change(application, snapshot) -> str:
    """Classify a requested selection change against the persisted assignment.

    Returns :data:`UNCHANGED`, :data:`CANONICALIZATION`, or
    :data:`REASSIGNMENT`. This is the gate that decides whether the payment
    lock applies (only :data:`REASSIGNMENT` moves the student's choice), so it
    is a pure function with its own unit coverage.
    """
    canonical_ids_match = (
        _str_or_none(getattr(application, "canonical_program_id", None)) == snapshot.canonical_program_id
        and _str_or_none(getattr(application, "program_offering_id", None)) == snapshot.program_offering_id
        and _str_or_none(getattr(application, "intake_ref_id", None)) == snapshot.intake_id
        and _str_or_none(getattr(application, "institution_ref_id", None)) == snapshot.institution_id
    )
    display_matches = (
        _normalized(getattr(application, "program", None)) == _normalized(snapshot.program_name)
        and _normalized(getattr(application, "intake", None)) == _normalized(snapshot.intake_name)
        and _normalized(getattr(application, "institution", None)) == _normalized(snapshot.institution_name)
    )

    if canonical_ids_match:
        if display_matches and getattr(application, "configuration_version", None) == snapshot.configuration_version:
            return UNCHANGED
        # Same canonical target; only the snapshots/config version drifted.
        return CANONICALIZATION

    has_any_canonical_id = any(
        getattr(application, attr, None)
        for attr in (
            "canonical_program_id",
            "program_offering_id",
            "intake_ref_id",
            "institution_ref_id",
        )
    )
    if not has_any_canonical_id and display_matches:
        # A legacy display-string-only row whose selection is unchanged: filling
        # in the canonical identity is a repair, not a reroute.
        return CANONICALIZATION

    return REASSIGNMENT


def has_payment_activity(application_id) -> bool:
    """Whether ANY payment record exists for the application (R10.5).

    "Any payment activity" is deliberately literal — a pending, deferred,
    failed, expired, successful, or force-approved ``Payment`` row all count.
    Once money movement has been attempted against an application, its
    assignment is immutable (design §7.2: "Before any payment exists,
    ``ChangeSelectionCommand`` may atomically reassign the draft").
    """
    from apps.documents.models import Payment

    return Payment.objects.filter(application_id=application_id).exists()


def _required_document_types(rows: Any) -> dict[str, dict[str, Any]]:
    """Index a requirement snapshot by document type (required entries only)."""
    if not isinstance(rows, list):
        return {}
    indexed: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        doc_type = row.get("document_type")
        if not doc_type:
            continue
        indexed[str(doc_type)] = row
    return indexed


def _uploaded_document_types(application_id) -> set[str]:
    """Document types already uploaded (and not deleted/rejected) for an application.

    A module-level seam so the post-write summary step is independently
    testable — and so a failure here provably rolls the whole reroute back
    rather than leaving a half-changed assignment.
    """
    from apps.documents.models import ApplicationDocument

    return set(
        ApplicationDocument.objects.filter(application_id=application_id)
        .exclude(verification_status__in=["deleted", "rejected"])
        .values_list("document_type", flat=True)
    )


def _resolve_application_fee(offering, application) -> Any:
    """Re-resolve the fee snapshot for the NEW offering, or ``None``.

    Canonical fee resolution only (task 5.4, DATA-05): no display-name lookup
    and no invented default. A missing/ambiguous fee leaves the column NULL and
    payment-time resolution fails closed with ``FEE_NOT_CONFIGURED``.
    """
    if offering is None:
        return None
    try:
        from apps.documents.fee_resolver import FeeResolver

        resolved = FeeResolver().resolve_for_offering(
            offering,
            getattr(application, "nationality", None),
            getattr(application, "country", None),
        )
        return resolved.amount
    except Exception:
        logger.info(
            "No canonical application fee for offering %s during change-selection; "
            "leaving the snapshot NULL (fail closed at payment time)",
            getattr(offering, "id", None),
        )
        return None


# ---------------------------------------------------------------------------
# The command
# ---------------------------------------------------------------------------

#: Assignment-derived answers cleared on a reroute. They were computed against
#: the previous offering's configuration, so keeping them would carry a stale
#: eligibility/fee/capacity answer into the new assignment (design §7.2 "clear
#: invalid dependent answers").
DEPENDENT_ANSWER_FIELDS: tuple[str, ...] = (
    "eligibility_status",
    "eligibility_score",
    "eligibility_notes",
    "waitlist_position",
    "is_late_submission",
)


def change_application_selection(
    *,
    application_id: Any,
    actor_id: Any,
    program_id: Any,
    intake_id: Any,
    expected_assignment_version: int | None = None,
    resolved_institution=None,
    requested_institution_id: Any = None,
    actor_role: str | None = None,
    host: str | None = None,
) -> SelectionChangeResult:
    """Atomically change a draft application's canonical selection.

    Args:
        application_id: The draft ``Application.id`` (the online draft identity).
        actor_id: The authenticated owner id. Ownership is scoped **before**
            lookup so a non-owned/absent draft raises ``NOT_FOUND`` (design
            §5.2 owner disclosure policy).
        program_id: The target ``CanonicalProgram`` id (canonical only).
        intake_id: The target ``Intake`` id (canonical only).
        expected_assignment_version: Optional optimistic version. When supplied
            and stale, raises ``VERSION_CONFLICT`` without mutating (R10.3).
        resolved_institution: The ``Institution`` resolved from the trusted host,
            or ``None`` on the neutral shared portal. When present it wins over
            any client-supplied institution (TEN-10).
        requested_institution_id: An explicit institution from the client. On a
            resolved tenant host a mismatch raises
            ``INSTITUTION_OVERRIDE_NOT_PERMITTED`` with no mutation.
        actor_role: The actor role, for the assignment audit event.
        host: The request host, for the assignment audit event.

    Returns:
        SelectionChangeResult: the change summary. ``changed`` is ``False`` for
        an unchanged selection (an idempotent no-op).

    Raises:
        SelectionChangeError: with a stable code —
            ``NOT_FOUND`` (404), ``INSTITUTION_OVERRIDE_NOT_PERMITTED`` (403),
            ``VERSION_CONFLICT`` (409), ``ASSIGNMENT_LOCKED_BY_PAYMENT`` (409),
            ``DUPLICATE_APPLICATION`` (409), ``NO_ELIGIBLE_OFFERING`` (400),
            ``INTAKE_NOT_OPEN`` / ``INTAKE_DEADLINE_PASSED`` (400), or
            ``CONFIGURATION_UNAVAILABLE`` (503, retryable).
    """
    from apps.applications.assignment_resolution import (
        AssignmentConfigurationError,
        resolve_assignment_snapshot,
    )
    from apps.applications.duplicate_checker import DuplicateChecker
    from apps.applications.intake_enforcer import IntakeEnforcer
    from apps.applications.models import Application, ApplicationStatusHistory
    from apps.catalog.services import OfferingAssignmentError

    # Tenant binding is decided before any write and before any lookup result is
    # disclosed: a resolved tenant host wins, and a mismatching explicit
    # institution is rejected with no mutation at all.
    institution_id = requested_institution_id
    if resolved_institution is not None:
        if (
            requested_institution_id is not None
            and str(requested_institution_id) != str(resolved_institution.id)
        ):
            raise SelectionChangeError(
                "INSTITUTION_OVERRIDE_NOT_PERMITTED",
                "The submitted institution does not match the tenant resolved for this domain.",
                status_code=403,
            )
        institution_id = resolved_institution.id

    try:
        with transaction.atomic():
            # 1) Scope-before-lookup + row lock. Only the caller's own draft.
            #    A malformed id is masked as not-found, exactly like an
            #    out-of-scope one (design §5.2 owner disclosure policy).
            try:
                application = (
                    Application.objects.select_for_update()
                    .filter(id=application_id, user_id=str(actor_id), status="draft")
                    .first()
                )
            except DjangoValidationError as exc:
                raise SelectionChangeError(
                    "NOT_FOUND", "Draft not found", status_code=404
                ) from exc
            if application is None:
                raise SelectionChangeError(
                    "NOT_FOUND", "Draft not found", status_code=404
                )

            if (
                expected_assignment_version is not None
                and int(expected_assignment_version) != int(application.assignment_version or 1)
            ):
                raise SelectionChangeError(
                    "VERSION_CONFLICT",
                    "This application changed since you loaded it. Reload and try again.",
                    status_code=409,
                    details={"assignment_version": int(application.assignment_version or 1)},
                )

            previous = _assignment_identity(application)
            previous_requirements = _required_document_types(
                getattr(application, "requirements_snapshot", None)
            )

            # 2) Resolve the target canonically (fail closed). Never a display
            #    string / name / code fallback (R7.1, DATA-01).
            snapshot = resolve_assignment_snapshot(
                program_id=program_id,
                intake_id=intake_id,
                country=getattr(application, "country", None),
                nationality=getattr(application, "nationality", None),
                institution_id=institution_id,
                emit_audit=True,
                audit_source="application_change_selection",
                audit_actor_id=str(actor_id) if actor_id else None,
                audit_actor_role=actor_role,
                audit_application_id=str(application.id),
                audit_domain_host=host,
            )

            classification = classify_selection_change(application, snapshot)

            if classification == UNCHANGED:
                # Idempotent no-op: the student's selection is already this
                # one. Deliberately evaluated BEFORE the payment gate so a paid
                # application can still re-send its own selection safely.
                return SelectionChangeResult(
                    application=application,
                    classification=UNCHANGED,
                    changed=False,
                    previous=previous,
                    current=_assignment_identity(application),
                )

            # 3) Payment activity makes the assignment immutable (R10.5). Only a
            #    genuine reassignment is blocked — completing the canonical
            #    identity of an unchanged selection is a repair, not a reroute.
            if classification == REASSIGNMENT and has_payment_activity(application.id):
                raise SelectionChangeError(
                    PAYMENT_LOCK_CODE,
                    PAYMENT_LOCK_MESSAGE,
                    status_code=409,
                    recovery=_payment_lock_recovery(application),
                )

            if classification == REASSIGNMENT:
                # 4) Revalidate the target intake and the duplicate rule for the
                #    NEW selection, excluding this application itself.
                intake_check = IntakeEnforcer.check_draft_creation(
                    snapshot.intake_name, intake_id=snapshot.intake_id
                )
                if not intake_check.allowed:
                    raise SelectionChangeError(
                        intake_check.code or "INTAKE_NOT_AVAILABLE",
                        intake_check.message or "This intake is not open for applications.",
                        status_code=400,
                    )

                duplicate = DuplicateChecker.check_at_create(
                    user_id=str(actor_id),
                    program=snapshot.program_name,
                    intake=snapshot.intake_name,
                    nrc_number=getattr(application, "nrc_number", None),
                    passport_number=getattr(application, "passport_number", None),
                    program_id=snapshot.canonical_program_id,
                    intake_id=snapshot.intake_id,
                    exclude_id=str(application.id),
                )
                if duplicate.has_duplicate:
                    raise SelectionChangeError(
                        "DUPLICATE_APPLICATION",
                        "You already have an application for this programme and intake.",
                        status_code=409,
                        details={
                            "existing_id": duplicate.existing_id,
                            "existing_status": duplicate.existing_status,
                            "resume_url": duplicate.resume_url,
                        },
                    )

            # 5) Write the whole assignment together: canonical IDs, display
            #    snapshots, configuration version, requirement + eligibility
            #    snapshots, the re-resolved fee, the cleared dependent answers,
            #    and the bumped optimistic versions.
            update_fields = [
                "institution_ref_id",
                "canonical_program_id",
                "program_offering_id",
                "intake_ref_id",
                "institution",
                "program",
                "intake",
                "configuration_version",
                "requirements_snapshot",
                "eligibility_snapshot",
                "assignment_version",
                "version",
                "updated_at",
            ]
            application.institution_ref_id = snapshot.institution_id
            application.canonical_program_id = snapshot.canonical_program_id
            application.program_offering_id = snapshot.program_offering_id
            application.intake_ref_id = snapshot.intake_id
            application.institution = snapshot.institution_name
            application.program = snapshot.program_name
            application.intake = snapshot.intake_name
            application.configuration_version = snapshot.configuration_version
            application.requirements_snapshot = snapshot.required_documents
            application.eligibility_snapshot = snapshot.eligibility_rules

            cleared_fields: list[str] = []
            if classification == REASSIGNMENT:
                application.application_fee = _resolve_application_fee(
                    snapshot.offering, application
                )
                update_fields.append("application_fee")
                for name in DEPENDENT_ANSWER_FIELDS:
                    current_value = getattr(application, name, None)
                    reset_value = False if name == "is_late_submission" else None
                    if current_value not in (None, "", False):
                        cleared_fields.append(name)
                    setattr(application, name, reset_value)
                    update_fields.append(name)

            application.assignment_version = int(application.assignment_version or 1) + 1
            try:
                application.version = int(getattr(application, "version", 0) or 0) + 1
            except (TypeError, ValueError):
                application.version = 1
            application.updated_at = timezone.now()
            application.save(update_fields=update_fields)

            current = _assignment_identity(application)
            new_requirements = _required_document_types(snapshot.required_documents)
            added = [
                row for doc_type, row in new_requirements.items()
                if doc_type not in previous_requirements
            ]
            removed = [
                row for doc_type, row in previous_requirements.items()
                if doc_type not in new_requirements
            ]

            # Uploaded evidence is never destroyed here (documents are immutable
            # versioned evidence — task 7.3). The summary names what no longer
            # applies and what is still missing so the client can guide the
            # student instead of silently dropping files.
            stale_uploads: list[str] = []
            missing_for_new: list[dict[str, Any]] = []
            if classification == REASSIGNMENT:
                uploaded_types = _uploaded_document_types(application.id)
                stale_uploads = sorted(
                    doc_type for doc_type in uploaded_types
                    if doc_type not in new_requirements and doc_type in previous_requirements
                )
                missing_for_new = [
                    {
                        "document_type": doc_type,
                        "label": row.get("label") or doc_type,
                    }
                    for doc_type, row in sorted(new_requirements.items())
                    if row.get("required") and doc_type not in uploaded_types
                ]

            # 6) Audit trail inside the same transaction — the reroute is a
            #    tenant-sensitive write, recorded with redacted before/after
            #    canonical identity (no PII).
            try:
                ApplicationStatusHistory.objects.create(
                    application=application,
                    status=application.status,
                    old_status=application.status,
                    new_status=application.status,
                    changed_by_id=str(actor_id) if actor_id else None,
                    notes="Application selection changed",
                    changes={
                        "action": "application.change_selection",
                        "classification": classification,
                        "previous": {
                            key: previous.get(key)
                            for key in (
                                "institution_id",
                                "canonical_program_id",
                                "program_offering_id",
                                "intake_id",
                                "configuration_version",
                                "assignment_version",
                            )
                        },
                        "current": {
                            key: current.get(key)
                            for key in (
                                "institution_id",
                                "canonical_program_id",
                                "program_offering_id",
                                "intake_id",
                                "configuration_version",
                                "assignment_version",
                            )
                        },
                        "cleared_fields": cleared_fields,
                    },
                )
            except Exception:  # pragma: no cover - audit must never break the command
                logger.warning(
                    "change-selection audit write failed for application %s",
                    application.id,
                    exc_info=True,
                )

            return SelectionChangeResult(
                application=application,
                classification=classification,
                changed=True,
                previous=previous,
                current=current,
                cleared_fields=cleared_fields,
                requirements_added=added,
                requirements_removed=removed,
                documents_no_longer_required=stale_uploads,
                documents_missing_for_new_selection=missing_for_new,
            )
    except SelectionChangeError:
        raise
    except AssignmentConfigurationError as exc:
        # Fail closed with the stable retryable code — never a partially
        # rerouted draft and never an empty-requirements success (DATA-04).
        raise SelectionChangeError(
            exc.code, exc.message, status_code=exc.status_code, retryable=exc.retryable
        ) from exc
    except OfferingAssignmentError as exc:
        raise SelectionChangeError(
            getattr(exc, "code", "NO_ELIGIBLE_OFFERING"), str(exc), status_code=400
        ) from exc
    except Exception as exc:  # noqa: BLE001 - translate, never leak internals
        # The atomic block has already rolled back, so the draft keeps its
        # previous assignment in full. Surface a stable, non-revealing error.
        logger.exception(
            "change-selection failed for application %s (rolled back)", application_id
        )
        raise SelectionChangeError(
            "INTERNAL_ERROR",
            "We could not change your programme selection. Please try again.",
            status_code=500,
        ) from exc
