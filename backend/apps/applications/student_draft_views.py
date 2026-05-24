"""Student-facing application views.

Extracted during the views module split (production-readiness-hardening, task 9.1).
Contains views for application creation, drafts, submission, withdrawal,
enrollment confirmation, amendments, waitlist position, and conditions.
"""

import logging

from django.core.exceptions import ValidationError as DjangoValidationError
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


def _json_depth(obj, current=0, max_depth=11):
    """Return nesting depth of a JSON-like structure. Stops early if exceeds max_depth."""
    if current > max_depth:
        return current
    if isinstance(obj, dict):
        return max((_json_depth(v, current + 1, max_depth) for v in obj.values()), default=current)
    if isinstance(obj, list):
        return max((_json_depth(item, current + 1, max_depth) for item in obj), default=current)
    return current


# ---------------------------------------------------------------------------
# Application Create (POST /api/v1/applications/)
# ---------------------------------------------------------------------------

# Note: ApplicationListCreateView handles both list (admin) and create (student).
# It lives in admin_views.py since the GET is admin-oriented; the POST portion
# is student-oriented but kept together for URL routing simplicity.


# ---------------------------------------------------------------------------
# Application Detail / Update / Delete
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="applications_retrieve",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Application UUID."),
        ],
        responses={
            200: OpenApiResponse(response=ApplicationResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    patch=extend_schema(
        operation_id="applications_update",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Application UUID."),
        ],
        request=ApplicationSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    delete=extend_schema(
        operation_id="applications_delete",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Application UUID."),
        ],
        request=None,
        responses={204: OpenApiResponse(description="Application deleted or already absent.")},
    ),
)
@extend_schema_view(
    get=extend_schema(operation_id="application_retrieve", tags=["applications"]),
    put=extend_schema(operation_id="application_update", tags=["applications"]),
    patch=extend_schema(operation_id="application_partial_update", tags=["applications"]),
    delete=extend_schema(operation_id="application_delete", tags=["applications"]),
)
class ApplicationDetailView(APIView):
    permission_classes = [IsOwnerOrAdmin]
    serializer_class = ApplicationSerializer

    @staticmethod
    def _student_can_mutate_application(request, app) -> bool:
        role = getattr(request.user, 'role', 'student')
        return role in ('admin', 'super_admin') or app.status == 'draft'

    def get(self, request, application_id):
        app = self._get_application(request, application_id)
        if app is None:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        data = ApplicationSerializer(app).data
        # Include intake capacity info for admin users (Req 18.1)
        role = getattr(request.user, 'role', 'student')
        if role in ('admin', 'super_admin', 'admissions_officer'):
            try:
                from apps.catalog.models import Intake
                intake = Intake.objects.filter(name=app.intake, is_active=True).first()
                if intake:
                    data["intake_capacity"] = intake.max_capacity
                    data["intake_enrollment"] = intake.current_enrollment
            except Exception:
                pass
        return Response({"success": True, "data": data})

    def patch(self, request, application_id):
        return self._update_application(request, application_id)

    def put(self, request, application_id):
        return self._update_application(request, application_id)

    def _update_application(self, request, application_id):
        app = self._get_application(request, application_id)
        if app is None:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        if not self._student_can_mutate_application(request, app):
            return Response(
                {"success": False, "error": "Application is not editable", "code": "APPLICATION_NOT_EDITABLE"},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = ApplicationSerializer(app, data=request.data, partial=True, context={'request': request})
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response({"success": True, "data": serializer.data})

    def delete(self, request, application_id):
        app = self._get_application(request, application_id)
        if app is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        if app.status != 'draft':
            return Response(
                {"success": False, "error": "Only draft applications can be deleted", "code": "APPLICATION_NOT_EDITABLE"},
                status=status.HTTP_403_FORBIDDEN,
            )
        role = getattr(request.user, 'role', 'student')
        if role not in ('admin', 'super_admin') and str(app.user_id) != str(request.user.id):
            return Response(
                {"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if Payment.objects.filter(application_id=app.id).exists():
            return Response(
                {
                    "success": False,
                    "error": (
                        "This draft has payment activity and cannot be deleted. "
                        "Continue the application or contact admissions for help."
                    ),
                    "code": "DRAFT_HAS_PAYMENT_ACTIVITY",
                },
                status=status.HTTP_409_CONFLICT,
            )

        try:
            self._delete_application_graph(app)
        except Exception:
            logger.exception("Failed to delete application %s", application_id)
            return Response(
                {
                    "success": False,
                    "error": "Application could not be deleted. Please try again.",
                    "code": "APPLICATION_DELETE_FAILED",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @staticmethod
    def _delete_application_graph(application):
        """Delete an application and dependents in one transaction.

        Use the application instance rather than a hand-maintained child-table
        list so reverse relations and database-level cascades stay aligned with
        the live schema.
        """
        with transaction.atomic():
            application.delete()

    def _get_application(self, request, application_id):
        try:
            app = _with_payment_summary(
                Application.objects.select_related('user').prefetch_related(
                    'applicationdocument_set', 'applicationgrade_set', 'applicationinterview_set',
                )
            ).get(id=application_id)
        except Application.DoesNotExist:
            return None
        if not IsOwnerOrAdmin().has_object_permission(request, self, app):
            return None
        return app


@extend_schema_view(
    get=extend_schema(operation_id="application_details_retrieve", tags=["applications"]),
    put=extend_schema(operation_id="application_details_update", tags=["applications"]),
    patch=extend_schema(operation_id="application_details_partial_update", tags=["applications"]),
    delete=extend_schema(operation_id="application_details_delete", tags=["applications"]),
)
class ApplicationDetailsView(ApplicationDetailView):
    """Alias for ApplicationDetailView at /<id>/details/ with distinct operation IDs."""
    pass


# ---------------------------------------------------------------------------
# Draft
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="applications_draft_retrieve",
        tags=["applications"],
        responses={
            200: OpenApiResponse(response=ApplicationDraftResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    post=extend_schema(
        operation_id="applications_draft_save",
        tags=["applications"],
        request=ApplicationDraftWriteSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationDraftResponseSerializer),
            201: OpenApiResponse(response=ApplicationDraftResponseSerializer),
        },
    ),
)
class ApplicationDraftView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationDraftWriteSerializer

    def get(self, request):
        from apps.applications.serializers import ApplicationDraftSerializer

        user_id = str(request.user.id)
        draft = ApplicationDraft.objects.filter(user_id=user_id).order_by("-updated_at").first()
        if not draft:
            return Response({"success": False, "error": "No draft found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"success": True, "data": ApplicationDraftSerializer(draft).data})

    def post(self, request):
        import json as _json
        from apps.applications.serializers import ApplicationDraftSerializer

        user_id = str(request.user.id)
        draft_data = request.data.get("draft_data", {})

        # --- Input validation: size and depth caps (DoS prevention) ---
        MAX_DRAFT_DATA_BYTES = 512 * 1024  # 512KB
        try:
            serialized = _json.dumps(draft_data)
        except (TypeError, ValueError):
            return Response(
                {"success": False, "error": {"code": "INVALID_DRAFT_DATA", "message": "draft_data must be JSON-serializable"}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(serialized.encode("utf-8")) > MAX_DRAFT_DATA_BYTES:
            return Response(
                {"success": False, "error": {"code": "DRAFT_TOO_LARGE", "message": f"draft_data exceeds {MAX_DRAFT_DATA_BYTES} bytes"}},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        if _json_depth(draft_data) > 10:
            return Response(
                {"success": False, "error": {"code": "DRAFT_TOO_NESTED", "message": "draft_data exceeds maximum nesting depth of 10"}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        application_id = request.data.get("application_id")
        if application_id:
            try:
                application = Application.objects.only("id", "user_id").get(id=application_id)
            except DjangoValidationError:
                return Response(
                    {"success": False, "error": "Invalid application id", "code": "VALIDATION_ERROR"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            except Application.DoesNotExist:
                return Response(
                    {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                    status=status.HTTP_404_NOT_FOUND,
                )

            role = getattr(request.user, "role", "student")
            if role not in ("admin", "super_admin") and str(application.user_id) != user_id:
                return Response(
                    {"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        draft, created = ApplicationDraft.objects.update_or_create(user_id=user_id, application_id=application_id, defaults={"draft_data": draft_data})
        resp_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response({"success": True, "data": ApplicationDraftSerializer(draft).data}, status=resp_status)
