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
from apps.catalog.services import AccessScopeService
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
# Bulk Status Update
# ---------------------------------------------------------------------------


@extend_schema_view(
    post=extend_schema(
        operation_id="applications_bulk_status_update",
        tags=["applications"],
        request=ApplicationBulkStatusSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationBulkStatusResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class ApplicationBulkStatusView(APIView):
    """Batch status transitions with safety guardrails.

    Requirements: 13.1–13.9
    """

    permission_classes = [IsAdmin]
    serializer_class = ApplicationBulkStatusSerializer

    MAX_BATCH_SIZE = 25

    def post(self, request):
        import hashlib as _hashlib

        from apps.applications.services import ALLOWED_TRANSITIONS, transition_application_status

        serializer = ApplicationBulkStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        app_ids = serializer.validated_data["application_ids"]
        new_status = serializer.validated_data["new_status"]
        notes = serializer.validated_data.get("notes", "")
        confirmation_token = (request.data or {}).get("confirmation_token", "")

        if len(app_ids) > self.MAX_BATCH_SIZE:
            return Response(
                {
                    "success": False,
                    "error": f"Batch size exceeds maximum of {self.MAX_BATCH_SIZE}.",
                    "code": "BATCH_SIZE_EXCEEDED",
                    "limit": self.MAX_BATCH_SIZE,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        sorted_ids = sorted(str(aid) for aid in app_ids)
        expected_token = _hashlib.sha256(
            ("".join(sorted_ids) + new_status).encode("utf-8")
        ).hexdigest()

        if confirmation_token != expected_token:
            return Response(
                {
                    "success": False,
                    "error": "Invalid confirmation_token. Compute SHA-256 of sorted application IDs + target status.",
                    "code": "INVALID_CONFIRMATION_TOKEN",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        failures = []
        try:
            with transaction.atomic():
                applications = list(Application.objects.filter(id__in=app_ids).select_for_update())

                # R5.2/R5.9: narrow the batch through AccessScopeService so a
                # scoped admin can never transition another school's
                # applications. Out-of-scope ids are reported as NOT_FOUND —
                # byte-identical to a genuinely missing id — so existence
                # cannot be inferred (R5.4, R16.4). Super-admins keep all ids.
                in_scope_ids = set(
                    str(pk)
                    for pk in AccessScopeService()
                    .filter_applications(
                        Application.objects.filter(id__in=[a.id for a in applications]),
                        request.user,
                    )
                    .values_list("id", flat=True)
                )
                applications = [a for a in applications if str(a.id) in in_scope_ids]

                found_ids = {str(a.id) for a in applications}
                for aid in app_ids:
                    if str(aid) not in found_ids:
                        failures.append({"application_id": str(aid), "code": "NOT_FOUND"})

                for app in applications:
                    allowed = ALLOWED_TRANSITIONS.get(app.status, set())
                    if new_status not in allowed:
                        failures.append({
                            "application_id": str(app.id),
                            "code": "INVALID_STATUS_TRANSITION",
                            "current_status": app.status,
                        })

                if failures:
                    raise ValueError("Validation failed")

                for app in applications:
                    transition_application_status(
                        application=app,
                        new_status=new_status,
                        changed_by=str(request.user.id),
                        notes=notes,
                    )

        except ValueError:
            return Response(
                {
                    "success": False,
                    "error": "Batch validation failed. No applications were updated.",
                    "code": "BATCH_VALIDATION_FAILED",
                    "failures": failures,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            logger.exception("Bulk status update failed for applications %s", app_ids)
            return Response({"success": False, "error": "Bulk status update failed", "code": "BULK_UPDATE_ERROR"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Trigger waitlist promotion for batch rejections
        if new_status == "rejected":
            try:
                from apps.applications.waitlist_manager import WaitlistManager
                programs_intakes = {(a.program, a.intake) for a in applications}
                for program, intake in programs_intakes:
                    WaitlistManager.promote_next(program, intake)
            except Exception:
                logger.exception("Failed to trigger waitlist promotion after bulk rejection")

        return Response({"success": True, "data": {"updated_count": len(app_ids)}})

