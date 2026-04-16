"""Common Celery tasks — email delivery, bulk notifications, uptime monitoring, and audit cleanup.

Implements task 17.2.
Requirements: 8.3, 8.4, 12.2, 12.3, 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
"""

import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

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
        email_record.error_message = str(exc)[:500]
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


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
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

        except Exception as exc:
            logger.exception("Failed to process notification %s", notification.id)
            # Retry on transient errors with exponential backoff
            try:
                self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
            except self.MaxRetriesExceededError:
                error_msg = (
                    f"All retries exhausted for bulk notification task. "
                    f"IDs: {notification_ids}, last error: {exc}"
                )
                logger.error(error_msg)
                # Dispatch throttled alert email
                try:
                    import hashlib

                    msg_hash = hashlib.sha256(error_msg.encode("utf-8")).hexdigest()[:16]
                    cache_key = f"error_alert:{msg_hash}"
                    should_alert = True
                    try:
                        if not cache.add(cache_key, "1", timeout=900):
                            should_alert = False
                    except Exception:
                        pass
                    if should_alert:
                        from apps.common.models import ErrorLog, EmailQueue

                        ErrorLog.objects.create(
                            source="celery",
                            level="error",
                            message=error_msg[:2000],
                        )
                        alert_email = settings.ERROR_ALERT_EMAIL
                        email_record = EmailQueue.objects.create(
                            recipient_email=alert_email,
                            subject="[ALERT] Bulk notification retries exhausted",
                            body=error_msg,
                            status="pending",
                        )
                        send_email_task.delay(str(email_record.id))
                except Exception:
                    logger.exception("Failed to dispatch retry-exhaustion alert")


# ---------------------------------------------------------------------------
# Keep-alive ping — prevents Koyeb cold starts
# ---------------------------------------------------------------------------

@shared_task(bind=True, max_retries=0)
def keep_alive_task(self):
    """Lightweight keep-alive ping to prevent Koyeb cold starts.

    Hits /health/live/ (no DB or Redis check) every 4 minutes to keep
    the Koyeb web service instance warm. Uses the liveness endpoint
    instead of /health/ready/ to avoid unnecessary DB/Redis load.
    """
    import requests as http_requests

    health_url = getattr(
        settings,
        "HEALTH_CHECK_URL",
        "https://api.mihas.edu.zm/health/ready/",
    )
    # Use /health/live/ for keep-alive — lighter than /health/ready/
    live_url = health_url.replace("/health/ready/", "/health/live/")

    try:
        resp = http_requests.get(live_url, timeout=10)
        logger.debug("Keep-alive ping: %s → %s", live_url, resp.status_code)
    except Exception:
        logger.warning("Keep-alive ping failed for %s", live_url)


UPTIME_REDIS_KEY = "uptime:last_status"
UPTIME_STATUS_OK = "ok"
UPTIME_STATUS_DOWN = "down"


@shared_task(bind=True, max_retries=0)
def check_uptime_task(self):
    """Internal health check — pings /health/ready/ and alerts on failure.

    Sends HTTP GET to the configured HEALTH_CHECK_URL with a 10-second
    timeout.  Tracks previous status in Redis key 'uptime:last_status'.

    On transition healthy → unhealthy: dispatches alert email.
    On transition unhealthy → healthy: dispatches recovery email.
    Repeated failures without recovery do not produce duplicate alerts.

    Requirements: 5.2, 5.3, 5.4, 5.5
    """
    from apps.common.models import EmailQueue

    health_url = getattr(settings, "HEALTH_CHECK_URL", "https://api.mihas.edu.zm/health/ready/")
    alert_email = settings.ERROR_ALERT_EMAIL
    email_from = getattr(settings, "EMAIL_FROM", "noreply@mihas.edu.zm")

    # Determine current health status.
    current_status = UPTIME_STATUS_DOWN
    try:
        import requests as http_requests

        resp = http_requests.get(health_url, timeout=10)
        if resp.status_code == 200:
            current_status = UPTIME_STATUS_OK
    except Exception:
        # Timeout, connection error, etc. — treat as down.
        current_status = UPTIME_STATUS_DOWN

    # Read previous status from Redis (default to 'ok' on first run).
    try:
        previous_status = cache.get(UPTIME_REDIS_KEY, UPTIME_STATUS_OK)
    except Exception:
        logger.error("Failed to read uptime status from Redis, treating as new incident")
        previous_status = UPTIME_STATUS_OK

    # Persist current status.
    try:
        cache.set(UPTIME_REDIS_KEY, current_status, timeout=None)
    except Exception:
        logger.error("Failed to write uptime status to Redis")

    # Detect transitions and dispatch emails.
    if previous_status == UPTIME_STATUS_OK and current_status == UPTIME_STATUS_DOWN:
        # Healthy → unhealthy transition: send alert.
        logger.warning("Health check FAILED for %s — dispatching alert", health_url)
        try:
            email_record = EmailQueue.objects.create(
                recipient_email=alert_email,
                subject="🔴 MIHAS API Down — Health Check Failed",
                body=(
                    f"<p>The internal health check to <code>{health_url}</code> has failed.</p>"
                    "<p>The API may be experiencing an outage. Please investigate immediately.</p>"
                    f"<p>Checked by: <code>check_uptime_task</code></p>"
                ),
                status="pending",
            )
            send_email_task.delay(str(email_record.id))
        except Exception:
            logger.exception("Failed to dispatch uptime alert email")

    elif previous_status == UPTIME_STATUS_DOWN and current_status == UPTIME_STATUS_OK:
        # Unhealthy → healthy transition: send recovery notification.
        logger.info("Health check RECOVERED for %s — dispatching recovery notice", health_url)
        try:
            email_record = EmailQueue.objects.create(
                recipient_email=alert_email,
                subject="🟢 MIHAS API Recovered — Health Check Passed",
                body=(
                    f"<p>The internal health check to <code>{health_url}</code> is now passing.</p>"
                    "<p>The API has recovered from the previous outage.</p>"
                    f"<p>Checked by: <code>check_uptime_task</code></p>"
                ),
                status="pending",
            )
            send_email_task.delay(str(email_record.id))
        except Exception:
            logger.exception("Failed to dispatch uptime recovery email")

    elif current_status == UPTIME_STATUS_DOWN:
        # Still down — no duplicate alert.
        logger.warning("Health check still failing for %s — no duplicate alert", health_url)
    else:
        logger.debug("Health check OK for %s", health_url)


