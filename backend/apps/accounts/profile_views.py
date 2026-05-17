"""Authentication views.

Implements task 9.5.
Requirements: 2.1, 2.3, 2.4, 2.5, 2.9, 2.10, 2.11, 2.12, 18.2
"""

import hashlib
import json
import logging
import secrets
import uuid
from datetime import timedelta

import jwt
from django.conf import settings
from drf_spectacular.utils import OpenApiResponse, OpenApiTypes, extend_schema, extend_schema_view
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authentication import OptionalJWTCookieAuthentication

from apps.accounts.session_lifecycle import get_refresh_token_expiry, get_refresh_token_lifetime
from apps.accounts.models import CSRFToken, DeviceSession, Profile
from django.utils import timezone

from apps.accounts.serializers import (
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileReadSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    SessionSerializer,
)
from apps.accounts.services import (
    LoginStatus,
    check_login_attempts,
    generate_password_reset_token,
    hash_password,
    needs_rehash,
    record_login_attempt,
    send_lockout_email,
    verify_password,
    verify_password_reset_token,
)
from apps.accounts.tokens import (
    generate_access_token,
    generate_refresh_token,
    rotate_tokens,
    verify_token,
)
from apps.common.openapi_helpers import ErrorResponseSerializer, MessageSerializer, envelope_serializer

logger = logging.getLogger(__name__)




# ---------------------------------------------------------------------------
# ProfileView
# ---------------------------------------------------------------------------


class ProfileView(APIView):
    """GET/PATCH /api/v1/auth/profile/

    GET: Return the authenticated user's full profile.
    PATCH: Validate and update editable profile fields.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={200: OpenApiTypes.OBJECT}, tags=["auth"], summary="Get authenticated user profile")
    def get(self, request):
        try:
            profile = Profile.objects.get(id=request.user.id)
        except Profile.DoesNotExist:
            return Response(
                {"success": False, "error": "Profile not found"},
                status=404,
            )
        serializer = ProfileReadSerializer(profile)
        return Response({"success": True, "data": serializer.data})

    @extend_schema(request=ProfileUpdateSerializer, responses={200: OpenApiTypes.OBJECT}, tags=["auth"], summary="Update authenticated user profile")
    def patch(self, request):
        try:
            profile = Profile.objects.get(id=request.user.id)
        except Profile.DoesNotExist:
            return Response(
                {"success": False, "error": "Profile not found"},
                status=404,
            )
        serializer = ProfileUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        for field, value in serializer.validated_data.items():
            setattr(profile, field, value)

        profile.updated_at = timezone.now()
        profile.save(
            update_fields=list(serializer.validated_data.keys()) + ["updated_at"]
        )

        read_serializer = ProfileReadSerializer(profile)
        return Response({"success": True, "data": read_serializer.data})

