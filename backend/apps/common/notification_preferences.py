"""The one notification-preference schema, and the one delivery gate (task 10.1).

Admissions V2 task 10.1 — R13.3, R13.4, R13.8; finding **STU-14**.

WHAT WAS WRONG
--------------
The platform had three disagreeing answers to "what can a student control?":

* ``UserNotificationPreference`` stores nine columns;
* ``NotificationPreferenceSerializer`` accepted nine fields and **persisted every
  one of them**;
* ``NotificationSettings.tsx`` rendered three tiles — "Always on", "Always on",
  "Coming soon" — and a fourth type list the backend never had
  (``whatsapp_enabled`` / ``in_app_enabled`` exist only in the frontend types).

And **nothing read any of it**. ``CommunicationService.send`` dispatched on the
template's own ``channel`` column and never once consulted the student's
preferences, so a student who saved "quiet hours 21:00–06:00" was told the
platform would respect something it has no scheduler for.

THE RULE THIS MODULE ENFORCES
-----------------------------
**The published schema is derived from what the platform can actually send.**

* a **channel** is offered only when a delivery implementation exists, and is
  *configurable* only when turning it off is a real outcome;
* a **category** is offered only when at least one real producer sends it
  (:data:`TEMPLATE_CATEGORIES` / :data:`DIRECT_PRODUCER_CATEGORIES`), and is
  *configurable* only when it is **optional** — a mandatory transactional message
  is not a preference (R13.3);
* every other field name — including one the database has a column for — is
  **rejected** with a stable per-field code, never silently stored.

So there is exactly one place to look to answer "will this message reach this
student, on which channel, and why": :func:`resolve_delivery`. And exactly one
place that performs the delivery: :func:`deliver_message`.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping, Optional

logger = logging.getLogger(__name__)

#: Bumped when the published shape changes. The frontend pins it (drift guard).
SCHEMA_VERSION = 1

# ---------------------------------------------------------------------------
# Rejection codes (stable; the frontend mirrors them)
# ---------------------------------------------------------------------------

#: Top-level error code for a PUT naming anything not writable.
UNSUPPORTED_PREFERENCE = "UNSUPPORTED_PREFERENCE"

CODE_CHANNEL_NOT_IMPLEMENTED = "CHANNEL_NOT_IMPLEMENTED"
CODE_CHANNEL_MANDATORY = "CHANNEL_MANDATORY"
CODE_CATEGORY_NOT_IMPLEMENTED = "CATEGORY_NOT_IMPLEMENTED"
CODE_CATEGORY_MANDATORY = "CATEGORY_MANDATORY"
CODE_FIELD_NOT_IMPLEMENTED = "FIELD_NOT_IMPLEMENTED"
CODE_UNKNOWN_FIELD = "UNKNOWN_FIELD"

REJECTION_CODES = (
    CODE_CHANNEL_NOT_IMPLEMENTED,
    CODE_CHANNEL_MANDATORY,
    CODE_CATEGORY_NOT_IMPLEMENTED,
    CODE_CATEGORY_MANDATORY,
    CODE_FIELD_NOT_IMPLEMENTED,
    CODE_UNKNOWN_FIELD,
)


# ---------------------------------------------------------------------------
# Channels
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Channel:
    """One delivery channel the platform publishes.

    ``configurable`` is false for a channel the student cannot switch off. That
    is a *fact about the platform*, published with its reason, and it is why the
    in-app channel is not a toggle rendered as "Always on" by the browser.
    """

    key: str
    #: A real delivery implementation exists for this channel.
    implemented: bool
    #: The student cannot turn it off (every message uses it).
    mandatory: bool
    #: The stored column, when the student can configure it.
    column: Optional[str]
    default: bool
    definition: str

    @property
    def configurable(self) -> bool:
        return self.implemented and not self.mandatory and self.column is not None


CHANNEL_IN_APP = Channel(
    key="in_app",
    implemented=True,
    mandatory=True,
    column=None,
    default=True,
    definition=(
        "Every message is written to your inbox. This channel cannot be turned "
        "off because the inbox is the platform's record of what you were told."
    ),
)

CHANNEL_EMAIL = Channel(
    key="email",
    implemented=True,
    mandatory=False,
    column="email_enabled",
    default=True,
    definition=(
        "Optional messages are also emailed to your registered address. "
        "Mandatory messages about your application are emailed either way."
    ),
)

#: The channels the platform publishes, in display order.
CHANNELS: tuple[Channel, ...] = (CHANNEL_IN_APP, CHANNEL_EMAIL)

CHANNELS_BY_KEY: dict[str, Channel] = {c.key: c for c in CHANNELS}

#: Channel names that exist somewhere in the codebase or the database but have
#: **no delivery implementation**. A write naming one of these is rejected — the
#: whole point of STU-14 is that the platform must not accept a control it
#: cannot honour.
UNIMPLEMENTED_CHANNEL_FIELDS: dict[str, str] = {
    "sms_enabled": (
        "The platform has no SMS provider configured, so no SMS is ever sent. "
        "The column exists; the delivery does not."
    ),
    "whatsapp_enabled": (
        "The platform has no WhatsApp integration and no column for one."
    ),
}

#: A field naming a channel that *is* implemented but is not the student's to
#: turn off.
MANDATORY_CHANNEL_FIELDS: dict[str, str] = {
    "in_app_enabled": (
        "The inbox is the platform's record of what you were told, so in-app "
        "delivery is always on."
    ),
}


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

KIND_MANDATORY = "mandatory"
KIND_OPTIONAL = "optional"

# ---------------------------------------------------------------------------
# Audience: which channels a message may use at all
# ---------------------------------------------------------------------------
#
# This is the question task 9.5 deferred here. 9.5 scoped amendment recipients to
# the staff holding ``tenant.application.review`` for the application's own
# school, delivered them in-app only, and recorded that "which channels an
# amendment should use belongs to task 10.1's notification-preference schema".
#
# The answer is that **audience decides the channel set, and preferences only
# narrow it**:
#
# * a **student** message may use the inbox and email. Email is the student's own
#   to switch off for an optional category (:data:`CATEGORIES`);
# * a **staff** message uses the **inbox only**. Two reasons, both structural
#   rather than stylistic:
#
#   1. there is no staff preference schema and there must not be a decorative
#      one — the whole of STU-14 is that a published control has to be honoured
#      by a delivery path, and the platform has no per-school staff notification
#      settings to honour. An emailed work item nobody can turn off would be a
#      control the platform *owes* a student-facing screen and does not have;
#   2. a staff work item is addressed by **user id**, not by address. 9.5's
#      resolver deliberately returns ids and never contact details, so emailing a
#      resolved reviewer would mean reintroducing the address lookup that
#      module refuses to perform — and a school's staff roster is exactly the
#      cross-tenant material R3.2 protects.
#
# So the staff channel set is a stated fact with a stated reason, published on
# every staff message's own delivery record, rather than an omission that reads
# as ``unknown`` in the communications history.

AUDIENCE_STUDENT = "student"
AUDIENCE_STAFF = "staff"

AUDIENCES: tuple[str, ...] = (AUDIENCE_STUDENT, AUDIENCE_STAFF)


@dataclass(frozen=True)
class Category:
    """One class of message, and whether the student may switch it off.

    A **mandatory** category is a transactional message about the student's own
    application — a decision, a verification outcome, a deadline that forfeits a
    seat. R13.3 requires it to be distinguishable from an optional notification,
    and the distinction is enforced here rather than described in copy.

    ``audience`` decides which channels the message may use *before* any
    preference is consulted (:data:`AUDIENCE_CHANNELS`). It is a property of the
    message class, not of the call site, so a caller cannot hand a staff category
    to the gate and be given the student channel set.
    """

    key: str
    kind: str
    #: The stored column, when the student can configure it.
    column: Optional[str]
    default: bool
    definition: str
    audience: str = AUDIENCE_STUDENT

    @property
    def mandatory(self) -> bool:
        return self.kind == KIND_MANDATORY

    @property
    def configurable(self) -> bool:
        return (
            self.audience == AUDIENCE_STUDENT
            and not self.mandatory
            and self.column is not None
        )


CATEGORY_APPLICATION_UPDATES = Category(
    key="application_updates",
    kind=KIND_MANDATORY,
    column=None,
    default=True,
    definition=(
        "Decisions, verification outcomes, payment outcomes and deadlines on "
        "your own application. Always sent — missing one of these can cost you "
        "a place."
    ),
)

CATEGORY_PAYMENT_REMINDERS = Category(
    key="payment_reminders",
    kind=KIND_OPTIONAL,
    column="payment_reminders",
    default=True,
    definition="Reminders to complete a payment you chose to defer.",
)

CATEGORY_INTERVIEW_REMINDERS = Category(
    key="interview_reminders",
    kind=KIND_OPTIONAL,
    column="interview_reminders",
    default=True,
    definition=(
        "A reminder in the 24 hours before an interview you have already been "
        "told about."
    ),
)

CATEGORY_STAFF_ACTION_REQUIRED = Category(
    key="staff_action_required",
    kind=KIND_MANDATORY,
    column=None,
    default=True,
    definition=(
        "Work that needs a decision from staff at a school you are assigned to. "
        "Delivered to your inbox only, and not suppressible — it is a queue, not "
        "a subscription."
    ),
    audience=AUDIENCE_STAFF,
)

#: The categories the platform publishes **to a student**, in display order.
#: :meth:`ResolvedPreferences.as_payload` iterates exactly this, so the staff
#: class below never appears on a preference screen — there is nothing there for a
#: student to set, and a staff member has no settings for it either (see the
#: audience note above).
CATEGORIES: tuple[Category, ...] = (
    CATEGORY_APPLICATION_UPDATES,
    CATEGORY_PAYMENT_REMINDERS,
    CATEGORY_INTERVIEW_REMINDERS,
)

#: Message classes addressed to school staff. Not published as preferences; they
#: exist so a staff message's delivery record can state its class and its channel
#: set rather than leaving the communications history to report ``unknown``.
STAFF_CATEGORIES: tuple[Category, ...] = (CATEGORY_STAFF_ACTION_REQUIRED,)

#: Every category the platform can classify a message as.
ALL_CATEGORIES: tuple[Category, ...] = CATEGORIES + STAFF_CATEGORIES

#: Lookup over **every** category, so the communications history can name a staff
#: message's class. The published preference payload still iterates
#: :data:`CATEGORIES`.
CATEGORIES_BY_KEY: dict[str, Category] = {c.key: c for c in ALL_CATEGORIES}

#: The channels each audience's messages may use, before preferences narrow them.
AUDIENCE_CHANNELS: dict[str, tuple[str, ...]] = {
    AUDIENCE_STUDENT: (CHANNEL_IN_APP.key, CHANNEL_EMAIL.key),
    AUDIENCE_STAFF: (CHANNEL_IN_APP.key,),
}

#: Why a channel carries no delivery for a staff message. Stated, so the history
#: reads "this message was not sent on this channel" instead of "the platform
#: cannot say what happened".
AUDIENCE_CHANNEL_REASONS: dict[str, str] = {
    AUDIENCE_STAFF: (
        "Staff work items are delivered to the inbox only: the platform publishes "
        "no staff notification settings, and a resolved recipient is a user id "
        "rather than a contact address."
    ),
}

#: Category-shaped columns with **no producer**: the platform sends no marketing
#: email at all, so a consent toggle for one is the placeholder STU-14 names.
UNIMPLEMENTED_CATEGORY_FIELDS: dict[str, str] = {
    "marketing_emails": (
        "The platform sends no marketing email. There is nothing for this "
        "setting to govern."
    ),
}

#: Stored columns for behaviour the platform does not implement. Accepting these
#: was the most misleading part of the old contract: the endpoint persisted quiet
#: hours and a timezone, and **no delivery path read either**, so a student who
#: saved them was told the platform would hold messages back overnight when it
#: has no deferral scheduler at all.
UNIMPLEMENTED_FIELDS: dict[str, str] = {
    "quiet_hours_start": (
        "The platform has no message-deferral scheduler, so a quiet window "
        "could only drop messages rather than delay them."
    ),
    "quiet_hours_end": (
        "The platform has no message-deferral scheduler, so a quiet window "
        "could only drop messages rather than delay them."
    ),
    "timezone": (
        "No delivery path reads a stored timezone; times are rendered in your "
        "browser's own zone."
    ),
}

#: A field naming a category the student may not switch off.
MANDATORY_CATEGORY_FIELDS: dict[str, str] = {
    CATEGORY_APPLICATION_UPDATES.key: CATEGORY_APPLICATION_UPDATES.definition,
}


# ---------------------------------------------------------------------------
# Producers: which template / task sends which category
# ---------------------------------------------------------------------------

#: Every ``CommunicationService`` template key mapped to its category. The
#: mapping is total over the seeded catalogue
#: (``backend/scripts/2026_05_19_seed_communication_templates.sql``) and a key
#: that is **not** here resolves to mandatory (:func:`category_for_template`) —
#: a message the platform has not classified is delivered, never dropped.
TEMPLATE_CATEGORIES: dict[str, str] = {
    "application_submitted": CATEGORY_APPLICATION_UPDATES.key,
    "application_under_review": CATEGORY_APPLICATION_UPDATES.key,
    "application_approved": CATEGORY_APPLICATION_UPDATES.key,
    "application_rejected": CATEGORY_APPLICATION_UPDATES.key,
    "condition_assigned": CATEGORY_APPLICATION_UPDATES.key,
    "condition_verified": CATEGORY_APPLICATION_UPDATES.key,
    "amendment_reviewed": CATEGORY_APPLICATION_UPDATES.key,
    "document_verified": CATEGORY_APPLICATION_UPDATES.key,
    "document_rejected": CATEGORY_APPLICATION_UPDATES.key,
    "enrollment_confirmed": CATEGORY_APPLICATION_UPDATES.key,
    "enrollment_expired": CATEGORY_APPLICATION_UPDATES.key,
    # A missed enrollment deadline forfeits the seat, so its reminder is
    # transactional rather than optional.
    "enrollment_confirmation_reminder": CATEGORY_APPLICATION_UPDATES.key,
    "fee_waiver_granted": CATEGORY_APPLICATION_UPDATES.key,
    "payment_verified": CATEGORY_APPLICATION_UPDATES.key,
    "payment_rejected": CATEGORY_APPLICATION_UPDATES.key,
    "payment_expired": CATEGORY_APPLICATION_UPDATES.key,
    "reviewer_assigned": CATEGORY_APPLICATION_UPDATES.key,
    "waitlist_position_assigned": CATEGORY_APPLICATION_UPDATES.key,
    # The one optional template in the seeded catalogue.
    "deferred_payment_reminder": CATEGORY_PAYMENT_REMINDERS.key,
}

#: Producers that do not go through a template but still send a **category** the
#: student can switch off. These must call :func:`deliver_message` — otherwise
#: the preference is decorative for that message. Drift-guarded.
DIRECT_PRODUCER_CATEGORIES: dict[str, str] = {
    "interview_reminder": CATEGORY_INTERVIEW_REMINDERS.key,
    # admissions-v2 task 10.2 (R13.9, STU-16): the condition deadline reminder.
    # **Mandatory**, unlike the interview reminder: a missed condition deadline
    # auto-rejects the application, so it is a transactional message about the
    # student's own place rather than a courtesy the student may switch off. It is
    # a direct producer rather than a template because ``condition_reminder`` has
    # no seeded ``communication_templates`` row — the body is rendered by the
    # producer, and this map is what classifies it for the gate and the history.
    "condition_reminder": CATEGORY_APPLICATION_UPDATES.key,
    # admissions-v2 task 10.4 (R13.5, STU-18): the official document a student
    # asked to be emailed. **Mandatory** — the student explicitly requested this
    # delivery, so a preference is not the right instrument to drop it, and the
    # document it points at is a record of a decision about their own place. It is
    # a direct producer because the body comes from the canonical email component
    # system (``render_message("official_document", …)``) rather than a seeded
    # ``communication_templates`` row.
    "official_document": CATEGORY_APPLICATION_UPDATES.key,
}


def category_for_template(template_key: str) -> Category:
    """The category a template belongs to.

    An unmapped key resolves to the **mandatory** category on purpose: a new
    template must be delivered, not silently suppressed by a preference nobody
    mapped it to.
    """
    return CATEGORIES_BY_KEY.get(
        TEMPLATE_CATEGORIES.get(template_key, ""), CATEGORY_APPLICATION_UPDATES
    )


def resolve_category(category: str | Category | None) -> Category:
    """Coerce a category key (or instance) to a published :class:`Category`."""
    if isinstance(category, Category):
        return category
    return CATEGORIES_BY_KEY.get(category or "", CATEGORY_APPLICATION_UPDATES)


# ---------------------------------------------------------------------------
# Reading a student's stored preferences
# ---------------------------------------------------------------------------

#: Reasons a channel was not used for one message. Published on the message so
#: the communications history can say *why* rather than showing a blank.
SUPPRESSED_BY_PREFERENCE = "suppressed_by_preference"
NO_RECIPIENT = "no_recipient"
#: The channel is not in this message class's audience channel set at all — so it
#: is not a suppression the recipient could reverse, and not an untracked delivery.
NOT_IN_AUDIENCE_CHANNELS = "not_in_audience_channels"

CHANNEL_UNUSED_REASONS: tuple[str, ...] = (
    SUPPRESSED_BY_PREFERENCE,
    NO_RECIPIENT,
    NOT_IN_AUDIENCE_CHANNELS,
)


def _history_vocabulary() -> dict[str, Any]:
    """The delivery-state vocabulary, imported lazily.

    :mod:`apps.common.communication_history` owns the state names because it is
    what classifies them; this module owns the *published schema* and so is where
    the vocabulary is read from. The import is deferred because the dependency
    runs the other way at module scope (the history imports the channels and
    categories from here), and a state vocabulary that lived in two modules would
    be exactly the drift this task exists to remove.
    """
    from apps.common.communication_history import history_vocabulary

    return history_vocabulary()


@dataclass(frozen=True)
class ResolvedPreferences:
    """A student's effective preferences, with every published key present."""

    user_id: str
    channels: Mapping[str, bool]
    categories: Mapping[str, bool]
    #: True when no stored row exists, so these are the published defaults.
    is_default: bool = False

    def channel_enabled(self, channel_key: str) -> bool:
        channel = CHANNELS_BY_KEY.get(channel_key)
        if channel is None:
            return False
        if channel.mandatory:
            return True
        return bool(self.channels.get(channel_key, channel.default))

    def category_enabled(self, category: Category) -> bool:
        if category.mandatory:
            return True
        return bool(self.categories.get(category.key, category.default))

    def allows(self, category: Category, channel_key: str) -> bool:
        """Whether one message on one channel reaches this recipient.

        The audience's channel set is checked **first**: a preference can only
        narrow what the message class is allowed to use, never widen it. A
        **mandatory** category then ignores both the category toggle and the
        channel toggle — an admissions decision is not suppressible. An optional
        category needs its own toggle *and* the channel's.
        """
        channel = CHANNELS_BY_KEY.get(channel_key)
        if channel is None or not channel.implemented:
            return False
        if channel_key not in AUDIENCE_CHANNELS.get(category.audience, ()):
            return False
        if category.mandatory:
            return True
        return self.category_enabled(category) and self.channel_enabled(channel_key)

    def as_payload(self) -> dict[str, Any]:
        """The published GET shape. No column is echoed that is not writable."""
        return {
            "schema_version": SCHEMA_VERSION,
            "is_default": self.is_default,
            "channels": [
                {
                    "key": c.key,
                    "enabled": self.channel_enabled(c.key),
                    "configurable": c.configurable,
                    "mandatory": c.mandatory,
                    "field": c.column,
                    "definition": c.definition,
                }
                for c in CHANNELS
            ],
            "categories": [
                {
                    "key": c.key,
                    "enabled": self.category_enabled(c),
                    "configurable": c.configurable,
                    "kind": c.kind,
                    "field": c.column,
                    "definition": c.definition,
                }
                for c in CATEGORIES
            ],
            "writable_fields": list(WRITABLE_FIELDS),
            "unsupported_fields": [
                {"field": name, "code": code, "reason": reason}
                for name, code, reason in UNSUPPORTED_FIELD_TABLE
            ],
            # The delivery-state vocabulary the communications history renders.
            # It lives here rather than on every page of the inbox because the
            # notification list is a registered paginated envelope and because a
            # constant does not belong in a page payload (see
            # ``communication_history.history_vocabulary``).
            **_history_vocabulary(),
        }


