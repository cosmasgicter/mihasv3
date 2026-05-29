"""Session management views.

Implements task 12.1.
Requirements: 9.1, 9.2, 9.3
"""

import logging
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import DeviceSession
from apps.accounts.session_lifecycle import active_session_filters, deactivate_stale_sessions
from apps.accounts.tokens import blacklist_jti, verify_token
from apps.accounts.views import _hash_value
from apps.common.openapi_helpers import (
    ErrorResponseSerializer,
    MessageSerializer,
    SessionDeviceSerializer,
    envelope_serializer,
)

logger = logging.getLogger(__name__)


SessionListResponseSerializer = envelope_serializer(
    "SessionListResponse",
    SessionDeviceSerializer(many=True),
)
MessageEnvelopeSerializer = envelope_serializer(
    "SessionMessageResponse",
    MessageSerializer(),
)


@extend_schema_view(
    get=extend_schema(
        operation_id="sessions_list",
        tags=["sessions"],
        responses={200: OpenApiResponse(response=SessionListResponseSerializer)},
    )
)
class SessionListView(APIView):
    """GET /api/v1/sessions/

    List active sessions for the current user.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = SessionDeviceSerializer

    def get(self, request):
        user_id = str(getattr(request.user, "id", ""))
        if not user_id:
            return Response(
                {"success": False, "error": "Authentication required", "code": "AUTHENTICATION_REQUIRED"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        deactivate_stale_sessions(user_id)
        current_refresh_hash = _hash_value(request.COOKIES["refresh_token"]) if request.COOKIES.get("refresh_token") else None

        # Show sessions active in the last 24 hours (not the full 7-day refresh window)
        # to avoid overwhelming the UI with dozens of stale entries.
        recent_cutoff = timezone.now() - timedelta(hours=24)
        sessions = DeviceSession.objects.filter(
            user_id=user_id, is_active=True
        ).filter(
            active_session_filters(timezone.now())
        ).filter(
            Q(last_activity__gte=recent_cutoff) | Q(last_activity__isnull=True, created_at__gte=recent_cutoff)
        ).order_by("-last_activity")[:10]

        data = [
            {
                "id": str(s.id),
                "device_info": s.device_info,
                "ip_address": s.ip_address,
                "last_active": s.last_activity.isoformat() if s.last_activity else None,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "is_current": bool(current_refresh_hash and s.session_token == current_refresh_hash),
            }
            for s in sessions
        ]
        return Response({"success": True, "data": data})


@extend_schema_view(
    post=extend_schema(
        operation_id="sessions_revoke",
        tags=["sessions"],
        parameters=[
            OpenApiParameter("session_id", str, OpenApiParameter.PATH, description="Session UUID to revoke."),
        ],
        responses={
            200: OpenApiResponse(response=MessageEnvelopeSerializer),
            404: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class SessionRevokeView(APIView):
    """POST /api/v1/sessions/{id}/revoke/

    Revoke a specific session and blacklist its refresh token jti.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = MessageSerializer

    def post(self, request, session_id):
        user_id = str(getattr(request.user, "id", ""))

        try:
            session = DeviceSession.objects.get(
                id=session_id, user_id=user_id, is_active=True
            )
        except DeviceSession.DoesNotExist:
            return Response(
                {"success": False, "error": "Session not found", "code": "NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Deactivate the session
        session.is_active = False
        session.save(update_fields=["is_active"])

        # Try to blacklist the refresh token jti by finding it from cookies
        # The session stores refresh_token_hash, not the jti directly.
        # We blacklist via the refresh token if available in the request cookies.
        _try_blacklist_refresh_for_session(request, session)

        return Response({"success": True, "data": {"message": "Session revoked"}})


@extend_schema_view(
    post=extend_schema(
        operation_id="sessions_revoke_all",
        tags=["sessions"],
        responses={200: OpenApiResponse(response=MessageEnvelopeSerializer)},
    )
)
class SessionRevokeAllView(APIView):
    """POST /api/v1/sessions/revoke-all/

    Revoke all sessions for the current user.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = MessageSerializer

    def post(self, request):
        user_id = str(getattr(request.user, "id", ""))
        deactivate_stale_sessions(user_id)
        current_refresh_hash = _hash_value(request.COOKIES["refresh_token"]) if request.COOKIES.get("refresh_token") else None

        # Blacklist stored JTIs for all sessions being revoked
        queryset = DeviceSession.objects.filter(
            user_id=user_id, is_active=True
        ).filter(active_session_filters(timezone.now()))
        if current_refresh_hash:
            queryset = queryset.exclude(session_token=current_refresh_hash)

        for session in queryset.filter(refresh_jti__isnull=False).only("refresh_jti"):
            try:
                blacklist_jti(session.refresh_jti)
            except Exception:
                logger.warning("Failed to blacklist JTI during revoke-all for session", exc_info=True)

        updated = queryset.update(is_active=False, updated_at=timezone.now())

        # Blacklist the current refresh token if present
        refresh_token = request.COOKIES.get("refresh_token")
        if refresh_token:
            try:
                payload = verify_token(refresh_token, token_type="refresh")
                blacklist_jti(payload.get("jti", ""))
            except Exception:
                logger.warning("Failed to blacklist current refresh token during revoke-all", exc_info=True)

        return Response({"success": True, "data": {"message": f"{updated} session(s) revoked"}})


def _try_blacklist_refresh_for_session(request, session):
    """Blacklist the refresh token associated with a session.

    Uses the stored refresh_jti on the DeviceSession if available,
    falling back to cookie-based matching for legacy sessions.
    """
    # Prefer stored JTI - works for any session, not just the current one
    if getattr(session, "refresh_jti", None):
        try:
            blacklist_jti(session.refresh_jti)
            return
        except Exception:
            logger.warning("Failed to blacklist stored refresh_jti for session %s", session.id, exc_info=True)

    # Fallback: cookie-based matching (only works for current session)
    refresh_token = request.COOKIES.get("refresh_token")
    if not refresh_token:
        return

    import hashlib

    current_hash = hashlib.sha256(refresh_token.encode("utf-8")).hexdigest()
    if current_hash == session.session_token:
        try:
            payload = verify_token(refresh_token, token_type="refresh")
            blacklist_jti(payload.get("jti", ""))
        except Exception:
            logger.warning("Failed to blacklist refresh token for revoked session", exc_info=True)
