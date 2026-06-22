"""Catalog views.

Implements task 14.2.
Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
"""

import logging
from types import SimpleNamespace

from django.conf import settings
from django.db.models import Prefetch
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
    extend_schema_view,
)
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authentication import OptionalJWTCookieAuthentication
from apps.accounts.permissions import IsAdmin
from apps.accounts.permissions import is_super_admin
from apps.catalog.models import CanonicalProgram, Institution, Intake, Program, ProgramIntake, Subject
from apps.catalog.permissions import (
    HasPlatformCapability,
    TenantScopedCapabilityMixin,
)
from apps.catalog.serializers import (
    CanonicalProgramSerializer,
    InstitutionSerializer,
    IntakeSerializer,
    ProgramCreateUpdateSerializer,
    ProgramSerializer,
    SubjectSerializer,
)
from apps.catalog.services import (
    AdminCapabilityService,
    InstitutionContextService,
    OfferingDirectoryService,
)
from apps.common.openapi_helpers import (
    ErrorResponseSerializer,
    MessageSerializer,
    envelope_serializer,
    paginated_serializer,
)
from apps.catalog.catalog_cache import (
    CATALOG_NEUTRAL_SCOPE,
    catalog_institution_scope,
    invalidate_catalog_scopes,
)
from apps.common.pagination import StandardPagination
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
SubjectListResponseSerializer = envelope_serializer(
    "CatalogSubjectListResponse",
    SubjectSerializer(many=True),
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


def _catalog_scope_signature(request):
    """Resolve the catalog cache scope signature for a request (R4.5, R4.6).

    The signature embeds the resolved tenant scope so a cached catalog response
    is reused only within the same tenant scope it was computed for, and two
    distinct scopes can never share an entry (R4.5):

    * **Authenticated admins / super-admins** key on their resolved tenant scope
      (visible institutions + role) via
      :func:`~apps.common.scoped_cache.build_scope_signature`, so two admins with
      different scopes never share an entry.
    * **Public / student reads** key on the host-resolved tenant context: a
      white-label tenant keys on its institution id, while an unresolved host
      falls back to the neutral Beanola context and never serves a
      tenant-scoped entry (R4.6).

    Any failure to resolve the scope degrades to the neutral context rather than
    surfacing an error (R4.7).
    """
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


class CatalogContextView(APIView):
    """GET /api/v1/catalog/context/ - resolve shared vs white-label portal context."""

    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTCookieAuthentication]

    @extend_schema(
        operation_id="catalog_context",
        tags=["catalog"],
        auth=[],
        responses={200: OpenApiResponse(response=OpenApiTypes.OBJECT)},
    )
    def get(self, request):
        context = _resolve_request_context(request)
        institution = context.institution
        response = Response({
            "success": True,
            "data": {
                "portal_type": context.portal_type,
                "institution_id": str(institution.id) if institution else None,
                "institution_code": institution.code if institution else None,
                "brand": context.brand,
            },
        })
        return _set_public_cache(response)


