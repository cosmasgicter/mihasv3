"""Tenant observability / audit admin views (R13.2, R13.5, R6.6).

Two feeds, deliberately separate:

* ``GET /api/v1/admin/tenant-audit/`` — the **platform** operational-review feed
  spanning every school, gated by ``platform.audit.read_all``.
* ``GET /api/v1/admin/institutions/<id>/audit/`` — the **selected institution**
  feed: scoped before lookup, ``tenant.audit.read``-gated for that institution,
  filtered/paginated in SQL with server facets and a page-independent audited
  CSV export (task 9.5, finding ADM-05).

Split out of ``admin_views.py`` by task 12.1; both views are the ones that were
there, lifted verbatim.
"""

from __future__ import annotations

from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, OpenApiTypes, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.catalog._admin_view_helpers import (
    _forbidden_write_response,
    _paginate,
    _write_allowed,
)
from apps.catalog.admin_serializers import TenantAuditLogSerializer
from apps.catalog.tenant_audit_service import (
    OBSERVABILITY_CONFIG_PREFIX,
    OBSERVABILITY_ROUTING_FAILURE_ACTION,
    TenantAuditService,
)
from apps.common.models import AuditLog
from apps.common.openapi_helpers import ErrorResponseSerializer
from apps.common.pagination import StandardPagination

#: The capability the tenant audit export requires (task 9.5, R6.5/R6.6). Read
#: from the audit query authority so there is one declaration of it.
from apps.catalog.tenant_audit_query_service import (  # noqa: E402
    EXPORT_CAPABILITY as _TENANT_AUDIT_EXPORT_CAPABILITY,
)

class AdminTenantAuditView(APIView):
    """GET /api/v1/admin/tenant-audit/ — platform operational-review feed (R13.2).

    Returns recent **tenant configuration changes** (``tenant.*`` actions) and
    **routing failures** (``assignment.failed``) so a platform operator can
    review coverage gaps and config drift in one place. It is gated by
    ``platform.audit.read_all`` because it spans every school, so it is never
    exposed to school staff (who use the scoped per-institution view below).

    Optional ``action`` query param filters to an exact action; ``category``
    (``config`` | ``routing_failure``) narrows to one of the two feeds.
    """

    permission_classes = [IsAdmin]
    serializer_class = TenantAuditLogSerializer

    @extend_schema(
        operation_id="admin_tenant_audit_list",
        tags=["admin"],
        parameters=[
            OpenApiParameter("action", OpenApiTypes.STR, OpenApiParameter.QUERY),
            OpenApiParameter("category", OpenApiTypes.STR, OpenApiParameter.QUERY, description="config | routing_failure"),
        ],
        responses={200: OpenApiResponse(response=TenantAuditLogSerializer(many=True))},
    )
    def get(self, request):
        if not _write_allowed(request.user, "platform.audit.read_all"):
            return _forbidden_write_response()
        config_q = Q(action__startswith=OBSERVABILITY_CONFIG_PREFIX)
        routing_q = Q(action=OBSERVABILITY_ROUTING_FAILURE_ACTION)

        category = (request.query_params.get("category") or "").strip().lower()
        if category == "config":
            queryset = AuditLog.objects.filter(config_q)
        elif category == "routing_failure":
            queryset = AuditLog.objects.filter(routing_q)
        else:
            queryset = AuditLog.objects.filter(config_q | routing_q)

        action = request.query_params.get("action")
        if action:
            queryset = queryset.filter(action=action)

        queryset = queryset.order_by("-created_at")
        return _paginate(request, queryset, TenantAuditLogSerializer)


