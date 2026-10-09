"""Admin dashboard and user management views.

Implements tasks 19.1, 19.2, 19.3.
Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
"""

import logging
import re

from django.conf import settings
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
from apps.accounts.permissions import ROLE_HIERARCHY, is_super_admin
from apps.common.openapi_helpers import ErrorResponseSerializer
from apps.catalog.permissions import HasPlatformCapability, HasTenantCapability
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

    This is a **self-description** surface: everything it returns is a statement
    about the caller's own authority, and for an unassigned staff actor it is
    ``capabilities: []`` / ``institutions: []`` — no tenant identifier, name,
    count or attribute. So ``capability_self_description`` opts it out of the
    masked-404 the tenant *data* surfaces use for a no-scope caller, and an
    unassigned reviewer/admin is answered with its empty set (R2.1's "every
    actor that can reach the endpoint"). A Student is still masked. Restored by
    13.6 remediation M3; the reasoning lives in
    ``apps.common.tenant_authorization``.
    """

    permission_classes = [IsAuthenticated, HasTenantCapability]
    capability_self_description = True

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

    Like ``AdminScopeView`` this is a **self-description** surface, so
    ``capability_self_description`` opts it out of the tenant-data masked 404 for
    an unassigned staff actor: this endpoint is what the frontend's "No school
    access assigned" state is derived from, and a refusal cannot carry that
    statement. A Student is still masked. See ``AdminScopeView`` and
    ``apps.common.tenant_authorization`` (13.6 remediation M3).
    """

    permission_classes = [IsAuthenticated, HasTenantCapability]
    capability_self_description = True

    def get(self, request):
        from apps.catalog.services import CapabilityResolutionError

        try:
            data = _resolve_capability_payload(request.user)
        except CapabilityResolutionError:
            return _capability_resolution_denied()

        return Response({"success": True, "data": data})


class AdminDashboardView(APIView):
    """GET /api/v1/admin/dashboard/ — the truthful admin dashboard (task 9.2).

    Requirements **R8.6** / **R17.3-R17.6**; findings **ADM-02** (missing metrics
    synthesized as healthy zeros, scoped polling losing institution scope,
    enabled accounts labelled online users) and **MAINT-02** (misleading labels).

    Every number is computed by :class:`~apps.accounts.dashboard_metrics.DashboardMetricsService`
    over the roster's own scoped queryset, carries the sentence stating what it
    counts, and is either ``ok`` with an integer or ``unknown`` with ``None``.
    There is no zero-valued fallback and no default health grade: the three
    counters this view used to omit entirely (overdue reviews, condition and
    enrollment deadline pressure) are real counters now, and a source that fails
    marks its own metrics unknown instead of returning reassuring zeros.

    The legacy ``applications`` / ``users`` / ``needs_attention`` blocks are kept
    for existing consumers, but a key whose source failed is **omitted** rather
    than written as ``0`` — an absent key is a question the payload declines to
    answer, where a zero is a wrong answer.

    ``?institution_id=`` narrows the dashboard to one school. It is resolved
    through the roster's scope-before-lookup resolver, so an out-of-scope or
    unknown id is the same masked 404 the roster returns rather than a 200 whose
    zeros would confirm the id resolves.
    """

    permission_classes = [IsAuthenticated, HasTenantCapability]
    serializer_class = AdminDashboardSerializer
    required_capability = "tenant.application.read"
    audit_resource_type = "dashboard"

    @staticmethod
    def _format_recent_activity(status_entries, recent_payments):
        """Preserved entry point; the implementation lives with the metrics."""
        from apps.accounts.dashboard_metrics import format_recent_activity

        return format_recent_activity(status_entries, recent_payments)

    @staticmethod
    def _legacy_blocks(metrics, windows):
        """The pre-9.2 payload shape, populated only where a metric answered.

        Keys whose metric is ``unknown`` are left out. That is the point: the
        frontend reads ``metrics`` as the authority and an older consumer sees a
        missing key rather than a fabricated zero.
        """

        def value(key):
            entry = metrics.get(key) or {}
            return entry.get("value") if entry.get("state") == "ok" else None

        def put(target, key, metric_key):
            resolved = value(metric_key)
            if resolved is not None:
                target[key] = resolved

        applications: dict = {}
        put(applications, "total", "total_applications")
        put(applications, "today", "today_activity")
        put(applications, "today_activity", "today_activity")
        put(applications, "this_week", "applications_this_week")
        put(applications, "this_month", "applications_this_month")
        if windows.get("by_status") is not None:
            applications["by_status"] = windows["by_status"]

        users: dict = {}
        put(users, "total", "staff_accounts_total")
        # Renamed in the payload's own vocabulary (MAINT-02): this counts
        # accounts permitted to sign in, and never claimed to count presence.
        put(users, "enabled", "staff_accounts_enabled")

        needs_attention: dict = {}
        put(needs_attention, "pending_documents", "pending_documents")
        put(needs_attention, "payment_review", "payment_review")
        put(needs_attention, "upcoming_interviews", "upcoming_interviews")
        put(needs_attention, "overdue_reviews", "overdue_reviews")
        put(needs_attention, "deadline_pressure", "deadline_pressure")
        return applications, users, needs_attention

    def get(self, request):
        from apps.accounts.dashboard_metrics import DashboardMetricsService
        from apps.applications.query_service import ApplicationScopeDenied

        service = DashboardMetricsService()

        # ``request.GET`` works for both a DRF Request and a raw WSGIRequest.
        query_params = getattr(request, "query_params", None) or request.GET
        requested_institution = query_params.get("institution_id")

        # Scope before lookup (R3.2): the requested school is resolved against
        # the actor's own scope *before* it reaches any query, so an out-of-scope
        # id cannot be confirmed to exist by a differently-shaped 200.
        try:
            institution_filter = service.resolve_institution_filter(
                request.user, requested_institution
            )
        except ApplicationScopeDenied as exc:
            from apps.catalog.tenant_audit_service import TenantAuditService

            try:
                TenantAuditService.record_scope_denied(
                    resource_type="dashboard.institution",
                    resource_id=exc.resource_id,
                    actor_id=getattr(request.user, "id", None),
                    actor_role=getattr(request.user, "role", None),
                    request=request,
                )
            except Exception:  # pragma: no cover - audit must never block a read
                # Swallowing is correct — an audit-write failure must never turn
                # a masked 404 into a 500 — but swallowing *silently* is not.
                # This is the one audit swallow in the accounts views that had no
                # log line, so a lost `scope.denied` event left no trace at all,
                # which is the opposite of what a cross-tenant-probing detector
                # is for. Matches the sibling swallows in
                # ``user_directory_views.py`` (13.6 remediation M3).
                logger.warning(
                    "Failed to audit masked dashboard institution lookup",
                    exc_info=True,
                )
            return Response(
                {"success": False, "error": "Not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # The scoped cache wraps the whole payload. The scope_signature embeds the
        # requester's scope + role + in-scope institutions and the selected-school
        # filter, so two Tenant_Scope_Keys never share an entry (R2.2, R2.7).
        # Gated by PERF_CACHE_DASHBOARD; when off, nothing touches the cache.
        dashboard_cache_enabled = getattr(settings, "PERF_CACHE_DASHBOARD", False)
        scope_signature = (
            build_scope_signature(request.user, institution_filter=institution_filter)
            if dashboard_cache_enabled
            else ""
        )

        def compute():
            payload = service.build(request.user, institution_id=institution_filter)
            applications, users, needs_attention = self._legacy_blocks(
                payload["metrics"], payload.get("windows") or {}
            )
            return {
                **payload,
                "applications": applications,
                "users": users,
                "needs_attention": needs_attention,
            }

        try:
            data = cached_or_compute(
                "dash",
                scope_signature,
                compute,
                ttl=45,
                enabled=dashboard_cache_enabled,
            )
        except Exception:
            # A failure here is a failure of the *whole* read, not of one source,
            # so it is reported as an error rather than as an empty dashboard.
            logger.exception("Admin dashboard data load failed")
            return Response(
                {
                    "success": False,
                    "error": "Dashboard data load failed. Please try again later.",
                    "code": "DASHBOARD_ERROR",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"success": True, "data": data})




# ---------------------------------------------------------------------------
# Admin User Effective Capabilities (read-only) — R3.7 / design §5.3
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_user_effective_capabilities",
        tags=["admin"],
        parameters=[
            OpenApiParameter("pk", OpenApiTypes.UUID, OpenApiParameter.PATH, description="User UUID."),
        ],
        request=None,
        responses={
            200: OpenApiResponse(response=OpenApiTypes.OBJECT),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class AdminUserEffectiveCapabilitiesView(APIView):
    """GET /api/v1/admin/users/{id}/effective-capabilities/ (R3.7, design §5.3).

    Returns the *target* user's backend-derived Effective_Capabilities as
    read-only data for the user detail surface. This is a projection, not a
    mutation: the fake permission editor is gone, and platform role, membership,
    and access grants are the only authority mutations (managed through their
    own canonical commands). The payload mirrors the Capability_Endpoint shape
    (``role``, ``is_super_admin``, ``all_access``, ``capabilities``,
    ``institutions[]``) so the frontend can render the same capability model it
    already understands, plus a ``read_only`` marker.

    Authority is resolved through the centralized ``AdminCapabilityService`` for
    the target user — never a role-string assumption. Requires
    ``platform.user.manage_all`` (same authority as viewing the user detail),
    and a scoped admin may only inspect users within their membership scope; an
    out-of-scope target is masked as a genuine not-found (R5.4). Fails closed:
    if the target's capabilities cannot be resolved, a zero-authority set is
    returned with ``resolution_error=true`` rather than guessing authority (R1.6).
    """

    permission_classes = [IsAuthenticated, HasPlatformCapability]
    required_capability = "platform.user.manage_all"

    def get(self, request, pk):
        from apps.catalog.services import CapabilityResolutionError

        try:
            target = Profile.objects.get(pk=pk)
        except Profile.DoesNotExist:
            return Response(
                {"success": False, "error": "User not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # R5.2/R5.4: a scoped admin may only inspect users within their
        # membership scope; an out-of-scope target is masked as not-found so
        # existence cannot be inferred.
        scoped_ids = _scoped_user_ids(request.user)
        if scoped_ids is not None and str(target.pk) not in scoped_ids:
            return Response(
                {"success": False, "error": "User not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            data = _build_capability_payload(target)
        except CapabilityResolutionError:
            # Fail closed: show zero authority rather than guessing (R1.6).
            data = {
                "role": getattr(target, "role", None),
                "is_super_admin": False,
                "all_access": False,
                "capabilities": [],
                "institutions": [],
                "resolution_error": True,
            }

        data["read_only"] = True
        return Response({"success": True, "data": data})




# ---------------------------------------------------------------------------
# User directory — moved to user_directory_views (task 9.3)
# ---------------------------------------------------------------------------
#
# ``AdminUserListView`` / ``AdminUserDetailView`` / ``AdminUserExportView`` were
# rewritten by task 9.3 and now live in
# :mod:`apps.accounts.user_directory_views` alongside the bulk command and the
# previewed import, because they are one contract:
# :class:`~apps.accounts.user_directory_service.UserDirectoryQueryService` owns
# the scope, the filters, the sort, the page, the facets, the aggregates, the
# redaction, and the export, and splitting the views away from it is how the
# browser ended up owning half of them (ADM-03).
#
# They are re-exported here so ``apps.accounts.admin_views`` and every existing
# import keep working.
from apps.accounts.user_directory_views import (  # noqa: E402,F401
    AdminUserBatchImportView,
    AdminUserBulkView,
    AdminUserDetailView,
    AdminUserExportView,
    AdminUserImportPreviewView,
    AdminUserListView,
)