STANDARD_RETENTION_DAYS = 90
SECURITY_RETENTION_DAYS = 365
BATCH_SIZE = 1000


@shared_task(bind=True, max_retries=1, default_retry_delay=300)
def cleanup_audit_logs_task(self):
    """Purge expired audit log records in batches of 1000.

    Deletes standard-retention records older than 90 days and
    security-retention records older than 365 days.  Batches deletes
    to avoid long-running transactions.

    On database error: logs the error and retries once after 5 minutes.

    Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
    """
    from apps.accounts.models import CSRFToken
    from apps.common.models import AuditLog

    now = timezone.now()

    # Clean up expired CSRF tokens
    try:
        expired_csrf_count, _ = CSRFToken.objects.filter(expires_at__lt=now).delete()
        if expired_csrf_count:
            logger.info("CSRF token cleanup: deleted %d expired tokens", expired_csrf_count)
    except Exception:
        logger.exception("CSRF token cleanup failed")

    retention_rules = [
        ("standard", now - timedelta(days=STANDARD_RETENTION_DAYS)),
        ("security", now - timedelta(days=SECURITY_RETENTION_DAYS)),
    ]

    try:
        for category, cutoff in retention_rules:
            total_deleted = 0
            while True:
                # Fetch a batch of IDs to delete.
                batch_ids = list(
                    AuditLog.objects.filter(
                        retention_category=category,
                        created_at__lt=cutoff,
                    )
                    .values_list("id", flat=True)[:BATCH_SIZE]
                )
                if not batch_ids:
                    break
                deleted_count, _ = AuditLog.objects.filter(id__in=batch_ids).delete()
                total_deleted += deleted_count

            logger.info(
                "Audit log cleanup: deleted %d '%s' records older than %s",
                total_deleted,
                category,
                cutoff.isoformat(),
            )

    except Exception as exc:
        logger.error("Audit log cleanup failed: %s", exc)
        raise self.retry(exc=exc)


import os  # noqa: E402


@shared_task(name="keep_alive_ping_task", ignore_result=True)
def keep_alive_ping_task():
    """Ping health endpoint to prevent Koyeb cold starts."""
    import requests as http_requests
    try:
        url = os.environ.get("HEALTH_CHECK_URL", "https://api.mihas.edu.zm/health/live/")
        http_requests.get(url, timeout=5)
    except Exception:
        pass  # Non-critical — just keeping the instance warm


@shared_task(name="cleanup_csrf_tokens_task", ignore_result=True)
def cleanup_csrf_tokens_task():
    """Delete expired CSRF tokens older than 48 hours."""
    from django.utils import timezone as tz
    from datetime import timedelta
    from apps.accounts.models import CSRFToken
    cutoff = tz.now() - timedelta(hours=48)
    deleted, _ = CSRFToken.objects.filter(expires_at__lt=cutoff).delete()
    if deleted:
        logger.info("Cleaned up %d expired CSRF tokens", deleted)
