"""Tenant-scope-aware caching abstraction for performance hardening.

A single shared foundation for the three flag-gated caches introduced by the
system-performance-hardening feature (dashboard aggregates, catalog reads,
capability/scope payloads). Dashboard, catalog, and capability caches are thin
callers of this layer rather than three bespoke implementations.

This mirrors the ``apps.common.ai_cache`` pattern (flag-gated by the caller,
Django cache backend, never poison the cache on a soft failure, never raise on
a cache error) so the codebase stays consistent.

Two responsibilities:

1. **Tenant-scope-aware key builder** (:class:`TenantScopeKeyBuilder`) — builds
   a deterministic, collision-free signature that embeds the caller's resolved
   tenant scope so two distinct scopes can never share a cache entry (R2.2,
   R4.5, R13.3). The signature is derived from
   ``visible_institution_queryset(user)`` + the ``AdminCapabilityService``
   result (user id, role, ``is_super_admin``, ``all_access``, the sorted tuple
   of in-scope institution ids, and the applied institution filter), SHA-256
   hashed to bound key length — **never** from raw role strings.

2. **Graceful-degradation wrapper** (:func:`cached_or_compute`) — the
   computes-on-miss / computes-on-cache-error / flag-off-bypass /
   never-cache-empty contract, so the cached path is observably identical to
   the recompute path (R13.1, R13.2) and Redis degradation never breaks a
   request (R2.8, R4.7).

Invalidation (:func:`invalidate`, :func:`invalidate_user`) uses a per-scope
integer **version token** stored at ``spc:ver:<namespace>:<scope_signature>``.
Because the Django cache API has no pattern-delete, bumping the token changes
the computed key for that scope so subsequent reads miss and recompute. This
gives O(1) scope-wide invalidation without key enumeration (R2.4, R4.3,
R5.4–5.6).

Requirements: 2.2, 2.8, 4.5, 4.7, 5.2, 13.3, 13.4.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any, Callable, Optional, TypeVar

from django.core.cache import cache

logger = logging.getLogger(__name__)

T = TypeVar("T")

#: Sentinel distinguishing "cache miss / backend down" from a genuine ``None``
#: stored value. We never store ``None`` (never-cache-empty), so a retrieved
#: ``None`` always means absent.
_MISS = object()


class TenantScopeKeyBuilder:
    """Builds tenant-scope-aware cache-key signatures.

    The signature embeds the caller's resolved tenant scope so two callers
    share a signature **iff** all of their scope attributes match. This is the
    cross-tenant guard: on read, the wrapper recomputes the expected signature
    for the requesting user and only serves an entry whose key matches exactly;
    any mismatch is treated as absent and recomputed (R2.7, R13.4).
    """

    @staticmethod
    def build_scope_signature(user, *, institution_filter: Any = None) -> str:
        """Stable SHA-256 signature of the caller's resolved tenant scope.

        Composed of the four Tenant_Scope_Key dimensions (R2.2):

        - **user scope** — user id + the sorted tuple of in-scope institution
          ids (from ``visible_institution_queryset``),
        - **role** — the canonical ``role`` resolved by
          ``AdminCapabilityService`` (plus ``is_super_admin`` / ``all_access``
          flags),
        - **institution filter / selected tenant** — the optional
          ``institution_filter`` the caller applied to its queryset (e.g. the
          dashboard's selected-tenant filter).

        Two callers share a signature **iff** all of those scope attributes
        match (R2.2, R4.5), so distinct combinations can never share a cache
        entry. SHA-256 hashed to bound key length.

        ``institution_filter`` may be a single id, an iterable of ids, or
        ``None`` (no filter applied); it is normalised to a stable sorted
        string so ordering never perturbs the signature. Passing it is what
        lets the same user viewing two different selected tenants occupy two
        distinct cache entries rather than colliding on one (R2.7, R13.4).

        Never derived from raw role strings beyond the canonical ``role`` field
        already resolved by ``AdminCapabilityService``; authority decisions
        remain the service's responsibility.
        """
        # Imported lazily to avoid a settings/app-loading import cycle
        # (catalog.services imports broadly).
        from apps.catalog.services import AdminCapabilityService

        service = AdminCapabilityService()

        user_id = getattr(user, "pk", None) or getattr(user, "id", None)

        # Resolve capability flags + in-scope institutions through the
        # centralized authority service (never raw role-string comparison).
        capabilities = service.get_capabilities(user)
        role = getattr(capabilities, "role", "") or ""
        is_super_admin = bool(getattr(capabilities, "is_super_admin", False))
        all_access = bool(getattr(capabilities, "all_access", False))

        institution_ids = (
            service.visible_institution_queryset(user)
            .values_list("id", flat=True)
        )
        # Sort so ordering never perturbs the signature; stringify for stable
        # hashing across id types (int / UUID).
        sorted_ids = sorted(str(i) for i in institution_ids)

        parts = [
            str(user_id or ""),
            role,
            "1" if is_super_admin else "0",
            "1" if all_access else "0",
            ",".join(sorted_ids),
            _normalize_institution_filter(institution_filter),
        ]
        joined = "|".join(parts)
        return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:32]


def _normalize_institution_filter(institution_filter: Any) -> str:
    """Normalise the applied institution filter to a stable string segment.

    Accepts a single id, an iterable of ids, or ``None`` (no filter). The
    result is order-independent so the same logical filter always hashes the
    same way; an absent filter contributes a stable empty marker.
    """
    if institution_filter is None:
        return ""
    if isinstance(institution_filter, (list, tuple, set, frozenset)):
        return ",".join(sorted(str(i) for i in institution_filter))
    return str(institution_filter)


def build_scope_signature(user, *, institution_filter: Any = None) -> str:
    """Module-level convenience wrapper.

    Equivalent to :meth:`TenantScopeKeyBuilder.build_scope_signature`; callers
    (dashboard/catalog) use this shorthand, e.g.
    ``cached_or_compute("dash", build_scope_signature(user), compute, ttl=45)``
    or, with a selected-tenant filter,
    ``build_scope_signature(user, institution_filter=selected_id)``.
    """
    return TenantScopeKeyBuilder.build_scope_signature(
        user, institution_filter=institution_filter
    )


def _safe_segment(value: str, limit: int) -> str:
    return (value or "").strip(":")[:limit]


def _version_key(namespace: str, scope_signature: str) -> str:
    ns = _safe_segment(namespace, 64) or "default"
    sig = _safe_segment(scope_signature, 64) or "none"
    return f"spc:ver:{ns}:{sig}"


def _current_version(namespace: str, scope_signature: str) -> int:
    """Read the per-scope version token (defaults to 0 when absent/unavailable)."""
    try:
        version = cache.get(_version_key(namespace, scope_signature))
    except Exception:  # pragma: no cover - defensive: cache backend down
        logger.warning(
            "scoped_cache: version read failed for %s/%s", namespace, scope_signature
        )
        return 0
    try:
        return int(version) if version is not None else 0
    except (TypeError, ValueError):  # pragma: no cover - defensive
        return 0


def _build_key(
    namespace: str,
    version: int,
    scope_signature: str,
    sub_key: Optional[str] = None,
) -> str:
    """Compose the scoped cache key.

    Shape: ``spc:<namespace>:<version>:<scope_signature>[:<sub_key>]``. The
    embedded ``scope_signature`` is the cross-tenant guard; the ``version``
    segment provides O(1) scope-wide invalidation (bumping it changes the key).
    """
    ns = _safe_segment(namespace, 64) or "default"
    sig = _safe_segment(scope_signature, 64) or "none"
    key = f"spc:{ns}:{version}:{sig}"
    if sub_key:
        key = f"{key}:{_safe_segment(str(sub_key), 128)}"
    return key


def cached_or_compute(
    namespace: str,
    scope_signature: str,
    compute: Callable[[], T],
    *,
    ttl: int,
    sub_key: Optional[str] = None,
    enabled: bool = True,
) -> T:
    """Return the cached value for the scoped key, else compute and store it.

    Contract (computes-on-miss / computes-on-cache-error / flag-off-bypass /
    never-cache-empty):

    - ``enabled=False`` (flag off): call ``compute()`` every time and never
      touch the cache — exactly the pre-feature behaviour.
    - ``cache.get`` raises / backend down: log, treat as a miss, compute
      directly, and return the computed value **without** surfacing a cache
      error to the caller (R2.8, R4.7).
    - miss: ``compute()``, store with ``ttl``; a ``cache.set`` failure is
      swallowed (the computed value is still returned).
    - the ``compute()`` result is returned regardless of whether the store
      succeeds, so the cached path is observably identical to recomputation
      (R13.1, R13.2).
    - **never-cache-empty**: a falsy-but-empty result (``None``, empty list /
      dict / string) is returned but not stored, so the next caller recomputes
      rather than serving a stale empty value.

    Parameters
    ----------
    namespace:
        Short label identifying the cache kind (``"dash"``, ``"cat"``,
        ``"cap"``). First key segment — different namespaces never collide.
    scope_signature:
        The tenant-scope signature (see
        :meth:`TenantScopeKeyBuilder.build_scope_signature`) or a stable
        user-scoped token (e.g. ``str(user.pk)`` for the capability cache).
    compute:
        Zero-argument callable producing the value to cache.
    ttl:
        Cache TTL in seconds.
    sub_key:
        Optional extra dimension appended to the key (e.g. an intake id).
    enabled:
        Feature-flag gate. When ``False`` the cache is bypassed entirely.
    """
    if not enabled:
        # Flag off — behave exactly like pre-feature: always compute,
        # never touch the cache.
        return compute()

    version = _current_version(namespace, scope_signature)
    key = _build_key(namespace, version, scope_signature, sub_key)

    try:
        hit = cache.get(key, _MISS)
    except Exception:  # pragma: no cover - defensive: cache backend down
        logger.warning("scoped_cache: cache.get failed for %s", key)
        hit = _MISS

    if hit is not _MISS:
        logger.debug("scoped_cache hit: %s", key)
        return hit  # type: ignore[return-value]

    # Miss (or cache unavailable) — compute directly.
    result = compute()

    if _is_empty(result):
        # never-cache-empty: don't poison the cache with an empty result.
        logger.debug("scoped_cache miss+empty: %s (not cached)", key)
        return result

    try:
        cache.set(key, result, timeout=ttl)
        logger.debug("scoped_cache store: %s ttl=%ss", key, ttl)
    except Exception:  # pragma: no cover - defensive
        logger.warning("scoped_cache: cache.set failed for %s", key)

    return result


def _is_empty(value: Any) -> bool:
    """Whether a computed result should be treated as empty (not cached)."""
    if value is None:
        return True
    if isinstance(value, (list, dict, tuple, set, str)):
        return len(value) == 0
    return False


def invalidate(
    namespace: str,
    scope_signature: str,
    sub_key: Optional[str] = None,
) -> None:
    """Invalidate a scoped cache entry by bumping the per-scope version token.

    Bumping the integer token at ``spc:ver:<namespace>:<scope_signature>``
    changes the computed key for that scope, so every subsequent read for that
    scope misses and recomputes — O(1) scope-wide invalidation without key
    enumeration (R2.4, R4.3). ``sub_key`` is accepted for API symmetry; because
    invalidation is scope-wide via the version bump, a ``sub_key`` argument
    invalidates the whole scope (every sub-key under it), which is the safe,
    non-stale choice.

    Never raises — a cache backend failure is logged and swallowed so a write
    path is never broken by invalidation.
    """
    vkey = _version_key(namespace, scope_signature)
    try:
        try:
            # ``incr`` is atomic on Redis; it raises ValueError when the key is
            # absent on the LocMem/Redis backends.
            cache.incr(vkey)
        except ValueError:
            # No token yet — seed it. Start at 1 so a future ``incr`` works and
            # the key already differs from the implicit version-0 reads.
            cache.set(vkey, 1, timeout=None)
        logger.debug("scoped_cache invalidate: %s", vkey)
    except Exception:  # pragma: no cover - defensive
        logger.warning("scoped_cache: invalidate failed for %s", vkey)


def invalidate_user(namespace: str, user_id: Any) -> None:
    """Invalidate a user-scoped cache entry (e.g. the capability cache).

    The capability cache keys on ``str(user.pk)`` as its scope signature, so
    user-scoped invalidation is the version bump for that signature (R5.4–5.6).
    Never raises.
    """
    invalidate(namespace, str(user_id))


__all__ = [
    "TenantScopeKeyBuilder",
    "build_scope_signature",
    "cached_or_compute",
    "invalidate",
    "invalidate_user",
]
