"""Intake catalog views.

``/api/v1/catalog/intakes/`` — public intake listing plus the frozen legacy
intake write path. Intakes are **global**, so every write resolves the single
``platform.intake.manage`` capability (R5.3). Split out of ``views.py`` by task
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
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authentication import OptionalJWTCookieAuthentication
from apps.accounts.permissions import IsAdmin
from apps.catalog._catalog_view_helpers import (
    CatalogMessageResponseSerializer,
    IntakeListResponseSerializer,
    IntakeResponseSerializer,
    _INTAKE_WRITE_CAPABILITY,
    _cached_catalog_payload,
    _is_admin,
    _request_method,
    _set_public_cache,
)
from apps.catalog.catalog_cache import invalidate_catalog_scopes
from apps.catalog.legacy_write_telemetry import mark_deprecated, record_catalog_write
from apps.catalog.models import Intake
from apps.catalog.permissions import HasPlatformCapability
from apps.catalog.serializers import IntakeSerializer
from apps.common.openapi_helpers import ErrorResponseSerializer

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
        # R14.7: frozen legacy route; canonical successor is /admin/intakes/.
        record_catalog_write(request, resource="intake", method="POST", legacy=True)
        out = IntakeSerializer(intake)
        response = Response({"success": True, "data": out.data}, status=status.HTTP_201_CREATED)
        return mark_deprecated(response, resource="intake", successor="/api/v1/admin/intakes/")


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
        # R14.7: frozen legacy route; canonical successor is /admin/intakes/{id}/.
        record_catalog_write(request, resource="intake", method="PATCH", legacy=True)
        response = Response({"success": True, "data": IntakeSerializer(intake).data})
        return mark_deprecated(
            response, resource="intake", successor=f"/api/v1/admin/intakes/{intake.id}/"
        )

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
        # R14.7: frozen legacy route; canonical successor is /admin/intakes/{id}/.
        record_catalog_write(request, resource="intake", method="DELETE", legacy=True)
        response = Response({"success": True, "data": {"message": "Intake deactivated"}})
        return mark_deprecated(
            response, resource="intake", successor=f"/api/v1/admin/intakes/{intake.id}/"
        )
