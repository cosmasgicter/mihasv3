"""Application views.

Implements task 13.3.
Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10
"""

import csv
import hashlib
import io
import logging
import uuid

from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
    extend_schema_view,
)
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin, IsOwnerOrAdmin
from apps.applications.filters import ApplicationFilter
from apps.applications.models import (
    Application, ApplicationDraft, ApplicationInterview, ApplicationStatusHistory,
)
from apps.applications.serializers import (
    ApplicationBulkStatusSerializer, ApplicationCreateSerializer,
    ApplicationDraftSerializer, ApplicationGradeSerializer,
    ApplicationInterviewSerializer, ApplicationListSerializer,
    ApplicationReviewSerializer, ApplicationSerializer, ApplicationTrackingSerializer,
)
from apps.common.openapi_helpers import (
    ErrorResponseSerializer,
    MessageSerializer,
    StatusTransitionSerializer,
    UpdatedCountSerializer,
    envelope_serializer,
    paginated_serializer,
)
from apps.common.pagination import StandardPagination
from apps.documents.models import ApplicationDocument, ApplicationGrade
from apps.documents.serializers import DocumentSerializer

logger = logging.getLogger(__name__)


class ApplicationGradeReadSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    subject_id = serializers.UUIDField()
    grade = serializers.IntegerField()
    created_at = serializers.DateTimeField(required=False, allow_null=True)


class ApplicationGradeMutationSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    subject_id = serializers.UUIDField(required=False)
    grade = serializers.IntegerField(required=False)
    grades = ApplicationGradeReadSerializer(many=True, required=False)


class ApplicationGradeRequestSerializer(serializers.Serializer):
    subject_id = serializers.UUIDField(required=False)
    grade = serializers.IntegerField(required=False)
    grades = ApplicationGradeSerializer(many=True, required=False)


class ApplicationStatusHistorySerializer(serializers.Serializer):
    old_status = serializers.CharField()
    new_status = serializers.CharField()
    notes = serializers.CharField()
    created_at = serializers.DateTimeField()


class ApplicationSummarySerializer(serializers.Serializer):
    application = ApplicationSerializer()
    documents_count = serializers.IntegerField()
    grades_count = serializers.IntegerField()
    status_history = ApplicationStatusHistorySerializer(many=True)


class ApplicationDraftWriteSerializer(serializers.Serializer):
    application_id = serializers.UUIDField(required=False, allow_null=True)
    draft_data = serializers.JSONField(required=False, default=dict)


class ApplicationInterviewWriteSerializer(serializers.Serializer):
    scheduled_at = serializers.DateTimeField(required=False)
    mode = serializers.CharField(required=False, allow_blank=True)
    location = serializers.CharField(required=False, allow_blank=True)
    status = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)


ApplicationListResponseSerializer = envelope_serializer(
    "ApplicationListResponse",
    paginated_serializer("ApplicationListPage", ApplicationListSerializer),
)
ApplicationResponseSerializer = envelope_serializer(
    "ApplicationResponse",
    ApplicationSerializer(),
)
ApplicationDocumentsResponseSerializer = envelope_serializer(
    "ApplicationDocumentsResponse",
    DocumentSerializer(many=True),
)
ApplicationGradesResponseSerializer = envelope_serializer(
    "ApplicationGradesResponse",
    ApplicationGradeReadSerializer(many=True),
)
ApplicationGradeMutationResponseSerializer = envelope_serializer(
    "ApplicationGradeMutationResponse",
    ApplicationGradeMutationSerializer(),
)
ApplicationDocumentMutationResponseSerializer = envelope_serializer(
    "ApplicationDocumentMutationResponse",
    DocumentSerializer(),
)


class ApplicationAsyncTaskSerializer(serializers.Serializer):
    task_id = serializers.CharField()
    application_id = serializers.UUIDField()
    status = serializers.CharField()


