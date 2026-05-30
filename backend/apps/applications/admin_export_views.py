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

from apps.accounts.permissions import IsAdmin, IsOwnerOrAdmin, IsSuperAdmin, is_super_admin
from apps.common.throttling import AIUserScopedRateThrottle
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
    ApplicationAiSummaryResponseSerializer,
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
        parameters=[
            OpenApiParameter("status", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Filter by status."),
            OpenApiParameter("search", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Search term applied by the application filter."),
            OpenApiParameter("sort", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Optional sort expression."),
        ],
        responses={
            200: OpenApiResponse(
                response=OpenApiTypes.BINARY,
                description="CSV export of applications that match the current filters.",
            ),
        },
    )
)
class ApplicationExportView(APIView):
    permission_classes = [IsAdmin]
    serializer_class = ApplicationListSerializer

    def get(self, request):
        full_export = is_super_admin(request.user)
        queryset = _with_payment_summary(Application.objects.all()).order_by("-created_at")
        filterset = ApplicationFilter(request.query_params, queryset=queryset)
        queryset = filterset.qs

        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        rows = page if page is not None else list(queryset[:10000])
        serializer = ApplicationListSerializer(rows, many=True)
        data = serializer.data

        # Preserve role-aware PII redaction: regular admins never see raw
        # name/email/phone in exports — only super-admins get the full export.
        if not full_export:
            for item in data:
                item["full_name"] = _redact_name(item.get("full_name"))
                item["email"] = _redact_email(item.get("email"))
                item["phone"] = _redact_phone(item.get("phone"))

        if page is not None:
            return paginator.get_paginated_response(data)
        return Response({"success": True, "data": {
            "page": 1, "pageSize": len(data), "totalCount": len(data), "results": data,
        }})

