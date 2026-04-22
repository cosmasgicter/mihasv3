"""Celery task lifecycle signal handlers for structured logging.

Registers handlers for task_prerun, task_postrun, and task_failure signals
to emit structured logs with type: "task_lifecycle" at each phase.

Also writes task_last_run:{task_name} to Redis cache on task_postrun
for missed-task detection.
"""

import logging
import time

from celery.signals import task_failure, task_postrun, task_prerun

logger = logging.getLogger(__name__)

_task_start_times: dict[str, float] = {}


@task_prerun.connect
def on_task_prerun(sender=None, task_id=None, task=None, **kwargs):
    try:
        _task_start_times[task_id] = time.monotonic()
        logger.info(
            "task_lifecycle",
            extra={
                "type": "task_lifecycle",
                "event": "task_started",
                "task_name": task.name,
                "task_id": task_id,
            },
        )
    except Exception:
        pass


@task_postrun.connect
def on_task_postrun(sender=None, task_id=None, task=None, **kwargs):
    try:
        start = _task_start_times.pop(task_id, None)
        duration_ms = round((time.monotonic() - start) * 1000, 1) if start else None
        logger.info(
            "task_lifecycle",
            extra={
                "type": "task_lifecycle",
                "event": "task_completed",
                "task_name": task.name,
                "task_id": task_id,
                "duration_ms": duration_ms,
            },
        )
        # Write last-run timestamp for missed-task detection
        from django.core.cache import cache
        cache.set(f"task_last_run:{task.name}", time.time(), timeout=None)
    except Exception:
        pass


@task_failure.connect
def on_task_failure(sender=None, task_id=None, exception=None, **kwargs):
    try:
        start = _task_start_times.pop(task_id, None)
        duration_ms = round((time.monotonic() - start) * 1000, 1) if start else None
        logger.error(
            "task_lifecycle",
            extra={
                "type": "task_lifecycle",
                "event": "task_failed",
                "task_name": sender.name if sender else "unknown",
                "task_id": task_id,
                "duration_ms": duration_ms,
                "error": f"{type(exception).__name__}: {exception}" if exception else "unknown",
            },
        )
    except Exception:
        pass
