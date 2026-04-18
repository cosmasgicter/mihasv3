"""Admin dashboard and user management views.

Implements tasks 19.1, 19.2, 19.3.
Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
"""

import csv
import hashlib
import logging
from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q
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
from apps.accounts.permissions import IsAdmin
from apps.accounts.services import hash_password
from apps.common.models import AuditLog, Setting
from apps.common.openapi_helpers import (
    ErrorResponseSerializer,
    MessageSerializer,
    envelope_serializer,
    paginated_serializer,
)
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
    key = serializers.CharField(max_length=100)
    value = serializers.JSONField()
    category = serializers.CharField(max_length=50, required=False, default="")
    description = serializers.CharField(required=False, default="")
    is_public = serializers.BooleanField(required=False, default=False)
    updated_by = serializers.UUIDField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)


class SettingUpdateSerializer(serializers.Serializer):
    value = serializers.JSONField(required=False)
    category = serializers.CharField(max_length=50, required=False)
    description = serializers.CharField(required=False)
    is_public = serializers.BooleanField(required=False)


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
    retention_category = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)


class AdminDashboardApplicationStatsSerializer(serializers.Serializer):
    by_status = serializers.JSONField()
    today = serializers.IntegerField()
    this_week = serializers.IntegerField()
    this_month = serializers.IntegerField()
    total = serializers.IntegerField()


class AdminDashboardUserStatsSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    active = serializers.IntegerField()


class AdminDashboardSerializer(serializers.Serializer):
    applications = AdminDashboardApplicationStatsSerializer()
    users = AdminDashboardUserStatsSerializer()
    recent_activity = AuditLogSerializer(many=True)


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

            # Period totals
            today_count = Application.objects.filter(created_at__gte=today_start).count()
            week_count = Application.objects.filter(created_at__gte=week_start).count()
            month_count = Application.objects.filter(created_at__gte=month_start).count()

            # Recent activity (status changes + payment completions)
            try:
                from apps.applications.models import ApplicationStatusHistory
                from apps.documents.models import Payment

                status_entries = (
                    ApplicationStatusHistory.objects
                    .select_related('application', 'changed_by')
                    .order_by('-created_at')[:10]
                )

                recent_activity = []
                for entry in status_entries:
                    app_number = getattr(entry.application, 'application_number', '') or ''
                    actor_name = ''
                    if entry.changed_by:
                        actor_name = f"{entry.changed_by.first_name} {entry.changed_by.last_name}".strip()

                    recent_activity.append({
                        'id': str(entry.id),
                        'type': 'status_change',
                        'application_number': app_number,
                        'old_status': entry.old_status or '',
                        'new_status': entry.new_status or '',
                        'timestamp': entry.created_at.isoformat() if entry.created_at else '',
                        'actor_name': actor_name,
                        'message': f"{app_number}: {entry.old_status or 'new'} → {entry.new_status or 'unknown'}",
                    })

                recent_payments = (
                    Payment.objects
                    .filter(status__in=['paid', 'successful', 'verified'])
                    .select_related('application')
                    .order_by('-updated_at')[:5]
                )

                for payment in recent_payments:
                    app_number = getattr(payment.application, 'application_number', '') or ''
                    recent_activity.append({
                        'id': str(payment.id),
                        'type': 'payment',
                        'application_number': app_number,
                        'old_status': '',
                        'new_status': payment.status,
                        'timestamp': payment.updated_at.isoformat() if payment.updated_at else '',
                        'actor_name': '',
                        'message': f"{app_number}: Payment {payment.status}",
                    })

                # Merge and sort by timestamp descending, limit to 10
                recent_activity.sort(key=lambda x: x['timestamp'], reverse=True)
                recent_activity = recent_activity[:10]
            except Exception:
                logger.warning("Failed to load recent activity for admin dashboard", exc_info=True)
                recent_activity = []

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
        except Exception as exc:
            logger.exception("Admin dashboard data load failed")
            return Response(
                {
                    "success": False,
                    "error": f"Dashboard data load failed: {exc.__class__.__name__}: {exc}",
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
            key = entry.get("key")
            if not key:
                errors.append("Missing key in entry")
                continue

            try:
                defaults = {
                    "value": entry.get("value", ""),
                    "description": entry.get("description", ""),
                    "category": entry.get("category", ""),
                    "is_public": entry.get("is_public", False),
                }
                Setting.objects.update_or_create(key=key, defaults=defaults)
                imported.append(key)
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
