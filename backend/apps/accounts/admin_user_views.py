"""Admin dashboard and user management views.

Implements tasks 19.1, 19.2, 19.3.
Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
"""

import csv
import logging
import re
from datetime import timedelta

from django.conf import settings
from django.db import DatabaseError, IntegrityError, transaction
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
from apps.common.scoped_cache import (
    build_scope_signature,
    cached_or_compute,
    invalidate_user,
)

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


def _scoped_user_ids(user):
    """Return the set of profile ids a non-super-admin actor may access (R5.2).

    Mirrors the membership-scope narrowing already used by ``AdminUserListView``:
    the actor sees users who hold an active membership in one of the actor's
    in-scope institutions, plus the actor's own profile. Super-admins get
    ``None`` (meaning "all users", no narrowing). The scope comes from
    ``AccessScopeService`` so authorization never depends on legacy strings
    (R5.8) and out-of-scope users are masked as a genuine not-found (R5.4,
    R16.4).
    """
    if is_super_admin(user):
        return None

    from apps.catalog.models import UserInstitutionMembership
    from apps.catalog.services import AccessScopeService

    filters = AccessScopeService().filters_for_user(user)
    scoped = set(
        str(uid)
        for uid in UserInstitutionMembership.objects.filter(
            institution_id__in=filters.institution_ids,
            is_active=True,
        ).values_list("user_id", flat=True)
    )
    own_id = str(getattr(user, "id", "") or getattr(user, "pk", ""))
    if own_id:
        scoped.add(own_id)
    return scoped


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

CAPABILITY_PAYLOAD_KEYS = frozenset(
    {"role", "is_super_admin", "all_access", "capabilities", "institutions"}
)
CAPABILITY_INSTITUTION_PAYLOAD_KEYS = frozenset({"id", "code", "name", "capabilities"})


def _build_capability_payload(user):
    """Build the Capability_Endpoint payload for ``user`` (R2.1, R2.2, R2.3).

    Single source of truth for both ``GET /api/v1/admin/scope/`` (extended,
    backward compatible) and the ``GET /api/v1/admin/capabilities/`` alias. The
    payload always carries ``role``, ``is_super_admin``, ``all_access``, a
    platform-level ``capabilities`` list, and an ``institutions`` list where each
    entry adds its ``id``, ``code``, ``name``, and per-institution ``capabilities``
    list. Authority is resolved through the centralized
    ``AdminCapabilityService`` (R1.5) — never raw role strings here — and all
    frozensets are converted to sorted lists for stable JSON serialization.

    Raises ``CapabilityResolutionError`` on a scope/dependency failure so callers
    fail closed (R1.6).
    """
    from apps.catalog.services import AdminCapabilityService

    service = AdminCapabilityService()
    capability_set = service.get_capabilities(user)
    institutions = service.visible_institution_queryset(user).order_by("name")

    # A Super_Admin's platform authority subsumes every tenant capability, so
    # each in-scope institution exposes the full ``tenant.*`` catalogue (R2.2);
    # a non-super-admin exposes only the per-institution set it actually holds
    # (R2.3), empty for any institution outside its scope.
    super_admin_tenant_caps = (
        sorted(AdminCapabilityService.TENANT_CAPABILITIES)
        if capability_set.is_super_admin
        else None
    )

    institution_data = []
    for inst in institutions:
        if super_admin_tenant_caps is not None:
            inst_caps = super_admin_tenant_caps
        else:
            inst_caps = sorted(
                capability_set.institution_capabilities.get(str(inst.id), frozenset())
            )
        institution_data.append(
            {
                "id": str(inst.id),
                "code": inst.code,
                "name": inst.brand_name or inst.name,
                "capabilities": inst_caps,
            }
        )

    return {
        "role": capability_set.role or getattr(user, "role", None),
        "is_super_admin": capability_set.is_super_admin,
        "all_access": capability_set.all_access,
        "capabilities": sorted(capability_set.platform_capabilities),
        "institutions": institution_data,
    }


