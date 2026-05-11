"""Redis caching layer for AI-generated text.

Keeps expensive ``gpt-4o-mini`` calls (admin summary, student preview)
from re-running on every page view when the underlying application
data has not meaningfully changed.

Design:

* **Gate**: ``settings.AI_HARDENING_CACHE``. Off by default — callers
  invoke ``cached_ai_call`` unconditionally and when the flag is off
  the generator runs every time (pre-hardening behaviour).
* **Backend**: Django cache (Redis in prod, LocMem in tests).
* **Key shape**: ``ai:<namespace>:<fingerprint>`` where the caller
  supplies both. ``fingerprint`` is expected to include every input
  that should invalidate the cache (see
  :func:`compute_application_fingerprint` for the canonical
  application fingerprint).
* **TTL**: 24 hours default. Caller can override.
* **Force refresh**: ``refresh=True`` bypasses the cache lookup and
  overwrites the stored value. Callers gate this on privileges (e.g.
  super-admin query param).
* **Negative results**: if the generator returns ``None`` the cache is
  NOT populated — we want the next caller to retry the AI call rather
  than serve a stale miss.
* **Generator errors**: never cached; the exception propagates so
  the circuit breaker layer can count it.

Requirements: AI risk remediation plan, Phase 1.3.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any, Callable, Optional, TypeVar

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)


#: Default TTL (24 hours). Callers can override via ``ttl`` kwarg.
DEFAULT_TTL_SECONDS: int = 24 * 60 * 60

T = TypeVar("T")


def _build_key(namespace: str, fingerprint: str) -> str:
    # Bound namespace + fingerprint to keep keys short and predictable.
    safe_ns = namespace.strip(":")[:64] or "default"
    safe_fp = fingerprint.strip(":")[:128] or "none"
    return f"ai:{safe_ns}:{safe_fp}"


def cached_ai_call(
    namespace: str,
    fingerprint: str,
    generator: Callable[[], Optional[T]],
    *,
    ttl: int = DEFAULT_TTL_SECONDS,
    refresh: bool = False,
) -> Optional[T]:
    """Look up a cached AI response, or compute and store one.

    Parameters
    ----------
    namespace:
        Short label identifying the AI call kind (e.g. ``"admin_summary"``,
        ``"student_preview"``). Used as the first segment of the cache
        key — different namespaces cannot collide.
    fingerprint:
        Deterministic hash of every input that should invalidate this
        cache entry. Two calls with the same ``fingerprint`` must
        produce logically equivalent AI responses.
    generator:
        Zero-argument callable that produces the AI result (or ``None``).
    ttl:
        Cache TTL in seconds. Defaults to 24 h.
    refresh:
        When ``True``, bypass the lookup and overwrite the stored value.

    Returns
    -------
    Either the cached value, the freshly-generated value, or ``None`` if
    the generator returned ``None`` (never cached).
    """
    if not getattr(settings, "AI_HARDENING_CACHE", False):
        # Flag off — behave exactly like pre-hardening: always call
        # the generator, never touch the cache.
        return generator()

    key = _build_key(namespace, fingerprint)

    if not refresh:
        try:
            hit = cache.get(key)
        except Exception:  # pragma: no cover — defensive
            logger.warning("ai_cache: cache.get failed for %s", key)
            hit = None
        if hit is not None:
            logger.info("ai_cache hit: %s", key)
            return hit  # type: ignore[return-value]

    # Miss (or refresh) — call the generator.
    result = generator()

    if result is None:
        # Don't poison the cache with a soft-failure result.
        logger.info("ai_cache miss+None: %s (not cached)", key)
        return None

    try:
        cache.set(key, result, timeout=ttl)
        logger.info("ai_cache store: %s ttl=%ss", key, ttl)
    except Exception:  # pragma: no cover — defensive
        logger.warning("ai_cache: cache.set failed for %s", key)

    return result


def compute_application_fingerprint(
    application_id: Any,
    updated_at: Any,
    extra: Optional[str] = None,
) -> str:
    """Canonical fingerprint for application-keyed AI caches.

    Includes ``application_id`` + ``updated_at`` (ISO string). Any
    additional input that should invalidate the cache can be passed
    via ``extra`` (already-hashed or small string).

    Returns a short SHA-256 hex digest.
    """
    parts = [
        str(application_id or ""),
        str(updated_at or ""),
        str(extra or ""),
    ]
    joined = "|".join(parts)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:32]


def compute_grades_fingerprint(grades: Any) -> str:
    """Canonical fingerprint for a set of application grades.

    ``grades`` should be an iterable of ``(subject_id, grade)`` tuples
    or dicts with those keys. Ordering is normalised so two calls with
    the same grade set hash to the same value.
    """
    normalised: list[tuple[str, str]] = []
    try:
        for g in grades or []:
            if isinstance(g, dict):
                sid = str(g.get("subject_id") or g.get("subject") or "")
                grd = str(g.get("grade") or "")
            else:
                sid = str(g[0]) if len(g) > 0 else ""
                grd = str(g[1]) if len(g) > 1 else ""
            if sid:
                normalised.append((sid, grd))
    except Exception:  # pragma: no cover — defensive
        normalised = []

    normalised.sort()
    joined = ";".join(f"{s}:{g}" for s, g in normalised)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:32]


def invalidate_application_caches(application_id: Any) -> int:
    """Best-effort cache invalidation for a specific application.

    Because cache keys include ``updated_at``, bumping
    ``updated_at`` naturally invalidates. This helper exists for
    explicit admin-triggered invalidation (e.g. after force-refresh).
    The default Django cache API does not support key-pattern
    deletion, so this is a no-op for LocMem/Redis; callers should
    rely on ``updated_at`` + TTL instead.
    """
    # Left as a stub — documented intent is to use ``updated_at``
    # bumping, not pattern deletion.
    return 0


__all__ = [
    "cached_ai_call",
    "compute_application_fingerprint",
    "compute_grades_fingerprint",
    "invalidate_application_caches",
    "DEFAULT_TTL_SECONDS",
]
