"""One notification-preference schema, one delivery gate, one history (task 10.1).

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 10.1 —
              "Consolidate notifications and communications". This file is the
              backend half of the task's ``_Evidence:`` line: *preference
              persistence, mandatory-message, delivery/retry* (the mobile-nav
              half is a browser journey, because a navigation item is not
              observable from an endpoint).
Requirements: **R13.3** (interview scheduling notifies through durable
              communication history), **R13.4** (communication history shows
              delivery state and channel without exposing secrets or internal
              provider payloads; retry is an authorized audited command),
              **R13.8** (one persisted preference schema; unknown channels are
              rejected; the mobile navigation exposes a single
              communications/inbox history rather than static placeholder
              settings).
Findings:     **STU-14** (preferences were fetched and then rendered as static
              "Always on / Coming soon" tiles, the frontend fields did not match
              the backend, and nothing read a stored preference), **STU-24**
              (student pages bypassed tenant context with hardcoded support and
              branding values — asserted on the frontend, where the copy lives).

The claims this file makes
-------------------------
1. **A published control is a control that is honoured.** Every writable field
   maps to a channel or category the delivery gate actually reads, and every
   refused field is refused with a stated reason instead of stored.
2. **A mandatory message is not a preference.** No stored setting can suppress a
   decision, a verification outcome or a deadline — on any channel.
3. **An optional message is genuinely optional**, and switching it off is
   visible in the delivery record rather than silent.
4. **The inbox is the record.** In-app delivery cannot be switched off, the
   history states per-channel delivery state, and it publishes no address, no
   provider text and no SMTP response.
5. **Retry is a command**: owner-scoped, state-guarded, bounded, durable through
   the outbox, and audited.
6. **The registered envelopes did not move.** The notification list keeps
   ``{page, pageSize, totalCount, results}``; the vocabulary lives on the schema
   surface.
"""

from __future__ import annotations

import ast
import inspect
import pathlib
import uuid

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.common import communication_history as history
from apps.common import notification_preferences as prefs
from apps.common.models import (
    AuditLog,
    EmailQueue,
    Notification,
    OutboxEvent,
    UserNotificationPreference,
)
from tests.tenant_fixtures import build_profile

PREFERENCES_URL = "/api/v1/notifications/preferences/"
NOTIFICATIONS_URL = "/api/v1/notifications/"


def retry_url(notification_id) -> str:
    return f"/api/v1/notifications/{notification_id}/retry/"


def _client_for(profile) -> APIClient:
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(profile.id),
                "email": profile.email,
                "role": profile.role,
                "first_name": profile.first_name,
                "last_name": profile.last_name,
            }
        )
    )
    return client


def _delivered(user_id, *, category, email="student@example-school.edu.zm", **kwargs):
    """Deliver one message through the gate and return the delivery result."""
    return prefs.deliver_message(
        user_id=user_id,
        category=category,
        title="Message title",
        message="Message body",
        email_subject="Message subject",
        email_body="<p>Message body</p>",
        recipient_email=email,
        recipient_name="Test Student",
        **kwargs,
    )


def _source(module) -> str:
    return pathlib.Path(inspect.getfile(module)).read_text()


# ---------------------------------------------------------------------------
# 1. The published schema is derived from what the platform can send
# ---------------------------------------------------------------------------


class TestThePublishedSchemaIsDerivedFromDelivery:
    """R13.8: a control exists only when a delivery path honours it."""

    def test_every_writable_field_belongs_to_a_configurable_channel_or_category(self):
        configurable = {c.column for c in prefs.CHANNELS if c.configurable}
        configurable |= {c.column for c in prefs.CATEGORIES if c.configurable}
        assert set(prefs.WRITABLE_FIELDS) == configurable
        assert None not in configurable

    def test_a_channel_is_configurable_only_when_implemented_and_optional(self):
        for channel in prefs.CHANNELS:
            if channel.configurable:
                assert channel.implemented and not channel.mandatory
                assert channel.column
            else:
                assert channel.mandatory or not channel.implemented or not channel.column

    def test_in_app_is_implemented_and_mandatory_so_it_is_not_a_toggle(self):
        assert prefs.CHANNEL_IN_APP.implemented is True
        assert prefs.CHANNEL_IN_APP.mandatory is True
        assert prefs.CHANNEL_IN_APP.configurable is False
        assert prefs.CHANNEL_IN_APP.column is None
        assert prefs.CHANNEL_IN_APP.key not in prefs.WRITABLE_FIELDS

    def test_every_published_channel_and_category_ships_a_definition(self):
        for item in (*prefs.CHANNELS, *prefs.CATEGORIES):
            assert item.definition.strip(), item.key

    def test_every_category_is_mandatory_or_optional_and_nothing_else(self):
        assert {c.kind for c in prefs.CATEGORIES} <= {
            prefs.KIND_MANDATORY,
            prefs.KIND_OPTIONAL,
        }
        assert any(c.mandatory for c in prefs.CATEGORIES)
        assert any(c.configurable for c in prefs.CATEGORIES)

    def test_every_optional_category_has_a_real_producer(self):
        """A switch with nothing behind it is the placeholder STU-14 names."""
        produced = set(prefs.TEMPLATE_CATEGORIES.values()) | set(
            prefs.DIRECT_PRODUCER_CATEGORIES.values()
        )
        for category in prefs.CATEGORIES:
            if category.configurable:
                assert category.key in produced, category.key

    def test_no_unsupported_field_is_also_writable(self):
        refused = {name for name, _code, _reason in prefs.UNSUPPORTED_FIELD_TABLE}
        assert refused.isdisjoint(set(prefs.WRITABLE_FIELDS))

    def test_every_refusal_carries_a_published_code_and_a_reason(self):
        for name, code, reason in prefs.UNSUPPORTED_FIELD_TABLE:
            assert code in prefs.REJECTION_CODES, name
            assert reason.strip(), name

    def test_the_stored_columns_the_schema_refuses_are_named_explicitly(self):
        """The DB has nine columns; only three are the student's to set.

        The other six are named in the refusal table with a reason, so a reader
        can tell "not implemented" from "not yours" from "does not exist".
        """
        model_columns = {
            f.name
            for f in UserNotificationPreference._meta.get_fields()
            if f.name not in {"id", "user", "created_at", "updated_at"}
        }
        accounted = set(prefs.WRITABLE_FIELDS) | {
            name for name, _c, _r in prefs.UNSUPPORTED_FIELD_TABLE
        }
        assert model_columns <= accounted, model_columns - accounted


