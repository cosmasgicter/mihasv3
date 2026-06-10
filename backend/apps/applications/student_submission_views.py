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

        if app.status == "submitted":
            return Response({"success": True, "data": ApplicationSerializer(app).data}, status=status.HTTP_200_OK)

        try:
            submitted_app, _old_status = submit_application(
                application=app,
                changed_by=str(request.user.id),
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
            return Response(payload, status=error_status)

        response_data = ApplicationSerializer(submitted_app).data
        return Response({"success": True, "data": response_data})


# ---------------------------------------------------------------------------
# Application Preview Summary (AI-powered)
# ---------------------------------------------------------------------------


class ApplicationPreviewSummaryView(APIView):
    """GET /api/v1/applications/{id}/preview-summary/

    Returns a personalized AI-generated summary for the student's review step.
    Cached for 10 minutes per application. Best-effort - returns a template
    fallback if AI is unavailable or slow.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationAiSummaryResponseSerializer
    # AI hardening: per-student rate throttle (10/hour) when flag is on.
    throttle_classes = [AIUserScopedRateThrottle]
    throttle_scope = "ai_student_preview"

    @extend_schema(
        request=None,
        responses={
            200: OpenApiResponse(response=ApplicationAiSummaryResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
        tags=["applications"],
        summary="Get AI-generated application summary (student preview)",
    )
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

        from apps.common.ai_cache import (
            cached_ai_call,
            compute_application_fingerprint,
            compute_grades_fingerprint,
        )

        grades_qs = ApplicationGrade.objects.filter(
            application_id=app.id,
        ).values("subject_id", "grade")
        grades_list = list(grades_qs)
        subjects_count = len({g["subject_id"] for g in grades_list if g.get("subject_id")})

        first_name = (app.full_name or "").split()[0] or "Student"
        program = app.program or "your chosen programme"
        intake = getattr(app, "intake", "") or ""

        # Cache-key fingerprint includes grades - if the student edits
        # grades we regenerate the summary rather than serving stale
        # copy for 24 h.
        grades_fp = compute_grades_fingerprint(grades_list)
        fingerprint = compute_application_fingerprint(
            app.id,
            app.updated_at,
            extra=f"grades:{grades_fp}|intake:{intake}",
        )

        def _generate_ai():
            from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError

            from apps.common.ai_prompt_redactor import redact_for_student_preview
            from apps.common.ai_service import generate_student_preview_summary

            def _call_ai():
                raw = {
                    "full_name": app.full_name,
                    "program": program,
                    "institution": getattr(app, "institution", "MIHAS"),
                    "intake": intake,
                    "grades_summary": build_grades_summary(app),
                    "subjects_count": subjects_count,
                }
                return generate_student_preview_summary(redact_for_student_preview(raw))

            try:
                with ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(_call_ai)
                    result = future.result(timeout=15)
                if result and len(result) >= 50:
                    return result
                return None
            except (FuturesTimeoutError, Exception):
                logger.info("AI preview summary unavailable for %s, using fallback", application_id)
                return None

        summary = None
        source = "fallback"
        try:
            summary = cached_ai_call(
                namespace="student_preview",
                fingerprint=fingerprint,
                generator=_generate_ai,
            )
            if summary and len(summary) >= 50:
                source = "ai"
        except Exception:
            summary = None

        if not summary or len(summary) < 50:
            parts = [f"{first_name}, your application for {program} is looking great."]
            if subjects_count > 0:
                parts.append(f"You've recorded {subjects_count} subject{'s' if subjects_count != 1 else ''} so far.")
            if intake:
                parts.append(f"Once submitted, the admissions team will review your application for the {intake} intake promptly.")
            else:
                parts.append("Once submitted, the admissions team will review your application promptly.")
            summary = " ".join(parts)
            source = "fallback"

        return Response({"success": True, "data": {"summary": summary, "source": source}})


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
                logger.exception("AI summary generation failed for app=%s", app.id)
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

            if len(normalized) < 5:
                return Response(
                    {
                        "success": False,
                        "error": f"At least 5 unique valid subjects are required; received {len(normalized)}.",
                        "code": "MINIMUM_SUBJECTS_REQUIRED",
                        "details": {"grades": [f"Add {5 - len(normalized)} more unique subject{'s' if 5 - len(normalized) != 1 else ''}."]},
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

