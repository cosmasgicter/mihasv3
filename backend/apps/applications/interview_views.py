"""Interview-related application views.

Extracted during the views module split (production-readiness-hardening, task 9.1).
Contains views for listing and managing application interviews.
"""

import logging

from django.utils import timezone
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

from apps.accounts.permissions import IsAdmin, IsOwnerOrAdmin
from apps.applications.interview_service import (
    InterviewSchedulingError,
    InterviewService,
)
from apps.applications.models import Application, ApplicationInterview
from apps.applications.serializers import (
    ApplicationInterviewSerializer,
)
from apps.common.openapi_helpers import ErrorResponseSerializer

from ._view_helpers import (
    ApplicationInterviewListResponseSerializer,
    ApplicationInterviewResponseSerializer,
    ApplicationInterviewWriteSerializer,
    ApplicationMessageResponseSerializer,
)

logger = logging.getLogger(__name__)

ALLOWED_INTERVIEW_STATUSES = {
    "scheduled",
    "completed",
    "cancelled",
    "no_show",
    "rescheduled",
}


# ---------------------------------------------------------------------------
# Interview List (all interviews, filterable)
# ---------------------------------------------------------------------------


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

        queryset = ApplicationInterview.objects.select_related("application", "application__user")

        if mine_only or not IsAdmin().has_permission(request, self):
            queryset = queryset.filter(application__user_id=request.user.id)

        if application_id:
            queryset = queryset.filter(application_id=application_id)

        interviews = queryset.order_by("scheduled_at", "-created_at")
        return Response({"success": True, "data": ApplicationInterviewSerializer(interviews, many=True).data})


# ---------------------------------------------------------------------------
# Interview CRUD for a specific application
# ---------------------------------------------------------------------------


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

        interviews = ApplicationInterview.objects.select_related("application", "application__user").filter(application_id=application_id).order_by("-scheduled_at")
        return Response({"success": True, "data": ApplicationInterviewSerializer(interviews, many=True).data})

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
        return Response({"success": True, "data": response_data}, status=status.HTTP_201_CREATED)

    def patch(self, request, application_id):
        return self._update_latest_interview(request, application_id)

    def put(self, request, application_id):
        return self._update_latest_interview(request, application_id)

    def _update_latest_interview(self, request, application_id):
        if not IsAdmin().has_permission(request, self):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)

        interview = (
            ApplicationInterview.objects.select_related("application", "application__user")
            .filter(application_id=application_id)
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

        if new_status and new_status not in ALLOWED_INTERVIEW_STATUSES:
            return Response(
                {
                    "success": False,
                    "error": f"Status must be one of {sorted(ALLOWED_INTERVIEW_STATUSES)}",
                    "code": "INVALID_STATUS",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

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
            return Response({"success": True, "data": response_data})

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
            return Response({"success": True, "data": ApplicationInterviewSerializer(updated_interview).data})

        mode = serializer.validated_data.get("mode", "").strip()
        if mode:
            from apps.applications.interview_service import VALID_MODES
            if mode not in VALID_MODES:
                return Response(
                    {"success": False, "error": f"Interview mode must be one of: {', '.join(sorted(VALID_MODES))}. Got: '{mode}'.", "code": "INVALID_MODE"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

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
        return Response({"success": True, "data": ApplicationInterviewSerializer(interview).data})

    def delete(self, request, application_id):
        if not IsAdmin().has_permission(request, self):
            return Response({"success": False, "error": "Permission denied", "code": "INSUFFICIENT_PERMISSIONS"}, status=status.HTTP_403_FORBIDDEN)

        interview = (
            ApplicationInterview.objects.select_related("application", "application__user")
            .filter(application_id=application_id)
            .order_by("-scheduled_at", "-created_at")
            .first()
        )

        if interview is None:
            return Response({"success": False, "error": "Interview not found", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        interview.delete()
        return Response({"success": True, "data": {"message": "Interview deleted"}})