def _defaults() -> tuple[dict[str, bool], dict[str, bool]]:
    channels = {c.key: c.default for c in CHANNELS}
    categories = {c.key: c.default for c in CATEGORIES}
    return channels, categories


def resolve_preferences(user_id) -> ResolvedPreferences:
    """The effective preferences for ``user_id``.

    A missing row is the published defaults, flagged ``is_default`` — the read
    never invents a stored value, and never reports a column the schema does not
    publish. A lookup failure also resolves to defaults, because the platform
    must **deliver** when it cannot read a preference, not go silent.
    """
    channels, categories = _defaults()
    is_default = True

    try:
        from apps.common.models import UserNotificationPreference

        row = UserNotificationPreference.objects.filter(user_id=user_id).first()
    except Exception:  # pragma: no cover - defensive; delivery must not break
        logger.warning(
            "Notification preference lookup failed for %s — using published defaults",
            user_id,
            exc_info=True,
        )
        row = None

    if row is not None:
        is_default = False
        for channel in CHANNELS:
            if channel.column:
                stored = getattr(row, channel.column, None)
                channels[channel.key] = channel.default if stored is None else bool(stored)
        for category in CATEGORIES:
            if category.column:
                stored = getattr(row, category.column, None)
                categories[category.key] = (
                    category.default if stored is None else bool(stored)
                )

    return ResolvedPreferences(
        user_id=str(user_id),
        channels=channels,
        categories=categories,
        is_default=is_default,
    )


