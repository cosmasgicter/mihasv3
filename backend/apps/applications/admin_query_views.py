"""The scoped applications report + saved filters (task 9.1).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 9.1 — "Create one
scoped applications query and aggregate contract".
Requirements: **R8.1**, **R8.6**. Findings: **ADM-01**.
Design: §13.2 ("Applications: server query, saved filters, queue,
detail/review"), §14.1 (one envelope, one pagination schema).

Two endpoints, one authority
----------------------------
* ``GET /api/v1/admin/applications/`` — the roster. Search, filters, sort, page,
  **facets**, **aggregates**, and **deadlines** all come from
  :class:`~apps.applications.query_service.ApplicationQueryService`, computed over
  the whole filtered set in SQL. ``?export=csv`` is page-independent, capability
  gated, redacted, bounded, and audited.
* ``GET/POST /api/v1/admin/applications/saved-filters/`` and
  ``DELETE .../saved-filters/{id}/`` — named queries as server records rather
  than one browser slot.

Both resolve authority through ``AdminCapabilityService`` (via
``HasTenantCapability`` → ``authorize_tenant_surface``): a caller with no tenant
scope is a masked **404** rather than a confirming empty page, and an in-scope
actor missing ``tenant.application.read`` is a non-revealing **403**. No role
string is compared here.

The two-queryset shape, and why it matters
------------------------------------------
The view builds the filtered queryset **twice**: once with every filter applied
(the page, the totals, the export) and once with the *faceted dimensions* left
open (the facet counts). That is deliberate. A status facet computed after
``status=approved`` can only ever offer ``approved``, which would recreate
ADM-01's defect in a new place — an operator could filter themselves into a
corner with no way back. Facets describe *what else you could ask for*; totals
describe *what you asked for*.
"""

from __future__ import annotations

import logging
from dataclasses import replace
from typing import Any, Optional

from django.db import IntegrityError
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
    extend_schema_view,
)
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.applications.models import AdminSavedFilter
from apps.applications.query_service import (
    EXPORT_ROW_LIMIT,
    REGISTERED_PARAMETERS,
    ApplicationExportTooLarge,
    ApplicationFilters,
    ApplicationQueryService,
    ApplicationScopeDenied,
    csv_bytes,
)
from apps.catalog.permissions import HasTenantCapability
from apps.catalog.tenant_audit_service import (
    ACTION_APPLICATION_EXPORTED,
    TenantAuditService,
)
from apps.common.openapi_helpers import ErrorResponseSerializer
from apps.common.pagination import StandardPagination

logger = logging.getLogger(__name__)

#: The dimensions whose own filter is left open when computing facets, so a
#: narrowed query still offers the other values of that dimension.
FACET_OPEN_DIMENSIONS: dict[str, tuple[str, ...]] = {
    "status": ("statuses", "exclude_statuses"),
    "payment_status": ("payment_statuses",),
    "institution": ("institution_id", "institution"),
    "program_offering": ("program_offering_id", "program"),
    "intake": ("intake_id", "intake"),
}


def _masked_not_found(request, resource_type: str, resource_id: Any):
    """One masked 404 for every out-of-scope / unknown identifier (R3.2)."""
    try:
        TenantAuditService.record_scope_denied(
            resource_type=resource_type,
            resource_id=resource_id,
            actor_id=getattr(request.user, "id", None),
            actor_role=getattr(request.user, "role", None),
            request=request,
        )
    except Exception:  # pragma: no cover - audit must never block a read
        pass
    return Response(
        {"success": False, "error": "Not found", "code": "NOT_FOUND"},
        status=status.HTTP_404_NOT_FOUND,
    )


