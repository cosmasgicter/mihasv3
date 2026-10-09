"""Tenant (institution) and tenant-offering admin views.

``/api/v1/admin/institutions/…`` — the tenant record itself, its launch
readiness, and its program offerings. Split out of ``admin_views.py`` by task
12.1; every view is the one that was there, lifted verbatim.
"""

from __future__ import annotations

from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, OpenApiTypes, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.catalog.permissions import HasPlatformCapability
from apps.catalog._admin_view_helpers import (
    _InstitutionChildDetailView,
    _InstitutionChildListCreateView,
    _forbidden_write_response,
    _paginate,
    _readable_institution_queryset,
    _write_allowed,
)
from apps.catalog.admin_serializers import AdminInstitutionSerializer
from apps.catalog.canonical_config_commands import (
    apply_institution_profile_change,
    apply_program_offering_change,
    audit_config_change as _audit_config_change,
    config_change_verb as _verb_for_payload,
)
from apps.catalog.catalog_cache import invalidate_catalog_scopes
from apps.catalog.models import Institution, Program
from apps.catalog.serializers import ProgramSerializer
from apps.catalog.tenant_readiness import build_tenant_readiness

class AdminTenantListCreateView(APIView):
    permission_classes = [IsAuthenticated, HasPlatformCapability]
    serializer_class = AdminInstitutionSerializer
    required_capability = "platform.tenant.read_all"
    audit_resource_type = "institution_directory"

    def get_permissions(self):
        # One route retains its established GET/POST shape, but those methods
        # are distinct platform operations. Resolve the exact capability before
        # DRF instantiates HasPlatformCapability.
        self.required_capability = (
            "platform.tenant.create"
            if self.request.method == "POST"
            else "platform.tenant.read_all"
        )
        return super().get_permissions()

    @extend_schema(
        operation_id="admin_tenant_institutions_list",
        tags=["admin"],
        parameters=[
            OpenApiParameter("search", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("active", OpenApiTypes.BOOL, OpenApiParameter.QUERY),
        ],
        responses={200: OpenApiResponse(response=AdminInstitutionSerializer(many=True))},
    )
    def get(self, request):
        queryset = Institution.objects.all().order_by("name")
        search = request.query_params.get("search")
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(code__icontains=search) | Q(full_name__icontains=search))
        active = request.query_params.get("active")
        if active is not None:
            queryset = queryset.filter(is_active=str(active).lower() in {"1", "true", "yes"})
        return _paginate(request, queryset, AdminInstitutionSerializer)

    @extend_schema(
        operation_id="admin_tenant_institutions_create",
        tags=["admin"],
        request=AdminInstitutionSerializer,
        responses={201: OpenApiResponse(response=AdminInstitutionSerializer)},
    )
    def post(self, request):
        if not _write_allowed(request.user, "platform.tenant.create"):
            return _forbidden_write_response()
        serializer = AdminInstitutionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        institution = serializer.save()
        _audit_config_change(
            request,
            resource="institution",
            verb="created",
            entity_id=institution.id,
            institution_id=institution.id,
        )
        # R4.3: a new tenant changes the shared catalog portal listing.
        invalidate_catalog_scopes(institution.id, user=request.user)
        return Response({"success": True, "data": AdminInstitutionSerializer(institution).data}, status=status.HTTP_201_CREATED)


class AdminTenantDetailView(APIView):
    permission_classes = [IsAdmin]
    serializer_class = AdminInstitutionSerializer

    def _get_queryset(self, request):
        return _readable_institution_queryset(request.user)

    def get(self, request, institution_id):
        try:
            institution = self._get_queryset(request).get(id=institution_id)
        except Institution.DoesNotExist:
            return Response({"success": False, "error": "Institution not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"success": True, "data": AdminInstitutionSerializer(institution).data})

    def patch(self, request, institution_id):
        verb = _verb_for_payload(request.data, created=False)
        required_capability = (
            "platform.tenant.deactivate"
            if verb == "deactivated"
            else "platform.tenant.update"
        )
        if not _write_allowed(request.user, required_capability):
            return _forbidden_write_response()
        try:
            institution = Institution.objects.get(id=institution_id)
        except Institution.DoesNotExist:
            return Response({"success": False, "error": "Institution not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        # Delegate to the single canonical institution-profile command. This is
        # the SAME command the tenant change-request apply path calls on approval
        # (task 4.5): serializer-validated write, R6.9 membership suspension on
        # deactivate, canonical audit event, and catalog-cache invalidation.
        institution = apply_institution_profile_change(
            institution, request.data, request=request
        )
        return Response({"success": True, "data": AdminInstitutionSerializer(institution).data})


class AdminTenantReadinessView(APIView):
    """GET canonical tenant launch readiness for the onboarding wizard."""

    permission_classes = [IsAdmin]

    @extend_schema(
        operation_id="admin_tenant_readiness",
        tags=["admin"],
        responses={200: OpenApiResponse(description="Tenant launch readiness aggregate.")},
    )
    def get(self, request, institution_id):
        if not _readable_institution_queryset(request.user).filter(id=institution_id).exists():
            return Response(
                {"success": False, "error": "Institution not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"success": True, "data": build_tenant_readiness(institution_id)})


class AdminTenantProgramListView(_InstitutionChildListCreateView):
    """GET tenant program offerings scoped through the admin tenant boundary.

    This is intentionally read-only. Assigning canonical programs to schools and
    editing routing rules remains a Beanola platform operation handled by
    platform-gated write endpoints; tenant admins use this endpoint only to see
    their own school's offerings.
    """

    model = Program
    serializer_class = ProgramSerializer
    order_by = ("name",)

    @extend_schema(
        operation_id="admin_tenant_programs_list",
        tags=["admin"],
        responses={200: OpenApiResponse(response=ProgramSerializer)},
    )
    def get(self, request, institution_id):
        return super().get(request, institution_id)

    def get_queryset(self, request, institution_id):
        return (
            super()
            .get_queryset(request, institution_id)
            .select_related("institution", "canonical_program")
        )

    def post(self, request, institution_id):
        return _forbidden_write_response()


class AdminTenantProgramDetailView(_InstitutionChildDetailView):
    """GET/PATCH tenant program offering through the canonical admin tenant path."""

    model = Program
    serializer_class = ProgramSerializer
    audit_resource = "program"

    @extend_schema(
        operation_id="admin_tenant_programs_retrieve",
        tags=["admin"],
        responses={200: OpenApiResponse(response=ProgramSerializer)},
    )
    def get(self, request, institution_id, item_id):
        try:
            program = self.get_queryset(request, institution_id).select_related(
                "institution", "canonical_program"
            ).get(id=item_id)
        except Program.DoesNotExist:
            return Response({"success": False, "error": "Program not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"success": True, "data": self.serializer_class(program).data})

    def patch(self, request, institution_id, item_id):
        if not _write_allowed(request.user, "platform.program_assignment.manage"):
            return _forbidden_write_response()
        try:
            program = self.get_queryset(request, institution_id).get(id=item_id)
        except Program.DoesNotExist:
            return Response({"success": False, "error": "Program not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        # Delegate to the single canonical program-offering command — the SAME
        # command the tenant change-request apply path calls on approval (4.5).
        program = apply_program_offering_change(program, request.data, request=request)
        return Response({"success": True, "data": self.serializer_class(program).data})