# ---------------------------------------------------------------------------
# 2. Validation: refused with a reason, never silently stored
# ---------------------------------------------------------------------------


class TestWriteValidation:
    """R13.8: unknown channels SHALL be rejected."""

    @pytest.mark.parametrize(
        "field,code",
        [
            ("sms_enabled", prefs.CODE_CHANNEL_NOT_IMPLEMENTED),
            ("whatsapp_enabled", prefs.CODE_CHANNEL_NOT_IMPLEMENTED),
            ("in_app_enabled", prefs.CODE_CHANNEL_MANDATORY),
            ("marketing_emails", prefs.CODE_CATEGORY_NOT_IMPLEMENTED),
            ("application_updates", prefs.CODE_CATEGORY_MANDATORY),
            ("quiet_hours_start", prefs.CODE_FIELD_NOT_IMPLEMENTED),
            ("quiet_hours_end", prefs.CODE_FIELD_NOT_IMPLEMENTED),
            ("timezone", prefs.CODE_FIELD_NOT_IMPLEMENTED),
            ("teleport_enabled", prefs.CODE_UNKNOWN_FIELD),
        ],
    )
    def test_each_unsupported_field_is_refused_with_its_own_code(self, field, code):
        write = prefs.validate_write({field: True})
        assert write.ok is False
        assert write.updates == {}
        assert [r["field"] for r in write.rejected] == [field]
        assert write.rejected[0]["code"] == code
        assert write.rejected[0]["reason"].strip()

    def test_whatsapp_and_in_app_are_refused_for_different_reasons(self):
        """STU-14 named both; they are not the same defect.

        ``whatsapp_enabled`` has no implementation *and* no column;
        ``in_app_enabled`` is implemented and deliberately not switchable.
        Collapsing them into one "unknown field" answer would lose that.
        """
        codes = {
            field: prefs.validate_write({field: True}).rejected[0]["code"]
            for field in ("whatsapp_enabled", "in_app_enabled")
        }
        assert codes["whatsapp_enabled"] == prefs.CODE_CHANNEL_NOT_IMPLEMENTED
        assert codes["in_app_enabled"] == prefs.CODE_CHANNEL_MANDATORY

    def test_a_writable_field_with_a_non_boolean_value_is_refused(self):
        write = prefs.validate_write({"email_enabled": "yes"})
        assert write.ok is False
        assert write.updates == {}

    def test_one_bad_field_refuses_the_whole_write(self):
        """Partial acceptance would leave the student unable to tell what stuck."""
        write = prefs.validate_write({"email_enabled": False, "sms_enabled": True})
        assert write.ok is False
        assert write.updates == {"email_enabled": False}
        assert [r["field"] for r in write.rejected] == ["sms_enabled"]

    def test_every_writable_field_is_accepted(self):
        body = {name: False for name in prefs.WRITABLE_FIELDS}
        write = prefs.validate_write(body)
        assert write.ok is True
        assert write.updates == body

    def test_an_empty_body_is_accepted_and_changes_nothing(self):
        write = prefs.validate_write({})
        assert write.ok is True
        assert write.updates == {}


