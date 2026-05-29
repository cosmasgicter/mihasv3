"""Draft expiry reminder and cleanup task."""

import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from ._locks import acquire_task_lock, release_task_lock

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0, soft_time_limit=300, time_limit=360)
def draft_expiry_reminder_task(self):
    """Send reminders for stale drafts and expire drafts older than 30 days.

    Runs daily at 06:00 UTC.
    - Drafts with no updates in 7+ days: send reminder notification + email.
    - Drafts 27-30 days old: include urgency indicator ("Your draft will expire in X days").
    - Drafts 30+ days old: transition to 'expired' status and notify student.
    Requirements: 4.1-4.3, 4.9
    """
    if not acquire_task_lock("draft_expiry_reminder_task"):
        logger.info("draft_expiry_reminder_task: skipped (already running)")
        return
    try:
        from apps.applications.models import Application
        from apps.applications.services import (
            SYSTEM_ACTOR_ID,
            transition_application_status,
        )
        from apps.common.models import Notification
        from apps.common.outbox import create_notification, queue_email

        logger.info("draft_expiry_reminder_task: starting")

        now = timezone.now()
        seven_days_ago = now - timedelta(days=7)
        thirty_days_ago = now - timedelta(days=30)

        stale_drafts = list(Application.objects.filter(
            status="draft",
            updated_at__lt=seven_days_ago,
        )[:200])

        reminders_sent = 0
        expired_count = 0

        for app in stale_drafts:
            days_since_update = (now - app.updated_at).days

            if days_since_update >= 30:
                try:
                    transition_application_status(
                        application=app,
                        new_status="expired",
                        changed_by=SYSTEM_ACTOR_ID,
                        notes="Draft expired after 30 days of inactivity.",
                        ip_address="",
                        user_agent="celery/draft_expiry_reminder_task",
                    )

                    dedup_key = f"draft_expired_{app.id}"
                    create_notification(
                        user_id=app.user_id,
                        title="Application Draft Expired",
                        message=(
                            f"Your draft application for {app.program} ({app.intake}) "
                            f"has expired after 30 days of inactivity. "
                            f"You may start a new application at any time."
                        ),
                        type="warning",
                        priority="high",
                        action_url="/student/dashboard",
                        idempotency_key=dedup_key,
                    )

                    queue_email(
                        recipient_email=app.email,
                        subject="Application Draft Expired",
                        body=(
                            f"<p>Dear {app.full_name},</p>"
                            f"<p>Your draft application for <strong>{app.program}</strong> "
                            f"({app.intake}) has expired after 30 days of inactivity.</p>"
                            f"<p>You may start a new application at any time.</p>"
                            f"<p>Best regards,<br>MIHAS Admissions</p>"
                        ),
                    )
                    expired_count += 1
                except Exception:
                    logger.exception(
                        "Failed to expire draft application %s", app.id
                    )
            else:
                dedup_key = f"draft_reminder_{app.id}_{now.strftime('%Y-%m-%d')}"
                already_sent = Notification.objects.filter(
                    idempotency_key=dedup_key,
                ).exists()
                if already_sent:
                    continue

                days_until_expiry = 30 - days_since_update
                if days_until_expiry <= 3:
                    urgency_msg = (
                        f" Your draft will expire in {days_until_expiry} "
                        f"day{'s' if days_until_expiry != 1 else ''}."
                    )
                else:
                    urgency_msg = ""

                try:
                    message = (
                        f"Your draft application for {app.program} ({app.intake}) "
                        f"has not been updated in {days_since_update} days. "
                        f"Please log in to complete and submit your application.{urgency_msg}"
                    )

                    create_notification(
                        user_id=app.user_id,
                        title="Complete Your Application Draft",
                        message=message,
                        type="info",
                        priority="high" if days_until_expiry <= 3 else "normal",
                        action_url=f"/student/application/{app.id}",
                        idempotency_key=dedup_key,
                    )

                    email_subject = "Your Application Draft Will Expire Soon" if days_until_expiry <= 3 else "Reminder: Complete Your Application"
                    queue_email(
                        recipient_email=app.email,
                        subject=email_subject,
                        body=(
                            f"<p>Dear {app.full_name},</p>"
                            f"<p>{message}</p>"
                            f"<p>Best regards,<br>MIHAS Admissions</p>"
                        ),
                    )
                    reminders_sent += 1
                except Exception:
                    logger.exception(
                        "Failed to send draft reminder for application %s", app.id
                    )

        if reminders_sent or expired_count:
            logger.info(
                "draft_expiry_reminder_task: sent %d reminders, expired %d drafts",
                reminders_sent,
                expired_count,
            )
        return {"reminders_sent": reminders_sent, "expired": expired_count}
    finally:
        release_task_lock("draft_expiry_reminder_task")
