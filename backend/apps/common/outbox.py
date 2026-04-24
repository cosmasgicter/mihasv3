"""Shared durable side-effect helpers."""

import logging

from django.db import transaction
from django.utils import timezone

from apps.common.models import EmailQueue, Notification, OutboxEvent
from apps.common.tasks import dispatch_email

logger = logging.getLogger(__name__)


def _record_outbox_event(
    *,
    event_type: str,
    channel: str,
    payload: dict,
    target_table: str,
    target_id,
    aggregate_type: str | None = None,
    aggregate_id=None,
    idempotency_key: str | None = None,
):
    try:
        return OutboxEvent.objects.create(
            event_type=event_type,
            channel=channel,
            aggregate_type=aggregate_type,
            aggregate_id=aggregate_id,
            payload=payload,
            status="published",
            target_table=target_table,
            target_id=target_id,
            idempotency_key=idempotency_key,
            created_at=timezone.now(),
            processed_at=timezone.now(),
        )
    except Exception:
        logger.warning(
            "Outbox event recording failed for %s/%s — best-effort skip",
            event_type, channel, exc_info=True,
        )
        return None


def create_notification(
    *,
    user_id,
    title: str,
    message: str,
    type: str = "info",
    priority: str | None = None,
    action_url: str | None = None,
    metadata: dict | None = None,
    idempotency_key: str | None = None,
):
    """Persist an in-app notification and return the created row."""
    with transaction.atomic():
        notification = Notification.objects.create(
            user_id=user_id,
            title=title,
            message=message,
            type=type,
            priority=priority,
            action_url=action_url,
            metadata=metadata,
            idempotency_key=idempotency_key,
        )
    _record_outbox_event(
        event_type="notification.created",
        channel="notification",
        payload={
            "user_id": str(user_id),
            "title": title,
            "message": message,
            "type": type,
            "priority": priority,
            "action_url": action_url,
            "metadata": metadata or {},
        },
        target_table="notifications",
        target_id=notification.id,
        aggregate_type="user",
        aggregate_id=user_id,
        idempotency_key=idempotency_key,
    )
    return notification


def queue_email(
    *,
    recipient_email: str,
    subject: str,
    body: str,
    recipient_name: str | None = None,
    dispatch: bool = True,
):
    """Persist an email outbox row and optionally dispatch it."""
    with transaction.atomic():
        email_record = EmailQueue.objects.create(
            recipient_email=recipient_email,
            recipient_name=recipient_name or "",
            subject=subject,
            body=body,
            status="pending",
        )
        if dispatch:
            transaction.on_commit(lambda: dispatch_email(str(email_record.id)))
    _record_outbox_event(
        event_type="email.queued",
        channel="email",
        payload={
            "recipient_email": recipient_email,
            "recipient_name": recipient_name or "",
            "subject": subject,
        },
        target_table="email_queue",
        target_id=email_record.id,
        aggregate_type="email",
        aggregate_id=None,
    )
    return email_record