# ---------------------------------------------------------------------------
# 3. The endpoint: real GET/PUT controls
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPreferenceEndpoint:
    """R13.8: one persisted schema, with real controls."""

    def test_get_publishes_the_schema_with_defaults_and_says_they_are_defaults(self):
        profile = build_profile(role="student")
        response = _client_for(profile).get(PREFERENCES_URL)

        assert response.status_code == 200
        data = response.data["data"]
        assert data["schema_version"] == prefs.SCHEMA_VERSION
        assert data["is_default"] is True
        assert [c["key"] for c in data["channels"]] == [c.key for c in prefs.CHANNELS]
        assert [c["key"] for c in data["categories"]] == [
            c.key for c in prefs.CATEGORIES
        ]
        assert data["writable_fields"] == list(prefs.WRITABLE_FIELDS)

    def test_the_read_publishes_no_column_it_will_not_accept(self):
        profile = build_profile(role="student")
        data = _client_for(profile).get(PREFERENCES_URL).data["data"]

        published_fields = {c["field"] for c in data["channels"]} | {
            c["field"] for c in data["categories"]
        }
        published_fields.discard(None)
        assert published_fields == set(prefs.WRITABLE_FIELDS)
        for name, _code, _reason in prefs.UNSUPPORTED_FIELD_TABLE:
            assert name not in published_fields

    def test_the_read_explains_every_refusal_so_a_client_need_not_guess(self):
        profile = build_profile(role="student")
        data = _client_for(profile).get(PREFERENCES_URL).data["data"]

        assert {f["field"] for f in data["unsupported_fields"]} == {
            name for name, _c, _r in prefs.UNSUPPORTED_FIELD_TABLE
        }
        for entry in data["unsupported_fields"]:
            assert entry["code"] in prefs.REJECTION_CODES
            assert entry["reason"].strip()

    def test_put_persists_and_the_next_get_reads_it_back(self):
        profile = build_profile(role="student")
        client = _client_for(profile)

        response = client.put(
            PREFERENCES_URL, {"email_enabled": False}, format="json"
        )
        assert response.status_code == 200
        assert response.data["data"]["is_default"] is False

        email = next(
            c for c in client.get(PREFERENCES_URL).data["data"]["channels"]
            if c["key"] == prefs.CHANNEL_EMAIL.key
        )
        assert email["enabled"] is False
        stored = UserNotificationPreference.objects.get(user_id=profile.id)
        assert stored.email_enabled is False

    def test_put_is_idempotent(self):
        profile = build_profile(role="student")
        client = _client_for(profile)
        for _ in range(2):
            assert (
                client.put(
                    PREFERENCES_URL, {"payment_reminders": False}, format="json"
                ).status_code
                == 200
            )
        assert UserNotificationPreference.objects.filter(user_id=profile.id).count() == 1

    def test_put_refuses_an_unsupported_field_and_stores_nothing(self):
        profile = build_profile(role="student")
        response = _client_for(profile).put(
            PREFERENCES_URL,
            {"email_enabled": False, "whatsapp_enabled": True},
            format="json",
        )

        assert response.status_code == 400
        assert response.data["code"] == prefs.UNSUPPORTED_PREFERENCE
        rejected = response.data["details"]["rejected"]
        assert [r["field"] for r in rejected] == ["whatsapp_enabled"]
        # Nothing was written — not even the field that was valid.
        assert not UserNotificationPreference.objects.filter(
            user_id=profile.id
        ).exists()

    def test_put_refuses_to_switch_off_a_mandatory_category(self):
        profile = build_profile(role="student")
        response = _client_for(profile).put(
            PREFERENCES_URL, {"application_updates": False}, format="json"
        )
        assert response.status_code == 400
        assert (
            response.data["details"]["rejected"][0]["code"]
            == prefs.CODE_CATEGORY_MANDATORY
        )

    def test_the_endpoint_requires_authentication(self):
        assert APIClient().get(PREFERENCES_URL).status_code in (401, 403)

    def test_one_students_write_does_not_reach_another(self):
        a, b = build_profile(role="student"), build_profile(role="student")
        _client_for(a).put(PREFERENCES_URL, {"email_enabled": False}, format="json")

        b_email = next(
            c for c in _client_for(b).get(PREFERENCES_URL).data["data"]["channels"]
            if c["key"] == prefs.CHANNEL_EMAIL.key
        )
        assert b_email["enabled"] is True

    def test_a_pre_10_1_row_holding_retired_values_still_reads(self):
        """Backward data compatibility: the columns stay, the contract narrows."""
        profile = build_profile(role="student")
        UserNotificationPreference.objects.create(
            user_id=profile.id,
            email_enabled=True,
            sms_enabled=True,
            marketing_emails=True,
            timezone="Africa/Lusaka",
            quiet_hours_start="21:00",
            quiet_hours_end="06:00",
        )

        data = _client_for(profile).get(PREFERENCES_URL).data["data"]
        assert data["is_default"] is False
        assert "sms_enabled" not in {c["field"] for c in data["channels"]}
        assert "timezone" not in str(data["channels"]) + str(data["categories"])


