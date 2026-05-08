"""Application history views."""

from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.applications.models import ApplicationStatusHistory
from apps.common.openapi_helpers import ErrorResponseSerializer, envelope_serializer, paginated_serializer


class TimelineHistoryItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    application_id = serializers.UUIDField()
    application_number = serializers.SerializerMethodField()
    old_status = serializers.CharField(allow_null=True)
    new_status = serializers.CharField(allow_null=True)
    notes = serializers.CharField(allow_null=True)
    changed_by_name = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(allow_null=True)

    def get_application_number(self, obj) -> str | None:
        application = getattr(obj, "application", None)
        if not application:
            return None
        return getattr(application, "application_number", None)

    def get_changed_by_name(self, obj) -> str | None:
        changed_by = getattr(obj, "changed_by", None)
        if not changed_by:
            return None
        first_name = (getattr(changed_by, "first_name", "") or "").strip()
        last_name = (getattr(changed_by, "last_name", "") or "").strip()
        full_name = " ".join(part for part in [first_name, last_name] if part).strip()
        return full_name or None


TimelineHistoryResponseSerializer = envelope_serializer(
    "TimelineHistoryResponse",
    paginated_serializer("TimelineHistoryPage", TimelineHistoryItemSerializer),
)


@extend_schema_view(
    get=extend_schema(
        operation_id="timeline_history_list",
        tags=["applications"],
        parameters=[
            OpenApiParameter(name="page", type=int, required=False, description="Page number (default 1)"),
            OpenApiParameter(name="pageSize", type=int, required=False, description="Page size (default 20, max 100)"),
            OpenApiParameter(
                name="user_id",
                type=str,
                required=False,
                description="Admin-only override to view a specific user's application history.",
            ),
        ],
        responses={
            200: OpenApiResponse(response=TimelineHistoryResponseSerializer),
            401: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class TimelineHistoryView(APIView):
    """List application status-history entries for the active user or admin target."""

    permission_classes = [IsAuthenticated]
    serializer_class = TimelineHistoryItemSerializer

    def get(self, request):
        target_user_id = getattr(request.user, "pk", None)
        if getattr(request.user, "role", None) in {"admin", "super_admin"}:
            target_user_id = request.query_params.get("user_id") or target_user_id

        history = (
            ApplicationStatusHistory.objects
            .filter(application__user_id=target_user_id)
            .select_related("application", "changed_by")
            .order_by("-created_at")
        )

        total_count = history.count()

        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except (TypeError, ValueError):
            page = 1

        try:
            page_size = int(request.query_params.get("pageSize", 20))
        except (TypeError, ValueError):
            page_size = 20

        page_size = max(1, min(page_size, 100))
        offset = (page - 1) * page_size
        page_qs = history[offset:offset + page_size]

        data = TimelineHistoryItemSerializer(page_qs, many=True).data
        return Response(
            {
                "success": True,
                "data": {
                    "page": page,
                    "pageSize": page_size,
                    "totalCount": total_count,
                    "results": data,
                },
            },
            status=status.HTTP_200_OK,
        )