class AdminInstitutionAuditView(APIView):
    """GET /api/v1/admin/institutions/<id>/audit/ — the one tenant audit feed.

    The **selected institution** endpoint R6.6 requires: scoped, capability-gated,
    filtered and paginated in SQL, with server-computed facets and a
    page-independent audited CSV export. All of it is delegated to
    :class:`~apps.catalog.tenant_audit_query_service.TenantAuditQueryService`; this
    view resolves the actor's access, asks the service, and answers.

    Authority (task 9.5, finding **ADM-05**): the institution id is resolved
    through ``visible_institution_queryset`` **before** any audit query, so an
    out-of-scope, unknown or malformed id is one indistinguishable masked 404;
    then ``tenant.audit.read`` is required *for that institution* through
    ``AdminCapabilityService`` (a Super_Admin passes on platform authority). The
    previous ``IsAdmin`` role class plus inline scope-id set is gone: no role
    string is compared on this surface.

    Requirements: R3, R6.6, R13.5.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = TenantAuditLogSerializer

    #: Bulk extraction is a separate capability from reading (R6.5).
    export_capability = _TENANT_AUDIT_EXPORT_CAPABILITY

    @extend_schema(
        operation_id="admin_institution_audit_list",
        tags=["admin"],
        parameters=[
            OpenApiParameter("institution_id", OpenApiTypes.UUID, OpenApiParameter.PATH),
            OpenApiParameter("action", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Exact action match."),
            OpenApiParameter("category", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="configuration | authorization | review | document | payment | export | communication | other"),
            OpenApiParameter("entity_type", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("actor_id", OpenApiTypes.UUID, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("date_from", OpenApiTypes.DATETIME, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("date_to", OpenApiTypes.DATETIME, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("search", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Match action or entity type."),
            OpenApiParameter("page", OpenApiTypes.INT, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("pageSize", OpenApiTypes.INT, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("export", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Pass 'csv' to download the whole filtered set (page-independent). Requires tenant.application.export."),
        ],
        responses={
            200: OpenApiResponse(description="This school's audit events with server facets (JSON, or a CSV download when export=csv)."),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
    def get(self, request, institution_id):
        from apps.catalog.tenant_audit_query_service import (
            CATEGORIES,
            CATEGORY_DEFINITIONS,
            TenantAuditQueryService,
            TenantAuditScopeDenied,
        )

        service = TenantAuditQueryService()
        try:
            resolved_id = service.resolve_institution_id(request.user, institution_id)
        except TenantAuditScopeDenied as exc:
            return self._masked_not_found(request, exc)

        # In scope; the capability decides whether they may read it. Raises a
        # non-revealing 403 handled by the envelope exception handler.
        service.require_read(request.user, resolved_id)

        filters = service.parse_filters(request.query_params)
        queryset = service.filtered_events(resolved_id, filters)

        if (request.query_params.get("export") or "").strip().lower() == "csv":
            return self._export(request, service, resolved_id, filters, queryset)

        paginator = StandardPagination()
        page_size = paginator.get_page_size(request) or paginator.page_size
        try:
            page_number = max(1, int(request.query_params.get("page") or 1))
        except (TypeError, ValueError):
            page_number = 1
        total_count = queryset.count()
        rows = service.rows_for(
            queryset, offset=(page_number - 1) * page_size, limit=page_size
        )
        return Response(
            {
                "success": True,
                "data": {
                    "institution_id": resolved_id,
                    "page": page_number,
                    "pageSize": page_size,
                    "totalCount": total_count,
                    "totalPages": max(1, -(-total_count // page_size)) if page_size else 1,
                    "results": rows,
                    "facets": service.facets(queryset),
                    "filters": filters.as_payload(),
                    "categories": list(CATEGORIES),
                    "definitions": CATEGORY_DEFINITIONS,
                    "can_export": service.may_export(request.user),
                },
            }
        )

    # -- helpers ---------------------------------------------------------

    def _masked_not_found(self, request, exc):
        """A masked 404 for an unresolvable id, recorded as a scope denial."""
        try:
            TenantAuditService.record_scope_denied(
                resource_type=f"audit.{exc.resource_type}",
                resource_id=exc.resource_id,
                actor_id=getattr(request.user, "id", None),
                actor_role=getattr(request.user, "role", None),
                request=request,
            )
        except Exception:  # pragma: no cover - audit must never block a read
            pass
        return Response(
            {"success": False, "error": "Institution not found", "code": "NOT_FOUND"},
            status=status.HTTP_404_NOT_FOUND,
        )

    def _export(self, request, service, institution_id, filters, queryset):
        """Page-independent, capability-gated, audited CSV export (R6.5, R6.6)."""
        from apps.catalog.tenant_audit_query_service import EXPORT_ROW_LIMIT
        from apps.catalog.tenant_audit_service import ACTION_AUDIT_EXPORTED
        from apps.documents.settlement_service import csv_bytes

        if not service.may_export(request.user):
            try:
                TenantAuditService.record_event(
                    action="auth.denied",
                    entity_type="audit_log",
                    actor_id=getattr(request.user, "id", None),
                    actor_role=getattr(request.user, "role", None),
                    institution_id=institution_id,
                    metadata={
                        "resource_type": "audit.export",
                        "required_capability": self.export_capability,
                    },
                    retention_category="security",
                    request=request,
                )
            except Exception:  # pragma: no cover
                pass
            return Response(
                {
                    "success": False,
                    "error": "You do not have permission to perform this action.",
                    "code": "INSUFFICIENT_PERMISSIONS",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        total = queryset.count()
        if total > EXPORT_ROW_LIMIT:
            return Response(
                {
                    "success": False,
                    "error": "This export is too large. Narrow the filters and try again.",
                    "code": "EXPORT_TOO_LARGE",
                    "data": {"row_count": total, "row_limit": EXPORT_ROW_LIMIT},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        rows = service.export_rows(queryset, limit=EXPORT_ROW_LIMIT)
        body = csv_bytes(service.export_columns(), rows)
        try:
            TenantAuditService.record_export(
                action=ACTION_AUDIT_EXPORTED,
                entity_type="audit_log",
                institution_id=institution_id,
                row_count=len(rows),
                row_limit=EXPORT_ROW_LIMIT,
                filters=filters.as_payload(),
                actor_id=getattr(request.user, "id", None),
                actor_role=getattr(request.user, "role", None),
                request=request,
            )
        except Exception:  # pragma: no cover - audit must never block a read
            pass
        filename = f"tenant-audit-{timezone.now().strftime('%Y%m%d')}.csv"
        response = HttpResponse(body, content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
