"""Scoped fee administration list + export (task 8.4).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 8.4
("Make fee administration and settlement server-scoped/capability-gated").
Requirements: R3 (one authorization model), R6.5 (export is a backend command
with capability, audit, redaction, and size limits), R7.3-R7.4 (canonical fee
administration), R8.3-R8.4, R12.5-R12.7 (server is the money authority).
Findings: **ADM-06** (broad fetch + client-side filtering and aggregation),
**AUTH-02** (fee authority was role-based).

Why this endpoint exists
------------------------
The admin fee page used to load the whole offering list, then fire one
``/programs/{id}/fees/`` request **per offering**, flatten the results in the
browser, and derive its headline numbers — "fee rules", "programs with fees",
"coverage" — from whatever had come back. Three consequences:

* the request count grew with the catalogue, so the page got slower for exactly
  the tenants who had the most to configure;
* the totals described the loaded payload rather than the tenant's real
  configuration, so a slow or partial load quietly under-reported coverage;
* there was no page, no server filter, no export, and no audit.

``GET /api/v1/admin/fees/`` answers all of that in one scoped query: the fee rows
for the actor's own institutions, filtered and paginated in SQL, with the
coverage aggregates computed over the whole filtered set and a page-independent
audited CSV export.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Optional

from django.db.models import Count, Max, Min, Q, QuerySet, TextField, Value
from django.db.models.functions import Coalesce, NullIf
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

from apps.catalog.permissions import HasTenantCapability
from apps.catalog.tenant_audit_service import ACTION_FEE_EXPORTED, TenantAuditService
from apps.common.openapi_helpers import ErrorResponseSerializer
from apps.common.pagination import StandardPagination
from apps.documents.models import ProgramFee
from apps.documents.settlement_service import (
    EXPORT_ROW_LIMIT,
    PLATFORM_ONLY_FEE_FIELDS,
    RedactionPolicy,
    SettlementQueryService,
    SettlementScopeDenied,
    csv_bytes,
)

logger = logging.getLogger(__name__)

FEE_TYPES = ("application", "tuition")
RESIDENCY_CATEGORIES = ("local", "international")


@dataclass(frozen=True)
class FeeAdminFilters:
    """The validated, server-side filter set for one fee-administration query."""

    institution_id: Optional[str] = None
    program_offering_id: Optional[str] = None
    fee_type: Optional[str] = None
    residency_category: Optional[str] = None
    currency: Optional[str] = None
    is_active: Optional[bool] = None
    search: Optional[str] = None

    def as_payload(self) -> dict[str, Any]:
        return {
            "institution_id": self.institution_id,
            "program_offering_id": self.program_offering_id,
            "fee_type": self.fee_type,
            "residency_category": self.residency_category,
            "currency": self.currency,
            "is_active": self.is_active,
            "search": self.search,
        }


class FeeAdminQueryService:
    """Scoped fee-administration queries. Shares the 8.4 scope + redaction path."""

    #: Export columns, in order. Shared by the CSV writer and its tests.
    EXPORT_COLUMNS: tuple[str, ...] = (
        "id",
        "institution_id",
        "institution_name",
        "program_offering_id",
        "program_offering_code",
        "program_name",
        "fee_type",
        "residency_category",
        "amount",
        "currency",
        "is_active",
        "peer_offering_count",
        "created_at",
        "updated_at",
    )

    def __init__(self) -> None:
        # One scope/redaction authority for both 8.4 surfaces.
        self._scope = SettlementQueryService()

    # -- Authority ------------------------------------------------------

    def redaction_policy(self, user) -> RedactionPolicy:
        return self._scope.redaction_policy(user).for_fields(PLATFORM_ONLY_FEE_FIELDS)

    def parse_filters(self, user, query_params) -> FeeAdminFilters:
        """Validate raw params; identifier filters are scope-resolved first."""
        fee_type = (query_params.get("fee_type") or "").strip().lower() or None
        if fee_type and fee_type not in FEE_TYPES:
            fee_type = None
        residency = (query_params.get("residency_category") or "").strip().lower() or None
        if residency and residency not in RESIDENCY_CATEGORIES:
            residency = None
        currency = (query_params.get("currency") or "").strip().upper() or None
        raw_active = (query_params.get("is_active") or "").strip().lower()
        if raw_active in {"1", "true", "yes"}:
            is_active: Optional[bool] = True
        elif raw_active in {"0", "false", "no"}:
            is_active = False
        else:
            is_active = None
        search = (query_params.get("search") or "").strip() or None

        return FeeAdminFilters(
            institution_id=self._scope.resolve_institution_filter(
                user, query_params.get("institution_id")
            ),
            program_offering_id=self._scope.resolve_offering_filter(
                user, query_params.get("program_offering_id")
            ),
            fee_type=fee_type,
            residency_category=residency,
            currency=currency,
            is_active=is_active,
            search=search[:120] if search else None,
        )

    # -- Query ----------------------------------------------------------

    def scoped_fees(self, user) -> QuerySet:
        """Every fee row the actor may read, scoped in SQL before any lookup.

        The scope is the actor's visible institutions, resolved through
        ``AdminCapabilityService.visible_institution_queryset``; an actor with no
        scope gets an empty queryset rather than a global one.
        """
        queryset = ProgramFee.objects.select_related(
            "program", "program__institution"
        ).all()
        visible_ids = self._scope.visible_institution_ids(user)
        if visible_ids is None:
            return queryset
        if not visible_ids:
            return queryset.none()
        return queryset.filter(program__institution_id__in=visible_ids)

    def filtered_fees(self, user, filters: FeeAdminFilters) -> QuerySet:
        queryset = self.scoped_fees(user).annotate(
            institution_label=Coalesce(
                NullIf("program__institution__name", Value("")),
                Value("Unassigned"),
                output_field=TextField(),
            ),
            offering_label=Coalesce(
                NullIf("program__name", Value("")),
                Value("Unassigned"),
                output_field=TextField(),
            ),
        )
        if filters.institution_id:
            queryset = queryset.filter(program__institution_id=filters.institution_id)
        if filters.program_offering_id:
            queryset = queryset.filter(program_id=filters.program_offering_id)
        if filters.fee_type:
            queryset = queryset.filter(fee_type=filters.fee_type)
        if filters.residency_category:
            queryset = queryset.filter(residency_category=filters.residency_category)
        if filters.currency:
            queryset = queryset.filter(currency__iexact=filters.currency)
        if filters.is_active is True:
            queryset = queryset.filter(Q(is_active=True) | Q(is_active__isnull=True))
        elif filters.is_active is False:
            queryset = queryset.filter(is_active=False)
        if filters.search:
            queryset = queryset.filter(
                Q(institution_label__icontains=filters.search)
                | Q(offering_label__icontains=filters.search)
                | Q(program__code__icontains=filters.search)
            )
        return queryset.order_by("institution_label", "offering_label", "fee_type", "residency_category")

    def rows_for(
        self,
        queryset: QuerySet,
        *,
        policy: RedactionPolicy,
        offset: int = 0,
        limit: Optional[int] = None,
    ) -> list[dict[str, Any]]:
        """Serialise one window of fee rows.

        ``amount`` leaves the server as the decimal string the database holds —
        the browser formats it and computes nothing (R12.1).
        """
        window = list(
            queryset[offset : offset + limit] if limit is not None else queryset[:EXPORT_ROW_LIMIT]
        )
        rows: list[dict[str, Any]] = []
        # Cross-tenant context is computed for platform actors only: how many
        # *other* institutions offer the same canonical program. Never computed
        # for a tenant actor, because that count is an inference about other
        # tenants (R3.2), not a fact about their own catalogue.
        peer_counts = self._peer_offering_counts(window) if policy.unrestricted else {}
        for fee in window:
            program = getattr(fee, "program", None)
            institution = getattr(program, "institution", None)
            row = {
                "id": str(fee.id),
                "institution_id": str(getattr(program, "institution_id", "") or "") or None,
                "institution_name": getattr(institution, "name", None) or "Unassigned",
                "program_offering_id": str(getattr(fee, "program_id", "") or "") or None,
                "program_offering_code": getattr(program, "code", None),
                "program_name": getattr(program, "name", None) or "Unassigned",
                "fee_type": fee.fee_type,
                "residency_category": fee.residency_category,
                "amount": str(fee.amount) if fee.amount is not None else None,
                "currency": fee.currency or "ZMW",
                "is_active": True if fee.is_active is None else bool(fee.is_active),
                "peer_offering_count": peer_counts.get(
                    str(getattr(program, "canonical_program_id", "") or "")
                ),
                "created_at": fee.created_at.isoformat() if fee.created_at else None,
                "updated_at": fee.updated_at.isoformat() if fee.updated_at else None,
            }
            rows.append(policy.apply(row))
        return rows

    @staticmethod
    def _peer_offering_counts(fees) -> dict[str, int]:
        """Active offerings per canonical program, for the rows in this window."""
        from apps.catalog.models import Program

        canonical_ids = {
            str(getattr(getattr(fee, "program", None), "canonical_program_id", "") or "")
            for fee in fees
        }
        canonical_ids.discard("")
        if not canonical_ids:
            return {}
        rows = (
            Program.objects.filter(
                canonical_program_id__in=canonical_ids, is_active=True
            )
            .values("canonical_program_id")
            .annotate(peer_count=Count("institution_id", distinct=True))
        )
        return {str(row["canonical_program_id"]): row["peer_count"] for row in rows}

    def aggregates(self, user, queryset: QuerySet, filters: FeeAdminFilters) -> dict[str, Any]:
        """Coverage + distribution over the whole filtered set (never one page).

        This is the server's answer to the three headline numbers the fee page
        used to derive in the browser: how many fee rules exist, how many
        offerings are configured, and how many offerings exist in scope at all.
        """
        from apps.catalog.models import Program

        totals = queryset.aggregate(
            fee_count=Count("id"),
            active_count=Count("id", filter=Q(is_active=True) | Q(is_active__isnull=True)),
            inactive_count=Count("id", filter=Q(is_active=False)),
            first_created_at=Min("created_at"),
            last_updated_at=Max("updated_at"),
        )
        configured_offerings = (
            queryset.values("program_id").order_by().distinct().count()
        )

        offerings = Program.objects.filter(is_active=True)
        visible_ids = self._scope.visible_institution_ids(user)
        if visible_ids is not None:
            offerings = offerings.filter(institution_id__in=visible_ids or [])
        if filters.institution_id:
            offerings = offerings.filter(institution_id=filters.institution_id)
        if filters.program_offering_id:
            offerings = offerings.filter(id=filters.program_offering_id)
        offerings_in_scope = offerings.count()

        by_currency = [
            {
                "currency": row.get("currency") or "ZMW",
                "fee_count": row.get("fee_count") or 0,
                "min_amount": str(row["min_amount"]) if row.get("min_amount") is not None else None,
                "max_amount": str(row["max_amount"]) if row.get("max_amount") is not None else None,
            }
            for row in queryset.values("currency")
            .annotate(
                fee_count=Count("id"), min_amount=Min("amount"), max_amount=Max("amount")
            )
            .order_by("currency")
        ]
        by_fee_type = [
            {"fee_type": row.get("fee_type"), "fee_count": row.get("fee_count") or 0}
            for row in queryset.values("fee_type")
            .annotate(fee_count=Count("id"))
            .order_by("fee_type")
        ]
        by_residency = [
            {
                "residency_category": row.get("residency_category"),
                "fee_count": row.get("fee_count") or 0,
            }
            for row in queryset.values("residency_category")
            .annotate(fee_count=Count("id"))
            .order_by("residency_category")
        ]

        return {
            "fee_count": totals.get("fee_count") or 0,
            "active_count": totals.get("active_count") or 0,
            "inactive_count": totals.get("inactive_count") or 0,
            "configured_offering_count": configured_offerings,
            "offerings_in_scope": offerings_in_scope,
            "unconfigured_offering_count": max(offerings_in_scope - configured_offerings, 0),
            "institution_count": (
                queryset.values("program__institution_id").order_by().distinct().count()
            ),
            "by_currency": by_currency,
            "by_fee_type": by_fee_type,
            "by_residency": by_residency,
            "first_created_at": (
                totals["first_created_at"].isoformat() if totals.get("first_created_at") else None
            ),
            "last_updated_at": (
                totals["last_updated_at"].isoformat() if totals.get("last_updated_at") else None
            ),
            "row_limit": EXPORT_ROW_LIMIT,
        }

    def export_columns(self, policy: RedactionPolicy) -> tuple[str, ...]:
        withheld = set(policy.withheld_fields)
        return tuple(column for column in self.EXPORT_COLUMNS if column not in withheld)


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_fees_list",
        tags=["admin"],
        parameters=[
            OpenApiParameter("institution_id", OpenApiTypes.UUID, OpenApiParameter.QUERY, required=False, description="Restrict to one in-scope institution. Out-of-scope or unknown → 404."),
            OpenApiParameter("program_offering_id", OpenApiTypes.UUID, OpenApiParameter.QUERY, required=False, description="Restrict to one in-scope offering. Out-of-scope or unknown → 404."),
            OpenApiParameter("fee_type", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="application | tuition"),
            OpenApiParameter("residency_category", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="local | international"),
            OpenApiParameter("currency", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("is_active", OpenApiTypes.BOOL, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("search", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Match institution name, offering name, or offering code."),
            OpenApiParameter("page", OpenApiTypes.INT, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("pageSize", OpenApiTypes.INT, OpenApiParameter.QUERY, required=False),
            OpenApiParameter("export", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Pass 'csv' to download the whole filtered set (page-independent). Requires tenant.application.export."),
        ],
        responses={
            200: OpenApiResponse(description="Scoped fee schedules with server aggregates and coverage (JSON, or CSV download when export=csv)."),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class AdminFeeListView(APIView):
    """GET /api/v1/admin/fees/ — the scoped fee-administration report.

    Authority is the per-institution ``tenant.program.read`` capability resolved
    through ``AdminCapabilityService``; an actor with no tenant scope receives a
    masked 404 rather than an empty page. Writes are **not** here: fee mutation
    stays on the canonical ``/api/v1/programs/{id}/fees/`` path, which task 8.4
    gates on ``platform.program_assignment.manage``.
    """

    permission_classes = [IsAuthenticated, HasTenantCapability]
    required_capability = "tenant.program.read"
    audit_resource_type = "program_fee"
    export_capability = "tenant.application.export"

    def _masked_not_found(self, request, exc: SettlementScopeDenied):
        try:
            TenantAuditService.record_scope_denied(
                resource_type=f"fee.{exc.resource_type}",
                resource_id=exc.resource_id,
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

    def _may_export(self, request) -> bool:
        from apps.catalog.services import AdminCapabilityService, CapabilityResolutionError

        try:
            capabilities = AdminCapabilityService().get_capabilities(request.user)
        except CapabilityResolutionError:
            return False
        if capabilities.is_super_admin or capabilities.all_access:
            return True
        return any(
            self.export_capability in held
            for held in (capabilities.institution_capabilities or {}).values()
        )

    def get(self, request):
        service = FeeAdminQueryService()
        try:
            filters = service.parse_filters(request.user, request.query_params)
        except SettlementScopeDenied as exc:
            return self._masked_not_found(request, exc)

        policy = service.redaction_policy(request.user)
        queryset = service.filtered_fees(request.user, filters)

        if (request.query_params.get("export") or "").lower() == "csv":
            return self._export(request, service, filters, queryset, policy)

        paginator = StandardPagination()
        page_size = paginator.get_page_size(request) or paginator.page_size
        try:
            page_number = max(1, int(request.query_params.get("page") or 1))
        except (TypeError, ValueError):
            page_number = 1
        total_count = queryset.count()
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
                    # Server-computed, like every other number on this report.
                    "totalPages": max(1, -(-total_count // page_size)) if page_size else 1,
                    "results": rows,
                    "aggregates": service.aggregates(request.user, queryset, filters),
                    "filters": filters.as_payload(),
                    "redaction": policy.as_payload(),
                    "can_export": self._may_export(request),
                },
            }
        )

    def _export(self, request, service, filters, queryset, policy):
        """Page-independent, capability-gated, audited CSV export (R6.5)."""
        if not self._may_export(request):
            try:
                TenantAuditService.record_event(
                    action="auth.denied",
                    entity_type="program_fee",
                    actor_id=getattr(request.user, "id", None),
                    actor_role=getattr(request.user, "role", None),
                    metadata={
                        "resource_type": "fee.export",
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

        rows = service.rows_for(queryset, policy=policy, offset=0, limit=EXPORT_ROW_LIMIT)
        body = csv_bytes(service.export_columns(policy), rows)

        try:
            TenantAuditService.record_export(
                action=ACTION_FEE_EXPORTED,
                entity_type="program_fee",
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

        filename = f"program-fees-{timezone.now().strftime('%Y%m%d')}.csv"
        response = HttpResponse(body, content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


__all__ = ["AdminFeeListView", "FeeAdminFilters", "FeeAdminQueryService"]
