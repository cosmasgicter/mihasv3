"""Admin-facing application views.

Extracted during the views module split (production-readiness-hardening, task 9.1).
Contains views for application listing, review, bulk status, export, grading,
reviewer assignment, auto-assign, fee waivers, amendment review, and condition verification.
"""

import csv
import hashlib
import io
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
# Amendment Review (Req 14.7)
# ---------------------------------------------------------------------------


class ApplicationAmendmentReviewView(APIView):
    """Review (approve/reject) an amendment.

    POST /api/v1/applications/{id}/amendments/{aid}/review/
    Admin only.

    Requirements: 14.7
    """

    permission_classes = [IsAdmin]
    serializer_class = ApplicationAmendmentReviewRequestSerializer

    @extend_schema(
        request=ApplicationAmendmentReviewRequestSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationEnvelopeResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["applications"],
        summary="Approve or reject an amendment request (admin only)",
    )
    def post(self, request, application_id, amendment_id):
        from apps.applications.amendment_service import AmendmentError, AmendmentService

        data = request.data or {}
        target_status = data.get("status")

        if target_status not in ("approved", "rejected"):
            return Response(
                {
                    "success": False,
                    "error": "status must be 'approved' or 'rejected'.",
                    "code": "VALIDATION_ERROR",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            amendment = AmendmentService.review_amendment(
                amendment_id=str(amendment_id),
                status=target_status,
                admin_id=str(request.user.id),
                application_id=str(application_id),
            )
        except AmendmentError as exc:
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({
            "success": True,
            "data": {
                "amendment_id": str(amendment.id),
                "application_id": str(application_id),
                "field_name": amendment.field_name,
                "new_value": amendment.new_value,
                "status": amendment.status,
            },
        })


# ---------------------------------------------------------------------------
# Condition Verify (Req 5.10)
# ---------------------------------------------------------------------------


class ApplicationConditionVerifyView(APIView):
    """Verify a condition as met or waived.

    POST /api/v1/applications/{id}/conditions/{cid}/verify/
    Admin only.

    Requirements: 5.10
    """

    permission_classes = [IsAdmin]
    serializer_class = ConditionVerifyRequestSerializer

    def post(self, request, application_id, condition_id):
        from apps.applications.condition_manager import ConditionError, ConditionManager

        try:
            Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            condition = ApplicationCondition.objects.get(
                id=condition_id, application_id=application_id,
            )
        except ApplicationCondition.DoesNotExist:
            return Response(
                {"success": False, "error": "Condition not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ConditionVerifyRequestSerializer(data=request.data)
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

        target_status = serializer.validated_data["status"]

        try:
            updated_condition = ConditionManager.verify_condition(
                condition_id=str(condition_id),
                status=target_status,
                admin_id=str(request.user.id),
            )
        except ConditionError as exc:
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = ApplicationConditionSerializer(updated_condition).data
        return Response({"success": True, "data": data})


class ApplicationAdminSummaryView(APIView):
    """GET /api/v1/applications/{id}/admin-summary/

    Returns an AI-generated review brief for admins. Best-effort.
    """

    permission_classes = [IsAdmin]
    serializer_class = ApplicationAiSummaryResponseSerializer
    # AI hardening: per-admin rate throttle (60/hour) when flag is on.
    throttle_classes = [AIUserScopedRateThrottle]
    throttle_scope = "ai_admin_summary"

    @extend_schema(
        request=None,
        responses={
            200: OpenApiResponse(response=ApplicationAiSummaryResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["applications"],
        summary="Get AI-generated admin review brief",
    )
    def get(self, request, application_id):
        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        from apps.applications.serializers import build_grades_summary
        from apps.common.ai_cache import (
            cached_ai_call,
            compute_application_fingerprint,
        )

        docs = ApplicationDocument.objects.filter(application_id=app.id).values_list("document_type", flat=True)
        docs_summary = ", ".join(docs) if docs else "No documents uploaded"

        # Super-admin-only cache bypass — audit-logged via the existing
        # middleware. Non-super-admins always read from cache when
        # available.
        force_refresh = False
        if request.query_params.get("refresh") == "1":
            if getattr(request.user, "role", None) == "super_admin":
                force_refresh = True
                logger.info(
                    "ai_cache: admin-summary force refresh app=%s by=%s",
                    app.id, request.user.id,
                )

        fingerprint = compute_application_fingerprint(
            app.id,
            app.updated_at,
            extra=f"payment:{app.payment_status or ''}|status:{app.status}",
        )

        def _generate():
            from apps.common.ai_prompt_redactor import redact_for_admin_summary
            from apps.common.ai_service import generate_admin_review_summary

            raw = {
                "full_name": app.full_name,
                "program": app.program,
                "institution": app.institution,
                "intake": app.intake,
                "nrc_number": app.nrc_number or app.passport_number or "Not provided",
                "nationality": getattr(app, "nationality", None) or "Unknown",
                "sex": app.sex,
                "date_of_birth": str(app.date_of_birth) if app.date_of_birth else "Unknown",
                "payment_status": app.payment_status or "unpaid",
                "documents_summary": docs_summary,
                "grades_summary": build_grades_summary(app),
            }
            redacted = redact_for_admin_summary(raw)
            return generate_admin_review_summary(redacted)

        summary = None
        try:
            summary = cached_ai_call(
                namespace="admin_summary",
                fingerprint=fingerprint,
                generator=_generate,
                refresh=force_refresh,
            )
        except Exception:
            pass

        return Response(
            {
                "success": True,
                "data": {"summary": summary},
            }
        )

