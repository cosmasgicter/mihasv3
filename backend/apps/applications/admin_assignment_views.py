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
# Reviewer Assignment (Req 11)
# ---------------------------------------------------------------------------


class ApplicationAssignView(APIView):
    """Assign an application to a specific reviewer.

    POST /api/v1/applications/{id}/assign/
    Super admin only.

    Requirements: 11.1–11.4, 11.10
    """

    permission_classes = [IsSuperAdmin]
    serializer_class = ApplicationAssignRequestSerializer

    @extend_schema(
        request=ApplicationAssignRequestSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationEnvelopeResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["applications"],
        summary="Assign an application to a reviewer (super-admin only)",
    )
    def post(self, request, application_id):
        from apps.accounts.models import Profile

        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        reviewer_id = (request.data or {}).get("reviewer_id")
        if not reviewer_id:
            return Response(
                {"success": False, "error": "reviewer_id is required.", "code": "VALIDATION_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            reviewer = Profile.objects.get(id=reviewer_id)
        except Profile.DoesNotExist:
            return Response(
                {"success": False, "error": "Reviewer not found.", "code": "REVIEWER_NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if reviewer.role not in ("admin", "reviewer", "super_admin"):
            return Response(
                {
                    "success": False,
                    "error": "Target user must have admin or reviewer role.",
                    "code": "INVALID_REVIEWER_ROLE",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_reviewer_id = str(app.assigned_reviewer_id_id) if app.assigned_reviewer_id_id else None
        app.assigned_reviewer_id = reviewer
        app.save(update_fields=["assigned_reviewer_id"])

        ApplicationStatusHistory.objects.create(
            application=app,
            status=app.status,
            old_status=app.status,
            new_status=app.status,
            changed_by_id=str(request.user.id),
            notes=f"Reviewer assigned: {reviewer.email} (was: {old_reviewer_id or 'unassigned'})",
        )

        try:
            from apps.common.outbox import create_notification
            create_notification(
                user_id=reviewer.id,
                title="Application Assigned to You",
                message=f"Application {app.application_number} for {app.program} ({app.intake}) has been assigned to you for review.",
                type="info",
                priority="normal",
                action_url=f"/admin/applications/{app.id}",
            )
        except Exception:
            logger.exception("Failed to notify reviewer for app=%s", app.id)

        try:
            CommunicationService.send('reviewer_assigned', app)
        except Exception:
            logger.warning("Failed to send reviewer_assigned notification for app=%s", app.id, exc_info=True)

        return Response({
            "success": True,
            "data": {
                "application_id": str(app.id),
                "assigned_reviewer_id": str(reviewer.id),
                "assigned_reviewer_email": reviewer.email,
            },
        })


class ApplicationAutoAssignView(APIView):
    """Auto-assign unassigned submitted applications using round-robin.

    POST /api/v1/applications/auto-assign/
    Super admin only.

    Requirements: 11.5–11.7
    """

    permission_classes = [IsSuperAdmin]
    serializer_class = ApplicationAutoAssignRequestSerializer

    @extend_schema(
        request=ApplicationAutoAssignRequestSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationEnvelopeResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["applications"],
        summary="Auto-assign unassigned applications via round-robin",
    )
    def post(self, request):
        from apps.accounts.models import Profile
        from apps.common.models import Setting

        max_workload = 20
        try:
            setting = Setting.objects.filter(key="max_reviewer_workload").first()
            if setting and setting.value:
                max_workload = int(setting.value)
        except Exception:
            logger.debug("Could not read max_reviewer_workload setting, using default=%s", max_workload, exc_info=True)

        reviewers = list(
            Profile.objects.filter(
                role__in=["admin", "reviewer", "super_admin"],
                is_active=True,
            ).order_by("created_at")
        )

        if not reviewers:
            return Response(
                {"success": False, "error": "No active reviewers available.", "code": "NO_REVIEWERS"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        assigned_count = 0
        assignments = []
        reviewer_idx = 0

        with transaction.atomic():
            unassigned = Application.objects.select_for_update(
                skip_locked=True
            ).filter(
                status__in=["submitted", "under_review"],
                assigned_reviewer_id__isnull=True,
            ).order_by("created_at")

            for app in unassigned:
                assigned = False
                for _ in range(len(reviewers)):
                    reviewer = reviewers[reviewer_idx % len(reviewers)]
                    reviewer_idx += 1

                    current_workload = Application.objects.filter(
                        assigned_reviewer_id=reviewer.id,
                        status__in=["submitted", "under_review", "waitlisted"],
                    ).count()

                    if current_workload < max_workload:
                        app.assigned_reviewer_id = reviewer
                        app.save(update_fields=["assigned_reviewer_id"])

                        ApplicationStatusHistory.objects.create(
                            application=app,
                            status=app.status,
                            old_status=app.status,
                            new_status=app.status,
                            changed_by_id=str(request.user.id),
                            notes=f"Auto-assigned to reviewer: {reviewer.email}",
                        )

                        try:
                            from apps.common.outbox import create_notification
                            create_notification(
                                user_id=reviewer.id,
                                title="Application Assigned",
                                message=f"Application {app.application_number} has been assigned to you for review.",
                                type="assignment",
                                action_url=f"/admin/applications/{app.id}",
                            )
                        except Exception:
                            logger.warning("Failed to notify reviewer %s for auto-assigned app=%s", reviewer.id, app.id, exc_info=True)

                        assignments.append({
                            "application_id": str(app.id),
                            "reviewer_id": str(reviewer.id),
                        })
                        assigned_count += 1
                        assigned = True
                        break

                if not assigned:
                    break

        return Response({
            "success": True,
            "data": {
                "assigned_count": assigned_count,
                "assignments": assignments,
            },
        })


# ---------------------------------------------------------------------------
# Fee Waiver (Req 12)
# ---------------------------------------------------------------------------


class ApplicationFeeWaiverView(APIView):
    """Grant a fee waiver for an application.

    POST /api/v1/applications/{id}/fee-waiver/
    Super admin only.

    Requirements: 12.2, 12.7
    """

    permission_classes = [IsSuperAdmin]
    serializer_class = ApplicationFeeWaiverRequestSerializer

    @extend_schema(
        request=ApplicationFeeWaiverRequestSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationEnvelopeResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["applications"],
        summary="Grant a fee waiver (super-admin only)",
    )
    @idempotent
    def post(self, request, application_id):
        from apps.documents.fee_waiver_service import FeeWaiverError, FeeWaiverService

        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        data = request.data or {}
        waiver_type = data.get("waiver_type")
        reason_code = data.get("reason_code")
        discount_percentage = data.get("discount_percentage", 100)
        notes = data.get("notes", "")

        if not waiver_type or not reason_code:
            return Response(
                {
                    "success": False,
                    "error": "waiver_type and reason_code are required.",
                    "code": "VALIDATION_ERROR",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            waiver = FeeWaiverService.grant_waiver(
                application_id=str(application_id),
                waiver_type=waiver_type,
                reason_code=reason_code,
                discount_percentage=int(discount_percentage),
                admin_id=str(request.user.id),
                notes=notes,
            )
        except FeeWaiverError as exc:
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({
            "success": True,
            "data": {
                "waiver_id": str(waiver.id),
                "application_id": str(app.id),
                "waiver_type": waiver.waiver_type,
                "reason_code": waiver.reason_code,
                "discount_percentage": waiver.discount_percentage,
            },
        })