# ---------------------------------------------------------------------------
# 4. The delivery gate
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTheDeliveryGate:
    """R13.3/R13.8: the stored preference is what decides delivery."""

    def test_a_mandatory_message_ignores_every_stored_preference(self):
        profile = build_profile(role="student")
        UserNotificationPreference.objects.create(
            user_id=profile.id, email_enabled=False, payment_reminders=False
        )

        result = _delivered(profile.id, category=prefs.CATEGORY_APPLICATION_UPDATES)

        assert result.decision.used(prefs.CHANNEL_IN_APP.key) is True
        assert result.decision.used(prefs.CHANNEL_EMAIL.key) is True
        assert EmailQueue.objects.filter(recipient_email__isnull=False).count() == 1

    def test_an_optional_message_follows_the_channel_switch(self):
        profile = build_profile(role="student")
        UserNotificationPreference.objects.create(
            user_id=profile.id, email_enabled=False
        )

        result = _delivered(profile.id, category=prefs.CATEGORY_PAYMENT_REMINDERS)

        assert result.decision.used(prefs.CHANNEL_EMAIL.key) is False
        assert result.decision.reason(prefs.CHANNEL_EMAIL.key) == (
            prefs.SUPPRESSED_BY_PREFERENCE
        )
        assert EmailQueue.objects.count() == 0

    def test_an_optional_message_follows_its_own_category_switch(self):
        profile = build_profile(role="student")
        UserNotificationPreference.objects.create(
            user_id=profile.id, email_enabled=True, payment_reminders=False
        )

        result = _delivered(profile.id, category=prefs.CATEGORY_PAYMENT_REMINDERS)
        assert result.decision.used(prefs.CHANNEL_EMAIL.key) is False
        # A different optional category is unaffected by that one switch.
        other = _delivered(profile.id, category=prefs.CATEGORY_INTERVIEW_REMINDERS)
        assert other.decision.used(prefs.CHANNEL_EMAIL.key) is True

    def test_the_inbox_message_is_written_even_when_email_is_off(self):
        """The inbox is the platform's record of what the student was told."""
        profile = build_profile(role="student")
        UserNotificationPreference.objects.create(
            user_id=profile.id, email_enabled=False
        )

        _delivered(profile.id, category=prefs.CATEGORY_PAYMENT_REMINDERS)

        assert Notification.objects.filter(user_id=profile.id).count() == 1
        assert EmailQueue.objects.count() == 0

    def test_a_missing_address_is_recorded_as_no_recipient_not_as_a_preference(self):
        profile = build_profile(role="student")
        result = _delivered(
            profile.id, category=prefs.CATEGORY_APPLICATION_UPDATES, email=None
        )
        assert result.decision.used(prefs.CHANNEL_EMAIL.key) is False
        assert result.decision.reason(prefs.CHANNEL_EMAIL.key) == prefs.NO_RECIPIENT

    def test_delivery_writes_a_durable_outbox_row_per_channel(self):
        profile = build_profile(role="student")
        _delivered(profile.id, category=prefs.CATEGORY_APPLICATION_UPDATES)

        assert OutboxEvent.objects.filter(event_type="notification.created").count() == 1
        assert OutboxEvent.objects.filter(event_type="email.queued").count() == 1

    def test_delivery_is_idempotent_on_its_key(self):
        profile = build_profile(role="student")
        key = f"test:{uuid.uuid4()}"
        for _ in range(2):
            _delivered(
                profile.id,
                category=prefs.CATEGORY_APPLICATION_UPDATES,
                idempotency_key=key,
            )
        assert Notification.objects.filter(idempotency_key=key).count() == 1

    def test_an_unclassified_template_is_delivered_not_suppressed(self):
        """A new template nobody mapped must reach the student."""
        profile = build_profile(role="student")
        UserNotificationPreference.objects.create(
            user_id=profile.id, email_enabled=False
        )
        category = prefs.category_for_template("a_template_nobody_mapped")

        assert category.mandatory is True
        result = _delivered(profile.id, category=category)
        assert result.decision.used(prefs.CHANNEL_EMAIL.key) is True

    def test_a_missing_preference_row_resolves_to_the_published_defaults(self):
        profile = build_profile(role="student")
        resolved = prefs.resolve_preferences(profile.id)

        assert resolved.is_default is True
        for channel in prefs.CHANNELS:
            assert resolved.channel_enabled(channel.key) is channel.default

    def test_the_delivery_record_carries_no_address_and_no_provider_text(self):
        """R13.4: no secrets, no internal provider payloads."""
        profile = build_profile(role="student")
        address = "private.person@example-school.edu.zm"
        _delivered(
            profile.id,
            category=prefs.CATEGORY_APPLICATION_UPDATES,
            email=address,
            template_key="payment_verified",
        )

        record = Notification.objects.get(user_id=profile.id).metadata[
            prefs.COMMUNICATION_METADATA_KEY
        ]
        assert address not in str(record)
        assert "smtp" not in str(record).lower()
        assert record["category"] == prefs.CATEGORY_APPLICATION_UPDATES.key
        assert record["template_key"] == "payment_verified"


@pytest.mark.django_db
class TestEveryProducerGoesThroughTheGate:
    """A preference nothing reads is the defect, not the schema."""

    def test_the_template_service_delivers_through_the_gate(self):
        source = _source(
            __import__("apps.common.communication_service", fromlist=["x"])
        )
        called = {
            node.func.attr if isinstance(node.func, ast.Attribute) else node.func.id
            for node in ast.walk(ast.parse(source))
            if isinstance(node, ast.Call)
            and isinstance(node.func, (ast.Name, ast.Attribute))
        }
        assert "deliver_message" in called

    def test_every_direct_producer_names_a_published_category(self):
        for producer, category in prefs.DIRECT_PRODUCER_CATEGORIES.items():
            assert category in prefs.CATEGORIES_BY_KEY, producer

    def test_the_interview_reminder_task_uses_the_gate(self):
        """The only producer of the one category a student can switch off."""
        source = _source(__import__("apps.applications.tasks.interview", fromlist=["x"]))
        assert "deliver_message" in source
        assert "DIRECT_PRODUCER_CATEGORIES" in source

    def test_every_seeded_template_key_is_classified(self):
        """An unmapped key still delivers, but the map should be total."""
        seed = pathlib.Path(
            "scripts/2026_05_19_seed_communication_templates.sql"
        )
        if not seed.exists():
            pytest.skip("template seed script not present in this tree")
        body = seed.read_text()
        unclassified = [
            key
            for key in prefs.TEMPLATE_CATEGORIES
            if f"'{key}'" not in body
        ]
        assert unclassified == [], unclassified


