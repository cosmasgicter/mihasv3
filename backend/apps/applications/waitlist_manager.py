"""Waitlist position tracking and auto-promotion.

Manages waitlist ordering per program+intake and handles automatic
promotion when spots open up (withdrawal, rejection, enrollment expiry).

Requirements: 3.1–3.6, 3.8
"""

import logging

from django.db import transaction

from apps.applications.models import Application, ApplicationStatusHistory
from apps.applications.services import transition_application_status

logger = logging.getLogger(__name__)


class WaitlistError(Exception):
    """Raised when a waitlist operation fails."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class WaitlistManager:
    """Orchestrates waitlist position assignment, promotion, and reindexing."""

    @staticmethod
    def assign_position(application: Application, program: str, intake: str) -> int:
        """Assign a waitlist position to a newly waitlisted application.

        Position = count of existing waitlisted apps for the same
        program+intake + 1.  Saves the position to the application's
        ``waitlist_position`` column.

        Args:
            application: The Application being waitlisted.
            program: Program name string.
            intake: Intake name string.

        Returns:
            The assigned position (1-based).

        Requirement: 3.1
        """
        with transaction.atomic():
            # Lock all waitlisted rows for this program+intake to prevent
            # concurrent assignments from reading the same count.
            existing_count = (
                Application.objects.select_for_update()
                .filter(program=program, intake=intake, status="waitlisted")
                .exclude(id=application.id)
                .count()
            )

            position = existing_count + 1
            Application.objects.filter(id=application.id).update(waitlist_position=position)
            application.waitlist_position = position

        logger.info(
            "Assigned waitlist position %d to app=%s program=%s intake=%s",
            position,
            application.id,
            program,
            intake,
        )
        return position

    @staticmethod
    def promote_next(program: str, intake: str) -> Application | None:
        """Promote the next waitlisted application for a program+intake.

        Finds the waitlisted application with the lowest
        ``waitlist_position``, transitions it to ``approved`` via
        ``transition_application_status()`` with ``changed_by='system'``,
        sends a notification, and reindexes remaining positions.

        Args:
            program: Program name string.
            intake: Intake name string.

        Returns:
            The promoted Application, or None if no waitlisted apps exist.

        Requirements: 3.3, 3.4, 3.5, 3.6
        """
        with transaction.atomic():
            next_app = (
                Application.objects.select_for_update()
                .filter(
                    program=program,
                    intake=intake,
                    status="waitlisted",
                )
                .order_by("waitlist_position", "created_at")
                .first()
            )

            if next_app is None:
                logger.info(
                    "No waitlisted apps to promote for program=%s intake=%s",
                    program,
                    intake,
                )
                return None

            # Transition to approved (Req 3.4)
            transition_application_status(
                application=next_app,
                new_status="approved",
                changed_by="system",
                notes="Auto-promoted from waitlist — spot opened.",
            )

            # Clear waitlist position on promoted app
            next_app.waitlist_position = None
            next_app.save(update_fields=["waitlist_position"])

        # Reindex remaining positions (Req 3.6)
        WaitlistManager.reindex_positions(program, intake)

        # Send notification (Req 3.5)
        _send_promotion_notification(next_app)

        logger.info(
            "Promoted app=%s from waitlist for program=%s intake=%s",
            next_app.id,
            program,
            intake,
        )
        return next_app

    @staticmethod
    def reindex_positions(program: str, intake: str) -> None:
        """Reorder all waitlisted apps for a program+intake by created_at.

        Assigns sequential positions starting from 1.

        Args:
            program: Program name string.
            intake: Intake name string.

        Requirement: 3.6
        """
        with transaction.atomic():
            waitlisted = list(
                Application.objects.select_for_update()
                .filter(
                    program=program,
                    intake=intake,
                    status="waitlisted",
                )
                .order_by("created_at")
            )

            for idx, app in enumerate(waitlisted, start=1):
                if app.waitlist_position != idx:
                    app.waitlist_position = idx
                    app.save(update_fields=["waitlist_position"])

        logger.info(
            "Reindexed waitlist positions for program=%s intake=%s (%d apps)",
            program,
            intake,
            len(waitlisted),
        )

    @staticmethod
    def get_position(application_id: str) -> dict:
        """Return the current waitlist position and total for an application.

        Args:
            application_id: UUID of the application.

        Returns:
            Dict with ``position`` and ``total`` keys.

        Raises:
            WaitlistError: If the application is not waitlisted.
            Application.DoesNotExist: If application not found.

        Requirement: 3.9
        """
        application = Application.objects.get(id=application_id)

        if application.status != "waitlisted":
            raise WaitlistError(
                "NOT_WAITLISTED",
                f"Application is not waitlisted (current status: {application.status}).",
            )

        total = Application.objects.filter(
            program=application.program,
            intake=application.intake,
            status="waitlisted",
        ).count()

        position = application.waitlist_position or total

        return {"position": position, "total": total}

    @staticmethod
    def log_override(application: Application, changed_by: str) -> None:
        """Log a WAITLIST_ORDER_OVERRIDE when admin bypasses position order.

        Called when an admin manually approves a waitlisted application
        that is not at position 1.

        Args:
            application: The waitlisted Application being manually approved.
            changed_by: Admin user ID.

        Requirement: 3.8
        """
        ApplicationStatusHistory.objects.create(
            application=application,
            status="approved",
            old_status="waitlisted",
            new_status="approved",
            changed_by_id=changed_by,
            notes=(
                f"WAITLIST_ORDER_OVERRIDE: Admin manually approved "
                f"waitlisted application at position {application.waitlist_position}."
            ),
        )
        logger.info(
            "WAITLIST_ORDER_OVERRIDE: app=%s position=%s approved by=%s",
            application.id,
            application.waitlist_position,
            changed_by,
        )


def _send_promotion_notification(application: Application) -> None:
    """Create a Notification and dispatch an email for waitlist promotion."""
    try:
        from apps.common.outbox import create_notification, queue_email

        create_notification(
            user_id=application.user_id,
            title="You Have Been Accepted!",
            message=(
                f"Great news! A spot has opened up and your application "
                f"{application.application_number} for {application.program} "
                f"({application.intake}) has been approved. "
                f"Please log in to confirm your enrollment."
            ),
            type="success",
            priority="high",
            action_url=f"/student/application/{application.id}",
        )

        email_body = (
            f"<p>Dear {application.full_name},</p>"
            f"<p>A spot has opened up and your application "
            f"<strong>{application.application_number}</strong> for "
            f"<strong>{application.program}</strong> ({application.intake}) "
            f"has been <strong>approved</strong>!</p>"
            f"<p>Please log in to confirm your enrollment.</p>"
            f"<p>Best regards,<br>MIHAS Admissions</p>"
        )

        queue_email(
            recipient_email=application.email,
            subject=f"Great News — You Have Been Accepted! ({application.program})",
            body=email_body,
        )
    except Exception:
        logger.exception(
            "Failed to send promotion notification for application %s",
            application.id,
        )
