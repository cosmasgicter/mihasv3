"""Property-based tests for the SSE event dispatcher.

# Feature: realtime-sse-system, Property 8: SSEEvent persistence round-trip
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import uuid  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.common.event_dispatcher import ALLOWED_EVENT_TYPES, dispatch_event  # noqa: E402

_pbt_settings = settings(max_examples=100, deadline=None)

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

_event_types = st.sampled_from(sorted(ALLOWED_EVENT_TYPES))

# JSON-serializable payload: dict of text keys to text/int/bool values
_payload_values = st.one_of(
    st.text(min_size=0, max_size=100),
    st.integers(min_value=-1_000_000, max_value=1_000_000),
    st.booleans(),
)
_payloads = st.dictionaries(
    keys=st.text(min_size=1, max_size=30).filter(lambda s: s.strip()),
    values=_payload_values,
    min_size=0,
    max_size=10,
)

_entity_ids = st.one_of(st.none(), st.uuids())


# ---------------------------------------------------------------------------
# Property 8: SSEEvent persistence round-trip
# ---------------------------------------------------------------------------


class TestSSEEventPersistenceRoundTrip(SimpleTestCase):
    """Property 8: SSEEvent persistence round-trip.

    For any valid combination of user_id, event_type (from the allowed set),
    payload (JSON-serializable dict), and entity_id, creating an SSEEvent via
    dispatch_event and then querying it back should produce an equivalent
    record with all fields preserved.

    **Validates: Requirements 3.1**
    """

    @given(
        user_id=st.uuids(),
        event_type=_event_types,
        payload=_payloads,
        entity_id=_entity_ids,
    )
    @_pbt_settings
    def test_dispatch_event_round_trip_preserves_all_fields(
        self, user_id, event_type, payload, entity_id
    ):
        """Feature: realtime-sse-system, Property 8: SSEEvent persistence round-trip

        For any valid user_id, event_type, payload, and entity_id,
        dispatch_event creates an SSEEvent row via ORM with all fields
        preserved. Querying it back by PK returns the same values.
        """
        created_event = MagicMock()
        created_event.id = uuid.uuid4()
        created_event.user_id = user_id
        created_event.event_type = event_type
        created_event.payload = payload
        created_event.entity_id = entity_id
        created_event.delivered = False
        created_event.delivered_at = None
        created_event.created_at = MagicMock()

        with patch("apps.common.event_dispatcher.SSEEvent.objects") as mock_objects:
            # Mock the create call to return our event
            mock_objects.create.return_value = created_event
            # Mock the eviction query (undelivered count)
            mock_objects.filter.return_value.count.return_value = 0

            event = dispatch_event(
                user_id=user_id,
                event_type=event_type,
                payload=payload,
                entity_id=entity_id,
            )

            # Verify create was called with the correct arguments
            mock_objects.create.assert_called_once()
            create_kwargs = mock_objects.create.call_args.kwargs

            # user_id should be a UUID (coerced from str if needed)
            assert create_kwargs["user_id"] == user_id, (
                f"user_id mismatch: {create_kwargs['user_id']} != {user_id}"
            )
            assert create_kwargs["event_type"] == event_type, (
                f"event_type mismatch: {create_kwargs['event_type']} != {event_type}"
            )
            assert create_kwargs["payload"] == payload, (
                f"payload mismatch: {create_kwargs['payload']} != {payload}"
            )

            if entity_id is not None:
                assert create_kwargs["entity_id"] == entity_id, (
                    f"entity_id mismatch: {create_kwargs['entity_id']} != {entity_id}"
                )
            else:
                assert create_kwargs["entity_id"] is None, (
                    f"entity_id should be None, got {create_kwargs['entity_id']}"
                )

            assert create_kwargs["delivered"] is False, (
                f"delivered should be False, got {create_kwargs['delivered']}"
            )

        # Verify the returned event has all fields preserved
        assert event.user_id == user_id
        assert event.event_type == event_type
        assert event.payload == payload
        assert event.entity_id == entity_id
        assert event.delivered is False
        assert event.delivered_at is None
        assert event.created_at is not None

    @given(
        user_id=st.uuids(),
        event_type=_event_types,
        payload=_payloads,
        entity_id=_entity_ids,
    )
    @_pbt_settings
    def test_dispatch_event_round_trip_with_string_ids(
        self, user_id, event_type, payload, entity_id
    ):
        """Feature: realtime-sse-system, Property 8: SSEEvent persistence round-trip

        When user_id and entity_id are passed as strings, dispatch_event
        coerces them to UUIDs before persisting, ensuring the round-trip
        preserves the correct UUID values.
        """
        created_event = MagicMock()
        created_event.id = uuid.uuid4()
        created_event.user_id = user_id
        created_event.event_type = event_type
        created_event.payload = payload
        created_event.entity_id = entity_id
        created_event.delivered = False
        created_event.delivered_at = None
        created_event.created_at = MagicMock()

        with patch("apps.common.event_dispatcher.SSEEvent.objects") as mock_objects:
            mock_objects.create.return_value = created_event
            mock_objects.filter.return_value.count.return_value = 0

            event = dispatch_event(
                user_id=str(user_id),
                event_type=event_type,
                payload=payload,
                entity_id=str(entity_id) if entity_id is not None else None,
            )

            create_kwargs = mock_objects.create.call_args.kwargs

            # String IDs should be coerced to UUID
            assert create_kwargs["user_id"] == user_id, (
                f"user_id not coerced to UUID: {create_kwargs['user_id']}"
            )

            if entity_id is not None:
                assert create_kwargs["entity_id"] == entity_id, (
                    f"entity_id not coerced to UUID: {create_kwargs['entity_id']}"
                )
            else:
                assert create_kwargs["entity_id"] is None


# ---------------------------------------------------------------------------
# Property 9: Event type validation
# Feature: realtime-sse-system, Property 9: Event type validation
# ---------------------------------------------------------------------------


class TestEventTypeValidation(SimpleTestCase):
    """Property 9: Event type validation.

    For any event_type string, dispatch_event should succeed if and only if
    the string is one of `notification`, `application_update`, `payment_update`,
    `interview_scheduled`, `dashboard_refresh`. All other strings should raise
    ValueError.

    **Validates: Requirements 3.4**
    """

    @given(
        event_type=st.sampled_from(sorted(ALLOWED_EVENT_TYPES)),
        user_id=st.uuids(),
        payload=_payloads,
    )
    @_pbt_settings
    def test_valid_event_types_succeed(self, event_type, user_id, payload):
        """Feature: realtime-sse-system, Property 9: Event type validation

        For any event_type in the allowed set, dispatch_event should succeed
        and return an SSEEvent without raising ValueError.
        """
        created_event = MagicMock()
        created_event.id = uuid.uuid4()
        created_event.user_id = user_id
        created_event.event_type = event_type
        created_event.payload = payload
        created_event.entity_id = None
        created_event.delivered = False
        created_event.delivered_at = None
        created_event.created_at = MagicMock()

        with patch("apps.common.event_dispatcher.SSEEvent.objects") as mock_objects:
            mock_objects.create.return_value = created_event
            mock_objects.filter.return_value.count.return_value = 0

            event = dispatch_event(
                user_id=user_id,
                event_type=event_type,
                payload=payload,
            )

            assert event.event_type == event_type

    @given(
        event_type=st.text(min_size=0, max_size=100).filter(
            lambda s: s not in ALLOWED_EVENT_TYPES
        ),
        user_id=st.uuids(),
        payload=_payloads,
    )
    @_pbt_settings
    def test_invalid_event_types_raise_value_error(self, event_type, user_id, payload):
        """Feature: realtime-sse-system, Property 9: Event type validation

        For any event_type string NOT in the allowed set, dispatch_event
        should raise ValueError.
        """
        with patch("apps.common.event_dispatcher.SSEEvent.objects"):
            with self.assertRaises(ValueError):
                dispatch_event(
                    user_id=user_id,
                    event_type=event_type,
                    payload=payload,
                )


# ---------------------------------------------------------------------------
# Property 11: Per-user undelivered event cap
# Feature: realtime-sse-system, Property 11: Per-user undelivered event cap
# ---------------------------------------------------------------------------


class TestPerUserUndeliveredEventCap(SimpleTestCase):
    """Property 11: Per-user undelivered event cap.

    For any user, after any number of dispatch_event calls without delivery,
    the count of undelivered SSEEvent rows for that user should never exceed
    100. When the 101st event is dispatched, the oldest undelivered event
    should be evicted (marked delivered) before the new event is inserted.

    **Validates: Requirements 3.7**
    """

    @given(
        user_id=st.uuids(),
        event_type=_event_types,
        payload=_payloads,
        undelivered_count=st.integers(min_value=100, max_value=300),
    )
    @_pbt_settings
    def test_eviction_triggered_when_at_or_over_cap(
        self, user_id, event_type, payload, undelivered_count
    ):
        """Feature: realtime-sse-system, Property 11: Per-user undelivered event cap

        When the undelivered count for a user is >= 100, dispatching a new
        event should trigger eviction of the oldest undelivered events
        before inserting the new one.
        """
        from apps.common.event_dispatcher import MAX_UNDELIVERED_PER_USER

        created_event = MagicMock()
        created_event.id = uuid.uuid4()
        created_event.user_id = user_id
        created_event.event_type = event_type
        created_event.payload = payload
        created_event.entity_id = None
        created_event.delivered = False
        created_event.delivered_at = None
        created_event.created_at = MagicMock()

        excess = undelivered_count - MAX_UNDELIVERED_PER_USER + 1
        evict_ids = [uuid.uuid4() for _ in range(excess)]

        with patch("apps.common.event_dispatcher.SSEEvent.objects") as mock_objects:
            # Build the mock chain for the filter calls.
            # _evict_if_over_cap calls:
            #   1) .filter(user_id=..., delivered=False).count() -> undelivered_count
            #   2) .filter(user_id=..., delivered=False).order_by(...).values_list(...)[:excess] -> evict_ids
            #   3) .filter(id__in=evict_ids).update(...) -> eviction update
            # dispatch_event then calls:
            #   4) .create(...) -> created_event

            # We need filter() to return different mocks depending on call order.
            # Use side_effect to track filter calls.
            count_qs = MagicMock()
            count_qs.count.return_value = undelivered_count
            count_qs.order_by.return_value.values_list.return_value.__getitem__ = (
                MagicMock(return_value=evict_ids)
            )

            evict_update_qs = MagicMock()
            evict_update_qs.update.return_value = len(evict_ids)

            filter_calls = []

            def filter_side_effect(**kwargs):
                filter_calls.append(kwargs)
                if "id__in" in kwargs:
                    return evict_update_qs
                return count_qs

            mock_objects.filter.side_effect = filter_side_effect
            mock_objects.create.return_value = created_event

            event = dispatch_event(
                user_id=user_id,
                event_type=event_type,
                payload=payload,
            )

            # Verify eviction occurred: filter(id__in=...).update() was called
            eviction_filter_calls = [
                c for c in filter_calls if "id__in" in c
            ]
            assert len(eviction_filter_calls) == 1, (
                f"Expected exactly 1 eviction filter call, got {len(eviction_filter_calls)}"
            )
            evict_update_qs.update.assert_called_once()
            update_kwargs = evict_update_qs.update.call_args.kwargs
            assert update_kwargs["delivered"] is True, (
                "Evicted events should be marked delivered=True"
            )
            assert "delivered_at" in update_kwargs, (
                "Evicted events should have delivered_at set"
            )

            # Verify the new event was still created
            mock_objects.create.assert_called_once()
            assert event is created_event

    @given(
        user_id=st.uuids(),
        event_type=_event_types,
        payload=_payloads,
        undelivered_count=st.integers(min_value=0, max_value=99),
    )
    @_pbt_settings
    def test_no_eviction_when_under_cap(
        self, user_id, event_type, payload, undelivered_count
    ):
        """Feature: realtime-sse-system, Property 11: Per-user undelivered event cap

        When the undelivered count for a user is < 100, dispatching a new
        event should NOT trigger any eviction — no update() call on older
        events.
        """
        created_event = MagicMock()
        created_event.id = uuid.uuid4()
        created_event.user_id = user_id
        created_event.event_type = event_type
        created_event.payload = payload
        created_event.entity_id = None
        created_event.delivered = False
        created_event.delivered_at = None
        created_event.created_at = MagicMock()

        with patch("apps.common.event_dispatcher.SSEEvent.objects") as mock_objects:
            # filter(user_id=..., delivered=False).count() returns under cap
            count_qs = MagicMock()
            count_qs.count.return_value = undelivered_count

            filter_calls = []

            def filter_side_effect(**kwargs):
                filter_calls.append(kwargs)
                return count_qs

            mock_objects.filter.side_effect = filter_side_effect
            mock_objects.create.return_value = created_event

            event = dispatch_event(
                user_id=user_id,
                event_type=event_type,
                payload=payload,
            )

            # Verify NO eviction occurred: no filter(id__in=...) call
            eviction_filter_calls = [
                c for c in filter_calls if "id__in" in c
            ]
            assert len(eviction_filter_calls) == 0, (
                f"Expected no eviction filter calls when under cap, got {len(eviction_filter_calls)}"
            )

            # Verify the event was created normally
            mock_objects.create.assert_called_once()
            assert event is created_event


# ---------------------------------------------------------------------------
# Property 12: dispatch_event creates SSEEvent for valid domain actions
# Feature: realtime-sse-system, Property 12: dispatch_event creates SSEEvent for valid domain actions
# ---------------------------------------------------------------------------


class TestDispatchEventCreatesSSEEventForValidDomainActions(SimpleTestCase):
    """Property 12: dispatch_event creates SSEEvent for valid domain actions.

    For any valid user_id, event_type from the allowed set, and well-formed
    payload dict, dispatch_event should create exactly one new SSEEvent row
    in the database with matching user_id, event_type, payload,
    delivered=false, and a non-null created_at.

    **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
    """

    @given(
        user_id=st.uuids(),
        event_type=_event_types,
        payload=_payloads,
        entity_id=_entity_ids,
    )
    @_pbt_settings
    def test_dispatch_event_creates_exactly_one_sse_event(
        self, user_id, event_type, payload, entity_id
    ):
        """Feature: realtime-sse-system, Property 12: dispatch_event creates SSEEvent for valid domain actions

        For any valid user_id, event_type from the allowed set, and
        well-formed payload dict, dispatch_event creates exactly one
        SSEEvent via objects.create with correct kwargs, delivered=False,
        and a non-null created_at.
        """
        fake_created_at = MagicMock(name="created_at_timestamp")
        created_event = MagicMock()
        created_event.id = uuid.uuid4()
        created_event.user_id = user_id
        created_event.event_type = event_type
        created_event.payload = payload
        created_event.entity_id = entity_id
        created_event.delivered = False
        created_event.delivered_at = None
        created_event.created_at = fake_created_at

        with patch("apps.common.event_dispatcher.SSEEvent.objects") as mock_objects:
            mock_objects.create.return_value = created_event
            mock_objects.filter.return_value.count.return_value = 0

            event = dispatch_event(
                user_id=user_id,
                event_type=event_type,
                payload=payload,
                entity_id=entity_id,
            )

            # create is called exactly once
            mock_objects.create.assert_called_once()

            create_kwargs = mock_objects.create.call_args.kwargs

            # All fields match the inputs
            assert create_kwargs["user_id"] == user_id
            assert create_kwargs["event_type"] == event_type
            assert create_kwargs["payload"] == payload
            assert create_kwargs["entity_id"] == entity_id
            assert create_kwargs["delivered"] is False

            # Returned event has delivered=False and non-null created_at
            assert event.delivered is False
            assert event.created_at is not None


# ---------------------------------------------------------------------------
# Property 13: Event payload contains required fields
# Feature: realtime-sse-system, Property 13: Event payload contains required fields
# ---------------------------------------------------------------------------


# Strategies for event-type-specific payloads with required fields
_non_empty_text = st.text(min_size=1, max_size=100).filter(lambda s: s.strip())

_application_update_payloads = st.fixed_dictionaries({
    "application_id": st.uuids().map(str),
    "status": _non_empty_text,
    "updated_at": _non_empty_text,
})

_notification_payloads = st.fixed_dictionaries({
    "notification_id": st.uuids().map(str),
    "title": _non_empty_text,
    "message": _non_empty_text,
    "type": _non_empty_text,
})

_payment_update_payloads = st.fixed_dictionaries({
    "payment_id": st.uuids().map(str),
    "status": _non_empty_text,
    "updated_at": _non_empty_text,
})

_interview_scheduled_payloads = st.fixed_dictionaries({
    "interview_id": st.uuids().map(str),
    "scheduled_at": _non_empty_text,
    "mode": _non_empty_text,
})

# Map event types to their payload strategies and required field sets
_EVENT_TYPE_PAYLOAD_MAP = {
    "application_update": (
        _application_update_payloads,
        {"application_id", "status", "updated_at"},
    ),
    "notification": (
        _notification_payloads,
        {"notification_id", "title", "message", "type"},
    ),
    "payment_update": (
        _payment_update_payloads,
        {"payment_id", "status", "updated_at"},
    ),
    "interview_scheduled": (
        _interview_scheduled_payloads,
        {"interview_id", "scheduled_at", "mode"},
    ),
}


class TestEventPayloadContainsRequiredFields(SimpleTestCase):
    """Property 13: Event payload contains required fields.

    For any dispatched event of type `application_update`, the payload should
    contain `application_id`, `status`, and `updated_at`. For type
    `notification`, the payload should contain `notification_id`, `title`,
    `message`, and `type`. For type `payment_update`, the payload should
    contain `payment_id`, `status`, and `updated_at`. For type
    `interview_scheduled`, the payload should contain `interview_id`,
    `scheduled_at`, and `mode`.

    **Validates: Requirements 4.5, 8.3**
    """

    @given(
        user_id=st.uuids(),
        payload=_application_update_payloads,
    )
    @_pbt_settings
    def test_application_update_payload_has_required_fields(self, user_id, payload):
        """Feature: realtime-sse-system, Property 13: Event payload contains required fields

        For any dispatched application_update event, the stored SSEEvent
        payload contains application_id, status, and updated_at.
        """
        created_event = MagicMock()
        created_event.id = uuid.uuid4()
        created_event.user_id = user_id
        created_event.event_type = "application_update"
        created_event.payload = payload
        created_event.entity_id = None
        created_event.delivered = False
        created_event.delivered_at = None
        created_event.created_at = MagicMock()

        with patch("apps.common.event_dispatcher.SSEEvent.objects") as mock_objects:
            mock_objects.create.return_value = created_event
            mock_objects.filter.return_value.count.return_value = 0

            event = dispatch_event(
                user_id=user_id,
                event_type="application_update",
                payload=payload,
            )

            stored_payload = mock_objects.create.call_args.kwargs["payload"]
            required = {"application_id", "status", "updated_at"}
            assert required.issubset(stored_payload.keys()), (
                f"application_update payload missing fields: "
                f"{required - stored_payload.keys()}"
            )
            # Verify values are non-empty strings
            for field in required:
                assert isinstance(stored_payload[field], str) and stored_payload[field].strip(), (
                    f"Field '{field}' must be a non-empty string, got {stored_payload[field]!r}"
                )

    @given(
        user_id=st.uuids(),
        payload=_notification_payloads,
    )
    @_pbt_settings
    def test_notification_payload_has_required_fields(self, user_id, payload):
        """Feature: realtime-sse-system, Property 13: Event payload contains required fields

        For any dispatched notification event, the stored SSEEvent payload
        contains notification_id, title, message, and type.
        """
        created_event = MagicMock()
        created_event.id = uuid.uuid4()
        created_event.user_id = user_id
        created_event.event_type = "notification"
        created_event.payload = payload
        created_event.entity_id = None
        created_event.delivered = False
        created_event.delivered_at = None
        created_event.created_at = MagicMock()

        with patch("apps.common.event_dispatcher.SSEEvent.objects") as mock_objects:
            mock_objects.create.return_value = created_event
            mock_objects.filter.return_value.count.return_value = 0

            event = dispatch_event(
                user_id=user_id,
                event_type="notification",
                payload=payload,
            )

            stored_payload = mock_objects.create.call_args.kwargs["payload"]
            required = {"notification_id", "title", "message", "type"}
            assert required.issubset(stored_payload.keys()), (
                f"notification payload missing fields: "
                f"{required - stored_payload.keys()}"
            )
            for field in required:
                assert isinstance(stored_payload[field], str) and stored_payload[field].strip(), (
                    f"Field '{field}' must be a non-empty string, got {stored_payload[field]!r}"
                )

    @given(
        user_id=st.uuids(),
        payload=_payment_update_payloads,
    )
    @_pbt_settings
    def test_payment_update_payload_has_required_fields(self, user_id, payload):
        """Feature: realtime-sse-system, Property 13: Event payload contains required fields

        For any dispatched payment_update event, the stored SSEEvent payload
        contains payment_id, status, and updated_at.
        """
        created_event = MagicMock()
        created_event.id = uuid.uuid4()
        created_event.user_id = user_id
        created_event.event_type = "payment_update"
        created_event.payload = payload
        created_event.entity_id = None
        created_event.delivered = False
        created_event.delivered_at = None
        created_event.created_at = MagicMock()

        with patch("apps.common.event_dispatcher.SSEEvent.objects") as mock_objects:
            mock_objects.create.return_value = created_event
            mock_objects.filter.return_value.count.return_value = 0

            event = dispatch_event(
                user_id=user_id,
                event_type="payment_update",
                payload=payload,
            )

            stored_payload = mock_objects.create.call_args.kwargs["payload"]
            required = {"payment_id", "status", "updated_at"}
            assert required.issubset(stored_payload.keys()), (
                f"payment_update payload missing fields: "
                f"{required - stored_payload.keys()}"
            )
            for field in required:
                assert isinstance(stored_payload[field], str) and stored_payload[field].strip(), (
                    f"Field '{field}' must be a non-empty string, got {stored_payload[field]!r}"
                )

    @given(
        user_id=st.uuids(),
        payload=_interview_scheduled_payloads,
    )
    @_pbt_settings
    def test_interview_scheduled_payload_has_required_fields(self, user_id, payload):
        """Feature: realtime-sse-system, Property 13: Event payload contains required fields

        For any dispatched interview_scheduled event, the stored SSEEvent
        payload contains interview_id, scheduled_at, and mode.
        """
        created_event = MagicMock()
        created_event.id = uuid.uuid4()
        created_event.user_id = user_id
        created_event.event_type = "interview_scheduled"
        created_event.payload = payload
        created_event.entity_id = None
        created_event.delivered = False
        created_event.delivered_at = None
        created_event.created_at = MagicMock()

        with patch("apps.common.event_dispatcher.SSEEvent.objects") as mock_objects:
            mock_objects.create.return_value = created_event
            mock_objects.filter.return_value.count.return_value = 0

            event = dispatch_event(
                user_id=user_id,
                event_type="interview_scheduled",
                payload=payload,
            )

            stored_payload = mock_objects.create.call_args.kwargs["payload"]
            required = {"interview_id", "scheduled_at", "mode"}
            assert required.issubset(stored_payload.keys()), (
                f"interview_scheduled payload missing fields: "
                f"{required - stored_payload.keys()}"
            )
            for field in required:
                assert isinstance(stored_payload[field], str) and stored_payload[field].strip(), (
                    f"Field '{field}' must be a non-empty string, got {stored_payload[field]!r}"
                )

    @given(
        user_id=st.uuids(),
        data=st.sampled_from(list(_EVENT_TYPE_PAYLOAD_MAP.keys())).flatmap(
            lambda et: _EVENT_TYPE_PAYLOAD_MAP[et][0].map(lambda p: (et, p))
        ),
    )
    @_pbt_settings
    def test_all_event_types_payload_round_trip(self, user_id, data):
        """Feature: realtime-sse-system, Property 13: Event payload contains required fields

        For any event type with a defined required-fields contract,
        dispatching with a conforming payload stores all required fields
        in the SSEEvent and they survive the round-trip through
        dispatch_event.
        """
        event_type, payload = data
        _, required_fields = _EVENT_TYPE_PAYLOAD_MAP[event_type]

        created_event = MagicMock()
        created_event.id = uuid.uuid4()
        created_event.user_id = user_id
        created_event.event_type = event_type
        created_event.payload = payload
        created_event.entity_id = None
        created_event.delivered = False
        created_event.delivered_at = None
        created_event.created_at = MagicMock()

        with patch("apps.common.event_dispatcher.SSEEvent.objects") as mock_objects:
            mock_objects.create.return_value = created_event
            mock_objects.filter.return_value.count.return_value = 0

            event = dispatch_event(
                user_id=user_id,
                event_type=event_type,
                payload=payload,
            )

            stored_payload = mock_objects.create.call_args.kwargs["payload"]

            # All required fields present
            assert required_fields.issubset(stored_payload.keys()), (
                f"{event_type} payload missing: {required_fields - stored_payload.keys()}"
            )

            # Values match what was passed in
            for field in required_fields:
                assert stored_payload[field] == payload[field], (
                    f"{event_type}.{field}: stored {stored_payload[field]!r} "
                    f"!= input {payload[field]!r}"
                )