# ---------------------------------------------------------------------------
# 5. The communications history
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTheCommunicationsHistory:
    """R13.4: delivery state and channel, without provider payloads."""

    def test_every_state_ships_a_definition(self):
        assert set(history.STATE_DEFINITIONS) == set(history.DELIVERY_STATES)
        for state, definition in history.STATE_DEFINITIONS.items():
            assert definition.strip(), state

    def test_the_vocabulary_is_published_on_the_schema_surface(self):
        profile = build_profile(role="student")
        data = _client_for(profile).get(PREFERENCES_URL).data["data"]

        assert data["delivery_states"] == list(history.DELIVERY_STATES)
        assert data["delivery_state_definitions"] == dict(history.STATE_DEFINITIONS)
        assert data["retry_limit"] == history.COMMUNICATION_RETRY_LIMIT

    def test_the_notification_list_keeps_its_registered_envelope(self):
        """The paginated contract is ``{page, pageSize, totalCount, results}``."""
        profile = build_profile(role="student")
        _delivered(profile.id, category=prefs.CATEGORY_APPLICATION_UPDATES)

        data = _client_for(profile).get(
            f"{NOTIFICATIONS_URL}?page=1&pageSize=20"
        ).data["data"]
        assert set(data) == {"page", "pageSize", "totalCount", "results"}

    def test_each_message_states_its_category_and_per_channel_delivery(self):
        profile = build_profile(role="student")
        _delivered(profile.id, category=prefs.CATEGORY_APPLICATION_UPDATES)

        row = _client_for(profile).get(NOTIFICATIONS_URL).data["data"]["results"][0]
        assert row["category"] == prefs.CATEGORY_APPLICATION_UPDATES.key
        assert row["kind"] == prefs.KIND_MANDATORY
        by_channel = {c["channel"]: c for c in row["channels"]}
        assert by_channel[prefs.CHANNEL_IN_APP.key]["state"] == history.STATE_DELIVERED
        assert by_channel[prefs.CHANNEL_EMAIL.key]["state"] == history.STATE_QUEUED

    def test_a_suppressed_channel_says_suppressed_rather_than_showing_a_blank(self):
        profile = build_profile(role="student")
        UserNotificationPreference.objects.create(
            user_id=profile.id, email_enabled=False
        )
        _delivered(profile.id, category=prefs.CATEGORY_PAYMENT_REMINDERS)

        row = _client_for(profile).get(NOTIFICATIONS_URL).data["data"]["results"][0]
        email = next(c for c in row["channels"] if c["channel"] == "email")
        assert email["state"] == history.STATE_SUPPRESSED
        assert email["can_retry"] is False

    def test_a_pre_10_1_message_is_unknown_rather_than_reported_healthy(self):
        """ADM-02's lesson: do not invent a healthy default."""
        profile = build_profile(role="student")
        Notification.objects.create(
            user_id=profile.id, title="Old", message="Sent before tracking", type="info"
        )

        row = _client_for(profile).get(NOTIFICATIONS_URL).data["data"]["results"][0]
        email = next(c for c in row["channels"] if c["channel"] == "email")
        assert email["state"] == history.STATE_UNKNOWN
        assert email["can_retry"] is False

    def test_a_failed_email_is_reported_failed_and_offers_a_retry(self):
        profile = build_profile(role="student")
        result = _delivered(profile.id, category=prefs.CATEGORY_APPLICATION_UPDATES)
        EmailQueue.objects.filter(pk=result.email.id).update(
            status="failed", error_message="Both SMTP and Resend failed: 535 auth"
        )

        row = _client_for(profile).get(NOTIFICATIONS_URL).data["data"]["results"][0]
        email = next(c for c in row["channels"] if c["channel"] == "email")
        assert email["state"] == history.STATE_FAILED
        assert email["can_retry"] is True
        assert row["can_retry"] is True

    def test_the_history_never_publishes_provider_text_or_the_address(self):
        profile = build_profile(role="student")
        address = "private.person@example-school.edu.zm"
        result = _delivered(
            profile.id, category=prefs.CATEGORY_APPLICATION_UPDATES, email=address
        )
        EmailQueue.objects.filter(pk=result.email.id).update(
            status="failed", error_message="Both SMTP and Resend failed: 535 auth"
        )

        body = str(_client_for(profile).get(NOTIFICATIONS_URL).data)
        assert address not in body
        assert "SMTP" not in body
        assert "Resend" not in body
        # The provider text itself, not a fragment of it. Asserting the bare
        # substring "535" made this test flaky by construction: the payload
        # carries ISO timestamps with six-digit microseconds, so any run whose
        # clock produced e.g. `...942535+00:00` failed on a digit sequence that
        # is part of a timestamp rather than a provider response code. Observed
        # in 13.6 remediation M3's whole-tree run and reproduced from the
        # assertion output — it passes in isolation and fails on the wall clock,
        # which is the signature of a substring search over rendered time.
        #
        # The property is unchanged and the coverage is wider: the full provider
        # sentence, the SMTP code in the form it is actually written, and the
        # provider names are all asserted absent.
        assert "535 auth" not in body
        assert "Both SMTP and Resend failed" not in body
        assert "error_message" not in body

    def test_a_timestamp_that_is_not_a_datetime_does_not_break_the_read(self):
        """The projection is handed model fields, jsonb strings and serialized rows.

        Assuming ``datetime`` made the student's own inbox answer 500.
        """
        state = history.ChannelState(
            channel="in_app", state=history.STATE_DELIVERED,
            last_attempt_at="2026-01-01T00:00:00Z",
        )
        assert state.as_payload()["last_attempt_at"] == "2026-01-01T00:00:00Z"

    def test_the_page_costs_one_extra_query_not_one_per_row(self):
        from django.test.utils import CaptureQueriesContext
        from django.db import connection

        profile = build_profile(role="student")
        for _ in range(5):
            _delivered(profile.id, category=prefs.CATEGORY_APPLICATION_UPDATES)

        client = _client_for(profile)
        client.get(NOTIFICATIONS_URL)  # warm any settings/auth lookups
        with CaptureQueriesContext(connection) as captured:
            client.get(NOTIFICATIONS_URL)
        email_queries = [
            q for q in captured.captured_queries if "email_queue" in q["sql"]
        ]
        assert len(email_queries) == 1

    def test_another_students_inbox_is_not_readable(self):
        a, b = build_profile(role="student"), build_profile(role="student")
        _delivered(a.id, category=prefs.CATEGORY_APPLICATION_UPDATES)

        results = _client_for(b).get(NOTIFICATIONS_URL).data["data"]["results"]
        assert results == []


