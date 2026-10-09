"""Shared helpers for the ``/api/v1/catalog/`` view modules.

Split out of ``apps/catalog/views.py`` by admissions-v2 task 12.1 (finding
**MAINT-01**). Every definition here is the one that was in ``views.py``, lifted
verbatim by ``docs/v2-evidence/12.1/raw/backend-view-extract.py``.

Three concerns live here, and all three are shared by more than one endpoint:

* **the response envelopes** the OpenAPI schema registers by name, so a split
  cannot rename a schema component;
* **the read scope** — ``_is_admin`` / ``_scope_*_queryset_for_request`` /
  ``_resolve_public_request_context`` — the one place a white-label host narrows a
  public listing to its own tenant;
* **the read cache** — ``_catalog_scope_signature`` + ``_cached_catalog_payload``,
  whose scope-signature rule is the guard that a query parameter cannot create a
  cross-tenant cache key.
"""

from __future__ import annotations

import logging

from django.conf import settings
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.response import Response
from drf_spectacular.utils import inline_serializer

from apps.accounts.permissions import is_super_admin
from apps.catalog.catalog_cache import CATALOG_NEUTRAL_SCOPE, catalog_institution_scope
from apps.catalog.models import Institution
from apps.catalog.serializers import (
    CanonicalProgramSerializer,
    InstitutionSerializer,
    IntakeSerializer,
    ProgramSerializer,
    SubjectSerializer,
)
from apps.catalog.services import (
    AdminCapabilityService,
    InstitutionContextService,
    OfferingDirectoryService,
)
from apps.common.openapi_helpers import (
    MessageSerializer,
    envelope_serializer,
    paginated_serializer,
)
from apps.common.scoped_cache import build_scope_signature, cached_or_compute

logger = logging.getLogger(__name__)

ProgramListResponseSerializer = envelope_serializer(
    "CatalogProgramListResponse",
    paginated_serializer("CatalogProgramPage", ProgramSerializer),
)


ProgramResponseSerializer = envelope_serializer(
    "CatalogProgramResponse",
    ProgramSerializer(),
)


CanonicalProgramListResponseSerializer = envelope_serializer(
    "CatalogCanonicalProgramListResponse",
    paginated_serializer("CatalogCanonicalProgramPage", CanonicalProgramSerializer),
)


IntakeListResponseSerializer = envelope_serializer(
    "CatalogIntakeListResponse",
    IntakeSerializer(many=True),
)


IntakeResponseSerializer = envelope_serializer(
    "CatalogIntakeResponse",
    IntakeSerializer(),
)


#: The subjects list carries one extra top-level key beyond the standard
#: envelope: ``meta.subject_catalog_version`` (design §9.2 — "the subject catalog
#: is seeded and versioned by the backend"). ``data`` stays a plain list so every
#: existing consumer is unchanged.
SubjectListResponseSerializer = inline_serializer(
    name="CatalogSubjectListResponse",
    fields={
        "success": drf_serializers.BooleanField(default=True),
        "data": SubjectSerializer(many=True),
        "meta": inline_serializer(
            name="CatalogSubjectListMeta",
            fields={"subject_catalog_version": drf_serializers.CharField()},
        ),
    },
)


InstitutionListResponseSerializer = envelope_serializer(
    "CatalogInstitutionListResponse",
    InstitutionSerializer(many=True),
)


InstitutionResponseSerializer = envelope_serializer(
    "CatalogInstitutionResponse",
    InstitutionSerializer(),
)


CatalogMessageResponseSerializer = envelope_serializer(
    "CatalogMessageResponse",
    MessageSerializer(),
)


def _request_method(view, default="GET"):
    """Read the current request method safely during schema generation."""
    request = getattr(view, "request", None)
    method = getattr(request, "method", None)
    return method or default


def _is_admin(request):
    """Check if the requesting user has admin role."""
    user = getattr(request, "user", None)
    if not user or not getattr(user, "is_authenticated", False):
        return False
    return getattr(user, "role", "") in ("admin", "super_admin")


def _is_super_admin_request(request):
    """Check if the requesting user is a Beanola platform super admin."""
    user = getattr(request, "user", None)
    return bool(user and getattr(user, "is_authenticated", False) and is_super_admin(user))


def _visible_institution_queryset(request):
    """Return the actor's visible institutions, failing closed to none."""
    try:
        return AdminCapabilityService().visible_institution_queryset(request.user)
    except Exception:
        logger.warning("Failed to resolve visible catalog institutions", exc_info=True)
        return Institution.objects.none()


