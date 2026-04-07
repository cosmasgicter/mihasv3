"""Server-Sent Events (SSE) views — async stream and polling fallback.

The SSE stream view is a standalone async function (not a DRF class-based view)
that bypasses DRF to avoid blocking workers during long-lived connections.
Authentication is performed manually via JWT extraction from the access_token cookie.

The poll view remains a DRF APIView for short-lived request/response cycles.

Requirements: 1.1–1.8, 2.1–2.5, 10.1, 10.3, 10.4, 11.1–11.4
"""

import asyncio
import json
import logging
import threading
import time

from asgiref.sync import sync_to_async
from django.http import JsonResponse, StreamingHttpResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, OpenApiTypes, extend_schema, extend_schema_view, inline_serializer
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.models import SSEEvent
from apps.common.openapi_helpers import envelope_serializer

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

POLL_INTERVAL = 3  # seconds — DB poll frequency
KEEPALIVE_INTERVAL = 15  # seconds — ping interval
MAX_DURATION = 55  # seconds — connection lifecycle
MAX_CONNECTIONS = 50  # concurrent SSE connections per worker

# ---------------------------------------------------------------------------
# Module-level connection counter (single-instance deployment)
# ---------------------------------------------------------------------------

_connection_count = 0
_connection_lock = threading.Lock()

# ---------------------------------------------------------------------------
# SSE formatting helpers
# ---------------------------------------------------------------------------


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


def _sse_comment():
    """Return an SSE comment line (used for error resilience)."""
    return ": error\n\n"


# ---------------------------------------------------------------------------
# JWT authentication helper (replicates JWTAuthenticationMiddleware logic)
# ---------------------------------------------------------------------------


def _authenticate_from_cookie(request):
    """Extract and validate JWT from the access_token cookie.

    Returns the user_id (str) on success, or None on failure.
    Uses the same signing key and algorithm as JWTAuthenticationMiddleware.
    """
    import jwt as pyjwt
    from django.conf import settings

    token = request.COOKIES.get("access_token")
    if not token:
        return None

    jwt_settings = getattr(settings, "SIMPLE_JWT", {})
    signing_key = jwt_settings.get("SIGNING_KEY", "")
    algorithm = jwt_settings.get("ALGORITHM", "HS256")

    if not signing_key:
        logger.error("JWT_SIGNING_KEY is not configured — SSE view cannot authenticate")
        return None

    try:
        payload = pyjwt.decode(token, signing_key, algorithms=[algorithm])
    except pyjwt.ExpiredSignatureError:
        return None
    except pyjwt.InvalidTokenError as exc:
        logger.warning("Invalid JWT token in SSE stream: %s", exc)
        return None

    if payload.get("token_type") != "access":
        return None

    user_id = payload.get("user_id")
    if not user_id:
        return None

    return user_id


# ---------------------------------------------------------------------------
# Async DB helpers (sync_to_async wrappers around Django ORM)
# ---------------------------------------------------------------------------


@sync_to_async
def _fetch_undelivered_events(user_id, after_created_at=None):
    """Fetch undelivered SSEEvent rows for a user, optionally after a timestamp."""
    qs = SSEEvent.objects.filter(
        user_id=user_id,
        delivered=False,
    ).order_by("created_at")

    if after_created_at is not None:
        qs = qs.filter(created_at__gt=after_created_at)

    return list(qs)


@sync_to_async
def _mark_events_delivered(event_ids):
    """Mark a batch of SSEEvent rows as delivered."""
    if not event_ids:
        return
    SSEEvent.objects.filter(id__in=event_ids).update(
        delivered=True,
        delivered_at=timezone.now(),
    )


@sync_to_async
def _get_event_created_at(event_id):
    """Look up the created_at timestamp for a given event ID (for Last-Event-ID resume)."""
    try:
        event = SSEEvent.objects.only("created_at").get(id=event_id)
        return event.created_at
    except SSEEvent.DoesNotExist:
        return None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# SSE async stream view
# ---------------------------------------------------------------------------