# ---------------------------------------------------------------------------
# Writing: what may be written, and why everything else is refused
# ---------------------------------------------------------------------------

#: The only field names a PUT may carry. Derived from the published schema, so a
#: channel or category that stops being configurable stops being writable.
WRITABLE_FIELDS: tuple[str, ...] = tuple(
    [c.column for c in CHANNELS if c.configurable and c.column]
    + [c.column for c in CATEGORIES if c.configurable and c.column]
)

#: Every refused field name with its stable code and stated reason. Published on
#: the read so a client can explain a rejection without guessing.
UNSUPPORTED_FIELD_TABLE: tuple[tuple[str, str, str], ...] = tuple(
    [
        (name, CODE_CHANNEL_NOT_IMPLEMENTED, reason)
        for name, reason in UNIMPLEMENTED_CHANNEL_FIELDS.items()
    ]
    + [
        (name, CODE_CHANNEL_MANDATORY, reason)
        for name, reason in MANDATORY_CHANNEL_FIELDS.items()
    ]
    + [
        (name, CODE_CATEGORY_NOT_IMPLEMENTED, reason)
        for name, reason in UNIMPLEMENTED_CATEGORY_FIELDS.items()
    ]
    + [
        (name, CODE_CATEGORY_MANDATORY, reason)
        for name, reason in MANDATORY_CATEGORY_FIELDS.items()
    ]
    + [
        (name, CODE_FIELD_NOT_IMPLEMENTED, reason)
        for name, reason in UNIMPLEMENTED_FIELDS.items()
    ]
)

