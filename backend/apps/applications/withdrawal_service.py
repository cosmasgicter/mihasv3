"""Application withdrawal service.

Handles student-initiated withdrawal from any of the five withdrawable
statuses: submitted, under_review, waitlisted, conditionally_approved,
approved.

Requirements: 1.1-1.8
"""

import hashlib
import logging

from django.db import transaction

from apps.applications.intake_enforcer import IntakeEnforcer
from apps.applications.models import Application
from apps.applications.services import transition_application_status

logger = logging.getLogger(__name__)

# Statuses from which withdrawal is allowed (Req 1.1).
WITHDRAWABLE_STATUSES = {"submitted", "under_review", "waitlisted", "conditionally_approved", "approved"}

# Reason length constraints (Req 1.3).
MIN_REASON_LENGTH = 10
MAX_REASON_LENGTH = 500


class WithdrawalError(Exception):
    """Raised when a withdrawal attempt fails validation."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class WithdrawalService:
    """Orchestrates application withdrawal with all side-effects."""

    @staticmethod
    def withdraw(
        application_id: str,
        user_id: str,
        reason: str,
        ip_address: str = "",
        user_agent: str = "",
    ) -> Application:
        """Withdraw an application.

        Steps:
        1. Validate current status is withdrawable (Req 1.1)
        2. Validate reason length (Req 1.3)
        3. Transition to ``withdrawn`` via state machine (Req 1.2, 1.7)
        4. Atomically decrement enrollment (Req 1.4)
        5. Record in ApplicationStatusHistory with hashed IP (Req 1.5)
        6. Create Notification + dispatch email (Req 1.6)
        7. Trigger waitlist promotion (Req 1.8)

        Args:
            application_id: UUID of the application to withdraw.
            user_id: UUID of the student performing the withdrawal.
            reason: Free-text withdrawal reason (10–500 chars).
            ip_address: Raw client IP (will be hashed for storage).
            user_agent: Raw user-agent string.

        Returns:
            The updated Application instance.

        Raises:
            WithdrawalError: If validation fails.
            Application.DoesNotExist: If application not found.
        """
        application = Application.objects.get(id=application_id)

        # --- 1. Status validation (Req 1.1) ---
        if application.status not in WITHDRAWABLE_STATUSES:
            raise WithdrawalError(
                "INVALID_STATUS_FOR_WITHDRAWAL",
                f"Cannot withdraw from status '{application.status}'. "
                f"Withdrawal is only allowed from: {', '.join(sorted(WITHDRAWABLE_STATUSES))}.",
            )

        # --- 2. Reason validation (Req 1.3) ---
        reason = (reason or "").strip()
        if len(reason) < MIN_REASON_LENGTH:
            raise WithdrawalError(
                "REASON_TOO_SHORT",
                f"Withdrawal reason must be at least {MIN_REASON_LENGTH} characters.",
            )
        if len(reason) > MAX_REASON_LENGTH:
            raise WithdrawalError(
                "REASON_TOO_LONG",
                f"Withdrawal reason must not exceed {MAX_REASON_LENGTH} characters.",
            )

        # Hash IP for audit trail (Req 1.5)
        ip_hash = hashlib.sha256(ip_address.encode("utf-8")).hexdigest() if ip_address else ""

        with transaction.atomic():
            # Re-fetch with lock to prevent race conditions
            locked_app = Application.objects.select_for_update().get(id=application_id)

            # Re-validate status under lock
            if locked_app.status not in WITHDRAWABLE_STATUSES:
                raise WithdrawalError(
                    "INVALID_STATUS_FOR_WITHDRAWAL",
                    f"Cannot withdraw from status '{locked_app.status}'.",
                )

            # --- 3. Transition to withdrawn (Req 1.2, 1.7) ---
            # transition_application_status also creates the
            # ApplicationStatusHistory record (Req 1.5).
            transition_application_status(
                application=locked_app,
                new_status="withdrawn",
                changed_by=user_id,
                notes=f"Student withdrawal: {reason}",
                ip_address=ip_hash,
                user_agent=user_agent,
            )

            # --- 4. Decrement enrollment (Req 1.4) ---
            IntakeEnforcer.decrement_enrollment(
                locked_app.intake, locked_app.program
            )

        # --- 6. Notification + email (Req 1.6) ---
        _send_withdrawal_notification(locked_app, reason)

        # --- 7. Trigger waitlist promotion (Req 1.8) ---
        _trigger_waitlist_promotion(locked_app)

        return locked_app


def _send_withdrawal_notification(application: Application, reason: str) -> None:
    """Create a Notification and dispatch a confirmation email."""
    try:
        from apps.common.outbox import create_notification, queue_email

        create_notification(
            user_id=application.user_id,
            title="Application Withdrawn",
            message=(
                f"Your application {application.application_number} for "
                f"{application.program} ({application.intake}) has been "
                f"withdrawn as requested."
            ),
            type="info",
            priority="normal",
            action_url=f"/student/application/{application.id}",
        )

        email_body = (
            f"<p>Dear {application.full_name},</p>"
            f"<p>Your application <strong>{application.application_number}</strong> "
            f"for {application.program} ({application.intake}) has been "
            f"withdrawn as requested.</p>"
            f"<p>You may submit a new application at any time.</p>"
            f"<p>Best regards,<br>Beanola Admissions</p>"
        )

        queue_email(
            recipient_email=application.email,
            subject="Application Withdrawal Confirmed",
            body=email_body,
        )
    except Exception:
        logger.exception(
            "Failed to send withdrawal notification for application %s",
            application.id,
        )


def _trigger_waitlist_promotion(application: Application) -> None:
    """Trigger waitlist auto-promotion after a withdrawal frees a spot.

    Calls WaitlistManager.promote_next() to promote the next waitlisted
    application for the same program+intake (Req 3.7).
    """
    try:
        from apps.applications.waitlist_manager import WaitlistManager

        promoted = WaitlistManager.promote_next(application.program, application.intake)
        if promoted:
            logger.info(
                "Waitlist promotion after withdrawal: promoted app=%s for program=%s intake=%s",
                promoted.id,
                application.program,
                application.intake,
            )
        else:
            logger.info(
                "No waitlisted apps to promote after withdrawal: program=%s intake=%s",
                application.program,
                application.intake,
            )
    except Exception:
        logger.exception(
            "Failed to trigger waitlist promotion after withdrawal for app=%s",
            application.id,
        )
