"""Catalog views.

Implements task 14.2.
Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
"""

import logging

from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
    extend_schema_view,
)
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authentication import OptionalJWTCookieAuthentication
from apps.accounts.permissions import IsAdmin
from apps.catalog.models import CanonicalProgram, Institution, Intake, Program, Subject
from apps.catalog.serializers import (
    CanonicalProgramSerializer,
    InstitutionSerializer,
    IntakeSerializer,
    ProgramCreateUpdateSerializer,
    ProgramSerializer,
    SubjectSerializer,
)
from apps.catalog.services import InstitutionContextService
from apps.common.openapi_helpers import (
    ErrorResponseSerializer,
    MessageSerializer,
    envelope_serializer,
    paginated_serializer,
)
from apps.common.pagination import StandardPagination

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


def _set_public_cache(response):
    """Set Cache-Control: public, max-age=300 for public responses."""
    response["Cache-Control"] = "public, max-age=300"
    return response


def _resolve_request_context(request):
    host = request.headers.get("X-Forwarded-Host") or request.get_host()
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
    POST /api/v1/catalog/programs/ - create program (admin only)
    """

    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTCookieAuthentication]
    serializer_class = ProgramSerializer

    def get_permissions(self):
        if _request_method(self) == "POST":
            return [IsAdmin()]
        return [AllowAny()]

    def get_authenticators(self):
        method = _request_method(self)
        # For GET, try auth but don't require it
        from apps.accounts.authentication import JWTCookieAuthentication, OptionalJWTCookieAuthentication
        if method == "POST":
            return [JWTCookieAuthentication()]
        return [OptionalJWTCookieAuthentication()]

    def get(self, request):
        if _is_admin(request):
            queryset = Program.objects.select_related("institution").all()
        else:
            queryset = Program.objects.select_related("institution").filter(is_active=True)

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
            response = paginator.get_paginated_response(serializer.data)
        else:
            serializer = ProgramSerializer(queryset, many=True)
            response = Response({"success": True, "data": serializer.data})

        if not _is_admin(request):
            _set_public_cache(response)
        return response

    def post(self, request):
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
    """GET /api/v1/catalog/canonical-programs/ - shared program-first choices."""

    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTCookieAuthentication]
    serializer_class = CanonicalProgramSerializer

    def get(self, request):
        queryset = CanonicalProgram.objects.filter(is_active=True)
        intake_id = request.query_params.get("intake")
        portal_context = _resolve_request_context(request)
        institution_id = request.query_params.get("institution")
        if not institution_id and portal_context.institution is not None:
            institution_id = str(portal_context.institution.id)
        if intake_id:
            queryset = queryset.filter(program__programintake__intake_id=intake_id)
        if institution_id:
            queryset = queryset.filter(program__institution_id=institution_id)
        queryset = queryset.filter(program__is_active=True, program__offering_status="active").distinct().order_by("name")

        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        context = {"request": request}
        if page is not None:
            serializer = CanonicalProgramSerializer(page, many=True, context=context)
            response = paginator.get_paginated_response(serializer.data)
        else:
            serializer = CanonicalProgramSerializer(queryset, many=True, context=context)
            response = Response({"success": True, "data": serializer.data})
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
            400: OpenApiResponse(response=ErrorResponseSerializer),
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

        try:
            assigned = OfferingAssignmentService().assign(
                program_id=str(program_id),
                intake_id=str(intake_id),
                country=country,
                nationality=nationality,
                institution_id=institution_id,
            )
        except OfferingAssignmentError as exc:
            return Response(
                {"success": False, "error": str(exc), "code": getattr(exc, "code", "NO_ELIGIBLE_OFFERING")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except (CanonicalProgram.DoesNotExist, Intake.DoesNotExist):
            return Response(
                {"success": False, "error": "The selected program or intake is no longer available.", "code": "NO_ELIGIBLE_OFFERING"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            logger.exception("Assignment preview failed for program %s intake %s", program_id, intake_id)
            return Response(
                {"success": False, "error": "Unable to resolve the assigned school.", "code": "NO_ELIGIBLE_OFFERING"},
                status=status.HTTP_400_BAD_REQUEST,
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

        response = Response({
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
        })
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
class ProgramDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/catalog/programs/{id}/"""

    permission_classes = [IsAdmin]
    serializer_class = ProgramSerializer

    def get(self, request, program_id):
        try:
            program = Program.objects.select_related("institution").get(id=program_id)
        except Program.DoesNotExist:
            return Response(
                {"success": False, "error": "Program not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = ProgramSerializer(program)
        return Response({"success": True, "data": serializer.data})

    def patch(self, request, program_id):
        try:
            program = Program.objects.get(id=program_id)
        except Program.DoesNotExist:
            return Response(
                {"success": False, "error": "Program not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

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
        for attr, value in serializer.validated_data.items():
            setattr(program, attr, value)
        program.save()
        out = ProgramSerializer(program)
        return Response({"success": True, "data": out.data})

    def delete(self, request, program_id):
        try:
            program = Program.objects.get(id=program_id)
        except Program.DoesNotExist:
            return Response(
                {"success": False, "error": "Program not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        program.is_active = False
        program.save(update_fields=["is_active"])
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
            return [IsAdmin()]
        return [AllowAny()]

    def get_authenticators(self):
        method = _request_method(self)
        from apps.accounts.authentication import JWTCookieAuthentication, OptionalJWTCookieAuthentication
        if method == "POST":
            return [JWTCookieAuthentication()]
        return [OptionalJWTCookieAuthentication()]

    def get(self, request):
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
        response = Response({"success": True, "data": serializer.data})

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
        queryset = Subject.objects.all().order_by("name")
        serializer = SubjectSerializer(queryset, many=True)
        response = Response({"success": True, "data": serializer.data})
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
            return [IsAdmin()]
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
class InstitutionDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/catalog/institutions/{id}/"""

    permission_classes = [IsAdmin]
    serializer_class = InstitutionSerializer

    def get(self, request, institution_id):
        try:
            institution = Institution.objects.get(id=institution_id)
        except Institution.DoesNotExist:
            return Response(
                {"success": False, "error": "Institution not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = InstitutionSerializer(institution)
        return Response({"success": True, "data": serializer.data})

    def patch(self, request, institution_id):
        try:
            institution = Institution.objects.get(id=institution_id)
        except Institution.DoesNotExist:
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
        out = InstitutionSerializer(institution)
        return Response({"success": True, "data": out.data})

    def delete(self, request, institution_id):
        """Soft-delete: reject if institution has active programs (409)."""
        try:
            institution = Institution.objects.get(id=institution_id)
        except Institution.DoesNotExist:
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
        return Response({"success": True, "data": {"message": "Institution deactivated"}})
