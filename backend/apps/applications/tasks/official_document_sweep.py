"""The dispatcher that makes a broker outage survivable (task 10.4).

admissions-v2 task 10.4 — R13.11, R17.1, R17.4; finding **STU-18**.

Committing a durable job before answering 202 makes the platform *honest*. This
task is what makes it *recoverable*: design §11.3's "broker outage after commit
is recovered by the dispatcher". Without it, a request made while Redis was down
would be a truthfully-recorded request that nobody ever ran.

It is deliberately the same shape as task 4.4's
``sweep_pending_domain_verifications_task`` — a cache-key lock so two beat
instances cannot double-dispatch, a bounded candidate set, and a fail-safe outer
``except`` because a sweep must never crash the worker.
"""

import logging

from celery import shared_task
from django.core.cache import cache

logger = logging.getLogger(__name__)

_LOCK_KEY = "celery_lock:sweep_pending_official_document_jobs"
_LOCK_TIMEOUT_SECONDS = 120


@shared_task
def sweep_pending_official_document_jobs_task():
    """Re-dispatch committed-but-undispatched official-document jobs.

    Returns the number of jobs dispatched.
    """
    if not cache.add(_LOCK_KEY, "1", timeout=_LOCK_TIMEOUT_SECONDS):
        logger.info(
            "sweep_pending_official_document_jobs_task: skipped (already running)"
        )
        return 0

    dispatched = 0
    try:
        from apps.applications import official_document_jobs as jobs

        dispatched = jobs.sweep_pending_jobs()
        logger.info(
            "sweep_pending_official_document_jobs_task: dispatched %d job(s)",
            dispatched,
        )
    except Exception:
        # Fail-safe: the backlog is durable, so the next run tries again.
        logger.exception(
            "sweep_pending_official_document_jobs_task: unexpected error"
        )
    finally:
        cache.delete(_LOCK_KEY)
    return dispatched
