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


# =========================================================================
# Property 14: Missed Task Detection Within 2x Interval
# =========================================================================


class TestMissedTaskDetection(SimpleTestCase):
    """Property 14: Missed Task Detection Within 2x Interval.

    # Feature: production-readiness-hardening, Property 14
    **Validates: Requirements 10.2**
    """

    @given(
        interval=st.integers(min_value=60, max_value=86400),
        elapsed_factor=st.floats(min_value=2.1, max_value=10.0, allow_nan=False, allow_infinity=False),
    )
    @settings(max_examples=20, deadline=None)
    def test_overdue_task_reported_as_missed(self, interval, elapsed_factor):
        """Tasks not run within 2x interval are reported as missed."""
        import io
        import time as _time

        from apps.common.management.commands.check_missed_tasks import Command

        now = _time.time()
        last_run = now - (interval * elapsed_factor)

        mock_cache = MagicMock()
        mock_cache.set.return_value = True
        mock_cache.get.side_effect = lambda key, default=None: (
            "1" if key == "_missed_task_ping" else
            last_run if "task_last_run:" in key else default
        )

        fake_schedule = {
            "test_task": {
                "task": "apps.common.tasks.test_task",
                "schedule": interval,
            }
        }

        handler = _LogCapture()
        cmd_logger = logging.getLogger("apps.common.management.commands.check_missed_tasks")
        cmd_logger.addHandler(handler)
        cmd_logger.setLevel(logging.DEBUG)

        cmd = Command()
        cmd.stdout = io.StringIO()
        cmd.stderr = io.StringIO()

        try:
            with patch("django.core.cache.cache", mock_cache), \
                 patch("django.conf.settings.CELERY_BEAT_SCHEDULE", fake_schedule):
                try:
                    cmd.handle()
                except SystemExit:
                    pass
        finally:
            cmd_logger.removeHandler(handler)

        missed = [r for r in handler.records if getattr(r, "type", None) == "missed_task"]
        self.assertGreaterEqual(len(missed), 1)
        self.assertEqual(getattr(missed[0], "task_name"), "apps.common.tasks.test_task")

    @given(interval=st.integers(min_value=60, max_value=86400))
    @settings(max_examples=20, deadline=None)
    def test_on_time_task_not_reported(self, interval):
        """Tasks run within 2x interval are not reported as missed."""
        import io
        import time as _time

        from apps.common.management.commands.check_missed_tasks import Command

        now = _time.time()
        last_run = now - (interval * 0.5)  # Well within window

        mock_cache = MagicMock()
        mock_cache.set.return_value = True
        mock_cache.get.side_effect = lambda key, default=None: (
            "1" if key == "_missed_task_ping" else
            last_run if "task_last_run:" in key else default
        )

        fake_schedule = {
            "test_task": {
                "task": "apps.common.tasks.test_task",
                "schedule": interval,
            }
        }

        handler = _LogCapture()
        cmd_logger = logging.getLogger("apps.common.management.commands.check_missed_tasks")
        cmd_logger.addHandler(handler)
        cmd_logger.setLevel(logging.DEBUG)

        cmd = Command()
        cmd.stdout = io.StringIO()
        cmd.stderr = io.StringIO()

        try:
            with patch("django.core.cache.cache", mock_cache), \
                 patch("django.conf.settings.CELERY_BEAT_SCHEDULE", fake_schedule):
                cmd.handle()
        finally:
            cmd_logger.removeHandler(handler)

        missed = [r for r in handler.records if getattr(r, "type", None) == "missed_task"]
        self.assertEqual(len(missed), 0)
