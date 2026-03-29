"""Admin dashboard and user management views.

Implements tasks 19.1, 19.2, 19.3.
Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
"""

import csv
import hashlib
import logging
from datetime import timedelta

from django.db.models import Count, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Profile
from apps.accounts.permissions import IsAdmin
from apps.accounts.services import hash_password
from apps.common.models import AuditLog, Setting
from apps.common.pagination import StandardPagination

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Serializers (co-located for admin views)
# ---------------------------------------------------------------------------


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
    password = serializers.CharField(min_length=8, write_only=True)
    first_name = serializers.CharField(max_length=255)
    last_name = serializers.CharField(max_length=255)
    role = serializers.ChoiceField(choices=["student", "admin", "reviewer", "super_admin"])
    phone = serializers.CharField(max_length=20, required=False, default="")
    nationality = serializers.CharField(max_length=100, required=False, default="Zambian")


class AdminUserUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(
        choices=["student", "admin", "reviewer", "super_admin"], required=False
    )
    is_active = serializers.BooleanField(required=False)
    first_name = serializers.CharField(max_length=255, required=False)
    last_name = serializers.CharField(max_length=255, required=False)
    password = serializers.CharField(min_length=8, write_only=True, required=False)


class SettingSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    key = serializers.CharField(max_length=255)
    value = serializers.CharField()
    category = serializers.CharField(max_length=100, required=False, default="")
    description = serializers.CharField(required=False, default="")
    is_public = serializers.BooleanField(required=False, default=False)
    updated_at = serializers.DateTimeField(read_only=True)


class SettingUpdateSerializer(serializers.Serializer):
    value = serializers.CharField(required=False)
    category = serializers.CharField(max_length=100, required=False)
    description = serializers.CharField(required=False)
    is_public = serializers.BooleanField(required=False)


class AuditLogSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    actor_id = serializers.UUIDField(read_only=True, allow_null=True)
    action = serializers.CharField(read_only=True)
    entity_type = serializers.CharField(read_only=True)
    entity_id = serializers.UUIDField(read_only=True, allow_null=True)
    changes = serializers.JSONField(read_only=True)
    retention_category = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)


# ---------------------------------------------------------------------------
# 19.1 — Admin Dashboard
# ---------------------------------------------------------------------------


class AdminDashboardView(APIView):
    """GET /api/v1/admin/dashboard/

    Application counts by status, period totals (today/week/month),
    recent activity. Admin only.
    """

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
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

        # Period totals
        today_count = Application.objects.filter(created_at__gte=today_start).count()
        week_count = Application.objects.filter(created_at__gte=week_start).count()
        month_count = Application.objects.filter(created_at__gte=month_start).count()

        # Recent activity (last 10 audit log entries)
        recent_logs = AuditLog.objects.order_by("-created_at")[:10]
        recent_activity = AuditLogSerializer(recent_logs, many=True).data

        # Total users
        total_users = Profile.objects.count()
        active_users = Profile.objects.filter(is_active=True).count()

        return Response({
            "success": True,
            "data": {
                "applications": {
                    "by_status": status_counts,
                    "today": today_count,
                    "this_week": week_count,
                    "this_month": month_count,
                    "total": Application.objects.count(),
                },
                "users": {
                    "total": total_users,
                    "active": active_users,
                },
                "recent_activity": recent_activity,
            },
        })


# ---------------------------------------------------------------------------
# 19.1 — Admin User List
# ---------------------------------------------------------------------------


class AdminUserListView(APIView):
    """GET /api/v1/admin/users/ — paginated user listing.
    POST /api/v1/admin/users/ — create user with role assignment.

    Role filtering, search by name/email, include inactive option. Admin only.
    """

    permission_classes = [IsAuthenticated, IsAdmin]

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


class AdminUserDetailView(APIView):
    """GET/PATCH /api/v1/admin/users/{id}/

    Role updates, password resets, account deactivation with audit trail.
    Admin only.
    """

    permission_classes = [IsAuthenticated, IsAdmin]

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

        if "role" in data:
            changes["role"] = {"old": user.role, "new": data["role"]}
            user.role = data["role"]

        if "is_active" in data:
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
            ip = request.META.get("HTTP_X_FORWARDED_FOR", request.META.get("REMOTE_ADDR", ""))
            if "," in ip:
                ip = ip.split(",")[0].strip()
            AuditLog.objects.create(
                actor_id=actor_id,
                action="user_update",
                entity_type="profiles",
                entity_id=user.pk,
                changes=changes,
                ip_address=hashlib.sha256(ip.encode()).hexdigest(),
                user_agent=hashlib.sha256(
                    request.META.get("HTTP_USER_AGENT", "").encode()
                ).hexdigest(),
                retention_category="security",
            )

        return Response({"success": True, "data": AdminUserSerializer(user).data})


# ---------------------------------------------------------------------------
# 19.1 — Admin User Export (CSV)
# ---------------------------------------------------------------------------


class AdminUserExportView(APIView):
    """GET /api/v1/admin/users/export/

    CSV export with audit logging. Admin only.
    """

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
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
        writer.writerow(["ID", "Email", "First Name", "Last Name", "Role", "Active", "Created At"])

        for user in queryset.iterator():
            writer.writerow([
                str(user.id),
                user.email,
                user.first_name,
                user.last_name,
                user.role,
                user.is_active,
                user.created_at.isoformat() if user.created_at else "",
            ])

        # Audit log the export
        actor_id = getattr(request.user, "pk", None)
        ip = request.META.get("HTTP_X_FORWARDED_FOR", request.META.get("REMOTE_ADDR", ""))
        if "," in ip:
            ip = ip.split(",")[0].strip()
        AuditLog.objects.create(
            actor_id=actor_id,
            action="user_export",
            entity_type="profiles",
            changes={"filters": {"role": role, "include_inactive": include_inactive}},
            ip_address=hashlib.sha256(ip.encode()).hexdigest(),
            user_agent=hashlib.sha256(
                request.META.get("HTTP_USER_AGENT", "").encode()
            ).hexdigest(),
            retention_category="security",
        )

        return response


# ---------------------------------------------------------------------------
# 19.2 — System Settings CRUD
# ---------------------------------------------------------------------------


class AdminSettingsListView(APIView):
    """GET/POST /api/v1/admin/settings/

    Key-value store with category, description, public/private. Admin only.
    """

    permission_classes = [IsAuthenticated, IsAdmin]

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


class AdminSettingDetailView(APIView):
    """GET/PATCH/DELETE /api/v1/admin/settings/{id}/

    Admin only.
    """

    permission_classes = [IsAuthenticated, IsAdmin]

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

        serializer = SettingUpdateSerializer(data=request.data)
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
# 19.3 — Audit Log Query
# ---------------------------------------------------------------------------


class AdminAuditLogView(APIView):
    """GET /api/v1/admin/audit-logs/

    Filter by entity_type, action, actor, date range. Admin only. Paginated.
    """

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        queryset = AuditLog.objects.all().order_by("-created_at")

        entity_type = request.query_params.get("entity_type")
        if entity_type:
            queryset = queryset.filter(entity_type=entity_type)

        action = request.query_params.get("action")
        if action:
            queryset = queryset.filter(action=action)

        actor_id = request.query_params.get("actor_id")
        if actor_id:
            queryset = queryset.filter(actor_id=actor_id)

        date_from = request.query_params.get("date_from")
        if date_from:
            queryset = queryset.filter(created_at__gte=date_from)

        date_to = request.query_params.get("date_to")
        if date_to:
            queryset = queryset.filter(created_at__lte=date_to)

        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = AuditLogSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)
