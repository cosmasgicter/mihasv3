"""Property-based tests for SSE removal — Celery Beat schedule preservation.

Verifies that the Celery Beat schedule retains all non-SSE entries with correct
task paths and schedules after the SSE-related entries have been removed.

Feature: sse-removal-simplification, Property 1: Celery Beat schedule preserves non-SSE entries

**Validates: Requirements 2.3**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from config.settings.base import CELERY_BEAT_SCHEDULE  # noqa: E402

_default_settings = settings(max_examples=5, deadline=None)

# ---------------------------------------------------------------------------
# Expected non-SSE entries with their canonical task paths
# ---------------------------------------------------------------------------

EXPECTED_NON_SSE_ENTRIES = {
    "check-uptime": "apps.common.tasks.check_uptime_task",
    "cleanup-audit-logs": "apps.common.tasks.cleanup_audit_logs_task",
    "poll-pending-payments": "apps.documents.tasks.poll_pending_payments_task",
    "manage-intakes": "apps.catalog.tasks.intake_manager_task",
    "keep-alive": "apps.common.tasks.keep_alive_task",
}

# SSE-related entry keys that must NOT be present
SSE_ENTRY_KEYS = {
    "cleanup-sse-events",
    "send-deadline-reminders",
    "send-stale-draft-reminders",
}

# Strategy: random non-empty subsets of the expected non-SSE entry keys
_non_sse_subsets = st.lists(
    st.sampled_from(sorted(EXPECTED_NON_SSE_ENTRIES.keys())),
    min_size=1,
    max_size=len(EXPECTED_NON_SSE_ENTRIES),
    unique=True,
)


# =========================================================================
# Property 1: Celery Beat schedule preserves non-SSE entries
# =========================================================================


class TestCeleryBeatSchedulePreservesNonSSEEntries(SimpleTestCase):
    """Property 1: Celery Beat schedule preserves non-SSE entries.

    For any subset of expected non-SSE Celery Beat entries, every entry in the
    subset must be present in the actual CELERY_BEAT_SCHEDULE with its task path
    unchanged. No SSE-related entries may exist in the schedule.

    Feature: sse-removal-simplification, Property 1: Celery Beat schedule preserves non-SSE entries

    **Validates: Requirements 2.3**
    """

    @given(subset=_non_sse_subsets)
    @_default_settings
    def test_non_sse_entries_present_with_correct_task_paths(self, subset):
        """Every sampled non-SSE entry must exist in the schedule with the correct task path."""
        for key in subset:
            expected_task = EXPECTED_NON_SSE_ENTRIES[key]

            assert key in CELERY_BEAT_SCHEDULE, (
                f"Expected Celery Beat entry '{key}' is missing from CELERY_BEAT_SCHEDULE. "
                f"Current keys: {sorted(CELERY_BEAT_SCHEDULE.keys())}"
            )

            actual_task = CELERY_BEAT_SCHEDULE[key]["task"]
            assert actual_task == expected_task, (
                f"Entry '{key}' has task '{actual_task}', expected '{expected_task}'"
            )

    @given(subset=_non_sse_subsets)
    @_default_settings
    def test_non_sse_entries_have_schedule_defined(self, subset):
        """Every sampled non-SSE entry must have a 'schedule' key with a truthy value."""
        for key in subset:
            assert key in CELERY_BEAT_SCHEDULE, (
                f"Expected Celery Beat entry '{key}' is missing from CELERY_BEAT_SCHEDULE."
            )

            entry = CELERY_BEAT_SCHEDULE[key]
            assert "schedule" in entry, (
                f"Entry '{key}' is missing the 'schedule' key: {entry}"
            )
            assert entry["schedule"], (
                f"Entry '{key}' has a falsy schedule value: {entry['schedule']}"
            )

    @given(subset=_non_sse_subsets)
    @_default_settings
    def test_no_sse_entries_exist_in_schedule(self, subset):
        """No SSE-related entries should exist in the Celery Beat schedule."""
        for sse_key in SSE_ENTRY_KEYS:
            assert sse_key not in CELERY_BEAT_SCHEDULE, (
                f"SSE-related entry '{sse_key}' should not be in CELERY_BEAT_SCHEDULE. "
                f"Current keys: {sorted(CELERY_BEAT_SCHEDULE.keys())}"
            )
