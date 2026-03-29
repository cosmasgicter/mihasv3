"""Common Celery tasks — email delivery and bulk notifications.

Implements task 17.2.
Requirements: 8.3, 8.4, 12.2, 12.3
"""

import logging

from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_email_task(self, email_queue_id):
    """Send email via Resend API with exponential backoff.

    Loads the email from EmailQueue, sends via resend.Emails.send(),
    and updates the queue record status on success or failure.

    Retry delays: 60s, 120s, 240s (exponential backoff).
    """
    from apps.common.models import EmailQueue

    try:
        email_record = EmailQueue.objects.get(id=email_queue_id)
    except EmailQueue.DoesNotExist:
        logger.error("EmailQueue record %s not found", email_queue_id)
        return

    if email_record.status == "sent":
        logger.info("Email %s already sent, skipping", email_queue_id)
        return

    try:
        import resend

        resend.api_key = getattr(settings, "RESEND_API_KEY", "")
        email_from = getattr(settings, "EMAIL_FROM", "noreply@mihas.edu.zm")

        resend.Emails.send(
            {
                "from": email_from,
                "to": [email_record.recipient_email],
                "subject": email_record.subject,
                "html": email_record.body,
            }
        )

        email_record.status = "sent"
        email_record.save()
        logger.info("Email %s sent successfully", email_queue_id)

    except Exception as exc:
        email_record.retry_count += 1
        email_record.last_error = str(exc)[:500]
        email_record.status = "retrying"
        email_record.save()

        logger.warning(
            "Email %s failed (attempt %d/%d): %s",
            email_queue_id,
            self.request.retries + 1,
            self.max_retries + 1,
            str(exc),
        )

        if self.request.retries >= self.max_retries:
            email_record.status = "failed"
            email_record.save()
            logger.error("Email %s permanently failed after %d retries", email_queue_id, self.max_retries)
            return

        # Exponential backoff: 60s, 120s, 240s
        backoff = 60 * (2 ** self.request.retries)
        raise self.retry(exc=exc, countdown=backoff)


@shared_task(bind=True, max_retries=3)
def send_bulk_notifications_task(self, notification_ids):
    """Process bulk notification delivery.

    Iterates over notification IDs, sends email for each if the user
    has email notifications enabled.
    """
    from apps.common.models import EmailQueue, Notification, UserNotificationPreference

    if not notification_ids:
        return

    notifications = Notification.objects.filter(id__in=notification_ids)

    for notification in notifications:
        try:
            # Check user notification preferences.
            pref = UserNotificationPreference.objects.filter(
                user_id=notification.user_id
            ).first()

            if pref and not pref.email_enabled:
                logger.info(
                    "Skipping email for notification %s — user disabled email",
                    notification.id,
                )
                continue

            # Get user email.
            from apps.accounts.models import Profile

            user = Profile.objects.filter(id=notification.user_id).first()
            if not user:
                logger.warning("User %s not found for notification %s", notification.user_id, notification.id)
                continue

            # Enqueue email.
            email_record = EmailQueue.objects.create(
                recipient_email=user.email,
                subject=notification.title,
                body=notification.message,
                status="pending",
            )

            # Dispatch email task.
            send_email_task.delay(str(email_record.id))

        except Exception:
            logger.exception("Failed to process notification %s", notification.id)
