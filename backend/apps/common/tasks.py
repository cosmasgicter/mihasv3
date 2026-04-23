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

from apps.common.metrics import emit_metric

logger = logging.getLogger(__name__)

EMAIL_STATUS_PENDING = "pending"
EMAIL_STATUS_PROCESSING = "processing"
EMAIL_STATUS_RETRYING = "retrying"
EMAIL_STATUS_FAILED = "failed"
EMAIL_STATUS_SENT = "sent"
EMAIL_SWEEP_BATCH_SIZE = 50
EMAIL_PENDING_SWEEP_AGE = timedelta(minutes=2)
EMAIL_PROCESSING_RECLAIM_AGE = timedelta(minutes=10)


# ---------------------------------------------------------------------------
# Outbox-safe dispatch — persist intent first, best-effort broker push
# ---------------------------------------------------------------------------


def dispatch_email(email_queue_id: str) -> None:
    """Best-effort push to Celery broker. If broker is down the EmailQueue
    row still exists with status='pending' and will be picked up by the
    periodic ``process_pending_emails_task`` sweep.
    """
    try:
        send_email_task.delay(email_queue_id)
    except Exception:
        logger.warning(
            "Broker unavailable — email %s will be picked up by sweep",
            email_queue_id,
        )


@shared_task(bind=True, max_retries=0, soft_time_limit=120, time_limit=150)
def process_pending_emails_task(self):
    """Sweep for EmailQueue rows stuck in pending delivery state.

    Picks up rows older than 2 minutes that were never dispatched (broker
    was down when the request handler tried .delay()). Limits to 50 per
    run to avoid long-running transactions.
    """
    from apps.common.models import EmailQueue

    now = timezone.now()
    dispatched = 0

    reclaim_cutoff = now - EMAIL_PROCESSING_RECLAIM_AGE
    reclaimed = (
        EmailQueue.objects.filter(
            status=EMAIL_STATUS_PROCESSING,
            created_at__lt=reclaim_cutoff,
        )
        .update(
            status=EMAIL_STATUS_RETRYING,
            error_message="Recovered stale processing email for re-dispatch",
        )
    )

    pending_cutoff = now - EMAIL_PENDING_SWEEP_AGE
    stale = EmailQueue.objects.filter(
        status=EMAIL_STATUS_PENDING,
        created_at__lt=pending_cutoff,
    ).values_list("id", flat=True)[:EMAIL_SWEEP_BATCH_SIZE]

    retrying = EmailQueue.objects.filter(
        status=EMAIL_STATUS_RETRYING,
        created_at__lt=reclaim_cutoff,
    ).values_list("id", flat=True)[:EMAIL_SWEEP_BATCH_SIZE]

    for eid in list(stale) + list(retrying):
        try:
            send_email_task.delay(str(eid))
            dispatched += 1
        except Exception:
            logger.warning("Sweep: broker still unavailable for email %s", eid)
            break  # broker down, stop trying

    if reclaimed:
        logger.warning("Email sweep: reclaimed %d stale processing emails", reclaimed)
    if dispatched:
        logger.info("Email sweep: dispatched %d stale email tasks", dispatched)


def _claim_email_for_delivery(email_queue_id):
    """Atomically claim an email row for delivery.

    This makes duplicate queued tasks harmless: the first worker that flips
    the row into ``processing`` wins, and later duplicate tasks simply exit.
    """
    from apps.common.models import EmailQueue

    claimed = EmailQueue.objects.filter(
        id=email_queue_id,
        status__in=[EMAIL_STATUS_PENDING, EMAIL_STATUS_RETRYING],
    ).update(
        status=EMAIL_STATUS_PROCESSING,
        error_message="",
    )
    if not claimed:
        return None

    return EmailQueue.objects.filter(id=email_queue_id).first()


def _mark_email_sent(email_record, provider: str) -> None:
    email_record.status = EMAIL_STATUS_SENT
    email_record.error_message = ""
    email_record.sent_at = timezone.now()
    email_record.save(update_fields=["status", "error_message", "sent_at"])
    emit_metric('email.sent', provider=provider.lower())
    logger.info("Email %s sent via %s", email_record.id, provider)


def _send_via_smtp(email_record):
    """Try sending via Zoho SMTP. Returns True on success."""
    from django.core.mail import EmailMessage

    if not getattr(settings, "EMAIL_HOST_USER", ""):
        logger.debug("SMTP not configured, skipping")
        return False

    try:
        msg = EmailMessage(
            subject=email_record.subject,
            body=email_record.body,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", settings.ERROR_ALERT_EMAIL),
            to=[email_record.recipient_email],
        )
        msg.content_subtype = "html"
        msg.send()

        _mark_email_sent(email_record, "SMTP")
        return True
    except Exception as exc:
        logger.warning("SMTP send failed for %s: %s", email_record.id, exc)
        return False


def _send_via_resend(email_record):
    """Try sending via Resend API. Returns True on success."""
    api_key = getattr(settings, "RESEND_API_KEY", "")
    if not api_key:
        logger.debug("Resend not configured, skipping")
        return False

    try:
        import resend

        resend.api_key = api_key
        resend.Emails.send(
            {
                "from": getattr(settings, "EMAIL_FROM", "noreply@mihas.edu.zm"),
                "to": [email_record.recipient_email],
                "subject": email_record.subject,
                "html": email_record.body,
            }
        )

        _mark_email_sent(email_record, "Resend")
        return True
    except Exception as exc:
        logger.warning("Resend send failed for %s: %s", email_record.id, exc)
        return False


