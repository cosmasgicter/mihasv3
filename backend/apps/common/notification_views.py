"""Notification views - preferences, admin send, list, mark-read, delete, admin history.

Implements tasks 20.1, 20.3, 11.1 (admissions-frontend-overhaul), 3.1 (communications-history).
Requirements: 6.1, 6.2, 6.3, 8.1, 8.2, 8.3, 8.5, 8.6, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
"""

import logging
import uuid

from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.communication_history import (
    CommunicationRetryError,
    project_delivery,
    retry_email_delivery,
)
from apps.common.models import (
    Notification,
)
from apps.common.notification_preferences import (
    UNSUPPORTED_PREFERENCE,
    apply_write,
    resolve_preferences,
    validate_write,
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


class NotificationPreferenceChannelSerializer(serializers.Serializer):
    """One published delivery channel (task 10.1)."""

    key = serializers.CharField()
    enabled = serializers.BooleanField()
    configurable = serializers.BooleanField()
    mandatory = serializers.BooleanField()
    field = serializers.CharField(allow_null=True)
    definition = serializers.CharField()


class NotificationPreferenceCategorySerializer(serializers.Serializer):
    """One published message category (task 10.1)."""

    key = serializers.CharField()
    enabled = serializers.BooleanField()
    configurable = serializers.BooleanField()
    kind = serializers.CharField()
    field = serializers.CharField(allow_null=True)
    definition = serializers.CharField()


class NotificationPreferenceUnsupportedFieldSerializer(serializers.Serializer):
    field = serializers.CharField()
    code = serializers.CharField()
    reason = serializers.CharField()


class NotificationPreferenceSerializer(serializers.Serializer):
    """The one published preference schema (task 10.1, R13.8).

    Read-only by construction: the writable field names come from
    :data:`apps.common.notification_preferences.WRITABLE_FIELDS`, and the PUT
    body is validated by ``validate_write`` rather than by a serializer field
    list — because the contract's whole point is that a field the platform cannot
    honour must be **rejected with a reason**, and a DRF serializer silently
    ignores unknown keys.
    """

    schema_version = serializers.IntegerField()
    is_default = serializers.BooleanField()
    channels = NotificationPreferenceChannelSerializer(many=True)
    categories = NotificationPreferenceCategorySerializer(many=True)
    writable_fields = serializers.ListField(child=serializers.CharField())
    unsupported_fields = NotificationPreferenceUnsupportedFieldSerializer(many=True)
    # The delivery-state vocabulary the communications history renders. It is
    # published here — the schema surface — and not on every page of the inbox,
    # whose ``{page, pageSize, totalCount, results}`` envelope is registered.
    delivery_states = serializers.ListField(child=serializers.CharField())
    delivery_state_definitions = serializers.DictField(child=serializers.CharField())
    retry_limit = serializers.IntegerField()


class NotificationPreferenceWriteSerializer(serializers.Serializer):
    """Documents the writable switches for the schema only.

    The endpoint does not use this to validate — see
    :class:`NotificationPreferenceSerializer`.
    """

    email_enabled = serializers.BooleanField(required=False)
    payment_reminders = serializers.BooleanField(required=False)
    interview_reminders = serializers.BooleanField(required=False)


class NotificationSendSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    title = serializers.CharField(max_length=255, trim_whitespace=True)
    message = serializers.CharField(max_length=5000, trim_whitespace=True)
    type = serializers.ChoiceField(choices=["info", "success", "warning", "error"], default="info")
    priority = serializers.ChoiceField(
        choices=["low", "normal", "high", "urgent"],
        required=False,
        allow_null=True,
    )
    action_url = serializers.CharField(max_length=2048, required=False, allow_blank=True, allow_null=True)
    idempotency_key = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)

    def validate_user_id(self, value):
        from apps.accounts.models import Profile

        if not Profile.objects.filter(pk=value).exists():
            raise serializers.ValidationError("User not found.")
        return value


class EmailSendSerializer(serializers.Serializer):
    recipient_email = serializers.EmailField()
    subject = serializers.CharField(max_length=500)
    body = serializers.CharField()


class CommunicationChannelStateSerializer(serializers.Serializer):
    """Per-channel delivery state for one message (task 10.1, R13.4).

    Deliberately holds no provider payload: no recipient address, no SMTP
    response, no ``EmailQueue.error_message``. A classified state, an attempt
    count, a timestamp, and whether a retry is offered.
    """

    channel = serializers.CharField()
    state = serializers.CharField()
    attempts = serializers.IntegerField()
    last_attempt_at = serializers.DateTimeField(allow_null=True)
    can_retry = serializers.BooleanField()


class NotificationItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    message = serializers.CharField()
    type = serializers.CharField()
    is_read = serializers.BooleanField()
    action_url = serializers.CharField(allow_null=True, required=False)
    read_at = serializers.DateTimeField(allow_null=True, required=False)
    created_at = serializers.DateTimeField()
    # Task 10.1 (R13.4): the communications history is this list, so delivery
    # state and channel travel with the message rather than living on a second
    # surface.
    category = serializers.CharField(required=False)
    kind = serializers.CharField(required=False)
    #: `student` or `staff` — which channel set this message class may use at all
    #: (task 10.1; the question task 9.5 deferred to this schema).
    audience = serializers.CharField(required=False)
    channels = CommunicationChannelStateSerializer(many=True, required=False)
    can_retry = serializers.BooleanField(required=False)


def _with_delivery(notifications) -> list[dict]:
    """Serialize a page of notifications with their delivery projection.

    One extra query for the whole page (``project_delivery``), never one per row.
    """
    rows = list(notifications)
    data = NotificationItemSerializer(rows, many=True).data
    projection = project_delivery(rows)
    for item in data:
        item.update(projection.get(str(item.get("id")), {}))
    return data


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


def _send_notification_from_validated_data(data: dict) -> Response:
    idempotency_key = (data.get("idempotency_key") or "").strip() or None

    if idempotency_key:
        existing = Notification.objects.filter(idempotency_key=idempotency_key).first()
        if existing:
            if str(existing.user_id) != str(data["user_id"]):
                return Response(
                    {
                        "success": False,
                        "error": "Idempotency key already used for another notification",
                        "code": "IDEMPOTENCY_KEY_CONFLICT",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
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
        type=data.get("type", "info"),
        priority=data.get("priority"),
        action_url=data.get("action_url"),
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
# 20.1 - Notification Preferences
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
        request=NotificationPreferenceWriteSerializer,
        responses={
            200: OpenApiResponse(response=NotificationPreferenceResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class NotificationPreferenceView(APIView):
    """GET/PUT /api/v1/notifications/preferences/ — the real controls (task 10.1).

    The published schema and the delivery gate are the same module
    (:mod:`apps.common.notification_preferences`), so a control exists here only
    when a delivery path actually honours it (R13.8, finding STU-14).

    A PUT naming a channel the platform cannot send (``sms_enabled``,
    ``whatsapp_enabled``), a channel it will not let you switch off
    (``in_app_enabled``), a category nothing produces (``marketing_emails``), a
    mandatory transactional category (``application_updates``), or behaviour that
    is not implemented (``quiet_hours_start`` / ``quiet_hours_end`` /
    ``timezone``) is **rejected** with a per-field code and reason. The previous
    endpoint stored all of them and no delivery path read any of them.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = NotificationPreferenceSerializer

    def get(self, request):
        preferences = resolve_preferences(request.user.pk)
        return Response({"success": True, "data": preferences.as_payload()})

    def put(self, request):
        write = validate_write(request.data)
        if not write.ok:
            return Response(
                {
                    "success": False,
                    "error": "One or more notification settings are not supported.",
                    "code": UNSUPPORTED_PREFERENCE,
                    "details": {"rejected": write.rejected},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        preferences = apply_write(request.user.pk, write.updates)
        return Response({"success": True, "data": preferences.as_payload()})


# ---------------------------------------------------------------------------
# 20.1 - Admin Send Notification
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

        return _send_notification_from_validated_data(serializer.validated_data)


# ---------------------------------------------------------------------------
# 20.3 - Email Send Endpoint
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
# 11.1 - List Notifications for Current User
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="notifications_list",
        tags=["notifications"],
        parameters=[
            OpenApiParameter(name="page", type=int, required=False, description="Page number (page-number mode, default 1)"),
            OpenApiParameter(name="pageSize", type=int, required=False, description="Page size (default 20, max 100)"),
            OpenApiParameter(name="type", type=str, required=False, description="Filter by notification type"),
            OpenApiParameter(name="is_read", type=bool, required=False, description="Filter by read state"),
            OpenApiParameter(
                name="after",
                type=str,
                required=False,
                description=(
                    "Cursor mode: opaque last-seen notification id. Returns rows strictly "
                    "before the anchor's (created_at, id) key in descending order. "
                    "totalCount is null and no full-count query is executed."
                ),
            ),
        ],
        responses={
            200: OpenApiResponse(response=NotificationListResponseSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
        },
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
    """GET /api/v1/notifications/ - list notifications for current user.
    POST /api/v1/notifications/ - admin send notification (delegates to NotificationSendView).

    Two read modes:
    - **Page-number mode** (no ``after``): supports ``?page=1&pageSize=20`` and
      filtering (``?type=info&is_read=true``), returning the existing
      ``{page, pageSize, totalCount, results}`` envelope for backward
      compatibility. Without params, returns notifications in the same paginated
      envelope.
    - **Cursor mode** (``?after=<id>``): orders by descending ``(created_at, id)``
      and returns rows strictly less than the anchor's composite key, capped at
      ``min(pageSize default 20, max 100)``. Issues no ``count()`` query and
      reports ``totalCount`` as ``null`` (R9, system-performance-hardening).
    """

    permission_classes = [IsAuthenticated]

    VALID_TYPES = {"info", "success", "warning", "error"}

    def _parse_page_size(self, request, default=20):
        """Parse pageSize, defaulting to ``default`` and clamping to [1, 100]."""
        try:
            page_size = int(request.query_params.get("pageSize", default))
        except (ValueError, TypeError):
            page_size = default
        return max(1, min(page_size, 100))

    def _cursor_response(self, request, notifications, after_param):
        """Cursor-paginated response keyed on the opaque last-seen id (R9).

        ``after`` is the id of the last notification the client has already seen.
        Returns rows strictly less than that anchor's ``(created_at, id)`` key in
        descending order. No ``count()`` is issued; ``totalCount`` is ``null``.
        """
        # R9.4: an unparseable id is a validation error and returns no notifications.
        try:
            anchor_id = uuid.UUID(str(after_param))
        except (ValueError, AttributeError, TypeError):
            return Response(
                {
                    "success": False,
                    "error": "The 'after' identifier is invalid.",
                    "code": "VALIDATION_ERROR",
                    "details": {"after": ["Not a valid identifier."]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        page_size = self._parse_page_size(request)

        # Resolve the anchor row within the caller's own notifications. Scoping to
        # the requesting user means an id belonging to another user is treated as
        # unknown (empty results), never confirmed to exist.
        anchor = (
            Notification.objects.filter(user_id=request.user.pk, pk=anchor_id)
            .only("id", "created_at")
            .first()
        )

        if anchor is None:
            # R9.5: well-formed but unknown id -> empty results, no error, no count.
            return Response({
                "success": True,
                "data": {
                    "pageSize": page_size,
                    "totalCount": None,
                    "after": str(anchor_id),
                    "results": [],
                },
            })

        # R9.1: rows strictly less than the anchor's (created_at, id) composite key,
        # ordered descending. No count() is executed.
        cursor_qs = notifications.filter(
            Q(created_at__lt=anchor.created_at)
            | Q(created_at=anchor.created_at, id__lt=anchor.id)
        ).order_by("-created_at", "-id")[:page_size]

        data = _with_delivery(cursor_qs)
        return Response({
            "success": True,
            "data": {
                "pageSize": page_size,
                "totalCount": None,
                "after": str(anchor_id),
                "results": data,
            },
        })

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

        # --- Cursor mode (additive): ?after=<id> ---
        # Takes precedence over page-number mode. Issues no count() query (R9).
        after_param = request.query_params.get("after")
        if after_param is not None:
            return self._cursor_response(request, notifications, after_param)

        # --- Pagination (page-number mode, unchanged) ---
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
            # Keep the old envelope shape but cap implicit reads to avoid
            # unbounded inbox payloads on the polling endpoint.
            implicit_page_size = min(max(total_count, 20), 100)
            data = _with_delivery(notifications[:implicit_page_size])
            return Response({
                "success": True,
                "data": {
                    "page": 1,
                    "pageSize": implicit_page_size,
                    "totalCount": total_count,
                    "results": data,
                },
            })

        # Apply pagination offset
        offset = (page - 1) * page_size
        page_qs = notifications[offset:offset + page_size]

        data = _with_delivery(page_qs)
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
        """Admin send notification via the shared notification service."""
        if not _get_admin_permission()().has_permission(request, self):
            return Response(
                {
                    "success": False,
                    "error": "Admin access required",
                    "code": "FORBIDDEN",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

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

        return _send_notification_from_validated_data(serializer.validated_data)


# ---------------------------------------------------------------------------
# 10.1 - Retry a failed delivery (R13.4)
# ---------------------------------------------------------------------------


class CommunicationRetrySerializer(serializers.Serializer):
    """What a successful retry reports back."""

    message = serializers.CharField()
    channel = serializers.CharField()
    attempts = serializers.IntegerField()


CommunicationRetryResponseSerializer = envelope_serializer(
    "CommunicationRetryResponse",
    CommunicationRetrySerializer(),
)


@extend_schema_view(
    post=extend_schema(
        operation_id="communications_retry_delivery",
        tags=["notifications"],
        summary="Ask the platform to try a failed email delivery again",
        description=(
            "Owner-scoped, audited, durable redelivery of one message's failed "
            "email (task 10.1, R13.4). The retry writes a new outbox row and "
            "dispatches on commit; it is never a direct provider call. Bounded "
            "by the platform's retry limit. A message that is not in a terminal "
            "failed state is refused with `RETRY_NOT_APPLICABLE`."
        ),
        request=None,
        responses={
            200: OpenApiResponse(response=CommunicationRetryResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
            409: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
)
class CommunicationRetryView(APIView):
    """POST /api/v1/notifications/{id}/retry/

    R13.4's "retry SHALL be an authorized audited command", for the student's own
    communication history.

    Authority is **ownership**: the notification is fetched from the caller's own
    rows, so another user's id — and an unknown id — are the same 404. That is
    design §5.2's owner-authority row plus the platform's ``not_found_mask``
    disclosure policy, and it is why there is no separate permission class here.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = CommunicationRetrySerializer

    def post(self, request, pk):
        notification = Notification.objects.filter(
            pk=pk, user_id=request.user.pk
        ).first()
        if notification is None:
            return Response(
                {
                    "success": False,
                    "error": "Notification not found",
                    "code": "NOT_FOUND",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            result = retry_email_delivery(notification, request=request)
        except CommunicationRetryError as exc:
            return Response(
                {"success": False, "error": exc.message, "code": exc.code},
                status=exc.status_code,
            )

        return Response(
            {
                "success": True,
                "data": {
                    "message": "Delivery queued again.",
                    "channel": "email",
                    "attempts": result.attempts,
                },
            }
        )


# ---------------------------------------------------------------------------
# 11.1 - Mark Single Notification as Read
# ---------------------------------------------------------------------------


@extend_schema_view(
    put=extend_schema(
        operation_id="notifications_mark_read",
        tags=["notifications"],
        summary="Mark a single notification as read",
        responses={
            200: OpenApiResponse(response=NotificationMarkReadResponseSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    ),
    post=extend_schema(
        operation_id="notifications_mark_read_post",
        tags=["notifications"],
        summary="Mark a single notification as read (POST alias)",
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
# 11.1 - Mark All Notifications as Read
# ---------------------------------------------------------------------------


@extend_schema_view(
    put=extend_schema(
        operation_id="notifications_mark_all_read",
        tags=["notifications"],
        summary="Mark all unread notifications as read",
        responses={200: OpenApiResponse(response=NotificationMarkAllReadResponseSerializer)},
    ),
    post=extend_schema(
        operation_id="notifications_mark_all_read_post",
        tags=["notifications"],
        summary="Mark all unread notifications as read (POST alias)",
        responses={200: OpenApiResponse(response=NotificationMarkAllReadResponseSerializer)},
    ),
)
class NotificationMarkAllReadView(APIView):
    """PUT/POST /api/v1/notifications/read-all/ (canonical)

    Mark all unread notifications as read for the authenticated user.

    The aliases ``/mark-all-read/`` and ``/mark-read/`` route to
    :class:`NotificationMarkAllReadAliasView` which adds RFC 9745
    ``Deprecation`` and RFC 8594 ``Sunset`` headers. New integrations MUST use
    ``/read-all/``.
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
# Deprecated aliases for NotificationMarkAllReadView
# ---------------------------------------------------------------------------

# Default sunset date is 6 months after the deprecation sprint (2026-05-08).
# Override via Django setting NOTIFICATION_ALIAS_SUNSET if needed.
_DEFAULT_NOTIFICATION_ALIAS_SUNSET = "Thu, 08 Nov 2026 00:00:00 GMT"


def _notification_alias_sunset() -> str:
    from django.conf import settings
    return getattr(settings, "NOTIFICATION_ALIAS_SUNSET", _DEFAULT_NOTIFICATION_ALIAS_SUNSET)


@extend_schema_view(
    put=extend_schema(
        operation_id="notifications_mark_all_read_alias_mark_all_read",
        tags=["notifications"],
        summary="(Deprecated alias /mark-all-read/) Mark all unread as read",
        deprecated=True,
        description=(
            "Deprecated alias for PUT /api/v1/notifications/read-all/. "
            "Responses include `Deprecation: true` and `Sunset` headers per "
            "RFC 9745 / RFC 8594. Sunset: see the `Sunset` response header."
        ),
        responses={200: OpenApiResponse(response=NotificationMarkAllReadResponseSerializer)},
    ),
    post=extend_schema(
        operation_id="notifications_mark_all_read_alias_mark_all_read_post",
        tags=["notifications"],
        summary="(Deprecated alias POST /mark-all-read/) Mark all unread as read",
        deprecated=True,
        responses={200: OpenApiResponse(response=NotificationMarkAllReadResponseSerializer)},
    ),
)
class NotificationMarkAllReadAliasView(NotificationMarkAllReadView):
    """Deprecated alias view for `/api/v1/notifications/mark-all-read/`.

    Emits RFC 9745 `Deprecation: true` and RFC 8594 `Sunset: <http-date>`
    headers on every response so clients can detect the deprecation
    programmatically.

    A separate subclass ``NotificationMarkReadBatchAliasView`` is wired at
    `/api/v1/notifications/mark-read/` so the two paths have distinct
    operation_ids in the generated schema instead of colliding.
    """

    def _add_deprecation_headers(self, response):
        response["Deprecation"] = "true"
        response["Sunset"] = _notification_alias_sunset()
        response["Link"] = (
            '</api/v1/notifications/read-all/>; rel="successor-version"'
        )
        return response

    def put(self, request):
        return self._add_deprecation_headers(super().put(request))

    def post(self, request):
        return self._add_deprecation_headers(super().post(request))


@extend_schema_view(
    put=extend_schema(
        operation_id="notifications_mark_all_read_alias_mark_read",
        tags=["notifications"],
        summary="(Deprecated alias /mark-read/) Mark all unread as read",
        deprecated=True,
        description=(
            "Deprecated alias for PUT /api/v1/notifications/read-all/. "
            "Routed at /api/v1/notifications/mark-read/. Responses include "
            "`Deprecation: true` and `Sunset` headers per RFC 9745 / RFC 8594."
        ),
        responses={200: OpenApiResponse(response=NotificationMarkAllReadResponseSerializer)},
    ),
    post=extend_schema(
        operation_id="notifications_mark_all_read_alias_mark_read_post",
        tags=["notifications"],
        summary="(Deprecated alias POST /mark-read/) Mark all unread as read",
        deprecated=True,
        responses={200: OpenApiResponse(response=NotificationMarkAllReadResponseSerializer)},
    ),
)
class NotificationMarkReadBatchAliasView(NotificationMarkAllReadAliasView):
    """Deprecated alias view for `/api/v1/notifications/mark-read/`.

    Identical behavior to ``NotificationMarkAllReadAliasView``; separate class
    so drf-spectacular generates distinct operation_ids per URL path instead
    of emitting a collision warning.
    """


# ---------------------------------------------------------------------------
# 11.1 - Delete a Notification
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
# 3.1 - Admin Notification History for a Specific User
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

        # R5.2/R5.9: a scoped admin may only read notification history for users
        # within their institution membership scope. An out-of-scope (or
        # unknown) target user is masked as a genuine not-found so existence
        # cannot be inferred (R5.4, R16.4). Super-admins see all. Scope is
        # obtained from AccessScopeService, never legacy strings (R5.8).
        from apps.accounts.permissions import is_super_admin

        if not is_super_admin(request.user):
            from apps.catalog.models import UserInstitutionMembership
            from apps.catalog.services import AccessScopeService

            scope_filters = AccessScopeService().filters_for_user(request.user)
            scoped_user_ids = set(
                str(uid)
                for uid in UserInstitutionMembership.objects.filter(
                    institution_id__in=scope_filters.institution_ids,
                    is_active=True,
                ).values_list("user_id", flat=True)
            )
            own_id = str(getattr(request.user, "id", "") or getattr(request.user, "pk", ""))
            if own_id:
                scoped_user_ids.add(own_id)
            if str(user_id) not in scoped_user_ids:
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
