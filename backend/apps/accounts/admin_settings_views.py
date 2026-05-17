"""Admin dashboard and user management views.

Implements tasks 19.1, 19.2, 19.3.
Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
"""

import csv
import logging
import re
from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
    extend_schema_view,
)
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Profile
from apps.accounts.permissions import IsAdmin, ROLE_HIERARCHY
from apps.accounts.services import hash_password
from apps.common.audit_network import build_audit_network_fields, decrypt_network_value
from apps.common.models import AuditLog, Setting
from apps.common.openapi_helpers import (
    ErrorResponseSerializer,
    MessageSerializer,
    envelope_serializer,
    paginated_serializer,
)
from apps.common.pagination import StandardPagination

# Stream 9 decomposition: shared serializers + helpers live in admin_serializers.
from apps.accounts.admin_serializers import (  # noqa: F401
    AdminMessageResponseSerializer,
    AdminSettingsListResponseSerializer,
    AdminSettingsResponseSerializer,
    DEFAULT_GUIDED_SETTINGS,
    KNOWN_SETTING_KEYS,
    SETTING_CATEGORY_RE,
    SETTING_KEY_RE,
    SettingSerializer,
    SettingUpdateSerializer,
    _validate_known_setting_value,
    _validate_setting_json_value,
)

logger = logging.getLogger(__name__)


def _role_level(role: str | None) -> int:
    return ROLE_HIERARCHY.get(role or "", 0)


def _is_super_admin(user) -> bool:
    return getattr(user, "role", None) == "super_admin"


def _redact_name(value: str | None) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    return f"{value[:1]}***"


def _redact_email(value: str | None) -> str:
    value = (value or "").strip()
    if "@" not in value:
        return "***"
    local, domain = value.split("@", 1)
    return f"{local[:1]}***@{domain}"


# ---------------------------------------------------------------------------
# Serializers (co-located for admin views)
# ---------------------------------------------------------------------------


SETTING_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{1,99}$")
SETTING_CATEGORY_RE = re.compile(r"^[a-z][a-z0-9_-]{0,49}$")
KNOWN_SETTING_KEYS = {
    "site_name",
    "enable_online_applications",
    "contact_email",
    "contact_phone",
    "application_fee",
    "max_applications_per_user",
}


def _validate_setting_json_value(value, *, depth=0):
    if depth > 4:
        raise serializers.ValidationError("Setting value is too deeply nested.")

    if value is None or isinstance(value, (bool, int, float)):
        return

    if isinstance(value, str):
        if len(value) > 2000:
            raise serializers.ValidationError("Setting string values must be 2000 characters or fewer.")
        return

    if isinstance(value, list):
        if len(value) > 50:
            raise serializers.ValidationError("Setting arrays must contain 50 items or fewer.")
        for item in value:
            _validate_setting_json_value(item, depth=depth + 1)
        return

    if isinstance(value, dict):
        if len(value) > 50:
            raise serializers.ValidationError("Setting objects must contain 50 keys or fewer.")
        for key, item in value.items():
            if not isinstance(key, str) or len(key) > 100:
                raise serializers.ValidationError("Setting object keys must be strings of 100 characters or fewer.")
            _validate_setting_json_value(item, depth=depth + 1)
        return

    raise serializers.ValidationError("Setting value must be valid JSON.")


def _validate_known_setting_value(key, value):
    if key not in KNOWN_SETTING_KEYS:
        return

    if key in {"site_name", "contact_phone"}:
        if not isinstance(value, str) or not value.strip():
            raise serializers.ValidationError(f"{key} must be a non-empty string.")
        return

    if key == "enable_online_applications":
        if isinstance(value, bool):
            return
        if isinstance(value, str) and value.lower() in {"true", "false"}:
            return
        raise serializers.ValidationError("enable_online_applications must be a boolean or 'true'/'false'.")

    if key == "contact_email":
        serializers.EmailField().run_validation(value)
        return

    if key == "application_fee":
        try:
            amount = float(value)
        except (TypeError, ValueError):
            raise serializers.ValidationError("application_fee must be a numeric value.") from None
        if amount < 0:
            raise serializers.ValidationError("application_fee must be zero or greater.")
        return

    if key == "max_applications_per_user":
        try:
            count = int(value)
        except (TypeError, ValueError):
            raise serializers.ValidationError("max_applications_per_user must be an integer.") from None
        if str(value).strip() != str(count) and not isinstance(value, int):
            raise serializers.ValidationError("max_applications_per_user must be an integer.")
        if count < 1 or count > 50:
            raise serializers.ValidationError("max_applications_per_user must be between 1 and 50.")




