"""Property-based tests for SSE event delivery.

# Feature: realtime-sse-system, Property 1: SSE event delivery completeness
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import asyncio  # noqa: E402
import json  # noqa: E402
import uuid  # noqa: E402
from datetime import datetime, timezone  # noqa: E402
from unittest.mock import AsyncMock, MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from django.http import StreamingHttpResponse  # noqa: E402
from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.common.event_dispatcher import ALLOWED_EVENT_TYPES  # noqa: E402

_pbt_settings = settings(max_examples=100, deadline=None)

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

_event_types = st.sampled_from(sorted(ALLOWED_EVENT_TYPES))

_payload_values = st.one_of(
    st.text(min_size=0, max_size=50),
    st.integers(min_value=-1_000_000, max_value=1_000_000),
    st.booleans(),
)
_payloads = st.dictionaries(
    keys=st.text(min_size=1, max_size=20).filter(lambda s: s.strip()),
    values=_payload_values,
    min_size=0,
    max_size=5,
)


def _make_mock_event(event_id=None, user_id=None, event_type="notification",
                     payload=None, entity_id=None):
    """Create a mock SSEEvent object with the given fields."""
    ev = MagicMock()
    ev.id = event_id or uuid.uuid4()
    ev.user_id = user_id or uuid.uuid4()
    ev.event_type = event_type
    ev.payload = payload if payload is not None else {}
    ev.entity_id = entity_id
    ev.delivered = False
    ev.delivered_at = None
    ev.created_at = datetime.now(timezone.utc)
    return ev


# Strategy for generating lists of mock SSEEvent objects
_mock_events_strategy = st.lists(
    st.tuples(st.uuids(), _event_types, _payloads, st.one_of(st.none(), st.uuids())),
    min_size=0,
    max_size=20,
)


# ---------------------------------------------------------------------------
# Property 1: SSE event delivery completeness
# Feature: realtime-sse-system, Property 1: SSE event delivery completeness
# ---------------------------------------------------------------------------


class TestSSEEventDeliveryCompleteness(SimpleTestCase):
    """Property 1: SSE event delivery completeness.

    For any set of undelivered SSEEvent rows targeting a specific user,
    when the SSE async stream queries the database, all undelivered events
    should appear in the yielded output as named SSE events with their
    `id` as the SSE `id` field.

    **Validates: Requirements 1.3**
    """

    @given(
        user_id=st.uuids(),
        event_tuples=_mock_events_strategy,
    )
    @_pbt_settings
    def test_all_undelivered_events_appear_in_stream_output(
        self, user_id, event_tuples
    ):
        """Feature: realtime-sse-system, Property 1: SSE event delivery completeness

        For any set of undelivered SSEEvent rows targeting a specific user,
        the async event stream yields every event as a named SSE event with
        the event's id as the SSE id field.
        """
        # Build mock events for this user
        mock_events = [
            _make_mock_event(
                event_id=eid, user_id=user_id, event_type=etype,
                payload=pay, entity_id=entid,
            )
            for eid, etype, pay, entid in event_tuples
        ]

        # Collect all yielded SSE chunks from the async generator
        yielded_chunks = asyncio.run(
            self._collect_stream_output(user_id, mock_events)
        )

        # Concatenate all yielded text
        full_output = "".join(yielded_chunks)

        # Verify every event appears in the output with correct id and event name
        for ev in mock_events:
            expected_id_line = f"id: {ev.id}"
            assert expected_id_line in full_output, (
                f"Event {ev.id} not found in SSE output. "
                f"Expected 'id: {ev.id}' in stream."
            )

            expected_event_line = f"event: {ev.event_type}"
            assert expected_event_line in full_output, (
                f"Event type '{ev.event_type}' not found in SSE output "
                f"for event {ev.id}."
            )

            # Verify the data payload contains the event_id
            expected_event_id_in_data = f'"event_id": "{ev.id}"'
            assert expected_event_id_in_data in full_output, (
                f"event_id '{ev.id}' not found in SSE data payload."
            )

    async def _collect_stream_output(self, user_id, mock_events):
        """Run the _async_event_stream generator with mocked DB calls
        and collect all yielded chunks."""
        from apps.common.sse import _async_event_stream

        call_count = 0

        async def mock_fetch(uid, after_created_at=None):
            nonlocal call_count
            call_count += 1
            # Return events on the first call, empty on subsequent calls
            if call_count == 1:
                return mock_events
            return []

        async def mock_mark_delivered(event_ids):
            pass

        chunks = []
        with patch("apps.common.sse._fetch_undelivered_events", side_effect=mock_fetch), \
             patch("apps.common.sse._mark_events_delivered", side_effect=mock_mark_delivered), \
             patch("apps.common.sse.MAX_DURATION", 1), \
             patch("apps.common.sse.POLL_INTERVAL", 0.1), \
             patch("apps.common.sse.KEEPALIVE_INTERVAL", 100), \
             patch("apps.common.sse._connection_count", 1):
            async for chunk in _async_event_stream(user_id):
                chunks.append(chunk)
                # Stop after collecting events to avoid waiting for timeout
                if len(chunks) >= len(mock_events) + 5:
                    break

        return chunks


# ---------------------------------------------------------------------------
# Helpers for Property 2
# ---------------------------------------------------------------------------


def _make_ordered_mock_events(user_id, count, base_time=None):
    """Create a list of mock SSEEvent objects with strictly ordered created_at timestamps."""
    from datetime import timedelta

    if base_time is None:
        base_time = datetime(2024, 1, 1, 0, 0, 0, tzinfo=timezone.utc)

    events = []
    for i in range(count):
        ev = MagicMock()
        ev.id = uuid.uuid4()
        ev.user_id = user_id
        ev.event_type = "notification"
        ev.payload = {"index": i}
        ev.entity_id = None
        ev.delivered = False
        ev.delivered_at = None
        ev.created_at = base_time + timedelta(seconds=i + 1)
        events.append(ev)
    return events


# ---------------------------------------------------------------------------
# Property 2: Last-Event-ID filtering for SSE stream
# Feature: realtime-sse-system, Property 2: Last-Event-ID filtering for SSE stream
# ---------------------------------------------------------------------------


class TestLastEventIDFiltering(SimpleTestCase):
    """Property 2: Last-Event-ID filtering for SSE stream.

    For any set of SSEEvent rows and any valid Last-Event-ID value
    corresponding to an existing event's UUID, the SSE stream should yield
    only events whose created_at is strictly after the referenced event's
    created_at.

    **Validates: Requirements 1.5**
    """

    @given(data=st.data())
    @_pbt_settings
    def test_stream_yields_only_events_after_last_event_id(self, data):
        """Feature: realtime-sse-system, Property 2: Last-Event-ID filtering for SSE stream

        For any set of SSEEvent rows and any valid Last-Event-ID value
        corresponding to an existing event's UUID, the SSE stream should
        yield only events whose created_at is strictly after the referenced
        event's created_at.
        """
        user_id = data.draw(st.uuids(), label="user_id")
        event_count = data.draw(st.integers(min_value=2, max_value=20), label="event_count")

        # Build ordered mock events
        all_events = _make_ordered_mock_events(user_id, event_count)

        # Pick one event as the "last event" reference (not the last one,
        # so there are always events after it)
        last_event_index = data.draw(
            st.integers(min_value=0, max_value=event_count - 2),
            label="last_event_index",
        )
        reference_event = all_events[last_event_index]
        after_created_at = reference_event.created_at

        # Expected: only events with created_at strictly after the reference
        expected_events = [
            ev for ev in all_events if ev.created_at > after_created_at
        ]

        # Run the stream and collect output
        yielded_chunks = asyncio.run(
            self._collect_filtered_stream(user_id, all_events, after_created_at)
        )
        full_output = "".join(yielded_chunks)

        # Verify only expected events appear
        for ev in expected_events:
            expected_id_line = f"id: {ev.id}"
            assert expected_id_line in full_output, (
                f"Expected event {ev.id} (created_at={ev.created_at}) "
                f"not found in stream output after reference "
                f"created_at={after_created_at}."
            )

        # Verify excluded events do NOT appear
        excluded_events = [
            ev for ev in all_events if ev.created_at <= after_created_at
        ]
        for ev in excluded_events:
            excluded_id_line = f"id: {ev.id}"
            assert excluded_id_line not in full_output, (
                f"Event {ev.id} (created_at={ev.created_at}) should NOT "
                f"appear in stream output. Reference created_at="
                f"{after_created_at}."
            )

    async def _collect_filtered_stream(self, user_id, all_events, after_created_at):
        """Run _async_event_stream with after_created_at and collect yielded chunks.

        The mock _fetch_undelivered_events applies the same created_at > filter
        that the real implementation uses, so the stream only sees events after
        the reference timestamp.
        """
        from apps.common.sse import _async_event_stream

        call_count = 0

        async def mock_fetch(uid, after_ts=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                # Simulate the DB filter: only return events after after_ts
                if after_ts is not None:
                    return [ev for ev in all_events if ev.created_at > after_ts]
                return list(all_events)
            return []

        async def mock_mark_delivered(event_ids):
            pass

        chunks = []
        with patch("apps.common.sse._fetch_undelivered_events", side_effect=mock_fetch), \
             patch("apps.common.sse._mark_events_delivered", side_effect=mock_mark_delivered), \
             patch("apps.common.sse.MAX_DURATION", 1), \
             patch("apps.common.sse.POLL_INTERVAL", 0.1), \
             patch("apps.common.sse.KEEPALIVE_INTERVAL", 100), \
             patch("apps.common.sse._connection_count", 1):
            async for chunk in _async_event_stream(user_id, after_created_at):
                chunks.append(chunk)
                if len(chunks) >= 50:
                    break

        return chunks


# ---------------------------------------------------------------------------
# Property 6: Delivery marking after retrieval
# Feature: realtime-sse-system, Property 6: Delivery marking after retrieval
# ---------------------------------------------------------------------------


class TestDeliveryMarkingAfterRetrieval(SimpleTestCase):
    """Property 6: Delivery marking after retrieval.

    For any event returned by either the SSE stream or the poll endpoint,
    that event's delivered field should be true and delivered_at should be
    set to a non-null timestamp after the retrieval completes.

    **Validates: Requirements 2.3, 3.3**
    """

    # --- SSE stream: _mark_events_delivered is called with correct IDs ---

    @given(
        user_id=st.uuids(),
        event_tuples=_mock_events_strategy,
    )
    @_pbt_settings
    def test_sse_stream_marks_events_delivered_with_correct_ids(
        self, user_id, event_tuples
    ):
        """Feature: realtime-sse-system, Property 6: Delivery marking after retrieval

        After _async_event_stream yields events, _mark_events_delivered should
        be called with exactly the IDs of the yielded events.
        """
        mock_events = [
            _make_mock_event(
                event_id=eid, user_id=user_id, event_type=etype,
                payload=pay, entity_id=entid,
            )
            for eid, etype, pay, entid in event_tuples
        ]

        marked_ids = asyncio.run(
            self._collect_marked_ids_from_stream(user_id, mock_events)
        )

        expected_ids = [ev.id for ev in mock_events]
        assert sorted(str(i) for i in marked_ids) == sorted(
            str(i) for i in expected_ids
        ), (
            f"Expected _mark_events_delivered to be called with IDs "
            f"{expected_ids}, but got {marked_ids}."
        )

    async def _collect_marked_ids_from_stream(self, user_id, mock_events):
        """Run _async_event_stream and capture all event IDs passed to
        _mark_events_delivered."""
        from apps.common.sse import _async_event_stream

        call_count = 0
        all_marked_ids = []

        async def mock_fetch(uid, after_created_at=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return mock_events
            return []

        async def mock_mark_delivered(event_ids):
            all_marked_ids.extend(event_ids)

        chunks = []
        with patch("apps.common.sse._fetch_undelivered_events", side_effect=mock_fetch), \
             patch("apps.common.sse._mark_events_delivered", side_effect=mock_mark_delivered), \
             patch("apps.common.sse.MAX_DURATION", 1), \
             patch("apps.common.sse.POLL_INTERVAL", 0.1), \
             patch("apps.common.sse.KEEPALIVE_INTERVAL", 100), \
             patch("apps.common.sse._connection_count", 1):
            async for chunk in _async_event_stream(user_id):
                chunks.append(chunk)
                if len(chunks) >= len(mock_events) + 5:
                    break

        return all_marked_ids

    # --- Poll endpoint: update() marks events as delivered ---

    @given(
        user_id=st.uuids(),
        event_tuples=st.lists(
            st.tuples(
                st.uuids(), _event_types, _payloads, st.one_of(st.none(), st.uuids())
            ),
            min_size=1,
            max_size=20,
        ),
    )
    @_pbt_settings
    def test_poll_endpoint_marks_returned_events_as_delivered(
        self, user_id, event_tuples
    ):
        """Feature: realtime-sse-system, Property 6: Delivery marking after retrieval

        After SSEPollView.get() returns events, the update() call should set
        delivered=True and delivered_at to a non-null timestamp for exactly
        the returned event IDs.
        """
        from apps.common.sse import SSEPollView

        mock_events = [
            _make_mock_event(
                event_id=eid, user_id=user_id, event_type=etype,
                payload=pay, entity_id=entid,
            )
            for eid, etype, pay, entid in event_tuples
        ]

        # Build a mock queryset that supports chaining
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.__getitem__ = MagicMock(return_value=mock_events)

        # Track the update() call on the filtered-by-id queryset
        update_qs = MagicMock()
        update_kwargs = {}

        def capture_update(**kwargs):
            update_kwargs.update(kwargs)

        update_qs.update = MagicMock(side_effect=capture_update)

        # SSEEvent.objects.filter() is called twice:
        # 1) filter(user_id=..., delivered=False) -> chained qs
        # 2) filter(id__in=...) -> update_qs for marking delivered
        filter_call_count = [0]
        original_filter = mock_qs.filter

        def smart_filter(**kwargs):
            filter_call_count[0] += 1
            if "id__in" in kwargs:
                # This is the delivery-marking call
                return update_qs
            return mock_qs

        mock_qs.filter = MagicMock(side_effect=smart_filter)

        # Build a mock request
        mock_request = MagicMock()
        mock_request.user.pk = user_id
        mock_request.query_params = {}

        view = SSEPollView()
        with patch("apps.common.sse.SSEEvent.objects", mock_qs):
            response = view.get(mock_request)

        # Verify response contains events
        assert response.data["success"] is True
        assert len(response.data["data"]["events"]) == len(mock_events)

        # Verify update() was called with delivered=True and a non-null delivered_at
        assert update_qs.update.called, (
            "SSEEvent.objects.filter(id__in=...).update() was not called — "
            "events were not marked as delivered."
        )
        assert update_kwargs.get("delivered") is True, (
            f"Expected delivered=True in update() call, got {update_kwargs}"
        )
        assert update_kwargs.get("delivered_at") is not None, (
            "Expected delivered_at to be a non-null timestamp in update() call, "
            f"got {update_kwargs.get('delivered_at')}"
        )


# ---------------------------------------------------------------------------
# Property 7: Poll returns at most 50 events ordered ascending
# Feature: realtime-sse-system, Property 7: Poll returns at most 50 events ordered ascending
# ---------------------------------------------------------------------------


class TestPollMaxEventsAndOrdering(SimpleTestCase):
    """Property 7: Poll returns at most 50 events ordered ascending.

    For any number of undelivered events for a user (including more than 50),
    the poll endpoint should return at most 50 events, and those events should
    be ordered by created_at ascending.

    **Validates: Requirements 2.4**
    """

    @given(
        user_id=st.uuids(),
        event_count=st.integers(min_value=0, max_value=100),
    )
    @_pbt_settings
    def test_poll_returns_at_most_50_events_ordered_ascending(
        self, user_id, event_count
    ):
        """Feature: realtime-sse-system, Property 7: Poll returns at most 50 events ordered ascending

        For any number of undelivered events for a user (including more
        than 50), the poll endpoint should return at most 50 events, and
        those events should be ordered by created_at ascending.
        """
        from apps.common.sse import SSEPollView

        # Build ordered mock events
        all_events = _make_ordered_mock_events(user_id, event_count)

        # The real ORM chain is:
        #   qs = SSEEvent.objects.filter(user_id=..., delivered=False)
        #        .order_by("created_at")
        #   events = list(qs[:POLL_MAX_EVENTS])
        #
        # We mock the queryset so __getitem__ (slice) returns the first 50.
        expected_returned = all_events[:50]

        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.__getitem__ = MagicMock(return_value=expected_returned)

        # Track update() for delivery marking (not the focus, but needed
        # so the view doesn't crash)
        update_qs = MagicMock()
        update_qs.update = MagicMock()

        original_filter = mock_qs.filter

        def smart_filter(**kwargs):
            if "id__in" in kwargs:
                return update_qs
            return mock_qs

        mock_qs.filter = MagicMock(side_effect=smart_filter)

        # Build a mock request
        mock_request = MagicMock()
        mock_request.user.pk = user_id
        mock_request.query_params = {}

        view = SSEPollView()
        with patch("apps.common.sse.SSEEvent.objects", mock_qs):
            response = view.get(mock_request)

        # --- Assertions ---
        assert response.data["success"] is True

        returned_events = response.data["data"]["events"]

        # At most 50 events
        assert len(returned_events) <= 50, (
            f"Poll returned {len(returned_events)} events, expected at most 50. "
            f"Total undelivered: {event_count}."
        )

        # Correct count: min(event_count, 50)
        expected_count = min(event_count, 50)
        assert len(returned_events) == expected_count, (
            f"Poll returned {len(returned_events)} events, expected "
            f"{expected_count} (total undelivered: {event_count})."
        )

        # Events are ordered by created_at ascending
        if len(returned_events) > 1:
            created_at_values = [e["created_at"] for e in returned_events]
            for i in range(len(created_at_values) - 1):
                assert created_at_values[i] <= created_at_values[i + 1], (
                    f"Events not in ascending created_at order at index {i}: "
                    f"{created_at_values[i]} > {created_at_values[i + 1]}"
                )


# ---------------------------------------------------------------------------
# Property 20: Connection capacity limit
# Feature: realtime-sse-system, Property 20: Connection capacity limit
# ---------------------------------------------------------------------------


class TestConnectionCapacityLimit(SimpleTestCase):
    """Property 20: Connection capacity limit.

    For any number of concurrent SSE connection attempts exceeding 50,
    the excess connections should receive HTTP 503 with a Retry-After: 5
    header, while the first 50 connections should proceed normally.

    **Validates: Requirements 11.1**
    """

    @given(
        user_id=st.uuids(),
        connection_count=st.integers(min_value=50, max_value=500),
    )
    @_pbt_settings
    def test_at_capacity_returns_503_with_retry_after(self, user_id, connection_count):
        """Feature: realtime-sse-system, Property 20: Connection capacity limit

        When _connection_count >= 50, sse_stream_view should return HTTP 503
        with a Retry-After: 5 header.
        """
        response = asyncio.run(
            self._call_sse_stream_view(str(user_id), connection_count)
        )

        assert response.status_code == 503, (
            f"Expected 503 when connection_count={connection_count}, "
            f"got {response.status_code}."
        )
        assert response["Retry-After"] == "5", (
            f"Expected Retry-After: 5 header, got {response.get('Retry-After')}."
        )

        # Verify the response body contains the expected error
        body = json.loads(response.content)
        assert body["success"] is False
        assert body["code"] == "CAPACITY_EXCEEDED"

    @given(
        user_id=st.uuids(),
        connection_count=st.integers(min_value=0, max_value=49),
    )
    @_pbt_settings
    def test_under_capacity_returns_streaming_response(self, user_id, connection_count):
        """Feature: realtime-sse-system, Property 20: Connection capacity limit

        When _connection_count < 50, sse_stream_view should return a
        StreamingHttpResponse (not 503).
        """
        response = asyncio.run(
            self._call_sse_stream_view(str(user_id), connection_count)
        )

        assert isinstance(response, StreamingHttpResponse), (
            f"Expected StreamingHttpResponse when connection_count="
            f"{connection_count}, got {type(response).__name__} "
            f"(status={getattr(response, 'status_code', 'N/A')})."
        )
        assert response["Content-Type"] == "text/event-stream"

    async def _call_sse_stream_view(self, user_id, connection_count):
        """Call sse_stream_view with mocked auth and a specific connection count."""
        from apps.common.sse import sse_stream_view

        mock_request = MagicMock()
        mock_request.COOKIES = {"access_token": "mock-token"}
        mock_request.META = {}

        async def mock_fetch(uid, after_created_at=None):
            return []

        async def mock_mark_delivered(event_ids):
            pass

        with patch("apps.common.sse._authenticate_from_cookie", return_value=user_id), \
             patch("apps.common.sse._connection_count", connection_count), \
             patch("apps.common.sse._fetch_undelivered_events", side_effect=mock_fetch), \
             patch("apps.common.sse._mark_events_delivered", side_effect=mock_mark_delivered), \
             patch("apps.common.sse.MAX_DURATION", 0.1), \
             patch("apps.common.sse.POLL_INTERVAL", 0.05), \
             patch("apps.common.sse.KEEPALIVE_INTERVAL", 100):
            response = await sse_stream_view(mock_request)

        return response
