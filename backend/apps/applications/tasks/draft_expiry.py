"""Draft expiry reminder and cleanup task."""

import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from ._locks import acquire_task_lock, release_task_lock

logger = logging.getLogger(__name__)

# Bound the per-run work so a single sweep stays cheap and predictable
# (system-performance-hardening R6.4: process at most 50 records per run).
MAX_DRAFTS_PER_RUN = 50


@shared_task(bind=True, max_retries=0, soft_time_limit=300, time_limit=360)
def draft_expiry_reminder_task(self):
    """Send reminders for stale drafts and expire drafts older than 30 days.

    Runs daily at 06:00 UTC.
    - Drafts with no updates in 7+ days: send reminder notification + email.
    - Drafts 27-30 days old: include urgency indicator ("Your draft will expire in X days").
    - Drafts 30+ days old: transition to 'expired' status and notify student.

    Persistence is batched (system-performance-hardening R6.4): the 30-day
    expiry transitions are applied with a single bulk update + bulk history
    insert via ``transition_applications_bulk``, and every reminder/expiry
    notification and email is written with one bulk insert each. Reminder
    deduplication uses a single lookup instead of one ``exists()`` per draft.
    Requirements: 4.1-4.3, 4.9
    """
    if not acquire_task_lock("draft_expiry_reminder_task"):
        logger.info("draft_expiry_reminder_task: skipped (already running)")
        return
    try:
        from apps.applications.models import Application
        from apps.applications.services import (
            SYSTEM_ACTOR_ID,
            transition_applications_bulk,
        )
        from apps.common.models import Notification
        from apps.common.outbox import create_notifications_bulk, queue_emails_bulk

        logger.info("draft_expiry_reminder_task: starting")

        now = timezone.now()
        seven_days_ago = now - timedelta(days=7)

        stale_drafts = list(
            Application.objects.filter(
                status="draft",
                updated_at__lt=seven_days_ago,
            )[:MAX_DRAFTS_PER_RUN]
        )

        # Split the candidates into the 30-day expiry cohort and the reminder
        # cohort (mutually exclusive).
        expiring_drafts = []
        reminder_drafts = []
        for app in stale_drafts:
            if (now - app.updated_at).days >= 30:
                expiring_drafts.append(app)
            else:
                reminder_drafts.append(app)

        notification_specs = []
        email_specs = []

        # --- 30-day expiry cohort: one bulk transition + bulk notify/email ---
        expired_count = 0
        if expiring_drafts:
            transitioned = transition_applications_bulk(
                expiring_drafts,
                new_status="expired",
                changed_by=SYSTEM_ACTOR_ID,
                notes="Draft expired after 30 days of inactivity.",
                ip_address="",
                user_agent="celery/draft_expiry_reminder_task",
            )
            expired_count = len(transitioned)
            for app, _old in transitioned:
                notification_specs.append(
                    {
                        "user_id": app.user_id,
                        "title": "Application Draft Expired",
                        "message": (
                            f"Your draft application for {app.program} ({app.intake}) "
                            f"has expired after 30 days of inactivity. "
                            f"You may start a new application at any time."
                        ),
                        "type": "warning",
                        "priority": "high",
                        "action_url": "/student/dashboard",
                        "idempotency_key": f"draft_expired_{app.id}",
                    }
                )
                email_specs.append(
                    {
                        "recipient_email": app.email,
                        "subject": "Application Draft Expired",
                        "body": (
                            f"<p>Dear {app.full_name},</p>"
                            f"<p>Your draft application for <strong>{app.program}</strong> "
                            f"({app.intake}) has expired after 30 days of inactivity.</p>"
                            f"<p>You may start a new application at any time.</p>"
                            f"<p>Best regards,<br>Beanola Admissions</p>"
                        ),
                    }
                )

        # --- Reminder cohort: one batched dedup lookup, then bulk notify/email ---
        reminders_sent = 0
        if reminder_drafts:
            today_stamp = now.strftime("%Y-%m-%d")
            dedup_keys = {
                app.id: f"draft_reminder_{app.id}_{today_stamp}" for app in reminder_drafts
            }
            already_sent = set(
                Notification.objects.filter(
                    idempotency_key__in=list(dedup_keys.values()),
                ).values_list("idempotency_key", flat=True)
            )

            for app in reminder_drafts:
                dedup_key = dedup_keys[app.id]
                if dedup_key in already_sent:
                    continue

                days_since_update = (now - app.updated_at).days
                days_until_expiry = 30 - days_since_update
                if days_until_expiry <= 3:
                    urgency_msg = (
                        f" Your draft will expire in {days_until_expiry} "
                        f"day{'s' if days_until_expiry != 1 else ''}."
                    )
                else:
                    urgency_msg = ""

                message = (
                    f"Your draft application for {app.program} ({app.intake}) "
                    f"has not been updated in {days_since_update} days. "
                    f"Please log in to complete and submit your application.{urgency_msg}"
                )

                notification_specs.append(
                    {
                        "user_id": app.user_id,
                        "title": "Complete Your Application Draft",
                        "message": message,
                        "type": "info",
                        "priority": "high" if days_until_expiry <= 3 else "normal",
                        "action_url": f"/student/application/{app.id}",
                        "idempotency_key": dedup_key,
                    }
                )

                email_subject = (
                    "Your Application Draft Will Expire Soon"
                    if days_until_expiry <= 3
                    else "Reminder: Complete Your Application"
                )
                email_specs.append(
                    {
                        "recipient_email": app.email,
                        "subject": email_subject,
                        "body": (
                            f"<p>Dear {app.full_name},</p>"
                            f"<p>{message}</p>"
                            f"<p>Best regards,<br>Beanola Admissions</p>"
                        ),
                    }
                )
                reminders_sent += 1

        # --- Flush all side-effects with one bulk insert per table ---
        if notification_specs:
            try:
                create_notifications_bulk(notification_specs)
            except Exception:
                logger.exception("draft_expiry_reminder_task: bulk notification insert failed")
        if email_specs:
            try:
                queue_emails_bulk(email_specs)
            except Exception:
                logger.exception("draft_expiry_reminder_task: bulk email insert failed")

        if reminders_sent or expired_count:
            logger.info(
                "draft_expiry_reminder_task: sent %d reminders, expired %d drafts",
                reminders_sent,
                expired_count,
            )
        return {"reminders_sent": reminders_sent, "expired": expired_count}
    finally:
        release_task_lock("draft_expiry_reminder_task")