@extend_schema_view(
    get=extend_schema(
        operation_id="catalog_programs_list",
        tags=["catalog"],
        auth=[],
        parameters=[
            OpenApiParameter("page", OpenApiTypes.INT, OpenApiParameter.QUERY, description="Page number."),
            OpenApiParameter("pageSize", OpenApiTypes.INT, OpenApiParameter.QUERY, description="Page size."),
        ],
        responses={200: OpenApiResponse(response=ProgramListResponseSerializer)},
    ),
    post=extend_schema(
        operation_id="catalog_programs_create",
        tags=["catalog"],
        request=ProgramCreateUpdateSerializer,
        responses={
            201: OpenApiResponse(response=ProgramResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class ProgramListCreateView(APIView):
    """GET /api/v1/catalog/programs/ - list programs (public + admin)
    POST /api/v1/catalog/programs/ - create program offering (gated)

    Creating a ``Program`` is creating an **Institution_Program_Offering** — i.e.
    assigning a **Canonical_Program** to a Tenant. That assignment is restricted
    to Super_Admins (``platform.canonical_program.manage`` /
    ``platform.program_assignment.manage``); a Tenant_Admin is limited to
    requesting offering changes (``tenant.program.request_change``) and can never
    create a cross-tenant offering. Authority is decided per-object through
    :meth:`AdminCapabilityService.can_manage_program` (R8.8, R5.2).
    """

    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTCookieAuthentication]
    serializer_class = ProgramSerializer

    def get_permissions(self):
        if _request_method(self) == "POST":
            # Capability is evaluated per-object in ``post`` via
            # ``can_manage_program`` (R5.2); require an authenticated actor here.
            return [IsAuthenticated()]
        return [AllowAny()]

    def get_authenticators(self):
        method = _request_method(self)
        # POST uses the CSRF-enforcing authenticator; GET tries auth but does
        # not require it so the public catalog listing is unchanged (R5.5).
        from apps.accounts.authentication import JWTCookieAuthentication, OptionalJWTCookieAuthentication
        if method == "POST":
            return [JWTCookieAuthentication()]
        return [OptionalJWTCookieAuthentication()]

    def get(self, request):
        # Catalog read cache (R4.1, R4.2, R4.5–R4.7): the program listing body is
        # computed under a tenant-scoped key and reused within its TTL. The flag
        # defaults off, so this is byte-identical to the pre-feature path until
        # ``PERF_CACHE_CATALOG`` is flipped.
        def compute():
            if _is_admin(request):
                queryset = Program.objects.select_related("institution").all()
            else:
                queryset = Program.objects.select_related("institution").filter(is_active=True)
            queryset = _scope_program_queryset_for_request(queryset, request)

            # Filter by intake if provided (uses program_intakes junction table)
            # Accepts either an intake UUID or an intake name string.
            intake_id = request.query_params.get("intake")
            if intake_id:
                from apps.catalog.models import ProgramIntake, Intake
                import uuid as _uuid

                # Determine if the value is a UUID or a name
                resolved_intake_id = None
                try:
                    resolved_intake_id = str(_uuid.UUID(intake_id))
                except (ValueError, AttributeError):
                    # Not a UUID - try to resolve by name
                    intake_obj = Intake.objects.filter(name=intake_id, is_active=True).first()
                    if intake_obj:
                        resolved_intake_id = str(intake_obj.id)

                if resolved_intake_id:
                    program_ids = ProgramIntake.objects.filter(
                        intake_id=resolved_intake_id
                    ).values_list("program_id", flat=True)
                    queryset = queryset.filter(id__in=program_ids)
                else:
                    # No matching intake found - return empty set
                    queryset = queryset.none()

            queryset = queryset.order_by("name")

            paginator = StandardPagination()
            page = paginator.paginate_queryset(queryset, request)
            if page is not None:
                serializer = ProgramSerializer(page, many=True)
                return paginator.get_paginated_response(serializer.data).data
            serializer = ProgramSerializer(queryset, many=True)
            return {"success": True, "data": serializer.data}

        sub_key = (
            f"programs|admin={int(_is_admin(request))}"
            f"|intake={request.query_params.get('intake') or ''}"
            f"|page={request.query_params.get('page') or ''}"
            f"|pageSize={request.query_params.get('pageSize') or ''}"
        )
        body = _cached_catalog_payload(request, sub_key, compute)
        response = Response(body)

        if not _is_admin(request):
            _set_public_cache(response)
        return response

    def post(self, request):
        # R5.2 / R5.4 / R8.8: gate the write through ``can_manage_program`` BEFORE
        # any serializer save. Creating a Program offering with no institution is
        # a Canonical_Program assignment (Super_Admin only); with an institution
        # it requires the tenant program capability for that owning institution. A
        # submitted out-of-scope ``institution_id`` is rejected with a
        # non-revealing 403 and no mutation.
        submitted_institution_id = request.data.get("institution_id")
        candidate = SimpleNamespace(institution_id=submitted_institution_id)
        if not AdminCapabilityService().can_manage_program(request.user, candidate):
            return _forbidden_response()

        serializer = ProgramCreateUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "error": "Validation failed",
                    "code": "VALIDATION_ERROR",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        program = Program.objects.create(**serializer.validated_data)
        # R4.3: invalidate catalog reads (programs / canonical offerings /
        # assignment preview) for the owning tenant + shared portal before the
        # write response returns.
        invalidate_catalog_scopes(program.institution_id, user=request.user)
        out = ProgramSerializer(program)
        return Response({"success": True, "data": out.data}, status=status.HTTP_201_CREATED)


@extend_schema_view(
    get=extend_schema(
        operation_id="catalog_canonical_programs_list",
        tags=["catalog"],
        auth=[],
        parameters=[
            OpenApiParameter("intake", OpenApiTypes.UUID, OpenApiParameter.QUERY, description="Only include canonical programs with an active offering for this intake."),
            OpenApiParameter("institution", OpenApiTypes.UUID, OpenApiParameter.QUERY, description="White-label school context; only include this school's offerings."),
            OpenApiParameter("page", OpenApiTypes.INT, OpenApiParameter.QUERY, description="Page number."),
            OpenApiParameter("pageSize", OpenApiTypes.INT, OpenApiParameter.QUERY, description="Page size."),
        ],
        responses={200: OpenApiResponse(response=CanonicalProgramListResponseSerializer)},
    ),
)
class CanonicalProgramListView(APIView):
    """GET /api/v1/catalog/canonical-programs/ — program-first offering listing.

    Lists active **Institution_Program_Offering** rows (``Program`` with
    ``offering_status == "active"``) grouped by **Canonical_Program** (R8.6,
    R8.7). The portal scope is decided by :class:`OfferingDirectoryService`:

    * **Shared Beanola portal (R8.6)** — no resolved tenant and no ``institution``
      query param: every active offering across all tenants, grouped by canonical
      program.
    * **Tenant portal (R8.7)** — a white-label host resolved by
      :class:`InstitutionContextService` (or an explicit ``institution`` param):
      only that resolved tenant's offerings.

    This is a read-only public listing; it never mutates offerings and is not a
    canonical-program assignment surface (assignment is Super_Admin-only, R8.8).
    """

    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTCookieAuthentication]
    serializer_class = CanonicalProgramSerializer

    def get(self, request):
        intake_id = request.query_params.get("intake")
        portal_context = _resolve_request_context(request)
        directory = OfferingDirectoryService()
        # Tenant portal (R8.7) when a tenant resolves from the host or an explicit
        # ``institution`` param is supplied; shared Beanola portal (R8.6) otherwise.
        institution_id = directory.resolved_institution_id(
            portal_context, request.query_params.get("institution")
        )

        # Catalog read cache (R4.1, R4.2, R4.5–R4.7): the canonical-program
        # offering listing is computed under a tenant-scoped key and reused
        # within its TTL. The resolved ``institution_id`` (host- or param-driven)
        # is carried in the sub-key so a white-label tenant and the shared portal
        # never share an entry, on top of the scope-signature guard.
        def compute():
            queryset = directory.canonical_program_directory(
                institution_id=institution_id, intake_id=intake_id
            )

            # Offerings prefetch fix (R4.4): resolve each canonical program's
            # ``available_offerings`` from a single view-level prefetch instead of
            # a per-object query in
            # ``CanonicalProgramSerializer.get_available_offerings`` (an N+1 across
            # the page). The offering queryset mirrors the serializer's historical
            # filter (active offerings ordered by ``assignment_priority``,
            # ``name``), narrowed by the resolved tenant when present so a
            # white-label host nests only its own offerings. Intake matching is
            # carried as a nested prefetch and applied in Python by the serializer
            # so the offering rows stay deduplicated without a ``distinct()`` join.
            offering_qs = (
                Program.objects.select_related("institution")
                .filter(is_active=True, offering_status="active")
                .order_by("assignment_priority", "name")
            )
            if institution_id:
                offering_qs = offering_qs.filter(institution_id=institution_id)
            if intake_id:
                offering_qs = offering_qs.prefetch_related(
                    Prefetch(
                        "programintake_set",
                        queryset=ProgramIntake.objects.filter(intake_id=intake_id),
                        to_attr="_intake_matches",
                    )
                )
            inner_queryset = queryset.prefetch_related(
                Prefetch("program_set", queryset=offering_qs, to_attr="prefetched_offerings")
            )

            paginator = StandardPagination()
            page = paginator.paginate_queryset(inner_queryset, request)
            # Tenant-isolation fix (R8.7 / R18.3): propagate the host-resolved
            # tenant scope into the serializer so nested ``available_offerings``
            # are scoped to the same tenant the list queryset was scoped to.
            # Without this a white-label host (resolved from ``X-Forwarded-Host``
            # with no explicit ``?institution=`` param) would still surface other
            # tenants' offerings for a shared canonical program. ``None`` on the
            # shared Beanola portal keeps listing all offerings (R8.6).
            context = {"request": request, "institution_id": institution_id}
            if page is not None:
                serializer = CanonicalProgramSerializer(page, many=True, context=context)
                return paginator.get_paginated_response(serializer.data).data
            serializer = CanonicalProgramSerializer(inner_queryset, many=True, context=context)
            return {"success": True, "data": serializer.data}

        sub_key = (
            f"canonical|institution={institution_id or ''}"
            f"|intake={intake_id or ''}"
            f"|page={request.query_params.get('page') or ''}"
            f"|pageSize={request.query_params.get('pageSize') or ''}"
        )
        body = _cached_catalog_payload(request, sub_key, compute)
        response = Response(body)
        return _set_public_cache(response)


@extend_schema_view(
    get=extend_schema(
        operation_id="catalog_assignment_preview",
        tags=["catalog"],
        auth=[],
        parameters=[
            OpenApiParameter("program_id", OpenApiTypes.UUID, OpenApiParameter.QUERY, required=True, description="Canonical program UUID the student chose."),
            OpenApiParameter("intake_id", OpenApiTypes.UUID, OpenApiParameter.QUERY, required=True, description="Intake UUID the student chose."),
            OpenApiParameter("nationality", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Student nationality, used for residency-based fee + rule evaluation."),
            OpenApiParameter("country", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Student residence country, used for residency-based fee + rule evaluation."),
            OpenApiParameter("institution", OpenApiTypes.UUID, OpenApiParameter.QUERY, required=False, description="White-label school context; restricts candidate offerings to this institution."),
        ],
        responses={
            200: OpenApiResponse(response=OpenApiTypes.OBJECT),
            400: OpenApiResponse(response=ErrorResponseSerializer, description="Missing program_id/intake_id (VALIDATION_ERROR)."),
            409: OpenApiResponse(response=ErrorResponseSerializer, description="No eligible offering (NO_ELIGIBLE_OFFERING) — recoverable, carries user-facing guidance."),
        },
    ),
)
class AssignmentPreviewView(APIView):
    """GET /api/v1/catalog/assignment-preview/ - resolve the assigned school.

    Program-first wizard (R10.2): given a canonical ``program_id`` + ``intake_id``
    (plus optional residency inputs and white-label ``institution`` context),
    re-run the canonical :class:`OfferingAssignmentService` and return the
    assigned school, resolved fee, required documents, and school contact so the
    student can review them *before* payment. This is a read-only preview that
    creates no application row; the authoritative assignment still runs at
    application create/submit. It mirrors the assignment surfaced in the
    application-create response so the wizard's assigned-school checkpoint
    matches the eventual create result for the same inputs.
    """

    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTCookieAuthentication]

    def get(self, request):
        program_id = request.query_params.get("program_id")
        intake_id = request.query_params.get("intake_id")
        if not program_id or not intake_id:
            return Response(
                {
                    "success": False,
                    "error": "program_id and intake_id query parameters are required.",
                    "code": "VALIDATION_ERROR",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        nationality = request.query_params.get("nationality")
        country = request.query_params.get("country")

        # White-label context restricts candidate offerings to the host school.
        portal_context = _resolve_request_context(request)
        institution_id = request.query_params.get("institution")
        if not institution_id and portal_context.institution is not None:
            institution_id = str(portal_context.institution.id)

        from apps.catalog.services import (
            OfferingAssignmentError,
            OfferingAssignmentService,
        )

        # Recoverable NO_ELIGIBLE_OFFERING envelope (R15.5): a 409 with stable
        # code + user-facing guidance so the program-first wizard presents a
        # next step (choose another intake / interest list / contact admissions)
        # rather than dead-ending. The 409 mirrors the canonical ERROR_CODES
        # registry entry for NO_ELIGIBLE_OFFERING.
        _no_offering_guidance = (
            "No school offering is available for this program and intake. "
            "Choose another intake, join the interest list, or contact admissions."
        )

        # Catalog read cache (R4.1, R4.2, R4.5–R4.7): only the successful
        # assignment-preview body is cached. The assignment computation runs
        # inside ``compute`` so any ``OfferingAssignmentError`` / missing-record
        # path propagates out and is rendered as the existing recoverable error
        # envelope *without* being cached (``cached_or_compute`` stores only after
        # ``compute`` returns). Inputs that vary the result (program/intake/
        # residency/institution) are carried in the sub-key.
        def compute():
            assigned = OfferingAssignmentService().assign(
                program_id=str(program_id),
                intake_id=str(intake_id),
                country=country,
                nationality=nationality,
                institution_id=institution_id,
            )

            institution = assigned.institution
            offering = assigned.offering

            fee_data = None
            try:
                from apps.documents.fee_resolver import FeeResolver

                resolved_fee = FeeResolver().resolve_fee(
                    program_code=offering.code,
                    nationality=nationality,
                    country=country,
                )
                fee_data = {
                    "amount": str(resolved_fee.amount),
                    "currency": resolved_fee.currency,
                    "residency_category": resolved_fee.residency_category,
                    "source": resolved_fee.source,
                }
            except Exception:
                logger.exception("Fee resolution failed during assignment preview for offering %s", offering.code)

            contact = {
                "email": institution.admissions_email or institution.support_email or institution.email,
                "phone": institution.phone,
                "website": institution.website,
            }

            return {
                "success": True,
                "data": {
                    "program_id": str(assigned.canonical_program.id),
                    "intake_id": str(assigned.intake.id),
                    "program_offering_id": str(offering.id),
                    "institution_id": str(institution.id),
                    "assigned_school": {
                        "id": str(institution.id),
                        "name": institution.brand_name or institution.name,
                        "full_name": institution.full_name or institution.name,
                        "code": institution.code,
                    },
                    "program_name": assigned.canonical_program.name,
                    "intake_name": assigned.intake.name,
                    "fee": fee_data,
                    "required_documents": assigned.required_documents,
                    "contact": contact,
                },
            }

        sub_key = (
            f"assignment|program={program_id}|intake={intake_id}"
            f"|nationality={nationality or ''}|country={country or ''}"
            f"|institution={institution_id or ''}"
        )

        try:
            body = _cached_catalog_payload(request, sub_key, compute)
        except OfferingAssignmentError as exc:
            return Response(
                {
                    "success": False,
                    "error": str(exc),
                    "code": getattr(exc, "code", "NO_ELIGIBLE_OFFERING"),
                    "guidance": _no_offering_guidance,
                },
                status=status.HTTP_409_CONFLICT,
            )
        except (CanonicalProgram.DoesNotExist, Intake.DoesNotExist):
            return Response(
                {
                    "success": False,
                    "error": "The selected program or intake is no longer available.",
                    "code": "NO_ELIGIBLE_OFFERING",
                    "guidance": _no_offering_guidance,
                },
                status=status.HTTP_409_CONFLICT,
            )
        except Exception:
            logger.exception("Assignment preview failed for program %s intake %s", program_id, intake_id)
            return Response(
                {
                    "success": False,
                    "error": "Unable to resolve the assigned school.",
                    "code": "NO_ELIGIBLE_OFFERING",
                    "guidance": _no_offering_guidance,
                },
                status=status.HTTP_409_CONFLICT,
            )

        response = Response(body)
        return _set_public_cache(response)


@extend_schema_view(
    get=extend_schema(
        operation_id="catalog_programs_retrieve",
        tags=["catalog"],
        parameters=[
            OpenApiParameter("program_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Program UUID."),
        ],
        responses={
            200: OpenApiResponse(response=ProgramResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    patch=extend_schema(
        operation_id="catalog_programs_update",
        tags=["catalog"],
        parameters=[
            OpenApiParameter("program_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Program UUID."),
        ],
        request=ProgramCreateUpdateSerializer,
        responses={
            200: OpenApiResponse(response=ProgramResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    delete=extend_schema(
        operation_id="catalog_programs_deactivate",
        tags=["catalog"],
        parameters=[
            OpenApiParameter("program_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Program UUID."),
        ],
        request=None,
        responses={
            200: OpenApiResponse(response=CatalogMessageResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class ProgramDetailView(TenantScopedCapabilityMixin, APIView):
    """GET/PATCH/DELETE /api/v1/catalog/programs/{id}/"""

    permission_classes = [IsAdmin]
    serializer_class = ProgramSerializer

    # Scope-before-lookup config (R3.5, R5.4): a Program is scoped through its
    # owning institution, so an out-of-scope program id surfaces a 404.
    scoped_model = Program
    scope_institution_field = "institution_id"
    lookup_field = "id"
    lookup_url_kwarg = "program_id"

    def get_permissions(self):
        # GET remains admin-only, but the object lookup is tenant-scoped below.
        if _request_method(self) == "GET":
            return [IsAdmin()]
        # PATCH/DELETE: capability evaluated per-object via ``can_manage_program``.
        return [IsAuthenticated()]

    def get(self, request, program_id):
        try:
            program = self.get_scoped_object(
                lookup_value=program_id,
                queryset=Program.objects.select_related("institution").all(),
            )
        except NotFound:
            return Response(
                {"success": False, "error": "Program not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = ProgramSerializer(program)
        return Response({"success": True, "data": serializer.data})

    def patch(self, request, program_id):
        # R3.5 / R5.4: scope before lookup — out-of-scope ids return a
        # non-revealing 404 and never confirm the program exists.
        try:
            program = self.get_scoped_object(lookup_value=program_id)
        except NotFound:
            return Response(
                {"success": False, "error": "Program not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        service = AdminCapabilityService()
        # R5.2: require the manage capability for the program's own institution.
        if not service.can_manage_program(request.user, program):
            return _forbidden_response()
        # R5.4: a submitted institution_id that moves the program to an
        # out-of-scope institution is rejected without mutation.
        submitted_institution_id = request.data.get("institution_id")
        if submitted_institution_id is not None and str(submitted_institution_id) != str(
            getattr(program, "institution_id", "")
        ):
            target = SimpleNamespace(institution_id=submitted_institution_id)
            if not service.can_manage_program(request.user, target):
                return _forbidden_response()

        serializer = ProgramCreateUpdateSerializer(program, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "error": "Validation failed",
                    "code": "VALIDATION_ERROR",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        old_institution_id = program.institution_id
        for attr, value in serializer.validated_data.items():
            setattr(program, attr, value)
        program.save()
        # R4.3: invalidate catalog reads for the program's owning tenant(s) +
        # shared portal before returning. Pass both the prior and the new
        # institution so a write that moves the offering between tenants clears
        # both white-label portals.
        invalidate_catalog_scopes(
            old_institution_id, program.institution_id, user=request.user
        )
        out = ProgramSerializer(program)
        return Response({"success": True, "data": out.data})

    def delete(self, request, program_id):
        try:
            program = self.get_scoped_object(lookup_value=program_id)
        except NotFound:
            return Response(
                {"success": False, "error": "Program not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not AdminCapabilityService().can_manage_program(request.user, program):
            return _forbidden_response()
        program.is_active = False
        program.save(update_fields=["is_active"])
        # R4.3: deactivating an offering changes the programs / canonical
        # offerings listings for its tenant and the shared portal.
        invalidate_catalog_scopes(program.institution_id, user=request.user)
        return Response({"success": True, "data": {"message": "Program deactivated"}})


@extend_schema_view(
    get=extend_schema(
        operation_id="catalog_intakes_list",
        tags=["catalog"],
        auth=[],
        responses={200: OpenApiResponse(response=IntakeListResponseSerializer)},
    ),
    post=extend_schema(
        operation_id="catalog_intakes_create",
        tags=["catalog"],
        request=IntakeSerializer,
        responses={
            201: OpenApiResponse(response=IntakeResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class IntakeListCreateView(APIView):
    """GET /api/v1/catalog/intakes/ - list intakes
    POST /api/v1/catalog/intakes/ - create intake (admin)
    """

    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTCookieAuthentication]
    serializer_class = IntakeSerializer

    def get_permissions(self):
        if _request_method(self) == "POST":
            # Intakes are global (R5.3): every write requires platform.intake.manage.
            self.required_capability = _INTAKE_WRITE_CAPABILITY
            return [HasPlatformCapability()]
        return [AllowAny()]

    def get_authenticators(self):
        method = _request_method(self)
        from apps.accounts.authentication import JWTCookieAuthentication, OptionalJWTCookieAuthentication
        if method == "POST":
            return [JWTCookieAuthentication()]
        return [OptionalJWTCookieAuthentication()]

    def get(self, request):
        # Catalog read cache (R4.1, R4.2, R4.5–R4.7): the intake listing body is
        # computed under a tenant-scoped key and reused within its TTL. Admin and
        # ``include_closed`` variations are carried in the sub-key so they never
        # collide.
        def compute():
            if _is_admin(request):
                queryset = Intake.objects.all()
            else:
                from datetime import date
                today = date.today()
                queryset = Intake.objects.filter(is_active=True)
                # Only show intakes that are currently accepting applications
                # (application_start_date <= today <= application_deadline)
                # Allow null dates to pass through (no restriction)
                queryset = queryset.exclude(
                    application_deadline__lt=today,
                ).exclude(
                    application_start_date__gt=today,
                )

            # Support ?include_closed=true for admin/wizard to see all intakes
            if request.query_params.get("include_closed") == "true" and _is_admin(request):
                queryset = Intake.objects.all()

            queryset = queryset.order_by("-year", "name")
            serializer = IntakeSerializer(queryset, many=True)
            return {"success": True, "data": serializer.data}

        sub_key = (
            f"intakes|admin={int(_is_admin(request))}"
            f"|include_closed={request.query_params.get('include_closed') or ''}"
        )
        body = _cached_catalog_payload(request, sub_key, compute)
        response = Response(body)

        if not _is_admin(request):
            _set_public_cache(response)
        return response

    def post(self, request):
        serializer = IntakeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "error": "Validation failed",
                    "code": "VALIDATION_ERROR",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        intake = Intake.objects.create(**serializer.validated_data)
        # R4.3: intakes are global — invalidate the shared portal (and the
        # actor's scope); intake-filtered canonical offerings derive from them.
        invalidate_catalog_scopes(user=request.user)
        out = IntakeSerializer(intake)
        return Response({"success": True, "data": out.data}, status=status.HTTP_201_CREATED)


@extend_schema_view(
    get=extend_schema(
        operation_id="catalog_intakes_retrieve",
        tags=["catalog"],
        parameters=[
            OpenApiParameter("intake_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Intake UUID."),
        ],
        responses={
            200: OpenApiResponse(response=IntakeResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    patch=extend_schema(
        operation_id="catalog_intakes_update",
        tags=["catalog"],
        parameters=[
            OpenApiParameter("intake_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Intake UUID."),
        ],
        request=IntakeSerializer,
        responses={
            200: OpenApiResponse(response=IntakeResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    delete=extend_schema(
        operation_id="catalog_intakes_deactivate",
        tags=["catalog"],
        parameters=[
            OpenApiParameter("intake_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Intake UUID."),
        ],
        request=None,
        responses={
            200: OpenApiResponse(response=CatalogMessageResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class IntakeDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/catalog/intakes/{id}/"""

    permission_classes = [IsAdmin]
    serializer_class = IntakeSerializer

    def get_permissions(self):
        # GET behavior is unchanged (admin-only); only writes change (R5.5).
        if _request_method(self) == "GET":
            return [IsAdmin()]
        # PATCH/DELETE: intakes are global → require platform.intake.manage (R5.3).
        self.required_capability = _INTAKE_WRITE_CAPABILITY
        return [HasPlatformCapability()]

    def get(self, request, intake_id):
        try:
            intake = Intake.objects.get(id=intake_id)
        except Intake.DoesNotExist:
            return Response(
                {"success": False, "error": "Intake not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = IntakeSerializer(intake)
        return Response({"success": True, "data": serializer.data})

    def patch(self, request, intake_id):
        try:
            intake = Intake.objects.get(id=intake_id)
        except Intake.DoesNotExist:
            return Response(
                {"success": False, "error": "Intake not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = IntakeSerializer(intake, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "error": "Validation failed",
                    "code": "VALIDATION_ERROR",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        for attr, value in serializer.validated_data.items():
            setattr(intake, attr, value)
        intake.save()
        # R4.3: global intake change — invalidate shared portal + actor scope.
        invalidate_catalog_scopes(user=request.user)
        return Response({"success": True, "data": IntakeSerializer(intake).data})

    def delete(self, request, intake_id):
        try:
            intake = Intake.objects.get(id=intake_id)
        except Intake.DoesNotExist:
            return Response(
                {"success": False, "error": "Intake not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        intake.is_active = False
        intake.save(update_fields=["is_active"])
        # R4.3: global intake deactivation — invalidate shared portal + actor.
        invalidate_catalog_scopes(user=request.user)
        return Response({"success": True, "data": {"message": "Intake deactivated"}})


@extend_schema_view(
    get=extend_schema(
        operation_id="catalog_subjects_list",
        tags=["catalog"],
        auth=[],
        responses={200: OpenApiResponse(response=SubjectListResponseSerializer)},
    )
)
class SubjectListView(APIView):
    """GET /api/v1/catalog/subjects/ - list subjects (public)"""

    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTCookieAuthentication]
    serializer_class = SubjectSerializer

    def get(self, request):
        # Catalog read cache (R4.1, R4.2, R4.5–R4.7): subjects are global catalog
        # data; the body is computed under the scoped key and reused within TTL.
        def compute():
            queryset = Subject.objects.all().order_by("name")
            serializer = SubjectSerializer(queryset, many=True)
            return {"success": True, "data": serializer.data}

        body = _cached_catalog_payload(request, "subjects", compute)
        response = Response(body)
        _set_public_cache(response)
        return response


@extend_schema_view(
    get=extend_schema(
        operation_id="catalog_institutions_list",
        tags=["catalog"],
        auth=[],
        responses={200: OpenApiResponse(response=InstitutionListResponseSerializer)},
    ),
    post=extend_schema(
        operation_id="catalog_institutions_create",
        tags=["catalog"],
        request=InstitutionSerializer,
        responses={
            201: OpenApiResponse(response=InstitutionResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class InstitutionListCreateView(APIView):
    """GET /api/v1/catalog/institutions/ - list institutions
    POST /api/v1/catalog/institutions/ - create institution (admin)
    """

    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTCookieAuthentication]
    serializer_class = InstitutionSerializer

    def get_permissions(self):
        if _request_method(self) == "POST":
            # R5.1: creating a tenant requires platform.tenant.create.
            self.required_capability = "platform.tenant.create"
            return [HasPlatformCapability()]
        return [AllowAny()]

    def get_authenticators(self):
        method = _request_method(self)
        from apps.accounts.authentication import JWTCookieAuthentication, OptionalJWTCookieAuthentication
        if method == "POST":
            return [JWTCookieAuthentication()]
        return [OptionalJWTCookieAuthentication()]

    def get(self, request):
        if _is_admin(request):
            queryset = Institution.objects.all()
        else:
            queryset = Institution.objects.filter(is_active=True)
        queryset = _scope_institution_queryset_for_request(queryset, request)

        queryset = queryset.order_by("name")
        serializer = InstitutionSerializer(queryset, many=True)
        response = Response({"success": True, "data": serializer.data})

        if not _is_admin(request):
            _set_public_cache(response)
        return response

    def post(self, request):
        serializer = InstitutionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "error": "Validation failed",
                    "code": "VALIDATION_ERROR",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        institution = Institution.objects.create(**serializer.validated_data)
        # R4.3: a new tenant changes the shared portal listing; invalidate the
        # neutral scope + the new tenant's scope before returning.
        invalidate_catalog_scopes(institution.id, user=request.user)
        out = InstitutionSerializer(institution)
        return Response({"success": True, "data": out.data}, status=status.HTTP_201_CREATED)


@extend_schema_view(
    get=extend_schema(
        operation_id="catalog_institutions_retrieve",
        tags=["catalog"],
        parameters=[
            OpenApiParameter("institution_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Institution UUID."),
        ],
        responses={
            200: OpenApiResponse(response=InstitutionResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    patch=extend_schema(
        operation_id="catalog_institutions_update",
        tags=["catalog"],
        parameters=[
            OpenApiParameter("institution_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Institution UUID."),
        ],
        request=InstitutionSerializer,
        responses={
            200: OpenApiResponse(response=InstitutionResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    delete=extend_schema(
        operation_id="catalog_institutions_deactivate",
        tags=["catalog"],
        parameters=[
            OpenApiParameter("institution_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Institution UUID."),
        ],
        request=None,
        responses={
            200: OpenApiResponse(response=CatalogMessageResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            409: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class InstitutionDetailView(TenantScopedCapabilityMixin, APIView):
    """GET/PATCH/DELETE /api/v1/catalog/institutions/{id}/"""

    permission_classes = [IsAdmin]
    serializer_class = InstitutionSerializer

    # Scope-before-lookup config (R3.5, R5.4): the target row is itself an
    # Institution, scoped on its own pk; an out-of-scope id surfaces a 404.
    scoped_model = Institution
    scope_institution_field = None
    lookup_field = "id"
    lookup_url_kwarg = "institution_id"

    def get_permissions(self):
        method = _request_method(self)
        # GET remains admin-only, but the object lookup is tenant-scoped below.
        if method == "GET":
            return [IsAdmin()]
        # R5.1: create/update/deactivate require the matching platform capability.
        self.required_capability = _INSTITUTION_WRITE_CAPABILITIES.get(method)
        return [HasPlatformCapability()]

    def get(self, request, institution_id):
        try:
            institution = self.get_scoped_object(lookup_value=institution_id)
        except NotFound:
            return Response(
                {"success": False, "error": "Institution not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = InstitutionSerializer(institution)
        return Response({"success": True, "data": serializer.data})

    def patch(self, request, institution_id):
        # R3.5 / R5.4: scope before lookup — out-of-scope ids return a
        # non-revealing 404 and never confirm the institution exists.
        try:
            institution = self.get_scoped_object(lookup_value=institution_id)
        except NotFound:
            return Response(
                {"success": False, "error": "Institution not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = InstitutionSerializer(institution, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "error": "Validation failed",
                    "code": "VALIDATION_ERROR",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        for attr, value in serializer.validated_data.items():
            setattr(institution, attr, value)
        institution.save()
        # R4.3: institution branding/contact flows into cached offerings +
        # assignment preview; invalidate this tenant + the shared portal.
        invalidate_catalog_scopes(institution.id, user=request.user)
        out = InstitutionSerializer(institution)
        return Response({"success": True, "data": out.data})

    def delete(self, request, institution_id):
        """Soft-delete: reject if institution has active programs (409)."""
        # R3.5 / R5.4: scope before lookup — out-of-scope ids return 404.
        try:
            institution = self.get_scoped_object(lookup_value=institution_id)
        except NotFound:
            return Response(
                {"success": False, "error": "Institution not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check for active programs
        active_programs = Program.objects.filter(
            institution_id=institution_id, is_active=True
        ).exists()
        if active_programs:
            return Response(
                {
                    "success": False,
                    "error": "Cannot deactivate institution with active programs",
                    "code": "CONFLICT",
                },
                status=status.HTTP_409_CONFLICT,
            )

        institution.is_active = False
        institution.save(update_fields=["is_active"])
        # R4.3: deactivating a tenant removes it from the shared portal listing.
        invalidate_catalog_scopes(institution.id, user=request.user)
        return Response({"success": True, "data": {"message": "Institution deactivated"}})