# ---------------------------------------------------------------------------
# 6. Retry is a command
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestRetryIsAnAuthorizedAuditedDurableCommand:
    """R13.4: retry SHALL be an authorized audited command."""

    def _failed_message(self, profile):
        result = _delivered(profile.id, category=prefs.CATEGORY_APPLICATION_UPDATES)
        EmailQueue.objects.filter(pk=result.email.id).update(status="failed")
        return result.notification

    def test_the_owner_can_retry_a_failed_email(self):
        profile = build_profile(role="student")
        notification = self._failed_message(profile)

        response = _client_for(profile).post(retry_url(notification.id))

        assert response.status_code == 200
        assert response.data["data"]["attempts"] == 2
        assert EmailQueue.objects.count() == 2

    def test_the_retry_is_durable_through_the_outbox_not_a_direct_send(self):
        profile = build_profile(role="student")
        notification = self._failed_message(profile)
        _client_for(profile).post(retry_url(notification.id))

        assert OutboxEvent.objects.filter(event_type="email.queued").count() == 2
        replacement = EmailQueue.objects.exclude(status="failed").get()
        assert replacement.status == "pending"

    def test_the_retry_resends_the_message_the_student_was_promised(self):
        profile = build_profile(role="student")
        notification = self._failed_message(profile)
        original = EmailQueue.objects.get()
        _client_for(profile).post(retry_url(notification.id))

        replacement = EmailQueue.objects.exclude(pk=original.pk).get()
        assert replacement.subject == original.subject
        assert replacement.body == original.body
        assert replacement.recipient_email == original.recipient_email

    def test_another_students_message_and_an_unknown_id_are_the_same_404(self):
        a, b = build_profile(role="student"), build_profile(role="student")
        notification = self._failed_message(a)
        client = _client_for(b)

        theirs = client.post(retry_url(notification.id))
        unknown = client.post(retry_url(uuid.uuid4()))
        assert theirs.status_code == unknown.status_code == 404
        assert theirs.data == unknown.data

    def test_a_message_that_is_not_failed_is_refused(self):
        profile = build_profile(role="student")
        result = _delivered(profile.id, category=prefs.CATEGORY_APPLICATION_UPDATES)

        response = _client_for(profile).post(retry_url(result.notification.id))
        assert response.status_code == 409
        assert response.data["code"] == history.CODE_RETRY_NOT_APPLICABLE
        assert EmailQueue.objects.count() == 1

    def test_a_suppressed_message_has_nothing_to_retry(self):
        profile = build_profile(role="student")
        UserNotificationPreference.objects.create(
            user_id=profile.id, email_enabled=False
        )
        result = _delivered(profile.id, category=prefs.CATEGORY_PAYMENT_REMINDERS)

        response = _client_for(profile).post(retry_url(result.notification.id))
        assert response.status_code == 409
        assert response.data["code"] == history.CODE_RETRY_UNTRACKED

    def test_an_untracked_pre_10_1_message_is_refused_with_its_own_code(self):
        profile = build_profile(role="student")
        notification = Notification.objects.create(
            user_id=profile.id, title="Old", message="No record", type="info"
        )
        response = _client_for(profile).post(retry_url(notification.id))
        assert response.status_code == 409
        assert response.data["code"] == history.CODE_RETRY_UNTRACKED

    def test_an_immediate_replay_is_refused_by_the_state_machine(self):
        profile = build_profile(role="student")
        notification = self._failed_message(profile)
        client = _client_for(profile)

        assert client.post(retry_url(notification.id)).status_code == 200
        replay = client.post(retry_url(notification.id))
        assert replay.status_code == 409
        assert replay.data["code"] == history.CODE_RETRY_NOT_APPLICABLE
        assert EmailQueue.objects.count() == 2

    def test_the_retry_is_bounded(self):
        profile = build_profile(role="student")
        notification = self._failed_message(profile)
        client = _client_for(profile)

        codes = []
        for _ in range(history.COMMUNICATION_RETRY_LIMIT + 2):
            response = client.post(retry_url(notification.id))
            codes.append(response.status_code)
            EmailQueue.objects.filter(status="pending").update(status="failed")

        assert 200 in codes
        assert codes[-1] == 409
        assert EmailQueue.objects.count() <= history.COMMUNICATION_RETRY_LIMIT + 2

    def test_the_retry_is_audited_with_ids_and_no_message_content(self):
        profile = build_profile(role="student")
        notification = self._failed_message(profile)
        _client_for(profile).post(retry_url(notification.id))

        event = AuditLog.objects.filter(
            action=history.ACTION_COMMUNICATION_RETRIED
        ).order_by("-created_at").first()
        assert event is not None
        assert str(event.entity_id) == str(notification.id)
        assert "Message body" not in str(event.changes)

    def test_the_endpoint_requires_authentication(self):
        assert APIClient().post(retry_url(uuid.uuid4())).status_code in (401, 403)


# ---------------------------------------------------------------------------
# 7. One authority, no second implementation
# ---------------------------------------------------------------------------


