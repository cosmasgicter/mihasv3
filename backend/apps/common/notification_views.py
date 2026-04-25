"""Notification views — preferences, admin send, list, mark-read, delete, admin history.

Implements tasks 20.1, 20.3, 11.1 (admissions-frontend-overhaul), 3.1 (communications-history).
Requirements: 6.1, 6.2, 6.3, 8.1, 8.2, 8.3, 8.5, 8.6, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
"""

import logging

from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.models import (
    Notification,
    UserNotificationPreference,
)
from apps.common.outbox import create_notification, queue_email
from apps.common.openapi_helpers import (
    ErrorResponseSerializer,
    IdMessageSerializer,
    MessageSerializer,
    envelope_serializer,
    paginated_serializer,
)

logger = logging.getLogger(__name__)


def _get_admin_permission():
    """Lazy accessor for IsAdmin to avoid common ↔ accounts circular import."""
    from apps.accounts.permissions import IsAdmin
    return IsAdmin


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------


class NotificationPreferenceSerializer(serializers.Serializer):
    email_enabled = serializers.BooleanField(required=False, default=True)
    sms_enabled = serializers.BooleanField(required=False, default=False)
    application_updates = serializers.BooleanField(required=False, allow_null=True)
    payment_reminders = serializers.BooleanField(required=False, allow_null=True)
    interview_reminders = serializers.BooleanField(required=False, allow_null=True)
    marketing_emails = serializers.BooleanField(required=False, allow_null=True)
    quiet_hours_start = serializers.TimeField(required=False, allow_null=True)
    quiet_hours_end = serializers.TimeField(required=False, allow_null=True)
    timezone = serializers.CharField(max_length=50, required=False, allow_null=True)


class NotificationSendSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    title = serializers.CharField(max_length=255)
    message = serializers.CharField()
    type = serializers.CharField(max_length=50, default="general")
    idempotency_key = serializers.CharField(max_length=255, required=False, allow_null=True)


class EmailSendSerializer(serializers.Serializer):
    recipient_email = serializers.EmailField()
    subject = serializers.CharField(max_length=500)
    body = serializers.CharField()


class NotificationItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    message = serializers.CharField()
    type = serializers.CharField()
    is_read = serializers.BooleanField()
    action_url = serializers.CharField(allow_null=True, required=False)
    read_at = serializers.DateTimeField(allow_null=True, required=False)
    created_at = serializers.DateTimeField()


NotificationPreferenceResponseSerializer = envelope_serializer(
    "NotificationPreferenceResponse",
    NotificationPreferenceSerializer(),
)
NotificationSendResponseSerializer = envelope_serializer(
    "NotificationSendResponse",
    IdMessageSerializer(),
)
EmailSendResponseSerializer = envelope_serializer(
    "EmailSendResponse",
    IdMessageSerializer(),
)
NotificationListResponseSerializer = envelope_serializer(
    "NotificationListResponse",
    paginated_serializer("NotificationPage", NotificationItemSerializer),
)
NotificationMarkReadResponseSerializer = envelope_serializer(
    "NotificationMarkReadResponse",
    MessageSerializer(),
)
NotificationMarkAllReadResponseSerializer = envelope_serializer(
    "NotificationMarkAllReadResponse",
    MessageSerializer(),
)
NotificationDeleteResponseSerializer = envelope_serializer(
    "NotificationDeleteResponse",
    MessageSerializer(),
)


