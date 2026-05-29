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
from apps.accounts.permissions import IsAdmin, ROLE_HIERARCHY, is_super_admin
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

# Stream 9 decomposition: shared serializers live in admin_serializers.
from apps.accounts.admin_serializers import (  # noqa: F401
    AdminAuditLogListResponseSerializer,
    AdminMessageResponseSerializer,
    AuditLogSerializer,
)

logger = logging.getLogger(__name__)


def _role_level(role: str | None) -> int:
    return ROLE_HIERARCHY.get(role or "", 0)


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
# 19.3 - Audit Log Query
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_audit_logs_list",
        tags=["admin"],
        parameters=[
            OpenApiParameter("entity_type", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Filter by entity type."),
            OpenApiParameter("action", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Filter by action."),
            OpenApiParameter("actor_id", OpenApiTypes.UUID, OpenApiParameter.QUERY, description="Filter by actor UUID."),
            OpenApiParameter("date_from", OpenApiTypes.DATETIME, OpenApiParameter.QUERY, description="ISO timestamp lower bound."),
            OpenApiParameter("date_to", OpenApiTypes.DATETIME, OpenApiParameter.QUERY, description="ISO timestamp upper bound."),
            OpenApiParameter("page", OpenApiTypes.INT, OpenApiParameter.QUERY, description="Page number."),
            OpenApiParameter("pageSize", OpenApiTypes.INT, OpenApiParameter.QUERY, description="Page size."),
        ],
        responses={200: OpenApiResponse(response=AdminAuditLogListResponseSerializer)},
    )
)
class AdminAuditLogView(APIView):
    """GET /api/v1/admin/audit-logs/

    Filter by entity_type, action, actor, date range. Admin only. Paginated.
    """

    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = AuditLogSerializer

    def get(self, request):
        queryset = AuditLog.objects.all().order_by("-created_at")

        entity_type = request.query_params.get("entity_type") or request.query_params.get("filter_entity_type")
        if entity_type:
            queryset = queryset.filter(entity_type=entity_type)

        action = request.query_params.get("action") or request.query_params.get("filter_action")
        if action:
            queryset = queryset.filter(action=action)

        actor_id = request.query_params.get("actor_id") or request.query_params.get("filter_user_id")
        if actor_id:
            queryset = queryset.filter(actor_id=actor_id)

        actor_email = request.query_params.get("actor_email")
        if actor_email:
            matching_users = Profile.objects.filter(email__icontains=actor_email).values_list('id', flat=True)[:50]
            if matching_users:
                queryset = queryset.filter(actor_id__in=list(matching_users))
            else:
                queryset = queryset.none()

        date_from = request.query_params.get("date_from") or request.query_params.get("filter_from")
        if date_from:
            queryset = queryset.filter(created_at__gte=date_from)

        date_to = request.query_params.get("date_to") or request.query_params.get("filter_to")
        if date_to:
            queryset = queryset.filter(created_at__lte=date_to)

        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = AuditLogSerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)

