"""Property-based tests for audit log cleanup retention periods.

# Feature: cto-assessment-remediation, Property 10: Audit log cleanup respects retention periods

Tests that for any set of AuditLog records, after cleanup_audit_logs_task runs,
no records remain where retention_category='standard' and created_at is older
than 90 days, and no records remain where retention_category='security' and
created_at is older than 365 days. Records within their retention period must
not be deleted.
"""

import os
import uuid
from datetime import timedelta
from types import SimpleNamespace

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from django.utils import timezone  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.common.tasks import (  # noqa: E402
    SECURITY_RETENTION_DAYS,
    STANDARD_RETENTION_DAYS,
)

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Generate a single audit log record as a dict with random category and age
_audit_record = st.fixed_dictionaries(
    {
        "id": st.uuids(),
        "retention_category": st.sampled_from(["standard", "security"]),
        # Age in days: 0..500 covers both within-retention and expired ranges
        "age_days": st.integers(min_value=0, max_value=500),
    }
)

# Generate a list of audit log records
_audit_records = st.lists(_audit_record, min_size=0, max_size=40)


def _is_expired(record, now):
    """Determine if a record should be deleted based on retention rules."""
    if record["retention_category"] == "standard":
        cutoff = now - timedelta(days=STANDARD_RETENTION_DAYS)
    else:
        cutoff = now - timedelta(days=SECURITY_RETENTION_DAYS)
    created_at = now - timedelta(days=record["age_days"])
    return created_at < cutoff


# =========================================================================
# Property 10: Audit log cleanup respects retention periods
# =========================================================================


class TestAuditCleanupRetention(SimpleTestCase):
    """Property 10: Audit log cleanup respects retention periods.

    For any set of AuditLog records, after cleanup_audit_logs_task runs,
    no records should remain where retention_category='standard' and
    created_at is older than 90 days, and no records should remain where
    retention_category='security' and created_at is older than 365 days.
    Records within their retention period must not be deleted.

    **Validates: Requirements 7.2, 7.3**
    """

    @given(records=_audit_records)
    @settings(max_examples=5, deadline=None)
    def test_cleanup_respects_retention_periods(self, records):
        """Only expired records are deleted; records within retention are preserved."""
        from apps.common.tasks import cleanup_audit_logs_task

        now = timezone.now()

        # Build mock records with created_at timestamps derived from age_days.
        mock_records = []
        for rec in records:
            mock_records.append(
                {
                    "id": rec["id"],
                    "retention_category": rec["retention_category"],
                    "created_at": now - timedelta(days=rec["age_days"]),
                }
            )

        # Partition into expected-deleted and expected-preserved sets.
        expected_deleted_ids = set()
        expected_preserved_ids = set()
        for rec, mock_rec in zip(records, mock_records):
            if _is_expired(rec, now):
                expected_deleted_ids.add(rec["id"])
            else:
                expected_preserved_ids.add(rec["id"])

        # Track which IDs were actually "deleted" by the task.
        actually_deleted_ids = set()

        # Build a mock queryset that simulates filter → values_list and
        # filter → delete for the batch-delete loop.
        def mock_filter(**kwargs):
            """Simulate AuditLog.objects.filter(...)."""
            qs_mock = MagicMock()

            if "id__in" in kwargs:
                # This is the batch delete call: filter(id__in=batch_ids).delete()
                batch_ids = set(kwargs["id__in"])
                actually_deleted_ids.update(batch_ids)
                qs_mock.delete.return_value = (len(batch_ids), {})
                return qs_mock

            # This is the lookup call:
            # filter(retention_category=..., created_at__lt=...)
            category = kwargs.get("retention_category")
            cutoff = kwargs.get("created_at__lt")

            # Find matching record IDs that haven't been deleted yet.
            matching_ids = [
                m["id"]
                for m in mock_records
                if m["retention_category"] == category
                and m["created_at"] < cutoff
                and m["id"] not in actually_deleted_ids
            ]

            # Simulate .values_list("id", flat=True)[:BATCH_SIZE]
            def mock_values_list(*args, flat=False):
                vl_mock = MagicMock()
                vl_mock.__getitem__ = lambda self, key: matching_ids[: key.stop] if isinstance(key, slice) else matching_ids[key]
                return vl_mock

            qs_mock.values_list = mock_values_list
            return qs_mock

        mock_objects = MagicMock()
        mock_objects.filter = mock_filter

        with patch(
            "apps.common.models.AuditLog.objects",
            mock_objects,
        ), patch(
            "apps.common.tasks.timezone.now",
            return_value=now,
        ):
            # Call the task directly (bypass Celery).
            cleanup_audit_logs_task()

        # Verify: all expired records were deleted.
        self.assertEqual(
            actually_deleted_ids & expected_deleted_ids,
            expected_deleted_ids,
            f"Expected all expired records to be deleted. "
            f"Missing: {expected_deleted_ids - actually_deleted_ids}",
        )

        # Verify: no preserved records were deleted.
        wrongly_deleted = actually_deleted_ids & expected_preserved_ids
        self.assertEqual(
            wrongly_deleted,
            set(),
            f"Records within retention period were incorrectly deleted: {wrongly_deleted}",
        )