class TestOneAuthority:
    def test_the_schema_module_is_the_only_place_the_columns_are_named(self):
        """A second field list is how the frontend and backend drifted apart."""
        views = _source(__import__("apps.common.notification_views", fromlist=["x"]))
        tree = ast.parse(views)
        # The documentation-only write serializer may name the writable fields;
        # nothing else in the view layer may name a refused column.
        refused = {name for name, _c, _r in prefs.UNSUPPORTED_FIELD_TABLE}
        assigned = {
            node.targets[0].id
            for node in ast.walk(tree)
            if isinstance(node, ast.Assign)
            and node.targets
            and isinstance(node.targets[0], ast.Name)
        }
        assert refused.isdisjoint(assigned)

    def test_the_view_holds_no_delivery_logic(self):
        views = _source(__import__("apps.common.notification_views", fromlist=["x"]))
        assert "resolve_delivery(" not in views
        assert "SUPPRESSED_BY_PREFERENCE" not in views

    def test_the_delivery_gate_is_the_only_answer_to_will_this_be_sent(self):
        module = _source(prefs)
        assert "def resolve_delivery(" in module
        assert module.count("def resolve_delivery(") == 1

    def test_the_history_reads_the_channel_vocabulary_rather_than_restating_it(self):
        module = _source(history)
        assert "from apps.common.notification_preferences import" in module
        assert 'key="email"' not in module
        assert 'key="in_app"' not in module


# ---------------------------------------------------------------------------
# 8. Which channels a message may use (the question task 9.5 deferred here)
# ---------------------------------------------------------------------------


class TestAudienceDecidesTheChannelSet:
    """Task 9.5 left amendment notifications in-app only and recorded that
    *"which channels an amendment should use belongs to task 10.1's
    notification-preference schema"*. This is that answer, stated as a fact about
    the message class rather than as a call-site habit.
    """

    def test_every_category_declares_a_published_audience(self):
        for category in prefs.ALL_CATEGORIES:
            assert category.audience in prefs.AUDIENCES, category.key

    def test_every_audience_declares_its_channel_set(self):
        assert set(prefs.AUDIENCE_CHANNELS) == set(prefs.AUDIENCES)
        published = {c.key for c in prefs.CHANNELS}
        for audience, channels in prefs.AUDIENCE_CHANNELS.items():
            assert channels, audience
            assert set(channels) <= published, audience

    def test_the_inbox_is_in_every_audience_channel_set(self):
        """It is the platform's record of what a recipient was told."""
        for audience, channels in prefs.AUDIENCE_CHANNELS.items():
            assert prefs.CHANNEL_IN_APP.key in channels, audience

    def test_a_staff_message_class_is_inbox_only_and_says_why(self):
        assert prefs.AUDIENCE_CHANNELS[prefs.AUDIENCE_STAFF] == (
            prefs.CHANNEL_IN_APP.key,
        )
        assert prefs.AUDIENCE_CHANNEL_REASONS[prefs.AUDIENCE_STAFF].strip()

    def test_a_staff_category_is_never_published_as_a_preference(self):
        """There is no staff settings screen, so there must be no staff switch."""
        for category in prefs.STAFF_CATEGORIES:
            assert category not in prefs.CATEGORIES
            assert category.configurable is False
            assert category.column is None
            assert category.key not in prefs.WRITABLE_FIELDS
        published = {c.key for c in prefs.CATEGORIES}
        assert published.isdisjoint({c.key for c in prefs.STAFF_CATEGORIES})

    def test_the_preference_payload_publishes_student_categories_only(self):
        payload = prefs.resolve_preferences(uuid.uuid4()).as_payload()
        assert [c["key"] for c in payload["categories"]] == [
            c.key for c in prefs.CATEGORIES
        ]

    def test_a_preference_cannot_widen_an_audience_channel_set(self):
        """Even a mandatory category cannot reach a channel it has no audience for."""
        resolved = prefs.resolve_preferences(uuid.uuid4())
        assert resolved.allows(prefs.CATEGORY_STAFF_ACTION_REQUIRED, "email") is False
        assert resolved.allows(prefs.CATEGORY_STAFF_ACTION_REQUIRED, "in_app") is True
        assert resolved.allows(prefs.CATEGORY_APPLICATION_UPDATES, "email") is True

    def test_a_staff_message_is_not_applicable_on_email_rather_than_unknown(self):
        """``unknown`` means "predates delivery tracking". This does not."""
        record = prefs.staff_delivery_metadata(application_id=uuid.uuid4())
        email = record[prefs.COMMUNICATION_METADATA_KEY]["channels"]["email"]
        assert email["used"] is False
        assert email["reason"] == prefs.NOT_IN_AUDIENCE_CHANNELS

        state = history.project_channels(
            _StubNotification(metadata=record), {}
        )[1]
        assert state.state == history.STATE_NOT_APPLICABLE
        assert state.state != history.STATE_UNKNOWN
        assert state.can_retry is False

    def test_a_suppression_and_an_inapplicable_channel_are_different_states(self):
        """One the recipient can reverse; the other is a fact about the message."""
        assert (
            history._UNUSED_REASON_STATES[prefs.SUPPRESSED_BY_PREFERENCE]
            != history._UNUSED_REASON_STATES[prefs.NOT_IN_AUDIENCE_CHANNELS]
        )

    def test_every_unused_reason_the_gate_emits_has_a_published_state(self):
        assert history.UNCLASSIFIED_UNUSED_REASONS == ()
        for state in history._UNUSED_REASON_STATES.values():
            assert state in history.DELIVERY_STATES

    def test_a_staff_record_carries_no_recipient_and_no_address(self):
        record = prefs.staff_delivery_metadata(
            application_id=uuid.uuid4(), institution_id=uuid.uuid4()
        )
        rendered = str(record)
        assert "@" not in rendered
        assert "recipient" not in rendered

    def test_the_amendment_fanout_declares_the_staff_channel_set(self):
        """The 9.5 fan-out is the producer this settlement exists for."""
        source = _source(
            __import__("apps.applications.amendment_service", fromlist=["x"])
        )
        assert "staff_delivery_metadata" in source
        assert "CATEGORY_STAFF_ACTION_REQUIRED" in source

    def test_the_audience_travels_on_the_message(self):
        record = prefs.staff_delivery_metadata()
        projected = history.project_delivery([_StubNotification(metadata=record)])
        entry = next(iter(projected.values()))
        assert entry["audience"] == prefs.AUDIENCE_STAFF
        assert entry["category"] == prefs.CATEGORY_STAFF_ACTION_REQUIRED.key
        assert entry["kind"] == prefs.KIND_MANDATORY

    def test_a_pre_10_1_message_is_still_a_student_message(self):
        """No stored record means the mandatory student class, not a staff one."""
        projected = history.project_delivery([_StubNotification(metadata={})])
        entry = next(iter(projected.values()))
        assert entry["audience"] == prefs.AUDIENCE_STUDENT
        assert entry["category"] == prefs.CATEGORY_APPLICATION_UPDATES.key


