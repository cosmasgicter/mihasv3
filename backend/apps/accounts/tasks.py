"""Accounts Celery tasks."""

import logging

from celery import shared_task

from apps.accounts.session_lifecycle import deactivate_stale_sessions
from apps.common.metrics import emit_metric

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0, soft_time_limit=120, time_limit=150)
def cleanup_stale_sessions_task(self):
    """Deactivate stale device sessions left behind by legacy lifecycle gaps."""
    from django.core.cache import cache as _cache

    if not _cache.add("celery_lock:cleanup_stale_sessions_task", "1", timeout=300):
        logger.info("cleanup_stale_sessions_task: skipped (already running)")
        return
    try:
        logger.info("cleanup_stale_sessions_task: starting")
        deactivated = deactivate_stale_sessions()
        if deactivated:
            logger.info("Stale session cleanup: deactivated %d legacy session(s)", deactivated)
        emit_metric("sessions.stale_cleanup", deactivated=deactivated)
        return {"deactivated": deactivated}
    finally:
        _cache.delete("celery_lock:cleanup_stale_sessions_task")
