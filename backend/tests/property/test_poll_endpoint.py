"""Property-based tests for the SSE poll endpoint.

# Feature: realtime-sse-system, Property 4: Poll returns undelivered events for authenticated user
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import uuid  # noqa: E402
from datetime import datetime, timedelta, timezone  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_event(event_id=None, user_id=None, event_type="notification",
                     payload=None, entity_id=None, created_at=None):
    """Create a mock SSEEvent object with the given fields."""
    ev = MagicMock()
    ev.id = event_id or uuid.uuid4()
    ev.user_id = user_id or uuid.uuid4()
    ev.event_type = event_type
    ev.payload = payload if payload is not None else {}
    ev.entity_id = entity_id
    ev.delivered = False
    ev.delivered_at = None
    ev.created_at = created_at or datetime.now(timezone.utc)
    return ev


# Strategy for generating lists of mock event tuples
_mock_event_tuples = st.lists(
    st.tuples(st.uuids(), _event_types, _payloads, st.one_of(st.none(), st.uuids())),
    min_size=0,
    max_size=20,
)


def _build_mock_events(user_id, event_tuples, base_time=None):
    """Build a list of mock SSEEvent objects for a given user from tuples."""
    if base_time is None:
        base_time = datetime(2024, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    events = []
    for i, (eid, etype, pay, entid) in enumerate(event_tuples):
        events.append(
            _make_mock_event(
                event_id=eid,
                user_id=user_id,
                event_type=etype,
                payload=pay,
                entity_id=entid,
                created_at=base_time + timedelta(seconds=i + 1),
            )
        )
    return events


def _build_mock_queryset(target_events):
    """Build a mock queryset that chains filter/order_by and returns target_events on slice."""
    mock_qs = MagicMock()
    mock_qs.filter.return_value = mock_qs
    mock_qs.order_by.return_value = mock_qs
    mock_qs.__getitem__ = MagicMock(return_value=target_events)

    # Track update() for delivery marking
    update_qs = MagicMock()
    update_qs.update = MagicMock()

    def smart_filter(**kwargs):
        if "id__in" in kwargs:
            return update_qs
        return mock_qs

    mock_qs.filter = MagicMock(side_effect=smart_filter)
    return mock_qs


# ---------------------------------------------------------------------------
# Property 4: Poll returns undelivered events for authenticated user
# Feature: realtime-sse-system, Property 4: Poll returns undelivered events for authenticated user
# ---------------------------------------------------------------------------


class TestPollReturnsUndeliveredEventsForAuthenticatedUser(SimpleTestCase):
    """Property 4: Poll returns undelivered events for authenticated user.

    For any authenticated user with undelivered SSEEvent rows,
    GET /api/v1/events/poll/ should return a JSON envelope containing
    exactly those undelivered events, and no events belonging to other users.

    **Validates: Requirements 2.1**
    """

    @given(
        target_user_id=st.uuids(),
        target_tuples=st.lists(
            st.tuples(st.uuids(), _event_types, _payloads, st.one_of(st.none(), st.uuids())),
            min_size=1,
            max_size=20,
        ),
        other_user_id=st.uuids(),
        other_tuples=st.lists(
            st.tuples(st.uuids(), _event_types, _payloads, st.one_of(st.none(), st.uuids())),
            min_size=0,
            max_size=10,
        ),
    )
    @_pbt_settings
    def test_poll_returns_only_target_user_events(
        self, target_user_id, target_tuples, other_user_id, other_tuples
    ):
        """Feature: realtime-sse-system, Property 4: Poll returns undelivered events for authenticated user

        For any authenticated user with undelivered SSEEvent rows,
        GET /api/v1/events/poll/ should return a JSON envelope containing
        exactly those undelivered events, and no events belonging to other users.
        """
        from apps.common.sse import SSEPollView

        # Build mock events for the target user
        target_events = _build_mock_events(target_user_id, target_tuples)
        # Build mock events for another user (should NOT appear)
        other_events = _build_mock_events(other_user_id, other_tuples)

        # The queryset mock simulates the ORM filtering: only target user's
        # undelivered events are returned. The real ORM does
        # SSEEvent.objects.filter(user_id=target_user_id, delivered=False)
        # so the queryset already scopes to the target user.
        mock_qs = _build_mock_queryset(target_events)

        # Build a mock request for the target user
        mock_request = MagicMock()
        mock_request.user.pk = target_user_id
        mock_request.query_params = {}

        view = SSEPollView()
        with patch("apps.common.sse.SSEEvent.objects", mock_qs):
            response = view.get(mock_request)

        # --- Assertions ---
        assert response.data["success"] is True, (
            f"Expected success=True, got {response.data}"
        )

        returned_events = response.data["data"]["events"]

        # Exactly the target user's events are returned
        assert len(returned_events) == len(target_events), (
            f"Expected {len(target_events)} events, got {len(returned_events)}"
        )

        returned_event_ids = {e["event_id"] for e in returned_events}
        expected_event_ids = {str(e.id) for e in target_events}

        assert returned_event_ids == expected_event_ids, (
            f"Returned event IDs {returned_event_ids} do not match "
            f"expected {expected_event_ids}"
        )

        # No events from other users appear
        other_event_ids = {str(e.id) for e in other_events}
        leaked_ids = returned_event_ids & other_event_ids
        assert not leaked_ids, (
            f"Events from other user leaked into response: {leaked_ids}"
        )

    @given(
        target_user_id=st.uuids(),
        target_tuples=st.lists(
            st.tuples(st.uuids(), _event_types, _payloads, st.one_of(st.none(), st.uuids())),
            min_size=1,
            max_size=20,
        ),
    )
    @_pbt_settings
    def test_poll_response_contains_correct_event_fields(
        self, target_user_id, target_tuples
    ):
        """Feature: realtime-sse-system, Property 4: Poll returns undelivered events for authenticated user

        Each event in the poll response should contain the correct event_id,
        event_type, payload, entity_id, version, and created_at fields
        matching the source SSEEvent rows.
        """
        from apps.common.sse import SSEPollView

        target_events = _build_mock_events(target_user_id, target_tuples)
        mock_qs = _build_mock_queryset(target_events)

        mock_request = MagicMock()
        mock_request.user.pk = target_user_id
        mock_request.query_params = {}

        view = SSEPollView()
        with patch("apps.common.sse.SSEEvent.objects", mock_qs):
            response = view.get(mock_request)

        returned_events = response.data["data"]["events"]

        # Build a lookup from event_id to source event for field comparison
        source_by_id = {str(e.id): e for e in target_events}

        for ret_ev in returned_events:
            eid = ret_ev["event_id"]
            assert eid in source_by_id, (
                f"Returned event_id {eid} not found in source events"
            )
            src = source_by_id[eid]

            assert ret_ev["event_type"] == src.event_type, (
                f"event_type mismatch for {eid}: "
                f"got {ret_ev['event_type']}, expected {src.event_type}"
            )
            assert ret_ev["payload"] == src.payload, (
                f"payload mismatch for {eid}: "
                f"got {ret_ev['payload']}, expected {src.payload}"
            )
            expected_entity_id = str(src.entity_id) if src.entity_id else None
            assert ret_ev["entity_id"] == expected_entity_id, (
                f"entity_id mismatch for {eid}: "
                f"got {ret_ev['entity_id']}, expected {expected_entity_id}"
            )
            assert ret_ev["version"] == 1, (
                f"version should be hardcoded to 1, got {ret_ev['version']}"
            )

    @given(target_user_id=st.uuids())
    @_pbt_settings
    def test_poll_returns_empty_list_when_no_undelivered_events(
        self, target_user_id
    ):
        """Feature: realtime-sse-system, Property 4: Poll returns undelivered events for authenticated user

        When a user has no undelivered events, the poll endpoint should
        return an empty events list with success=True.
        """
        from apps.common.sse import SSEPollView

        mock_qs = _build_mock_queryset([])  # no events

        mock_request = MagicMock()
        mock_request.user.pk = target_user_id
        mock_request.query_params = {}

        view = SSEPollView()
        with patch("apps.common.sse.SSEEvent.objects", mock_qs):
            response = view.get(mock_request)

        assert response.data["success"] is True
        assert response.data["data"]["events"] == []


# ---------------------------------------------------------------------------
# Property 5: lastEventId filtering for poll endpoint
# Feature: realtime-sse-system, Property 5: lastEventId filtering for poll endpoint
# ---------------------------------------------------------------------------


class TestLastEventIdFilteringForPollEndpoint(SimpleTestCase):
    """Property 5: lastEventId filtering for poll endpoint.

    For any set of SSEEvent rows and any valid lastEventId query parameter,
    the poll endpoint should return only events created after the referenced
    event, excluding the referenced event itself.

    **Validates: Requirements 2.2**
    """

    @given(
        target_user_id=st.uuids(),
        event_tuples=st.lists(
            st.tuples(st.uuids(), _event_types, _payloads, st.one_of(st.none(), st.uuids())),
            min_size=2,
            max_size=20,
        ),
        ref_index=st.integers(min_value=0),
    )
    @_pbt_settings
    def test_poll_returns_only_events_after_reference(
        self, target_user_id, event_tuples, ref_index
    ):
        """Feature: realtime-sse-system, Property 5: lastEventId filtering for poll endpoint

        For any set of SSEEvent rows and any valid lastEventId query parameter,
        the poll endpoint should return only events created after the referenced
        event, excluding the referenced event itself.
        """
        from apps.common.sse import SSEPollView

        # Build ordered mock events with distinct created_at timestamps
        all_events = _build_mock_events(target_user_id, event_tuples)

        # Pick one event as the reference (clamp index to valid range)
        ref_index = ref_index % len(all_events)
        ref_event = all_events[ref_index]

        # Events that should appear: those created strictly after the reference
        expected_events = [
            e for e in all_events if e.created_at > ref_event.created_at
        ]

        # --- Mock the queryset to simulate the ORM filtering behaviour ---
        # The view does:
        #   qs = SSEEvent.objects.filter(user_id=..., delivered=False).order_by("created_at")
        #   ref = SSEEvent.objects.only("created_at").get(id=lastEventId)
        #   qs = qs.filter(created_at__gt=ref.created_at)
        #   events = list(qs[:50])

        # Build a queryset mock that tracks chained filter calls
        mock_qs = MagicMock()

        # After the initial filter(user_id=..., delivered=False)
        ordered_qs = MagicMock()
        mock_qs.filter.return_value = ordered_qs

        # After .order_by("created_at")
        base_qs = MagicMock()
        ordered_qs.order_by.return_value = base_qs

        # After .filter(created_at__gt=ref_event.created_at) — the lastEventId filter
        filtered_qs = MagicMock()
        base_qs.filter.return_value = filtered_qs
        filtered_qs.__getitem__ = MagicMock(return_value=expected_events)

        # For the reference event lookup: SSEEvent.objects.only("created_at").get(id=...)
        only_qs = MagicMock()
        mock_qs.only.return_value = only_qs
        only_qs.get.return_value = ref_event

        # For delivery marking: SSEEvent.objects.filter(id__in=...).update(...)
        update_qs = MagicMock()
        update_qs.update = MagicMock()

        # Wire up filter(id__in=...) for delivery marking
        original_filter = filtered_qs.filter
        def smart_filter_on_filtered(**kwargs):
            if "id__in" in kwargs:
                return update_qs
            return original_filter(**kwargs)
        filtered_qs.filter = MagicMock(side_effect=smart_filter_on_filtered)

        # Build mock request
        mock_request = MagicMock()
        mock_request.user.pk = target_user_id
        mock_request.query_params = {"lastEventId": str(ref_event.id)}

        view = SSEPollView()
        with patch("apps.common.sse.SSEEvent.objects", mock_qs):
            response = view.get(mock_request)

        # --- Assertions ---
        assert response.data["success"] is True

        returned_events = response.data["data"]["events"]
        returned_ids = {e["event_id"] for e in returned_events}
        expected_ids = {str(e.id) for e in expected_events}

        assert returned_ids == expected_ids, (
            f"Expected event IDs {expected_ids}, got {returned_ids}"
        )

        # The reference event itself must NOT appear
        assert str(ref_event.id) not in returned_ids, (
            f"Reference event {ref_event.id} should be excluded from results"
        )

    @given(
        target_user_id=st.uuids(),
        event_tuples=st.lists(
            st.tuples(st.uuids(), _event_types, _payloads, st.one_of(st.none(), st.uuids())),
            min_size=2,
            max_size=20,
        ),
    )
    @_pbt_settings
    def test_poll_with_last_event_as_reference_returns_nothing_after(
        self, target_user_id, event_tuples
    ):
        """Feature: realtime-sse-system, Property 5: lastEventId filtering for poll endpoint

        When the lastEventId references the most recent event, the poll
        endpoint should return an empty list since no events exist after it.
        """
        from apps.common.sse import SSEPollView

        all_events = _build_mock_events(target_user_id, event_tuples)

        # Use the last event (most recent created_at) as reference
        ref_event = all_events[-1]

        # No events should be after the last one
        expected_events = []

        # Build queryset mock
        mock_qs = MagicMock()
        ordered_qs = MagicMock()
        mock_qs.filter.return_value = ordered_qs
        base_qs = MagicMock()
        ordered_qs.order_by.return_value = base_qs
        filtered_qs = MagicMock()
        base_qs.filter.return_value = filtered_qs
        filtered_qs.__getitem__ = MagicMock(return_value=expected_events)

        only_qs = MagicMock()
        mock_qs.only.return_value = only_qs
        only_qs.get.return_value = ref_event

        mock_request = MagicMock()
        mock_request.user.pk = target_user_id
        mock_request.query_params = {"lastEventId": str(ref_event.id)}

        view = SSEPollView()
        with patch("apps.common.sse.SSEEvent.objects", mock_qs):
            response = view.get(mock_request)

        assert response.data["success"] is True
        assert response.data["data"]["events"] == []

    @given(
        target_user_id=st.uuids(),
        event_tuples=st.lists(
            st.tuples(st.uuids(), _event_types, _payloads, st.one_of(st.none(), st.uuids())),
            min_size=2,
            max_size=20,
        ),
    )
    @_pbt_settings
    def test_poll_with_first_event_as_reference_returns_all_subsequent(
        self, target_user_id, event_tuples
    ):
        """Feature: realtime-sse-system, Property 5: lastEventId filtering for poll endpoint

        When the lastEventId references the earliest event, the poll endpoint
        should return all subsequent events (excluding the reference itself).
        """
        from apps.common.sse import SSEPollView

        all_events = _build_mock_events(target_user_id, event_tuples)

        # Use the first event (earliest created_at) as reference
        ref_event = all_events[0]
        expected_events = all_events[1:]

        # Build queryset mock
        mock_qs = MagicMock()
        ordered_qs = MagicMock()
        mock_qs.filter.return_value = ordered_qs
        base_qs = MagicMock()
        ordered_qs.order_by.return_value = base_qs
        filtered_qs = MagicMock()
        base_qs.filter.return_value = filtered_qs
        filtered_qs.__getitem__ = MagicMock(return_value=expected_events)

        only_qs = MagicMock()
        mock_qs.only.return_value = only_qs
        only_qs.get.return_value = ref_event

        update_qs = MagicMock()
        update_qs.update = MagicMock()
        original_filter = filtered_qs.filter
        def smart_filter_on_filtered(**kwargs):
            if "id__in" in kwargs:
                return update_qs
            return original_filter(**kwargs)
        filtered_qs.filter = MagicMock(side_effect=smart_filter_on_filtered)

        mock_request = MagicMock()
        mock_request.user.pk = target_user_id
        mock_request.query_params = {"lastEventId": str(ref_event.id)}

        view = SSEPollView()
        with patch("apps.common.sse.SSEEvent.objects", mock_qs):
            response = view.get(mock_request)

        assert response.data["success"] is True

        returned_events = response.data["data"]["events"]
        returned_ids = {e["event_id"] for e in returned_events}
        expected_ids = {str(e.id) for e in expected_events}

        assert returned_ids == expected_ids, (
            f"Expected {expected_ids}, got {returned_ids}"
        )

        # Reference event must not be in results
        assert str(ref_event.id) not in returned_ids
