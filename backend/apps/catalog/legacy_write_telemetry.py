"""Legacy catalog-write deprecation + usage telemetry (Admissions V2, task 5.1).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 5.1
Requirements: **R7.1** (new catalog writes follow Canonical_Program ->
Program_Offering -> Intake_Offering and reject display-string identifiers),
**R7.3** (legacy catalog write routes have no frontend caller after migration),
**R14.7** (breaking removals expose deprecation/usage telemetry until exit
criteria are met).
Findings: **TEN-03**, **DATA-01**, **API-02**.

The Phase-5 cutover removes the *frontend* callers of the legacy catalog write
routes (institution / intake / program create+detail in
``apps.catalog.views``) and moves the admin UI onto the canonical services. The
legacy routes themselves are **frozen, not yet deleted** — R14.7 requires the
V1 surface to *measure* residual callers by route until the zero-caller exit
criteria are met (Phase 12.2 removes them).

This module provides the measurement + deprecation-signalling seam:

* :func:`record_catalog_write` — a best-effort structured log line + a
  bounded-cardinality counter tagged by ``resource`` / ``method`` /
  ``outcome`` / ``caller`` (first-party vs external vs unknown). It never
  raises in the request path.
* :func:`mark_deprecated` — stamps the RFC-8594 ``Deprecation`` header plus a
  ``Link: <successor>; rel="successor-version"`` and an ``X-Legacy-Catalog-Write``
  hint on a legacy write response, so a caller (and any proxy log) can see the
  route is deprecated and where the canonical successor lives.
* :func:`canonical_program_required_response` — the stable ``400`` an offering
  write returns when it omits ``canonical_program_id`` (R7.1: an offering must
  link a Canonical_Program; a display-string bare-program write is rejected).

It is PII-safe: only the resource, method, outcome, actor **role**, and a
coarse first-party/external caller class are ever emitted — never a user id,
email, IP, tenant id, or hostname value.
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from urllib.parse import urlsplit

from django.conf import settings
from rest_framework import status
from rest_framework.response import Response

try:  # pragma: no cover - optional at import time
    import sentry_sdk
except Exception:  # pragma: no cover - environments without sentry_sdk
    sentry_sdk = None  # type: ignore[assignment]


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Counter registry + label allow-lists (bounded cardinality, PII-safe)
# ---------------------------------------------------------------------------

#: The two catalog-write counters. ``catalog.legacy_write`` measures every hit
#: on a frozen legacy route (R14.7); ``catalog.canonical_write`` measures the
#: canonical successor writes so the migration can be proven complete by the
#: legacy counter trending to zero first-party callers.
CATALOG_WRITE_COUNTERS: tuple[str, ...] = (
    "catalog.legacy_write",
    "catalog.canonical_write",
)

#: Resources a catalog write can target.
_ALLOWED_RESOURCES = frozenset({"institution", "intake", "program", "intake_offering", "fee"})

#: HTTP methods a catalog write can use.
_ALLOWED_METHODS = frozenset({"POST", "PATCH", "PUT", "DELETE"})

#: Outcome of a legacy-write measurement.
_ALLOWED_OUTCOMES = frozenset({"served", "rejected"})

#: Coarse caller classification derived from the request Origin/Referer host.
_ALLOWED_CALLERS = frozenset({"first_party", "external", "unknown"})

#: Actor roles (bounded). Anything else collapses to ``unknown`` so a stray
#: value cannot explode metric cardinality.
_ALLOWED_ROLES = frozenset({"student", "reviewer", "admin", "super_admin", "anonymous", "unknown"})

#: The stable error code an offering write returns when it omits the canonical
#: program link (R7.1). Registered in docs/canonical-truth-map.md (catalog
#: integrity codes).
CANONICAL_PROGRAM_REQUIRED_CODE = "CANONICAL_PROGRAM_REQUIRED"


def _sentry_metrics():
    """Return ``sentry_sdk.metrics`` if available, else ``None`` (never raises)."""
    if sentry_sdk is None:
        return None
    return getattr(sentry_sdk, "metrics", None)


def _normalize_host(value: str) -> str:
    """Return the lowercase host of a URL/host string, without scheme or port."""
    raw = (value or "").strip()
    if not raw:
        return ""
    if "//" in raw:
        raw = urlsplit(raw).netloc or raw
    return raw.split("@")[-1].split(":", 1)[0].strip().lower()


def _first_party_hosts() -> set[str]:
    """Hosts considered first-party (the admissions/jobs-ops frontends).

    Derived from ``settings.CORS_ALLOWED_ORIGINS`` plus ``FRONTEND_URL`` when
    present. Best-effort: an empty/unavailable config yields an empty set so
    every caller classifies as ``unknown`` rather than mislabelling.
    """
    hosts: set[str] = set()
    for origin in getattr(settings, "CORS_ALLOWED_ORIGINS", None) or []:
        host = _normalize_host(str(origin))
        if host:
            hosts.add(host)
    frontend_url = getattr(settings, "FRONTEND_URL", None)
    if frontend_url:
        host = _normalize_host(str(frontend_url))
        if host:
            hosts.add(host)
    return hosts


def _classify_caller(request) -> str:
    """Classify the request as ``first_party`` / ``external`` / ``unknown``.

    Uses the ``Origin`` header (falling back to ``Referer``) compared against
    the configured frontend hosts. A browser same-origin request may omit both;
    that is ``unknown`` rather than a false ``external``.
    """
    if request is None:
        return "unknown"
    headers = getattr(request, "headers", {}) or {}
    origin = headers.get("Origin") or headers.get("Referer") or ""
    host = _normalize_host(origin)
    if not host:
        return "unknown"
    first_party = _first_party_hosts()
    if not first_party:
        return "unknown"
    return "first_party" if host in first_party else "external"


def _actor_role(request) -> str:
    """Return the bounded actor role for the request (never PII)."""
    user = getattr(request, "user", None) if request is not None else None
    if user is None or not getattr(user, "is_authenticated", False):
        return "anonymous"
    role = getattr(user, "role", None)
    return role if role in _ALLOWED_ROLES else "unknown"


def _increment(counter: str, tags: dict[str, str]) -> None:
    """Best-effort counter increment mirrored as a structured log (never raises)."""
    metrics_mod = _sentry_metrics()
    if metrics_mod is not None and hasattr(metrics_mod, "incr"):
        try:  # pragma: no cover - sentry optional
            metrics_mod.incr(counter, 1, tags=tags)
        except Exception:  # pragma: no cover - defensive
            logger.warning("catalog_write_telemetry: metrics.incr failed", extra={"metric": counter})


def record_catalog_write(
    request,
    *,
    resource: str,
    method: str,
    legacy: bool,
    outcome: str = "served",
) -> dict[str, str]:
    """Record a catalog write (legacy or canonical) for R14.7 usage telemetry.

    Emits a bounded-cardinality counter (``catalog.legacy_write`` or
    ``catalog.canonical_write``) tagged by ``resource``/``method``/``outcome``/
    ``caller``/``user_role`` and a mirrored ``INFO`` structured log line
    (``type=metric``) so residual callers can be measured by route even without
    a metrics backend. Never raises in the request path.

    Returns the sanitized tag dict (useful for tests/log assertions).
    """
    resource_tag = resource if resource in _ALLOWED_RESOURCES else "unknown"
    method_tag = (method or "").upper()
    if method_tag not in _ALLOWED_METHODS:
        method_tag = "unknown"
    outcome_tag = outcome if outcome in _ALLOWED_OUTCOMES else "served"
    caller_tag = _classify_caller(request)
    role_tag = _actor_role(request)

    counter = "catalog.legacy_write" if legacy else "catalog.canonical_write"
    tags = {
        "resource": resource_tag,
        "method": method_tag,
        "outcome": outcome_tag,
        "caller": caller_tag,
        "user_role": role_tag,
    }

    try:
        _increment(counter, tags)
        logger.info(
            "catalog_write",
            extra={
                "type": "metric",
                "metric": counter,
                "route": getattr(request, "path", "") if request is not None else "",
                "tags": tags,
            },
        )
    except Exception:  # pragma: no cover - telemetry must never block a write
        pass

    return tags


#: Resource -> registered compatibility-surface id (``apps.common.compatibility_register``).
#: Task 12.2 (R2.6, R14.7): every legacy catalog write now publishes an
#: **announced end date**, not only "deprecated". A resource missing from this
#: map gets no ``Sunset`` — a date stamped in front of a caller that nothing
#: audits is worse than no date.
_SURFACE_BY_RESOURCE: dict[str, str] = {
    "institution": "catalog.legacy_institution_write",
    "intake": "catalog.legacy_intake_write",
    "program": "catalog.legacy_program_write",
}


def mark_deprecated(response: Response, *, resource: str, successor: str) -> Response:
    """Stamp deprecation headers on a legacy catalog write response (R14.7).

    * ``Deprecation: true`` — RFC 9745 signal that the route is deprecated.
    * ``Sunset: <http-date>`` — RFC 8594 **announced end date**, read from the
      external-compatibility register (``apps.common.compatibility_register``).
      Added by admissions-v2 task 12.2: task 12.2's own constraint is *"keep
      documented external compatibility until its announced end date"*, and
      before this these routes had a deprecation with no end, which is an
      exemption wearing a deprecation's clothes. The register carries the owner
      and the exit criteria; the header is how a caller finds out without
      reading our source.
    * ``Link: <successor>; rel="successor-version"`` — where the canonical
      write now lives.
    * ``X-Legacy-Catalog-Write: <resource>`` — a machine hint used by the
      source/telemetry evidence to spot any residual first-party caller.

    Returns the same response for chaining. Never raises — a header this route
    could not stamp must not turn a working legacy write into a 500.
    """
    try:
        response["Deprecation"] = "true"
        response["X-Legacy-Catalog-Write"] = resource
        if successor:
            response["Link"] = f'<{successor}>; rel="successor-version"'
        surface_id = _SURFACE_BY_RESOURCE.get(resource)
        if surface_id:
            from apps.common.compatibility_register import sunset_for

            response["Sunset"] = sunset_for(surface_id)
    except Exception:  # pragma: no cover - header stamping must never block
        pass
    return response


def canonical_program_required_response(*, method: str = "POST") -> Response:
    """Stable ``400`` for an offering write missing ``canonical_program_id`` (R7.1).

    A ``Program`` row is an **Institution_Program_Offering**; it must reference
    a Canonical_Program. The legacy display-string write (a bare program created
    from a typed name with no canonical link) is rejected with this stable code
    so the frontend is forced onto the canonical Canonical_Program ->
    Program_Offering path (TEN-03, DATA-01).
    """
    return Response(
        {
            "success": False,
            "error": (
                "A program offering must reference a canonical program. "
                "Select a canonical program instead of creating a free-text program."
            ),
            "code": CANONICAL_PROGRAM_REQUIRED_CODE,
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


__all__ = [
    "CATALOG_WRITE_COUNTERS",
    "CANONICAL_PROGRAM_REQUIRED_CODE",
    "record_catalog_write",
    "mark_deprecated",
    "canonical_program_required_response",
]
