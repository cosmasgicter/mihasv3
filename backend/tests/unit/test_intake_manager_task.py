"""Unit tests for the intake_manager_task Celery task.

Tests:
- Task registration in CELERY_BEAT_SCHEDULE (Requirement 3.1)
- Management command invocation (Requirement 3.5)
- Error logging on failure (Requirement 3.4)
- Idempotency — running twice produces same result (Requirement 3.3)
- Duplicate skip with warning log (Requirement 3.3)
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from datetime import date
from unittest.mock import MagicMock, call, patch

import django

django.setup()

from django.conf import settings
from django.test import SimpleTestCase


# =========================================================================
# Test: Task registration in CELERY_BEAT_SCHEDULE
# Requirement 3.1
# =========================================================================


class TestCeleryBeatRegistration(SimpleTestCase):
    """The manage-intakes entry must exist in CELERY_BEAT_SCHEDULE with the correct config."""

    def test_manage_intakes_key_exists(self):
        schedule = settings.CELERY_BEAT_SCHEDULE
        self.assertIn("manage-intakes", schedule)

    def test_manage_intakes_task_path(self):
        entry = settings.CELERY_BEAT_SCHEDULE["manage-intakes"]
        self.assertEqual(entry["task"], "apps.catalog.tasks.intake_manager_task")

    def test_manage_intakes_crontab_schedule(self):
        entry = settings.CELERY_BEAT_SCHEDULE["manage-intakes"]
        schedule = entry["schedule"]
        # crontab stores hour/minute as sets
        self.assertEqual(schedule.hour, {4})
        self.assertEqual(schedule.minute, {0})


# =========================================================================
# Test: Management command invocation
# Requirement 3.5
# =========================================================================


class TestManagementCommand(SimpleTestCase):
    """The manage_intakes management command should call intake_manager_task.apply()."""

    def test_command_calls_task_apply(self):
        from apps.catalog.tasks import intake_manager_task

        with patch.object(intake_manager_task, "apply") as mock_apply:
            from django.core.management import call_command
            from io import StringIO

            out = StringIO()
            call_command("manage_intakes", stdout=out)

            mock_apply.assert_called_once()
        self.assertIn("completed", out.getvalue())


# =========================================================================
# Test: Error logging on failure
# Requirement 3.4
# =========================================================================


class TestErrorLoggingOnFailure(SimpleTestCase):
    """When the task fails after exhausting retries, it should log to ErrorLog and dispatch alert."""

    def test_logs_to_errorlog_on_final_failure(self):
        """Directly test _log_error_and_alert creates an ErrorLog row."""
        from apps.catalog.tasks import _log_error_and_alert

        mock_errorlog_create = MagicMock()
        mock_email_record = MagicMock()
        mock_email_record.id = "fake-email-id"

        with patch("apps.common.models.ErrorLog.objects.create", mock_errorlog_create), \
             patch("apps.common.models.EmailQueue.objects.create", return_value=mock_email_record), \
             patch("apps.common.tasks.send_email_task"), \
             patch("django.core.cache.cache.add", return_value=True):
            _log_error_and_alert("intake_manager_task failed: Exception: connection refused")

        mock_errorlog_create.assert_called_once()
        create_kwargs = mock_errorlog_create.call_args.kwargs
        self.assertEqual(create_kwargs["source"], "backend")
        self.assertEqual(create_kwargs["level"], "error")
        self.assertIn("connection refused", create_kwargs["message"])
        self.assertEqual(create_kwargs["context"], {"task": "intake_manager_task"})

    def test_dispatches_alert_email_on_final_failure(self):
        """Directly test _log_error_and_alert dispatches an alert email."""
        from apps.catalog.tasks import _log_error_and_alert

        mock_email_record = MagicMock()
        mock_email_record.id = "fake-email-id"
        mock_emailqueue_create = MagicMock(return_value=mock_email_record)

        with patch("apps.common.models.ErrorLog.objects.create"), \
             patch("apps.common.models.EmailQueue.objects.create", mock_emailqueue_create), \
             patch("apps.common.tasks.send_email_task") as mock_send_email, \
             patch("django.core.cache.cache.add", return_value=True):
            _log_error_and_alert("intake_manager_task failed: Exception: connection refused")

        mock_emailqueue_create.assert_called_once()
        email_kwargs = mock_emailqueue_create.call_args.kwargs
        self.assertIn("intake_manager_task", email_kwargs["subject"])
        self.assertEqual(email_kwargs["status"], "pending")
        mock_send_email.delay.assert_called_once_with("fake-email-id")


# =========================================================================
# Test: Idempotency — running twice produces same result
# Requirement 3.3
# =========================================================================


class TestIdempotency(SimpleTestCase):
    """Running the task twice should produce the same result (no extra intakes)."""

    def test_second_run_creates_nothing(self):
        from apps.catalog.intake_date_computer import compute_intake_dates
        from apps.catalog.tasks import intake_manager_task

        today = date(2026, 3, 15)

        # Simulate: first run creates intakes, second run finds them existing.
        created_intakes = []

        def make_mock_intake(computed):
            m = MagicMock()
            m.name = computed.name
            m.year = computed.year
            m.application_start_date = computed.application_start_date
            m.application_deadline = computed.application_deadline
            m.is_active = True
            return m

        def mock_filter_side_effect(**kwargs):
            qs = MagicMock()
            if "is_active" in kwargs:
                qs.__iter__ = lambda s: iter(created_intakes)
                qs.__len__ = lambda s: len(created_intakes)
                return qs
            if "name" in kwargs and "year" in kwargs:
                # Check if this intake already exists
                exists = any(
                    i.name == kwargs["name"] and i.year == kwargs["year"]
                    for i in created_intakes
                )
                qs.exists.return_value = exists
                return qs
            return qs

        def mock_create(**kwargs):
            computed = compute_intake_dates(
                1 if "January" in kwargs["name"] else 7,
                kwargs["year"],
            )
            m = make_mock_intake(computed)
            created_intakes.append(m)
            return m

        mock_objects = MagicMock()
        mock_objects.filter.side_effect = mock_filter_side_effect
        mock_objects.create.side_effect = mock_create

        with patch("apps.catalog.models.Intake.objects", mock_objects), \
             patch("apps.catalog.tasks.date") as mock_date:
            mock_date.today.return_value = today
            mock_date.side_effect = lambda *a, **kw: date(*a, **kw)

            # First run
            intake_manager_task()
            count_after_first = len(created_intakes)
            self.assertGreater(count_after_first, 0, "First run should create intakes")

            # Reset create call count
            mock_objects.create.reset_mock()

            # Second run — should create nothing
            intake_manager_task()

        self.assertEqual(
            mock_objects.create.call_count,
            0,
            "Second run should not create any new intakes",
        )


# =========================================================================
# Test: Duplicate skip with warning log
# Requirement 3.3
# =========================================================================


class TestDuplicateSkipWithWarning(SimpleTestCase):
    """When an intake with the same name+year exists in the DB, it should be skipped with a warning."""

    def test_skips_existing_intake_with_warning(self):
        from apps.catalog.intake_date_computer import ComputedIntakeDates
        from apps.catalog.tasks import intake_manager_task

        today = date(2026, 3, 15)

        # Simulate: ensure_minimum_open_intakes returns an intake to create,
        # but the DB-level guard finds it already exists (race condition path).
        computed = ComputedIntakeDates(
            name="July 2026",
            year=2026,
            start_date=date(2026, 7, 1),
            application_start_date=date(2025, 8, 1),
            application_deadline=date(2026, 9, 1),
        )

        def mock_filter_side_effect(**kwargs):
            qs = MagicMock()
            if "is_active" in kwargs:
                qs.__iter__ = lambda s: iter([])
                qs.__len__ = lambda s: 0
                return qs
            if "name" in kwargs and "year" in kwargs:
                # DB says this intake already exists
                qs.exists.return_value = True
                return qs
            return qs

        mock_objects = MagicMock()
        mock_objects.filter.side_effect = mock_filter_side_effect

        with patch("apps.catalog.models.Intake.objects", mock_objects), \
             patch("apps.catalog.intake_date_computer.ensure_minimum_open_intakes", return_value=[computed]), \
             patch("apps.catalog.tasks.logger") as mock_logger:
            intake_manager_task()

        # Check that a warning was logged about the duplicate
        warning_calls = mock_logger.warning.call_args_list
        warning_messages = [c.args[0] % c.args[1:] for c in warning_calls]
        has_skip_warning = any(
            "July 2026" in msg and ("exists" in msg or "skipping" in msg.lower())
            for msg in warning_messages
        )
        self.assertTrue(
            has_skip_warning,
            f"Expected a warning about skipping 'July 2026'. Got: {warning_messages}",
        )
