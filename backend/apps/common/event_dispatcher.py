"""Event dispatcher for the SSE realtime system.

Creates SSEEvent rows in Postgres when domain actions occur.
Called explicitly from views, serializers, and Celery tasks — not via signals.
Does NOT use Redis for event delivery or storage.
"""

import logging
import uuid

from django.utils import timezone

from apps.common.models import SSEEvent

logger = logging.getLogger(__name__)

ALLOWED_EVENT_TYPES = frozenset({
    'notification',
    'application_update',
    'payment_update',
    'interview_scheduled',
    'dashboard_refresh',
})

# Maximum undelivered events per user before eviction kicks in.
MAX_UNDELIVERED_PER_USER = 100


def dispatch_event(
    user_id: str | uuid.UUID,
    event_type: str,
    payload: dict,
    entity_id: str | uuid.UUID | None = None,
) -> SSEEvent:
    """Create an SSE event row in Postgres.

    Args:
        user_id: Target user's Profile ID.
        event_type: One of 'notification', 'application_update',
                    'payment_update', 'interview_scheduled', 'dashboard_refresh'.
        payload: JSON-serializable dict with event-specific data.
                 Payload field conventions are documented in the design
                 and enforced by property tests — not validated at runtime.
        entity_id: Optional entity ID for frontend deduplication.

    Returns:
        The created SSEEvent instance.

    Raises:
        ValueError: If event_type is not in the allowed set.
    """
    if event_type not in ALLOWED_EVENT_TYPES:
        raise ValueError(
            f"Invalid event_type '{event_type}'. "
            f"Must be one of: {', '.join(sorted(ALLOWED_EVENT_TYPES))}"
        )

    # Coerce to UUID if string
    if isinstance(user_id, str):
        user_id = uuid.UUID(user_id)
    if isinstance(entity_id, str):
        entity_id = uuid.UUID(entity_id)

    # Enforce per-user cap: evict oldest undelivered events if at capacity.
    _evict_if_over_cap(user_id)

    event = SSEEvent.objects.create(
        user_id=user_id,
        event_type=event_type,
        payload=payload,
        entity_id=entity_id,
        delivered=False,
    )

    logger.debug(
        "Dispatched SSE event %s (type=%s) for user %s",
        event.id, event_type, user_id,
    )

    return event


def _evict_if_over_cap(user_id: uuid.UUID) -> None:
    """Mark oldest undelivered events as delivered when the per-user cap is reached.

    Uses a conditional DELETE-style approach: only runs the eviction query
    when the current undelivered count would exceed MAX_UNDELIVERED_PER_USER
    after the upcoming insert.
    """
    undelivered_count = SSEEvent.objects.filter(
        user_id=user_id,
        delivered=False,
    ).count()

    if undelivered_count < MAX_UNDELIVERED_PER_USER:
        return

    # Number of events to evict to make room for the new one.
    excess = undelivered_count - MAX_UNDELIVERED_PER_USER + 1

    # Find the IDs of the oldest undelivered events to evict.
    ids_to_evict = list(
        SSEEvent.objects.filter(
            user_id=user_id,
            delivered=False,
        )
        .order_by('created_at')
        .values_list('id', flat=True)[:excess]
    )

    if ids_to_evict:
        SSEEvent.objects.filter(id__in=ids_to_evict).update(
            delivered=True,
            delivered_at=timezone.now(),
        )
        logger.info(
            "Evicted %d oldest undelivered SSE events for user %s (cap=%d)",
            len(ids_to_evict), user_id, MAX_UNDELIVERED_PER_USER,
        )
