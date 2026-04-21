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
from apps.catalog.models import Institution, Intake, Program, Subject
from apps.catalog.serializers import (
    InstitutionSerializer,
    IntakeSerializer,
    ProgramCreateUpdateSerializer,
    ProgramSerializer,
    SubjectSerializer,
)
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
    """GET /api/v1/catalog/programs/ — list programs (public + admin)
    POST /api/v1/catalog/programs/ — create program (admin only)
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
                # Not a UUID — try to resolve by name
                intake_obj = Intake.objects.filter(name=intake_id, is_active=True).first()
                if intake_obj:
                    resolved_intake_id = str(intake_obj.id)

            if resolved_intake_id:
                program_ids = ProgramIntake.objects.filter(
                    intake_id=resolved_intake_id
                ).values_list("program_id", flat=True)
                queryset = queryset.filter(id__in=program_ids)
            else:
                # No matching intake found — return empty set
                queryset = queryset.none()

        queryset = queryset.order_by("name")

        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        if page is not None:
            serializer = ProgramSerializer(page, many=True)
            response = paginator.get_paginated_response(serializer.data)
        else:
            serializer = ProgramSerializer(queryset, many=True)
            response = Response(serializer.data)

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
        return Response(out.data, status=status.HTTP_201_CREATED)


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
        return Response(serializer.data)

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
        return Response(out.data)

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
        return Response({"message": "Program deactivated"})


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
    """GET /api/v1/catalog/intakes/ — list intakes
    POST /api/v1/catalog/intakes/ — create intake (admin)
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
        response = Response(serializer.data)

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
        return Response(out.data, status=status.HTTP_201_CREATED)


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
        return Response(serializer.data)

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
        return Response(IntakeSerializer(intake).data)

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
        return Response({"message": "Intake deactivated"})


@extend_schema_view(
    get=extend_schema(
        operation_id="catalog_subjects_list",
        tags=["catalog"],
        auth=[],
        responses={200: OpenApiResponse(response=SubjectListResponseSerializer)},
    )
)
class SubjectListView(APIView):
    """GET /api/v1/catalog/subjects/ — list subjects (public)"""

    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTCookieAuthentication]
    serializer_class = SubjectSerializer

    def get(self, request):
        queryset = Subject.objects.all().order_by("name")
        serializer = SubjectSerializer(queryset, many=True)
        response = Response(serializer.data)
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
    """GET /api/v1/catalog/institutions/ — list institutions
    POST /api/v1/catalog/institutions/ — create institution (admin)
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
        response = Response(serializer.data)

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
        return Response(out.data, status=status.HTTP_201_CREATED)


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
        return Response(serializer.data)

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
        return Response(out.data)

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
        return Response({"message": "Institution deactivated"})
