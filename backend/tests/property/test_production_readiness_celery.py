"""Property-based tests for Celery lifecycle signals and missed task detection.

# Feature: production-readiness-hardening, Property 13: Celery Lifecycle Signals Emit Correct Logs
# Feature: production-readiness-hardening, Property 14: Missed Task Detection Within 2x Interval

**Validates: Requirements 9.1, 9.2, 9.3, 10.2**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import logging  # noqa: E402
import uuid  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402


class _LogCapture(logging.Handler):
    def __init__(self):
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record):
        self.records.append(record)


TASK_NAMES = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="._"),
    min_size=3, max_size=40,
)


class TestCeleryLifecycleSignalLogs(SimpleTestCase):
    """Property 13: Celery Lifecycle Signals Emit Correct Logs.

    # Feature: production-readiness-hardening, Property 13
    **Validates: Requirements 9.1, 9.2, 9.3**
    """

    @given(task_name=TASK_NAMES)
    @settings(max_examples=20, deadline=None)
    def test_prerun_emits_task_started(self, task_name):
        from apps.common.celery_signals import on_task_prerun, _task_start_times

        handler = _LogCapture()
        sig_logger = logging.getLogger("apps.common.celery_signals")
        sig_logger.addHandler(handler)
        sig_logger.setLevel(logging.DEBUG)

        task_id = str(uuid.uuid4())
        mock_task = MagicMock()
        mock_task.name = task_name

        try:
            on_task_prerun(sender=mock_task, task_id=task_id, task=mock_task)
        finally:
            sig_logger.removeHandler(handler)
            _task_start_times.pop(task_id, None)

        started = [r for r in handler.records if getattr(r, "event", None) == "task_started"]
        self.assertEqual(len(started), 1)
        self.assertEqual(getattr(started[0], "type"), "task_lifecycle")
        self.assertEqual(getattr(started[0], "task_name"), task_name)

    @given(task_name=TASK_NAMES)
    @settings(max_examples=20, deadline=None)
    def test_postrun_emits_task_completed_with_duration(self, task_name):
        from apps.common.celery_signals import on_task_prerun, on_task_postrun, _task_start_times

        handler = _LogCapture()
        sig_logger = logging.getLogger("apps.common.celery_signals")
        sig_logger.addHandler(handler)
        sig_logger.setLevel(logging.DEBUG)

        task_id = str(uuid.uuid4())
        mock_task = MagicMock()
        mock_task.name = task_name

        try:
            with patch("django.core.cache.cache") as mock_cache:
                on_task_prerun(sender=mock_task, task_id=task_id, task=mock_task)
                on_task_postrun(sender=mock_task, task_id=task_id, task=mock_task)
        finally:
            sig_logger.removeHandler(handler)
            _task_start_times.pop(task_id, None)

        completed = [r for r in handler.records if getattr(r, "event", None) == "task_completed"]
        self.assertEqual(len(completed), 1)
        self.assertEqual(getattr(completed[0], "type"), "task_lifecycle")
        self.assertIsNotNone(getattr(completed[0], "duration_ms"))
        self.assertGreaterEqual(getattr(completed[0], "duration_ms"), 0)

    @given(task_name=TASK_NAMES)
    @settings(max_examples=20, deadline=None)
    def test_failure_emits_task_failed_with_error(self, task_name):
        from apps.common.celery_signals import on_task_prerun, on_task_failure, _task_start_times

        handler = _LogCapture()
        sig_logger = logging.getLogger("apps.common.celery_signals")
        sig_logger.addHandler(handler)
        sig_logger.setLevel(logging.DEBUG)

        task_id = str(uuid.uuid4())
        mock_task = MagicMock()
        mock_task.name = task_name
        exc = ValueError("test error")

        try:
            on_task_prerun(sender=mock_task, task_id=task_id, task=mock_task)
            on_task_failure(sender=mock_task, task_id=task_id, exception=exc)
        finally:
            sig_logger.removeHandler(handler)
            _task_start_times.pop(task_id, None)

        failed = [r for r in handler.records if getattr(r, "event", None) == "task_failed"]
        self.assertEqual(len(failed), 1)
        self.assertEqual(getattr(failed[0], "type"), "task_lifecycle")
        self.assertIn("ValueError", getattr(failed[0], "error"))
