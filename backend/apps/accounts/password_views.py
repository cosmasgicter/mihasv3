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

# Stream 9 decomposition: shared auth helpers.
from apps.accounts.auth_helpers import (  # noqa: F401
    _clear_auth_cookies,
    _generate_csrf_token,
    _get_client_ip,
    _hash_value,
    _set_auth_cookies,
)
# MessageEnvelopeSerializer is defined in auth_views.py to avoid duplicate
# OpenAPI schema component names. Import from there.
from apps.accounts.auth_views import MessageEnvelopeSerializer  # noqa: F401

logger = logging.getLogger(__name__)




# ---------------------------------------------------------------------------
# PasswordResetRequestView
# ---------------------------------------------------------------------------


@extend_schema_view(
    post=extend_schema(
        operation_id="auth_password_reset_request",
        tags=["auth"],
        auth=[],
        request=PasswordResetRequestSerializer,
        responses={
            200: OpenApiResponse(
                response=MessageEnvelopeSerializer,
                description="Always returns success to avoid revealing whether an email exists.",
            ),
            400: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class PasswordResetRequestView(APIView):
    """POST /api/v1/auth/password-reset/

    Generate token, enqueue email via Celery. Rate-limit 3/email/15min.
    Never reveals email existence. AllowAny.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = PasswordResetRequestSerializer

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        if not serializer.is_valid():
            first_error = ""
            for field, messages in serializer.errors.items():
                msg = messages[0] if isinstance(messages, list) and messages else str(messages)
                first_error = f"{msg}" if field == "non_field_errors" else f"Please enter a valid email address."
                break
            return Response(
                {
                    "success": False,
                    "error": first_error or "Please enter a valid email address.",
                    "code": "VALIDATION_ERROR",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = serializer.validated_data["email"].lower().strip()

        # Always return success to not reveal email existence
        success_response = Response(
            {
                "success": True,
                "data": {"message": "If the email exists, a reset link has been sent."},
            },
            status=status.HTTP_200_OK,
        )

        # Rate limit: 3 per email per 15 min
        from apps.accounts.models import PasswordResetToken

        email_hash = _hash_value(email)
        from django.utils import timezone as tz

        window_start = tz.now() - timedelta(minutes=15)

        # Look up user
        try:
            user = Profile.objects.get(email__iexact=email, is_active=True)
        except Profile.DoesNotExist:
            return success_response

        # Check rate limit on reset tokens
        recent_resets = PasswordResetToken.objects.filter(
            user=user,
            created_at__gte=window_start,
        ).count()

        if recent_resets >= 3:
            # Still return success to not reveal email existence
            return success_response

        # Generate token
        raw_token = generate_password_reset_token(user)

        # Enqueue password reset email via Celery
        try:
            from apps.common.outbox import queue_email

            reset_link = (
                f"https://apply.mihas.edu.zm/auth/reset-password?token={raw_token}"
            )
            subject = "Password Reset Request"
            body = (
                "<p>You requested a password reset for your MIHAS account.</p>"
                f'<p><a href="{reset_link}">Click here to reset your password</a></p>'
                "<p>If you did not request this, you can safely ignore this email. "
                "The link will expire in 1 hour.</p>"
            )

            email_record = queue_email(
                recipient_email=user.email,
                subject=subject,
                body=body,
            )

            logger.info(
                "Password reset email queued for user_id=%s (email_queue_id=%s)",
                user.id,
                email_record.id,
            )
        except Exception:
            logger.exception(
                "Failed to queue password reset email for user_id=%s",
                user.id,
            )

        return success_response


# ---------------------------------------------------------------------------
# PasswordResetConfirmView
# ---------------------------------------------------------------------------


@extend_schema_view(
    post=extend_schema(
        operation_id="auth_password_reset_confirm",
        tags=["auth"],
        auth=[],
        request=PasswordResetConfirmSerializer,
        responses={
            200: OpenApiResponse(response=MessageEnvelopeSerializer),
            400: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class PasswordResetConfirmView(APIView):
    """POST /api/v1/auth/password-reset/confirm/

    Verify token, update password. AllowAny.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = PasswordResetConfirmSerializer

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if not serializer.is_valid():
            first_error = ""
            for field, messages in serializer.errors.items():
                msg = messages[0] if isinstance(messages, list) and messages else str(messages)
                if field == "new_password":
                    first_error = f"{msg}"
                elif field == "token":
                    first_error = "Reset token is missing."
                else:
                    first_error = f"{msg}"
                break
            return Response(
                {
                    "success": False,
                    "error": first_error or "Please fix the errors below.",
                    "code": "VALIDATION_ERROR",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        token = serializer.validated_data["token"]
        new_password = serializer.validated_data["new_password"]

        # Check if token exists but is already used
        from apps.accounts.models import PasswordResetToken

        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        try:
            reset_token = PasswordResetToken.objects.get(token_hash=token_hash)
            if reset_token.used_at is not None:
                return Response(
                    {
                        "success": False,
                        "error": "This reset link has already been used. Please request a new password reset.",
                        "code": "TOKEN_ALREADY_USED",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if reset_token.expires_at < timezone.now():
                return Response(
                    {
                        "success": False,
                        "error": "This reset link has expired. Password reset links are valid for 1 hour. Please request a new one.",
                        "code": "TOKEN_EXPIRED",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except PasswordResetToken.DoesNotExist:
            return Response(
                {
                    "success": False,
                    "error": "This reset link is invalid. Please request a new password reset.",
                    "code": "INVALID_TOKEN",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = verify_password_reset_token(token)
        if user is None:
            return Response(
                {
                    "success": False,
                    "error": "This reset link is invalid or has expired. Please request a new password reset.",
                    "code": "INVALID_TOKEN",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Update password
        user.password_hash = hash_password(new_password)
        user.save(update_fields=["password_hash"])

        return Response(
            {"success": True, "data": {"message": "Password reset successful. You can now sign in with your new password."}},
            status=status.HTTP_200_OK,
        )