@shared_task(bind=True, max_retries=3, default_retry_delay=60, soft_time_limit=60, time_limit=90)
def send_email_task(self, email_queue_id):
    """Send email via SMTP (Zoho) first, falling back to Resend API.

    SMTP is tried first to preserve the Resend free-tier quota.
    Retry delays: 60s, 120s, 240s (exponential backoff).
    """
    from apps.common.models import EmailQueue

    try:
        email_record = EmailQueue.objects.get(id=email_queue_id)
    except EmailQueue.DoesNotExist:
        logger.error("EmailQueue record %s not found", email_queue_id)
        return

    if email_record.status == EMAIL_STATUS_SENT:
        return

    email_record = _claim_email_for_delivery(email_queue_id)
    if email_record is None:
        logger.debug("Email %s already claimed or terminal; skipping duplicate task", email_queue_id)
        return

    # Try SMTP first (preserves Resend quota)
    if _send_via_smtp(email_record):
        return

    # Fallback to Resend
    if _send_via_resend(email_record):
        return

    # Both failed
    email_record.retry_count = (email_record.retry_count or 0) + 1
    email_record.error_message = "Both SMTP and Resend failed"
    email_record.status = (
        EMAIL_STATUS_RETRYING if email_record.retry_count < 3 else EMAIL_STATUS_FAILED
    )
    email_record.save(update_fields=["retry_count", "error_message", "status"])
    emit_metric('email.send_failed', provider='all', error='both_smtp_and_resend_failed')

    if email_record.retry_count < 3:
        backoff = 60 * (2 ** self.request.retries)
        raise self.retry(countdown=backoff)


@shared_task(bind=True, max_retries=3, default_retry_delay=60, soft_time_limit=300, time_limit=360)
def send_bulk_notifications_task(self, notification_ids):
    """Process bulk notification delivery.

    Iterates over notification IDs, sends email for each if the user
    has email notifications enabled.
    """
    from apps.common.models import Notification, UserNotificationPreference
    from apps.common.outbox import queue_email

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
            queue_email(
                recipient_email=user.email,
                subject=notification.title,
                body=notification.message,
            )

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
                # Forward to GlitchTip
                try:
                    import sentry_sdk
                    sentry_sdk.capture_message(error_msg, level="error")
                except Exception:
                    logger.exception("Failed to forward retry-exhaustion alert to GlitchTip")


# ---------------------------------------------------------------------------
# Keep-alive ping — prevents Koyeb cold starts
# ---------------------------------------------------------------------------

@shared_task(bind=True, max_retries=0, soft_time_limit=30, time_limit=45)
def keep_alive_task(self):
    """Lightweight keep-alive ping to prevent Koyeb cold starts.

    Hits /health/live/ (no DB or Redis check) every 4 minutes to keep
    the Koyeb web service instance warm. Uses the liveness endpoint
    instead of /health/ready/ to avoid unnecessary DB/Redis load.
    """
    import requests as http_requests

    live_url = getattr(settings, "KEEP_ALIVE_URL", "https://api.mihas.edu.zm/health/live/")

    try:
        resp = http_requests.get(live_url, timeout=10)
        logger.debug("Keep-alive ping: %s → %s", live_url, resp.status_code)
    except Exception:
        logger.warning("Keep-alive ping failed for %s", live_url)


UPTIME_REDIS_KEY = "uptime:last_status"
UPTIME_STATUS_OK = "ok"
UPTIME_STATUS_DOWN = "down"


@shared_task(bind=True, max_retries=0, soft_time_limit=30, time_limit=45)
def check_uptime_task(self):
    """Internal health check — pings /health/ready/ and alerts on failure.

    Sends HTTP GET to the configured HEALTH_CHECK_URL with a 10-second
    timeout.  Tracks previous status in Redis key 'uptime:last_status'.

    On transition healthy → unhealthy: dispatches alert email.
    On transition unhealthy → healthy: dispatches recovery email.
    Repeated failures without recovery do not produce duplicate alerts.

    Requirements: 5.2, 5.3, 5.4, 5.5
    """
    from apps.common.outbox import queue_email

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
            queue_email(
                recipient_email=alert_email,
                subject="🔴 MIHAS API Down — Health Check Failed",
                body=(
                    f"<p>The internal health check to <code>{health_url}</code> has failed.</p>"
                    "<p>The API may be experiencing an outage. Please investigate immediately.</p>"
                    f"<p>Checked by: <code>check_uptime_task</code></p>"
                ),
            )
        except Exception:
            logger.exception("Failed to dispatch uptime alert email")

    elif previous_status == UPTIME_STATUS_DOWN and current_status == UPTIME_STATUS_OK:
        # Unhealthy → healthy transition: send recovery notification.
        logger.info("Health check RECOVERED for %s — dispatching recovery notice", health_url)
        try:
            queue_email(
                recipient_email=alert_email,
                subject="🟢 MIHAS API Recovered — Health Check Passed",
                body=(
                    f"<p>The internal health check to <code>{health_url}</code> is now passing.</p>"
                    "<p>The API has recovered from the previous outage.</p>"
                    f"<p>Checked by: <code>check_uptime_task</code></p>"
                ),
            )
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


@shared_task(bind=True, max_retries=1, default_retry_delay=300, soft_time_limit=300, time_limit=360)
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


@shared_task(name="cleanup_idempotency_keys")
def cleanup_idempotency_keys_task():
    """Delete idempotency keys older than 24 hours."""
    from apps.common.models import IdempotencyKey

    cutoff = timezone.now() - timedelta(hours=24)
    deleted, _ = IdempotencyKey.objects.filter(created_at__lt=cutoff).delete()
    if deleted:
        logger.info("Cleaned up %d expired idempotency keys", deleted)
