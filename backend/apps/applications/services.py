"""Application service helpers.

Shared business logic extracted from views to eliminate duplication.
"""

import logging
import uuid as _uuid

from django.db import transaction
from django.utils import timezone

from apps.applications.models import Application, ApplicationStatusHistory
from apps.documents.models import ApplicationDocument, Payment
from apps.documents.payment_constants import (
    RECEIPT_ELIGIBLE_STATUSES,
    RESOLVED_PAYMENT_STATUSES,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Canonical system actor - see ADR-013 and backend/scripts/system_actor_seed.sql.
# ---------------------------------------------------------------------------
#
# Automated tasks (draft expiry, condition expiry, enrollment expiry, waitlist
# auto-promotion) historically passed the string "system" as ``changed_by``.
# Both ``Application.reviewed_by`` and ``ApplicationStatusHistory.changed_by``
# are uuid FKs to ``profiles.id``; Postgres rejects "system" as an invalid
# uuid and the FK write fails. Each Celery task caught the resulting exception
# inside an outer ``try/except logger.exception(...)`` and continued, so the
# bug was silent in production - drafts never expired, conditions never
# auto-rejected, enrollments never released, waitlist never auto-promoted.
#
# All automated callers MUST now pass ``SYSTEM_ACTOR_ID``. The seeded profile
# at this UUID is inactive, so it cannot be authenticated as.
SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000001"

# Valid status transitions enforced by transition_application_status().
# Any (old_status, new_status) pair not represented here is rejected.
# Terminal statuses (no outbound transitions): rejected, withdrawn, expired,
# enrolled, enrollment_expired.
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"submitted", "expired"},
    "submitted": {"under_review", "approved", "rejected", "withdrawn"},
    "under_review": {"approved", "rejected", "waitlisted", "conditionally_approved", "withdrawn"},
    "waitlisted": {"approved", "rejected", "conditionally_approved", "withdrawn"},
    "conditionally_approved": {"approved", "rejected", "enrolled", "enrollment_expired", "withdrawn"},
    "approved": {"enrolled", "enrollment_expired", "withdrawn"},
}

# Error code raised when a disallowed transition is attempted.
INVALID_STATUS_TRANSITION = "INVALID_STATUS_TRANSITION"

# Fields updated by transition_application_status - kept as a module
# constant so both the helper and its callers can reference the same list.
_STATUS_TRANSITION_UPDATE_FIELDS = [
    "status",
    "review_started_at",
    "reviewed_by",
    "admin_feedback",
    "admin_feedback_date",
    "admin_feedback_by",
    "decision_date",
    "updated_at",
    "waitlist_position",
    "enrollment_confirmation_deadline",
]


class ApplicationSubmissionError(Exception):
    """Raised when a student-facing submission attempt fails validation.

    ``status_code`` lets a caller signal a non-400 HTTP status (e.g. the
    offering-revalidation codes are 409 Conflict). ``next_action`` carries an
    optional recoverable next-action payload so the client can present a
    non-dead-end path (choose another intake, join the waitlist, etc.).
    Both default to the legacy behaviour (400, no next action) so existing
    raisers that pass only ``(code, message)`` are unaffected.
    """

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int = 400,
        next_action: dict | None = None,
        retryable: bool = False,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.next_action = next_action
        self.retryable = retryable


