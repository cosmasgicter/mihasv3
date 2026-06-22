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

    frontend = urlparse(getattr(settings, "FRONTEND_URL", "https://apply.beanola.com"))
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


# ---------------------------------------------------------------------------
# Batched variants (system-performance-hardening R6.4)
# ---------------------------------------------------------------------------
#
# The per-row ``create_notification`` / ``queue_email`` helpers issue one INSERT
# (plus one OutboxEvent INSERT) each. Periodic expiry tasks that touch many rows
# per run amplify that into N round-trips. These batched variants persist the
# same rows, with the same field normalization and the same OutboxEvent audit
# trail, using a single ``bulk_create`` per table — so the resulting persisted
# state is identical to calling the per-row helper N times, but with O(1)
# queries instead of O(N).


def create_notifications_bulk(specs):
    """Persist many in-app notifications with a single bulk insert.

    *specs* is an iterable of dicts accepting the same keys as
    :func:`create_notification` (``user_id``, ``title``, ``message``, ``type``,
    ``priority``, ``action_url``, ``metadata``, ``idempotency_key``). Field
    normalization and OutboxEvent recording are preserved so the persisted
    state matches N per-row ``create_notification`` calls.

    Idempotency is preserved: specs whose ``idempotency_key`` already exists
    (or repeats within the batch) are skipped, resolved with a single lookup
    query rather than one ``exists()`` per row.

    Returns the list of :class:`~apps.common.models.Notification` rows created.
    """
    specs = list(specs or [])
    if not specs:
        return []

    now = timezone.now()

    keyed = [s.get("idempotency_key") for s in specs if s.get("idempotency_key")]
    existing_keys: set[str] = set()
    if keyed:
        existing_keys = set(
            Notification.objects.filter(idempotency_key__in=keyed).values_list(
                "idempotency_key", flat=True
            )
        )

    notifications: list[Notification] = []
    seen_keys: set[str] = set()
    for spec in specs:
        key = spec.get("idempotency_key")
        if key:
            if key in existing_keys or key in seen_keys:
                continue
            seen_keys.add(key)
        notifications.append(
            Notification(
                user_id=spec["user_id"],
                title=_plain_text(spec.get("title"), max_length=MAX_NOTIFICATION_TITLE_LENGTH)
                or "Notification",
                message=_plain_text(spec.get("message"), max_length=MAX_NOTIFICATION_MESSAGE_LENGTH),
                type=_normalize_notification_type(spec.get("type")),
                priority=_normalize_priority(spec.get("priority")),
                action_url=_safe_action_url(spec.get("action_url")),
                metadata=spec.get("metadata"),
                idempotency_key=key,
                is_read=False,
                created_at=now,
                updated_at=now,
            )
        )

    if not notifications:
        return []

    with transaction.atomic():
        Notification.objects.bulk_create(notifications)

    # OutboxEvent recording is best-effort (mirrors _record_outbox_event) and
    # must never roll back the notifications, so it runs outside the atomic
    # block above.
    events = [
        OutboxEvent(
            event_type="notification.created",
            channel="notification",
            aggregate_type="user",
            aggregate_id=n.user_id,
            payload={
                "user_id": str(n.user_id),
                "title": n.title,
                "message": n.message,
                "type": n.type,
                "priority": n.priority,
                "action_url": n.action_url,
                "metadata": n.metadata or {},
            },
            status="published",
            target_table="notifications",
            target_id=n.id,
            idempotency_key=n.idempotency_key,
            created_at=now,
            processed_at=now,
        )
        for n in notifications
    ]
    try:
        OutboxEvent.objects.bulk_create(events)
    except Exception:
        logger.warning(
            "Bulk outbox event recording failed for notifications — best-effort skip",
            exc_info=True,
        )

    return notifications


def queue_emails_bulk(specs, *, dispatch: bool = True):
    """Persist many outbox emails with a single bulk insert and dispatch them.

    *specs* is an iterable of dicts accepting ``recipient_email``, ``subject``,
    ``body`` and optional ``recipient_name``. Rows and their OutboxEvents are
    written with one ``bulk_create`` each; when *dispatch* is true a single
    ``transaction.on_commit`` hook dispatches every queued email after commit,
    matching the per-row :func:`queue_email` behaviour.

    Returns the list of :class:`~apps.common.models.EmailQueue` rows created.
    """
    specs = list(specs or [])
    if not specs:
        return []

    now = timezone.now()
    emails = [
        EmailQueue(
            recipient_email=s["recipient_email"],
            recipient_name=s.get("recipient_name") or "",
            subject=s["subject"],
            body=s["body"],
            status="pending",
            retry_count=0,
            created_at=now,
        )
        for s in specs
    ]

    with transaction.atomic():
        EmailQueue.objects.bulk_create(emails)

    events = [
        OutboxEvent(
            event_type="email.queued",
            channel="email",
            aggregate_type="email",
            aggregate_id=None,
            payload={
                "recipient_email": e.recipient_email,
                "recipient_name": e.recipient_name or "",
                "subject": e.subject,
            },
            status="published",
            target_table="email_queue",
            target_id=e.id,
            created_at=now,
            processed_at=now,
        )
        for e in emails
    ]
    try:
        OutboxEvent.objects.bulk_create(events)
    except Exception:
        logger.warning(
            "Bulk outbox event recording failed for emails — best-effort skip",
            exc_info=True,
        )

    if dispatch:
        email_ids = [str(e.id) for e in emails]

        def _dispatch_all():
            for email_id in email_ids:
                try:
                    dispatch_email(email_id)
                except Exception:
                    logger.warning(
                        "dispatch_email failed for %s — best-effort skip",
                        email_id,
                        exc_info=True,
                    )

        transaction.on_commit(_dispatch_all)

    return emails