def _may_export(request, capability: str = "tenant.application.export") -> bool:
    """Whether the actor holds the platform's one tenant export grant (R6.5)."""
    from apps.catalog.services import AdminCapabilityService, CapabilityResolutionError

    try:
        return AdminCapabilityService().has_any_application_capability(
            request.user, capability
        )
    except CapabilityResolutionError:
        return False


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_applications_query",
        tags=["admin"],
        parameters=[
            OpenApiParameter("institution_id", OpenApiTypes.UUID, OpenApiParameter.QUERY, required=False, description="Restrict to one in-scope institution. Out-of-scope or unknown → masked 404."),
            OpenApiParameter("program_offering_id", OpenApiTypes.UUID, OpenApiParameter.QUERY, required=False, description="Restrict to one in-scope offering. Out-of-scope or unknown → masked 404."),
            OpenApiParameter("intake_id", OpenApiTypes.UUID, OpenApiParameter.QUERY, required=False, description="Restrict to one in-scope intake. Out-of-scope or unknown → masked 404."),
            OpenApiParameter("assigned_reviewer_id", OpenApiTypes.UUID, OpenApiParameter.QUERY, required=False, description="Restrict to one reviewer with assigned work in scope. Out-of-scope or unknown → masked 404."),
            OpenApiParameter("status", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Comma-separated application statuses."),
            OpenApiParameter("exclude_status", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Comma-separated statuses to exclude (e.g. 'draft')."),
            OpenApiParameter("payment_status", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Comma-separated payment statuses."),
            OpenApiParameter("program", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Match the resolved offering/program label."),
            OpenApiParameter("intake", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Match the resolved intake label."),
            OpenApiParameter("institution", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Match the resolved institution label."),
            OpenApiParameter("search", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Match applicant name, email, application number, or tracking code."),
            OpenApiParameter("reviewer_assignment", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="assigned | unassigned"),
            OpenApiParameter("is_late_submission", OpenApiTypes.BOOL, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("has_pending_amendments", OpenApiTypes.BOOL, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("review_queue", OpenApiTypes.BOOL, OpenApiParameter.QUERY, required=False, description="Submitted or under review."),
            OpenApiParameter("overdue_review", OpenApiTypes.BOOL, OpenApiParameter.QUERY, required=False, description="Past the configured review SLA."),
            OpenApiParameter("has_pending_documents", OpenApiTypes.BOOL, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("has_upcoming_interviews", OpenApiTypes.BOOL, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("deadline_pressure", OpenApiTypes.BOOL, OpenApiParameter.QUERY, required=False, description="An open condition or enrollment confirmation falls due inside the deadline window."),
            OpenApiParameter("start_date", OpenApiTypes.DATE, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("end_date", OpenApiTypes.DATE, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("sort", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="activity_at | created_at | submitted_at | full_name | status | payment_status | program | institution | deadline"),
            OpenApiParameter("order", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="asc | desc"),
            OpenApiParameter("page", OpenApiTypes.INT, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("pageSize", OpenApiTypes.INT, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("saved_filter", OpenApiTypes.UUID, OpenApiParameter.QUERY, required=False, description="Apply one of the caller's own saved filters as the base query. Explicit query parameters win."),
            OpenApiParameter("export", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Pass 'csv' to download the whole filtered set (page-independent). Requires tenant.application.export."),
        ],
        responses={
            200: OpenApiResponse(description="Scoped applications with server facets, whole-set aggregates, and deadline state (JSON, or CSV download when export=csv)."),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class AdminApplicationQueryView(APIView):
    """GET /api/v1/admin/applications/ — the one scoped applications query.

    Read authority is the per-institution ``tenant.application.read`` capability
    resolved through ``AdminCapabilityService``; a caller with no tenant scope
    receives a masked 404 rather than a confirming empty page. Writes are **not**
    here — every application command keeps its own canonical route and its own
    capability.
    """

    permission_classes = [IsAuthenticated, HasTenantCapability]
    required_capability = "tenant.application.read"
    # QueryService always applies AccessScopeService.filter_applications before
    # producing rows/facets, so constrained offering/application grants may
    # authorize this surface without widening to their institution.
    allow_target_scope = True
    audit_resource_type = "application"
    export_capability = "tenant.application.export"

    def get(self, request):
        service = ApplicationQueryService()
        params = self._merge_saved_filter(request)
        if isinstance(params, Response):
            return params

        try:
            filters = service.parse(request.user, params)
        except ApplicationScopeDenied as exc:
            return _masked_not_found(
                request, f"application.{exc.resource_type}", exc.resource_id
            )

        policy = service.redaction_policy(request.user)
        queryset = service.filtered(request.user, filters)

        if (request.query_params.get("export") or "").lower() == "csv":
            return self._export(request, service, filters, queryset, policy)

        paginator = StandardPagination()
        page_size = paginator.get_page_size(request) or paginator.page_size
        try:
            page_number = max(1, int(request.query_params.get("page") or 1))
        except (TypeError, ValueError):
            page_number = 1

        total_count = queryset.order_by().count()
        rows = service.rows_for(
            queryset,
            policy=policy,
            offset=(page_number - 1) * page_size,
            limit=page_size,
        )
        return Response(
            {
                "success": True,
                "data": {
                    "page": page_number,
                    "pageSize": page_size,
                    "totalCount": total_count,
                    # Server-computed: the alternative was Math.ceil in the
                    # browser, and this contract exists because the browser
                    # stopped deriving numbers.
                    "totalPages": max(1, -(-total_count // page_size)) if page_size else 1,
                    "results": rows,
                    "aggregates": service.aggregates(queryset),
                    "facets": self._facets(service, request.user, filters),
                    "filters": filters.as_payload(),
                    "redaction": policy.as_payload(),
                    "can_export": _may_export(request, self.export_capability),
                },
            }
        )

    # ------------------------------------------------------------------
    # Saved filters as the base query
    # ------------------------------------------------------------------

    def _merge_saved_filter(self, request):
        """Overlay explicit query params on the caller's own saved filter.

        The saved filter supplies the base query and the request overrides it, so
        an operator can open a saved view and then narrow it without the saved
        record silently winning. A ``saved_filter`` id that is not the caller's
        own is the same masked 404 as one that does not exist — scoped by owner
        **before** the lookup, so one operator cannot enumerate another's saved
        views.
        """
        saved_id = (request.query_params.get("saved_filter") or "").strip()
        if not saved_id:
            return request.query_params

        actor_id = getattr(request.user, "id", None) or getattr(request.user, "pk", None)
        try:
            saved = AdminSavedFilter.objects.filter(user_id=actor_id).get(id=saved_id)
        except Exception:
            return _masked_not_found(request, "application.saved_filter", saved_id)

        merged = {}
        stored = saved.query if isinstance(saved.query, dict) else {}
        for key, value in stored.items():
            if key in REGISTERED_PARAMETERS and value not in (None, ""):
                merged[key] = str(value)
        for key in request.query_params.keys():
            merged[key] = request.query_params.get(key)
        return merged

    # ------------------------------------------------------------------
    # Facets
    # ------------------------------------------------------------------

    def _facets(self, service: ApplicationQueryService, user, filters: ApplicationFilters):
        """Facet counts per dimension, each with its own dimension left open.

        Computed over the whole filtered set in SQL — never harvested from the
        rows this page happened to load, which is the second half of ADM-01.
        """
        result: dict[str, Any] = {}
        for name, open_fields in FACET_OPEN_DIMENSIONS.items():
            relaxed = self._without(filters, open_fields)
            queryset = service.filtered(user, relaxed)
            result.update(service.facets(queryset, names=(name,)))
        return result

    @staticmethod
    def _without(filters: ApplicationFilters, fields: tuple[str, ...]) -> ApplicationFilters:
        """``filters`` with the named dimension cleared (tuple → (), scalar → None)."""
        cleared: dict[str, Any] = {}
        for name in fields:
            current = getattr(filters, name, None)
            cleared[name] = () if isinstance(current, tuple) else None
        return replace(filters, **cleared)

    # ------------------------------------------------------------------
    # Export (R6.5)
    # ------------------------------------------------------------------

    def _export(self, request, service, filters, queryset, policy):
        """Page-independent, capability-gated, audited CSV export."""
        if not _may_export(request, self.export_capability):
            try:
                TenantAuditService.record_event(
                    action="auth.denied",
                    entity_type="application",
                    actor_id=getattr(request.user, "id", None),
                    actor_role=getattr(request.user, "role", None),
                    metadata={
                        "resource_type": "application.export",
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

        try:
            rows = service.export_rows(queryset, policy=policy)
        except ApplicationExportTooLarge as exc:
            return Response(
                {
                    "success": False,
                    "error": "This export is too large. Narrow the filters and try again.",
                    "code": "EXPORT_TOO_LARGE",
                    "data": {"row_count": exc.row_count, "row_limit": EXPORT_ROW_LIMIT},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        body = csv_bytes(service.export_columns(policy), rows)
        try:
            TenantAuditService.record_export(
                action=ACTION_APPLICATION_EXPORTED,
                entity_type="application",
                institution_id=filters.institution_id,
                row_count=len(rows),
                row_limit=EXPORT_ROW_LIMIT,
                filters=filters.as_payload(),
                redaction=policy.as_payload(),
                actor_id=getattr(request.user, "id", None),
                actor_role=getattr(request.user, "role", None),
                request=request,
            )
        except Exception:  # pragma: no cover - audit must never block a read
            pass

        filename = f"applications-{timezone.now().strftime('%Y%m%d')}.csv"
        response = HttpResponse(body, content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


# ---------------------------------------------------------------------------
# Saved filters
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_application_saved_filters_list",
        tags=["admin"],
        responses={
            200: OpenApiResponse(description="The caller's own saved applications queries."),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    post=extend_schema(
        operation_id="admin_application_saved_filters_save",
        tags=["admin"],
        request=OpenApiTypes.OBJECT,
        responses={
            200: OpenApiResponse(description="Saved filter updated."),
            201: OpenApiResponse(description="Saved filter created."),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class AdminApplicationSavedFilterListView(APIView):
    """GET/POST /api/v1/admin/applications/saved-filters/.

    A saved filter is private to its owner and holds only *registered* query
    parameters. Saving the same name twice is an update, so an operator refines a
    view rather than accumulating near-duplicates they cannot tell apart.
    """

    permission_classes = [IsAuthenticated, HasTenantCapability]
    required_capability = "tenant.application.read"
    allow_target_scope = True
    audit_resource_type = "application_saved_filter"

    MAX_SAVED_FILTERS = 50

    def _owned(self, request):
        actor_id = getattr(request.user, "id", None) or getattr(request.user, "pk", None)
        return AdminSavedFilter.objects.filter(user_id=actor_id)

    @staticmethod
    def _serialise(row, *, institution_in_scope: bool = True) -> dict[str, Any]:
        return {
            "id": str(row.id),
            "name": row.name,
            "institution_id": str(row.institution_id) if row.institution_id else None,
            # A saved filter whose institution is no longer in the actor's scope
            # is reported as unusable rather than quietly applied — the record
            # cannot outlive the membership that justified it (R3.5).
            "institution_in_scope": institution_in_scope,
            "query": row.query if isinstance(row.query, dict) else {},
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }

    def get(self, request):
        service = ApplicationQueryService()
        visible = service.visible_institution_ids(request.user)
        rows = list(self._owned(request).order_by("-updated_at", "name")[: self.MAX_SAVED_FILTERS])
        payload = []
        for row in rows:
            in_scope = (
                True
                if row.institution_id is None or visible is None
                else str(row.institution_id) in visible
            )
            payload.append(self._serialise(row, institution_in_scope=in_scope))
        return Response({"success": True, "data": {"results": payload, "totalCount": len(payload)}})

    def post(self, request):
        service = ApplicationQueryService()
        data = request.data if isinstance(request.data, dict) else {}
        name = str(data.get("name") or "").strip()
        if not name or len(name) > 120:
            return Response(
                {
                    "success": False,
                    "error": "A saved filter needs a name of 1-120 characters.",
                    "code": "VALIDATION_ERROR",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_query = data.get("query")
        if raw_query is not None and not isinstance(raw_query, dict):
            return Response(
                {
                    "success": False,
                    "error": "The saved query must be an object of query parameters.",
                    "code": "VALIDATION_ERROR",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Only registered parameters may be persisted. Saving an unregistered
        # parameter would write ADM-01's own defect to disk: a stored filter the
        # roster silently ignores every time it is opened.
        stored: dict[str, str] = {}
        rejected: list[str] = []
        for key, value in (raw_query or {}).items():
            if key in {"page", "pageSize", "export", "saved_filter"}:
                continue
            if key not in REGISTERED_PARAMETERS:
                rejected.append(str(key))
                continue
            if value in (None, ""):
                continue
            stored[str(key)] = str(value)
        if rejected:
            return Response(
                {
                    "success": False,
                    "error": "The saved query contains parameters this contract does not implement.",
                    "code": "UNREGISTERED_QUERY_PARAMETER",
                    "data": {"unregistered": sorted(rejected)},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        institution_id: Optional[str]
        try:
            institution_id = service.resolve_institution_filter(
                request.user, data.get("institution_id")
            )
        except ApplicationScopeDenied as exc:
            return _masked_not_found(
                request, "application.saved_filter_institution", exc.resource_id
            )

        actor_id = getattr(request.user, "id", None) or getattr(request.user, "pk", None)
        existing = self._owned(request).filter(name__iexact=name).first()
        if existing is None and self._owned(request).count() >= self.MAX_SAVED_FILTERS:
            return Response(
                {
                    "success": False,
                    "error": f"You already have {self.MAX_SAVED_FILTERS} saved filters. Delete one first.",
                    "code": "SAVED_FILTER_LIMIT",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        try:
            if existing is not None:
                existing.name = name
                existing.institution_id = institution_id
                existing.query = stored
                existing.updated_at = now
                existing.save(
                    update_fields=["name", "institution_id", "query", "updated_at"]
                )
                row, created = existing, False
            else:
                row = AdminSavedFilter.objects.create(
                    user_id=actor_id,
                    institution_id=institution_id,
                    name=name,
                    query=stored,
                    created_at=now,
                    updated_at=now,
                )
                created = True
        except IntegrityError:
            # The database's own uniqueness is the final race guard; a concurrent
            # save of the same name converges on the existing row.
            row = self._owned(request).filter(name__iexact=name).first()
            if row is None:  # pragma: no cover - defensive
                raise
            created = False

        return Response(
            {"success": True, "data": self._serialise(row)},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


@extend_schema_view(
    delete=extend_schema(
        operation_id="admin_application_saved_filters_delete",
        tags=["admin"],
        parameters=[
            OpenApiParameter("saved_filter_id", OpenApiTypes.UUID, OpenApiParameter.PATH),
        ],
        responses={
            204: OpenApiResponse(description="Deleted."),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class AdminApplicationSavedFilterDetailView(APIView):
    """DELETE /api/v1/admin/applications/saved-filters/{id}/.

    Scoped by owner **before** the lookup, so another operator's saved filter id
    is the same masked 404 as an id that does not exist.
    """

    permission_classes = [IsAuthenticated, HasTenantCapability]
    required_capability = "tenant.application.read"
    allow_target_scope = True
    audit_resource_type = "application_saved_filter"

    def delete(self, request, saved_filter_id):
        actor_id = getattr(request.user, "id", None) or getattr(request.user, "pk", None)
        try:
            row = AdminSavedFilter.objects.filter(user_id=actor_id).get(id=saved_filter_id)
        except Exception:
            return _masked_not_found(request, "application.saved_filter", saved_filter_id)
        row.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


__all__ = [
    "ACTION_APPLICATION_EXPORTED",
    "AdminApplicationQueryView",
    "AdminApplicationSavedFilterDetailView",
    "AdminApplicationSavedFilterListView",
]
