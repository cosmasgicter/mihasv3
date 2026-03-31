"""Unit tests for audit log cleanup task.

Tests:
- Cleanup logs deletion counts per category (Requirement 7.5)
- Cleanup retries once on database error (Requirement 7.6)
"""

import os
import uuid

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from unittest.mock import MagicMock, patch

import django

django.setup()

from django.test import SimpleTestCase


# =========================================================================
# Test: cleanup logs deletion counts per category
# Requirement 7.5
# =========================================================================


class TestCleanupDeletionCounts(SimpleTestCase):
    """The cleanup task should log the count of deleted records per retention category."""

    def test_logs_deletion_counts_per_category(self):
        from apps.common.tasks import cleanup_audit_logs_task

        standard_ids = [uuid.uuid4() for _ in range(3)]
        security_ids = [uuid.uuid4() for _ in range(2)]

        call_count = {"standard": 0, "security": 0}

        def mock_filter(**kwargs):
            qs = MagicMock()

            if "id__in" in kwargs:
                batch_ids = kwargs["id__in"]
                qs.delete.return_value = (len(batch_ids), {})
                return qs

            category = kwargs.get("retention_category")

            if category == "standard":
                ids_to_return = standard_ids if call_count["standard"] == 0 else []
                call_count["standard"] += 1
            else:
                ids_to_return = security_ids if call_count["security"] == 0 else []
                call_count["security"] += 1

            def mock_values_list(*args, flat=False):
                vl = MagicMock()
                vl.__getitem__ = lambda self, key: (
                    ids_to_return[: key.stop] if isinstance(key, slice) else ids_to_return[key]
                )
                return vl

            qs.values_list = mock_values_list
            return qs

        mock_objects = MagicMock()
        mock_objects.filter = mock_filter

        with patch("apps.common.models.AuditLog.objects", mock_objects), \
             patch("apps.common.tasks.logger") as mock_logger:
            cleanup_audit_logs_task()

        # Verify logger.info was called with deletion counts for both categories.
        info_calls = mock_logger.info.call_args_list
        info_messages = [call.args[0] % call.args[1:] for call in info_calls]

        standard_logged = any("3" in msg and "standard" in msg for msg in info_messages)
        security_logged = any("2" in msg and "security" in msg for msg in info_messages)

        self.assertTrue(standard_logged, f"Expected standard deletion count of 3 in logs. Got: {info_messages}")
        self.assertTrue(security_logged, f"Expected security deletion count of 2 in logs. Got: {info_messages}")


# =========================================================================
# Test: cleanup retries once on database error
# Requirement 7.6
# =========================================================================


class TestCleanupRetryOnDatabaseError(SimpleTestCase):
    """The cleanup task should retry once when a database error occurs."""

    def test_retries_once_on_database_error(self):
        from apps.common.tasks import cleanup_audit_logs_task

        db_error = Exception("connection to server lost")

        mock_objects = MagicMock()
        mock_objects.filter.side_effect = db_error

        # Mock self.retry on the Celery task instance so we can verify it's called.
        # Celery's self.retry raises the exception returned by retry() to exit the task.
        retry_exc = Exception("retry-sentinel")

        with patch("apps.common.models.AuditLog.objects", mock_objects), \
             patch("apps.common.tasks.logger"), \
             patch.object(cleanup_audit_logs_task, "retry", side_effect=retry_exc) as mock_retry:
            with self.assertRaises(Exception) as ctx:
                cleanup_audit_logs_task()

            self.assertEqual(str(ctx.exception), "retry-sentinel")

        # Verify retry was called exactly once with the original DB exception.
        mock_retry.assert_called_once()
        call_kwargs = mock_retry.call_args.kwargs
        self.assertIs(call_kwargs["exc"], db_error)
