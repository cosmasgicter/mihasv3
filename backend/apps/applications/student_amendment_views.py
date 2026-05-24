"""Student-facing application views.

Extracted during the views module split (production-readiness-hardening, task 9.1).
Contains views for application creation, drafts, submission, withdrawal,
enrollment confirmation, amendments, waitlist position, and conditions.
"""

import logging

from django.db import transaction
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

from apps.accounts.permissions import IsOwnerOrAdmin
from apps.applications.duplicate_checker import DuplicateChecker
from apps.applications.models import (
    Application,
    ApplicationAmendment,
    ApplicationCondition,
    ApplicationDraft,
    ApplicationInterview,
    ApplicationStatusHistory,
)
from apps.documents.models import ApplicationDocument, ApplicationGrade
from apps.applications.serializers import (
    ApplicationCreateSerializer,
    ApplicationGradeSerializer,
    ApplicationSerializer,
    build_grades_payload,
    build_grades_summary,
    # T15 API remediation
    ApplicationAmendmentRequestSerializer,
    ApplicationConfirmEnrollmentRequestSerializer,
    ApplicationEnvelopeResponseSerializer,
    ApplicationAiSummaryResponseSerializer,
    ApplicationWaitlistPositionResponseSerializer,
)
from apps.applications.services import (
    ApplicationSubmissionError,
    submit_application,
)
from apps.common.idempotency import idempotent
from apps.common.openapi_helpers import ErrorResponseSerializer
from apps.documents.models import Payment
from rest_framework.throttling import UserRateThrottle

from apps.common.throttling import AIUserScopedRateThrottle

from ._view_helpers import (
    ApplicationConditionSerializer,
    ApplicationDraftResponseSerializer,
    ApplicationDraftWriteSerializer,
    ApplicationDocumentsResponseSerializer,
    ApplicationGradeMutationResponseSerializer,
    ApplicationGradeReadSerializer,
    ApplicationGradeRequestSerializer,
    ApplicationGradeMutationSerializer,
    ApplicationResponseSerializer,
    ApplicationSummaryResponseSerializer,
    ApplicationSummarySerializer,
    ApplicationGradesResponseSerializer,
    ConditionVerifyRequestSerializer,
    EmailSlipEnvelopeResponseSerializer,
    EmailSlipSerializer,
    WithdrawalReasonSerializer,
    WithdrawalResponseSerializer,
    _generate_application_number,
    _generate_tracking_code,
    _with_payment_summary,
)

logger = logging.getLogger(__name__)




# ---------------------------------------------------------------------------
# Amendments (Req 14.2)
# ---------------------------------------------------------------------------


class ApplicationAmendmentView(APIView):
    """Request an amendment to a submitted application.

    POST /api/v1/applications/{id}/amendments/
    Owner only.

    Requirements: 14.2
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationAmendmentRequestSerializer

    @extend_schema(
        request=ApplicationAmendmentRequestSerializer,
        responses={
            201: OpenApiResponse(response=ApplicationEnvelopeResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["applications"],
        summary="Request an amendment to a submitted application",
    )
    def post(self, request, application_id):
        from apps.applications.amendment_service import AmendmentError, AmendmentService

        try:
            app = Application.objects.select_related("user").get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        user_id = str(getattr(request.user, "id", ""))
        if str(app.user_id) != user_id:
            return Response(
                {
                    "success": False,
                    "error": "Only the application owner can request amendments.",
                    "code": "INSUFFICIENT_PERMISSIONS",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        data = request.data or {}
        field_name = data.get("field_name")
        new_value = data.get("new_value")
        reason = data.get("reason")

        if not field_name or not new_value or not reason:
            return Response(
                {
                    "success": False,
                    "error": "field_name, new_value, and reason are required.",
                    "code": "VALIDATION_ERROR",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Length limits (input validation hardening)
        if len(str(field_name)) > 100:
            return Response(
                {"success": False, "error": {"code": "FIELD_NAME_TOO_LONG", "message": "field_name exceeds 100 chars"}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(str(new_value)) > 500:
            return Response(
                {"success": False, "error": {"code": "VALUE_TOO_LONG", "message": "new_value exceeds 500 chars"}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(str(reason)) > 1000:
            return Response(
                {"success": False, "error": {"code": "REASON_TOO_LONG", "message": "reason exceeds 1000 chars"}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            amendment = AmendmentService.request_amendment(
                application_id=str(application_id),
                field_name=field_name,
                new_value=new_value,
                reason=reason,
                user_id=user_id,
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
                "application_id": str(app.id),
                "field_name": amendment.field_name,
                "new_value": amendment.new_value,
                "status": amendment.status,
            },
        }, status=status.HTTP_201_CREATED)
