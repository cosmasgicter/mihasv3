"""Catalog Celery tasks — intake lifecycle management.

Implements task 1.4.
Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.4
"""

import hashlib
import logging
from datetime import date

from celery import shared_task
from django.conf import settings
from django.core.cache import cache
from django.db import IntegrityError

logger = logging.getLogger(__name__)

_ALERT_THROTTLE_TTL = 900  # 15 minutes


def _log_error_and_alert(error_msg: str) -> None:
    """Create an ErrorLog row and dispatch a throttled alert email.

    Follows the same pattern as ``apps.common.exceptions._log_error_and_alert``
    but without a request context (this runs inside a Celery worker).
    """
    from apps.common.models import ErrorLog
    from apps.common.outbox import queue_email

    ErrorLog.objects.create(
        source="backend",
        level="error",
        message=error_msg[:2000],
        context={"task": "intake_manager_task"},
    )

    # Throttled alert — one per unique message per 15 minutes.
    msg_hash = hashlib.sha256(error_msg.encode("utf-8")).hexdigest()[:16]
    cache_key = f"error_alert:{msg_hash}"

    should_alert = True
    try:
        should_alert = cache.add(cache_key, 1, _ALERT_THROTTLE_TTL)
    except Exception:
        logger.warning("Redis unavailable for alert throttle, dispatching anyway")

    if should_alert:
        alert_email = settings.ERROR_ALERT_EMAIL
        queue_email(
            recipient_email=alert_email,
            subject=f"[ALERT] intake_manager_task failed: {error_msg[:100]}",
            body=(
                f"<p>The <code>intake_manager_task</code> encountered an error:</p>"
                f"<pre>{error_msg[:2000]}</pre>"
            ),
        )


@shared_task(bind=True, max_retries=2, default_retry_delay=300)
def intake_manager_task(self):
    """Ensure at least 2 open intakes exist. Idempotent.

    Queries active intakes, delegates date computation to the pure
    ``ensure_minimum_open_intakes`` function, then creates any missing
    Intake rows. Duplicates (same name + year) are skipped with a warning.

    On failure the task retries up to 2 times (5-minute delay), then logs
    to ErrorLog and dispatches a throttled alert email.
    """
    from apps.catalog.intake_date_computer import ensure_minimum_open_intakes
    from apps.catalog.models import Intake

    try:
        today = date.today()
        existing = list(Intake.objects.filter(is_active=True))
        to_create = ensure_minimum_open_intakes(today, existing)

        created_count = 0
        for computed in to_create:
            # Guard against duplicates at the DB level.
            if Intake.objects.filter(name=computed.name, year=computed.year).exists():
                logger.warning(
                    "Intake '%s' (%s) already exists — skipping",
                    computed.name,
                    computed.year,
                )
                continue

            try:
                Intake.objects.create(
                    name=computed.name,
                    year=computed.year,
                    start_date=computed.start_date,
                    application_start_date=computed.application_start_date,
                    application_deadline=computed.application_deadline,
                    is_active=True,
                    current_enrollment=0,
                )
                created_count += 1
                logger.info("Created intake '%s' (%s)", computed.name, computed.year)
            except IntegrityError:
                logger.warning(
                    "Duplicate intake '%s' (%s) — IntegrityError, skipping",
                    computed.name,
                    computed.year,
                )

        logger.info(
            "intake_manager_task complete: %d created, %d existing",
            created_count,
            len(existing),
        )

    except Exception as exc:
        error_msg = f"intake_manager_task failed: {exc.__class__.__name__}: {exc}"
        logger.exception(error_msg)

        # Retry if attempts remain; otherwise log + alert.
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc)

        try:
            _log_error_and_alert(error_msg)
        except Exception:
            logger.exception("Failed to log error or dispatch alert")
