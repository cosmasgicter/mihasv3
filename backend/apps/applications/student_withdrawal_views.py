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
    ApplicationWaitlistPositionResponseSerializer,
)
from apps.applications.services import (
    ApplicationSubmissionError,
    submit_application,
)
from apps.common.idempotency import idempotent
from apps.common.object_authorization import authorize_owned_application
from apps.common.openapi_helpers import ErrorResponseSerializer
from apps.documents.models import Payment
from rest_framework.throttling import UserRateThrottle


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
    Owner only - admins use the review endpoint for rejection.
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
        # AUTH-07: owner-only endpoint. A valid-but-non-owned id is masked as a
        # canonical 404 (never a distinguishable 403 that leaks existence).
        denied = authorize_owned_application(request, app, allow_scoped_staff=False)
        if denied is not None:
            return denied

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

        # AUTH-07: owner or capability-scoped staff. A non-owner student and an
        # out-of-scope staff caller are both masked as an identical canonical
        # 404 — no distinguishable 403 that leaks existence. Role is only an
        # input to AccessScopeService scope, never a raw authority gate.
        denied = authorize_owned_application(request, app, allow_scoped_staff=True)
        if denied is not None:
            return denied

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
    """List conditions for an application, with their evidence and history.

    GET /api/v1/applications/{id}/conditions/
    Owner or capability-scoped staff.

    Task 10.2 (R13.9, STU-16) made this read useful rather than a status list:
    every condition now carries its state definition, who the state is waiting
    on, its current evidence version and the superseded ones, the reviewer's
    reason, the append-only history, and the actions **this** reader may take.
    The pre-10.2 keys are unchanged, so existing readers keep working; the whole
    list costs two extra queries, never one per condition.

    Requirements: 5.9, R13.2, R13.9
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationConditionSerializer

    def get(self, request, application_id):
        from apps.applications import condition_evidence_service as condition_service
        from apps.common.object_authorization import actor_owns_application

        try:
            app = Application.objects.select_related("user").get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # AUTH-07: owner or capability-scoped staff; non-owner / out-of-scope
        # collapse to the identical canonical 404 mask (no existence leak).
        denied = authorize_owned_application(request, app, allow_scoped_staff=True)
        if denied is not None:
            return denied

        conditions = ApplicationCondition.objects.filter(
            application_id=application_id,
        ).order_by("deadline", "created_at")

        data = condition_service.conditions_payload(
            app,
            conditions,
            is_owner=actor_owns_application(app, request.user),
        )
        return Response({"success": True, "data": data})


# ---------------------------------------------------------------------------
# Confirm Enrollment (Req 10.5)
# ---------------------------------------------------------------------------


class ApplicationConfirmEnrollmentView(APIView):
    """Student enrollment confirmation.

    POST /api/v1/applications/{id}/confirm-enrollment/
    Owner only.

    Task 10.3 (R13.9, design §11.2, findings STU-15 / DATA-03) made the command
    transactional: ``EnrollmentService.confirm_enrollment`` now locks the
    Intake_Offering capacity row and then the application row (task 5.3's fixed
    order) and re-runs the **same** readiness evaluation the read contracts
    publish, so status, every condition, the deadline, capacity and any existing
    enrollment are all re-read under the lock rather than before the transaction
    opened. The view holds no lifecycle logic — it maps stable codes onto the
    envelope.

    Requirements: 10.5, R13.9, R17.1
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
    @idempotent
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
        # AUTH-07: owner-only endpoint; a valid-but-non-owned id -> canonical 404 mask.
        denied = authorize_owned_application(request, app, allow_scoped_staff=False)
        if denied is not None:
            return denied

        try:
            enrolled_app = EnrollmentService.confirm_enrollment(
                application_id=str(application_id),
                user_id=user_id,
            )
        except EnrollmentError as exc:
            # A refusal that conflicts with committed state (a duplicate
            # enrollment, an offering with no seat left) answers 409; every
            # pre-10.3 refusal keeps its 400 through the error's default.
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=getattr(exc, "status_code", status.HTTP_400_BAD_REQUEST),
            )

        return Response({"success": True, "data": ApplicationSerializer(enrolled_app).data})

