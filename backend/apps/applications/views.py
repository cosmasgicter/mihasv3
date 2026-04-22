"""Application views.

Implements task 13.3.
Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10
"""

import csv
import hashlib
import io
import logging
import re
import uuid

from django.db import DatabaseError, connection, transaction
from django.db.models import CharField, DateTimeField, DecimalField, OuterRef, Q, QuerySet, Subquery
from django.db.models.functions import Coalesce
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

from apps.accounts.authentication import OptionalJWTCookieAuthentication
from apps.accounts.permissions import IsAdmin, IsOwnerOrAdmin, IsSuperAdmin
from apps.applications.filters import ApplicationFilter
from apps.applications.models import (
    Application, ApplicationCondition, ApplicationDraft, ApplicationInterview, ApplicationStatusHistory,
)
from apps.applications.serializers import (
    ApplicationBulkStatusSerializer, ApplicationCreateSerializer,
    ApplicationDraftSerializer, ApplicationGradeSerializer,
    ApplicationInterviewSerializer, ApplicationListSerializer,
    ApplicationReviewSerializer, ApplicationSerializer, ApplicationTrackingSerializer,
    PaymentStatusUpdateSerializer,
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
from apps.common.idempotency import idempotent
from apps.documents.models import ApplicationDocument, ApplicationGrade, Payment
from apps.documents.serializers import DocumentSerializer
from apps.applications.document_intelligence import DocumentIntelligence
from apps.applications.duplicate_checker import DuplicateChecker
from apps.applications.review_queue import ReviewQueueScorer
from apps.applications.interview_service import (
    InterviewSchedulingError,
    InterviewService,
)
from apps.applications.services import (
    ApplicationSubmissionError,
    submit_application,
    transition_application_status,
)
from apps.common.communication_service import CommunicationService

logger = logging.getLogger(__name__)


def _with_payment_summary(queryset):
    """Annotate application querysets with payment summary fields."""

    if not isinstance(queryset, QuerySet):
        return queryset

    latest_payment = (
        Payment.objects
        .filter(application_id=OuterRef("pk"))
        .order_by("-updated_at", "-created_at")
    )
    latest_successful_payment = (
        Payment.objects
        .filter(application_id=OuterRef("pk"), status="successful")
        .annotate(summary_paid_at=Coalesce("verified_at", "updated_at", "created_at"))
        .order_by("-summary_paid_at")
    )

    return queryset.annotate(
        payment_summary_method=Subquery(
            latest_payment.values("payment_method")[:1],
            output_field=CharField(),
        ),
        payment_summary_reference=Subquery(
            latest_payment.values("transaction_reference")[:1],
            output_field=CharField(),
        ),
        payment_summary_receipt_number=Subquery(
            latest_successful_payment.values("receipt_number")[:1],
            output_field=CharField(),
        ),
        payment_summary_paid_amount=Subquery(
            latest_successful_payment.values("amount")[:1],
            output_field=DecimalField(max_digits=10, decimal_places=2),
        ),
        payment_summary_paid_at=Subquery(
            latest_successful_payment.values("summary_paid_at")[:1],
            output_field=DateTimeField(),
        ),
    )


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


def _resolve_institution_code(institution_name: str) -> str:
    """Resolve institution name to its short code (e.g., MIHAS, KATC)."""
    from apps.catalog.models import Institution
    inst = Institution.objects.filter(name__iexact=institution_name, is_active=True).first()
    if inst:
        return inst.code.upper()
    inst = Institution.objects.filter(name__icontains=institution_name, is_active=True).first()
    if inst:
        return inst.code.upper()
    return 'MIHAS'  # Default fallback


def _generate_application_number(institution_name: str = '') -> str:
    """Generate application number: {CODE}{YEAR}{SEQUENCE}.
    
    Format: MIHAS202500001, KATC202500002, etc.
    Uses DB count + random offset to avoid collisions without sequences.
    """
    code = _resolve_institution_code(institution_name)
    year = timezone.now().year
    prefix = f"{code}{year}"
    
    for attempt in range(5):
        count = Application.objects.filter(
            application_number__startswith=prefix
        ).count()
        seq = str(count + 1 + attempt).zfill(5)
        candidate = f"{prefix}{seq}"
        if not Application.objects.filter(application_number=candidate).exists():
            return candidate
    
    # Ultimate fallback: append random hex
    return f"{prefix}{uuid.uuid4().hex[:5].upper()}"


def _generate_tracking_code(institution_name: str = '') -> str:
    """Generate tracking code: TRK-{CODE}{YEAR}{RANDOM}."""
    code = _resolve_institution_code(institution_name)
    year = timezone.now().year
    random_part = uuid.uuid4().hex[:6].upper()
    return f"TRK-{code}{year}{random_part}"


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
            queryset = Application.objects.select_related(
                'user', 'payment_verified_by', 'reviewed_by', 'admin_feedback_by'
            ).prefetch_related(
                'applicationdocument_set', 'applicationgrade_set', 'payment_set'
            ).all()
            # Payment summary annotations only for admin views (expensive subqueries)
            queryset = _with_payment_summary(queryset)
        else:
            queryset = Application.objects.select_related(
                'user', 'payment_verified_by', 'reviewed_by', 'admin_feedback_by'
            ).prefetch_related(
                'applicationdocument_set', 'applicationgrade_set', 'payment_set'
            ).filter(user_id=str(user.id))
            # Skip payment summary for student views — frontend uses separate payment endpoint
        filterset = ApplicationFilter(request.query_params, queryset=queryset)
        queryset = filterset.qs

        sort_param = request.query_params.get("sort")
        is_priority_sort = sort_param == "priority" and role in ("admin", "super_admin")

        if not sort_param:
            queryset = queryset.order_by("-created_at")

        paginator = StandardPagination()
        page = paginator.paginate_queryset(queryset, request)
        if page is not None:
            serializer = ApplicationListSerializer(page, many=True)
            data = serializer.data

            if is_priority_sort:
                data = self._annotate_priority(page, data)

            return paginator.get_paginated_response(data)

        serializer = ApplicationListSerializer(queryset, many=True)
        data = serializer.data

        if is_priority_sort:
            data = self._annotate_priority(list(queryset), data)

        return Response(data)

    @staticmethod
    def _annotate_priority(applications, serialized_data):
        """Compute priority scores via ReviewQueueScorer and annotate response data."""
        scorer = ReviewQueueScorer()
        doc_intel = DocumentIntelligence()
        annotated = []
        for app, item in zip(applications, serialized_data):
            try:
                completeness = doc_intel.compute_completeness(app)
                has_warnings = bool(completeness.warnings)
                priority = scorer.score(app, completeness.score, has_warnings)
                item["priority_score"] = priority.score
                item["priority_classification"] = priority.classification
            except Exception:
                logger.exception("Failed to compute priority for application %s", getattr(app, "id", "?"))
                item["priority_score"] = 0.0
                item["priority_classification"] = "waiting_for_student"
            annotated.append(item)
        annotated.sort(key=lambda x: x["priority_score"], reverse=True)
        return annotated

    def post(self, request):
        serializer = ApplicationCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data

        # Intake deadline and open-date enforcement at draft creation
        from apps.applications.intake_enforcer import IntakeEnforcer
        intake_check = IntakeEnforcer.check_draft_creation(data["intake"])
        if not intake_check.allowed:
            return Response(
                {"success": False, "error": intake_check.message, "code": intake_check.code},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Duplicate check before creating (Req 4.1, 4.2, 4.6)
        dup_result = DuplicateChecker.check_at_create(
            user_id=str(request.user.id),
            program=data["program"],
            intake=data["intake"],
        )
        if dup_result.has_duplicate:
            return Response(
                {
                    "success": False,
                    "error": "A non-terminal application already exists for this program and intake.",
                    "code": "DUPLICATE_APPLICATION",
                    "existing_id": dup_result.existing_id,
                    "existing_status": dup_result.existing_status,
                    "resume_url": dup_result.resume_url,
                },
                status=status.HTTP_409_CONFLICT,
            )

        application_fee = None
        try:
            from apps.catalog.models import Program
            from apps.documents.fee_resolver import FeeResolver

            program = Program.objects.get(name=data["program"], is_active=True)
            resolved_fee = FeeResolver().resolve_fee(
                program_code=program.code,
                nationality=data.get("nationality"),
                country=data.get("country"),
            )
            application_fee = resolved_fee.amount
        except Exception:
            logger.exception("Failed to resolve application fee during application create")

        application = Application.objects.create(
            user_id=str(request.user.id), application_number=_generate_application_number(data.get('institution', '')),
            public_tracking_code=_generate_tracking_code(data.get('institution', '')), full_name=data["full_name"],
            nrc_number=data.get("nrc_number") or "", passport_number=data.get("passport_number") or "",
            date_of_birth=data["date_of_birth"], sex=data["sex"], phone=data["phone"],
            email=data["email"], residence_town=data["residence_town"],
            country=data.get("country") or "Zambia",
            nationality=data.get("nationality", "Zambian"), program=data["program"],
            next_of_kin_name=data.get("next_of_kin_name") or "",
            next_of_kin_phone=data.get("next_of_kin_phone") or "",
            intake=data["intake"], institution=data["institution"], application_fee=application_fee,
            status="draft", version=1,
        )
        return Response({"success": True, "data": ApplicationSerializer(application).data}, status=status.HTTP_201_CREATED)


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
        # View-level guard: students cannot edit non-draft applications (Req 3.1, 3.3)
        if not self._student_can_mutate_application(request, app):
            return Response(
                {"success": False, "error": "Application is not editable", "code": "APPLICATION_NOT_EDITABLE"},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = ApplicationSerializer(app, data=request.data, partial=True, context={'request': request})
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data)

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
        """Delete an application and known dependents without relying on ORM cascade.

        These models map to an existing production schema with unmanaged tables.
        Explicit child cleanup avoids brittle collector behavior when schema-level
        constraints differ from Django's model metadata.
        """
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
            app = _with_payment_summary(Application.objects.all()).get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        if not IsOwnerOrAdmin().has_object_permission(request, self, app):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)
        docs = ApplicationDocument.objects.select_related('application').filter(application_id=application_id)
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
                    "grades_summary": app.grades_summary,
                    "nationality": getattr(app, "nationality", ""),
                    "institution": getattr(app, "institution", ""),
                })
            except Exception:
                pass
        return Response({"application": ApplicationSerializer(app).data, "documents_count": docs_count, "grades_count": grades_count, "status_history": history, "ai_summary": ai_summary})


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
        return Response(response_data)


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
    ),
    patch=extend_schema(
        operation_id="applications_review_patch",
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
    ),
)
class ApplicationReviewView(APIView):
    permission_classes = [IsAdmin]
    serializer_class = ApplicationReviewSerializer

    @staticmethod
    def _normalize_legacy_review_payload(request_data):
        if not isinstance(request_data, dict):
            return request_data

        if request_data.get("new_status"):
            return request_data

        normalized = request_data.copy()
        legacy_status = normalized.get("status")
        if legacy_status and not normalized.get("new_status"):
            normalized["new_status"] = legacy_status
        return normalized

    @staticmethod
    def _get_client_ip(request) -> str:
        """Extract client IP, respecting X-Forwarded-For behind a proxy."""
        xff = request.META.get("HTTP_X_FORWARDED_FOR")
        if xff and isinstance(xff, str):
            return xff.split(",")[0].strip()
        addr = request.META.get("REMOTE_ADDR", "")
        return addr if isinstance(addr, str) else ""

    def patch(self, request, application_id):
        return self.post(request, application_id)

    def post(self, request, application_id):
        try:
            app = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        if isinstance(request.data, dict) and (request.data.get("paymentStatus") or request.data.get("payment_status")):
            raw_payment_status = request.data.get("paymentStatus") or request.data.get("payment_status")
            raw_notes = request.data.get("verificationNotes") or request.data.get("notes") or ""

            ps_serializer = PaymentStatusUpdateSerializer(data={
                "payment_status": raw_payment_status,
                "notes": raw_notes,
            })
            if not ps_serializer.is_valid():
                return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": ps_serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

            payment_status = ps_serializer.validated_data["payment_status"]
            notes = ps_serializer.validated_data["notes"]

            try:
                from apps.documents.payment_service import PaymentService

                app = PaymentService().review_application_payment(
                    application_id=app.id,
                    payment_status=payment_status,
                    reviewed_by_id=str(request.user.id),
                    notes=notes,
                )
            except ValueError as exc:
                if str(exc) == "PAYMENT_RECORD_REQUIRED":
                    return Response(
                        {
                            "success": False,
                            "error": "A payment record is required before this payment status can be reviewed.",
                            "code": "PAYMENT_RECORD_REQUIRED",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                raise

            return Response({"success": True, "data": {
                "message": f"Payment status updated to {payment_status}",
                "application_id": str(app.id),
                "payment_status": payment_status,
            }})

        serializer = ApplicationReviewSerializer(data=self._normalize_legacy_review_payload(request.data))
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        new_status = serializer.validated_data["new_status"]
        notes = serializer.validated_data.get("notes", "")
        force = serializer.validated_data.get("force", False)
        reason = serializer.validated_data.get("reason", "")
        if new_status == "approved" and not force:
            from apps.documents.models import Payment
            has_verified = (
                app.payment_status in ("paid", "verified")
                or Payment.objects.filter(application_id=application_id, status="successful").exists()
            )
            if not has_verified:
                return Response({"success": False, "error": "Payment must be verified before approval. Set force=true to override.", "code": "PAYMENT_UNVERIFIED"}, status=status.HTTP_400_BAD_REQUEST)

        # Extract hashed IP and user agent for audit trail (Req 5.3)
        raw_ip = self._get_client_ip(request) or ""
        ip_hash = hashlib.sha256(str(raw_ip).encode("utf-8")).hexdigest()
        user_agent = str(request.META.get("HTTP_USER_AGENT", "") or "")

        # Force-bypass audit logging (Req 5.1, 5.2, 5.4)
        if force and new_status == "approved":
            bypass_notes = f"[FORCE-BYPASS] Payment verification bypassed. Reason: {reason or 'Not provided'}"
            bypass_changes = {"force_bypass": True, "reason": reason or "Not provided"}
            logger.warning(
                "Force-bypass: app=%s admin=%s status=%s",
                app.id, request.user.id, new_status,
            )
        else:
            bypass_notes = notes
            bypass_changes = None

        if new_status == "submitted":
            # Admin-initiated submission always bypasses student-facing gates
            # (payment, identity document) since the admin is explicitly forcing.
            try:
                locked_app, old_status = submit_application(
                    application=app,
                    changed_by=str(request.user.id),
                    notes=bypass_notes,
                    ip_address=ip_hash,
                    user_agent=user_agent,
                    admin_force=True,
                )
            except ApplicationSubmissionError as exc:
                return Response(
                    {"success": False, "error": exc.message, "code": exc.code},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response({"success": True, "data": {"message": f"Status updated from {old_status} to {new_status}", "application_id": str(locked_app.id), "old_status": old_status, "new_status": new_status}})

        # Conditional approval with conditions (Req 5.9, 5.10)
        conditions_payload = request.data.get("conditions") if isinstance(request.data, dict) else None
        if new_status == "conditionally_approved" and conditions_payload:
            from apps.applications.condition_manager import ConditionError, ConditionManager

            try:
                old_status = app.status
                ConditionManager.assign_conditions(
                    application_id=str(application_id),
                    conditions=conditions_payload,
                    admin_id=str(request.user.id),
                )
                app.refresh_from_db()
            except ConditionError as exc:
                return Response(
                    {"success": False, "error": exc.message, "code": exc.code},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            old_status = transition_application_status(
                application=app,
                new_status=new_status,
                changed_by=str(request.user.id),
                notes=bypass_notes,
                ip_address=ip_hash,
                user_agent=user_agent,
            )

        # Store force-bypass details in history changes JSONB (Req 5.4)
        if bypass_changes:
            history = ApplicationStatusHistory.objects.filter(
                application=app,
            ).order_by('-created_at').first()
            if history:
                history.changes = bypass_changes
                history.save(update_fields=['changes'])

        # Assign waitlist position when application is waitlisted (Req 3.1)
        if new_status == "waitlisted":
            try:
                from apps.applications.waitlist_manager import WaitlistManager
                position = WaitlistManager.assign_position(app, app.program, app.intake)
                CommunicationService.send('waitlist_position_assigned', app, {'position': str(position)})
            except Exception:
                logger.exception(
                    "Failed to assign waitlist position for app=%s", app.id,
                )

        # Log override when admin manually approves a waitlisted app
        # bypassing position order (Req 3.8)
        if old_status == "waitlisted" and new_status == "approved":
            if app.waitlist_position is not None and app.waitlist_position != 1:
                try:
                    from apps.applications.waitlist_manager import WaitlistManager
                    WaitlistManager.log_override(app, str(request.user.id))
                except Exception:
                    logger.exception(
                        "Failed to log waitlist override for app=%s", app.id,
                    )

        # Sync intake enrollment on status changes that affect capacity
        intake_name = getattr(app, "intake", None)
        has_resolved_intake = isinstance(intake_name, str) and bool(intake_name.strip())

        if new_status in ("approved", "rejected") and has_resolved_intake:
            try:
                from apps.applications.intake_enforcer import IntakeEnforcer

                IntakeEnforcer.sync_enrollment(intake_name)
            except Exception:
                logger.exception(
                    "Failed to sync intake enrollment for app=%s intake=%s",
                    app.id,
                    intake_name,
                )

        # Set enrollment deadline on approval (Req 10.3, 10.4)
        if new_status == "approved" and has_resolved_intake:
            try:
                from apps.applications.enrollment_service import EnrollmentService
                deadline = EnrollmentService.compute_deadline(app)
                app.enrollment_confirmation_deadline = deadline
                app.save(update_fields=["enrollment_confirmation_deadline"])
            except Exception:
                logger.exception("Failed to set enrollment deadline for app=%s", app.id)

        # Trigger waitlist promotion when a rejection frees a spot (Req 3.7)
        if new_status == "rejected":
            try:
                from apps.applications.waitlist_manager import WaitlistManager
                WaitlistManager.promote_next(app.program, app.intake)
            except Exception:
                logger.exception(
                    "Failed to trigger waitlist promotion after rejection for app=%s",
                    app.id,
                )

        # Send notification to student on status changes
        if new_status in ("under_review", "approved", "rejected", "conditionally_approved"):
            try:
                from apps.common.communication_service import CommunicationService

                extra_ctx = {"admin_feedback": notes or ""}
                if new_status == "under_review":
                    CommunicationService.send("application_under_review", app)
                elif new_status == "approved":
                    extra_ctx["enrollment_deadline"] = str(getattr(app, "enrollment_confirmation_deadline", "") or "")
                    CommunicationService.send("application_approved", app, extra_ctx)
                elif new_status == "conditionally_approved":
                    CommunicationService.send("condition_assigned", app, extra_ctx)
                else:
                    CommunicationService.send("application_rejected", app, extra_ctx)
            except Exception:
                logger.exception("Failed to create notification/email for application %s", app.id)

        response_data = {
            "message": f"Status updated from {old_status} to {new_status}",
            "application_id": str(app.id),
            "old_status": old_status,
            "new_status": new_status,
        }
        # Add intake capacity info for admin UI
        try:
            from apps.catalog.models import Intake
            intake = None
            if has_resolved_intake:
                intake = Intake.objects.filter(name=intake_name, is_active=True).first()
            if intake:
                response_data["intake_capacity"] = intake.max_capacity
                response_data["intake_enrollment"] = intake.current_enrollment
        except Exception:
            pass
        return Response({"success": True, "data": response_data})

    def patch(self, request, application_id):
        return self.post(request, application_id)


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
        queryset = _with_payment_summary(Application.objects.all()).order_by("-created_at")
        filterset = ApplicationFilter(request.query_params, queryset=queryset)
        queryset = filterset.qs
        queryset = queryset[:10000]  # Cap export at 10,000 rows
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
    authentication_classes = [OptionalJWTCookieAuthentication]
    serializer_class = ApplicationTrackingSerializer

    # Accepted formats:
    #   APP-YYYYMMDD-XXXXXXXX  (legacy application numbers)
    #   {CODE}{YEAR}{SEQ}      (new application numbers, e.g. MIHAS202500001)
    #   TRK-{CODE}{YEAR}{HEX}  (new tracking codes, e.g. TRK-MIHAS2025ABCDEF)
    #   TRK-XXXXXXXXXXXX       (legacy tracking codes, 12 alphanum after dash)
    #   TRK + 5-6 alphanum     (legacy tracking codes, no dash)
    TRACKING_CODE_PATTERN = re.compile(
        r"^("
        r"APP-\d{8}-[A-Z0-9]{8}"           # Legacy: APP-20260416-ABCD1234
        r"|[A-Z]{2,10}\d{9,14}"             # MIHAS202500001, KATC202500002
        r"|TRK-[A-Z]{2,10}\d{4}[A-Z0-9]{6}" # TRK-MIHAS2025ABCDEF
        r"|TRK-[A-Z0-9]{12}"                # Legacy: TRK-ABCDEF123456
        r"|TRK[A-Z0-9]{5,6}"                # Legacy: TRK370990
        r")$"
    )

    def get(self, request):
        code = request.query_params.get("code", "").strip().upper()
        if not code:
            return Response({"success": False, "error": "Tracking code or application number required", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
        if not self.TRACKING_CODE_PATTERN.match(code):
            return Response(
                {
                    "success": False,
                    "error": "Invalid tracking code format. Use your application number (e.g., MIHAS202500001) or tracking code (e.g., TRK-MIHAS2025ABCDEF).",
                    "code": "INVALID_FORMAT",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            app = Application.objects.get(Q(application_number=code) | Q(public_tracking_code=code))
        except Application.DoesNotExist:
            return Response(
                {
                    "success": False,
                    "error": "No application found for the provided tracking code. Please verify the code and try again.",
                    "code": "NOT_FOUND",
                },
                status=status.HTTP_404_NOT_FOUND,
            )
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
    """Batch status transitions with safety guardrails.

    Requirements: 13.1–13.9
    """

    permission_classes = [IsAdmin]
    serializer_class = ApplicationBulkStatusSerializer

    MAX_BATCH_SIZE = 25

    def post(self, request):
        import hashlib as _hashlib

        from apps.applications.services import ALLOWED_TRANSITIONS, transition_application_status

        serializer = ApplicationBulkStatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        app_ids = serializer.validated_data["application_ids"]
        new_status = serializer.validated_data["new_status"]
        notes = serializer.validated_data.get("notes", "")
        confirmation_token = (request.data or {}).get("confirmation_token", "")

        # Batch size limit (Req 13.1, 13.2)
        if len(app_ids) > self.MAX_BATCH_SIZE:
            return Response(
                {
                    "success": False,
                    "error": f"Batch size exceeds maximum of {self.MAX_BATCH_SIZE}.",
                    "code": "BATCH_SIZE_EXCEEDED",
                    "limit": self.MAX_BATCH_SIZE,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Confirmation token validation (Req 13.5)
        sorted_ids = sorted(str(aid) for aid in app_ids)
        expected_token = _hashlib.sha256(
            ("".join(sorted_ids) + new_status).encode("utf-8")
        ).hexdigest()

        if confirmation_token != expected_token:
            return Response(
                {
                    "success": False,
                    "error": "Invalid confirmation_token. Compute SHA-256 of sorted application IDs + target status.",
                    "code": "INVALID_CONFIRMATION_TOKEN",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # All-or-nothing validation (Req 13.3, 13.4)
        failures = []
        try:
            with transaction.atomic():
                applications = list(Application.objects.filter(id__in=app_ids).select_for_update())

                # Check all found
                found_ids = {str(a.id) for a in applications}
                for aid in app_ids:
                    if str(aid) not in found_ids:
                        failures.append({"application_id": str(aid), "code": "NOT_FOUND"})

                # Validate transitions
                for app in applications:
                    allowed = ALLOWED_TRANSITIONS.get(app.status, set())
                    if new_status not in allowed:
                        failures.append({
                            "application_id": str(app.id),
                            "code": "INVALID_STATUS_TRANSITION",
                            "current_status": app.status,
                        })

                if failures:
                    raise ValueError("Validation failed")

                # Apply transitions (Req 13.6, 13.7)
                for app in applications:
                    transition_application_status(
                        application=app,
                        new_status=new_status,
                        changed_by=str(request.user.id),
                        notes=notes,
                    )

        except ValueError:
            return Response(
                {
                    "success": False,
                    "error": "Batch validation failed. No applications were updated.",
                    "code": "BATCH_VALIDATION_FAILED",
                    "failures": failures,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            logger.exception("Bulk status update failed for applications %s", app_ids)
            return Response({"success": False, "error": "Bulk status update failed", "code": "BULK_UPDATE_ERROR"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Send notifications for bulk status changes
        for app in applications:
            try:
                if new_status == 'approved':
                    CommunicationService.send('application_approved', app)
                elif new_status == 'rejected':
                    CommunicationService.send('application_rejected', app)
                elif new_status == 'waitlisted':
                    position = getattr(app, 'waitlist_position', None)
                    CommunicationService.send('waitlist_position_assigned', app, {'position': str(position)})
            except Exception:
                logger.exception("Failed to send bulk status notification for app=%s", app.id)

        # Trigger waitlist promotion on batch rejections (Req 13.8)
        if new_status == "rejected":
            affected_intakes = set()
            for app in applications:
                affected_intakes.add((app.program, app.intake))
            for program, intake in affected_intakes:
                try:
                    from apps.applications.waitlist_manager import WaitlistManager
                    WaitlistManager.promote_next(program, intake)
                except Exception:
                    logger.exception(
                        "Failed to trigger waitlist promotion after batch rejection for program=%s intake=%s",
                        program, intake,
                    )

        # Summary response (Req 13.9)
        return Response({
            "success": True,
            "data": {
                "processed": len(applications),
                "status": new_status,
                "application_ids": [str(a.id) for a in applications],
            },
        })


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
            OpenApiParameter("mine", OpenApiTypes.BOOL, OpenApiParameter.QUERY, description="When true, restricts results to the authenticated student's applications."),
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.QUERY, description="Optional application filter."),
        ],
        responses={
            200: OpenApiResponse(response=ApplicationInterviewListResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
        },
        description="Lists interviews in a single query. Students see only their own interviews; admins can see all interviews unless `mine=true` is provided.",
    ),
)
class ApplicationInterviewListView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationInterviewSerializer

    def get(self, request):
        mine_param = str(request.query_params.get("mine", "")).lower()
        mine_only = mine_param in {"1", "true", "yes"}
        application_id = request.query_params.get("application_id")

        queryset = ApplicationInterview.objects.select_related("application")

        if mine_only or not IsAdmin().has_permission(request, self):
            queryset = queryset.filter(application__user_id=request.user.id)

        if application_id:
            queryset = queryset.filter(application_id=application_id)

        interviews = queryset.order_by("scheduled_at", "-created_at")
        return Response(ApplicationInterviewSerializer(interviews, many=True).data)


@extend_schema_view(
    get=extend_schema(
        operation_id="applications_interviews_list_for_application",
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
    put=extend_schema(
        operation_id="applications_interviews_put_latest",
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
        description="Updates the most recently scheduled interview (PUT alias for PATCH).",
    ),
    delete=extend_schema(
        operation_id="applications_interviews_delete_latest",
        tags=["applications"],
        parameters=[
            OpenApiParameter("application_id", OpenApiTypes.UUID, OpenApiParameter.PATH, description="Application UUID."),
        ],
        request=None,
        responses={
            200: OpenApiResponse(response=ApplicationMessageResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
        description="Deletes the most recently scheduled interview for the application.",
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
            application = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response({"success": False, "error": "Application not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        serializer = ApplicationInterviewWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        scheduled_at = serializer.validated_data.get("scheduled_at")
        if not scheduled_at:
            return Response({"success": False, "error": "scheduled_at is required", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        mode = serializer.validated_data.get("mode", "in_person")
        location = serializer.validated_data.get("location", "")
        notes = serializer.validated_data.get("notes", "")
        admin_id = str(request.user.id)

        try:
            interview, validation = InterviewService.schedule_interview(
                application=application,
                scheduled_at=scheduled_at,
                mode=mode,
                location=location,
                notes=notes,
                admin_id=admin_id,
            )
        except InterviewSchedulingError as exc:
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_data = ApplicationInterviewSerializer(interview).data
        if validation.get("warnings"):
            response_data["warnings"] = validation["warnings"]
        return Response(response_data, status=status.HTTP_201_CREATED)

    def patch(self, request, application_id):
        return self._update_latest_interview(request, application_id)

    def put(self, request, application_id):
        return self._update_latest_interview(request, application_id)

    def _update_latest_interview(self, request, application_id):
        if not IsAdmin().has_permission(request, self):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)

        interview = (
            ApplicationInterview.objects.filter(application_id=application_id)
            .order_by("-scheduled_at", "-created_at")
            .first()
        )

        if interview is None:
            return Response({"success": False, "error": "Interview not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        serializer = ApplicationInterviewWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        new_status = serializer.validated_data.get("status", "").strip()
        admin_id = str(request.user.id)

        # Route to service methods for rescheduled/cancelled status changes
        if new_status == "rescheduled":
            new_scheduled_at = serializer.validated_data.get("scheduled_at")
            if not new_scheduled_at:
                return Response(
                    {"success": False, "error": "scheduled_at is required when rescheduling", "code": "VALIDATION_ERROR"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                updated_interview, validation = InterviewService.reschedule_interview(
                    interview=interview,
                    new_scheduled_at=new_scheduled_at,
                    mode=serializer.validated_data.get("mode") or None,
                    location=serializer.validated_data.get("location") if "location" in serializer.validated_data else None,
                    notes=serializer.validated_data.get("notes") if "notes" in serializer.validated_data else None,
                    admin_id=admin_id,
                    reason=serializer.validated_data.get("notes", ""),
                )
            except InterviewSchedulingError as exc:
                return Response(
                    {"success": False, "error": exc.message, "code": exc.code},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            response_data = ApplicationInterviewSerializer(updated_interview).data
            if validation.get("warnings"):
                response_data["warnings"] = validation["warnings"]
            return Response(response_data)

        if new_status == "cancelled":
            cancellation_reason = serializer.validated_data.get("notes", "").strip()
            try:
                updated_interview = InterviewService.cancel_interview(
                    interview=interview,
                    cancellation_reason=cancellation_reason,
                    admin_id=admin_id,
                )
            except InterviewSchedulingError as exc:
                return Response(
                    {"success": False, "error": exc.message, "code": exc.code},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(ApplicationInterviewSerializer(updated_interview).data)

        # For other status updates, validate mode if provided
        mode = serializer.validated_data.get("mode", "").strip()
        if mode:
            from apps.applications.interview_service import VALID_MODES
            if mode not in VALID_MODES:
                return Response(
                    {"success": False, "error": f"Interview mode must be one of: {', '.join(sorted(VALID_MODES))}. Got: '{mode}'.", "code": "INVALID_MODE"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Generic field update for non-service-routed changes
        update_fields = ["updated_by_id", "updated_at"]
        interview.updated_by_id = admin_id
        interview.updated_at = timezone.now()

        if "scheduled_at" in serializer.validated_data and serializer.validated_data["scheduled_at"]:
            interview.scheduled_at = serializer.validated_data["scheduled_at"]
            update_fields.append("scheduled_at")
        if mode:
            interview.mode = mode
            update_fields.append("mode")
        if "location" in serializer.validated_data:
            interview.location = serializer.validated_data["location"]
            update_fields.append("location")
        if new_status:
            interview.status = new_status
            update_fields.append("status")
        if "notes" in serializer.validated_data:
            interview.notes = serializer.validated_data["notes"]
            update_fields.append("notes")

        interview.save(update_fields=update_fields)
        return Response(ApplicationInterviewSerializer(interview).data)

    def delete(self, request, application_id):
        if not IsAdmin().has_permission(request, self):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)

        interview = (
            ApplicationInterview.objects.filter(application_id=application_id)
            .order_by("-scheduled_at", "-created_at")
            .first()
        )

        if interview is None:
            return Response({"success": False, "error": "Interview not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        interview.delete()
        return Response({"success": True, "data": {"message": "Interview deleted"}})


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

        network_fields = build_audit_network_fields(request)

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
            ip_address=network_fields["ip_address"],
            user_agent=network_fields["user_agent"],
            ip_address_encrypted=network_fields["ip_address_encrypted"],
            user_agent_encrypted=network_fields["user_agent_encrypted"],
            retention_category="standard",
        )

        try:
            from apps.common.communication_service import CommunicationService
            app = Application.objects.filter(id=document.application_id).first()
            if app:
                template = 'document_verified' if verification_status == 'verified' else 'document_rejected'
                CommunicationService.send(template, app, {'document_name': document.document_type or 'Document'})
        except Exception:
            pass

        return Response({"success": True, "data": DocumentSerializer(document).data})


def _enqueue_document_task(application, task_type, task_func, request):
    """Shared helper for document generation endpoints.

    Handles idempotency check, Celery task dispatch, audit logging,
    and response construction. Used by AcceptanceLetterView and
    FinanceReceiptView to eliminate duplicated logic.

    Args:
        application: The Application model instance.
        task_type: A short identifier used for the idempotency key prefix
            and audit action name (e.g. "acceptance-letter", "finance-receipt").
        task_func: The Celery task callable to dispatch (e.g.
            generate_acceptance_letter_task).
        request: The DRF request object (used for audit metadata).

    Returns:
        A DRF Response (202 on success/idempotent hit, 503 if task
        unavailable).
    """
    from datetime import timedelta

    from apps.common.models import AuditLog, IdempotencyKey

    application_id = str(application.id)

    # Idempotency check — 1-hour TTL (server-generated key for task dedup)
    idem_key = f"{task_type}:{application_id}"
    actor_id = request.user.id
    method = "POST"
    path = f"/api/v1/applications/{application_id}/{task_type}/"
    ttl_threshold = timezone.now() - timedelta(hours=1)

    existing = IdempotencyKey.objects.filter(
        idempotency_key=idem_key, actor_id=actor_id, method=method, path=path,
        created_at__gt=ttl_threshold,
    ).first()
    if existing and existing.response_body:
        return Response(
            {"success": True, "data": existing.response_body},
            status=status.HTTP_202_ACCEPTED,
        )

    # Dispatch Celery task
    if task_func is None:
        logger.warning("%s task handler not yet available", task_type)
        return Response(
            {
                "success": False,
                "error": "Task handler not available",
                "code": "SERVICE_UNAVAILABLE",
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    task = task_func.delay(application_id)

    response_data = {
        "task_id": task.id,
        "application_id": application_id,
        "status": "queued",
    }

    # Store idempotency key
    action_name = f"generate_{task_type.replace('-', '_')}"

    IdempotencyKey.objects.create(
        idempotency_key=idem_key,
        actor_id=actor_id,
        method=method,
        path=path,
        request_hash=hashlib.sha256(b"").hexdigest(),
        status=IdempotencyKey.COMPLETED,
        response_status=202,
        response_body=response_data,
        completed_at=timezone.now(),
    )

    # Audit log
    network_fields = build_audit_network_fields(request)

    AuditLog.objects.create(
        actor_id=str(request.user.id),
        action=action_name,
        entity_type="applications",
        entity_id=application.id,
        changes={"task_id": task.id, "status": "queued"},
        ip_address=network_fields["ip_address"],
        user_agent=network_fields["user_agent"],
        ip_address_encrypted=network_fields["ip_address_encrypted"],
        user_agent_encrypted=network_fields["user_agent_encrypted"],
        retention_category="standard",
    )

    return Response(
        {"success": True, "data": response_data},
        status=status.HTTP_202_ACCEPTED,
    )


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

        # Resolve task function (lazy import)
        try:
            from apps.applications.tasks import generate_acceptance_letter_task
            task_func = generate_acceptance_letter_task
        except ImportError:
            task_func = None

        return _enqueue_document_task(application, "acceptance-letter", task_func, request)


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

        # Resolve task function (lazy import)
        try:
            from apps.applications.tasks import generate_finance_receipt_task
            task_func = generate_finance_receipt_task
        except ImportError:
            task_func = None

        return _enqueue_document_task(application, "finance-receipt", task_func, request)


class EmailSlipSerializer(serializers.Serializer):
    email = serializers.EmailField()


class EmailSlipQueuedSerializer(serializers.Serializer):
    queued_id = serializers.UUIDField()


EmailSlipEnvelopeResponseSerializer = envelope_serializer(
    "EmailSlipEnvelopeResponse",
    EmailSlipQueuedSerializer(),
)


class EmailSlipView(APIView):
    """POST /api/v1/applications/{id}/email-slip/

    Generates an HTML email with application slip details and queues it
    for delivery via the existing send_email_task + Resend infrastructure.

    Implements task 19.1.
    Requirements: 1.10, 1.11, 2.10, 2.11, 2.12
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
        # Look up application
        try:
            application = Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Validate requesting user owns the application
        if str(application.user_id) != str(request.user.id):
            role = getattr(request.user, "role", "student")
            if role not in ("admin", "super_admin"):
                return Response(
                    {"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Validate request body
        serializer = EmailSlipSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"success": False, "error": "Validation failed", "code": "VALIDATION_ERROR", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = serializer.validated_data["email"]

        # Build HTML email body with slip details (escape all user data to prevent XSS)
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
            + _row("Tracking Code", application.tracking_code or getattr(application, "public_tracking_code", "") or "")
            + _row("Submitted", submitted_at or "Not yet submitted")
            + _row("Created", created_at or "N/A")
            + "</table>"
            "<div style='padding-top:18px;font-size:14px;line-height:1.75;color:#475569;'>"
            "Keep this slip for reference when checking your application status or communicating with the admissions office."
            "</div>"
        )

        body_html = get_base_email_html(slip_html, title="Application Slip")

        # Create EmailQueue record and dispatch
        from apps.common.models import EmailQueue
        from apps.common.tasks import dispatch_email

        email_record = EmailQueue.objects.create(
            recipient_email=email,
            recipient_name=application.full_name,
            subject=f"Application Slip — {application.application_number}",
            body=body_html,
            status="pending",
        )

        dispatch_email(str(email_record.id))

        return Response(
            {"success": True, "data": {"queued_id": str(email_record.id)}},
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# Withdrawal endpoint (Req 1.9, 1.10)
# ---------------------------------------------------------------------------


class WithdrawalReasonSerializer(serializers.Serializer):
    withdrawal_reason = serializers.CharField(required=True)


WithdrawalResponseSerializer = envelope_serializer(
    "WithdrawalResponse",
    ApplicationSerializer(),
)


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

        # --- Fetch application ---
        try:
            app = Application.objects.select_related("user").get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # --- Owner-only check (Req 1.9: not admin) ---
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

        # --- Validate request body ---
        withdrawal_reason = (request.data or {}).get("withdrawal_reason", "")

        # --- Extract client metadata for audit ---
        ip_address = request.META.get("REMOTE_ADDR", "")
        user_agent = request.META.get("HTTP_USER_AGENT", "")

        # --- Perform withdrawal ---
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


class ApplicationWaitlistPositionView(APIView):
    """Return waitlist position and total for an application.

    GET /api/v1/applications/{id}/waitlist-position/
    Owner or admin.

    Requirements: 3.9
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, application_id):
        from apps.applications.waitlist_manager import WaitlistError, WaitlistManager

        # --- Fetch application ---
        try:
            app = Application.objects.select_related("user").get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # --- Owner or admin check ---
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

        # --- Get waitlist position ---
        try:
            position_data = WaitlistManager.get_position(str(application_id))
        except WaitlistError as exc:
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({"success": True, "data": position_data})


class ApplicationConditionSerializer(serializers.Serializer):
    """Read serializer for ApplicationCondition."""

    id = serializers.UUIDField()
    application_id = serializers.UUIDField()
    description = serializers.CharField()
    condition_type = serializers.CharField()
    deadline = serializers.DateField()
    status = serializers.CharField()
    met_at = serializers.DateTimeField(allow_null=True)
    verified_by = serializers.UUIDField(allow_null=True, source="verified_by_id")
    notes = serializers.CharField(allow_null=True)
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()


class ConditionVerifyRequestSerializer(serializers.Serializer):
    """Request body for verifying a condition."""

    status = serializers.ChoiceField(choices=["met", "waived"])


class ApplicationConditionsView(APIView):
    """List conditions for an application.

    GET /api/v1/applications/{id}/conditions/
    Owner or admin.

    Requirements: 5.9
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationConditionSerializer

    def get(self, request, application_id):
        # --- Fetch application ---
        try:
            app = Application.objects.select_related("user").get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # --- Owner or admin check ---
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


class ApplicationConditionVerifyView(APIView):
    """Verify a condition as met or waived.

    POST /api/v1/applications/{id}/conditions/{cid}/verify/
    Admin only.

    Requirements: 5.10
    """

    permission_classes = [IsAdmin]
    serializer_class = ConditionVerifyRequestSerializer

    def post(self, request, application_id, condition_id):
        from apps.applications.condition_manager import ConditionError, ConditionManager

        # --- Validate application exists ---
        try:
            Application.objects.get(id=application_id)
        except Application.DoesNotExist:
            return Response(
                {"success": False, "error": "Application not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # --- Validate condition belongs to this application ---
        try:
            condition = ApplicationCondition.objects.get(
                id=condition_id, application_id=application_id,
            )
        except ApplicationCondition.DoesNotExist:
            return Response(
                {"success": False, "error": "Condition not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # --- Validate request body ---
        serializer = ConditionVerifyRequestSerializer(data=request.data)
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

        target_status = serializer.validated_data["status"]

        # --- Verify condition ---
        try:
            updated_condition = ConditionManager.verify_condition(
                condition_id=str(condition_id),
                status=target_status,
                admin_id=str(request.user.id),
            )
        except ConditionError as exc:
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = ApplicationConditionSerializer(updated_condition).data
        return Response({"success": True, "data": data})


# ---------------------------------------------------------------------------
# Task 14.2: Enrollment Confirmation Endpoint (Req 10.5)
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

        # Owner-only check
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
# Task 15.1: Reviewer Assignment Endpoints (Req 11)
# ---------------------------------------------------------------------------


class ApplicationAssignView(APIView):
    """Assign an application to a specific reviewer.

    POST /api/v1/applications/{id}/assign/
    Super admin only.

    Requirements: 11.1–11.4, 11.10
    """

    permission_classes = [IsSuperAdmin]

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

        # Validate reviewer exists and has admin/reviewer role
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

        # Record in history (Req 11.10)
        ApplicationStatusHistory.objects.create(
            application=app,
            status=app.status,
            old_status=app.status,
            new_status=app.status,
            changed_by_id=str(request.user.id),
            notes=f"Reviewer assigned: {reviewer.email} (was: {old_reviewer_id or 'unassigned'})",
        )

        # Notify assigned reviewer (Req 11.3)
        try:
            from apps.common.models import Notification

            Notification.objects.create(
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
            from apps.common.communication_service import CommunicationService
            CommunicationService.send('reviewer_assigned', app)
        except Exception:
            pass

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

    def post(self, request):
        from apps.accounts.models import Profile
        from apps.common.models import Setting

        # Get max workload from SystemSetting
        max_workload = 20
        try:
            setting = Setting.objects.filter(key="max_reviewer_workload").first()
            if setting and setting.value:
                max_workload = int(setting.value)
        except Exception:
            pass

        # Get active reviewers (admin or reviewer role)
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

        # Get unassigned submitted applications
        unassigned = Application.objects.filter(
            status__in=["submitted", "under_review"],
            assigned_reviewer_id__isnull=True,
        ).order_by("created_at")

        assigned_count = 0
        assignments = []
        reviewer_idx = 0

        for app in unassigned:
            # Find next reviewer under workload cap (round-robin)
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
                        from apps.common.models import Notification
                        Notification.objects.create(
                            user_id=reviewer.id,
                            title="Application Assigned",
                            message=f"Application {app.application_number} has been assigned to you for review.",
                            type="assignment",
                            action_url=f"/admin/applications/{app.id}",
                        )
                    except Exception:
                        pass

                    assignments.append({
                        "application_id": str(app.id),
                        "reviewer_id": str(reviewer.id),
                    })
                    assigned_count += 1
                    assigned = True
                    break

            if not assigned:
                break  # All reviewers at capacity

        return Response({
            "success": True,
            "data": {
                "assigned_count": assigned_count,
                "assignments": assignments,
            },
        })


# ---------------------------------------------------------------------------
# Task 16.2: Fee Waiver Endpoint (Req 12)
# ---------------------------------------------------------------------------


class ApplicationFeeWaiverView(APIView):
    """Grant a fee waiver for an application.

    POST /api/v1/applications/{id}/fee-waiver/
    Super admin only.

    Requirements: 12.2, 12.7
    """

    permission_classes = [IsSuperAdmin]

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


# ---------------------------------------------------------------------------
# Task 18.2: Amendment Endpoints (Req 14)
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

        # Owner-only check
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


class ApplicationAmendmentReviewView(APIView):
    """Review (approve/reject) an amendment.

    POST /api/v1/applications/{id}/amendments/{aid}/review/
    Admin only.

    Requirements: 14.7
    """

    permission_classes = [IsAdmin]

    def post(self, request, application_id, amendment_id):
        from apps.applications.amendment_service import AmendmentError, AmendmentService

        data = request.data or {}
        target_status = data.get("status")

        if target_status not in ("approved", "rejected"):
            return Response(
                {
                    "success": False,
                    "error": "status must be 'approved' or 'rejected'.",
                    "code": "VALIDATION_ERROR",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            amendment = AmendmentService.review_amendment(
                amendment_id=str(amendment_id),
                status=target_status,
                admin_id=str(request.user.id),
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
                "field_name": amendment.field_name,
                "status": amendment.status,
            },
        })
from apps.common.audit_network import build_audit_network_fields