async def sse_stream_view(request):
    """GET /api/v1/events/stream/

    Async ASGI streaming view that delivers SSE events to authenticated users.
    - Manual JWT auth from access_token cookie
    - Connection capacity limit (50 concurrent)
    - Polls sse_events every 3s, yields named SSE events
    - Keepalive ping every 15s
    - Closes after 55s
    - Supports Last-Event-ID for resume
    """
    global _connection_count

    # --- Auth ---
    user_id = _authenticate_from_cookie(request)
    if user_id is None:
        return JsonResponse(
            {
                "success": False,
                "error": "Authentication required",
                "code": "AUTHENTICATION_REQUIRED",
            },
            status=401,
        )

    # --- Capacity check ---
    with _connection_lock:
        if _connection_count >= MAX_CONNECTIONS:
            response = JsonResponse(
                {
                    "success": False,
                    "error": "Too many connections",
                    "code": "CAPACITY_EXCEEDED",
                },
                status=503,
            )
            response["Retry-After"] = "5"
            return response
        _connection_count += 1

    try:
        # --- Resolve Last-Event-ID for resume ---
        last_event_id = request.META.get("HTTP_LAST_EVENT_ID")
        after_created_at = None
        if last_event_id:
            after_created_at = await _get_event_created_at(last_event_id)
            # If the referenced event doesn't exist, stream all undelivered events

        response = StreamingHttpResponse(
            _async_event_stream(user_id, after_created_at),
            content_type="text/event-stream",
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response
    except Exception:
        # If we fail before returning the streaming response, release the slot
        with _connection_lock:
            _connection_count -= 1
        raise


async def _async_event_stream(user_id, after_created_at=None):
    """Async generator that yields SSE events for a user.

    Polls sse_events every 3s, sends keepalive pings every 15s,
    closes after 55s. Decrements connection counter on exit.
    """
    global _connection_count
    start = time.monotonic()
    last_ping_time = start

    try:
        while True:
            elapsed = time.monotonic() - start
            if elapsed >= MAX_DURATION:
                break

            # --- Poll for new events ---
            try:
                events = await _fetch_undelivered_events(user_id, after_created_at)
            except Exception:
                logger.error("DB query failed in SSE stream for user %s", user_id, exc_info=True)
                yield _sse_comment()
                await asyncio.sleep(POLL_INTERVAL)
                continue

            # --- Yield events ---
            if events:
                delivered_ids = []
                for event in events:
                    yield _sse_event(
                        {
                            "event_id": str(event.id),
                            "entity_id": str(event.entity_id) if event.entity_id else None,
                            "version": 1,
                            "event_type": event.event_type,
                            "payload": event.payload,
                            "created_at": event.created_at.isoformat() if event.created_at else None,
                        },
                        event=event.event_type,
                        event_id=str(event.id),
                    )
                    delivered_ids.append(event.id)
                    # Update resume cursor to the latest event's created_at
                    if event.created_at:
                        after_created_at = event.created_at

                # Mark delivered after yield
                try:
                    await _mark_events_delivered(delivered_ids)
                except Exception:
                    logger.error(
                        "Failed to mark events delivered for user %s",
                        user_id,
                        exc_info=True,
                    )

            # --- Keepalive ping (every 15s) ---
            now = time.monotonic()
            if now - last_ping_time >= KEEPALIVE_INTERVAL:
                yield _sse_event(
                    {"type": "keepalive", "server_time": timezone.now().isoformat()},
                    event="ping",
                )
                last_ping_time = now

            # --- Sleep until next poll (3s), but respect lifecycle limit ---
            remaining = MAX_DURATION - (time.monotonic() - start)
            if remaining <= 0:
                break
            await asyncio.sleep(min(POLL_INTERVAL, remaining))
    finally:
        with _connection_lock:
            _connection_count -= 1


# ---------------------------------------------------------------------------
# Poll endpoint (SSEPollView — reads from sse_events)
# ---------------------------------------------------------------------------

POLL_MAX_EVENTS = 50


class SSEEventItemSerializer(serializers.Serializer):
    event_id = serializers.UUIDField()
    entity_id = serializers.UUIDField(allow_null=True)
    version = serializers.IntegerField()
    event_type = serializers.CharField()
    payload = serializers.JSONField()
    created_at = serializers.DateTimeField(allow_null=True)


SSEPollEventsSerializer = envelope_serializer(
    "SSEPollEventsResponse",
    inline_serializer(
        name="SSEPollEventsData",
        fields={
            "events": SSEEventItemSerializer(many=True),
        },
    ),
)


@extend_schema_view(
    get=extend_schema(
        operation_id="events_poll",
        tags=["notifications"],
        responses={
            200: OpenApiResponse(
                response=SSEPollEventsSerializer,
                description="Undelivered SSE events returned as a polling fallback.",
            )
        },
    )
)
class SSEPollView(APIView):
    """GET /api/v1/events/poll/

    Polling fallback. Returns undelivered SSE events for the authenticated
    user, marks them as delivered, and supports ``lastEventId`` resume.

    Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 10.5
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user_id = request.user.pk

        # --- Build queryset: undelivered events for this user ---
        qs = SSEEvent.objects.filter(
            user_id=user_id,
            delivered=False,
        ).order_by("created_at")

        # --- lastEventId resume support ---
        last_event_id = request.query_params.get("lastEventId")
        if last_event_id:
            try:
                ref_event = SSEEvent.objects.only("created_at").get(id=last_event_id)
                qs = qs.filter(created_at__gt=ref_event.created_at)
            except (SSEEvent.DoesNotExist, ValueError, Exception):
                # Invalid or missing reference — return all undelivered events
                pass

        # --- Cap at 50 events ---
        events = list(qs[:POLL_MAX_EVENTS])

        # --- Build response payload ---
        event_data = [
            {
                "event_id": str(e.id),
                "entity_id": str(e.entity_id) if e.entity_id else None,
                "version": 1,
                "event_type": e.event_type,
                "payload": e.payload,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in events
        ]

        # --- Mark returned events as delivered ---
        if events:
            event_ids = [e.id for e in events]
            SSEEvent.objects.filter(id__in=event_ids).update(
                delivered=True,
                delivered_at=timezone.now(),
            )

        return Response({"success": True, "data": {"events": event_data}})
