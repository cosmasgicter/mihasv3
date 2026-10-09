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
from apps.applications.readiness_service import resolve_minimum_grades
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
    _staff_can_access_application,
    _with_payment_summary,
)

logger = logging.getLogger(__name__)




# ---------------------------------------------------------------------------
# Submit
# ---------------------------------------------------------------------------


class SubmitRateThrottle(UserRateThrottle):
    rate = '5/min'


@extend_schema_view(
    post=extend_schema(
        operation_id="applications_submit",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Application UUID."),
        ],
        request=OpenApiTypes.OBJECT,
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
    throttle_classes = [SubmitRateThrottle]

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

        if isinstance(request.data, dict) and request.data.get("confirm_submission") is True:
            confirmed = True
        else:
            confirmed = False

        if not confirmed:
            return Response(
                {
                    "success": False,
                    "error": "Final submission confirmation is required.",
                    "code": "CONFIRM_SUBMISSION_REQUIRED",
                    "details": {"confirm_submission": ["Set confirm_submission to true before submitting."]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Optional optimistic version (admissions-v2 task 6.5, R10.6). When the
        # client sends the version it read, submission refuses a stale command
        # with VERSION_CONFLICT (409) instead of submitting answers the student
        # never saw. Omitting it keeps the previous behaviour.
        expected_version = None
        raw_version = request.data.get("version") if isinstance(request.data, dict) else None
        if raw_version is not None:
            try:
                expected_version = int(raw_version)
            except (TypeError, ValueError):
                return Response(
                    {
                        "success": False,
                        "error": "Validation failed",
                        "code": "VALIDATION_ERROR",
                        "details": {"version": ["Must be an integer application version."]},
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if app.status == "submitted":
            return Response({"success": True, "data": ApplicationSerializer(app).data}, status=status.HTTP_200_OK)

        try:
            submitted_app, _old_status = submit_application(
                application=app,
                changed_by=str(request.user.id),
                # The declaration accompanies this command and is re-checked
                # under the row lock, not only here (R10.6 "declarations").
                declarations_accepted=confirmed,
                expected_version=expected_version,
            )
        except ApplicationSubmissionError as exc:
            if exc.code == "ALREADY_SUBMITTED":
                current_app = _with_payment_summary(Application.objects.select_related("user")).get(id=application_id)
                if current_app.status == "submitted" and IsOwnerOrAdmin().has_object_permission(request, self, current_app):
                    return Response({"success": True, "data": ApplicationSerializer(current_app).data}, status=status.HTTP_200_OK)
            error_status = getattr(exc, "status_code", None) or status.HTTP_400_BAD_REQUEST
            payload = {"success": False, "error": exc.message, "code": exc.code}
            next_action = getattr(exc, "next_action", None)
            if next_action:
                payload["next_action"] = next_action
            # Surface the retryable flag so the client can distinguish a stable
            # retryable configuration outage (CONFIGURATION_UNAVAILABLE, 503) from
            # a terminal validation failure (R11.6, DATA-04).
            if getattr(exc, "retryable", False):
                payload["retryable"] = True
            return Response(payload, status=error_status)

        response_data = ApplicationSerializer(submitted_app).data
        return Response({"success": True, "data": response_data})


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
            app = Application.objects.select_related('user').get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        if not IsOwnerOrAdmin().has_object_permission(request, self, app):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)
        # R5.2/R5.9: a staff caller authorized by role must also be in
        # AccessScopeService scope for this application; out-of-scope staff
        # reads are masked as not-found (R5.4, R16.4). The owner path is
        # unaffected (the owner is not staff).
        role = getattr(request.user, "role", "student")
        if role in ("admin", "super_admin") and str(app.user_id) != str(getattr(request.user, "id", "")) and not _staff_can_access_application(request, app):
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
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
        # admissions-v2 task 7.4 (R11.1, R11.3, STU-06): this payload used to
        # carry a generative ``ai_summary`` for staff. Admissions is deterministic
        # now — the reviewer's structured readiness checklist is served by the
        # canonical readiness query
        # (``GET /api/v2/student/applications/{id}/readiness/`` →
        # ``review_readiness``), so there is no generated second view of the same
        # facts that could disagree with it.
        return Response(
            {
                "success": True,
                "data": {
                    "application": ApplicationSerializer(app).data,
                    "documents_count": docs_count,
                    "grades_count": grades_count,
                    "status_history": history,
                    "grades_summary": build_grades_summary(app),
                    "grades": build_grades_payload(app),
                },
            }
        )


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
        role = getattr(request.user, "role", "student")
        if role in ("admin", "super_admin") and str(app.user_id) != str(getattr(request.user, "id", "")) and not _staff_can_access_application(request, app):
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
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
        if role in ("admin", "super_admin") and str(app.user_id) != str(getattr(request.user, "id", "")) and not _staff_can_access_application(request, app):
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        if role not in ("admin", "super_admin") and app.status != "draft":
            return Response(
                {"success": False, "error": "Application is not editable", "code": "APPLICATION_NOT_EDITABLE"},
                status=status.HTTP_403_FORBIDDEN,
            )
        batch = request.data.get("grades") if isinstance(request.data, dict) else None
        if isinstance(batch, list):
            normalized = []
            seen_subjects: dict[str, int] = {}
            duplicate_details: dict[str, list[str]] = {}

            for index, item in enumerate(batch):
                serializer = ApplicationGradeSerializer(data=item)
                if not serializer.is_valid():
                    return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": {f"grades.{index}": serializer.errors}}, status=status.HTTP_400_BAD_REQUEST)

                subject_id = str(serializer.validated_data["subject_id"])
                if subject_id in seen_subjects:
                    duplicate_details[f"grades.{index}.subject_id"] = [
                        f"Duplicate subject also selected in row {seen_subjects[subject_id] + 1}."
                    ]
                    continue

                seen_subjects[subject_id] = index
                normalized.append(serializer.validated_data)

            if duplicate_details:
                return Response(
                    {
                        "success": False,
                        "error": "Each subject can only be selected once.",
                        "code": "DUPLICATE_SUBJECT",
                        "details": duplicate_details,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # R11.5 (task 7.1): the minimum is the configured, policy-floored one
            # readiness and submission enforce — never a literal in this view.
            minimum_required = resolve_minimum_grades()
            if len(normalized) < minimum_required:
                shortfall = minimum_required - len(normalized)
                return Response(
                    {
                        "success": False,
                        "error": (
                            f"At least {minimum_required} unique valid subjects are required; "
                            f"received {len(normalized)}."
                        ),
                        "code": "MINIMUM_SUBJECTS_REQUIRED",
                        "details": {
                            "grades": [
                                f"Add {shortfall} more unique subject{'s' if shortfall != 1 else ''}."
                            ]
                        },
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            created = []
            requested_subject_ids = [item["subject_id"] for item in normalized]
            ApplicationGrade.objects.filter(application_id=application_id).exclude(subject_id__in=requested_subject_ids).delete()
            for item in normalized:
                grade, _created = ApplicationGrade.objects.update_or_create(
                    application_id=application_id,
                    subject_id=item["subject_id"],
                    defaults={"grade": item["grade"]},
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

