"""One communications history, with delivery state and channel (task 10.1).

Admissions V2 task 10.1 — R13.4, R13.8; finding **STU-14**.

R13.4 asks for three things the platform did not have:

1. **delivery state and channel** on the student's own communication history —
   the inbox published ``{id, title, message, type, is_read, created_at}`` and
   said nothing about whether the email went out;
2. **no secrets or internal provider payloads** — the raw material for delivery
   state is ``EmailQueue.error_message``, which holds provider text
   (``"Both SMTP and Resend failed"``, SMTP responses), and ``recipient_email``,
   which is contact PII. Neither is published; a classified state, an attempt
   count and a timestamp are;
3. **retry as an authorized audited command** — there was no retry at all, so a
   failed email was a dead end for both the student and the operator.

The join is `Notification.metadata['communication']`, written by
:func:`apps.common.notification_preferences.deliver_message`. It is an existing
jsonb column, so none of this needed a migration. A message sent before 10.1 has
no record, and its email state is published as ``unknown`` rather than invented
as healthy — the ADM-02 lesson applied to a delivery state.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Optional, Sequence

from apps.common.notification_preferences import (
    CHANNEL_EMAIL,
    CHANNEL_IN_APP,
    CATEGORIES_BY_KEY,
    CATEGORY_APPLICATION_UPDATES,
    COMMUNICATION_METADATA_KEY,
    CHANNEL_UNUSED_REASONS,
    NO_RECIPIENT,
    NOT_IN_AUDIENCE_CHANNELS,
    SUPPRESSED_BY_PREFERENCE,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# The published delivery-state vocabulary
# ---------------------------------------------------------------------------

STATE_DELIVERED = "delivered"
STATE_SENT = "sent"
STATE_QUEUED = "queued"
STATE_RETRYING = "retrying"
STATE_FAILED = "failed"
STATE_SUPPRESSED = "suppressed"
STATE_NOT_APPLICABLE = "not_applicable"
STATE_UNKNOWN = "unknown"

DELIVERY_STATES: tuple[str, ...] = (
    STATE_DELIVERED,
    STATE_SENT,
    STATE_QUEUED,
    STATE_RETRYING,
    STATE_FAILED,
    STATE_SUPPRESSED,
    STATE_NOT_APPLICABLE,
    STATE_UNKNOWN,
)

#: Every state ships a definition, so a label on screen cannot mean one thing in
#: one build and another in the next (9.1/9.4's rule applied to delivery state).
STATE_DEFINITIONS: dict[str, str] = {
    STATE_DELIVERED: "Written to your inbox. In-app messages are delivered as they are created.",
    STATE_SENT: "Accepted by the mail provider.",
    STATE_QUEUED: "Waiting to be sent.",
    STATE_RETRYING: "A send attempt failed and the platform is trying again.",
    STATE_FAILED: "Every send attempt failed. You can ask the platform to try again.",
    STATE_SUPPRESSED: "Not sent on this channel because of your notification settings.",
    STATE_NOT_APPLICABLE: "This message was not sent on this channel.",
    STATE_UNKNOWN: (
        "This message predates delivery tracking, so the platform cannot state "
        "what happened on this channel."
    ),
}

#: ``EmailQueue.status`` → published state. The queue's own vocabulary
#: (``apps.common.tasks.EMAIL_STATUS_*``) is internal; this is what a student sees.
_EMAIL_STATUS_STATES: dict[str, str] = {
    "sent": STATE_SENT,
    "pending": STATE_QUEUED,
    "processing": STATE_QUEUED,
    "retrying": STATE_RETRYING,
    "failed": STATE_FAILED,
}

#: Why one channel carried no delivery → the state a reader sees. Explicit, and
#: total over :data:`CHANNEL_UNUSED_REASONS`, so a new reason cannot silently fall
#: through to a state that reads as benign:
#:
#: * the two **preference** reasons say ``suppressed`` — the recipient's own
#:   setting decided it, and they can reverse it;
#: * the **audience** reason says ``not_applicable`` — this message class has no
#:   such channel, so it is a fact about the message and not something the reader
#:   failed to enable (see ``notification_preferences.AUDIENCE_CHANNELS``).
_UNUSED_REASON_STATES: dict[str, str] = {
    SUPPRESSED_BY_PREFERENCE: STATE_SUPPRESSED,
    NO_RECIPIENT: STATE_SUPPRESSED,
    NOT_IN_AUDIENCE_CHANNELS: STATE_NOT_APPLICABLE,
}

#: The reasons the gate can emit that this module has no state for. Computed from
#: the gate's own tuple rather than re-listed, so the guard that asserts it is
#: empty is checking coverage instead of re-stating the map.
UNCLASSIFIED_UNUSED_REASONS: tuple[str, ...] = tuple(
    reason for reason in CHANNEL_UNUSED_REASONS if reason not in _UNUSED_REASON_STATES
)

#: A student may ask the platform to try a failed email again this many times.
#: Bounded on purpose: an unbounded resend is an outbound-mail amplifier.
COMMUNICATION_RETRY_LIMIT = 3


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class CommunicationRetryError(Exception):
    """A retry the platform refuses, with a stable code."""

    def __init__(self, code: str, message: str, status_code: int = 409):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


CODE_RETRY_NOT_APPLICABLE = "RETRY_NOT_APPLICABLE"
CODE_RETRY_LIMIT_REACHED = "RETRY_LIMIT_REACHED"
CODE_RETRY_UNTRACKED = "RETRY_UNTRACKED"


# ---------------------------------------------------------------------------
# Projection
# ---------------------------------------------------------------------------


def _as_iso(value: Any) -> Optional[str]:
    """Render a timestamp as ISO-8601 without assuming it is a ``datetime``.

    The value reaching here comes from three different places — a model field
    (``datetime``), a jsonb payload (already a string), and a serialized row —
    so the projection must be **total** over what it can be handed. Assuming
    ``datetime`` made the student's own inbox answer **500** whenever a
    timestamp arrived as a string, which is a read failure on the surface
    R13.4 exists to make legible.
    """
    if value is None:
        return None
    isoformat = getattr(value, "isoformat", None)
    if callable(isoformat):
        return isoformat()
    if isinstance(value, str):
        return value or None
    return str(value)


@dataclass(frozen=True)
class ChannelState:
    channel: str
    state: str
    attempts: int = 0
    last_attempt_at: Optional[Any] = None
    can_retry: bool = False

    def as_payload(self) -> dict[str, Any]:
        return {
            "channel": self.channel,
            "state": self.state,
            "attempts": self.attempts,
            "last_attempt_at": _as_iso(self.last_attempt_at),
            "can_retry": self.can_retry,
        }


def _communication_record(notification) -> Mapping[str, Any]:
    metadata = getattr(notification, "metadata", None)
    if isinstance(metadata, Mapping):
        record = metadata.get(COMMUNICATION_METADATA_KEY)
        if isinstance(record, Mapping):
            return record
    return {}


def _email_attempt_ids(record: Mapping[str, Any]) -> list[str]:
    channels = record.get("channels")
    if not isinstance(channels, Mapping):
        return []
    email = channels.get(CHANNEL_EMAIL.key)
    if not isinstance(email, Mapping):
        return []
    attempts = email.get("attempts")
    if not isinstance(attempts, Sequence) or isinstance(attempts, (str, bytes)):
        return []
    return [str(a) for a in attempts if a]


def collect_email_queue_ids(notifications: Iterable[Any]) -> list[str]:
    """Every EmailQueue id referenced by these notifications.

    Used to resolve delivery state with **one** extra query for a whole page
    rather than one per row.
    """
    ids: list[str] = []
    for notification in notifications:
        ids.extend(_email_attempt_ids(_communication_record(notification)))
    return ids


def load_email_states(queue_ids: Sequence[str]) -> dict[str, Any]:
    """Map ``str(EmailQueue.id) -> row`` for the referenced ids only."""
    if not queue_ids:
        return {}
    try:
        from apps.common.models import EmailQueue

        rows = EmailQueue.objects.filter(id__in=list(set(queue_ids))).only(
            "id", "status", "retry_count", "sent_at", "created_at"
        )
        return {str(row.id): row for row in rows}
    except Exception:  # pragma: no cover - defensive
        logger.warning("Email delivery-state lookup failed", exc_info=True)
        return {}


def _email_channel_state(
    record: Mapping[str, Any], email_rows: Mapping[str, Any]
) -> ChannelState:
    channels = record.get("channels")
    email = channels.get(CHANNEL_EMAIL.key) if isinstance(channels, Mapping) else None

    if not isinstance(email, Mapping):
        # Pre-10.1 message: no delivery record exists. Say so.
        return ChannelState(channel=CHANNEL_EMAIL.key, state=STATE_UNKNOWN)

    if not email.get("used"):
        reason = email.get("reason")
        state = _UNUSED_REASON_STATES.get(reason, STATE_NOT_APPLICABLE)
        return ChannelState(channel=CHANNEL_EMAIL.key, state=state)

    attempt_ids = _email_attempt_ids(record)
    rows = [email_rows[i] for i in attempt_ids if i in email_rows]
    if not rows:
        return ChannelState(
            channel=CHANNEL_EMAIL.key,
            state=STATE_UNKNOWN,
            attempts=len(attempt_ids),
        )

    latest = rows[-1]
    status = (getattr(latest, "status", "") or "").strip().lower()
    state = _EMAIL_STATUS_STATES.get(status, STATE_UNKNOWN)
    last_attempt_at = getattr(latest, "sent_at", None) or getattr(
        latest, "created_at", None
    )
    return ChannelState(
        channel=CHANNEL_EMAIL.key,
        state=state,
        attempts=len(attempt_ids),
        last_attempt_at=last_attempt_at,
        can_retry=state == STATE_FAILED and len(attempt_ids) <= COMMUNICATION_RETRY_LIMIT,
    )


def project_channels(notification, email_rows: Mapping[str, Any]) -> list[ChannelState]:
    """The per-channel delivery state for one message."""
    record = _communication_record(notification)
    in_app = ChannelState(
        channel=CHANNEL_IN_APP.key,
        state=STATE_DELIVERED,
        attempts=1,
        last_attempt_at=getattr(notification, "created_at", None),
    )
    return [in_app, _email_channel_state(record, email_rows)]


def project_category(notification) -> str:
    """The published category for one message (mandatory when unrecorded)."""
    record = _communication_record(notification)
    key = record.get("category")
    if isinstance(key, str) and key in CATEGORIES_BY_KEY:
        return key
    return CATEGORY_APPLICATION_UPDATES.key


def project_delivery(notifications: Sequence[Any]) -> dict[str, dict[str, Any]]:
    """Delivery projection for a page of notifications, keyed by notification id.

    One extra query for the whole page.
    """
    email_rows = load_email_states(collect_email_queue_ids(notifications))
    projection: dict[str, dict[str, Any]] = {}
    for notification in notifications:
        channels = project_channels(notification, email_rows)
        category = project_category(notification)
        resolved = CATEGORIES_BY_KEY.get(category, CATEGORY_APPLICATION_UPDATES)
        projection[str(getattr(notification, "id", ""))] = {
            "category": category,
            "kind": resolved.kind,
            # Which channel set this message class was ever allowed to use. Read
            # from the category rather than from the stored record, so an older
            # record cannot claim an audience the platform no longer publishes.
            "audience": resolved.audience,
            "channels": [c.as_payload() for c in channels],
            "can_retry": any(c.can_retry for c in channels),
        }
    return projection


def history_vocabulary() -> dict[str, Any]:
    """The delivery-state vocabulary, published **once** on the schema surface.

    A label must ship its definition (9.1/9.4's rule), but the notification list
    is a *registered paginated envelope*: ``{page, pageSize, totalCount,
    results}`` inside ``data`` and nothing else, pinned by
    ``tests/unit/test_perf_notification_cursor.py``. Spreading a vocabulary
    across every page would both break that contract and repeat a constant on
    every read.

    So the vocabulary lives on ``GET /api/v1/notifications/preferences/`` — the
    one surface that already publishes the channel and category vocabulary — and
    the inbox reads it there. One authority for "what may this word mean",
    one round trip, and the pagination contract untouched.
    """
    return {
        "delivery_states": list(DELIVERY_STATES),
        "delivery_state_definitions": dict(STATE_DEFINITIONS),
        "retry_limit": COMMUNICATION_RETRY_LIMIT,
    }


# ---------------------------------------------------------------------------
# Retry: an authorized, audited, durable command
# ---------------------------------------------------------------------------


@dataclass
class RetryResult:
    notification: Any
    email: Any
    attempts: int


def retry_email_delivery(notification, *, request=None) -> RetryResult:
    """Re-queue the failed email for one of the caller's own messages.

    Authority is the caller's **ownership** of the notification, resolved by the
    view before this is called (an id that is not theirs is an indistinguishable
    404, per the owner disclosure policy).

    State precondition: the latest email attempt is terminal ``failed``. A
    message that is queued, retrying, already sent, suppressed by the student's
    own settings, or has no delivery record is refused with a stable code rather
    than quietly producing a second email.

    Durability: the retry writes a **new** ``EmailQueue`` row plus its committed
    ``OutboxEvent`` through :func:`apps.common.outbox.queue_email`, and dispatch
    happens on commit. If the broker is down the row is still there and
    ``process_pending_emails_task`` sweeps it — the retry is never a
    fire-and-forget provider call.

    Idempotence is the state machine's, not a key's: the first retry moves the
    message out of ``failed``, so an immediate replay is refused.
    """
    from apps.common.models import EmailQueue
    from apps.common.outbox import queue_email

    record = dict(_communication_record(notification))
    channels = record.get("channels")
    email = channels.get(CHANNEL_EMAIL.key) if isinstance(channels, Mapping) else None

    if not isinstance(email, Mapping) or not email.get("used"):
        raise CommunicationRetryError(
            CODE_RETRY_UNTRACKED,
            "This message has no tracked email delivery to retry.",
        )

    attempt_ids = _email_attempt_ids(record)
    if not attempt_ids:
        raise CommunicationRetryError(
            CODE_RETRY_UNTRACKED,
            "This message has no tracked email delivery to retry.",
        )

    if len(attempt_ids) > COMMUNICATION_RETRY_LIMIT:
        raise CommunicationRetryError(
            CODE_RETRY_LIMIT_REACHED,
            "This message has already been retried the maximum number of times.",
        )

    previous = EmailQueue.objects.filter(pk=attempt_ids[-1]).first()
    if previous is None:
        raise CommunicationRetryError(
            CODE_RETRY_UNTRACKED,
            "The delivery record for this message is no longer available.",
        )

    status = (previous.status or "").strip().lower()
    if _EMAIL_STATUS_STATES.get(status) != STATE_FAILED:
        raise CommunicationRetryError(
            CODE_RETRY_NOT_APPLICABLE,
            "This message is not in a failed state, so there is nothing to retry.",
        )

    # The subject and body come from the failed row, so a retry re-sends the
    # message the student was actually promised — not a re-render against a
    # template that may have changed version since.
    replacement = queue_email(
        recipient_email=previous.recipient_email,
        recipient_name=previous.recipient_name or "",
        subject=previous.subject,
        body=previous.body,
    )

    attempt_ids.append(str(replacement.id))
    email = dict(email)
    email["attempts"] = attempt_ids
    channels = dict(channels or {})
    channels[CHANNEL_EMAIL.key] = email
    record["channels"] = channels
    record["retried_at"] = _now_iso()

    metadata = dict(getattr(notification, "metadata", None) or {})
    metadata[COMMUNICATION_METADATA_KEY] = record
    notification.metadata = metadata
    notification.save(update_fields=["metadata", "updated_at"])

    _audit_retry(notification, record, request=request)

    return RetryResult(
        notification=notification, email=replacement, attempts=len(attempt_ids)
    )


def _now_iso() -> str:
    from django.utils import timezone

    return timezone.now().isoformat()


#: The audit action for a student-triggered redelivery (R13.4).
ACTION_COMMUNICATION_RETRIED = "communication.retried"


def _audit_retry(notification, record: Mapping[str, Any], *, request=None) -> None:
    """Record the retry as a command. Never raises."""
    try:
        from apps.catalog.tenant_audit_service import TenantAuditService

        TenantAuditService.record_event(
            action=ACTION_COMMUNICATION_RETRIED,
            entity_type="notification",
            entity_id=getattr(notification, "id", None),
            actor_id=getattr(notification, "user_id", None),
            institution_id=record.get("institution_id"),
            metadata={
                "category": record.get("category"),
                "channel": CHANNEL_EMAIL.key,
                "attempts": len(_email_attempt_ids(record)),
                "retry_limit": COMMUNICATION_RETRY_LIMIT,
                "template_key": record.get("template_key"),
                "application_id": record.get("application_id"),
            },
            request=request,
        )
    except Exception:  # pragma: no cover - audit must never break the command
        logger.warning("Failed to audit communication retry", exc_info=True)


__all__ = [
    "STATE_DELIVERED",
    "STATE_SENT",
    "STATE_QUEUED",
    "STATE_RETRYING",
    "STATE_FAILED",
    "STATE_SUPPRESSED",
    "STATE_NOT_APPLICABLE",
    "STATE_UNKNOWN",
    "DELIVERY_STATES",
    "STATE_DEFINITIONS",
    "UNCLASSIFIED_UNUSED_REASONS",
    "COMMUNICATION_RETRY_LIMIT",
    "CommunicationRetryError",
    "CODE_RETRY_NOT_APPLICABLE",
    "CODE_RETRY_LIMIT_REACHED",
    "CODE_RETRY_UNTRACKED",
    "ChannelState",
    "collect_email_queue_ids",
    "load_email_states",
    "project_channels",
    "project_category",
    "project_delivery",
    "history_vocabulary",
    "RetryResult",
    "retry_email_delivery",
    "ACTION_COMMUNICATION_RETRIED",
]
