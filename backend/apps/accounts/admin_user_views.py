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

# Stream 9 decomposition: shared serializers + helpers live in admin_serializers.
from apps.accounts.admin_serializers import (  # noqa: F401
    AdminDashboardActivitySerializer,
    AdminDashboardApplicationStatsSerializer,
    AdminDashboardNeedsAttentionSerializer,
    AdminDashboardResponseSerializer,
    AdminDashboardSerializer,
    AdminDashboardUserStatsSerializer,
    AdminMessageResponseSerializer,
    AdminUserCreateSerializer,
    AdminUserListResponseSerializer,
    AdminUserResponseSerializer,
    AdminUserSerializer,
    AdminUserUpdateSerializer,
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
# 19.1 - Admin Dashboard
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
            from apps.catalog.models import UserInstitutionMembership
            from apps.catalog.services import AccessScopeService

            scope_service = AccessScopeService()
            app_queryset = Application.objects.all()
            caller_is_super_admin = is_super_admin(request.user)
            # R4.6: a no-scope (no membership/grant) non-super-admin must see an
            # explicit "no school access assigned" signal, not bare zeros that
            # could be misread as platform-wide totals. Every aggregate below is
            # already computed over the scoped queryset, so the counts are a
            # correct zero for an empty scope; this flag lets the frontend
            # distinguish that empty-scope case from "zero rows in my school".
            no_school_access = False
            if not caller_is_super_admin:
                no_school_access = scope_service.filters_for_user(request.user).has_no_scope
                app_queryset = scope_service.filter_applications(app_queryset, request.user)

            # Application counts by status
            status_counts = dict(
                app_queryset.values_list("status")
                .annotate(count=Count("id"))
                .values_list("status", "count")
            )

            activity_queryset = app_queryset.annotate(
                activity_at=Coalesce("submitted_at", "updated_at", "created_at")
            )
            today_created_count = app_queryset.filter(created_at__gte=today_start).count()
            today_submitted_count = app_queryset.filter(submitted_at__gte=today_start).count()
            today_count = activity_queryset.filter(activity_at__gte=today_start).count()
            week_count = activity_queryset.filter(activity_at__gte=week_start).count()
            month_count = activity_queryset.filter(activity_at__gte=month_start).count()

            # Recent activity (status changes + payment completions)
            try:
                from apps.applications.models import ApplicationStatusHistory
                from apps.documents.models import Payment
                from apps.documents.payment_constants import RECEIPT_ELIGIBLE_STATUSES

                status_entries_queryset = ApplicationStatusHistory.objects.select_related('application', 'changed_by')
                recent_payments_queryset = Payment.objects.filter(status__in=RECEIPT_ELIGIBLE_STATUSES)
                if not is_super_admin(request.user):
                    scoped_app_ids = app_queryset.values_list("id", flat=True)
                    status_entries_queryset = status_entries_queryset.filter(application_id__in=scoped_app_ids)
                    recent_payments_queryset = scope_service.filter_payments(recent_payments_queryset, request.user)

                status_entries = (
                    status_entries_queryset
                    .order_by('-created_at')[:10]
                )

                recent_payments = (
                    recent_payments_queryset
                    .select_related('application')
                    .order_by('-updated_at')[:5]
                )

                recent_activity = self._format_recent_activity(status_entries, recent_payments)
            except Exception:
                logger.warning("Failed to load recent activity for admin dashboard", exc_info=True)
                recent_activity = []

            # Total users
            user_queryset = Profile.objects.all()
            if not is_super_admin(request.user):
                filters = scope_service.filters_for_user(request.user)
                scoped_user_ids = UserInstitutionMembership.objects.filter(
                    institution_id__in=filters.institution_ids,
                    is_active=True,
                ).values_list("user_id", flat=True)
                user_queryset = user_queryset.filter(Q(id__in=scoped_user_ids) | Q(id=request.user.id))
            total_users = user_queryset.count()
            active_users = user_queryset.filter(is_active=True).count()

            # Needs attention counts
            try:
                from apps.documents.models import ApplicationDocument, Payment
                from apps.applications.models import ApplicationInterview

                pending_payments_queryset = Payment.objects.filter(
                    status__in=['pending', 'initiated']
                )
                if not is_super_admin(request.user):
                    pending_payments_queryset = scope_service.filter_payments(pending_payments_queryset, request.user)
                pending_payments = pending_payments_queryset.count()

                pending_documents_queryset = ApplicationDocument.objects.filter(
                    verification_status__in=[None, '', 'pending', 'uploaded']
                )
                if not is_super_admin(request.user):
                    pending_documents_queryset = scope_service.filter_documents(pending_documents_queryset, request.user)
                pending_documents = pending_documents_queryset.count()

                upcoming_interviews_queryset = ApplicationInterview.objects.filter(
                    scheduled_at__gte=now,
                    status__in=['scheduled', 'pending'],
                )
                if not is_super_admin(request.user):
                    upcoming_interviews_queryset = upcoming_interviews_queryset.filter(application_id__in=app_queryset.values_list("id", flat=True))
                upcoming_interviews = upcoming_interviews_queryset.count()
            except Exception:
                logger.warning("Failed to load needs-attention counts", exc_info=True)
                pending_payments = 0
                pending_documents = 0
                upcoming_interviews = 0

            return Response({
                "success": True,
                "data": {
                    "no_school_access": no_school_access,
                    "applications": {
                        "by_status": status_counts,
                        "today": today_count,
                        "today_activity": today_count,
                        "today_created": today_created_count,
                        "today_submitted": today_submitted_count,
                        "this_week": week_count,
                        "this_month": month_count,
                        "total": app_queryset.count(),
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
# 19.1 - Admin User List
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
    """GET /api/v1/admin/users/ - paginated user listing.
    POST /api/v1/admin/users/ - create user with role assignment.

    Role filtering, search by name/email, include inactive option. Admin only.
    """

    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = AdminUserSerializer

    def get(self, request):
        queryset = Profile.objects.all().order_by("-created_at")
        if not is_super_admin(request.user):
            from apps.catalog.models import UserInstitutionMembership
            from apps.catalog.services import AccessScopeService

            filters = AccessScopeService().filters_for_user(request.user)
            scoped_user_ids = UserInstitutionMembership.objects.filter(
                institution_id__in=filters.institution_ids,
                is_active=True,
            ).values_list("user_id", flat=True)
            queryset = queryset.filter(Q(id__in=scoped_user_ids) | Q(id=request.user.id))

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
# 19.1 - Admin User Detail (GET/PATCH)
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
# 19.1 - Admin User Export (CSV)
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
        full_export = is_super_admin(request.user)
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
