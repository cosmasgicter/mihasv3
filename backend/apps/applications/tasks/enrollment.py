"""Enrollment confirmation expiry and reminder task."""

import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from ._locks import acquire_task_lock, release_task_lock

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0, soft_time_limit=300, time_limit=360)
def enrollment_confirmation_expiry_task(self):
    """Expire approved applications past their enrollment confirmation deadline.

    Runs daily at 09:00 UTC. Finds approved/conditionally_approved applications
    past their enrollment_confirmation_deadline, transitions to enrollment_expired,
    decrements enrollment, and triggers waitlist promotion.

    Also sends reminders 3 days before deadline.

    Requirements: 10.6-10.8, 10.10
    """
    if not acquire_task_lock("enrollment_confirmation_expiry_task"):
        logger.info("enrollment_confirmation_expiry_task: skipped (already running)")
        return
    try:
        from apps.applications.enrollment_service import EnrollmentService
        from apps.applications.intake_enforcer import IntakeEnforcer
        from apps.applications.models import Application
        from apps.applications.services import (
            SYSTEM_ACTOR_ID,
            transition_application_status,
        )
        from apps.applications.waitlist_manager import WaitlistManager

        logger.info("enrollment_confirmation_expiry_task: starting")
        now = timezone.now()
        expired_count = 0
        reminder_count = 0

        expired_apps = list(Application.objects.filter(
            status__in=["approved", "conditionally_approved"],
            enrollment_confirmation_deadline__isnull=False,
            enrollment_confirmation_deadline__lt=now,
        )[:200])

        for app in expired_apps:
            try:
                transition_application_status(
                    application=app,
                    new_status="enrollment_expired",
                    changed_by=SYSTEM_ACTOR_ID,
                    notes="Enrollment confirmation deadline passed.",
                )
                IntakeEnforcer.decrement_enrollment(app.intake, app.program)

                try:
                    from apps.common.communication_service import CommunicationService
                    CommunicationService.send("enrollment_expired", app)
                except Exception:
                    logger.exception("Failed to send enrollment expiry notification for app=%s", app.id)

                try:
                    WaitlistManager.promote_next(app.program, app.intake)
                except Exception:
                    logger.exception("Failed to trigger waitlist promotion after enrollment expiry for app=%s", app.id)

                expired_count += 1
            except Exception:
                logger.exception("Failed to expire enrollment for app=%s", app.id)

        reminder_threshold = now + timedelta(days=3)
        reminder_apps = list(Application.objects.filter(
            status__in=["approved", "conditionally_approved"],
            enrollment_confirmation_deadline__isnull=False,
            enrollment_confirmation_deadline__gt=now,
            enrollment_confirmation_deadline__lte=reminder_threshold,
        )[:200])

        for app in reminder_apps:
            try:
                from apps.common.models import Notification

                recent_reminder = Notification.objects.filter(
                    user_id=app.user_id,
                    title__icontains="Confirm Your Enrollment",
                    created_at__gte=now - timedelta(hours=24),
                ).exists()

                if not recent_reminder:
                    from apps.common.communication_service import CommunicationService

                    days_left = (app.enrollment_confirmation_deadline - now).days
                    CommunicationService.send(
                        "enrollment_confirmation_reminder",
                        app,
                        {"deadline_date": str(app.enrollment_confirmation_deadline.date()), "days_until_expiry": str(days_left)},
                    )
                    reminder_count += 1
            except Exception:
                logger.exception("Failed to send enrollment reminder for app=%s", app.id)

        if expired_count or reminder_count:
            logger.info(
                "enrollment_confirmation_expiry_task: expired %d, reminders %d",
                expired_count, reminder_count,
            )
        return {"expired": expired_count, "reminders": reminder_count}
    finally:
        release_task_lock("enrollment_confirmation_expiry_task")
