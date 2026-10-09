"""Waitlist position tracking and auto-promotion.

Manages waitlist ordering per Intake_Offering and handles automatic promotion
when spots open up (withdrawal, rejection, enrollment expiry).

Admissions-v2 task 5.3 (R7.6, R7.7, R10.6; findings DATA-02, DATA-03) rebuilds
this around the **canonical Intake_Offering identity** — the
``(program_offering_id, intake_ref_id)`` pair the application carries (task 5.2
snapshot) — instead of the ``program``/``intake`` display strings. Keying on
canonical IDs means two tenants offering the same-name canonical program on the
same intake never share a waitlist queue (DATA-02). Legacy pre-5.2 rows without
canonical IDs keep the string-keyed behaviour so nothing regresses.

Requirements: 3.1–3.6, 3.8 (legacy) · R7.6, R7.7, R10.6 (canonical rebuild)
"""

import logging

from django.db import transaction

from apps.applications.models import Application, ApplicationStatusHistory
from apps.applications.services import SYSTEM_ACTOR_ID, transition_application_status

logger = logging.getLogger(__name__)


class WaitlistError(Exception):
    """Raised when a waitlist operation fails."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _scoped_waitlist_queryset(
    program: str,
    intake: str,
    *,
    offering_id: str | None = None,
    intake_id: str | None = None,
):
    """Return the waitlisted-application queryset for one Intake_Offering.

    When canonical ``offering_id`` + ``intake_id`` are supplied the queryset is
    keyed on ``program_offering_id`` + ``intake_ref_id`` (tenant-isolated,
    DATA-02). Otherwise it falls back to the legacy ``program``/``intake``
    display-string filter for pre-5.2 rows.
    """
    if offering_id and intake_id:
        return Application.objects.filter(
            program_offering_id=offering_id,
            intake_ref_id=intake_id,
            status="waitlisted",
        )
    return Application.objects.filter(program=program, intake=intake, status="waitlisted")


def _canonical_ids(application: Application) -> tuple[str | None, str | None]:
    """Best-effort canonical ``(offering_id, intake_id)`` for an application."""
    from apps.applications.capacity_service import CapacityService

    return CapacityService.offering_ids(application)


class WaitlistManager:
    """Orchestrates waitlist position assignment, promotion, and reindexing."""

    @staticmethod
    def assign_position(application: Application, program: str, intake: str) -> int:
        """Assign a waitlist position to a newly waitlisted application.

        Position = count of existing waitlisted apps for the same
        Intake_Offering + 1. Scopes on the canonical offering + intake identity
        when the application carries it (DATA-02), otherwise on the legacy
        program/intake strings. Saves the position to ``waitlist_position``.

        Requirement: 3.1 · R7.6
        """
        offering_id, intake_id = _canonical_ids(application)

        with transaction.atomic():
            # Lock the peer waitlisted rows for this Intake_Offering so
            # concurrent assignments cannot read the same count.
            existing_count = (
                _scoped_waitlist_queryset(
                    program, intake, offering_id=offering_id, intake_id=intake_id
                )
                .select_for_update()
                .exclude(id=application.id)
                .count()
            )

            position = existing_count + 1
            Application.objects.filter(id=application.id).update(waitlist_position=position)
            application.waitlist_position = position

        logger.info(
            "Assigned waitlist position %d to app=%s offering=%s intake=%s",
            position,
            application.id,
            offering_id or program,
            intake_id or intake,
        )
        return position

    @staticmethod
    def promote_next(
        program: str,
        intake: str,
        *,
        offering_id: str | None = None,
        intake_id: str | None = None,
    ) -> Application | None:
        """Promote the next waitlisted application for one Intake_Offering.

        Finds the waitlisted application with the lowest ``waitlist_position``
        for the canonical offering + intake identity (or the legacy
        program/intake strings when canonical IDs are absent), transitions it to
        ``approved`` via ``transition_application_status()`` with
        ``changed_by=SYSTEM_ACTOR_ID`` (forward-only, idempotent — a
        non-``waitlisted`` row is skipped by the state machine), sends a
        notification, and reindexes remaining positions.

        Lock order: the peer waitlisted rows are locked with
        ``select_for_update``; the transition then locks the chosen application
        row. Returns the promoted Application, or ``None`` when the queue is
        empty.

        Requirements: 3.3, 3.4, 3.5, 3.6 · R7.6, R7.7
        """
        with transaction.atomic():
            next_app = (
                _scoped_waitlist_queryset(
                    program, intake, offering_id=offering_id, intake_id=intake_id
                )
                .select_for_update()
                .order_by("waitlist_position", "created_at")
                .first()
            )

            if next_app is None:
                logger.info(
                    "No waitlisted apps to promote for offering=%s intake=%s",
                    offering_id or program,
                    intake_id or intake,
                )
                return None

            # Transition to approved (Req 3.4). Forward-only guard in the state
            # machine keeps this idempotent under concurrent promotion.
            transition_application_status(
                application=next_app,
                new_status="approved",
                changed_by=SYSTEM_ACTOR_ID,
                notes="Auto-promoted from waitlist — spot opened.",
            )

            # Clear waitlist position on promoted app
            next_app.waitlist_position = None
            next_app.save(update_fields=["waitlist_position"])

        # Reindex remaining positions (Req 3.6)
        WaitlistManager.reindex_positions(
            program, intake, offering_id=offering_id, intake_id=intake_id
        )

        # Send notification (Req 3.5)
        _send_promotion_notification(next_app)

        logger.info(
            "Promoted app=%s from waitlist for offering=%s intake=%s",
            next_app.id,
            offering_id or program,
            intake_id or intake,
        )
        return next_app

    @staticmethod
    def promote_next_for_application(application: Application) -> Application | None:
        """Promote the next waitlisted peer of *application*'s Intake_Offering.

        Convenience wrapper used by withdrawal / enrollment-expiry callers that
        hold the departing application: it derives the canonical offering +
        intake identity (falling back to the display strings for legacy rows) so
        the promotion queue is scoped correctly (DATA-02).
        """
        offering_id, intake_id = _canonical_ids(application)
        return WaitlistManager.promote_next(
            application.program,
            application.intake,
            offering_id=offering_id,
            intake_id=intake_id,
        )

    @staticmethod
    def reindex_positions(
        program: str,
        intake: str,
        *,
        offering_id: str | None = None,
        intake_id: str | None = None,
    ) -> None:
        """Reorder all waitlisted apps for one Intake_Offering by ``created_at``.

        Assigns sequential positions starting from 1, scoped on the canonical
        offering + intake identity when available (DATA-02).

        Requirement: 3.6 · R7.6
        """
        with transaction.atomic():
            waitlisted = list(
                _scoped_waitlist_queryset(
                    program, intake, offering_id=offering_id, intake_id=intake_id
                )
                .select_for_update()
                .order_by("created_at")
            )

            for idx, app in enumerate(waitlisted, start=1):
                if app.waitlist_position != idx:
                    app.waitlist_position = idx
                    app.save(update_fields=["waitlist_position"])

        logger.info(
            "Reindexed waitlist positions for offering=%s intake=%s (%d apps)",
            offering_id or program,
            intake_id or intake,
            len(waitlisted),
        )

    @staticmethod
    def get_position(application_id: str) -> dict:
        """Return the current waitlist position and total for an application.

        Scopes the "total" on the canonical Intake_Offering identity when the
        application carries it (DATA-02), otherwise on the legacy strings.

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

        offering_id, intake_id = _canonical_ids(application)
        total = _scoped_waitlist_queryset(
            application.program,
            application.intake,
            offering_id=offering_id,
            intake_id=intake_id,
        ).count()

        position = application.waitlist_position or total

        return {"position": position, "total": total}

    @staticmethod
    def log_override(application: Application, changed_by: str) -> None:
        """Log a WAITLIST_ORDER_OVERRIDE when admin bypasses position order.

        Called when an admin manually approves a waitlisted application
        that is not at position 1.

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
            f"<p>Best regards,<br>Beanola Admissions</p>"
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
