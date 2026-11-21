"""Shared helpers for the ``/api/v1/catalog/`` view modules.

Split out of ``apps/catalog/views.py`` by admissions-v2 task 12.1 (finding
**MAINT-01**). Every definition here is the one that was in ``views.py``, lifted
verbatim by ``docs/v2-evidence/12.1/raw/backend-view-extract.py``.

Two concerns live here, and both are shared by more than one endpoint:

* **the response envelopes** the OpenAPI schema registers by name, so a split
  cannot rename a schema component;
* **the read scope** — ``_is_admin`` / ``_scope_*_queryset_for_request`` /
  ``_resolve_public_request_context`` — the one place a white-label host narrows a
  public listing to its own tenant.

A third, the flag-gated read cache (``_catalog_scope_signature`` +
``_cached_catalog_payload``), was removed by platform-simplification task 16.2
(decision D7 option A): no environment the repository configures turned it on,
and a local on/off measurement showed no material benefit.
"""

from __future__ import annotations

import logging

from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.response import Response
from drf_spectacular.utils import inline_serializer

from apps.accounts.permissions import is_super_admin
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
)
from apps.common.openapi_helpers import (
    MessageSerializer,
    envelope_serializer,
    paginated_serializer,
)

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


# The two public catalog endpoints allowed to opt into an explicit institution
# selector; ``OfferingDirectoryService.resolved_institution_id`` decides, per
# endpoint, whether a query selector is honoured (``program_views.py``).
_CANONICAL_PROGRAM_SELECTOR_ENDPOINT = "canonical_programs"


_ASSIGNMENT_PREVIEW_SELECTOR_ENDPOINT = "assignment_preview"


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