def _scope_institution_queryset_for_request(queryset, request):
    """Scope institution reads for legacy catalog endpoints.

    Super admins keep platform-wide read access. Tenant admins are narrowed to
    their assigned institutions. Public/student reads keep the existing active
    listing, but tenant-domain requests are narrowed to the resolved tenant so a
    white-label portal never exposes other schools through this legacy surface.
    """
    if _is_super_admin_request(request):
        return queryset
    if _is_admin(request):
        return queryset.filter(pk__in=_visible_institution_queryset(request).values("pk"))

    context = _resolve_public_request_context(request)
    if context is not None and context.institution is not None:
        return queryset.filter(pk=context.institution.pk)
    return queryset


def _scope_program_queryset_for_request(queryset, request):
    """Scope program-offering reads for legacy catalog endpoints."""
    if _is_super_admin_request(request):
        return queryset
    if _is_admin(request):
        return queryset.filter(
            institution_id__in=_visible_institution_queryset(request).values("pk")
        )

    context = _resolve_public_request_context(request)
    if context is not None and context.institution is not None:
        return queryset.filter(institution_id=context.institution.pk)
    return queryset


def _set_public_cache(response):
    """Set Cache-Control: public, max-age=300 for public responses."""
    response["Cache-Control"] = "public, max-age=300"
    return response


#: Time-to-live for catalog read-response cache entries (R4.2: 300–600s).
_CATALOG_CACHE_TTL = 450


#: Stable signature segment for the neutral Beanola context / unresolved scope.
#: Sourced from ``catalog_cache`` so the read scope and the write-path
#: invalidation (task 14.2) stay in lockstep.
_CATALOG_NEUTRAL_SCOPE = CATALOG_NEUTRAL_SCOPE


# These are the only public catalog endpoints allowed to opt into an explicit
# institution selector. Keep their cache scope decision on the same allowlist as
# the view's tenant selector so a query cannot create a cross-tenant cache key.
_CANONICAL_PROGRAM_SELECTOR_ENDPOINT = "canonical_programs"


_ASSIGNMENT_PREVIEW_SELECTOR_ENDPOINT = "assignment_preview"


_CATALOG_EXPLICIT_SELECTOR_ENDPOINTS = {
    "/api/v1/catalog/canonical-programs/": _CANONICAL_PROGRAM_SELECTOR_ENDPOINT,
    "/api/v1/catalog/assignment-preview/": _ASSIGNMENT_PREVIEW_SELECTOR_ENDPOINT,
}


def _catalog_scope_signature(request):
    """Resolve the catalog cache scope signature for a request (R2.4, R5.3).

    For the two allowlisted public selector endpoints, scope by the effective
    canonical institution before considering the caller's generic cache scope:
    a trusted tenant host wins over a query value, and a registered neutral
    shared portal selection uses that selected tenant's ``inst:<id>`` partition.
    An unregistered/unknown host remains neutral. All other catalog endpoints
    preserve their existing admin and host-derived cache behavior.
    """
    selector_endpoint = _CATALOG_EXPLICIT_SELECTOR_ENDPOINTS.get(
        getattr(request, "path", "")
    )
    if selector_endpoint:
        try:
            context = _resolve_public_request_context(request)
            institution_id = OfferingDirectoryService().resolved_institution_id(
                context,
                request.query_params.get("institution"),
                request_host=_request_host(request),
                endpoint=selector_endpoint,
            )
        except Exception:  # pragma: no cover - defensive
            logger.warning(
                "catalog cache: effective institution resolution failed; using neutral",
                exc_info=True,
            )
            institution_id = None
        if institution_id is not None:
            return catalog_institution_scope(institution_id)

    user = getattr(request, "user", None)
    if user is not None and getattr(user, "is_authenticated", False) and _is_admin(request):
        try:
            return build_scope_signature(user)
        except Exception:  # pragma: no cover - defensive
            logger.warning(
                "catalog cache: admin scope signature failed; using neutral",
                exc_info=True,
            )
            return _CATALOG_NEUTRAL_SCOPE

    # Public / student: resolve the white-label tenant context from the host.
    try:
        context = _resolve_public_request_context(request)
    except Exception:  # pragma: no cover - defensive
        logger.warning(
            "catalog cache: public scope resolution failed; using neutral",
            exc_info=True,
        )
        return _CATALOG_NEUTRAL_SCOPE
    if context is not None and getattr(context, "institution", None) is not None:
        return catalog_institution_scope(context.institution.pk)
    return _CATALOG_NEUTRAL_SCOPE


