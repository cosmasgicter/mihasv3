"""Admin-facing application views.

Extracted during the views module split (production-readiness-hardening, task 9.1).
Contains views for application listing, review, bulk status, export, grading,
reviewer assignment, auto-assign, fee waivers, amendment review, and condition verification.
"""

import hashlib
import logging

from django.db import transaction
from django.conf import settings
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
from apps.catalog.services import AccessScopeService, AdminCapabilityService
from apps.applications.document_intelligence import DocumentIntelligence
from apps.applications.filters import ApplicationFilter, annotate_activity_at
from apps.applications.models import (
    Application,
    ApplicationCondition,
    ApplicationStatusHistory,
)
from apps.applications.review_queue import ReviewQueueScorer
from apps.applications.serializers import (
    ApplicationBulkStatusSerializer,
    ApplicationCreateSerializer,
    ApplicationListSerializer,
    ApplicationReviewSerializer,
    ApplicationSerializer,
    PaymentStatusUpdateSerializer,
    # T15 API remediation
    ApplicationAmendmentReviewRequestSerializer,
    ApplicationAssignRequestSerializer,
    ApplicationAutoAssignRequestSerializer,
    ApplicationEnvelopeResponseSerializer,
    ApplicationFeeWaiverRequestSerializer,
)
from apps.applications.services import (
    ApplicationSubmissionError,
    submit_application,
    transition_application_status,
)
from apps.common.communication_service import CommunicationService
from apps.common.idempotency import idempotent
from apps.common.openapi_helpers import ErrorResponseSerializer
from apps.common.pagination import StandardPagination
from apps.documents.models import ApplicationDocument, ApplicationGrade, Payment

from ._view_helpers import (
    ApplicationBulkStatusResponseSerializer,
    ApplicationConditionSerializer,
    ApplicationListResponseSerializer,
    ApplicationResponseSerializer,
    ApplicationReviewResponseSerializer,
    ConditionVerifyRequestSerializer,
    _generate_application_number,
    _generate_tracking_code,
    _with_payment_summary,
)

logger = logging.getLogger(__name__)


def _redact_name(value: str | None) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    parts = value.split()
    return " ".join(f"{part[:1]}***" for part in parts)


def _redact_email(value: str | None) -> str:
    value = (value or "").strip()
    if "@" not in value:
        return "***"
    local, domain = value.split("@", 1)
    return f"{local[:1]}***@{domain}"


def _redact_phone(value: str | None) -> str:
    digits = "".join(ch for ch in (value or "") if ch.isdigit())
    if len(digits) <= 4:
        return "***"
    return f"***{digits[-4:]}"




# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="applications_export",
        tags=["applications"],
        summary="Export the scoped applications set (delegates to the one export path)",
        description=(
            "The applications export. Authority is ``tenant.application.export``; "
            "the rows are the **whole filtered set**, not the page the caller "
            "happened to request; redaction is capability-driven; the row count is "
            "bounded by EXPORT_ROW_LIMIT with EXPORT_TOO_LARGE rather than a "
            "silent truncation; and the export is recorded as an "
            "``application.exported`` Audit_Event carrying the actor, scope, "
            "filters and row count — never the rows. This route delegates to the "
            "same implementation as ``GET /api/v1/admin/applications/?export=csv`` "
            "so the platform has one applications export rather than two."
        ),
        parameters=[
            OpenApiParameter("status", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Comma-separated application statuses."),
            OpenApiParameter("search", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Match applicant name, email, application number, or tracking code."),
            OpenApiParameter("sort", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False, description="Registered sort key."),
            OpenApiParameter("institution_id", OpenApiTypes.UUID, OpenApiParameter.QUERY, required=False, description="Restrict to one in-scope institution. Out-of-scope or unknown → masked 404."),
        ],
        responses={
            200: OpenApiResponse(
                response=OpenApiTypes.BINARY,
                description="CSV export of every application that matches the filters, regardless of page.",
            ),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class ApplicationExportView(APIView):
    """``GET /api/v1/applications/export/`` — one export, not a second one.

    Admissions-v2 task 9.4 (R8.3, findings AUTH-02 / MAINT-01) turned this route
    into a delegation. What it used to do:

    * ``paginator.paginate_queryset(queryset, request)`` — so ``?page=2`` produced
      a *different export*. An export of the page an operator happened to be
      looking at is not an export; it is a screenshot with a filename. Task 9.1
      fixed this for the roster route and left this one, and 9.1 §10 said so.
    * ``if not full_export: item["full_name"] = _redact_name(...)`` — a **second**
      redaction implementation, keyed on ``all_access``, living beside
      ``ApplicationQueryService.RedactionPolicy``. Two policies over one dataset
      is how they drift.
    * no audit record — a bulk read of applicant data left no trace, while the
      settlement, fee and roster exports all record one (tasks 8.4 and 9.1).
    * a hardcoded ``[:10000]`` ceiling, silently applied, against the contract's
      declared ``EXPORT_ROW_LIMIT``.

    All four are now the one export path's answers. The route, its
    ``operation_id`` and its ``tenant.application.export`` authority are unchanged,
    so an existing caller keeps working — it just receives the whole filtered set,
    redacted by one policy, bounded by one ceiling, and recorded once.
    """

    permission_classes = [IsAuthenticated, HasTenantCapability]
    required_capability = "tenant.application.export"
    allow_target_scope = True
    audit_resource_type = "application"
    serializer_class = ApplicationListSerializer

    def get(self, request):
        from apps.applications.admin_query_views import (
            AdminApplicationQueryView,
            _masked_not_found,
        )
        from apps.applications.query_service import (
            ApplicationQueryService,
            ApplicationScopeDenied,
        )

        service = ApplicationQueryService()
        try:
            filters = service.parse(request.user, request.query_params)
        except ApplicationScopeDenied as exc:
            return _masked_not_found(
                request, f"application.{exc.resource_type}", exc.resource_id
            )

        policy = service.redaction_policy(request.user)
        queryset = service.filtered(request.user, filters)
        # One implementation, called from two routes — rather than one
        # implementation copied into two routes, which is the shape MAINT-01
        # describes.
        return AdminApplicationQueryView()._export(
            request, service, filters, queryset, policy
        )
