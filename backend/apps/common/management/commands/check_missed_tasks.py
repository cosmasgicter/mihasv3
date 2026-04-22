"""Management command to detect missed Celery Beat tasks.

Compares last execution timestamps (from Redis) against configured schedules.
Tasks not run within 2x their expected interval are reported as missed.
"""

import logging
import sys
import time

from django.conf import settings
from django.core.management.base import BaseCommand

logger = logging.getLogger(__name__)


def _interval_seconds(schedule):
    """Convert a Celery schedule object to seconds."""
    from celery.schedules import crontab

    if isinstance(schedule, (int, float)):
        return float(schedule)
    if hasattr(schedule, "total_seconds"):
        return schedule.total_seconds()
    if isinstance(schedule, crontab):
        # Approximate: use the smallest crontab cycle (daily = 86400s)
        return 86400.0
    return 86400.0


class Command(BaseCommand):
    help = "Check for Celery Beat tasks that have not run within their expected window."

    def handle(self, *args, **options):
        beat_schedule = getattr(settings, "CELERY_BEAT_SCHEDULE", {})
        if not beat_schedule:
            self.stdout.write(self.style.SUCCESS("No tasks in CELERY_BEAT_SCHEDULE."))
            return

        try:
            from django.core.cache import cache
            cache.set("_missed_task_ping", "1", 10)
            if cache.get("_missed_task_ping") != "1":
                raise ConnectionError("Redis ping failed")
        except Exception as exc:
            self.stderr.write(self.style.ERROR(f"Redis unavailable: {exc}. Reporting all tasks as missed."))
            for name in beat_schedule:
                logger.warning("missed_task", extra={
                    "type": "missed_task", "task_name": name,
                    "expected_interval_seconds": 0, "last_run_at": None,
                })
            sys.exit(1)

        now = time.time()
        missed = []

        for name, config in beat_schedule.items():
            task_name = config.get("task", name)
            schedule = config.get("schedule")
            interval = _interval_seconds(schedule) if schedule else 86400.0

            last_run = cache.get(f"task_last_run:{task_name}")

            if last_run is None:
                missed.append((name, task_name, interval, None))
                logger.warning("missed_task", extra={
                    "type": "missed_task", "task_name": task_name,
                    "expected_interval_seconds": interval, "last_run_at": None,
                })
                continue

            elapsed = now - float(last_run)
            if elapsed > 2 * interval:
                missed.append((name, task_name, interval, float(last_run)))
                logger.warning("missed_task", extra={
                    "type": "missed_task", "task_name": task_name,
                    "expected_interval_seconds": interval, "last_run_at": float(last_run),
                })

        if missed:
            self.stdout.write(self.style.WARNING(f"{len(missed)} missed task(s) detected."))
            for name, task_name, interval, last_run in missed:
                self.stdout.write(f"  - {task_name} (interval={interval}s, last_run={last_run})")
            sys.exit(1)
        else:
            self.stdout.write(self.style.SUCCESS(f"All {len(beat_schedule)} tasks within expected windows."))
