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
from apps.common.object_authorization import (
    authorize_owned_application,
    not_found_response,
    resolve_owned_application,
)
from apps.common.openapi_helpers import ErrorResponseSerializer
from apps.common.pagination import StandardPagination
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
# Amendments (Req 14.2)
# ---------------------------------------------------------------------------


class ApplicationAmendmentView(APIView):
    """Request an amendment to a submitted application, and read your own history.

    POST /api/v1/applications/{id}/amendments/ — owner only.
    GET  /api/v1/applications/{id}/amendments/ — owner only (task 10.2, STU-17).

    The GET is the half finding **STU-17** names: a student could submit an
    amendment and then had no way to see whether it had been approved, rejected,
    or was still waiting. Owner-scoped, paginated in the registered envelope
    (``page``/``pageSize``/``totalCount``/``results`` inside ``data``), and a
    valid-but-non-owned application id is the canonical 404 mask (AUTH-07) — the
    same authority the POST already used.

    Requirements: 14.2, R13.9-R13.10
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationAmendmentRequestSerializer

    @extend_schema(
        # Named explicitly: an auto-generated id collides with the detail read
        # below, and drf-spectacular would resolve it with a numeral suffix — which
        # is exactly the schema drift R14.2 forbids.
        operation_id="applications_amendments_list",
        request=None,
        responses={
            200: OpenApiResponse(description="This student's amendment history."),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["applications"],
        summary="List your own amendment requests for one application",
    )
    def get(self, request, application_id):
        from apps.applications.amendment_service import amendment_history_payload

        # Owner-only: an amendment is a change to the applicant's own record, and
        # the staff view of the same work is the review workspace (task 9.4) under
        # its own capability. Reusing that surface here would give the student
        # endpoint two authorities.
        app, denied = resolve_owned_application(
            request, application_id, allow_scoped_staff=False
        )
        if denied is not None:
            return denied

        paginator = StandardPagination()
        queryset = ApplicationAmendment.objects.filter(
            application_id=app.id
        ).order_by("-created_at", "-id")
        page = paginator.paginate_queryset(queryset, request, view=self)
        rows = [amendment_history_payload(row) for row in (page if page is not None else queryset)]
        if page is None:  # pragma: no cover - paginator always returns a page here
            return Response(
                {
                    "success": True,
                    "data": {
                        "page": 1,
                        "pageSize": len(rows),
                        "totalCount": len(rows),
                        "results": rows,
                    },
                }
            )
        return paginator.get_paginated_response(rows)

    @extend_schema(
        request=ApplicationAmendmentRequestSerializer,
        responses={
            201: OpenApiResponse(response=ApplicationEnvelopeResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            409: OpenApiResponse(response=ErrorResponseSerializer),
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
        # AUTH-07: owner-only endpoint. A valid-but-non-owned id is masked as a
        # canonical 404 (never a distinguishable 403 that leaks existence).
        denied = authorize_owned_application(request, app, allow_scoped_staff=False)
        if denied is not None:
            return denied

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
            # Task 10.2: a second pending request for the *same field* is a
            # conflict with an existing request, not a malformed one, so it
            # carries 409 and names the request already in flight. Every other
            # refusal keeps the 400 it has always returned.
            return Response(
                {
                    "success": False,
                    "error": exc.message,
                    "code": exc.code,
                    **({"details": exc.details} if getattr(exc, "details", None) else {}),
                },
                status=getattr(exc, "status_code", None) or status.HTTP_400_BAD_REQUEST,
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


class ApplicationAmendmentDetailView(APIView):
    """Read one of your own amendment requests.

    GET /api/v1/applications/{id}/amendments/{aid}/ — owner only (task 10.2,
    STU-17). Two scopes, in order: the **application** is resolved through the
    owner disclosure policy, then the amendment is looked up *within* that
    application. So another student's amendment id, an amendment id belonging to a
    different application, and an unknown id are one indistinguishable 404.

    Requirements: R13.9-R13.10
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="applications_amendment_retrieve",
        request=None,
        responses={
            200: OpenApiResponse(description="One amendment request with its status."),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["applications"],
        summary="Read one of your own amendment requests",
    )
    def get(self, request, application_id, amendment_id):
        from apps.applications.amendment_service import amendment_history_payload

        app, denied = resolve_owned_application(
            request, application_id, allow_scoped_staff=False
        )
        if denied is not None:
            return denied

        try:
            amendment = ApplicationAmendment.objects.filter(application_id=app.id).get(
                id=amendment_id
            )
        except (ApplicationAmendment.DoesNotExist, ValueError, TypeError):
            return not_found_response("Amendment")

        return Response(
            {"success": True, "data": amendment_history_payload(amendment, detailed=True)}
        )
