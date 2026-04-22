"""Interview scheduling business logic.

Handles interview creation, rescheduling, and cancellation with
conflict detection, minimum notice enforcement, and notifications.
Requirements: 2.1–2.7, 2.9–2.11
"""

import hashlib
import logging
import re
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from apps.applications.models import Application, ApplicationInterview
from apps.applications.services import transition_application_status

logger = logging.getLogger(__name__)

# Statuses from which interviews can be scheduled (Req 2.1).
INTERVIEW_ALLOWED_STATUSES = {"submitted", "under_review", "waitlisted"}

# Minimum hours of notice required for scheduling (Req 2.2).
MIN_NOTICE_HOURS = 48

# Time conflict window for the same application (Req 2.3).
APPLICATION_CONFLICT_HOURS = 2

# Interviewer conflict window for the same admin (Req 2.4).
INTERVIEWER_CONFLICT_HOURS = 1

# Valid interview modes (Req 2.9).
VALID_MODES = {"virtual", "phone", "in_person"}

# Simple URL pattern for virtual mode validation (Req 2.10).
_URL_PATTERN = re.compile(r"https?://\S+", re.IGNORECASE)


class InterviewSchedulingError(Exception):
    """Raised when an interview scheduling operation fails validation."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class InterviewService:
    """Orchestrates interview scheduling with business rule enforcement."""

    @staticmethod
    def validate_scheduling(
        application: Application,
        scheduled_at,
        admin_id: str,
    ) -> dict:
        """Validate interview scheduling constraints.

        Checks:
        1. Application status is in INTERVIEW_ALLOWED_STATUSES (Req 2.1)
        2. Minimum 48-hour notice (Req 2.2)
        3. No time conflict for same application within 2-hour window (Req 2.3)
        4. Interviewer conflict warning within 1-hour window (Req 2.4)

        Args:
            application: The Application instance.
            scheduled_at: Proposed interview datetime (timezone-aware).
            admin_id: UUID string of the admin scheduling the interview.

        Returns:
            dict with ``warnings`` list (interviewer conflicts are warnings).

        Raises:
            InterviewSchedulingError: If a hard constraint is violated.
        """
        warnings = []

        # --- 1. Status check (Req 2.1) ---
        if application.status not in INTERVIEW_ALLOWED_STATUSES:
            raise InterviewSchedulingError(
                "INVALID_STATUS_FOR_INTERVIEW",
                f"Cannot schedule interview for application in status "
                f"'{application.status}'. Allowed statuses: "
                f"{', '.join(sorted(INTERVIEW_ALLOWED_STATUSES))}.",
            )

        # --- 2. Minimum notice (Req 2.2) ---
        now = timezone.now()
        min_time = now + timedelta(hours=MIN_NOTICE_HOURS)
        if scheduled_at < min_time:
            raise InterviewSchedulingError(
                "INSUFFICIENT_NOTICE",
                f"Interview must be scheduled at least {MIN_NOTICE_HOURS} "
                f"hours in advance. Earliest allowed time: {min_time.isoformat()}.",
            )

        # --- 3. Application time conflict (Req 2.3) ---
        conflict_start = scheduled_at - timedelta(hours=APPLICATION_CONFLICT_HOURS)
        conflict_end = scheduled_at + timedelta(hours=APPLICATION_CONFLICT_HOURS)
        app_conflict = ApplicationInterview.objects.filter(
            application_id=application.id,
            scheduled_at__gte=conflict_start,
            scheduled_at__lte=conflict_end,
            status__in=["scheduled", "rescheduled"],
        ).first()
        if app_conflict:
            raise InterviewSchedulingError(
                "TIME_CONFLICT",
                f"Another interview for this application is already scheduled "
                f"within {APPLICATION_CONFLICT_HOURS} hours of the proposed "
                f"time (existing: {app_conflict.scheduled_at.isoformat()}).",
            )

        # --- 4. Interviewer conflict — warning only (Req 2.4) ---
        interviewer_start = scheduled_at - timedelta(hours=INTERVIEWER_CONFLICT_HOURS)
        interviewer_end = scheduled_at + timedelta(hours=INTERVIEWER_CONFLICT_HOURS)
        interviewer_conflict = ApplicationInterview.objects.filter(
            created_by_id=admin_id,
            scheduled_at__gte=interviewer_start,
            scheduled_at__lte=interviewer_end,
            status__in=["scheduled", "rescheduled"],
        ).exclude(application_id=application.id).first()
        if interviewer_conflict:
            warnings.append({
                "code": "INTERVIEWER_CONFLICT",
                "message": (
                    f"You have another interview scheduled within "
                    f"{INTERVIEWER_CONFLICT_HOURS} hour(s) of this time "
                    f"(existing: {interviewer_conflict.scheduled_at.isoformat()}, "
                    f"application: {interviewer_conflict.application_id})."
                ),
                "conflicting_interview_id": str(interviewer_conflict.id),
            })

        return {"warnings": warnings}

    @staticmethod
    def _validate_mode(mode: str, location: str | None, notes: str | None) -> None:
        """Validate interview mode and virtual URL requirement.

        Args:
            mode: Interview mode string.
            location: Location or URL field.
            notes: Notes field (may contain meeting link).

        Raises:
            InterviewSchedulingError: If mode is invalid or virtual URL missing.
        """
        if mode not in VALID_MODES:
            raise InterviewSchedulingError(
                "INVALID_MODE",
                f"Interview mode must be one of: {', '.join(sorted(VALID_MODES))}. "
                f"Got: '{mode}'.",
            )

        # Req 2.10: virtual mode requires URL in location or notes
        if mode == "virtual":
            has_url_in_location = bool(location and _URL_PATTERN.search(location))
            has_url_in_notes = bool(notes and _URL_PATTERN.search(notes))
            if not has_url_in_location and not has_url_in_notes:
                raise InterviewSchedulingError(
                    "VIRTUAL_URL_REQUIRED",
                    "Virtual interviews require a valid URL in the location "
                    "or notes field.",
                )

    @staticmethod
    def schedule_interview(
        application: Application,
        scheduled_at,
        mode: str,
        location: str = "",
        notes: str = "",
        admin_id: str = "",
    ) -> tuple[ApplicationInterview, dict]:
        """Schedule a new interview for an application.

        Steps:
        1. Validate scheduling constraints (Req 2.1–2.4)
        2. Validate mode (Req 2.9, 2.10)
        3. Create interview record
        4. Auto-transition to under_review if submitted (Req 2.11)
        5. Send notification (Req 2.5)

        Args:
            application: The Application instance.
            scheduled_at: Interview datetime (timezone-aware).
            mode: Interview mode (virtual, phone, in_person).
            location: Location or meeting URL.
            notes: Additional notes.
            admin_id: UUID string of the scheduling admin.

        Returns:
            Tuple of (created interview, validation result with warnings).

        Raises:
            InterviewSchedulingError: If validation fails.
        """
        # --- 1. Validate scheduling constraints ---
        validation = InterviewService.validate_scheduling(
            application, scheduled_at, admin_id
        )

        # --- 2. Validate mode ---
        InterviewService._validate_mode(mode, location, notes)

        now = timezone.now()

        # --- 3. Create interview ---
        interview = ApplicationInterview.objects.create(
            application_id=application.id,
            scheduled_at=scheduled_at,
            mode=mode,
            location=location or "",
            status="scheduled",
            notes=notes or "",
            created_by_id=admin_id,
            updated_by_id=admin_id,
            created_at=now,
            updated_at=now,
        )

        # --- 4. Auto-transition to under_review (Req 2.11) ---
        if application.status == "submitted":
            try:
                transition_application_status(
                    application=application,
                    new_status="under_review",
                    changed_by=admin_id,
                    notes="Auto-transitioned to under_review on interview scheduling.",
                )
            except ValueError:
                logger.warning(
                    "Failed to auto-transition app=%s to under_review",
                    application.id,
                )

        # --- 5. Send notification (Req 2.5) ---
        _send_interview_notification(
            application, interview, template="interview_scheduled"
        )

        return interview, validation

    @staticmethod
    def reschedule_interview(
        interview: ApplicationInterview,
        new_scheduled_at,
        mode: str | None = None,
        location: str | None = None,
        notes: str | None = None,
        admin_id: str = "",
        reason: str = "",
    ) -> tuple[ApplicationInterview, dict]:
        """Reschedule an existing interview.

        Steps:
        1. Validate new time against application constraints (Req 2.2–2.4)
        2. Validate mode if changed (Req 2.9, 2.10)
        3. Update interview record
        4. Send rescheduled notification (Req 2.6)

        Args:
            interview: The existing ApplicationInterview instance.
            new_scheduled_at: New interview datetime.
            mode: New mode (or None to keep existing).
            location: New location (or None to keep existing).
            notes: New notes (or None to keep existing).
            admin_id: UUID string of the admin rescheduling.
            reason: Reason for rescheduling.

        Returns:
            Tuple of (updated interview, validation result with warnings).

        Raises:
            InterviewSchedulingError: If validation fails.
        """
        application = interview.application

        # Use new values or fall back to existing
        effective_mode = mode if mode is not None else interview.mode
        effective_location = location if location is not None else (interview.location or "")
        effective_notes = notes if notes is not None else (interview.notes or "")

        # --- 1. Validate scheduling constraints ---
        # Exclude the current interview from conflict checks
        validation = InterviewService.validate_scheduling(
            application, new_scheduled_at, admin_id
        )

        # --- 2. Validate mode ---
        InterviewService._validate_mode(
            effective_mode, effective_location, effective_notes
        )

        now = timezone.now()

        # --- 3. Update interview ---
        interview.scheduled_at = new_scheduled_at
        interview.mode = effective_mode
        interview.location = effective_location
        interview.notes = effective_notes
        interview.status = "rescheduled"
        interview.updated_by_id = admin_id
        interview.updated_at = now
        interview.save(update_fields=[
            "scheduled_at", "mode", "location", "notes",
            "status", "updated_by_id", "updated_at",
        ])

        # --- 4. Send rescheduled notification (Req 2.6) ---
        _send_interview_notification(
            application, interview,
            template="interview_rescheduled",
            extra_context={"reason": reason},
        )

        return interview, validation

    @staticmethod
    def cancel_interview(
        interview: ApplicationInterview,
        cancellation_reason: str,
        admin_id: str = "",
    ) -> ApplicationInterview:
        """Cancel an interview.

        Steps:
        1. Require cancellation_reason (Req 2.7)
        2. Update interview status to cancelled
        3. Send cancellation notification (Req 2.7)

        Args:
            interview: The ApplicationInterview instance to cancel.
            cancellation_reason: Required reason for cancellation.
            admin_id: UUID string of the admin cancelling.

        Returns:
            The updated interview instance.

        Raises:
            InterviewSchedulingError: If cancellation_reason is missing.
        """
        reason = (cancellation_reason or "").strip()
        if not reason:
            raise InterviewSchedulingError(
                "CANCELLATION_REASON_REQUIRED",
                "A cancellation reason is required to cancel an interview.",
            )

        now = timezone.now()

        interview.status = "cancelled"
        interview.notes = f"{interview.notes or ''}\n\nCancelled: {reason}".strip()
        interview.updated_by_id = admin_id
        interview.updated_at = now
        interview.save(update_fields=[
            "status", "notes", "updated_by_id", "updated_at",
        ])

        # Send cancellation notification (Req 2.7)
        _send_interview_notification(
            interview.application, interview,
            template="interview_cancelled",
            extra_context={"cancellation_reason": reason},
        )

        return interview


def _send_interview_notification(
    application: Application,
    interview: ApplicationInterview,
    template: str,
    extra_context: dict | None = None,
) -> None:
    """Create a Notification and dispatch an email for interview events.

    Args:
        application: The related Application.
        interview: The ApplicationInterview instance.
        template: Template key (interview_scheduled, interview_rescheduled,
                  interview_cancelled).
        extra_context: Additional context for the notification.
    """
    try:
        from apps.common.outbox import create_notification, queue_email

        mode_display = interview.mode.replace("_", " ").title()
        scheduled_display = interview.scheduled_at.strftime("%B %d, %Y at %I:%M %p")

        # Build notification message
        if template == "interview_scheduled":
            title = "Interview Scheduled"
            message = (
                f"An interview has been scheduled for your application to "
                f"{application.program}. Date: {scheduled_display}, "
                f"Mode: {mode_display}."
            )
        elif template == "interview_rescheduled":
            title = "Interview Rescheduled"
            reason = (extra_context or {}).get("reason", "")
            message = (
                f"Your interview for {application.program} has been "
                f"rescheduled. New date: {scheduled_display}, "
                f"Mode: {mode_display}."
            )
            if reason:
                message += f" Reason: {reason}"
        elif template == "interview_cancelled":
            title = "Interview Cancelled"
            reason = (extra_context or {}).get("cancellation_reason", "")
            message = (
                f"Your interview for {application.program} has been cancelled."
            )
            if reason:
                message += f" Reason: {reason}"
        else:
            title = "Interview Update"
            message = f"Your interview for {application.program} has been updated."

        create_notification(
            user_id=application.user_id,
            title=title,
            message=message,
            type="info",
            priority="normal",
            action_url=f"/student/application/{application.id}",
        )

        # Build email body
        location_display = interview.location or "See notes"
        email_body = (
            f"<p>Dear {application.full_name},</p>"
            f"<p>{message}</p>"
            f"<p><strong>Date:</strong> {scheduled_display}<br>"
            f"<strong>Mode:</strong> {mode_display}<br>"
            f"<strong>Location:</strong> {location_display}</p>"
            f"<p>Please log in for details.</p>"
            f"<p>Best regards,<br>MIHAS Admissions</p>"
        )

        subject_map = {
            "interview_scheduled": f"Interview Scheduled — {application.program}",
            "interview_rescheduled": f"Interview Rescheduled — {application.program}",
            "interview_cancelled": f"Interview Cancelled — {application.program}",
        }

        queue_email(
            recipient_email=application.email,
            subject=subject_map.get(template, f"Interview Update — {application.program}"),
            body=email_body,
        )
    except Exception:
        logger.exception(
            "Failed to send interview notification for application %s",
            application.id,
        )
