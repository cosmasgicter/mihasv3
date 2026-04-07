"""Property-based tests for the SSE event cleanup task.

# Feature: realtime-sse-system, Property 10: Cleanup removes events older than 7 days
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import uuid  # noqa: E402
from datetime import timedelta  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from django.utils import timezone  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

_pbt_settings = settings(max_examples=100, deadline=None)

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

_days_offsets = st.integers(min_value=-30, max_value=30)
_delivered_states = st.booleans()


def _make_event(days_offset, delivered, now):
    """Build a mock SSEEvent with a created_at relative to `now`."""
    event = MagicMock()
    event.id = uuid.uuid4()
    event.delivered = delivered
    event.created_at = now + timedelta(days=days_offset)
    if delivered:
        event.delivered_at = event.created_at + timedelta(minutes=5)
    else:
        event.delivered_at = None
    return event


class _OneShotSliceable:
    """Supports qs[:N] returning a real list. Returns id_list on first
    slice, then [] on subsequent slices to break the while-True loop."""

    def __init__(self, id_list):
        self._id_list = id_list
        self._called = False

    def __getitem__(self, key):
        if not self._called:
            self._called = True
            return list(self._id_list)
        return []


class _EmptySliceable:
    """Always returns [] on slice."""

    def __getitem__(self, key):
        return []


# ---------------------------------------------------------------------------
# Property 10: Cleanup removes events older than 7 days
# ---------------------------------------------------------------------------


class TestCleanupRemovesEventsOlderThan7Days(SimpleTestCase):
    """Property 10: Cleanup removes events older than 7 days.

    For any set of SSEEvent rows with varying created_at timestamps and
    delivered states, the cleanup task should delete all rows where
    created_at is older than 7 days — regardless of whether they are
    delivered or undelivered — and should not delete any rows newer than
    7 days.

    **Validates: Requirements 3.5, 3.6**
    """

    @given(
        event_specs=st.lists(
            st.tuples(_days_offsets, _delivered_states),
            min_size=1,
            max_size=30,
        ),
    )
    @_pbt_settings
    def test_cleanup_deletes_only_events_older_than_7_days(self, event_specs):
        """Feature: realtime-sse-system, Property 10: Cleanup removes events older than 7 days

        For any mix of delivered/undelivered events with varying ages,
        the cleanup task targets only events older than 7 days for
        deletion, regardless of delivery state.
        """
        now = timezone.now()
        cutoff = now - timedelta(days=7)

        events = [_make_event(offset, delivered, now) for offset, delivered in event_specs]

        old_delivered = [e for e in events if e.delivered and e.delivered_at < cutoff]
        old_undelivered = [e for e in events if not e.delivered and e.created_at < cutoff]

        delivered_old_ids = [e.id for e in old_delivered]
        undelivered_old_ids = [e.id for e in old_undelivered]

        deleted_ids = []

        delivered_sliceable = _OneShotSliceable(delivered_old_ids)
        undelivered_sliceable = _OneShotSliceable(undelivered_old_ids)

        with patch("apps.common.models.SSEEvent.objects") as mock_objects, \
             patch("apps.common.tasks.timezone") as mock_tz:
            mock_tz.now.return_value = now

            def filter_side_effect(**kwargs):
                if "id__in" in kwargs:
                    deleted_ids.extend(kwargs["id__in"])
                    delete_qs = MagicMock()
                    delete_qs.delete.return_value = (len(kwargs["id__in"]), {})
                    return delete_qs

                qs = MagicMock()
                if kwargs.get("delivered") is True and "delivered_at__lt" in kwargs:
                    qs.values_list.return_value = delivered_sliceable
                elif kwargs.get("delivered") is False and "created_at__lt" in kwargs:
                    qs.values_list.return_value = undelivered_sliceable
                else:
                    qs.values_list.return_value = _EmptySliceable()
                return qs

            mock_objects.filter.side_effect = filter_side_effect

            from apps.common.tasks import cleanup_sse_events_task

            cleanup_sse_events_task()

            expected_deleted = set(delivered_old_ids + undelivered_old_ids)
            actual_deleted = set(deleted_ids)

            assert expected_deleted == actual_deleted, (
                f"Expected to delete {expected_deleted}, but deleted {actual_deleted}"
            )

            # Recent events should NOT appear in deleted set
            recent_events = [
                e for e in events
                if e not in old_delivered and e not in old_undelivered
            ]
            recent_ids = set(e.id for e in recent_events)
            wrongly_deleted = recent_ids & actual_deleted
            assert not wrongly_deleted, (
                f"Recent events were wrongly deleted: {wrongly_deleted}"
            )

    @given(
        num_recent=st.integers(min_value=1, max_value=20),
    )
    @_pbt_settings
    def test_cleanup_does_not_delete_recent_events(self, num_recent):
        """Feature: realtime-sse-system, Property 10: Cleanup removes events older than 7 days

        When all events are newer than 7 days, the cleanup task should
        not delete anything.
        """
        now = timezone.now()
        deleted_ids = []

        with patch("apps.common.models.SSEEvent.objects") as mock_objects, \
             patch("apps.common.tasks.timezone") as mock_tz:
            mock_tz.now.return_value = now

            def filter_side_effect(**kwargs):
                if "id__in" in kwargs:
                    deleted_ids.extend(kwargs["id__in"])
                    delete_qs = MagicMock()
                    delete_qs.delete.return_value = (len(kwargs["id__in"]), {})
                    return delete_qs

                qs = MagicMock()
                qs.values_list.return_value = _EmptySliceable()
                return qs

            mock_objects.filter.side_effect = filter_side_effect

            from apps.common.tasks import cleanup_sse_events_task

            cleanup_sse_events_task()

            assert len(deleted_ids) == 0, (
                f"No events should be deleted when all are recent, but got {deleted_ids}"
            )
