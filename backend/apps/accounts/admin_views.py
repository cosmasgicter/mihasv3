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


class AdminUserSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    email = serializers.EmailField(read_only=True)
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)
    role = serializers.CharField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)


class AdminUserCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(min_length=6, write_only=True)
    first_name = serializers.CharField(max_length=255)
    last_name = serializers.CharField(max_length=255)
    role = serializers.ChoiceField(choices=["student", "admin", "reviewer", "super_admin"])
    phone = serializers.CharField(max_length=20, required=False, default="")
    nationality = serializers.CharField(max_length=100, required=False, default="Zambian")

    def validate_password(self, value):
        """Enforce minimum password length of 6 characters."""
        if len(value) < 6:
            raise serializers.ValidationError("Password must be at least 6 characters.")
        return value


class AdminUserUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(
        choices=["student", "admin", "reviewer", "super_admin"], required=False
    )
    is_active = serializers.BooleanField(required=False)
    first_name = serializers.CharField(max_length=255, required=False)
    last_name = serializers.CharField(max_length=255, required=False)
    password = serializers.CharField(min_length=6, write_only=True, required=False)


class SettingSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    key = serializers.CharField(max_length=100)
    value = serializers.JSONField()
    category = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    description = serializers.CharField(required=False, allow_blank=True, default="")
    is_public = serializers.BooleanField(required=False, default=False)
    updated_by = serializers.UUIDField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    def validate_key(self, value):
        if not SETTING_KEY_RE.match(value):
            raise serializers.ValidationError(
                "Setting key must use lowercase letters, numbers, and underscores, and start with a letter."
            )
        return value

    def validate_category(self, value):
        if value and not SETTING_CATEGORY_RE.match(value):
            raise serializers.ValidationError(
                "Setting category must use lowercase letters, numbers, dashes, or underscores."
            )
        return value

    def validate_description(self, value):
        if value and len(value) > 1000:
            raise serializers.ValidationError("Description must be 1000 characters or fewer.")
        return value

    def validate(self, attrs):
        key = attrs.get("key")
        value = attrs.get("value")
        _validate_setting_json_value(value)
        _validate_known_setting_value(key, value)
        return attrs


class SettingUpdateSerializer(serializers.Serializer):
    value = serializers.JSONField(required=False)
    category = serializers.CharField(max_length=50, required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    is_public = serializers.BooleanField(required=False)

    def validate_category(self, value):
        if value and not SETTING_CATEGORY_RE.match(value):
            raise serializers.ValidationError(
                "Setting category must use lowercase letters, numbers, dashes, or underscores."
            )
        return value

    def validate_description(self, value):
        if value and len(value) > 1000:
            raise serializers.ValidationError("Description must be 1000 characters or fewer.")
        return value

    def validate(self, attrs):
        if "value" in attrs:
            key = self.context.get("setting_key")
            value = attrs["value"]
            _validate_setting_json_value(value)
            _validate_known_setting_value(key, value)
        return attrs


DEFAULT_GUIDED_SETTINGS = [
    {
        "key": "site_name",
        "value": "MIHAS Application System",
        "description": "Primary platform title shown across public and authenticated screens.",
        "category": "general",
        "is_public": True,
    },
    {
        "key": "enable_online_applications",
        "value": "true",
        "description": "Controls whether students can start or continue applications online.",
        "category": "general",
        "is_public": True,
    },
    {
        "key": "contact_email",
        "value": "admissions@mihas.edu.zm",
        "description": "Primary email used for admissions contact, slip delivery, and public support messaging.",
        "category": "contact",
        "is_public": True,
    },
    {
        "key": "contact_phone",
        "value": "+260-000-000-000",
        "description": "Primary phone number shown to applicants and used by support surfaces.",
        "category": "contact",
        "is_public": True,
    },
    {
        "key": "application_fee",
        "value": "153.00",
        "description": "Default admissions application fee used in payment guidance and review.",
        "category": "finance",
        "is_public": True,
    },
    {
        "key": "max_applications_per_user",
        "value": "3",
        "description": "Maximum number of application records a single student can submit.",
        "category": "limits",
        "is_public": False,
    },
]


class AuditLogSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    actor_id = serializers.UUIDField(read_only=True, allow_null=True)
    action = serializers.CharField(read_only=True)
    entity_type = serializers.CharField(read_only=True)
    entity_id = serializers.UUIDField(read_only=True, allow_null=True)
    changes = serializers.JSONField(read_only=True)
    ip_hash = serializers.CharField(source="ip_address", read_only=True, allow_blank=True, allow_null=True)
    user_agent_hash = serializers.CharField(source="user_agent", read_only=True, allow_blank=True, allow_null=True)
    request_ip = serializers.SerializerMethodField()
    request_user_agent = serializers.SerializerMethodField()
    retention_category = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)

    def _can_view_network_context(self) -> bool:
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        return bool(user and getattr(user, "is_authenticated", False) and getattr(user, "role", None) == "super_admin")

    def get_request_ip(self, obj):
        if not self._can_view_network_context():
            return None
        return decrypt_network_value(getattr(obj, "ip_address_encrypted", None))

    def get_request_user_agent(self, obj):
        if not self._can_view_network_context():
            return None
        return decrypt_network_value(getattr(obj, "user_agent_encrypted", None))


class AdminDashboardActivitySerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    type = serializers.CharField(read_only=True)
    application_number = serializers.CharField(read_only=True, allow_blank=True)
    old_status = serializers.CharField(read_only=True, allow_blank=True)
    new_status = serializers.CharField(read_only=True, allow_blank=True)
    timestamp = serializers.CharField(read_only=True, allow_blank=True)
    actor_name = serializers.CharField(read_only=True, allow_blank=True)
    message = serializers.CharField(read_only=True)


class AdminDashboardApplicationStatsSerializer(serializers.Serializer):
    by_status = serializers.JSONField()
    today = serializers.IntegerField()
    this_week = serializers.IntegerField()
    this_month = serializers.IntegerField()
    total = serializers.IntegerField()


class AdminDashboardUserStatsSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    active = serializers.IntegerField()


class AdminDashboardNeedsAttentionSerializer(serializers.Serializer):
    pending_payments = serializers.IntegerField()
    pending_documents = serializers.IntegerField()
    upcoming_interviews = serializers.IntegerField()


class AdminDashboardSerializer(serializers.Serializer):
    applications = AdminDashboardApplicationStatsSerializer()
    users = AdminDashboardUserStatsSerializer()
    needs_attention = AdminDashboardNeedsAttentionSerializer()
    recent_activity = AdminDashboardActivitySerializer(many=True)


AdminDashboardResponseSerializer = envelope_serializer(
    "AdminDashboardResponse",
    AdminDashboardSerializer(),
)
AdminUserResponseSerializer = envelope_serializer(
    "AdminUserResponse",
    AdminUserSerializer(),
)
AdminUserListResponseSerializer = envelope_serializer(
    "AdminUserListResponse",
    paginated_serializer("AdminUserPage", AdminUserSerializer),
)
AdminSettingsResponseSerializer = envelope_serializer(
    "AdminSettingResponse",
    SettingSerializer(),
)
AdminSettingsListResponseSerializer = envelope_serializer(
    "AdminSettingListResponse",
    paginated_serializer("AdminSettingPage", SettingSerializer),
)
AdminAuditLogListResponseSerializer = envelope_serializer(
    "AdminAuditLogListResponse",
    paginated_serializer("AdminAuditLogPage", AuditLogSerializer),
)
AdminMessageResponseSerializer = envelope_serializer(
    "AdminMessageResponse",
    MessageSerializer(),
)


