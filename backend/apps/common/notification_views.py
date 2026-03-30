"""Notification views — preferences and admin send.

Implements tasks 20.1, 20.3.
Requirements: 8.1, 8.2, 8.3, 8.5, 8.6
"""

import logging

from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.common.models import (
    EmailQueue,
    Notification,
    UserNotificationPreference,
)
from apps.common.openapi_helpers import (
    ErrorResponseSerializer,
    IdMessageSerializer,
    envelope_serializer,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------


class NotificationPreferenceSerializer(serializers.Serializer):
    email_enabled = serializers.BooleanField(required=False, default=True)
    push_enabled = serializers.BooleanField(required=False, default=False)
    quiet_hours = serializers.JSONField(required=False, default=dict)


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

    Manage email_enabled, push_enabled, quiet_hours. Auth required.
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
                    "push_enabled": False,
                    "quiet_hours": {},
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

    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = NotificationSendSerializer

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

        notification = Notification.objects.create(
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

    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = EmailSendSerializer

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

        email_record = EmailQueue.objects.create(
            recipient_email=data["recipient_email"],
            subject=data["subject"],
            body=data["body"],
            status="pending",
        )

        # Dispatch via Celery
        from apps.common.tasks import send_email_task

        send_email_task.delay(str(email_record.id))

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