def _capability_resolution_denied():
    """Fail-closed authorization response when capabilities cannot resolve (R1.6)."""
    return Response(
        {
            "success": False,
            "error": "Your capabilities could not be resolved; the action is denied.",
            "code": "CAPABILITY_RESOLUTION_FAILED",
        },
        status=status.HTTP_403_FORBIDDEN,
    )


def _resolve_capability_payload(user):
    """Return the capability/scope payload for ``user``, cached fail-closed (R5).

    Shared resolver for both ``GET /api/v1/admin/scope/`` and
    ``GET /api/v1/admin/capabilities/``. Wraps the single source of truth
    ``_build_capability_payload`` in the per-user
    :func:`~apps.common.scoped_cache.cached_or_compute` (namespace ``"cap"``,
    scope signature ``str(user.pk)``, ``ttl=60`` per R5.2), gated by the
    ``PERF_CACHE_CAPABILITIES`` flag (default ``False`` so the pre-feature path
    is unchanged until the flag is flipped — R5.1, R5.2).

    Fail-closed authority (R5.3): a ``CapabilityResolutionError`` is caught so
    the wrapper never stores it; any existing entry for the user is dropped via
    :func:`~apps.common.scoped_cache.invalidate_user`, and the error is
    re-raised so the view returns the existing fail-closed authorization
    response (zero capabilities, no tenant data). Because ``cached_or_compute``
    only stores the value after ``compute()`` returns successfully, a raised
    error is never cached.
    """
    from apps.catalog.services import CapabilityResolutionError

    enabled = getattr(settings, "PERF_CACHE_CAPABILITIES", False)

    def compute():
        return _build_capability_payload(user)

    try:
        return cached_or_compute(
            "cap", str(user.pk), compute, ttl=60, enabled=enabled
        )
    except CapabilityResolutionError:
        # Never store/serve a failed resolution; drop any existing entry and
        # let the caller render the fail-closed authorization error (R5.3).
        invalidate_user("cap", user.pk)
        raise


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_dashboard_retrieve",
        tags=["admin"],
        responses={200: OpenApiResponse(response=AdminDashboardResponseSerializer)},
    )
)
class AdminScopeView(APIView):
    """GET /api/v1/admin/scope/ — the actor's tenant access scope + capabilities.

    Returns the admin's role, whether they have all-institution access, and the
    concrete institutions they may act on. Drives the frontend multi-tenant UX:
    a scoped school admin (``all_access=false`` with one institution) is
    auto-locked to it with no switcher; a super-admin (``all_access=true``) gets
    the full institution list to power an institution switcher/filter.

    Extended for the Capability_Endpoint (R2.1): the response additionally
    carries ``is_super_admin``, a platform-level ``capabilities`` list, and a
    per-institution ``capabilities`` list on each institution entry, while
    keeping the existing ``role``, ``all_access``, and ``institutions[{id, code,
    name}]`` keys for backward compatibility. Capabilities resolve through the
    centralized ``AdminCapabilityService`` so authority never depends on legacy
    role-string assumptions (R1.5).
    """

    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(
        operation_id="admin_scope",
        tags=["admin"],
        request=None,
        responses={200: OpenApiResponse(response=OpenApiTypes.OBJECT)},
    )
    def get(self, request):
        from apps.catalog.services import CapabilityResolutionError

        try:
            data = _resolve_capability_payload(request.user)
        except CapabilityResolutionError:
            return _capability_resolution_denied()

        return Response({"success": True, "data": data})


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_capabilities",
        tags=["admin"],
        request=None,
        responses={200: OpenApiResponse(response=OpenApiTypes.OBJECT)},
    )
)
class AdminCapabilitiesView(APIView):
    """GET /api/v1/admin/capabilities/ — the actor's full Capability_Set (R2.1).

    Sibling alias of ``AdminScopeView`` returning the same Capability_Endpoint
    payload inside the ``{"success": true, "data": ...}`` envelope (R2.4): the
    actor's ``role``, ``is_super_admin`` flag, ``all_access`` flag, platform-level
    ``capabilities`` list (full ``platform.*`` set for a Super_Admin per R2.2,
    empty otherwise), and an ``institutions`` list where each entry includes its
    ``id``, ``code``, ``name``, and per-institution ``tenant.*`` ``capabilities``
    list (R2.3). Resolves through the centralized ``AdminCapabilityService`` and
    fails closed when capabilities cannot be resolved (R1.6).
    """

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        from apps.catalog.services import CapabilityResolutionError

        try:
            data = _resolve_capability_payload(request.user)
        except CapabilityResolutionError:
            return _capability_resolution_denied()

        return Response({"success": True, "data": data})


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

            # Super-admin institution filter: a super-admin may narrow the
            # platform-wide dashboard to a single school via ?institution_id=
            # (powers the frontend institution switcher). Scoped admins are
            # already narrowed by membership above and ignore this param.
            # ``request.GET`` works for both DRF Request and a raw WSGIRequest.
            query_params = getattr(request, "query_params", None) or request.GET
            institution_filter = query_params.get("institution_id")
            if caller_is_super_admin and institution_filter:
                app_queryset = app_queryset.filter(institution_ref_id=institution_filter)

            # R2(b): the full Dashboard_Aggregate payload is wrapped in the
            # shared scoped cache. The scope_signature embeds the requester's
            # user scope + role + in-scope institutions (via
            # build_scope_signature) and the super-admin selected-tenant filter
            # (institution_filter), so two distinct Tenant_Scope_Keys never
            # share an entry and a key mismatch recomputes scoped to the
            # requester rather than serving cross-tenant values (R2.2, R2.7,
            # R13.3, R13.4). A hit within the 30-60s TTL (45s, R2.3) returns the
            # payload without issuing any count/aggregate query (R2.1). The
            # wrapper computes-on-miss and computes-on-cache-error, so a backend
            # outage degrades to direct DB computation with no cache error
            # surfaced (R2.8). Gated by PERF_CACHE_DASHBOARD (default False), so
            # the pre-feature path is unchanged until the flag is flipped.
            #
            # The scope_signature is itself DB-backed (it resolves the caller's
            # in-scope institutions). cached_or_compute ignores the signature
            # entirely when ``enabled`` is False, so only compute it when the
            # cache is on — otherwise the flag-off path would issue an extra
            # query that the pre-feature code never did (flag-off-bypass, R2.3).
            dashboard_cache_enabled = getattr(settings, "PERF_CACHE_DASHBOARD", False)
            scope_signature = (
                build_scope_signature(
                    request.user, institution_filter=institution_filter
                )
                if dashboard_cache_enabled
                else ""
            )

            def compute():
                # Application counts by status. ``status`` is a free-form CharField
                # with no fixed choice set, so a single GROUP BY query is the only
                # faithful way to reproduce the dynamic ``by_status`` keys exactly
                # (a fixed list of conditional counts would drop unexpected status
                # values and inject zero-count keys, diverging from prior output).
                status_counts = dict(
                    app_queryset.values_list("status")
                    .annotate(count=Count("id"))
                    .values_list("status", "count")
                )

                # All scalar application aggregates (grand total + the today/week/
                # month time buckets) are collapsed into a single conditional-count
                # aggregate query using Count("id", filter=Q(...)) over the already-
                # scoped queryset and the existing activity_at = Coalesce(
                # submitted_at, updated_at, created_at) annotation. This replaces the
                # six separate .count() round-trips and produces values identical to
                # the prior field-by-field counts (R2.5, R2.6).
                application_aggregates = app_queryset.annotate(
                    activity_at=Coalesce("submitted_at", "updated_at", "created_at")
                ).aggregate(
                    total=Count("id"),
                    today_created=Count("id", filter=Q(created_at__gte=today_start)),
                    today_submitted=Count("id", filter=Q(submitted_at__gte=today_start)),
                    today_activity=Count("id", filter=Q(activity_at__gte=today_start)),
                    this_week=Count("id", filter=Q(activity_at__gte=week_start)),
                    this_month=Count("id", filter=Q(activity_at__gte=month_start)),
                )
                total_applications = application_aggregates["total"]
                today_created_count = application_aggregates["today_created"]
                today_submitted_count = application_aggregates["today_submitted"]
                today_count = application_aggregates["today_activity"]
                week_count = application_aggregates["this_week"]
                month_count = application_aggregates["this_month"]

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
                # Total + active users collapse into a single conditional-count
                # aggregate query (one round-trip instead of two .count() calls),
                # producing values identical to the prior field-by-field counts.
                # Together with the status GROUP BY and the application conditional-
                # count aggregate, this keeps the dashboard's scalar aggregate
                # queries at three (R2.5, R2.6).
                user_aggregates = user_queryset.aggregate(
                    total=Count("id"),
                    active=Count("id", filter=Q(is_active=True)),
                )
                total_users = user_aggregates["total"]
                active_users = user_aggregates["active"]

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

                return {
                    "no_school_access": no_school_access,
                    "applications": {
                        "by_status": status_counts,
                        "today": today_count,
                        "today_activity": today_count,
                        "today_created": today_created_count,
                        "today_submitted": today_submitted_count,
                        "this_week": week_count,
                        "this_month": month_count,
                        "total": total_applications,
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
                }

            data = cached_or_compute(
                "dash",
                scope_signature,
                compute,
                ttl=45,
                enabled=dashboard_cache_enabled,
            )

            return Response({
                "success": True,
                "data": data,
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
        """Create a new user with role assignment (admin registration / staff invite).

        Two shapes share this endpoint:

        * **Global/platform user** — no ``institution_id`` in the payload. Only a
          Super_Admin may create an unscoped ``super_admin`` or global ``admin``
          (R6.1, R6.2); a non-super-admin is confined to non-privileged roles
          here.
        * **Tenant staff invite** — an ``institution_id`` is supplied. A
          non-super-admin must hold ``tenant.staff.invite`` for that institution
          and the assignable ``role`` must sit at or below their own authority,
          decided centrally by ``AdminCapabilityService.can_invite_staff`` (R6.3,
          R6.4) — an out-of-scope institution resolves to no capability, so a
          cross-tenant invite is impossible (R6.8). The user, profile, and
          ``UserInstitutionMembership`` are created inside one
          ``transaction.atomic()`` block, so a membership failure rolls back the
          user and profile and surfaces ``STAFF_CREATION_FAILED`` (R6.5, R6.6).
        """
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
        requested_role = data["role"]
        institution_id = str(request.data.get("institution_id") or "").strip() or None
        actor_is_super = is_super_admin(request.user)

        # Privilege escalation guard: actor cannot create users with a higher role
        actor_role = getattr(request.user, "role", "student")
        actor_level = _role_level(actor_role)
        requested_level = _role_level(requested_role)
        if requested_level > actor_level:
            return Response(
                {"success": False, "error": "You cannot create a user with a higher role than your own.", "code": "PRIVILEGE_ESCALATION"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not actor_is_super:
            if institution_id is None:
                # R6.1/R6.2: only a Super_Admin may mint an unscoped global
                # platform admin (or super-admin). A non-super-admin creating a
                # privileged role without an institution binding is rejected;
                # scoped staff must instead be invited with an ``institution_id``.
                if requested_role in {"admin", "super_admin"}:
                    return Response(
                        {
                            "success": False,
                            "error": "Only a super admin can create a global platform admin.",
                            "code": "PRIVILEGE_ESCALATION",
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )
            else:
                # R6.3/R6.4/R6.8: invite scope + role ceiling + cross-tenant block,
                # resolved centrally (never raw role strings here).
                from apps.catalog.services import AdminCapabilityService

                if not AdminCapabilityService().can_invite_staff(
                    request.user, institution_id, requested_role
                ):
                    return Response(
                        {
                            "success": False,
                            "error": "You cannot invite a user with that role into that institution.",
                            "code": "STAFF_INVITE_FORBIDDEN",
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )

        if Profile.objects.filter(email__iexact=data["email"]).exists():
            return Response(
                {"success": False, "error": "Email already exists", "code": "DUPLICATE_EMAIL"},
                status=status.HTTP_409_CONFLICT,
            )

        # R6.5/R6.6: user + profile + membership are one atomic unit. If the
        # membership write fails, the surrounding ``atomic`` block rolls the
        # profile back so no orphaned user/profile row survives a partial invite.
        try:
            with transaction.atomic():
                profile = Profile.objects.create(
                    email=data["email"],
                    password_hash=hash_password(data["password"]),
                    first_name=data["first_name"],
                    last_name=data["last_name"],
                    phone=data.get("phone", ""),
                    nationality=data.get("nationality", "Zambian"),
                    role=requested_role,
                    is_active=True,
                )
                if institution_id is not None:
                    from apps.catalog.models import UserInstitutionMembership

                    UserInstitutionMembership.objects.create(
                        user_id=profile.id,
                        institution_id=institution_id,
                        role=requested_role,
                        is_active=True,
                        created_at=timezone.now(),
                        created_by_id=getattr(request.user, "id", None),
                    )
        except (IntegrityError, DatabaseError):
            logger.warning("Staff creation rolled back on membership failure", exc_info=True)
            return Response(
                {
                    "success": False,
                    "error": "Staff account could not be created. No changes were saved.",
                    "code": "STAFF_CREATION_FAILED",
                },
                status=status.HTTP_400_BAD_REQUEST,
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
        # R5.2/R5.4: a scoped admin may only read users within their membership
        # scope; an out-of-scope target is masked as a genuine not-found.
        scoped_ids = _scoped_user_ids(request.user)
        if scoped_ids is not None and str(user.pk) not in scoped_ids:
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

        # RBAC role-escalation guards (global safety property, report 403)
        # MUST precede the tenant scope mask. Check both the target role and
        # any requested role here so a privilege-escalation attempt is rejected
        # with 403 regardless of tenant scope.
        if target_level > actor_level:
            return Response(
                {
                    "success": False,
                    "error": "You cannot modify a user with a higher role than your own.",
                    "code": "INSUFFICIENT_PRIVILEGES",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if "role" in data and _role_level(data["role"]) > actor_level:
            return Response(
                {
                    "success": False,
                    "error": "You cannot assign a role higher than your own.",
                    "code": "INSUFFICIENT_PRIVILEGES",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Actor-invariant guard (no tenant scope needed): an admin can never
        # deactivate their OWN account, regardless of institution scope. This
        # runs before the scope query below so it holds even for an actor with
        # no membership rows, and so self-deactivation is rejected with a clear
        # 400 rather than being masked as a 404 by the scope check.
        if (
            "is_active" in data
            and not data["is_active"]
            and str(getattr(request.user, "pk", "")) == str(user.pk)
        ):
            return Response(
                {
                    "success": False,
                    "error": "You cannot deactivate your own account.",
                    "code": "SELF_DEACTIVATION_FORBIDDEN",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # R5.2/R5.4: after the RBAC role-escalation guards, a scoped admin may
        # only mutate users within their institution membership scope. An
        # out-of-scope target is masked as a genuine not-found before any field
        # change or write so existence cannot be inferred (R16.4). Super-admins
        # are unscoped.
        scoped_ids = _scoped_user_ids(request.user)
        if scoped_ids is not None and str(user.pk) not in scoped_ids:
            return Response(
                {"success": False, "error": "User not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

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

        # R5.2: narrow the export row set to the actor's membership scope for
        # non-super-admins (parity with AdminUserListView). PII is additionally
        # redacted below, but the row set itself must not leak other schools.
        scoped_ids = _scoped_user_ids(request.user)
        if scoped_ids is not None:
            queryset = queryset.filter(Q(id__in=scoped_ids) | Q(id=request.user.id))

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