# ---------------------------------------------------------------------------
# 20.1 — Notification Preferences
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="notifications_preferences_get",
        tags=["notifications"],
        responses={200: OpenApiResponse(response=NotificationPreferenceResponseSerializer)},
    ),
    put=extend_schema(
        operation_id="notifications_preferences_update",
        tags=["notifications"],
        request=NotificationPreferenceSerializer,
        responses={
            200: OpenApiResponse(response=NotificationPreferenceResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class NotificationPreferenceView(APIView):
    """GET/PUT /api/v1/notifications/preferences/

    Manage notification preferences. Auth required.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = NotificationPreferenceSerializer

    def get(self, request):
        pref = UserNotificationPreference.objects.filter(user_id=request.user.pk).first()
        if not pref:
            # Return defaults
            return Response({
                "success": True,
                "data": {
                    "email_enabled": True,
                    "sms_enabled": False,
                    "application_updates": None,
                    "payment_reminders": None,
                    "interview_reminders": None,
                    "marketing_emails": None,
                    "quiet_hours_start": None,
                    "quiet_hours_end": None,
                    "timezone": None,
                },
            })

        return Response({
            "success": True,
            "data": NotificationPreferenceSerializer(pref).data,
        })

    def put(self, request):
        serializer = NotificationPreferenceSerializer(data=request.data)
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

        data = serializer.validated_data
        pref, _created = UserNotificationPreference.objects.update_or_create(
            user_id=request.user.pk,
            defaults=data,
        )

        return Response({
            "success": True,
            "data": NotificationPreferenceSerializer(pref).data,
        })


# ---------------------------------------------------------------------------
# 20.1 — Admin Send Notification
# ---------------------------------------------------------------------------


@extend_schema_view(
    post=extend_schema(
        operation_id="notifications_send",
        tags=["notifications"],
        request=NotificationSendSerializer,
        responses={
            201: OpenApiResponse(response=NotificationSendResponseSerializer),
            200: OpenApiResponse(response=NotificationSendResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class NotificationSendView(APIView):
    """POST /api/v1/notifications/

    Admin send notification with idempotency key. Admin only.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSendSerializer

    def get_permissions(self):
        return [IsAuthenticated(), _get_admin_permission()()]

    def post(self, request):
        serializer = NotificationSendSerializer(data=request.data)
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

        data = serializer.validated_data
        idempotency_key = data.get("idempotency_key")

        # Check idempotency
        if idempotency_key:
            existing = Notification.objects.filter(idempotency_key=idempotency_key).first()
            if existing:
                return Response({
                    "success": True,
                    "data": {
                        "id": str(existing.id),
                        "message": "Notification already sent (idempotent)",
                    },
                })

        notification = create_notification(
            user_id=data["user_id"],
            title=data["title"],
            message=data["message"],
            type=data.get("type", "general"),
            idempotency_key=idempotency_key,
        )

        return Response(
            {
                "success": True,
                "data": {
                    "id": str(notification.id),
                    "message": "Notification created",
                },
            },
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# 20.3 — Email Send Endpoint
# ---------------------------------------------------------------------------


@extend_schema_view(
    post=extend_schema(
        operation_id="email_send",
        tags=["email"],
        request=EmailSendSerializer,
        responses={
            202: OpenApiResponse(response=EmailSendResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class EmailSendView(APIView):
    """POST /api/v1/email/send/

    Admin-only, enqueue email via Celery.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = EmailSendSerializer

    def get_permissions(self):
        return [IsAuthenticated(), _get_admin_permission()()]

    def post(self, request):
        serializer = EmailSendSerializer(data=request.data)
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

        data = serializer.validated_data

        email_record = queue_email(
            recipient_email=data["recipient_email"],
            subject=data["subject"],
            body=data["body"],
        )

        return Response(
            {
                "success": True,
                "data": {
                    "id": str(email_record.id),
                    "message": "Email queued for delivery",
                },
            },
            status=status.HTTP_202_ACCEPTED,
        )


# ---------------------------------------------------------------------------
# 11.1 — List Notifications for Current User
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="notifications_list",
        tags=["notifications"],
        responses={200: OpenApiResponse(response=NotificationListResponseSerializer)},
    ),
    post=extend_schema(
        operation_id="notifications_send_create",
        tags=["notifications"],
        request=NotificationSendSerializer,
        responses={
            201: OpenApiResponse(response=NotificationSendResponseSerializer),
            200: OpenApiResponse(response=NotificationSendResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class NotificationListView(APIView):
    """GET /api/v1/notifications/ — list notifications for current user.
    POST /api/v1/notifications/ — admin send notification (delegates to NotificationSendView).

    Supports pagination (?page=1&pageSize=20) and filtering (?type=info&is_read=true).
    Without params, returns all notifications in the paginated envelope for backward compatibility.
    """

    permission_classes = [IsAuthenticated]

    VALID_TYPES = {"info", "success", "warning", "error"}

    def get(self, request):
        notifications = (
            Notification.objects.filter(user_id=request.user.pk)
            .order_by("-created_at")
        )

        # --- Filtering ---
        type_filter = request.query_params.get("type")
        if type_filter and type_filter in self.VALID_TYPES:
            notifications = notifications.filter(type=type_filter)

        is_read_param = request.query_params.get("is_read")
        if is_read_param is not None:
            is_read_lower = is_read_param.lower()
            if is_read_lower in ("true", "1"):
                notifications = notifications.filter(is_read=True)
            elif is_read_lower in ("false", "0"):
                notifications = notifications.filter(is_read=False)

        # --- Pagination ---
        total_count = notifications.count()

        # Parse page and pageSize with safe defaults
        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except (ValueError, TypeError):
            page = 1

        try:
            page_size = int(request.query_params.get("pageSize", 20))
        except (ValueError, TypeError):
            page_size = 20

        # Clamp pageSize between 1 and 100
        page_size = max(1, min(page_size, 100))

        # Backward compatible: without explicit params, return all results
        has_pagination_params = "page" in request.query_params or "pageSize" in request.query_params
        if not has_pagination_params:
            # Return all results but in the paginated envelope
            data = NotificationItemSerializer(notifications, many=True).data
            return Response({
                "success": True,
                "data": {
                    "page": 1,
                    "pageSize": max(total_count, 20),
                    "totalCount": total_count,
                    "results": data,
                },
            })

        # Apply pagination offset
        offset = (page - 1) * page_size
        page_qs = notifications[offset:offset + page_size]

        data = NotificationItemSerializer(page_qs, many=True).data
        return Response({
            "success": True,
            "data": {
                "page": page,
                "pageSize": page_size,
                "totalCount": total_count,
                "results": data,
            },
        })

    def post(self, request):
        """Delegate to NotificationSendView for admin send."""
        send_view = NotificationSendView()
        send_view.request = request
        # Check admin permission for POST
        if not _get_admin_permission()().has_permission(request, self):
            return Response(
                {
                    "success": False,
                    "error": "Admin access required",
                    "code": "FORBIDDEN",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        return send_view.post(request)


# ---------------------------------------------------------------------------
# 11.1 — Mark Single Notification as Read
# ---------------------------------------------------------------------------


@extend_schema_view(
    put=extend_schema(
        operation_id="notifications_mark_read",
        tags=["notifications"],
        responses={
            200: OpenApiResponse(response=NotificationMarkReadResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class NotificationMarkReadView(APIView):
    """PUT/POST /api/v1/notifications/{id}/read/

    Mark a single notification as read. Only the notification owner can do this.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = MessageSerializer

    def _mark_read(self, request, pk):
        try:
            notification = Notification.objects.get(pk=pk, user_id=request.user.pk)
        except Notification.DoesNotExist:
            return Response(
                {
                    "success": False,
                    "error": "Notification not found",
                    "code": "NOT_FOUND",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        notification.is_read = True
        notification.read_at = timezone.now()
        notification.save(update_fields=["is_read", "read_at"])

        return Response({
            "success": True,
            "data": {"message": "Notification marked as read"},
        })

    def put(self, request, pk):
        return self._mark_read(request, pk)

    def post(self, request, pk):
        return self._mark_read(request, pk)


# ---------------------------------------------------------------------------
# 11.1 — Mark All Notifications as Read
# ---------------------------------------------------------------------------


@extend_schema_view(
    put=extend_schema(
        operation_id="notifications_mark_all_read",
        tags=["notifications"],
        responses={200: OpenApiResponse(response=NotificationMarkAllReadResponseSerializer)},
    ),
)
class NotificationMarkAllReadView(APIView):
    """PUT/POST /api/v1/notifications/read-all/ or /api/v1/notifications/mark-all-read/

    Mark all unread notifications as read for the authenticated user.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = MessageSerializer

    def _mark_all_read(self, request):
        updated = Notification.objects.filter(
            user_id=request.user.pk, is_read=False
        ).update(is_read=True, read_at=timezone.now())

        return Response({
            "success": True,
            "data": {"message": f"{updated} notification(s) marked as read"},
        })

    def put(self, request):
        return self._mark_all_read(request)

    def post(self, request):
        return self._mark_all_read(request)


# ---------------------------------------------------------------------------
# 11.1 — Delete a Notification
# ---------------------------------------------------------------------------


@extend_schema_view(
    delete=extend_schema(
        operation_id="notifications_delete",
        tags=["notifications"],
        responses={
            200: OpenApiResponse(response=NotificationDeleteResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class NotificationDeleteView(APIView):
    """DELETE /api/v1/notifications/{id}/

    Delete a notification. Only the notification owner can do this.
    """

    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            notification = Notification.objects.get(pk=pk, user_id=request.user.pk)
        except Notification.DoesNotExist:
            return Response(
                {
                    "success": False,
                    "error": "Notification not found",
                    "code": "NOT_FOUND",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        notification.delete()

        return Response({
            "success": True,
            "data": {"message": "Notification deleted"},
        })


# ---------------------------------------------------------------------------
# 3.1 — Admin Notification History for a Specific User
# ---------------------------------------------------------------------------


AdminNotificationHistoryResponseSerializer = envelope_serializer(
    "AdminNotificationHistoryResponse",
    paginated_serializer("AdminNotificationHistoryPage", NotificationItemSerializer),
)


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_notification_history",
        tags=["notifications"],
        parameters=[
            OpenApiParameter(name="page", type=int, required=False, description="Page number (default 1)"),
            OpenApiParameter(name="pageSize", type=int, required=False, description="Page size (default 20, max 100)"),
        ],
        responses={
            200: OpenApiResponse(response=AdminNotificationHistoryResponseSerializer),
            403: OpenApiResponse(response=ErrorResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class AdminNotificationHistoryView(APIView):
    """GET /api/v1/notifications/user/<uuid:user_id>/

    Admin-only endpoint to view all notifications for a specific user.
    Returns 404 if the user_id does not exist, 403 for non-admin users.
    """

    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        return [IsAuthenticated(), _get_admin_permission()()]

    def get(self, request, user_id):
        # Check that the target user exists
        from apps.accounts.models import Profile

        if not Profile.objects.filter(pk=user_id).exists():
            return Response(
                {
                    "success": False,
                    "error": "User not found",
                    "code": "NOT_FOUND",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        notifications = (
            Notification.objects.filter(user_id=user_id)
            .order_by("-created_at")
        )

        # --- Pagination ---
        total_count = notifications.count()

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
        page_qs = notifications[offset:offset + page_size]

        data = NotificationItemSerializer(page_qs, many=True).data
        return Response({
            "success": True,
            "data": {
                "page": page,
                "pageSize": page_size,
                "totalCount": total_count,
                "results": data,
            },
        })
