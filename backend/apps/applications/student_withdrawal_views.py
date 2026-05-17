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
# Withdrawal (Req 1.9, 1.10)
# ---------------------------------------------------------------------------


@extend_schema_view(
    post=extend_schema(
        operation_id="applications_withdraw",
        tags=["applications"],
        parameters=[
            OpenApiParameter(
                "application_id",
                OpenApiTypes.UUID,
                OpenApiParameter.PATH,
                description="Application UUID.",
            ),
        ],
        request=WithdrawalReasonSerializer,
        responses={
            200: OpenApiResponse(response=WithdrawalResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            409: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class ApplicationWithdrawView(APIView):
    """Student-initiated application withdrawal.

    POST /api/v1/applications/{id}/withdraw/
    Owner only — admins use the review endpoint for rejection.
    Supports idempotency via ``Idempotency-Key`` header.

    Requirements: 1.9, 1.10
    """

    permission_classes = [IsAuthenticated]
    serializer_class = WithdrawalReasonSerializer

    @idempotent
    def post(self, request, application_id):
        from apps.applications.withdrawal_service import WithdrawalError, WithdrawalService

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
                    "error": "Only the application owner can withdraw.",
                    "code": "INSUFFICIENT_PERMISSIONS",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        withdrawal_reason = (request.data or {}).get("withdrawal_reason", "")
        ip_address = request.META.get("REMOTE_ADDR", "")
        user_agent = request.META.get("HTTP_USER_AGENT", "")

        try:
            withdrawn_app = WithdrawalService.withdraw(
                application_id=str(application_id),
                user_id=user_id,
                reason=withdrawal_reason,
                ip_address=ip_address,
                user_agent=user_agent,
            )
        except WithdrawalError as exc:
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({"success": True, "data": ApplicationSerializer(withdrawn_app).data})


# ---------------------------------------------------------------------------
# Waitlist Position (Req 3.9)
# ---------------------------------------------------------------------------


class ApplicationWaitlistPositionView(APIView):
    """Return waitlist position and total for an application.

    GET /api/v1/applications/{id}/waitlist-position/
    Owner or admin.

    Requirements: 3.9
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationWaitlistPositionResponseSerializer

    @extend_schema(
        request=None,
        responses={
            200: OpenApiResponse(response=ApplicationWaitlistPositionResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["applications"],
        summary="Get waitlist position and total",
    )
    def get(self, request, application_id):
        from apps.applications.waitlist_manager import WaitlistError, WaitlistManager

        try:
            app = Application.objects.select_related("user").get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        user_id = str(getattr(request.user, "id", ""))
        role = getattr(request.user, "role", "")
        is_admin = role in ("admin", "super_admin")
        is_owner = str(app.user_id) == user_id

        if not is_owner and not is_admin:
            return Response(
                {
                    "success": False,
                    "error": "You do not have permission to view this.",
                    "code": "INSUFFICIENT_PERMISSIONS",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            position_data = WaitlistManager.get_position(str(application_id))
        except WaitlistError as exc:
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({"success": True, "data": position_data})


# ---------------------------------------------------------------------------
# Conditions (Req 5.9)
# ---------------------------------------------------------------------------


class ApplicationConditionsView(APIView):
    """List conditions for an application.

    GET /api/v1/applications/{id}/conditions/
    Owner or admin.

    Requirements: 5.9
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationConditionSerializer

    def get(self, request, application_id):
        try:
            app = Application.objects.select_related("user").get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        user_id = str(getattr(request.user, "id", ""))
        role = getattr(request.user, "role", "")
        is_admin = role in ("admin", "super_admin")
        is_owner = str(app.user_id) == user_id

        if not is_owner and not is_admin:
            return Response(
                {
                    "success": False,
                    "error": "You do not have permission to view this.",
                    "code": "INSUFFICIENT_PERMISSIONS",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        conditions = ApplicationCondition.objects.filter(
            application_id=application_id,
        ).order_by("deadline", "created_at")

        data = ApplicationConditionSerializer(conditions, many=True).data
        return Response({"success": True, "data": data})


# ---------------------------------------------------------------------------
# Confirm Enrollment (Req 10.5)
# ---------------------------------------------------------------------------


class ApplicationConfirmEnrollmentView(APIView):
    """Student enrollment confirmation.

    POST /api/v1/applications/{id}/confirm-enrollment/
    Owner only.

    Requirements: 10.5
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationConfirmEnrollmentRequestSerializer

    @extend_schema(
        request=ApplicationConfirmEnrollmentRequestSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationEnvelopeResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["applications"],
        summary="Confirm enrollment (owner-only)",
    )
    def post(self, request, application_id):
        from apps.applications.enrollment_service import EnrollmentError, EnrollmentService

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
                    "error": "Only the application owner can confirm enrollment.",
                    "code": "INSUFFICIENT_PERMISSIONS",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            enrolled_app = EnrollmentService.confirm_enrollment(
                application_id=str(application_id),
                user_id=user_id,
            )
        except EnrollmentError as exc:
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({"success": True, "data": ApplicationSerializer(enrolled_app).data})