# ---------------------------------------------------------------------------
# 19.2 — System Settings CRUD
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_settings_list",
        tags=["admin"],
        parameters=[
            OpenApiParameter("category", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Filter by setting category."),
            OpenApiParameter("page", OpenApiTypes.INT, OpenApiParameter.QUERY, description="Page number."),
            OpenApiParameter("pageSize", OpenApiTypes.INT, OpenApiParameter.QUERY, description="Page size."),
        ],
        responses={200: OpenApiResponse(response=AdminSettingsListResponseSerializer)},
    ),
    post=extend_schema(
        operation_id="admin_settings_create",
        tags=["admin"],
        request=SettingSerializer,
        responses={
            201: OpenApiResponse(response=AdminSettingsResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            409: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class AdminSettingsListView(APIView):
    """GET/POST /api/v1/admin/settings/

    Key-value store with category, description, public/private. Admin only.
    """

    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = SettingSerializer

    def get(self, request):
        queryset = Setting.objects.all().order_by("key")

        category = request.query_params.get("category")
        if category:
            queryset = queryset.filter(category=category)

        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = SettingSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = SettingSerializer(data=request.data)
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

        data = serializer.validated_data

        if Setting.objects.filter(key=data["key"]).exists():
            return Response(
                {"success": False, "error": "Setting key already exists", "code": "DUPLICATE_KEY"},
                status=status.HTTP_409_CONFLICT,
            )

        setting = Setting.objects.create(**data)
        return Response(
            {"success": True, "data": SettingSerializer(setting).data},
            status=status.HTTP_201_CREATED,
        )


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_settings_retrieve",
        tags=["admin"],
        parameters=[
            OpenApiParameter("pk", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Setting UUID."),
        ],
        responses={
            200: OpenApiResponse(response=AdminSettingsResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    patch=extend_schema(
        operation_id="admin_settings_update",
        tags=["admin"],
        parameters=[
            OpenApiParameter("pk", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Setting UUID."),
        ],
        request=SettingUpdateSerializer,
        responses={
            200: OpenApiResponse(response=AdminSettingsResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    delete=extend_schema(
        operation_id="admin_settings_delete",
        tags=["admin"],
        parameters=[
            OpenApiParameter("pk", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Setting UUID."),
        ],
        request=None,
        responses={
            200: OpenApiResponse(response=AdminMessageResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class AdminSettingDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/admin/settings/{id}/

    Admin only.
    """

    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = SettingSerializer

    def get(self, request, pk):
        try:
            setting = Setting.objects.get(pk=pk)
        except Setting.DoesNotExist:
            return Response(
                {"success": False, "error": "Setting not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"success": True, "data": SettingSerializer(setting).data})

    def patch(self, request, pk):
        try:
            setting = Setting.objects.get(pk=pk)
        except Setting.DoesNotExist:
            return Response(
                {"success": False, "error": "Setting not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = SettingUpdateSerializer(data=request.data, context={"setting_key": setting.key})
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

        for field, value in serializer.validated_data.items():
            setattr(setting, field, value)
        setting.save()

        return Response({"success": True, "data": SettingSerializer(setting).data})

    def delete(self, request, pk):
        try:
            setting = Setting.objects.get(pk=pk)
        except Setting.DoesNotExist:
            return Response(
                {"success": False, "error": "Setting not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        setting.delete()
        return Response(
            {"success": True, "data": {"message": "Setting deleted"}},
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# Bug 2 Fix — Settings Import & Reset
# ---------------------------------------------------------------------------


class AdminSettingsImportView(APIView):
    """POST /api/v1/admin/settings/import/

    Accepts ``{settings: [...]}``, upserts each setting by key,
    returns ``{imported: [...keys], errors: [...]}``.
    """

    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT}, tags=["admin"], summary="Import admin settings")
    def post(self, request):
        settings_list = request.data.get("settings")
        if not isinstance(settings_list, list):
            return Response(
                {"success": False, "error": "Expected 'settings' array", "code": "VALIDATION_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        imported = []
        errors = []

        for entry in settings_list:
            if not isinstance(entry, dict):
                errors.append("Entry must be an object")
                continue

            key = entry.get("key")
            if not key:
                errors.append("Missing key in entry")
                continue

            try:
                serializer = SettingSerializer(data={
                    "key": key,
                    "value": entry.get("value", ""),
                    "description": entry.get("description", ""),
                    "category": entry.get("category", ""),
                    "is_public": entry.get("is_public", False),
                })
                if not serializer.is_valid():
                    errors.append(f"{key}: {serializer.errors}")
                    continue

                validated = serializer.validated_data
                defaults = {
                    "value": validated.get("value", ""),
                    "description": validated.get("description", ""),
                    "category": validated.get("category", ""),
                    "is_public": validated.get("is_public", False),
                }
                Setting.objects.update_or_create(key=validated["key"], defaults=defaults)
                imported.append(validated["key"])
            except Exception as exc:
                errors.append(f"{key}: {exc}")

        return Response({"success": True, "data": {"imported": imported, "errors": errors}})


class AdminSettingsResetView(APIView):
    """POST /api/v1/admin/settings/reset/

    Replaces settings with the guided operational defaults used by the admin UI.
    """

    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(request=None, responses={200: OpenApiTypes.OBJECT}, tags=["admin"], summary="Reset admin settings to defaults")
    def post(self, request):
        with transaction.atomic():
            deleted_count, _ = Setting.objects.all().delete()
            created_settings = [Setting(**setting) for setting in DEFAULT_GUIDED_SETTINGS]
            Setting.objects.bulk_create(created_settings)

        return Response({
            "success": True,
            "data": {
                "message": (
                    f"Settings reset to guided defaults. "
                    f"{deleted_count} setting(s) removed, {len(created_settings)} default setting(s) restored."
                ),
                "restored": len(created_settings),
            },
        })

