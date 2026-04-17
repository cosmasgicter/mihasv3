"""Timeline history views — student activity timeline API.

Implements task 2.1 (communications-history).
Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
"""

import logging

from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.applications.models import ApplicationStatusHistory
from apps.common.openapi_helpers import (
    ErrorResponseSerializer,
    envelope_serializer,
    paginated_serializer,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------


class TimelineEntrySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    application_id = serializers.UUIDField()
    application_number = serializers.CharField()
    old_status = serializers.CharField(allow_null=True)
    new_status = serializers.CharField(allow_null=True)
    notes = serializers.CharField(allow_null=True)
    changed_by_name = serializers.CharField(allow_null=True)
    created_at = serializers.DateTimeField()


TimelineListResponseSerializer = envelope_serializer(
    "TimelineListResponse",
    paginated_serializer("TimelinePage", TimelineEntrySerializer),
)


# ---------------------------------------------------------------------------
# TimelineHistoryView
# ---------------------------------------------------------------------------


@extend_schema(
    operation_id="timeline_history_list",
    tags=["applications"],
    parameters=[
        OpenApiParameter(name="page", type=int, required=False, description="Page number (default 1)"),
        OpenApiParameter(name="pageSize", type=int, required=False, description="Page size (default 20, max 100)"),
        OpenApiParameter(name="user_id", type=str, required=False, description="Filter by user ID (admin only)"),
    ],
    responses={
        200: OpenApiResponse(response=TimelineListResponseSerializer),
        401: OpenApiResponse(response=ErrorResponseSerializer),
    },
)
class TimelineHistoryView(APIView):
    """GET /api/v1/applications/history/

    Returns paginated application status history entries.
    - Students see only their own application history.
    - Admins can pass ?user_id=<uuid> to view a specific student's history.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        role = getattr(user, "role", "student")
        is_admin = role in ("admin", "super_admin")

        # Determine which user's history to fetch
        target_user_id = user.pk
        user_id_param = request.query_params.get("user_id")
        if is_admin and user_id_param:
            target_user_id = user_id_param

        # Query with select_related for application and changed_by
        queryset = (
            ApplicationStatusHistory.objects
            .filter(application__user_id=target_user_id)
            .select_related("application", "changed_by")
            .order_by("-created_at")
        )

        # --- Pagination ---
        total_count = queryset.count()

        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except (ValueError, TypeError):
            page = 1

        try:
            page_size = int(request.query_params.get("pageSize", 20))
        except (ValueError, TypeError):
            page_size = 20

        page_size = max(1, min(page_size, 100))

        offset = (page - 1) * page_size
        page_qs = queryset[offset:offset + page_size]

        # Build response data
        results = []
        for entry in page_qs:
            changed_by_name = None
            if entry.changed_by:
                first = getattr(entry.changed_by, "first_name", "") or ""
                last = getattr(entry.changed_by, "last_name", "") or ""
                full = f"{first} {last}".strip()
                if full:
                    changed_by_name = full

            results.append({
                "id": str(entry.id),
                "application_id": str(entry.application_id),
                "application_number": entry.application.application_number,
                "old_status": entry.old_status,
                "new_status": entry.new_status,
                "notes": entry.notes,
                "changed_by_name": changed_by_name,
                "created_at": entry.created_at,
            })

        return Response({
            "success": True,
            "data": {
                "page": page,
                "pageSize": page_size,
                "totalCount": total_count,
                "results": results,
            },
        })