class _StubNotification:
    """A notification-shaped value, so the projection can be exercised without a DB.

    The projection reads ``id``, ``metadata`` and ``created_at`` and nothing else;
    a stub keeps these cases free of a database round trip while exercising the
    real code path.
    """

    def __init__(self, *, metadata):
        self.id = uuid.uuid4()
        self.metadata = metadata
        self.created_at = None


# ---------------------------------------------------------------------------
# 9. The frontend mirror cannot drift
# ---------------------------------------------------------------------------


#: Resolved from this file rather than from the working directory, so the guard
#: cannot silently turn into a skip depending on where pytest was invoked.
FRONTEND_MIRROR = (
    pathlib.Path(__file__).resolve().parents[3]
    / "apps"
    / "admissions"
    / "src"
    / "lib"
    / "notificationPreferences.ts"
)


def _mirror_source() -> str:
    if not FRONTEND_MIRROR.exists():
        pytest.skip("frontend app not present in this tree")
    return FRONTEND_MIRROR.read_text()


class TestTheFrontendMirrorCannotDrift:
    """STU-14 is a *drift* finding, so the guard has to be executable.

    The browser mirrors exactly two things — the schema version and the rejection
    codes — because it must explain a 400 to a student without inventing copy.
    Everything else (which channels exist, which categories are optional, what
    each means, what is writable, what a delivery state means) is read from the
    response. These cases assert both halves: the two mirrored constants agree,
    and **nothing else leaked back into the client**.

    The guard lives on the backend because the backend is the authority; a guard
    that only ran in the frontend suite would let a backend-only change ship
    green.
    """

    def test_the_mirror_pins_the_backend_schema_version(self):
        source = _mirror_source()
        assert (
            f"export const PREFERENCE_SCHEMA_VERSION = {prefs.SCHEMA_VERSION}" in source
        )

    def test_the_mirror_pins_the_top_level_rejection_code(self):
        source = _mirror_source()
        assert (
            f"export const UNSUPPORTED_PREFERENCE = '{prefs.UNSUPPORTED_PREFERENCE}'"
            in source
        )

    def test_the_mirror_lists_every_rejection_code_in_the_backend_order(self):
        source = _mirror_source()
        block = source.split("PREFERENCE_REJECTION_CODES = [", 1)
        assert len(block) == 2, "the mirror no longer declares the rejection codes"
        listed = [
            line.strip().strip(",").strip("'")
            for line in block[1].split("]", 1)[0].splitlines()
            if line.strip()
        ]
        assert listed == list(prefs.REJECTION_CODES)

    def test_the_mirror_names_no_channel_and_no_category(self):
        """A field list in the client is how the two sides drifted apart."""
        source = _mirror_source()
        code = _strip_ts_comments(source)
        for channel in prefs.CHANNELS:
            assert channel.key not in code, channel.key
            if channel.column:
                assert channel.column not in code, channel.column
        for category in prefs.ALL_CATEGORIES:
            assert category.key not in code, category.key

    def test_the_mirror_never_renders_an_unpublished_state_as_healthy(self):
        """Every state the backend publishes has a tone; the fallback is unknown."""
        source = _mirror_source()
        block = source.split("DELIVERY_STATE_TONES: Record<string, DeliveryTone> = {", 1)
        assert len(block) == 2, "the mirror no longer declares delivery-state tones"
        body = block[1].split("}", 1)[0]
        for state in history.DELIVERY_STATES:
            assert f"{state}:" in body, state


def _strip_ts_comments(source: str) -> str:
    """Drop block and line comments from TypeScript source.

    The mirror deliberately *documents* the fields STU-14 found in the client
    (``whatsapp_enabled``, ``in_app_enabled``, quiet hours), because recording
    what was wrong is part of the fix. A guard that grepped raw source could only
    be satisfied by deleting that record, so it scans code and not prose — the
    same reason 9.5's role-comparison guards parse instead of grep.
    """
    out: list[str] = []
    i = 0
    length = len(source)
    while i < length:
        if source.startswith("/*", i):
            end = source.find("*/", i + 2)
            i = length if end == -1 else end + 2
            continue
        if source.startswith("//", i):
            end = source.find("\n", i)
            i = length if end == -1 else end
            continue
        out.append(source[i])
        i += 1
    return "".join(out)
