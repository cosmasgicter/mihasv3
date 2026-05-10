"""Shared durable side-effect helpers."""

import logging
import re
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urlparse

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.common.models import EmailQueue, Notification, OutboxEvent
from apps.common.tasks import dispatch_email

logger = logging.getLogger(__name__)

VALID_NOTIFICATION_TYPES = {"info", "success", "warning", "error"}
VALID_NOTIFICATION_PRIORITIES = {"low", "normal", "high", "urgent"}
MAX_NOTIFICATION_TITLE_LENGTH = 255
MAX_NOTIFICATION_MESSAGE_LENGTH = 5000


class _PlainTextHTMLParser(HTMLParser):
    """Converts simple HTML fragments into readable plain text."""

    _BLOCK_TAGS = {"p", "div", "section", "article", "ul", "ol", "li", "tr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "br":
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag.lower() in self._BLOCK_TAGS:
            self.parts.append("\n\n")

    def handle_data(self, data):
        self.parts.append(data)

    def text(self) -> str:
        return _normalize_whitespace("".join(self.parts))


def _normalize_whitespace(value: str) -> str:
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]+", "", value)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _plain_text(value: str | None, *, max_length: int) -> str:
    raw = unescape(str(value or ""))
    if "<" in raw and ">" in raw:
        parser = _PlainTextHTMLParser()
        parser.feed(raw)
        parser.close()
        text = parser.text()
    else:
        text = _normalize_whitespace(raw)
    return text[:max_length]


def _normalize_notification_type(value: str | None) -> str:
    candidate = (value or "info").strip().lower()
    return candidate if candidate in VALID_NOTIFICATION_TYPES else "info"


def _normalize_priority(value: str | None) -> str | None:
    if value is None:
        return None
    candidate = str(value).strip().lower()
    return candidate if candidate in VALID_NOTIFICATION_PRIORITIES else "normal"


def _safe_action_url(value: str | None) -> str | None:
    if not value:
        return None

    url = str(value).strip()
    if not url or url.startswith("//"):
        return None

    if url.startswith("/"):
        return url[:2048]

    try:
        parsed = urlparse(url)
    except Exception:
        return None

    frontend = urlparse(getattr(settings, "FRONTEND_URL", "https://apply.mihas.edu.zm"))
    if parsed.scheme == "https" and parsed.netloc == frontend.netloc:
        path = parsed.path or "/"
        suffix = f"?{parsed.query}" if parsed.query else ""
        fragment = f"#{parsed.fragment}" if parsed.fragment else ""
        return f"{path}{suffix}{fragment}"[:2048]

    return None


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
    normalized_title = _plain_text(title, max_length=MAX_NOTIFICATION_TITLE_LENGTH) or "Notification"
    normalized_message = _plain_text(message, max_length=MAX_NOTIFICATION_MESSAGE_LENGTH)
    normalized_type = _normalize_notification_type(type)
    normalized_priority = _normalize_priority(priority)
    normalized_action_url = _safe_action_url(action_url)

    with transaction.atomic():
        notification = Notification.objects.create(
            user_id=user_id,
            title=normalized_title,
            message=normalized_message,
            type=normalized_type,
            priority=normalized_priority,
            action_url=normalized_action_url,
            metadata=metadata,
            idempotency_key=idempotency_key,
        )
        _record_outbox_event(
            event_type="notification.created",
            channel="notification",
            payload={
                "user_id": str(user_id),
                "title": normalized_title,
                "message": normalized_message,
                "type": normalized_type,
                "priority": normalized_priority,
                "action_url": normalized_action_url,
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