def _coerce_uuid(value) -> str | None:
    """Return the canonical string form of *value* iff it is a real UUID.

    Returns ``None`` for ``None``, empty, non-UUID strings, or non-string
    objects (e.g. ``MagicMock`` attributes in unit tests). This is the guard
    that keeps submission-time offering revalidation strictly additive: legacy
    rows with null canonical IDs — and any object that does not carry genuine
    canonical UUIDs — fall straight through to the existing behaviour.
    """
    try:
        return str(_uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


def _resolve_offering_for_fees(application):
    """Resolve the offering whose fee configuration governs *application*.

    Remediation **L1** (DATA-01 / STU-01, R7.6): the late-application fee gate
    resolved its ``Program`` with ``filter(name=application.program,
    is_active=True)``. Two tenants may offer the same-name canonical program, so
    that lookup could charge this student *another school's* late fee — or miss
    their own. The offering is now resolved through the canonical
    ``program_offering_id`` the application already carries.

    Returns ``None`` when the application has no canonical offering id (a legacy
    pre-5.2 row) or the offering is inactive. ``None`` means **no fee authority
    exists for this row**, so the gate does not run — deliberately fail-closed:
    demanding an arbitrary same-name tenant's fee is worse than demanding none,
    and the platform must not invent a fee it cannot attribute (the same rule
    ``FeeResolver`` states as "fails closed — never an invented default").
    """
    from apps.applications.canonical_reads import resolve_offering

    return resolve_offering(application, require_active=True)


def _evaluate_locked_offering(
    offering_id: str,
    intake_id: str,
    country: str | None,
    nationality: str | None,
) -> tuple[bool, bool]:
    """Re-check the *previously assigned* offering against current state.

    Mirrors the per-candidate eligibility filters of
    ``OfferingAssignmentService.assign`` for one specific offering so we can
    distinguish the two recoverable submit-time failures:

    Returns ``(eligible, capacity_full)``:
      * ``eligible`` — the offering is still active, its program-intake link is
        active, residency/assignment rules still allow this applicant, and
        capacity is not exhausted.
      * ``capacity_full`` — the offering's program-intake capacity is exhausted
        (used to choose ``OFFERING_CAPACITY_FULL`` over
        ``OFFERING_NO_LONGER_AVAILABLE``).
    """
    from apps.catalog.models import Intake, Program, ProgramIntake
    from apps.catalog.services import OfferingAssignmentService

    offering = Program.objects.filter(id=offering_id).first()
    intake_obj = Intake.objects.filter(id=intake_id).first()
    if offering is None or intake_obj is None:
        return (False, False)

    program_intake = ProgramIntake.objects.filter(
        program_id=offering_id, intake_id=intake_id
    ).first()

    capacity_full = bool(
        program_intake is not None
        and not OfferingAssignmentService._has_capacity(program_intake, intake_obj)
    )

    active = bool(offering.is_active) and (offering.offering_status == "active")
    program_intake_active = program_intake is not None and (
        program_intake.is_active is True or program_intake.is_active is None
    )
    rules_ok = True
    if program_intake is not None:
        rules_ok = OfferingAssignmentService._rules_match(
            offering.assignment_rules, country=country, nationality=nationality
        ) and OfferingAssignmentService._rules_match(
            program_intake.residency_rules, country=country, nationality=nationality
        )

    eligible = bool(
        active
        and program_intake is not None
        and program_intake_active
        and rules_ok
        and not capacity_full
    )
    return (eligible, capacity_full)


def _build_revalidation_error(capacity_full: bool) -> ApplicationSubmissionError:
    """Construct the recoverable 409 error for a stale offering assignment."""
    if capacity_full:
        return ApplicationSubmissionError(
            "OFFERING_CAPACITY_FULL",
            "The assigned school offering filled to capacity before your "
            "application was submitted.",
            status_code=409,
            next_action={
                "type": "join_waitlist",
                "message": "This offering is now full. You can join the waitlist "
                "or choose another intake.",
            },
        )
    return ApplicationSubmissionError(
        "OFFERING_NO_LONGER_AVAILABLE",
        "The school offering assigned to this application is no longer "
        "available for the selected intake.",
        status_code=409,
        next_action={
            "type": "choose_another_intake",
            "message": "This offering is no longer available. Please choose "
            "another intake or contact admissions.",
        },
    )


def _revalidate_offering_assignment(locked_app: Application) -> None:
    """Re-run offering assignment at submit time against the locked snapshot.

    Design R2.7 / R2.4: the submission path re-validates eligibility and
    capacity rather than trusting the assignment captured at draft time. If the
    previously assigned offering is no longer eligible it raises
    ``OFFERING_NO_LONGER_AVAILABLE``; if it filled to capacity it raises
    ``OFFERING_CAPACITY_FULL`` — both recoverable (409). Submission never
    silently succeeds on a stale draft assignment.

    Strictly additive: applications without a full set of canonical IDs (legacy
    rows) skip revalidation entirely and keep the existing behaviour. Any
    unexpected infrastructure error degrades to "skip" rather than blocking a
    legitimate submission.
    """
    program_id = _coerce_uuid(getattr(locked_app, "canonical_program_id", None))
    intake_id = _coerce_uuid(getattr(locked_app, "intake_ref_id", None))
    offering_id = _coerce_uuid(getattr(locked_app, "program_offering_id", None))
    if not (program_id and intake_id and offering_id):
        # Legacy / non-canonical application — do not force assignment.
        return

    institution_id = _coerce_uuid(getattr(locked_app, "institution_ref_id", None))
    country = getattr(locked_app, "country", None)
    nationality = getattr(locked_app, "nationality", None)

    try:
        from apps.catalog.services import (
            OfferingAssignmentError,
            OfferingAssignmentService,
        )

        # R2.7: re-run the assignment service with the LOCKED snapshot residency
        # inputs (not live client input).
        winner_id: str | None
        try:
            result = OfferingAssignmentService().assign(
                program_id=program_id,
                intake_id=intake_id,
                country=country,
                nationality=nationality,
                institution_id=institution_id,
                emit_audit=True,
                audit_source="application_submit_revalidation",
                audit_application_id=str(getattr(locked_app, "id", "")) or None,
            )
            winner_id = str(result.offering.id)
        except OfferingAssignmentError:
            winner_id = None

        # Fast path: the assignment still resolves to the same offering.
        if winner_id == offering_id:
            return

        # The assigned offering is no longer the winner (or nothing resolved).
        # Decide precisely whether the previously assigned offering is still
        # eligible; only fail when it genuinely is not.
        eligible, capacity_full = _evaluate_locked_offering(
            offering_id, intake_id, country, nationality
        )
        if eligible:
            return
        raise _build_revalidation_error(capacity_full)
    except ApplicationSubmissionError:
        raise
    except Exception:
        # Never block a legitimate submission on an unexpected revalidation
        # error (canonical program/intake row unreadable, infra hiccup, ...).
        logger.warning(
            "Offering assignment revalidation degraded for app=%s",
            getattr(locked_app, "id", None),
            exc_info=True,
        )
        return


def transition_application_status(
    application: Application,
    new_status: str,
    changed_by: str,
    notes: str = "",
    ip_address: str = "",
    user_agent: str = "",
) -> str:
    """Apply a status transition to an application and record history.

    Mutates *application* in place, calls ``application.save()``, and
    creates an ``ApplicationStatusHistory`` row.

    Args:
        application: The Application instance to transition.
        new_status: Target status value.
        changed_by: User ID (as string) of the actor performing the change.
        notes: Optional reviewer notes / admin feedback.
        ip_address: Hashed or raw IP for the history record.
        user_agent: Hashed or raw user-agent for the history record.

    Returns:
        The previous status value (``old_status``).
    """
    # --- Actor-id type guard (ADR-013) ---
    # Reject non-UUID changed_by early so the failure mode is loud (ValueError
    # surfaced in tests/logs) rather than silent (Postgres FK write rejected
    # inside a Celery task try/except). Automated tasks must pass
    # SYSTEM_ACTOR_ID instead of the literal string "system".
    try:
        _uuid.UUID(str(changed_by))
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError(
            f"transition_application_status: changed_by must be a UUID, "
            f"got {changed_by!r}. Automated tasks must pass SYSTEM_ACTOR_ID "
            f"from apps.applications.services."
        ) from exc

    old_status = application.status

    # --- State machine enforcement (Req 13) ---
    allowed = ALLOWED_TRANSITIONS.get(old_status, set())
    if new_status not in allowed:
        logger.warning(
            "Invalid transition: app=%s from=%s to=%s by=%s",
            application.id,
            old_status,
            new_status,
            changed_by,
        )
        raise ValueError(
            f"Cannot transition from '{old_status}' to '{new_status}'."
        )

    application.status = new_status

    if not application.review_started_at and new_status in ("under_review", "conditionally_approved", "approved", "rejected"):
        application.review_started_at = timezone.now()

    if new_status not in ('submitted',):
        application.reviewed_by_id = changed_by

    if notes:
        application.admin_feedback = notes
        application.admin_feedback_date = timezone.now()
        application.admin_feedback_by_id = changed_by

    if new_status in ("approved", "rejected", "conditionally_approved", "withdrawn", "expired", "enrolled", "enrollment_expired"):
        application.decision_date = timezone.now()

    application.updated_at = timezone.now()
    application.save(update_fields=_STATUS_TRANSITION_UPDATE_FIELDS)

    ApplicationStatusHistory.objects.create(
        application=application,
        status=new_status,
        old_status=old_status,
        new_status=new_status,
        changed_by_id=changed_by,
        notes=notes,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    # --- Post-transition side-effects ---

    # Assign waitlist position when entering 'waitlisted' (P1-03)
    if new_status == "waitlisted" and not application.waitlist_position:
        try:
            from apps.applications.waitlist_manager import WaitlistManager
            WaitlistManager.assign_position(application, application.program, application.intake)
        except Exception:
            logger.exception("Failed to assign waitlist position for app=%s", application.id)

    # Compute enrollment deadline when entering approval statuses (P1-02)
    if new_status in ("approved", "conditionally_approved") and not application.enrollment_confirmation_deadline:
        try:
            from apps.applications.enrollment_service import EnrollmentService
            deadline = EnrollmentService.compute_deadline(application)
            Application.objects.filter(id=application.id).update(enrollment_confirmation_deadline=deadline)
            application.enrollment_confirmation_deadline = deadline
        except Exception:
            logger.exception("Failed to compute enrollment deadline for app=%s", application.id)

    # Assign a student number on FULL acceptance (entering 'enrolled'). This
    # catches every path to enrolled (admin review, condition auto-promote,
    # waitlist auto-promote → approved → enrolled, student enrollment
    # confirmation). Idempotent — an application that already has a number
    # keeps it. Never blocks the transition if number generation fails.
    if new_status == "enrolled" and not getattr(application, "student_number", None):
        try:
            from apps.applications._view_helpers import assign_student_number_if_needed
            assign_student_number_if_needed(application)
        except Exception:
            logger.exception("Failed to assign student number for app=%s", application.id)

    return old_status


def transition_applications_bulk(
    applications,
    new_status: str,
    changed_by: str,
    *,
    notes: str = "",
    ip_address: str = "",
    user_agent: str = "",
) -> list:
    """Batch-apply one forward-only status transition across many applications.

    Behaviourally equivalent to calling :func:`transition_application_status`
    once per application, but persists the status mutations with a single
    ``bulk_update`` and the ``ApplicationStatusHistory`` rows with a single
    ``bulk_create`` — turning O(N) writes into O(1) for periodic expiry tasks
    (system-performance-hardening R6.4).

    Forward-only enforcement is preserved per application: an application whose
    current status does not permit ``new_status`` (per ``ALLOWED_TRANSITIONS``)
    is skipped and logged rather than raising, so one ineligible row cannot
    abort the batch.

    This helper targets the terminal expiry transitions used by the periodic
    tasks (``draft → expired``, ``approved``/``conditionally_approved →
    enrollment_expired``). It still runs the same per-row post-transition hooks
    as the single-row helper for full equivalence; those hooks are no-ops for
    the terminal expiry statuses.

    Returns the list of ``(application, old_status)`` tuples actually
    transitioned (in input order, ineligible rows omitted).
    """
    # Same actor-id type guard as the single-row helper (ADR-013).
    try:
        _uuid.UUID(str(changed_by))
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError(
            f"transition_applications_bulk: changed_by must be a UUID, "
            f"got {changed_by!r}. Automated tasks must pass SYSTEM_ACTOR_ID "
            f"from apps.applications.services."
        ) from exc

    now = timezone.now()
    to_update: list[Application] = []
    history_rows: list[ApplicationStatusHistory] = []
    transitioned: list = []

    for application in applications:
        old_status = application.status
        allowed = ALLOWED_TRANSITIONS.get(old_status, set())
        if new_status not in allowed:
            logger.warning(
                "Invalid bulk transition skipped: app=%s from=%s to=%s by=%s",
                getattr(application, "id", None),
                old_status,
                new_status,
                changed_by,
            )
            continue

        application.status = new_status

        if not application.review_started_at and new_status in (
            "under_review",
            "conditionally_approved",
            "approved",
            "rejected",
        ):
            application.review_started_at = now

        if new_status not in ("submitted",):
            application.reviewed_by_id = changed_by

        if notes:
            application.admin_feedback = notes
            application.admin_feedback_date = now
            application.admin_feedback_by_id = changed_by

        if new_status in (
            "approved",
            "rejected",
            "conditionally_approved",
            "withdrawn",
            "expired",
            "enrolled",
            "enrollment_expired",
        ):
            application.decision_date = now

        application.updated_at = now

        to_update.append(application)
        history_rows.append(
            ApplicationStatusHistory(
                application=application,
                status=new_status,
                old_status=old_status,
                new_status=new_status,
                changed_by_id=changed_by,
                notes=notes,
                ip_address=ip_address,
                user_agent=user_agent,
                created_at=now,
            )
        )
        transitioned.append((application, old_status))

    if not to_update:
        return []

    with transaction.atomic():
        Application.objects.bulk_update(to_update, _STATUS_TRANSITION_UPDATE_FIELDS)
        ApplicationStatusHistory.objects.bulk_create(history_rows)

    # Per-row post-transition side effects, identical to the single-row helper.
    # These are guarded no-ops for the terminal expiry statuses this helper
    # targets, but are included so the batch path stays equivalent for any
    # future caller.
    for application, _old_status in transitioned:
        if new_status == "waitlisted" and not application.waitlist_position:
            try:
                from apps.applications.waitlist_manager import WaitlistManager
                WaitlistManager.assign_position(
                    application, application.program, application.intake
                )
            except Exception:
                logger.exception(
                    "Failed to assign waitlist position for app=%s", application.id
                )

        if new_status in ("approved", "conditionally_approved") and not application.enrollment_confirmation_deadline:
            try:
                from apps.applications.enrollment_service import EnrollmentService
                deadline = EnrollmentService.compute_deadline(application)
                Application.objects.filter(id=application.id).update(
                    enrollment_confirmation_deadline=deadline
                )
                application.enrollment_confirmation_deadline = deadline
            except Exception:
                logger.exception(
                    "Failed to compute enrollment deadline for app=%s", application.id
                )

        if new_status == "enrolled" and not getattr(application, "student_number", None):
            try:
                from apps.applications._view_helpers import assign_student_number_if_needed
                assign_student_number_if_needed(application)
            except Exception:
                logger.exception(
                    "Failed to assign student number for app=%s", application.id
                )

    return transitioned


def _application_has_completed_payment(application_id) -> bool:
    # force_approved (admin offline-payment override) is a completed payment
    # too — not just "successful". RECEIPT_ELIGIBLE_STATUSES = both.
    return Payment.objects.filter(
        application_id=application_id, status__in=RECEIPT_ELIGIBLE_STATUSES
    ).exists()


def _application_has_identity_document(application_id) -> bool:
    return ApplicationDocument.objects.filter(
        application_id=application_id,
        document_type__in=["nrc", "passport", "extra_kyc"],
    ).exclude(
        verification_status__in=["deleted", "rejected"],
    ).exists()


def _required_documents_for_submission(application, offering_id, canonical_program_id) -> list[dict]:
    """Resolve the required-document configuration for a canonical application.

    Prefers the versioned ``requirements_snapshot`` captured on the application
    at assignment time (admissions-v2 task 5.2, design §9.3, STU-13) — it is the
    authoritative, drift-free requirement set and needs no re-resolution. When a
    canonical application predates the snapshot (legacy row with canonical IDs
    but no snapshot), it live-resolves through the fail-closed resolver.

    Fail-closed (R11.6, DATA-04, STU-13): a canonical application whose required
    documents cannot be evaluated raises ``AssignmentConfigurationError`` (via
    the resolver) rather than degrading to an empty list. The caller translates
    that to a stable retryable submission error.
    """
    snapshot = getattr(application, "requirements_snapshot", None)
    if isinstance(snapshot, list):
        return snapshot

    from apps.applications.assignment_resolution import (
        AssignmentConfigurationError,
        resolve_required_documents,
    )
    from apps.catalog.models import CanonicalProgram, Program

    offering = Program.objects.filter(id=offering_id).first()
    canonical = CanonicalProgram.objects.filter(id=canonical_program_id).first()
    if offering is None or canonical is None:
        # Canonical IDs are present but the referenced rows are unreadable — the
        # configuration cannot be evaluated, so fail closed (never fall through
        # to an empty requirement set, which was the DATA-04 fail-open).
        raise AssignmentConfigurationError()

    return resolve_required_documents(offering, canonical)


def _missing_assigned_required_documents(application) -> list[dict[str, str]]:
    """Return the assigned-config required documents missing from *application*.

    Implements the submission half of R15.6 / R11.6: the dynamic
    Required_Documents resolved for the assigned offering (preferring the
    application's versioned ``requirements_snapshot``) gate submission — a
    required document type with no uploaded, non-deleted/non-rejected
    ``ApplicationDocument`` row blocks submission "per the assigned
    configuration".

    Fail-closed (admissions-v2 task 5.2, DATA-04, STU-13): when a canonical
    application's required-document configuration cannot be evaluated, this
    raises ``ApplicationSubmissionError("CONFIGURATION_UNAVAILABLE", ...)``
    (retryable 503) instead of returning ``[]`` and letting submission proceed
    on an unverified configuration.

    Strictly additive: legacy / non-canonical rows — any application missing the
    canonical offering + program IDs (including ``MagicMock`` attributes in unit
    tests, filtered by ``_coerce_uuid``) — return ``[]`` and keep the existing
    hardcoded-identity-only behaviour.

    Returns the list of missing ``{"document_type", "label"}`` entries; an empty
    list means the assigned required-document gate is satisfied.
    """
    offering_id = _coerce_uuid(getattr(application, "program_offering_id", None))
    canonical_program_id = _coerce_uuid(getattr(application, "canonical_program_id", None))
    if not (offering_id and canonical_program_id):
        return []

    from apps.applications.assignment_resolution import AssignmentConfigurationError

    try:
        required = _required_documents_for_submission(
            application, offering_id, canonical_program_id
        )
    except AssignmentConfigurationError as exc:
        # Fail closed with a stable retryable code (R11.6). Never permit
        # submission on a configuration we could not evaluate (DATA-04).
        raise ApplicationSubmissionError(
            exc.code, exc.message, status_code=exc.status_code, retryable=exc.retryable
        ) from exc

    required_types = {
        row["document_type"]: row.get("label") or row["document_type"]
        for row in required
        if row.get("required")
    }
    if not required_types:
        return []

    present_types = set(
        ApplicationDocument.objects.filter(
            application_id=application.id,
            document_type__in=list(required_types.keys()),
        )
        .exclude(verification_status__in=["deleted", "rejected"])
        .values_list("document_type", flat=True)
    )

    return [
        {"document_type": doc_type, "label": label}
        for doc_type, label in sorted(required_types.items())
        if doc_type not in present_types
    ]


def _raise_first_submission_blocker(blockers) -> None:
    """Translate the first readiness blocker into ``ApplicationSubmissionError``.

    Admissions-v2 task 6.5 (R10.6): the authoritative in-lock re-evaluation lives
    in :mod:`apps.applications.readiness_service`; this is the transport-neutral
    translation seam so the submission service keeps raising the same stable
    codes (and the same relative precedence) it always has.
    """
    if not blockers:
        return
    blocker = blockers[0]
    status_code = 400
    if blocker.retryable:
        status_code = 503
    elif blocker.code in (
        "PROGRAM_CAPACITY_REACHED",
        "INTAKE_CAPACITY_REACHED",
        "DUPLICATE_SUBMITTED_APPLICATION",
    ):
        status_code = 409
    raise ApplicationSubmissionError(
        blocker.code,
        blocker.message,
        status_code=status_code,
        retryable=blocker.retryable,
        next_action=blocker.details.get("next_action"),
    )


def submit_application(
    *,
    application: Application,
    changed_by: str,
    ip_address: str = "",
    user_agent: str = "",
    admin_force: bool = False,
    declarations_accepted: bool = True,
    expected_version: int | None = None,
) -> tuple[Application, str]:
    """Submit an application after enforcing payment/document/state checks.

    When admin_force=True, payment and identity document checks are bypassed.
    This allows admins to force-submit applications that haven't completed
    the normal student flow (e.g. offline payments, paper documents).

    Admissions-v2 task 6.5 (R10.6, R11.2-R11.6, R12.3; findings DATA-03, DATA-04,
    STU-11, STU-13): after the capacity row and the application row are locked,
    the full deterministic readiness set is **re-evaluated on the locked row**
    (profile, canonical persisted grades, dynamic required documents, program
    eligibility, duplicates, capacity, fee/payment/defer, declarations, and
    canonical configuration health) before the single legal state transition. A
    canonical configuration that cannot be evaluated fails closed with the stable
    retryable ``CONFIGURATION_UNAVAILABLE`` — never an implicit "no requirements"
    success.

    Args:
        declarations_accepted: whether the student's submission declaration
            accompanied this command. Re-checked under the lock so the
            declaration is part of the authoritative gate, not only a client
            affordance.
        expected_version: optional optimistic ``Application.version``. When
            supplied and stale, raises ``VERSION_CONFLICT`` (409) without
            mutating anything (R10.6 "optimistic version").
    """

    # Intake deadline and capacity enforcement (Req 6.1, 6.3)
    from apps.applications.capacity_service import CapacityService
    from apps.applications.intake_enforcer import IntakeEnforcer

    # Canonical Intake_Offering identity (task 5.2 snapshot). When present, every
    # capacity/counter operation keys on these IDs instead of display strings so
    # a same-name other tenant is never counted (admissions-v2 task 5.3, DATA-02).
    offering_id, intake_id = CapacityService.offering_ids(application)

    intake_check = IntakeEnforcer.check_submission(
        application.intake, application.program, offering_id=offering_id, intake_id=intake_id
    )
    if not intake_check.allowed:
        raise ApplicationSubmissionError(intake_check.code, intake_check.message)

    # Evidence-gate results computed once and re-used by the authoritative
    # in-lock readiness re-evaluation below, so that pass stays query-free for
    # payment/identity (admissions-v2 task 6.5).
    payment_row_completed: bool | None = None
    has_identity_document: bool | None = None

    with transaction.atomic():
        if not admin_force:
            # Drift-guard anchor: payment_status in ("successful", "force_approved", "verified", "paid", "deferred")
            payment_row_completed = _application_has_completed_payment(application.id)
            has_payment = (
                application.payment_status in RESOLVED_PAYMENT_STATUSES
                or payment_row_completed
            )
            if not has_payment:
                raise ApplicationSubmissionError(
                    "PAYMENT_REQUIRED",
                    "Payment must be completed before submitting the application.",
                )

            has_identity_document = _application_has_identity_document(application.id)
            if not has_identity_document:
                raise ApplicationSubmissionError(
                    "IDENTITY_DOCUMENT_REQUIRED",
                    "An NRC or Passport document must be uploaded before submission.",
                )

            # Assigned-config required-document gate (R15.6). Missing required
            # documents resolved from the assigned offering/canonical/default
            # configuration block submission. Strictly additive: legacy rows
            # without canonical IDs return no missing docs and submit as before.
            missing_required = _missing_assigned_required_documents(application)
            if missing_required:
                labels = ", ".join(doc["label"] for doc in missing_required)
                raise ApplicationSubmissionError(
                    "REQUIRED_DOCUMENT_MISSING",
                    f"Required document(s) must be uploaded before submission: {labels}.",
                )
        else:
            logger.warning(
                "Admin force-submit bypassing payment/document checks: app=%s admin=%s",
                application.id, changed_by,
            )

        # Late application fee enforcement (Req 6.3, 6.5, 6.6, 6.7)
        late_fee_amount = None
        if intake_check.is_late is True:
            from apps.documents.fee_resolver import FeeResolver
            from apps.documents.models import ProgramFee

            try:
                # The late fee is the application's OWN offering's fee, resolved
                # by canonical offering id (remediation L1, DATA-01 / STU-01).
                # ``None`` → no fee authority for this row → gate does not run.
                offering_obj = _resolve_offering_for_fees(application)
                if offering_obj:
                    late_fee = ProgramFee.objects.filter(
                        program=offering_obj,
                        fee_type="late_application",
                        is_active=True,
                    ).first()
                    if late_fee:
                        late_fee_amount = late_fee.amount
                        late_fee_paid = Payment.objects.filter(
                            application_id=application.id,
                            status="successful",
                            metadata__fee_type="late_application",
                        ).exists()
                        if not late_fee_paid and application.payment_status != "force_approved":
                            raise ApplicationSubmissionError(
                                "LATE_FEE_REQUIRED",
                                f"A late application fee of {late_fee.amount} {late_fee.currency} "
                                "must be paid before submitting a late application.",
                            )
            except ApplicationSubmissionError:
                raise
            except Exception:
                raise ApplicationSubmissionError(
                    "LATE_FEE_CHECK_FAILED",
                    "Unable to verify late fee requirements. Please try again.",
                )

        # Fixed lock order (design §7.3, task 5.3): the canonical Intake_Offering
        # capacity row FIRST, then the application row. Taking the capacity row
        # here means every gate below — including the capacity re-evaluation and
        # the final seat claim — reads a row no concurrent submit can move under
        # it (DATA-03). Legacy rows without canonical IDs have no capacity row to
        # lock and keep the previous behaviour.
        if offering_id and intake_id:
            CapacityService.lock_capacity_row(offering_id, intake_id)

        locked_app = Application.objects.select_for_update().get(id=application.id)
        if locked_app.status != "draft":
            raise ApplicationSubmissionError(
                "ALREADY_SUBMITTED",
                "This application has already been submitted.",
            )

        # Optimistic version guard (R10.6). Only enforced when the caller supplies
        # the version it read, so existing callers are unaffected.
        if expected_version is not None:
            current_version = int(getattr(locked_app, "version", 1) or 1)
            if int(expected_version) != current_version:
                raise ApplicationSubmissionError(
                    "VERSION_CONFLICT",
                    "This application changed since you loaded it. Reload and try again.",
                    status_code=409,
                    next_action={
                        "type": "reload_application",
                        "message": "Reload the application to see the latest saved answers, "
                        "then submit again.",
                        "version": current_version,
                    },
                )

        # ------------------------------------------------------------------
        # Authoritative in-lock readiness re-evaluation (task 6.5, R10.6).
        # ------------------------------------------------------------------
        # Every gate the student is responsible for is re-evaluated on the LOCKED
        # row, through the same deterministic evaluator that answers
        # ``GET /api/v2/student/applications/{id}/readiness/``, so the query the
        # student saw and the decision the server makes can never disagree:
        # profile, canonical persisted grades (R11.5/STU-11 — the gate that did
        # not exist at submission at all), program eligibility, versioned
        # required documents (R11.6/STU-13/DATA-04 — fails closed on an
        # unevaluable canonical configuration), payment/defer (R12.3), and the
        # student's declaration.
        #
        # The contended global checks stay with this service (evaluate_contended=
        # False): the intake window and the duplicate gate are re-checked below
        # in this same lock, and the authoritative last-seat capacity decision is
        # made under the ProgramIntake row lock in
        # ``CapacityService.take_seat_for_submission`` (design §7.3, DATA-03).
        #
        # Strictly additive: a legacy row without canonical IDs skips the
        # canonical-only gates, and ``admin_force`` bypasses the student-evidence
        # gates exactly as it did before this pass existed.
        from apps.applications import readiness_service
        from apps.applications.assignment_resolution import (
            AssignmentConfigurationError as _InLockConfigurationError,
        )

        try:
            in_lock_blockers = readiness_service.submission_blockers(
                locked_app,
                declarations_accepted=declarations_accepted,
                has_completed_payment=payment_row_completed,
                has_identity_document=has_identity_document,
                skip_evidence_gates=admin_force,
                evaluate_contended=False,
            )
        except _InLockConfigurationError as exc:
            # Any fail-closed canonical resolution inside the in-lock pass —
            # required documents, or (admissions-v2 task 7.1) eligibility rules
            # live-resolved because the row predates the ``eligibility_snapshot``
            # — must surface as the stable retryable ``CONFIGURATION_UNAVAILABLE``
            # (R11.6, DATA-04), exactly like the pre-lock document gate above.
            # Without this the student would get an opaque 500 for a condition the
            # contract says is retryable.
            raise ApplicationSubmissionError(
                exc.code, exc.message, status_code=exc.status_code, retryable=exc.retryable
            ) from exc

        _raise_first_submission_blocker(in_lock_blockers)

        # Re-check intake capacity inside the lock to close TOCTOU race
        # (advisory for canonical apps; the authoritative last-seat decision is
        # made under the ProgramIntake row lock in
        # CapacityService.take_seat_for_submission below).
        intake_recheck = IntakeEnforcer.check_submission(
            locked_app.intake, locked_app.program, offering_id=offering_id, intake_id=intake_id
        )
        if not intake_recheck.allowed:
            raise ApplicationSubmissionError(intake_recheck.code, intake_recheck.message)

        # Duplicate check at submit time (Req 4.3, 4.4)
        from apps.applications.duplicate_checker import DuplicateChecker

        dup_result = DuplicateChecker.check_at_submit(
            user_id=str(locked_app.user_id),
            program=locked_app.program,
            intake=locked_app.intake,
            exclude_id=str(locked_app.id),
            program_id=str(locked_app.canonical_program_id) if locked_app.canonical_program_id else None,
            intake_id=str(locked_app.intake_ref_id) if locked_app.intake_ref_id else None,
        )
        if dup_result.has_duplicate:
            raise ApplicationSubmissionError(
                "DUPLICATE_SUBMITTED_APPLICATION",
                "Another application for this program and intake has already been submitted.",
            )

        # Re-run offering assignment against the locked snapshot (R2.7 / R2.4).
        # Additive: legacy rows without canonical IDs skip this entirely.
        # Admin force-submit bypasses revalidation alongside the other gates so
        # operators can still force offline/paper submissions onto a full or
        # archived offering.
        if not admin_force:
            _revalidate_offering_assignment(locked_app)

        old_status = transition_application_status(
            application=locked_app,
            new_status="submitted",
            changed_by=changed_by,
            notes="",
            ip_address=ip_address,
            user_agent=user_agent,
        )

        # Emit business metric for application submission (Req 3.2)
        logger.info(
            "business_metric",
            extra={
                "type": "business_metric",
                "metric": "application_submitted",
                "application_id": str(locked_app.id),
                "program": locked_app.program,
            },
        )

        now = timezone.now()
        locked_app.submitted_at = locked_app.submitted_at or now
        locked_app.updated_at = now
        update_fields = ["submitted_at", "updated_at"]

        # Flag late submissions (Req 6.3)
        if intake_check.is_late is True:
            locked_app.is_late_submission = True
            update_fields.append("is_late_submission")

        locked_app.save(update_fields=update_fields)

        # Claim the seat (Req 6.5, AUDIT-1.6-002; admissions-v2 task 5.3, DATA-03).
        # Canonical applications go through the locked last-seat allocation: the
        # ProgramIntake capacity row is locked (SELECT ... FOR UPDATE), a
        # drift-free live occupancy count is evaluated under that lock, and the
        # counter is incremented atomically — so N concurrent last-seat submits
        # serialize on the row lock and exactly one claims the final seat. Legacy
        # rows without canonical IDs keep the name-based F() increment.
        from apps.applications.capacity_service import CapacityError

        try:
            took_canonical_seat = CapacityService.take_seat_for_submission(locked_app)
        except CapacityError as exc:
            raise ApplicationSubmissionError(exc.code, exc.message, status_code=409) from exc
        if not took_canonical_seat:
            IntakeEnforcer.increment_enrollment(locked_app.intake, locked_app.program)

    # Send submission confirmation notification
    try:
        from apps.common.communication_service import CommunicationService
        CommunicationService.send('application_submitted', application)
    except Exception:
        logger.exception("Failed to send submission notification for app=%s", application.id)

    # Advisory eligibility evaluation - non-blocking (Req 5.7)
    try:
        from apps.applications.eligibility_engine import EligibilityEngine

        engine = EligibilityEngine()
        elig = engine.evaluate(str(application.id), application.program)
        Application.objects.filter(id=application.id).update(
            eligibility_status=elig.status,
            eligibility_score=elig.score,
            eligibility_notes=str(elig.missing_requirements) if elig.missing_requirements else "",
        )
    except Exception:
        logger.warning("Eligibility evaluation failed for application %s", application.id, exc_info=True)

    # Deactivate associated drafts on successful submission (Req 7.7)
    from apps.applications.models import ApplicationDraft

    ApplicationDraft.objects.filter(
        user_id=changed_by, application_id=application.id
    ).update(is_active=False)

    return locked_app, old_status
