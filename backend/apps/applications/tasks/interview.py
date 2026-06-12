"""Interview auto-complete and reminder tasks."""

import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from ._locks import acquire_task_lock, release_task_lock

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0, soft_time_limit=120, time_limit=150)
def interview_auto_complete_task(self):
    """Auto-complete interviews whose scheduled_at is in the past.

    Runs every 2 hours. Finds interviews with status 'scheduled' and
    scheduled_at in the past, transitions them to 'completed'.
    Bounded to 500 per run.
    Requirement: 2.8
    """
    if not acquire_task_lock("interview_auto_complete_task"):
        logger.info("interview_auto_complete_task: skipped (already running)")
        return
    try:
        from apps.applications.models import ApplicationInterview

        logger.info("interview_auto_complete_task: starting")
        now = timezone.now()
        ids = list(
            ApplicationInterview.objects.filter(
                status="scheduled",
                scheduled_at__lt=now,
            ).values_list("id", flat=True)[:500]
        )

        count = 0
        if ids:
            count = ApplicationInterview.objects.filter(id__in=ids).update(
                status="completed",
                updated_at=now,
            )

        logger.info(
            "interview_auto_complete_task: transitioned %d past interviews to completed",
            count,
        )
        return {"completed": count}
    finally:
        release_task_lock("interview_auto_complete_task")


@shared_task(bind=True, max_retries=0, soft_time_limit=300, time_limit=360)
def interview_reminder_task(self):
    """Send reminder notifications for upcoming interviews.

    Runs every hour. Finds interviews scheduled within the next 24 hours
    with status 'scheduled', sends a reminder notification to the student.
    Deduplicated: skips if a reminder notification for this interview was
    already created in the last 24 hours.
    Requirement: 2.12
    """
    if not acquire_task_lock("interview_reminder_task"):
        logger.info("interview_reminder_task: skipped (already running)")
        return
    try:
        from apps.applications.models import ApplicationInterview
        from apps.common.models import Notification
        from apps.common.outbox import create_notification, queue_email

        logger.info("interview_reminder_task: starting")
        now = timezone.now()
        window_end = now + timedelta(hours=24)
        dedup_cutoff = now - timedelta(hours=24)

        upcoming = ApplicationInterview.objects.filter(
            status="scheduled",
            scheduled_at__gt=now,
            scheduled_at__lte=window_end,
        ).select_related("application")

        sent = 0
        for interview in upcoming:
            dedup_key = f"interview_reminder_{interview.id}"
            already_sent = Notification.objects.filter(
                idempotency_key=dedup_key,
                created_at__gte=dedup_cutoff,
            ).exists()
            if already_sent:
                continue

            application = interview.application
            mode_display = interview.mode.replace("_", " ").title()
            scheduled_display = interview.scheduled_at.strftime("%B %d, %Y at %I:%M %p")

            title = "Interview Reminder"
            message = (
                f"Reminder: Your interview for {application.program} is "
                f"scheduled for {scheduled_display}. Mode: {mode_display}."
            )

            try:
                create_notification(
                    user_id=application.user_id,
                    title=title,
                    message=message,
                    type="info",
                    priority="normal",
                    action_url=f"/student/application/{application.id}",
                    idempotency_key=dedup_key,
                )

                location_display = interview.location or "See notes"
                email_body = (
                    f"<p>Dear {application.full_name},</p>"
                    f"<p>{message}</p>"
                    f"<p><strong>Date:</strong> {scheduled_display}<br>"
                    f"<strong>Mode:</strong> {mode_display}<br>"
                    f"<strong>Location:</strong> {location_display}</p>"
                    f"<p>Best regards,<br>Beanola Admissions</p>"
                )

                queue_email(
                    recipient_email=application.email,
                    subject=f"Reminder: Interview Tomorrow — {application.program}",
                    body=email_body,
                )
                sent += 1
            except Exception:
                logger.exception(
                    "Failed to send interview reminder for interview %s",
                    interview.id,
                )

        if sent:
            logger.info(
                "interview_reminder_task: sent %d interview reminders", sent
            )
        return {"reminders_sent": sent}
    finally:
        release_task_lock("interview_reminder_task")
