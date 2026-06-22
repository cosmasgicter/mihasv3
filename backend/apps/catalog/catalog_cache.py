"""Catalog cache scope helpers + write-path invalidation.

Task 14.2 — invalidate catalog cache entries on admin writes before the write
response returns (R4.3). The catalog read path
(:mod:`apps.catalog.views`) caches serialized catalog responses under
``namespace="cat"`` keyed by a resolved tenant-scope signature
(``_catalog_scope_signature``):

* authenticated admins → :func:`~apps.common.scoped_cache.build_scope_signature`
  (their resolved tenant scope),
* public / student tenant portals → ``inst:<institution pk>``,
* an unresolved host → the neutral Beanola context (:data:`CATALOG_NEUTRAL_SCOPE`).

This module mirrors that scope resolution so a write invalidates the *same*
scope signatures the reads are cached under, then forces the next read to
recompute by bumping the per-scope version token
(:func:`~apps.common.scoped_cache.invalidate`).

Requirements: 4.3.
"""

from __future__ import annotations

import logging
from typing import Any

from apps.common.scoped_cache import build_scope_signature, invalidate

logger = logging.getLogger(__name__)

#: Cache namespace shared by every catalog read/write. Must match the namespace
#: used by ``apps.catalog.views._cached_catalog_payload``.
CATALOG_CACHE_NAMESPACE = "cat"

#: Stable signature segment for the neutral Beanola context / unresolved scope.
#: Must match ``apps.catalog.views._CATALOG_NEUTRAL_SCOPE``.
CATALOG_NEUTRAL_SCOPE = "neutral"


def catalog_institution_scope(institution_id: Any) -> str:
    """Scope signature a tenant/public catalog read is cached under (R4.5).

    Mirrors the public/student branch of
    ``apps.catalog.views._catalog_scope_signature``, which keys a white-label
    tenant portal on ``inst:<institution pk>``. Passing the same institution pk
    a read resolved from the host therefore targets the exact cached entry.
    """
    return f"inst:{institution_id}"


def invalidate_catalog_scopes(*institution_ids: Any, user=None) -> None:
    """Invalidate catalog cache entries for the scopes a write affects (R4.3).

    Called synchronously within the write request *before* its response returns
    (not via ``on_commit``), per R4.3. Bumps the per-scope version token —
    O(1) scope-wide invalidation that forces the next read for that scope to
    recompute. :func:`~apps.common.scoped_cache.invalidate` never raises, so a
    write path is never broken by invalidation.

    The scopes invalidated for any catalog write:

    * the **neutral / shared Beanola portal** scope — the shared catalog listing
      derives from every tenant's records, so any catalog write may change it;
    * each supplied **owning institution** tenant scope (``inst:<id>``) — for
      program / institution / fee writes that belong to a single tenant, so that
      tenant's white-label portal recomputes (pass the old *and* new institution
      ids when a write moves a record between tenants);
    * the **writing admin's own resolved scope** (when ``user`` is given) so the
      actor reads fresh data immediately rather than within the TTL window.

    Global writes (intakes, subjects, canonical assignments) have no single
    owning institution; invalidating the neutral scope plus the actor scope is
    the pragmatic correct set per design — catalog reads scoped to *other*
    tenants recompute within the catalog TTL bound rather than via per-write
    fan-out across every admin signature.
    """
    # Shared Beanola portal / unresolved-host reads always derive from the full
    # catalog, so every catalog write may change them.
    invalidate(CATALOG_CACHE_NAMESPACE, CATALOG_NEUTRAL_SCOPE)

    # Owning-tenant white-label portals (deduplicated; ids may repeat when an
    # old/new institution coincide).
    seen: set[str] = set()
    for institution_id in institution_ids:
        if institution_id is None:
            continue
        key = str(institution_id)
        if key in seen:
            continue
        seen.add(key)
        invalidate(CATALOG_CACHE_NAMESPACE, catalog_institution_scope(institution_id))

    # The writing admin's own resolved scope, so the actor never reads a stale
    # entry it just changed.
    if user is not None:
        try:
            invalidate(CATALOG_CACHE_NAMESPACE, build_scope_signature(user))
        except Exception:  # pragma: no cover - defensive: never break the write
            logger.warning(
                "catalog cache: actor scope invalidation failed", exc_info=True
            )


__all__ = [
    "CATALOG_CACHE_NAMESPACE",
    "CATALOG_NEUTRAL_SCOPE",
    "catalog_institution_scope",
    "invalidate_catalog_scopes",
]
