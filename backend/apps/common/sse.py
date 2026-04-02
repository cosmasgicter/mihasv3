"""Server-Sent Events (SSE) view with async keepalive and polling fallback.

Implements task 20.2.
Requirements: 2.2, 2.3, 2.4, 2.6, 2.7, 2.8, 9.4
"""

import asyncio
import json
import logging
import time

from asgiref.sync import sync_to_async
from django.http import StreamingHttpResponse
from drf_spectacular.utils import OpenApiResponse, OpenApiTypes, extend_schema, extend_schema_view
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.models import Notification
from apps.common.openapi_helpers import NotificationEventSerializer, envelope_serializer

logger = logging.getLogger(__name__)

KEEPALIVE_INTERVAL = 8  # seconds
MAX_DURATION = 30  # seconds


def _sse_event(data, event=None, event_id=None):
    """Format a single SSE event string."""
    lines = []
    if event_id:
        lines.append(f"id: {event_id}")
    if event:
        lines.append(f"event: {event}")
    lines.append(f"data: {json.dumps(data)}")
    lines.append("")  # blank line terminates the event
    return "\n".join(lines) + "\n"


@sync_to_async
def _fetch_notifications(user_id, last_seen_id):
    """Wrap ORM query in sync_to_async for use in async generator."""
    qs = Notification.objects.filter(user_id=user_id, is_read=False).order_by("created_at")
    if last_seen_id:
        qs = qs.filter(created_at__gt=last_seen_id)
    return list(qs[:10])


async def _async_event_stream(user_id):
    """Async generator that yields SSE events for a user.

    Sends unread notifications as events, then keepalive pings every 8s.
    Runs for up to 30 seconds before closing (client reconnects).
    """
    start = time.monotonic()
    last_seen_id = None

    while time.monotonic() - start < MAX_DURATION:
        # Check for new unread notifications
        try:
            notifications = await _fetch_notifications(user_id, last_seen_id)
            for notif in notifications:
                yield _sse_event(
                    {
                        "id": str(notif.id),
                        "title": notif.title,
                        "message": notif.message,
                        "type": notif.type,
                        "created_at": notif.created_at.isoformat() if notif.created_at else None,
                    },
                    event="notification",
                    event_id=str(notif.id),
                )
                last_seen_id = notif.created_at
        except Exception:
            logger.error("DB query failed in SSE stream", exc_info=True)

        # Keepalive ping
        yield _sse_event({"type": "keepalive"}, event="ping")
        await asyncio.sleep(KEEPALIVE_INTERVAL)


NotificationPollResponseSerializer = envelope_serializer(
    "NotificationPollResponse",
    NotificationEventSerializer(many=True),
)


@extend_schema_view(
    get=extend_schema(
        operation_id="events_stream",
        tags=["notifications"],
        responses={
            200: OpenApiResponse(
                response=OpenApiTypes.STR,
                description="Server-Sent Events stream delivering notifications and keepalive pings.",
            )
        },
    )
)
class SSEStreamView(APIView):
    """GET /api/v1/events/stream/

    Server-Sent Events with 8-second keepalive. Auth required.
    Falls back to synchronous streaming to avoid async/auth compatibility issues.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = NotificationEventSerializer

    def get(self, request):
        user_id = request.user.pk

        response = StreamingHttpResponse(
            self._sync_event_stream(user_id),
            content_type="text/event-stream",
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response

    @staticmethod
    def _sync_event_stream(user_id):
        """Synchronous generator that yields SSE events."""
        import time as _time

        start = _time.monotonic()
        last_seen_id = None

        while _time.monotonic() - start < MAX_DURATION:
            try:
                qs = Notification.objects.filter(user_id=user_id, is_read=False).order_by("created_at")
                if last_seen_id:
                    qs = qs.filter(created_at__gt=last_seen_id)
                notifications = list(qs[:10])

                for notif in notifications:
                    yield _sse_event(
                        {
                            "id": str(notif.id),
                            "title": notif.title,
                            "message": notif.message,
                            "type": notif.type,
                            "created_at": notif.created_at.isoformat() if notif.created_at else None,
                        },
                        event="notification",
                        event_id=str(notif.id),
                    )
                    last_seen_id = notif.created_at
            except Exception:
                logger.error("DB query failed in SSE stream", exc_info=True)

            yield _sse_event({"type": "keepalive"}, event="ping")
            _time.sleep(KEEPALIVE_INTERVAL)


@extend_schema_view(
    get=extend_schema(
        operation_id="events_poll",
        tags=["notifications"],
        responses={
            200: OpenApiResponse(
                response=NotificationPollResponseSerializer,
                description="Unread notifications returned as a polling fallback.",
            )
        },
    )
)
class SSEPollView(APIView):
    """GET /api/v1/events/poll/

    Polling fallback. Returns unread notifications. Auth required.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = NotificationEventSerializer

    def get(self, request):
        user_id = request.user.pk
        notifications = Notification.objects.filter(
            user_id=user_id, is_read=False
        ).order_by("-created_at")[:20]

        data = [
            {
                "id": str(n.id),
                "title": n.title,
                "message": n.message,
                "type": n.type,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in notifications
        ]

        return Response({"success": True, "data": data})