ApplicationAsyncTaskResponseSerializer = envelope_serializer(
    "ApplicationAsyncTaskResponse",
    ApplicationAsyncTaskSerializer(),
)
ApplicationSummaryResponseSerializer = envelope_serializer(
    "ApplicationSummaryResponse",
    ApplicationSummarySerializer(),
)
ApplicationReviewResponseSerializer = envelope_serializer(
    "ApplicationReviewResponse",
    StatusTransitionSerializer(),
)
ApplicationTrackingResponseSerializer = envelope_serializer(
    "ApplicationTrackingResponse",
    ApplicationTrackingSerializer(),
)
ApplicationBulkStatusResponseSerializer = envelope_serializer(
    "ApplicationBulkStatusResponse",
    UpdatedCountSerializer(),
)
ApplicationDraftResponseSerializer = envelope_serializer(
    "ApplicationDraftResponse",
    ApplicationDraftSerializer(),
)
ApplicationInterviewListResponseSerializer = envelope_serializer(
    "ApplicationInterviewListResponse",
    ApplicationInterviewSerializer(many=True),
)
ApplicationInterviewResponseSerializer = envelope_serializer(
    "ApplicationInterviewResponse",
    ApplicationInterviewSerializer(),
)
ApplicationMessageResponseSerializer = envelope_serializer(
    "ApplicationMessageResponse",
    MessageSerializer(),
)


def _generate_application_number():
    return f"APP-{timezone.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"


def _generate_tracking_code():
    return f"TRK-{uuid.uuid4().hex[:12].upper()}"