_UNSUPPORTED_BY_FIELD: dict[str, tuple[str, str]] = {
    name: (code, reason) for name, code, reason in UNSUPPORTED_FIELD_TABLE
}


@dataclass
class PreferenceWrite:
    """The outcome of validating one PUT body."""

    updates: dict[str, bool] = field(default_factory=dict)
    rejected: list[dict[str, str]] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.rejected


def validate_write(payload: Mapping[str, Any] | None) -> PreferenceWrite:
    """Validate a preference PUT body against the published schema.

    Every field is classified: writable, refused with a stated reason, or
    unknown. Nothing is silently dropped and nothing unsupported is stored, so a
    student is never told the platform will do something it will not.
    """
    result = PreferenceWrite()
    body = dict(payload or {})

    for name, value in body.items():
        if name in WRITABLE_FIELDS:
            if isinstance(value, bool):
                result.updates[name] = value
                continue
            result.rejected.append(
                {
                    "field": name,
                    "code": CODE_UNKNOWN_FIELD,
                    "reason": "This setting is a true/false switch.",
                }
            )
            continue

        refusal = _UNSUPPORTED_BY_FIELD.get(name)
        if refusal is not None:
            code, reason = refusal
            result.rejected.append({"field": name, "code": code, "reason": reason})
            continue

        result.rejected.append(
            {
                "field": name,
                "code": CODE_UNKNOWN_FIELD,
                "reason": "This platform publishes no such notification setting.",
            }
        )

    return result


