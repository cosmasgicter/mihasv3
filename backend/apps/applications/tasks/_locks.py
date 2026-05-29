"""Shared task lock helpers for Redis SETNX-based deduplication."""

import logging

from django.core.cache import cache

logger = logging.getLogger(__name__)


def acquire_task_lock(task_name: str, timeout: int = 600) -> bool:
    return cache.add(f"celery_lock:{task_name}", "1", timeout=timeout)


def release_task_lock(task_name: str):
    cache.delete(f"celery_lock:{task_name}")
