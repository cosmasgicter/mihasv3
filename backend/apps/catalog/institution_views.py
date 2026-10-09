"""Institution catalog views.

``/api/v1/catalog/institutions/`` — the public institution listing plus the
frozen legacy tenant write path, capability-gated per method (R5.1) with the
public ``GET`` behaviour preserved (R5.5). Split out of ``views.py`` by task
12.1; both views are the ones that were there, lifted verbatim.
"""

from __future__ import annotations

from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
    extend_schema_view,
)
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authentication import OptionalJWTCookieAuthentication
from apps.accounts.permissions import IsAdmin
from apps.catalog._catalog_view_helpers import (
    CatalogMessageResponseSerializer,
    InstitutionListResponseSerializer,
    InstitutionResponseSerializer,
    _INSTITUTION_WRITE_CAPABILITIES,
    _is_admin,
    _request_method,
    _scope_institution_queryset_for_request,
    _set_public_cache,
)
from apps.catalog.catalog_cache import invalidate_catalog_scopes
from apps.catalog.legacy_write_telemetry import mark_deprecated, record_catalog_write
from apps.catalog.models import Institution, Program
from apps.catalog.permissions import HasPlatformCapability, TenantScopedCapabilityMixin
from apps.catalog.serializers import InstitutionSerializer
from apps.common.openapi_helpers import ErrorResponseSerializer

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
        # R14.7: frozen legacy route; canonical successor is /admin/institutions/.
        record_catalog_write(request, resource="institution", method="POST", legacy=True)
        out = InstitutionSerializer(institution)
        response = Response({"success": True, "data": out.data}, status=status.HTTP_201_CREATED)
        return mark_deprecated(response, resource="institution", successor="/api/v1/admin/institutions/")


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
        # R14.7: frozen legacy route; canonical successor is /admin/institutions/{id}/.
        record_catalog_write(request, resource="institution", method="PATCH", legacy=True)
        out = InstitutionSerializer(institution)
        response = Response({"success": True, "data": out.data})
        return mark_deprecated(
            response,
            resource="institution",
            successor=f"/api/v1/admin/institutions/{institution.id}/",
        )

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
        # R14.7: frozen legacy route; canonical successor is /admin/institutions/{id}/.
        record_catalog_write(request, resource="institution", method="DELETE", legacy=True)
        response = Response({"success": True, "data": {"message": "Institution deactivated"}})
        return mark_deprecated(
            response,
            resource="institution",
            successor=f"/api/v1/admin/institutions/{institution.id}/",
        )
