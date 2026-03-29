"""Server-Sent Events (SSE) view with keepalive and polling fallback.

Implements task 20.2.
Requirements: 9.4
"""

import json
import logging
import time

from django.http import StreamingHttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.models import Notification

logger = logging.getLogger(__name__)

KEEPALIVE_INTERVAL = 8  # seconds


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


def _event_stream(user_id):
    """Generator that yields SSE events for a user.

    Sends unread notifications as events, then keepalive pings every 8s.
    Runs for up to 30 seconds before closing (client reconnects).
    """
    start = time.time()
    max_duration = 30  # seconds — keep connections short for serverless compat
    last_seen_id = None

    while time.time() - start < max_duration:
        # Check for new unread notifications
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

        # Keepalive ping
        yield _sse_event({"type": "keepalive"}, event="ping")
        time.sleep(KEEPALIVE_INTERVAL)


class SSEStreamView(APIView):
    """GET /api/v1/events/stream/

    Server-Sent Events with 8-second keepalive. Auth required.
    Uses Django StreamingHttpResponse.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user_id = request.user.pk

        response = StreamingHttpResponse(
            _event_stream(user_id),
            content_type="text/event-stream",
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


class SSEPollView(APIView):
    """GET /api/v1/events/poll/

    Polling fallback. Returns unread notifications. Auth required.
    """

    permission_classes = [IsAuthenticated]

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
