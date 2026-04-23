"""Application service helpers.

Shared business logic extracted from views to eliminate duplication.
"""

import logging

from django.db import transaction
from django.utils import timezone

from apps.applications.models import Application, ApplicationStatusHistory
from apps.documents.models import ApplicationDocument, Payment

logger = logging.getLogger(__name__)

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

# Fields updated by transition_application_status — kept as a module
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
    """Raised when a student-facing submission attempt fails validation."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


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

    if not application.review_started_at:
        application.review_started_at = timezone.now()

    if new_status not in ('submitted',):
        application.reviewed_by_id = changed_by

    if notes:
        application.admin_feedback = notes
        application.admin_feedback_date = timezone.now()
        application.admin_feedback_by_id = changed_by

    if new_status in ("approved", "rejected", "conditionally_approved", "withdrawn", "expired", "enrolled", "enrollment_expired"):
        application.decision_date = timezone.now()

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

    return old_status


def _application_has_completed_payment(application_id) -> bool:
    return Payment.objects.filter(application_id=application_id, status="successful").exists()


def _application_has_identity_document(application_id) -> bool:
    return ApplicationDocument.objects.filter(
        application_id=application_id,
        document_type__in=["nrc", "passport", "extra_kyc"],
    ).exists()


def submit_application(
    *,
    application: Application,
    changed_by: str,
    notes: str = "",
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
            has_payment = (
                application.payment_status in ("verified", "paid", "force_approved", "deferred")
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
        )
        if dup_result.has_duplicate:
            raise ApplicationSubmissionError(
                "DUPLICATE_SUBMITTED_APPLICATION",
                "Another application for this program and intake has already been submitted.",
            )

        old_status = transition_application_status(
            application=locked_app,
            new_status="submitted",
            changed_by=changed_by,
            notes=notes,
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
        pass

    # Advisory eligibility evaluation — non-blocking (Req 5.7)
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