def apply_write(user_id, updates: Mapping[str, bool]) -> ResolvedPreferences:
    """Persist validated updates and return the re-resolved preferences.

    Only the writable columns are touched. The unsupported columns keep whatever
    the pre-10.1 endpoint left in them — this task refuses to *accept* them, it
    does not rewrite history in the student's row.
    """
    from apps.common.models import UserNotificationPreference

    if updates:
        UserNotificationPreference.objects.update_or_create(
            user_id=user_id, defaults=dict(updates)
        )
    return resolve_preferences(user_id)


# ---------------------------------------------------------------------------
# The one delivery gate
# ---------------------------------------------------------------------------

#: The metadata key every delivered message carries on its ``Notification`` row.
#: ``Notification.metadata`` is an existing jsonb column, so the delivery record
#: needed no migration.
COMMUNICATION_METADATA_KEY = "communication"


@dataclass(frozen=True)
class ChannelDecision:
    channel: str
    used: bool
    reason: Optional[str] = None


@dataclass(frozen=True)
class DeliveryDecision:
    """Which channels one message will use for one student, and why."""

    category: Category
    channels: tuple[ChannelDecision, ...]

    def used(self, channel_key: str) -> bool:
        return any(d.channel == channel_key and d.used for d in self.channels)

    def reason(self, channel_key: str) -> Optional[str]:
        for decision in self.channels:
            if decision.channel == channel_key:
                return decision.reason
        return None

    def as_payload(self) -> dict[str, Any]:
        return {
            "category": self.category.key,
            "kind": self.category.kind,
            "audience": self.category.audience,
            "channels": {
                d.channel: {"used": d.used, **({"reason": d.reason} if d.reason else {})}
                for d in self.channels
            },
        }


