"""Session management views.

Implements task 12.1.
Requirements: 9.1, 9.2, 9.3
"""

import logging

from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import DeviceSession
from apps.accounts.tokens import blacklist_jti, verify_token
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
        sessions = DeviceSession.objects.filter(
            user_id=user_id, is_active=True
        ).order_by("-last_active")

        data = [
            {
                "id": str(s.id),
                "device_info": s.device_info,
                "last_active": s.last_active.isoformat() if s.last_active else None,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in sessions
        ]
        return Response(data)


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

        return Response({"message": "Session revoked"})


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

        # Deactivate all active sessions
        updated = DeviceSession.objects.filter(
            user_id=user_id, is_active=True
        ).update(is_active=False)

        # Blacklist the current refresh token if present
        refresh_token = request.COOKIES.get("refresh_token")
        if refresh_token:
            try:
                payload = verify_token(refresh_token, token_type="refresh")
                blacklist_jti(payload.get("jti", ""))
            except Exception:
                pass

        return Response({"message": f"{updated} session(s) revoked"})


def _try_blacklist_refresh_for_session(request, session):
    """Best-effort blacklist of the refresh token associated with a session.

    Since we only store the hash of the refresh token (not the jti),
    we can only blacklist the current user's refresh token from cookies.
    """
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
            pass
