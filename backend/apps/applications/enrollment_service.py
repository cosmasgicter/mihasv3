"""Enrollment confirmation service.

Handles student enrollment confirmation after approval and computes
enrollment deadlines from academic calendar events.

Requirements: 10.1, 10.4, 10.5
"""

import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.applications.models import Application, ApplicationCondition
from apps.applications.services import transition_application_status

logger = logging.getLogger(__name__)

# Default enrollment-confirmation deadline when no academic-calendar event
# is configured: approval date + this many days.
DEFAULT_ENROLLMENT_DEADLINE_DAYS = 14


class EnrollmentError(Exception):
    """Raised when an enrollment operation fails validation."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class EnrollmentService:
    """Orchestrates enrollment confirmation and deadline computation."""

    @staticmethod
    def confirm_enrollment(application_id: str, user_id: str) -> Application:
        """Confirm enrollment for an approved application.

        Validates that the application is in ``approved`` or
        ``conditionally_approved`` (with all conditions met) status,
        then transitions to ``enrolled``.

        Args:
            application_id: UUID of the application.
            user_id: UUID of the student confirming enrollment.

        Returns:
            The updated Application instance.

        Raises:
            EnrollmentError: If validation fails.
            Application.DoesNotExist: If application not found.
        """
        application = Application.objects.get(id=application_id)

        # Validate status
        if application.status == "conditionally_approved":
            # Check all conditions are met or waived
            pending = ApplicationCondition.objects.filter(
                application_id=application_id,
                status="pending",
            ).exists()
            expired = ApplicationCondition.objects.filter(
                application_id=application_id,
                status="expired",
            ).exists()
            if pending or expired:
                raise EnrollmentError(
                    "CONDITIONS_NOT_MET",
                    "All conditions must be met or waived before enrollment confirmation.",
                )
        elif application.status != "approved":
            raise EnrollmentError(
                "INVALID_STATUS_FOR_ENROLLMENT",
                f"Cannot confirm enrollment from status '{application.status}'. "
                "Only approved or conditionally_approved (with all conditions met) applications can enroll.",
            )

        if application.enrollment_confirmation_deadline and timezone.now() > application.enrollment_confirmation_deadline:
            raise EnrollmentError('DEADLINE_PASSED', 'Enrollment confirmation deadline has passed.')

        with transaction.atomic():
            locked_app = Application.objects.select_for_update().get(id=application_id)

            # Re-validate under lock
            if locked_app.status not in ("approved", "conditionally_approved"):
                raise EnrollmentError(
                    "INVALID_STATUS_FOR_ENROLLMENT",
                    f"Cannot confirm enrollment from status '{locked_app.status}'.",
                )

            # Re-check deadline under lock (concurrent extension could have changed it)
            if locked_app.enrollment_confirmation_deadline and timezone.now() > locked_app.enrollment_confirmation_deadline:
                raise EnrollmentError('DEADLINE_PASSED', 'Enrollment confirmation deadline has passed.')

            transition_application_status(
                application=locked_app,
                new_status="enrolled",
                changed_by=user_id,
                notes="Student confirmed enrollment.",
            )

        # Send notification
        _send_enrollment_notification(locked_app)

        return locked_app

    @staticmethod
    def compute_deadline(application: Application):
        """Compute the enrollment confirmation deadline for an application.

        Looks up ``academic_calendar_events`` for the intake with
        ``event_type='enrollment_confirmation_deadline'``. Falls back to
        approval_date + 14 days if no calendar event is configured.

        Args:
            application: The Application instance.

        Returns:
            A datetime representing the enrollment confirmation deadline.
        """
        from apps.catalog.models import AcademicCalendarEvent, Intake

        intake = Intake.objects.filter(name=application.intake, is_active=True).first()
        if intake:
            event = AcademicCalendarEvent.objects.filter(
                intake=intake,
                event_type="enrollment_confirmation_deadline",
            ).first()
            if event:
                from datetime import datetime, time
                naive = datetime.combine(event.event_date, time(23, 59, 59))
                return timezone.make_aware(naive)

        # Fallback: approval_date + default deadline window
        approval_date = application.decision_date or timezone.now()
        return approval_date + timedelta(days=DEFAULT_ENROLLMENT_DEADLINE_DAYS)


def _send_enrollment_notification(application: Application) -> None:
    """Create a Notification and dispatch email for enrollment confirmation."""
    try:
        from apps.common.communication_service import CommunicationService

        CommunicationService.send("enrollment_confirmed", application)
    except Exception:
        logger.exception(
            "Failed to send enrollment notification for application %s",
            application.id,
        )