def resolve_delivery(
    user_id,
    category: str | Category,
    *,
    has_recipient_email: bool = True,
    preferences: Optional[ResolvedPreferences] = None,
) -> DeliveryDecision:
    """The single answer to "will this message reach this student, and how".

    Called by :func:`deliver_message`; exposed separately so a caller can decide
    whether to render an email body at all.
    """
    resolved_category = resolve_category(category)
    audience_channels = AUDIENCE_CHANNELS.get(resolved_category.audience, ())
    prefs = preferences or resolve_preferences(user_id)

    decisions: list[ChannelDecision] = [
        # The inbox is mandatory: it is the platform's record of what the
        # recipient was told, which is what R13.4's history reads. It is in every
        # audience's channel set for exactly that reason.
        ChannelDecision(channel=CHANNEL_IN_APP.key, used=True)
    ]

    if CHANNEL_EMAIL.key not in audience_channels:
        # Not the recipient's setting and not a tracking gap: this message class
        # has no email channel at all.
        decisions.append(
            ChannelDecision(
                channel=CHANNEL_EMAIL.key,
                used=False,
                reason=NOT_IN_AUDIENCE_CHANNELS,
            )
        )
    elif not prefs.allows(resolved_category, CHANNEL_EMAIL.key):
        decisions.append(
            ChannelDecision(
                channel=CHANNEL_EMAIL.key, used=False, reason=SUPPRESSED_BY_PREFERENCE
            )
        )
    elif not has_recipient_email:
        decisions.append(
            ChannelDecision(channel=CHANNEL_EMAIL.key, used=False, reason=NO_RECIPIENT)
        )
    else:
        decisions.append(ChannelDecision(channel=CHANNEL_EMAIL.key, used=True))

    return DeliveryDecision(category=resolved_category, channels=tuple(decisions))


