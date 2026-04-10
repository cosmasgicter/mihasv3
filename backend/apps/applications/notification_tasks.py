# backend/apps/applications/notification_tasks.py

import logging
from celery import shared_task
from django.core.cache import cache
from django.utils import timezone
from datetime import timedelta

from apps.common.event_dispatcher import dispatch_event

logger = logging.getLogger(__name__)

# Deduplication window: at most one notification per type per application per 24 hours
DEDUP_TTL_SECONDS = 24 * 60 * 60


def _dedup_key(notification_type: str, app_id) -> str:
    """Build a Redis cache key for notification deduplication."""
    return f"notif_dedup:{notification_type}:{app_id}"


def _should_send(notification_type: str, app_id) -> bool:
    """Return True if this notification has not been sent in the last 24 hours."""
    key = _dedup_key(notification_type, app_id)
    # cache.add returns True only if the key did not already exist
    return cache.add(key, 1, DEDUP_TTL_SECONDS)


@shared_task
def send_deadline_reminders():
    """Dispatch deadline warning SSE events for drafts approaching intake deadlines."""
    from apps.applications.models import Application
    from apps.catalog.models import Intake

    now = timezone.now().date()
    for days_ahead, urgency in [(7, "warning"), (1, "urgent")]:
        target_date = now + timedelta(days=days_ahead)
        intakes = Intake.objects.filter(
            application_deadline=target_date, is_active=True
        )
        for intake in intakes:
            drafts = Application.objects.filter(
                intake=intake.name, status="draft"
            ).values_list("user_id", "id")
            for user_id, app_id in drafts:
                notif_type = f"deadline_{urgency}"
                if not _should_send(notif_type, app_id):
                    continue
                dispatch_event(
                    user_id=user_id,
                    event_type="notification",
                    payload={
                        "type": notif_type,
                        "message": f"Application deadline is {days_ahead} day(s) away ({target_date.isoformat()}).",
                        "application_id": str(app_id),
                    },
                    entity_id=app_id,
                )


@shared_task
def send_stale_draft_reminders():
    """Remind users with drafts older than 7 days with no updates."""
    from apps.applications.models import Application

    cutoff = timezone.now() - timedelta(days=7)
    stale = Application.objects.filter(
        status="draft", updated_at__lt=cutoff
    ).values_list("user_id", "id")
    for user_id, app_id in stale:
        notif_type = "incomplete_draft_reminder"
        if not _should_send(notif_type, app_id):
            continue
        dispatch_event(
            user_id=user_id,
            event_type="notification",
            payload={
                "type": notif_type,
                "message": "Your application draft has been inactive for over 7 days.",
                "application_id": str(app_id),
            },
            entity_id=app_id,
        )