@extend_schema_view(
    get=extend_schema(
        operation_id="applications_list",
        tags=["applications"],
        parameters=[
            OpenApiParameter("status", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Filter by application status."),
            OpenApiParameter("search", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Searchable fields handled by the application filter."),
            OpenApiParameter("sort", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Custom sort expression."),
            OpenApiParameter("page", OpenApiTypes.INT, OpenApiParameter.QUERY, description="Page number."),
            OpenApiParameter("pageSize", OpenApiTypes.INT, OpenApiParameter.QUERY, description="Page size."),
        ],
        responses={200: OpenApiResponse(response=ApplicationListResponseSerializer)},
    ),
    post=extend_schema(
        operation_id="applications_create",
        tags=["applications"],
        request=ApplicationCreateSerializer,
        responses={
            201: OpenApiResponse(response=ApplicationResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class ApplicationListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationSerializer

    def get(self, request):
        user = request.user
        role = getattr(user, "role", "student")
        if role in ("admin", "super_admin"):
            queryset = Application.objects.all()
        else:
            queryset = Application.objects.filter(user_id=str(user.id))
        filterset = ApplicationFilter(request.query_params, queryset=queryset)
        queryset = filterset.qs
        if not request.query_params.get("sort"):
            queryset = queryset.order_by("-created_at")
        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        if page is not None:
            serializer = ApplicationListSerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)
        return Response(ApplicationListSerializer(queryset, many=True).data)

    def post(self, request):
        serializer = ApplicationCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data
        application = Application.objects.create(
            user_id=str(request.user.id), application_number=_generate_application_number(),
            public_tracking_code=_generate_tracking_code(), full_name=data["full_name"],
            nrc_number=data.get("nrc_number", ""), passport_number=data.get("passport_number", ""),
            date_of_birth=data["date_of_birth"], sex=data["sex"], phone=data["phone"],
            email=data["email"], residence_town=data["residence_town"],
            nationality=data.get("nationality", "Zambian"), program=data["program"],
            intake=data["intake"], institution=data["institution"], status="draft", version=1,
        )
        return Response(ApplicationSerializer(application).data, status=status.HTTP_201_CREATED)


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
        responses={204: OpenApiResponse(description="Application deleted.")},
    ),
)
class ApplicationDetailView(APIView):
    permission_classes = [IsOwnerOrAdmin]
    serializer_class = ApplicationSerializer

    def get(self, request, application_id):
        app = self._get_application(request, application_id)
        if app is None:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        return Response(ApplicationSerializer(app).data)

    def patch(self, request, application_id):
        app = self._get_application(request, application_id)
        if app is None:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        serializer = ApplicationSerializer(app, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, application_id):
        app = self._get_application(request, application_id)
        if app is None:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        app.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _get_application(self, request, application_id):
        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return None
        if not IsOwnerOrAdmin().has_object_permission(request, self, app):
            return None
        return app


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
    serializer_class = DocumentSerializer

    def get(self, request, application_id):
        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        if not IsOwnerOrAdmin().has_object_permission(request, self, app):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)
        docs = ApplicationDocument.objects.filter(application_id=application_id)
        return Response(DocumentSerializer(docs, many=True).data)


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
        return Response(data)

    def post(self, request, application_id):
        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        if not IsOwnerOrAdmin().has_object_permission(request, self, app):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)
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
            return Response({"grades": created}, status=status.HTTP_200_OK)

        serializer = ApplicationGradeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        grade, created = ApplicationGrade.objects.update_or_create(
            application_id=application_id,
            subject_id=serializer.validated_data["subject_id"],
            defaults={"grade": serializer.validated_data["grade"]},
        )
        return Response({"id": str(grade.id), "subject_id": str(grade.subject_id), "grade": grade.grade}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


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
        history = ApplicationStatusHistory.objects.filter(application_id=application_id).order_by("-created_at").values("old_status", "new_status", "notes", "created_at")[:10]
        return Response({"application": ApplicationSerializer(app).data, "documents_count": docs_count, "grades_count": grades_count, "status_history": list(history)})


@extend_schema_view(
    post=extend_schema(
        operation_id="applications_review",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Application UUID."),
        ],
        request=ApplicationReviewSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationReviewResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class ApplicationReviewView(APIView):
    permission_classes = [IsAdmin]
    serializer_class = ApplicationReviewSerializer

    def post(self, request, application_id):
        try:
            return self._do_review(request, application_id)
        except Exception as exc:
            import traceback
            logger.exception("Review failed: %s", exc)
            return Response({"success": False, "error": f"Review error: {exc}", "trace": traceback.format_exc()[-500:]}, status=500)

    def _do_review(self, request, application_id):
        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        serializer = ApplicationReviewSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        new_status = serializer.validated_data["new_status"]
        notes = serializer.validated_data.get("notes", "")
        force = serializer.validated_data.get("force", False)
        if new_status == "approved" and not force:
            from apps.documents.models import Payment
            has_verified = (
                app.payment_status == "verified"
                or Payment.objects.filter(application_id=application_id, status="verified").exists()
            )
            if not has_verified:
                return Response({"success": False, "error": "Application has unverified payment. Use force=true to override.", "code": "PAYMENT_UNVERIFIED"}, status=status.HTTP_400_BAD_REQUEST)
        old_status = app.status
        app.status = new_status
        if not app.review_started_at:
            app.review_started_at = timezone.now()
        app.reviewed_by_id = str(request.user.id)
        if notes:
            app.admin_feedback = notes
            app.admin_feedback_date = timezone.now()
            app.admin_feedback_by_id = str(request.user.id)
        if new_status in ("approved", "rejected"):
            app.decision_date = timezone.now()
        app.save(update_fields=[
            "status",
            "review_started_at",
            "reviewed_by",
            "admin_feedback",
            "admin_feedback_date",
            "admin_feedback_by",
            "decision_date",
            "updated_at",
        ])
        ApplicationStatusHistory.objects.create(application=app, status=new_status, old_status=old_status, new_status=new_status, changed_by_id=str(request.user.id), notes=notes)
        return Response({"message": f"Status updated from {old_status} to {new_status}", "application_id": str(app.id), "old_status": old_status, "new_status": new_status})


@extend_schema_view(
    get=extend_schema(
        operation_id="applications_export",
        tags=["applications"],
        parameters=[
            OpenApiParameter("status", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Filter by status."),
            OpenApiParameter("search", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Search term applied by the application filter."),
            OpenApiParameter("sort", OpenApiTypes.STR, OpenApiParameter.QUERY, description="Optional sort expression."),
        ],
        responses={
            200: OpenApiResponse(
                response=OpenApiTypes.BINARY,
                description="CSV export of applications that match the current filters.",
            ),
        },
    )
)
class ApplicationExportView(APIView):
    permission_classes = [IsAdmin]
    serializer_class = ApplicationListSerializer

    def get(self, request):
        queryset = Application.objects.all().order_by("-created_at")
        filterset = ApplicationFilter(request.query_params, queryset=queryset)
        queryset = filterset.qs
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Application Number", "Full Name", "Email", "Phone", "Program", "Intake", "Institution", "Status", "Created At"])
        for app in queryset:
            writer.writerow([app.application_number, app.full_name, app.email, app.phone, app.program, app.intake, app.institution, app.status, app.created_at.isoformat() if app.created_at else ""])
        response = HttpResponse(output.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="applications_export.csv"'
        return response


@extend_schema_view(
    get=extend_schema(
        operation_id="applications_track",
        tags=["applications"],
        auth=[],
        parameters=[
            OpenApiParameter(
                "code",
                OpenApiTypes.STR,
                OpenApiParameter.QUERY,
                description="Public tracking code or application number.",
                required=True,
            ),
        ],
        responses={
            200: OpenApiResponse(response=ApplicationTrackingResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class ApplicationTrackView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = ApplicationTrackingSerializer

    def get(self, request):
        code = request.query_params.get("code", "").strip()
        if not code:
            return Response({"success": False, "error": "Tracking code or application number required", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            app = Application.objects.get(Q(application_number=code) | Q(public_tracking_code=code))
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        return Response(ApplicationTrackingSerializer(app).data)


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
    permission_classes = [IsAdmin]
    serializer_class = ApplicationBulkStatusSerializer

    def post(self, request):
        serializer = ApplicationBulkStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        app_ids = serializer.validated_data["application_ids"]
        new_status = serializer.validated_data["new_status"]
        notes = serializer.validated_data.get("notes", "")
        applications = Application.objects.filter(id__in=app_ids)
        updated = 0
        for app in applications:
            old_status = app.status
            app.status = new_status
            if not app.review_started_at:
                app.review_started_at = timezone.now()
            app.reviewed_by_id = str(request.user.id)
            if notes:
                app.admin_feedback = notes
                app.admin_feedback_date = timezone.now()
                app.admin_feedback_by_id = str(request.user.id)
            if new_status in ("approved", "rejected"):
                app.decision_date = timezone.now()
            app.save(update_fields=[
                "status",
                "review_started_at",
                "reviewed_by",
                "admin_feedback",
                "admin_feedback_date",
                "admin_feedback_by",
                "decision_date",
                "updated_at",
            ])
            ApplicationStatusHistory.objects.create(application=app, status=new_status, old_status=old_status, new_status=new_status, changed_by_id=str(request.user.id), notes=notes)
            updated += 1
        return Response({"message": f"{updated} application(s) updated", "updated": updated})


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
    serializer_class = ApplicationDraftSerializer

    def get(self, request):
        user_id = str(request.user.id)
        draft = ApplicationDraft.objects.filter(user_id=user_id).order_by("-updated_at").first()
        if not draft:
            return Response({"success": False, "error": "No draft found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        return Response(ApplicationDraftSerializer(draft).data)

    def post(self, request):
        user_id = str(request.user.id)
        draft_data = request.data.get("draft_data", {})
        application_id = request.data.get("application_id")
        draft, created = ApplicationDraft.objects.update_or_create(user_id=user_id, application_id=application_id, defaults={"draft_data": draft_data})
        resp_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(ApplicationDraftSerializer(draft).data, status=resp_status)


@extend_schema_view(
    get=extend_schema(
        operation_id="applications_interviews_list",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Application UUID."),
        ],
        responses={
            200: OpenApiResponse(response=ApplicationInterviewListResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    post=extend_schema(
        operation_id="applications_interviews_create",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Application UUID."),
        ],
        request=ApplicationInterviewWriteSerializer,
        responses={
            201: OpenApiResponse(response=ApplicationInterviewResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    patch=extend_schema(
        operation_id="applications_interviews_update_latest",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Application UUID."),
        ],
        request=ApplicationInterviewWriteSerializer,
        responses={
            200: OpenApiResponse(response=ApplicationInterviewResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
        description="Updates the most recently scheduled interview for the application.",
    ),
)
class ApplicationInterviewView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationInterviewSerializer

    def get(self, request, application_id):
        try:
            application = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        if not IsOwnerOrAdmin().has_object_permission(request, self, application):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)

        interviews = ApplicationInterview.objects.filter(application_id=application_id).order_by("-scheduled_at")
        return Response(ApplicationInterviewSerializer(interviews, many=True).data)

    def post(self, request, application_id):
        if not IsAdmin().has_permission(request, self):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)

        try:
            Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        data = request.data.copy()
        data["application_id"] = str(application_id)
        serializer = ApplicationInterviewSerializer(data=data)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        interview = ApplicationInterview.objects.create(
            application_id=application_id,
            scheduled_at=serializer.validated_data["scheduled_at"],
            mode=serializer.validated_data.get("mode", "in_person"),
            location=serializer.validated_data.get("location", ""),
            status=serializer.validated_data.get("status", "scheduled"),
            notes=serializer.validated_data.get("notes", ""),
            created_by_id=str(request.user.id),
            updated_by_id=str(request.user.id),
        )
        return Response(ApplicationInterviewSerializer(interview).data, status=status.HTTP_201_CREATED)

    def patch(self, request, application_id):
        if not IsAdmin().has_permission(request, self):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)

        interview = (
            ApplicationInterview.objects.filter(application_id=application_id)
            .order_by("-scheduled_at", "-created_at")
            .first()
        )

        if interview is None:
            return Response({"success": False, "error": "Interview not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        serializer = ApplicationInterviewSerializer(interview, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        serializer.save(updated_by_id=str(request.user.id))
        return Response(serializer.data)


class DocumentVerifySerializer(serializers.Serializer):
    """Validates document verification requests."""

    documentId = serializers.UUIDField()
    documentType = serializers.CharField(required=False, allow_blank=True)
    status = serializers.ChoiceField(choices=["verified", "rejected"])
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class ApplicationVerifyDocumentView(APIView):
    """POST /api/v1/applications/{id}/verify-document/"""

    permission_classes = [IsAdmin]
    serializer_class = DocumentVerifySerializer

    @extend_schema(
        operation_id="applications_verify_document",
        tags=["applications"],
        request=DocumentVerifySerializer,
        responses={
            200: OpenApiResponse(response=ApplicationDocumentMutationResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )

    def post(self, request, application_id):
        # Look up application
        try:
            application = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Validate request body
        serializer = DocumentVerifySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "error": "Validation failed",
                    "code": "VALIDATION_ERROR",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        document_id = serializer.validated_data["documentId"]
        verification_status = serializer.validated_data["status"]
        notes = serializer.validated_data.get("notes", "")

        # Look up document belonging to this application
        try:
            document = ApplicationDocument.objects.get(
                id=document_id, application_id=application.id
            )
        except ApplicationDocument.DoesNotExist:
            return Response(
                {
                    "success": False,
                    "error": "Document not found for this application",
                    "code": "NOT_FOUND",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        # Update verification fields
        old_status = document.verification_status
        document.verification_status = verification_status
        document.verified_by_id = str(request.user.id)
        document.verified_at = timezone.now()
        document.verification_notes = notes
        document.save(
            update_fields=[
                "verification_status",
                "verified_by",
                "verified_at",
                "verification_notes",
                "updated_at",
            ]
        )

        # Create audit log entry
        from apps.common.models import AuditLog

        ip_address = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if ip_address:
            ip_address = ip_address.split(",")[0].strip()
        else:
            ip_address = request.META.get("REMOTE_ADDR", "")

        AuditLog.objects.create(
            actor_id=str(request.user.id),
            action=f"document_{verification_status}",
            entity_type="application_documents",
            entity_id=document.id,
            changes={
                "old_status": old_status,
                "new_status": verification_status,
                "notes": notes,
            },
            ip_address=hashlib.sha256(ip_address.encode()).hexdigest(),
            user_agent=hashlib.sha256(
                request.META.get("HTTP_USER_AGENT", "").encode()
            ).hexdigest(),
            retention_category="standard",
        )

        return Response({"success": True, "data": DocumentSerializer(document).data})


class AcceptanceLetterView(APIView):
    """POST /api/v1/applications/{id}/acceptance-letter/

    Enqueues a Celery task to generate an acceptance letter PDF.
    Returns 202 immediately with task metadata.
    Idempotent within a 1-hour window.
    """

    permission_classes = [IsAdmin]
    serializer_class = ApplicationAsyncTaskSerializer

    @extend_schema(
        operation_id="applications_generate_acceptance_letter",
        tags=["applications"],
        request=None,
        responses={
            202: OpenApiResponse(response=ApplicationAsyncTaskResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            503: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )

    def post(self, request, application_id):
        # Look up application
        try:
            application = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Validate application status
        if application.status != "approved":
            return Response(
                {
                    "success": False,
                    "error": "Application must be in accepted status to generate an acceptance letter",
                    "code": "INVALID_STATUS",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check idempotency — 1-hour TTL
        from apps.common.models import AuditLog, IdempotencyKey
        from datetime import timedelta

        idempotency_key = f"acceptance-letter:{application_id}"
        ttl_threshold = timezone.now() - timedelta(hours=1)

        existing = IdempotencyKey.objects.filter(
            key=idempotency_key, created_at__gt=ttl_threshold
        ).first()
        if existing:
            return Response(
                {"success": True, "data": existing.response_json},
                status=status.HTTP_202_ACCEPTED,
            )

        # Enqueue Celery task (lazy import — task file created in Task 8)
        try:
            from apps.applications.tasks import generate_acceptance_letter_task
        except ImportError:
            logger.warning("generate_acceptance_letter_task not yet available")
            return Response(
                {
                    "success": False,
                    "error": "Task handler not available",
                    "code": "SERVICE_UNAVAILABLE",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        task = generate_acceptance_letter_task.delay(str(application.id))

        response_data = {
            "task_id": task.id,
            "application_id": str(application.id),
            "status": "queued",
        }

        # Store idempotency key
        IdempotencyKey.objects.create(
            key=idempotency_key,
            endpoint=f"/api/v1/applications/{application_id}/acceptance-letter/",
            response_json=response_data,
        )

        # Create audit log entry
        ip_address = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if ip_address:
            ip_address = ip_address.split(",")[0].strip()
        else:
            ip_address = request.META.get("REMOTE_ADDR", "")

        AuditLog.objects.create(
            actor_id=str(request.user.id),
            action="generate_acceptance_letter",
            entity_type="applications",
            entity_id=application.id,
            changes={"task_id": task.id, "status": "queued"},
            ip_address=hashlib.sha256(ip_address.encode()).hexdigest(),
            user_agent=hashlib.sha256(
                request.META.get("HTTP_USER_AGENT", "").encode()
            ).hexdigest(),
            retention_category="standard",
        )

        return Response(
            {"success": True, "data": response_data},
            status=status.HTTP_202_ACCEPTED,
        )


class FinanceReceiptView(APIView):
    """POST /api/v1/applications/{id}/finance-receipt/

    Enqueues a Celery task to generate a finance receipt PDF.
    Returns 202 immediately with task metadata.
    Idempotent within a 1-hour window.
    """

    permission_classes = [IsAdmin]
    serializer_class = ApplicationAsyncTaskSerializer

    @extend_schema(
        operation_id="applications_generate_finance_receipt",
        tags=["applications"],
        request=None,
        responses={
            202: OpenApiResponse(response=ApplicationAsyncTaskResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            503: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )

    def post(self, request, application_id):
        # Look up application
        try:
            application = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Validate that a verified payment exists
        from apps.documents.models import Payment

        has_verified_payment = Payment.objects.filter(
            application_id=application.id, status="verified"
        ).exists()
        if not has_verified_payment:
            return Response(
                {
                    "success": False,
                    "error": "Application must have a completed payment to generate a finance receipt",
                    "code": "PAYMENT_REQUIRED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check idempotency — 1-hour TTL
        from apps.common.models import AuditLog, IdempotencyKey
        from datetime import timedelta

        idempotency_key = f"finance-receipt:{application_id}"
        ttl_threshold = timezone.now() - timedelta(hours=1)

        existing = IdempotencyKey.objects.filter(
            key=idempotency_key, created_at__gt=ttl_threshold
        ).first()
        if existing:
            return Response(
                {"success": True, "data": existing.response_json},
                status=status.HTTP_202_ACCEPTED,
            )

        # Enqueue Celery task (lazy import — task file created in Task 8)
        try:
            from apps.applications.tasks import generate_finance_receipt_task
        except ImportError:
            logger.warning("generate_finance_receipt_task not yet available")
            return Response(
                {
                    "success": False,
                    "error": "Task handler not available",
                    "code": "SERVICE_UNAVAILABLE",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        task = generate_finance_receipt_task.delay(str(application.id))

        response_data = {
            "task_id": task.id,
            "application_id": str(application.id),
            "status": "queued",
        }

        # Store idempotency key
        IdempotencyKey.objects.create(
            key=idempotency_key,
            endpoint=f"/api/v1/applications/{application_id}/finance-receipt/",
            response_json=response_data,
        )

        # Create audit log entry
        ip_address = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if ip_address:
            ip_address = ip_address.split(",")[0].strip()
        else:
            ip_address = request.META.get("REMOTE_ADDR", "")

        AuditLog.objects.create(
            actor_id=str(request.user.id),
            action="generate_finance_receipt",
            entity_type="applications",
            entity_id=application.id,
            changes={"task_id": task.id, "status": "queued"},
            ip_address=hashlib.sha256(ip_address.encode()).hexdigest(),
            user_agent=hashlib.sha256(
                request.META.get("HTTP_USER_AGENT", "").encode()
            ).hexdigest(),
            retention_category="standard",
        )

        return Response(
            {"success": True, "data": response_data},
            status=status.HTTP_202_ACCEPTED,
        )