# ---------------------------------------------------------------------------
# 19.1 — Admin Dashboard
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_dashboard_retrieve",
        tags=["admin"],
        responses={200: OpenApiResponse(response=AdminDashboardResponseSerializer)},
    )
)
class AdminDashboardView(APIView):
    """GET /api/v1/admin/dashboard/

    Application counts by status, period totals (today/week/month),
    recent activity. Admin only.
    """

    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = AdminDashboardSerializer

    @staticmethod
    def _timestamp(value):
        if not value:
            return ""
        if hasattr(value, "isoformat"):
            return value.isoformat()
        return str(value)

    @staticmethod
    def _actor_name(actor):
        if not actor:
            return ""
        first_name = getattr(actor, "first_name", "") or ""
        last_name = getattr(actor, "last_name", "") or ""
        return f"{first_name} {last_name}".strip()

    @classmethod
    def _format_recent_activity(cls, status_entries, recent_payments):
        recent_activity = []

        for entry in status_entries:
            application = getattr(entry, "application", None)
            app_number = getattr(application, "application_number", "") or ""
            old_status = getattr(entry, "old_status", "") or ""
            new_status = getattr(entry, "new_status", "") or ""
            old_label = old_status or "new"
            new_label = new_status or "unknown"

            recent_activity.append({
                "id": str(getattr(entry, "id", "")),
                "type": "status_change",
                "application_number": app_number,
                "old_status": old_status,
                "new_status": new_status,
                "timestamp": cls._timestamp(getattr(entry, "created_at", None)),
                "actor_name": cls._actor_name(getattr(entry, "changed_by", None)),
                "message": f"{app_number}: {old_label} -> {new_label}",
            })

        for payment in recent_payments:
            application = getattr(payment, "application", None)
            app_number = getattr(application, "application_number", "") or ""
            payment_status = getattr(payment, "status", "") or ""

            recent_activity.append({
                "id": str(getattr(payment, "id", "")),
                "type": "payment",
                "application_number": app_number,
                "old_status": "",
                "new_status": payment_status,
                "timestamp": cls._timestamp(getattr(payment, "updated_at", None)),
                "actor_name": "",
                "message": f"{app_number}: Payment {payment_status}",
            })

        recent_activity.sort(key=lambda item: item["timestamp"], reverse=True)
        return recent_activity[:10]

    def get(self, request):
        try:
            now = timezone.now()
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            week_start = today_start - timedelta(days=today_start.weekday())
            month_start = today_start.replace(day=1)

            from apps.applications.models import Application

            # Application counts by status
            status_counts = dict(
                Application.objects.values_list("status")
                .annotate(count=Count("id"))
                .values_list("status", "count")
            )

            activity_queryset = Application.objects.annotate(
                activity_at=Coalesce("submitted_at", "updated_at", "created_at")
            )
            today_created_count = Application.objects.filter(created_at__gte=today_start).count()
            today_submitted_count = Application.objects.filter(submitted_at__gte=today_start).count()
            today_count = activity_queryset.filter(activity_at__gte=today_start).count()
            week_count = activity_queryset.filter(activity_at__gte=week_start).count()
            month_count = activity_queryset.filter(activity_at__gte=month_start).count()

            # Recent activity (status changes + payment completions)
            try:
                from apps.applications.models import ApplicationStatusHistory
                from apps.documents.models import Payment

                status_entries = (
                    ApplicationStatusHistory.objects
                    .select_related('application', 'changed_by')
                    .order_by('-created_at')[:10]
                )

                recent_payments = (
                    Payment.objects
                    .filter(status__in=['successful', 'force_approved'])
                    .select_related('application')
                    .order_by('-updated_at')[:5]
                )

                recent_activity = self._format_recent_activity(status_entries, recent_payments)
            except Exception:
                logger.warning("Failed to load recent activity for admin dashboard", exc_info=True)
                recent_activity = []

            # Total users
            total_users = Profile.objects.count()
            active_users = Profile.objects.filter(is_active=True).count()

            # Needs attention counts
            try:
                from apps.documents.models import ApplicationDocument, Payment
                from apps.applications.models import ApplicationInterview

                pending_payments = Payment.objects.filter(
                    status__in=['pending', 'initiated']
                ).count()

                pending_documents = ApplicationDocument.objects.filter(
                    verification_status__in=[None, '', 'pending', 'uploaded']
                ).count()

                upcoming_interviews = ApplicationInterview.objects.filter(
                    scheduled_at__gte=now,
                    status__in=['scheduled', 'pending'],
                ).count()
            except Exception:
                logger.warning("Failed to load needs-attention counts", exc_info=True)
                pending_payments = 0
                pending_documents = 0
                upcoming_interviews = 0

            return Response({
                "success": True,
                "data": {
                    "applications": {
                        "by_status": status_counts,
                        "today": today_count,
                        "today_activity": today_count,
                        "today_created": today_created_count,
                        "today_submitted": today_submitted_count,
                        "this_week": week_count,
                        "this_month": month_count,
                        "total": Application.objects.count(),
                    },
                    "users": {
                        "total": total_users,
                        "active": active_users,
                    },
                    "needs_attention": {
                        "pending_payments": pending_payments,
                        "pending_documents": pending_documents,
                        "upcoming_interviews": upcoming_interviews,
                    },
                    "recent_activity": recent_activity,
                },
            })
        except Exception as exc:
            logger.exception("Admin dashboard data load failed")
            return Response(
                {
                    "success": False,
                    "error": "Dashboard data load failed. Please try again later.",
                    "code": "DASHBOARD_ERROR",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ---------------------------------------------------------------------------
# 19.1 — Admin User List
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_users_list",
        tags=["admin"],
        parameters=[
            OpenApiParameter("role", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Filter by role."),
            OpenApiParameter("search", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Match name or email."),
            OpenApiParameter("include_inactive", OpenApiTypes.BOOL, OpenApiParameter.QUERY, description="Include inactive accounts."),
            OpenApiParameter("page", OpenApiTypes.INT, OpenApiParameter.QUERY, description="Page number."),
            OpenApiParameter("pageSize", OpenApiTypes.INT, OpenApiParameter.QUERY, description="Page size."),
        ],
        responses={200: OpenApiResponse(response=AdminUserListResponseSerializer)},
    ),
    post=extend_schema(
        operation_id="admin_users_create",
        tags=["admin"],
        request=AdminUserCreateSerializer,
        responses={
            201: OpenApiResponse(response=AdminUserResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            409: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class AdminUserListView(APIView):
    """GET /api/v1/admin/users/ — paginated user listing.
    POST /api/v1/admin/users/ — create user with role assignment.

    Role filtering, search by name/email, include inactive option. Admin only.
    """

    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = AdminUserSerializer

    def get(self, request):
        queryset = Profile.objects.all().order_by("-created_at")

        # Role filter
        role = request.query_params.get("role")
        if role:
            queryset = queryset.filter(role=role)

        # Search by name or email
        search = request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(email__icontains=search)
            )

        # Include inactive (default: active only)
        include_inactive = request.query_params.get("include_inactive", "false").lower()
        if include_inactive not in ("true", "1", "yes"):
            queryset = queryset.filter(is_active=True)

        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = AdminUserSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        """Create a new user with role assignment (admin registration)."""
        serializer = AdminUserCreateSerializer(data=request.data)
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

        # Privilege escalation guard: actor cannot create users with a higher role
        actor_role = getattr(request.user, "role", "student")
        actor_level = _role_level(actor_role)
        requested_level = _role_level(data["role"])
        if requested_level > actor_level:
            return Response(
                {"success": False, "error": "You cannot create a user with a higher role than your own.", "code": "PRIVILEGE_ESCALATION"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if Profile.objects.filter(email__iexact=data["email"]).exists():
            return Response(
                {"success": False, "error": "Email already exists", "code": "DUPLICATE_EMAIL"},
                status=status.HTTP_409_CONFLICT,
            )

        profile = Profile.objects.create(
            email=data["email"],
            password_hash=hash_password(data["password"]),
            first_name=data["first_name"],
            last_name=data["last_name"],
            phone=data.get("phone", ""),
            nationality=data.get("nationality", "Zambian"),
            role=data["role"],
            is_active=True,
        )

        return Response(
            {"success": True, "data": AdminUserSerializer(profile).data},
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# 19.1 — Admin User Detail (GET/PATCH)
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_users_retrieve",
        tags=["admin"],
        parameters=[
            OpenApiParameter("pk", OpenApiTypes.UUID, OpenApiParameter.PATH, description="User UUID."),
        ],
        responses={
            200: OpenApiResponse(response=AdminUserResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    patch=extend_schema(
        operation_id="admin_users_update",
        tags=["admin"],
        parameters=[
            OpenApiParameter("pk", OpenApiTypes.UUID, OpenApiParameter.PATH, description="User UUID."),
        ],
        request=AdminUserUpdateSerializer,
        responses={
            200: OpenApiResponse(response=AdminUserResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class AdminUserDetailView(APIView):
    """GET/PATCH /api/v1/admin/users/{id}/

    Role updates, password resets, account deactivation with audit trail.
    Admin only.
    """

    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = AdminUserSerializer

    def get(self, request, pk):
        try:
            user = Profile.objects.get(pk=pk)
        except Profile.DoesNotExist:
            return Response(
                {"success": False, "error": "User not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"success": True, "data": AdminUserSerializer(user).data})

    def patch(self, request, pk):
        try:
            user = Profile.objects.get(pk=pk)
        except Profile.DoesNotExist:
            return Response(
                {"success": False, "error": "User not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = AdminUserUpdateSerializer(data=request.data)
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
        changes = {}
        actor_role = getattr(request.user, "role", None)
        actor_level = _role_level(actor_role)
        target_level = _role_level(user.role)

        if target_level > actor_level:
            return Response(
                {
                    "success": False,
                    "error": "You cannot modify a user with a higher role than your own.",
                    "code": "INSUFFICIENT_PRIVILEGES",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if "role" in data:
            requested_level = _role_level(data["role"])
            if requested_level > actor_level:
                return Response(
                    {
                        "success": False,
                        "error": "You cannot assign a role higher than your own.",
                        "code": "INSUFFICIENT_PRIVILEGES",
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            changes["role"] = {"old": user.role, "new": data["role"]}
            user.role = data["role"]

        if "is_active" in data:
            if not data["is_active"] and str(getattr(request.user, "pk", "")) == str(user.pk):
                return Response(
                    {
                        "success": False,
                        "error": "You cannot deactivate your own account.",
                        "code": "SELF_DEACTIVATION_FORBIDDEN",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            changes["is_active"] = {"old": user.is_active, "new": data["is_active"]}
            user.is_active = data["is_active"]

        if "first_name" in data:
            changes["first_name"] = {"old": user.first_name, "new": data["first_name"]}
            user.first_name = data["first_name"]

        if "last_name" in data:
            changes["last_name"] = {"old": user.last_name, "new": data["last_name"]}
            user.last_name = data["last_name"]

        if "password" in data:
            user.password_hash = hash_password(data["password"])
            changes["password"] = "reset"

        user.save()

        # Audit trail
        if changes:
            actor_id = getattr(request.user, "pk", None)
            network_fields = build_audit_network_fields(request)
            AuditLog.objects.create(
                actor_id=actor_id,
                action="user_update",
                entity_type="profiles",
                entity_id=user.pk,
                changes=changes,
                ip_address=network_fields["ip_address"],
                user_agent=network_fields["user_agent"],
                ip_address_encrypted=network_fields["ip_address_encrypted"],
                user_agent_encrypted=network_fields["user_agent_encrypted"],
                retention_category="security",
            )

        return Response({"success": True, "data": AdminUserSerializer(user).data})


# ---------------------------------------------------------------------------
# 19.1 — Admin User Export (CSV)
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_users_export",
        tags=["admin"],
        parameters=[
            OpenApiParameter("role", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Filter by role."),
            OpenApiParameter("include_inactive", OpenApiTypes.BOOL, OpenApiParameter.QUERY, description="Include inactive accounts."),
        ],
        responses={
            200: OpenApiResponse(
                response=OpenApiTypes.BINARY,
                description="CSV export of matching users.",
            ),
        },
    )
)
class AdminUserExportView(APIView):
    """GET /api/v1/admin/users/export/

    CSV export with audit logging. Admin only.
    """

    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = AdminUserSerializer

    def get(self, request):
        full_export = _is_super_admin(request.user)
        queryset = Profile.objects.all().order_by("-created_at")

        # Apply same filters as list view
        role = request.query_params.get("role")
        if role:
            queryset = queryset.filter(role=role)

        include_inactive = request.query_params.get("include_inactive", "false").lower()
        if include_inactive not in ("true", "1", "yes"):
            queryset = queryset.filter(is_active=True)

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="users_export.csv"'

        writer = csv.writer(response)
        writer.writerow(["ID", "Email", "First Name", "Last Name", "Role", "Active", "Created At", "Export Scope"])

        for user in queryset.iterator():
            email = user.email if full_export else _redact_email(user.email)
            first_name = user.first_name if full_export else _redact_name(user.first_name)
            last_name = user.last_name if full_export else _redact_name(user.last_name)
            writer.writerow([
                str(user.id),
                email,
                first_name,
                last_name,
                user.role,
                user.is_active,
                user.created_at.isoformat() if user.created_at else "",
                "full" if full_export else "redacted",
            ])

        # Audit log the export
        actor_id = getattr(request.user, "pk", None)
        network_fields = build_audit_network_fields(request)
        AuditLog.objects.create(
            actor_id=actor_id,
            action="user_export",
            entity_type="profiles",
            changes={"filters": {"role": role, "include_inactive": include_inactive}},
            ip_address=network_fields["ip_address"],
            user_agent=network_fields["user_agent"],
            ip_address_encrypted=network_fields["ip_address_encrypted"],
            user_agent_encrypted=network_fields["user_agent_encrypted"],
            retention_category="security",
        )

        return response


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

    @extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
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

    @extend_schema(request=None, responses={200: OpenApiTypes.OBJECT})
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


# ---------------------------------------------------------------------------
# 19.3 — Audit Log Query
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