def _cached_catalog_payload(request, sub_key, compute):
    """Return a cached catalog response body for the scoped key (R4.1–R4.7).

    ``compute`` is a zero-argument callable returning the fully enveloped
    response body dict (``{"success": True, "data": ...}``). The value is cached
    under ``namespace="cat"`` keyed by the resolved tenant scope signature plus a
    per-request ``sub_key`` (endpoint + relevant query params), with a TTL inside
    the required 300–600s window (R4.2).

    When the catalog cache flag is off the wrapper bypasses the cache entirely
    and computes every time (pre-feature behaviour). A cache read/write failure
    degrades to computation with no error surfaced to the caller (R4.7); both
    behaviours are provided by :func:`~apps.common.scoped_cache.cached_or_compute`.
    """
    enabled = getattr(settings, "PERF_CACHE_CATALOG", False)
    scope_signature = _catalog_scope_signature(request)
    return cached_or_compute(
        "cat",
        scope_signature,
        compute,
        ttl=_CATALOG_CACHE_TTL,
        sub_key=sub_key,
        enabled=enabled,
    )


#: Per-method platform capabilities for the institution legacy write views
#: (R5.1). Only the write methods are gated; GET stays open/unchanged (R5.5).
_INSTITUTION_WRITE_CAPABILITIES = {
    "POST": "platform.tenant.create",
    "PUT": "platform.tenant.update",
    "PATCH": "platform.tenant.update",
    "DELETE": "platform.tenant.deactivate",
}


#: Intakes remain global, so every intake write requires the single
#: ``platform.intake.manage`` capability (R5.3).
_INTAKE_WRITE_CAPABILITY = "platform.intake.manage"


def _forbidden_response():
    """A non-revealing 403 for a denied legacy catalog write (R5.4).

    Discloses no tenant identifier, name, count, or attribute — just a stable
    ``FORBIDDEN`` code so a Tenant_Admin probing another tenant's catalog
    endpoint cannot infer anything about the target.
    """
    return Response(
        {
            "success": False,
            "error": "You do not have permission to perform this action.",
            "code": "FORBIDDEN",
        },
        status=status.HTTP_403_FORBIDDEN,
    )


#: Sentinel returned by :func:`_resolve_intake_filter` when the caller supplied
#: an ``?intake=`` value that matches no intake at all. It is distinct from
#: ``None`` (no filter requested), because "you asked for an intake that does not
#: exist" must narrow the result to nothing rather than list everything.
_INTAKE_FILTER_UNRESOLVED = object()


def _resolve_intake_filter(raw: str | None):
    """Resolve a public ``?intake=`` query value to one intake id.

    The catalog list endpoints accept either an intake **UUID** or an intake
    **name**, because the student wizard hydrates a resumed draft from
    ``applications.intake`` — a legacy display *snapshot string*, not a canonical
    id (see ``docs/canonical-truth-map.md`` → Multi-Tenant). Both spellings
    therefore reach these endpoints in normal use.

    Returns:
        * ``None`` — no filter was requested.
        * an intake id string — the value resolved.
        * :data:`_INTAKE_FILTER_UNRESOLVED` — a value was supplied and matched
          nothing, so the caller must return an empty result set.

    This exists as one function because the two sibling endpoints previously
    disagreed: ``/catalog/programs/`` resolved names, while
    ``/catalog/canonical-programs/`` passed the raw string into a UUID filter and
    raised ``ValidationError`` — surfacing as an unhandled **500** on a merely
    malformed query parameter, which no public read endpoint should ever do
    (R14.1: refusals are envelopes with stable codes, not stack traces).
    """
    value = (raw or "").strip()
    if not value:
        return None

    import uuid as _uuid

    from apps.catalog.models import Intake

    try:
        return str(_uuid.UUID(value))
    except (ValueError, AttributeError, TypeError):
        pass

    intake = Intake.objects.filter(name=value, is_active=True).first()
    return str(intake.id) if intake else _INTAKE_FILTER_UNRESOLVED


def _resolve_request_context(request):
    host = _request_host(request)
    return InstitutionContextService().resolve(host)


def _request_host(request):
    return request.headers.get("X-Forwarded-Host") or request.get_host()


def _is_local_shared_host(host: str) -> bool:
    normalized = (host or "").split(":", 1)[0].strip().lower()
    return normalized in {"localhost", "127.0.0.1", "testserver", "web", "0.0.0.0"}


def _resolve_public_request_context(request):
    """Resolve white-label context only when the host can plausibly be a tenant.

    Legacy catalog list endpoints are public and heavily unit-tested without a
    database. The obvious local/shared hosts are not tenant domains, so avoid a
    database-backed domain lookup for those while still resolving custom tenant
    hostnames end to end.
    """
    host = _request_host(request)
    if _is_local_shared_host(host):
        return None
    return InstitutionContextService().resolve(host)