@dataclass
class DeliveredMessage:
    """What :func:`deliver_message` persisted."""

    decision: DeliveryDecision
    notification: Any = None
    email: Any = None


def _communication_metadata(
    decision: DeliveryDecision,
    *,
    template_key: Optional[str],
    application_id: Optional[Any],
    institution_id: Optional[Any],
    email_queue_id: Optional[Any],
) -> dict[str, Any]:
    """The durable delivery record stored on the notification.

    Carries ids and states only — never the recipient's address, never a
    provider payload, never an SMTP response (R13.4).
    """
    payload = decision.as_payload()
    payload["schema_version"] = SCHEMA_VERSION
    if template_key:
        payload["template_key"] = template_key
    if application_id:
        payload["application_id"] = str(application_id)
    if institution_id:
        payload["institution_id"] = str(institution_id)
    email = payload["channels"].get(CHANNEL_EMAIL.key)
    if email is not None and email_queue_id:
        email["attempts"] = [str(email_queue_id)]
    return {COMMUNICATION_METADATA_KEY: payload}


def deliver_message(
    *,
    user_id,
    category: str | Category,
    title: str,
    message: str,
    email_subject: Optional[str] = None,
    email_body: Optional[str] = None,
    recipient_email: Optional[str] = None,
    recipient_name: Optional[str] = None,
    action_url: Optional[str] = None,
    idempotency_key: Optional[str] = None,
    template_key: Optional[str] = None,
    application_id: Optional[Any] = None,
    institution_id: Optional[Any] = None,
    extra_metadata: Optional[Mapping[str, Any]] = None,
) -> DeliveredMessage:
    """Deliver one message to one student through the durable outbox.

    * the in-app notification is always written (mandatory channel);
    * the email is queued **only** when :func:`resolve_delivery` allows it, and
      the decision — including the reason it was not — is recorded on the
      notification's ``metadata`` so the communications history can show
      delivery state and channel without a second source of truth;
    * both writes go through :mod:`apps.common.outbox`, so each one commits an
      ``OutboxEvent`` and the email is dispatched on commit rather than inline.

    Never raises: a communication failure must not fail the command that caused
    it (the platform's existing best-effort contract), and the durable rows are
    what recovery reads.
    """
    from apps.common.outbox import create_notification, queue_email

    can_email = bool(recipient_email and email_subject and email_body)
    decision = resolve_delivery(
        user_id, category, has_recipient_email=can_email
    )

    email_record = None
    if decision.used(CHANNEL_EMAIL.key):
        try:
            email_record = queue_email(
                recipient_email=str(recipient_email),
                recipient_name=recipient_name or "",
                subject=str(email_subject),
                body=str(email_body),
            )
        except Exception:
            logger.warning(
                "Email queueing failed for %s (%s) — the in-app message still lands",
                user_id,
                template_key or category,
                exc_info=True,
            )

    metadata = _communication_metadata(
        decision,
        template_key=template_key,
        application_id=application_id,
        institution_id=institution_id,
        email_queue_id=getattr(email_record, "id", None),
    )
    if extra_metadata:
        metadata.update(dict(extra_metadata))

    notification = None
    try:
        notification = create_notification(
            user_id=user_id,
            title=title,
            message=message,
            type="info",
            priority="normal",
            action_url=action_url,
            metadata=metadata,
            idempotency_key=idempotency_key,
        )
    except Exception:
        logger.warning(
            "Notification create failed for %s (%s)",
            user_id,
            template_key or category,
            exc_info=True,
        )

    return DeliveredMessage(
        decision=decision, notification=notification, email=email_record
    )


