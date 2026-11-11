"""Program / offering catalog views.

``/api/v1/catalog/programs/``, ``/canonical-programs/`` and
``/assignment-preview/`` — the program-first student surface plus the frozen
legacy offering write path. Split out of ``views.py`` by task 12.1; every view is
the one that was there, lifted verbatim.
"""

from __future__ import annotations

import logging
from types import SimpleNamespace

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
from apps.catalog._catalog_view_helpers import (
    CanonicalProgramListResponseSerializer,
    CatalogMessageResponseSerializer,
    ProgramListResponseSerializer,
    ProgramResponseSerializer,
    _ASSIGNMENT_PREVIEW_SELECTOR_ENDPOINT,
    _CANONICAL_PROGRAM_SELECTOR_ENDPOINT,
    _INTAKE_FILTER_UNRESOLVED,
    _cached_catalog_payload,
    _forbidden_response,
    _is_admin,
    _request_host,
    _request_method,
    _resolve_intake_filter,
    _resolve_request_context,
    _scope_program_queryset_for_request,
    _set_public_cache,
)
from apps.catalog.catalog_cache import invalidate_catalog_scopes
from apps.catalog.legacy_write_telemetry import (
    canonical_program_required_response,
    mark_deprecated,
    record_catalog_write,
)
from apps.catalog.models import CanonicalProgram, Intake, Program, ProgramIntake
from apps.catalog.permissions import TenantScopedCapabilityMixin
from apps.catalog.serializers import (
    CanonicalProgramSerializer,
    ProgramCreateUpdateSerializer,
    ProgramSerializer,
)
from apps.catalog.services import AdminCapabilityService, OfferingDirectoryService
from apps.common.openapi_helpers import ErrorResponseSerializer
from apps.common.pagination import StandardPagination

logger = logging.getLogger(__name__)

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

            # Filter by intake if provided (uses program_intakes junction table).
            # Accepts either an intake UUID or an intake name string, through the
            # one resolver the canonical-program listing also uses.
            resolved_intake_id = _resolve_intake_filter(
                request.query_params.get("intake")
            )
            if resolved_intake_id is not None:
                from apps.catalog.models import ProgramIntake

                if resolved_intake_id is not _INTAKE_FILTER_UNRESOLVED:
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

        # R7.1 freeze (TEN-03 / DATA-01): a ``Program`` row is an
        # Institution_Program_Offering and MUST reference a Canonical_Program.
        # The legacy display-string write (a bare program created from a typed
        # name with no canonical link) is rejected with a stable code so the
        # only offering-create path is Canonical_Program -> Program_Offering. The
        # canonical write (task 4.3 ``createOffering``) already supplies it.
        canonical_program_id = request.data.get("canonical_program_id")
        if not canonical_program_id:
            record_catalog_write(
                request, resource="program", method="POST", legacy=True, outcome="rejected"
            )
            return canonical_program_required_response(method="POST")

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
        # R14.7 usage telemetry: this is the canonical offering-create write
        # (carries ``canonical_program_id``), measured so the migration can be
        # proven by the legacy counter trending to zero first-party callers.
        record_catalog_write(request, resource="program", method="POST", legacy=False)
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
        # ``?intake=`` accepts a UUID or an intake name (the wizard hydrates a
        # resumed draft from the legacy display snapshot). Resolving it here is
        # what keeps a malformed value a 200-with-no-matches instead of an
        # unhandled UUID ``ValidationError`` bubbling out as a 500.
        raw_intake = request.query_params.get("intake")
        resolved_intake = _resolve_intake_filter(raw_intake)
        intake_unresolved = resolved_intake is _INTAKE_FILTER_UNRESOLVED
        intake_id = None if intake_unresolved else resolved_intake
        portal_context = _resolve_request_context(request)
        directory = OfferingDirectoryService()
        # A trusted tenant host is authoritative. The query selector is accepted
        # only for the registered neutral shared portal on this allowlisted
        # endpoint; unknown hosts stay neutral.
        institution_id = directory.resolved_institution_id(
            portal_context,
            request.query_params.get("institution"),
            request_host=_request_host(request),
            endpoint=_CANONICAL_PROGRAM_SELECTOR_ENDPOINT,
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
            if intake_unresolved:
                # An intake was named and matched nothing. Narrow to empty rather
                # than silently listing every offering (which would answer a
                # different question than the one asked).
                queryset = queryset.none()

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

        # The sub-key carries the *resolved* intake, plus an explicit marker when
        # a named intake resolved to nothing — otherwise "no intake requested"
        # (list everything) and "an intake that does not exist" (list nothing)
        # would share one cache entry and answer each other's question.
        intake_key = "unresolved" if intake_unresolved else (intake_id or "")
        sub_key = (
            f"canonical|institution={institution_id or ''}"
            f"|intake={intake_key}"
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

        # Use the same central policy as canonical-program listing: trusted
        # tenant context wins, while explicit selection is limited to a
        # registered neutral shared portal on this allowlisted endpoint.
        portal_context = _resolve_request_context(request)
        institution_id = OfferingDirectoryService().resolved_institution_id(
            portal_context,
            request.query_params.get("institution"),
            request_host=_request_host(request),
            endpoint=_ASSIGNMENT_PREVIEW_SELECTOR_ENDPOINT,
        )

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
            fee_blocker = None
            try:
                from apps.documents.fee_resolver import (
                    FeeConfigurationError,
                    FeeResolver,
                )

                # Resolve from the already-assigned canonical offering object
                # (task 5.4): offering-keyed, tenant-scoped, and fail-closed —
                # no code re-lookup, no default amount.
                resolved_fee = FeeResolver().resolve_for_offering(
                    offering,
                    nationality,
                    country,
                )
                from apps.documents.fee_quote_service import fee_preview_payload

                fee_data = fee_preview_payload(resolved_fee)
            except FeeConfigurationError as exc:
                # Task 5.4 (R7.5, design §6.2): the offering has no unique active
                # fee for this residency path. Fail closed AND name the readiness
                # blocker so onboarding/operators see exactly what to configure —
                # never substitute a default amount. ``fee`` stays null.
                fee_blocker = {
                    "code": exc.code,
                    "message": exc.message,
                    "residency_category": FeeResolver._classify_residency(
                        nationality, country
                    ),
                }
                logger.info(
                    "Assignment preview fee blocker for offering %s: %s",
                    offering.code,
                    exc.code,
                )
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
                    "fee_blocker": fee_blocker,
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
        # R14.7: this legacy offering-update route is frozen. The canonical
        # successor is PATCH /admin/institutions/{id}/programs/{id}/. Measure
        # residual callers and signal deprecation to any that remain.
        record_catalog_write(request, resource="program", method="PATCH", legacy=True)
        out = ProgramSerializer(program)
        response = Response({"success": True, "data": out.data})
        return mark_deprecated(
            response,
            resource="program",
            successor=f"/api/v1/admin/institutions/{program.institution_id}/programs/{program.id}/",
        )

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
        # R14.7: frozen legacy route; canonical successor is a PATCH
        # is_active=false on /admin/institutions/{id}/programs/{id}/.
        record_catalog_write(request, resource="program", method="DELETE", legacy=True)
        response = Response({"success": True, "data": {"message": "Program deactivated"}})
        return mark_deprecated(
            response,
            resource="program",
            successor=f"/api/v1/admin/institutions/{program.institution_id}/programs/{program.id}/",
        )
