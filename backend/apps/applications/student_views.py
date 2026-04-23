"""Student-facing application views.

Extracted during the views module split (production-readiness-hardening, task 9.1).
Contains views for application creation, drafts, submission, withdrawal,
enrollment confirmation, amendments, waitlist position, and conditions.
"""

import logging

from django.db import DatabaseError, connection, transaction
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
    ApplicationCondition,
    ApplicationDraft,
    ApplicationStatusHistory,
)
from apps.applications.serializers import (
    ApplicationCreateSerializer,
    ApplicationGradeSerializer,
    ApplicationSerializer,
    build_grades_payload,
    build_grades_summary,
)
from apps.applications.services import (
    ApplicationSubmissionError,
    submit_application,
)
from apps.common.idempotency import idempotent
from apps.common.openapi_helpers import ErrorResponseSerializer
from apps.documents.models import ApplicationDocument, ApplicationGrade, Payment

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
    _application_delete_statements = (
        "DELETE FROM application_documents WHERE application_id = %s",
        "DELETE FROM application_grades WHERE application_id = %s",
        "DELETE FROM payments WHERE application_id = %s",
        "DELETE FROM application_status_history WHERE application_id = %s",
        "DELETE FROM application_drafts WHERE application_id = %s",
        "DELETE FROM application_interviews WHERE application_id = %s",
        "DELETE FROM application_conditions WHERE application_id = %s",
        "DELETE FROM application_amendments WHERE application_id = %s",
        "DELETE FROM fee_waivers WHERE application_id = %s",
        "DELETE FROM documents WHERE application_id = %s",
        "DELETE FROM applications WHERE id = %s",
    )

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
        if not self._student_can_mutate_application(request, app):
            return Response(
                {"success": False, "error": "Only draft applications can be deleted by students", "code": "APPLICATION_NOT_EDITABLE"},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            self._delete_application_graph(application_id)
        except DatabaseError:
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

    @classmethod
    def _delete_application_graph(cls, application_id):
        """Delete an application and known dependents without relying on ORM cascade."""
        application_id_value = str(application_id)
        with transaction.atomic():
            with connection.cursor() as cursor:
                for statement in cls._application_delete_statements:
                    cursor.execute(statement, [application_id_value])

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
# Application Documents (student read)
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="applications_documents_list",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Application UUID."),
        ],
        responses={
            200: OpenApiResponse(response=ApplicationDocumentsResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class ApplicationDocumentsView(APIView):
    permission_classes = [IsOwnerOrAdmin]

    def get(self, request, application_id):
        from apps.documents.serializers import DocumentSerializer

        try:
            app = _with_payment_summary(Application.objects.all()).get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        if not IsOwnerOrAdmin().has_object_permission(request, self, app):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)
        docs = ApplicationDocument.objects.select_related('application').filter(application_id=application_id)
        return Response({"success": True, "data": DocumentSerializer(docs, many=True).data})


# ---------------------------------------------------------------------------
# Application Grades
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="applications_grades_list",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Application UUID."),
        ],
        responses={
            200: OpenApiResponse(response=ApplicationGradesResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    post=extend_schema(
        operation_id="applications_grades_upsert",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Application UUID."),
        ],
        request=ApplicationGradeRequestSerializer,
        responses={
            200: OpenApiResponse(
                response=ApplicationGradeMutationResponseSerializer,
                description="Updates one or more grades for the application.",
            ),
            201: OpenApiResponse(
                response=ApplicationGradeMutationResponseSerializer,
                description="Creates a new single grade entry for the application.",
            ),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class ApplicationGradesView(APIView):
    permission_classes = [IsOwnerOrAdmin]
    serializer_class = ApplicationGradeReadSerializer

    def get(self, request, application_id):
        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        if not IsOwnerOrAdmin().has_object_permission(request, self, app):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)
        grades = ApplicationGrade.objects.filter(application_id=application_id)
        data = [
            {
                "id": str(g.id),
                "subject_id": str(g.subject_id),
                "grade": g.grade,
                "created_at": g.created_at.isoformat() if g.created_at else None,
            }
            for g in grades
        ]
        return Response({"success": True, "data": data})

    def post(self, request, application_id):
        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        if not IsOwnerOrAdmin().has_object_permission(request, self, app):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)
        role = getattr(request.user, 'role', 'student')
        if role not in ("admin", "super_admin") and app.status != "draft":
            return Response(
                {"success": False, "error": "Application is not editable", "code": "APPLICATION_NOT_EDITABLE"},
                status=status.HTTP_403_FORBIDDEN,
            )
        batch = request.data.get("grades") if isinstance(request.data, dict) else None
        if isinstance(batch, list):
            created = []
            for item in batch:
                serializer = ApplicationGradeSerializer(data=item)
                if not serializer.is_valid():
                    return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
                grade, _created = ApplicationGrade.objects.update_or_create(
                    application_id=application_id,
                    subject_id=serializer.validated_data["subject_id"],
                    defaults={"grade": serializer.validated_data["grade"]},
                )
                created.append({"id": str(grade.id), "subject_id": str(grade.subject_id), "grade": grade.grade})
            return Response({"success": True, "data": {"grades": created}}, status=status.HTTP_200_OK)

        serializer = ApplicationGradeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        grade, created = ApplicationGrade.objects.update_or_create(
            application_id=application_id,
            subject_id=serializer.validated_data["subject_id"],
            defaults={"grade": serializer.validated_data["grade"]},
        )
        return Response({"success": True, "data": {"id": str(grade.id), "subject_id": str(grade.subject_id), "grade": grade.grade}}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Application Summary
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="applications_summary_retrieve",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Application UUID."),
        ],
        responses={
            200: OpenApiResponse(response=ApplicationSummaryResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class ApplicationSummaryView(APIView):
    permission_classes = [IsOwnerOrAdmin]
    serializer_class = ApplicationSummarySerializer

    def get(self, request, application_id):
        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        if not IsOwnerOrAdmin().has_object_permission(request, self, app):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)
        docs_count = ApplicationDocument.objects.filter(application_id=application_id).count()
        grades_count = ApplicationGrade.objects.filter(application_id=application_id).count()
        history_rows = (
            ApplicationStatusHistory.objects.filter(application_id=application_id)
            .select_related("changed_by")
            .order_by("-created_at")[:10]
        )
        history = []
        for row in history_rows:
            changed_by_name = ""
            if row.changed_by:
                changed_by_name = f"{row.changed_by.first_name} {row.changed_by.last_name}".strip() or row.changed_by.email
            history.append(
                {
                    "id": str(row.id),
                    "status": row.new_status,
                    "old_status": row.old_status,
                    "new_status": row.new_status,
                    "notes": row.notes,
                    "created_at": row.created_at,
                    "changed_by": str(row.changed_by_id) if row.changed_by_id else None,
                    "changed_by_name": changed_by_name,
                    "changed_by_profile": {
                        "email": row.changed_by.email,
                        "full_name": changed_by_name,
                    }
                    if row.changed_by
                    else None,
                }
            )
        # AI-powered summary for admin reviewers (best-effort)
        ai_summary = None
        role = getattr(request.user, "role", "student")
        if role in ("admin", "super_admin", "reviewer"):
            try:
                from apps.common.ai_service import summarize_application
                ai_summary = summarize_application({
                    "full_name": app.full_name,
                    "program": app.program,
                    "status": app.status,
                    "payment_status": app.payment_status,
                    "grades_summary": build_grades_summary(app),
                    "nationality": getattr(app, "nationality", ""),
                    "institution": getattr(app, "institution", ""),
                })
            except Exception:
                pass
        return Response(
            {
                "success": True,
                "data": {
                    "application": ApplicationSerializer(app).data,
                    "documents_count": docs_count,
                    "grades_count": grades_count,
                    "status_history": history,
                    "ai_summary": ai_summary,
                    "grades_summary": build_grades_summary(app),
                    "grades": build_grades_payload(app),
                },
            }
        )


# ---------------------------------------------------------------------------
# Application Preview Summary (AI-powered)
# ---------------------------------------------------------------------------


class ApplicationPreviewSummaryView(APIView):
    """GET /api/v1/applications/{id}/preview-summary/

    Returns a personalized AI-generated summary for the student's review step.
    Best-effort — returns null if AI is unavailable.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, application_id):
        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if str(app.user_id) != str(request.user.id):
            return Response(
                {"success": False, "error": "Not authorized", "code": "INSUFFICIENT_PERMISSIONS"},
                status=status.HTTP_403_FORBIDDEN,
            )

        subjects_count = ApplicationGrade.objects.filter(application_id=app.id).count()
        first_name = (app.full_name or "").split()[0] or "Student"
        program = app.program or "your chosen programme"
        intake = getattr(app, "intake", "") or ""

        # Try AI summary, fall back to template
        summary = None
        try:
            from apps.common.ai_service import generate_student_preview_summary
            summary = generate_student_preview_summary({
                "full_name": app.full_name,
                "program": program,
                "institution": getattr(app, "institution", "MIHAS"),
                "intake": intake,
                "grades_summary": build_grades_summary(app),
                "subjects_count": subjects_count,
            })
        except Exception:
            pass

        if not summary or len(summary) < 20:
            parts = [f"{first_name}, your application for {program} is looking great."]
            if subjects_count > 0:
                parts.append(f"You've recorded {subjects_count} subject{'s' if subjects_count != 1 else ''} so far.")
            if intake:
                parts.append(f"Once submitted, the admissions team will review your application for the {intake} promptly.")
            else:
                parts.append("Once submitted, the admissions team will review your application promptly.")
            summary = " ".join(parts)

        return Response({"success": True, "data": {"summary": summary}})

        return Response({"success": True, "data": {"summary": summary}})


# ---------------------------------------------------------------------------
# Submit
# ---------------------------------------------------------------------------


@extend_schema_view(
    post=extend_schema(
        operation_id="applications_submit",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Application UUID."),
        ],
        request=None,
        responses={
            200: OpenApiResponse(response=ApplicationResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class ApplicationSubmitView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationSerializer

    @idempotent
    def post(self, request, application_id):
        try:
            app = _with_payment_summary(Application.objects.select_related("user")).get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not IsOwnerOrAdmin().has_object_permission(request, self, app):
            return Response(
                {"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            submitted_app, _old_status = submit_application(
                application=app,
                changed_by=str(request.user.id),
            )
        except ApplicationSubmissionError as exc:
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_data = ApplicationSerializer(submitted_app).data
        return Response({"success": True, "data": response_data})


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
        from apps.applications.serializers import ApplicationDraftSerializer

        user_id = str(request.user.id)
        draft_data = request.data.get("draft_data", {})
        application_id = request.data.get("application_id")
        draft, created = ApplicationDraft.objects.update_or_create(user_id=user_id, application_id=application_id, defaults={"draft_data": draft_data})
        resp_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response({"success": True, "data": ApplicationDraftSerializer(draft).data}, status=resp_status)


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
# Confirm Enrollment (Req 10.5)
# ---------------------------------------------------------------------------


class ApplicationConfirmEnrollmentView(APIView):
    """Student enrollment confirmation.

    POST /api/v1/applications/{id}/confirm-enrollment/
    Owner only.

    Requirements: 10.5
    """

    permission_classes = [IsAuthenticated]

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
        })


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
# Email Slip
# ---------------------------------------------------------------------------


class EmailSlipView(APIView):
    """POST /api/v1/applications/{id}/email-slip/

    Generates an HTML email with application slip details and queues it
    for delivery via the existing send_email_task + Resend infrastructure.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="applications_email_slip",
        tags=["applications"],
        parameters=[
            OpenApiParameter(
                "application_id",
                OpenApiTypes.UUID,
                OpenApiParameter.PATH,
                description="Application UUID.",
            ),
        ],
        request=EmailSlipSerializer,
        responses={
            200: OpenApiResponse(response=EmailSlipEnvelopeResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
    def post(self, request, application_id):
        try:
            application = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if str(application.user_id) != str(request.user.id):
            role = getattr(request.user, "role", "student")
            if role not in ("admin", "super_admin"):
                return Response(
                    {"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        serializer = EmailSlipSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = serializer.validated_data["email"]

        from django.utils.html import escape as html_escape

        submitted_at = ""
        if application.submitted_at:
            submitted_at = application.submitted_at.strftime("%d %B %Y")
        created_at = ""
        if application.created_at:
            created_at = application.created_at.strftime("%d %B %Y")

        from apps.common.email_templates import get_base_email_html

        status_label = (application.status or "").replace("_", " ").title() or "Pending"

        def _row(label, value):
            return (
                f"<tr><td style='padding:12px 14px;border-bottom:1px solid #e2e8f0;font-weight:600;"
                f"color:#16324f;width:38%;background-color:#f8fbff;'>{label}</td>"
                f"<td style='padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#334155;background-color:#ffffff;'>"
                f"{html_escape(str(value))}</td></tr>"
            )

        tracking_code = (
            getattr(application, "public_tracking_code", "")
            or getattr(application, "tracking_code", "")
            or ""
        )

        slip_html = (
            "<div style='padding-bottom:18px;'>"
            "<div style='font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;font-weight:700;'>"
            "Application record"
            "</div>"
            "<div style='padding-top:10px;font-size:16px;line-height:1.7;color:#334155;'>"
            "Your application slip confirms that your submission has been received and recorded in the MIHAS admissions system."
            "</div>"
            "</div>"
            "<table role='presentation' style='width:100%;border-collapse:separate;border-spacing:0 0;"
            "border:1px solid #dbe5ef;border-radius:18px;overflow:hidden;'>"
            "<tr>"
            "<td style='padding:16px 18px;background:linear-gradient(135deg,#eff6ff 0%,#f8fafc 100%);' colspan='2'>"
            "<div style='font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;font-weight:700;'>"
            "Current status"
            "</div>"
            f"<div style='padding-top:8px;display:inline-block;background-color:#10233f;color:#ffffff;"
            "font-weight:700;font-size:13px;padding:8px 12px;border-radius:999px;'>"
            f"{html_escape(status_label)}</div>"
            "</td>"
            "</tr>"
            + _row("Application Number", application.application_number or "")
            + _row("Applicant Name", application.full_name or "")
            + _row("Program", application.program or "")
            + _row("Tracking Code", tracking_code)
            + _row("Submitted", submitted_at or "Not yet submitted")
            + _row("Created", created_at or "N/A")
            + "</table>"
            "<div style='padding-top:18px;font-size:14px;line-height:1.75;color:#475569;'>"
            "Keep this slip for reference when checking your application status or communicating with the admissions office."
            "</div>"
        )

        body_html = get_base_email_html(slip_html, title="Application Slip")

        from apps.common.outbox import queue_email

        email_record = queue_email(
            recipient_email=email,
            recipient_name=application.full_name,
            subject=f"Application Slip — {application.application_number}",
            body=body_html,
        )

        return Response(
            {"success": True, "data": {"queued_id": str(email_record.id)}},
            status=status.HTTP_200_OK,
        )