def staff_delivery_metadata(
    *,
    category: str | Category = CATEGORY_STAFF_ACTION_REQUIRED,
    application_id: Optional[Any] = None,
    institution_id: Optional[Any] = None,
    template_key: Optional[str] = None,
) -> dict[str, Any]:
    """The delivery record for one **staff** message, for a bulk fan-out.

    A staff work item is written by
    :func:`apps.common.outbox.create_notifications_bulk` — one insert for the
    whole resolved recipient set, with a per-recipient idempotency key (9.5 §5.4)
    — so it cannot go through :func:`deliver_message`, which delivers to one
    recipient at a time. What it *must* still carry is the same delivery record,
    for one reason: without it the communications history reports the email
    channel as ``unknown``, whose published definition is "this message predates
    delivery tracking". That would be false. Email was never applicable, and the
    record says so with a stated reason.

    No preference is read, and none should be: the staff channel set is a fact
    about the audience (:data:`AUDIENCE_CHANNELS`), and the platform publishes no
    staff settings to consult. The record is identical for every recipient, which
    is why it is a value rather than a per-user resolution.
    """
    resolved = resolve_category(category)
    decision = DeliveryDecision(
        category=resolved,
        channels=tuple(
            ChannelDecision(channel=channel.key, used=True)
            if channel.key in AUDIENCE_CHANNELS.get(resolved.audience, ())
            else ChannelDecision(
                channel=channel.key, used=False, reason=NOT_IN_AUDIENCE_CHANNELS
            )
            for channel in CHANNELS
        ),
    )
    return _communication_metadata(
        decision,
        template_key=template_key,
        application_id=application_id,
        institution_id=institution_id,
        email_queue_id=None,
    )


def optional_category_keys() -> Iterable[str]:
    """The published categories a student may switch off."""
    return (c.key for c in CATEGORIES if c.configurable)


__all__ = [
    "SCHEMA_VERSION",
    "UNSUPPORTED_PREFERENCE",
    "CODE_CHANNEL_NOT_IMPLEMENTED",
    "CODE_CHANNEL_MANDATORY",
    "CODE_CATEGORY_NOT_IMPLEMENTED",
    "CODE_CATEGORY_MANDATORY",
    "CODE_FIELD_NOT_IMPLEMENTED",
    "CODE_UNKNOWN_FIELD",
    "REJECTION_CODES",
    "Channel",
    "CHANNELS",
    "CHANNELS_BY_KEY",
    "CHANNEL_IN_APP",
    "CHANNEL_EMAIL",
    "UNIMPLEMENTED_CHANNEL_FIELDS",
    "MANDATORY_CHANNEL_FIELDS",
    "Category",
    "CATEGORIES",
    "STAFF_CATEGORIES",
    "ALL_CATEGORIES",
    "CATEGORIES_BY_KEY",
    "CATEGORY_APPLICATION_UPDATES",
    "CATEGORY_PAYMENT_REMINDERS",
    "CATEGORY_INTERVIEW_REMINDERS",
    "CATEGORY_STAFF_ACTION_REQUIRED",
    "AUDIENCE_STUDENT",
    "AUDIENCE_STAFF",
    "AUDIENCES",
    "AUDIENCE_CHANNELS",
    "AUDIENCE_CHANNEL_REASONS",
    "NOT_IN_AUDIENCE_CHANNELS",
    "CHANNEL_UNUSED_REASONS",
    "staff_delivery_metadata",
    "KIND_MANDATORY",
    "KIND_OPTIONAL",
    "UNIMPLEMENTED_CATEGORY_FIELDS",
    "UNIMPLEMENTED_FIELDS",
    "MANDATORY_CATEGORY_FIELDS",
    "TEMPLATE_CATEGORIES",
    "DIRECT_PRODUCER_CATEGORIES",
    "category_for_template",
    "resolve_category",
    "ResolvedPreferences",
    "resolve_preferences",
    "WRITABLE_FIELDS",
    "UNSUPPORTED_FIELD_TABLE",
    "PreferenceWrite",
    "validate_write",
    "apply_write",
    "COMMUNICATION_METADATA_KEY",
    "SUPPRESSED_BY_PREFERENCE",
    "NO_RECIPIENT",
    "ChannelDecision",
    "DeliveryDecision",
    "resolve_delivery",
    "DeliveredMessage",
    "deliver_message",
    "optional_category_keys",
]
