"""Unit tests for stale device session cleanup Celery task registration."""

import os
from unittest.mock import patch

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

django.setup()

from django.conf import settings
from django.test import SimpleTestCase

from apps.accounts.tasks import cleanup_stale_sessions_task


class TestCleanupStaleSessionsBeatRegistration(SimpleTestCase):
    def test_schedule_key_exists(self):
        self.assertIn("cleanup-stale-sessions", settings.CELERY_BEAT_SCHEDULE)

    def test_schedule_task_path(self):
        entry = settings.CELERY_BEAT_SCHEDULE["cleanup-stale-sessions"]
        self.assertEqual(entry["task"], "apps.accounts.tasks.cleanup_stale_sessions_task")

    def test_schedule_crontab(self):
        entry = settings.CELERY_BEAT_SCHEDULE["cleanup-stale-sessions"]
        schedule = entry["schedule"]
        self.assertEqual(schedule.hour, {2})
        self.assertEqual(schedule.minute, {30})


class TestCleanupStaleSessionsTask(SimpleTestCase):
    @patch("apps.accounts.tasks.emit_metric")
    @patch("apps.accounts.tasks.deactivate_stale_sessions", return_value=7)
    def test_task_deactivates_stale_sessions_and_emits_metric(self, mock_cleanup, mock_emit_metric):
        result = cleanup_stale_sessions_task.apply().get()

        mock_cleanup.assert_called_once_with()
        mock_emit_metric.assert_called_once_with("sessions.stale_cleanup", deactivated=7)
        self.assertEqual(result, {"deactivated": 7})
