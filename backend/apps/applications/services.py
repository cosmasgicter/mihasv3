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

    def __init__(self, code: str, message: str, *, status_code: int = 400, next_action: dict | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.next_action = next_action


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


def _missing_assigned_required_documents(application) -> list[dict[str, str]]:
    """Return the assigned-config required documents missing from *application*.

    Implements the submission half of R15.6: the offering/canonical/default
    Required_Documents resolved by ``OfferingAssignmentService.required_documents``
    (the most-specific scope ordering) gate submission — a required document
    type with no uploaded, non-deleted/non-rejected ``ApplicationDocument`` row
    blocks submission "per the assigned configuration".

    Strictly additive (mirrors ``_revalidate_offering_assignment``):

    * Legacy / non-canonical rows — any application missing the canonical
      offering + program IDs (including ``MagicMock`` attributes in unit tests,
      filtered by ``_coerce_uuid``) — return ``[]`` and keep the existing
      hardcoded-identity-only behaviour.
    * Any unexpected infrastructure error (unreadable offering/canonical row,
      missing tenant table in a SQLite unit DB, ...) degrades to ``[]`` rather
      than blocking a legitimate submission.

    Returns the list of missing ``{"document_type", "label"}`` entries; an
    empty list means the assigned required-document gate is satisfied.
    """
    offering_id = _coerce_uuid(getattr(application, "program_offering_id", None))
    canonical_program_id = _coerce_uuid(getattr(application, "canonical_program_id", None))
    if not (offering_id and canonical_program_id):
        return []

    try:
        from apps.catalog.models import CanonicalProgram, Program
        from apps.catalog.services import OfferingAssignmentService

        offering = Program.objects.filter(id=offering_id).first()
        canonical = CanonicalProgram.objects.filter(id=canonical_program_id).first()
        if offering is None or canonical is None:
            return []

        required = OfferingAssignmentService.required_documents(offering, canonical)
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
    except Exception:
        logger.warning(
            "Assigned required-document gate degraded for app=%s",
            getattr(application, "id", None),
            exc_info=True,
        )
        return []


def submit_application(
    *,
    application: Application,
    changed_by: str,
    ip_address: str = "",
    user_agent: str = "",
    admin_force: bool = False,
) -> tuple[Application, str]:
    """Submit an application after enforcing payment/document/state checks.
    
    When admin_force=True, payment and identity document checks are bypassed.
    This allows admins to force-submit applications that haven't completed
    the normal student flow (e.g. offline payments, paper documents).
    """

    # Intake deadline and capacity enforcement (Req 6.1, 6.3)
    from apps.applications.intake_enforcer import IntakeEnforcer

    intake_check = IntakeEnforcer.check_submission(application.intake, application.program)
    if not intake_check.allowed:
        raise ApplicationSubmissionError(intake_check.code, intake_check.message)

    with transaction.atomic():
        if not admin_force:
            # Drift-guard anchor: payment_status in ("successful", "force_approved", "verified", "paid", "deferred")
            has_payment = (
                application.payment_status in RESOLVED_PAYMENT_STATUSES
                or _application_has_completed_payment(application.id)
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
                from apps.catalog.models import Program
                program_obj = Program.objects.filter(name=application.program, is_active=True).first()
                if program_obj:
                    late_fee = ProgramFee.objects.filter(
                        program=program_obj,
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

        locked_app = Application.objects.select_for_update().get(id=application.id)
        if locked_app.status != "draft":
            raise ApplicationSubmissionError(
                "ALREADY_SUBMITTED",
                "This application has already been submitted.",
            )

        # Re-check intake capacity inside the lock to close TOCTOU race
        intake_recheck = IntakeEnforcer.check_submission(locked_app.intake, locked_app.program)
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

        # Atomically increment intake enrollment (Req 6.5, AUDIT-1.6-002)
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
