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


class AuthUserPayloadSerializer(serializers.Serializer):
    user = SessionSerializer()


class RegisterPayloadSerializer(serializers.Serializer):
    message = serializers.CharField()
    user = SessionSerializer(required=False)


LoginResponseSerializer = envelope_serializer(
    "AuthLoginResponse",
    AuthUserPayloadSerializer(),
)
RegisterResponseSerializer = envelope_serializer(
    "AuthRegisterResponse",
    RegisterPayloadSerializer(),
)
SessionResponseSerializer = envelope_serializer(
    "AuthSessionResponse",
    SessionSerializer(),
)
MessageEnvelopeSerializer = envelope_serializer(
    "AuthMessageResponse",
    MessageSerializer(),
)


def _get_client_ip(request) -> str:
    """Extract client IP, respecting X-Forwarded-For."""
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def _hash_value(value: str) -> str:
    """SHA-256 hash a value."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Set HTTP-only auth cookies with subdomain strategy."""
    cookie_domain = getattr(settings, "AUTH_COOKIE_DOMAIN", ".mihas.edu.zm")
    samesite = getattr(settings, "AUTH_COOKIE_SAMESITE", "Lax")
    secure = getattr(settings, "AUTH_COOKIE_SECURE", True)
    httponly = getattr(settings, "AUTH_COOKIE_HTTPONLY", True)
    refresh_max_age = int(get_refresh_token_lifetime().total_seconds())

    # Access token cookie — lifetime from settings
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
        httponly=httponly,
        secure=secure,
        samesite=samesite,
        domain=cookie_domain,
        path="/",
    )

    # Refresh token cookie (7 days)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=max(refresh_max_age, 0),
        httponly=httponly,
        secure=secure,
        samesite=samesite,
        domain=cookie_domain,
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    """Clear auth cookies."""
    cookie_domain = getattr(settings, "AUTH_COOKIE_DOMAIN", ".mihas.edu.zm")

    response.delete_cookie("access_token", domain=cookie_domain, path="/")
    response.delete_cookie("refresh_token", domain=cookie_domain, path="/")

def _generate_csrf_token(user) -> str:
    """Generate a CSRF token, store its SHA-256 hash, return the raw token."""
    from datetime import timedelta

    from django.utils import timezone as tz

    # Resolve JWTUser to Profile for FK compatibility
    if not isinstance(user, Profile):
        user = Profile.objects.get(id=user.id)

    raw_token = secrets.token_hex(32)
    token_hash = _hash_value(raw_token)

    CSRFToken.objects.create(
        user=user,
        token_hash=token_hash,
        expires_at=tz.now() + timedelta(hours=24),
    )

    return raw_token


def _has_recent_csrf_token(user) -> bool:
    """Return True when a real user already has a fresh CSRF token.

    Session bootstrap should be tolerant of mocked users and JWT-backed test
    doubles. If the user id is not a valid UUID-backed profile identifier,
    fail open and let SessionView mint a fresh token instead of exploding
    during the existence check.
    """
    user_id = getattr(user, "pk", None) or getattr(user, "id", None)
    if not user_id:
        return False

    try:
        normalized_user_id = str(uuid.UUID(str(user_id)))
    except (TypeError, ValueError, AttributeError):
        return False

    now = timezone.now()
    return CSRFToken.objects.filter(
        user_id=normalized_user_id,
        expires_at__gt=now,
        created_at__gte=now - timedelta(minutes=5),
    ).exists()


# ---------------------------------------------------------------------------
# LoginView
# ---------------------------------------------------------------------------


@extend_schema_view(
    post=extend_schema(
        operation_id="auth_login",
        tags=["auth"],
        auth=[],
        request=LoginSerializer,
        responses={
            200: OpenApiResponse(
                response=LoginResponseSerializer,
                description="Authenticates the user, sets access and refresh cookies, and returns the current user summary.",
            ),
            401: OpenApiResponse(response=ErrorResponseSerializer),
            429: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class LoginView(APIView):
    """POST /api/v1/auth/login/

    Validate credentials, check login attempts, create device session,
    generate tokens, set HTTP-only cookies, return CSRF token.
    Never reveals email existence.
    """

    permission_classes = [AllowAny]
    authentication_classes = []  # Skip JWT auth for login
    serializer_class = LoginSerializer

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            # Return field-specific validation errors (e.g. missing email/password)
            details = {}
            for field, messages in serializer.errors.items():
                details[field] = messages[0] if messages else "This field is required."
            return Response(
                {
                    "success": False,
                    "error": "Please provide both email and password.",
                    "code": "VALIDATION_ERROR",
                    "details": details,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = serializer.validated_data["email"].lower().strip()
        password = serializer.validated_data["password"]

        email_hash = _hash_value(email)
        ip_hash = _hash_value(_get_client_ip(request))

        # Check login attempts
        attempt_status = check_login_attempts(email_hash)
        if attempt_status == LoginStatus.LOCKED:
            return Response(
                {
                    "success": False,
                    "error": "Your account has been temporarily locked due to too many failed attempts. Please try again in 30 minutes or reset your password.",
                    "code": "ACCOUNT_LOCKED",
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": "1800"},
            )
        if attempt_status == LoginStatus.BLOCKED:
            return Response(
                {
                    "success": False,
                    "error": "Too many login attempts. Please wait 15 minutes before trying again.",
                    "code": "TOO_MANY_ATTEMPTS",
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": "900"},
            )

        # Look up user — generic error if not found (never reveal email existence)
        try:
            user = Profile.objects.get(email__iexact=email, is_active=True)
        except Profile.DoesNotExist:
            record_login_attempt(email_hash, ip_hash, success=False)
            return Response(
                {
                    "success": False,
                    "error": "The email or password you entered is incorrect. Please check your credentials and try again.",
                    "code": "INVALID_CREDENTIALS",
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Verify password
        if not verify_password(password, user.password_hash):
            record_login_attempt(email_hash, ip_hash, success=False)

            # Check if this triggers lockout
            new_status = check_login_attempts(email_hash)
            if new_status == LoginStatus.LOCKED:
                send_lockout_email(user)

            return Response(
                {
                    "success": False,
                    "error": "The email or password you entered is incorrect. Please check your credentials and try again.",
                    "code": "INVALID_CREDENTIALS",
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Migrate legacy hash if needed
        if needs_rehash(user.password_hash):
            user.password_hash = hash_password(password)
            user.save(update_fields=["password_hash"])

        # Record successful login
        record_login_attempt(email_hash, ip_hash, success=True)

        # Generate tokens
        access_token = generate_access_token(user)
        refresh_token = generate_refresh_token(user)

        # Create device session
        refresh_hash = _hash_value(refresh_token)
        user_agent = request.META.get("HTTP_USER_AGENT", "unknown")

        from django.utils import timezone as tz

        DeviceSession.objects.create(
            user=user,
            device_id=ip_hash[:32],
            device_info=json.dumps({"user_agent": user_agent}),
            ip_address=ip_hash,
            session_token=refresh_hash,
            user_agent=user_agent[:500],
            last_activity=tz.now(),
            is_active=True,
            expires_at=get_refresh_token_expiry(tz.now()),
            updated_at=tz.now(),
        )

        # Generate CSRF token
        csrf_token = _generate_csrf_token(user)

        # Build response
        response = Response(
            {
                "success": True,
                "data": {
                    "user": {
                        "id": str(user.id),
                        "email": user.email,
                        "first_name": user.first_name,
                        "last_name": user.last_name,
                        "role": user.role,
                    },
                },
            },
            status=status.HTTP_200_OK,
        )

        _set_auth_cookies(response, access_token, refresh_token)
        response["X-CSRF-Token"] = csrf_token

        return response


# ---------------------------------------------------------------------------
# LogoutView
# ---------------------------------------------------------------------------


@extend_schema_view(
    post=extend_schema(
        operation_id="auth_logout",
        tags=["auth"],
        request=None,
        responses={
            200: OpenApiResponse(
                response=MessageEnvelopeSerializer,
                description="Clears auth cookies and revokes the current device session when present.",
            ),
            401: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class LogoutView(APIView):
    """POST /api/v1/auth/logout/

    Deactivate device session, clear cookies. Requires auth.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = MessageSerializer

    def post(self, request):
        # Deactivate the device session matching the current refresh token
        refresh_token = request.COOKIES.get("refresh_token")
        if refresh_token:
            refresh_hash = _hash_value(refresh_token)
            DeviceSession.objects.filter(
                session_token=refresh_hash,
                is_active=True,
            ).update(is_active=False)

            # Blacklist the refresh token jti
            try:
                from apps.accounts.tokens import blacklist_jti

                payload = verify_token(refresh_token, token_type="refresh")
                blacklist_jti(payload.get("jti", ""))
            except Exception:
                logger.warning("JTI blacklisting failed during logout", exc_info=True)

        # Delete all CSRF tokens for this user before clearing cookies
        CSRFToken.objects.filter(user_id=request.user.id).delete()

        response = Response(
            {"success": True, "data": {"message": "Logged out successfully"}},
            status=status.HTTP_200_OK,
        )
        _clear_auth_cookies(response)
        return response


# ---------------------------------------------------------------------------
# RefreshView
# ---------------------------------------------------------------------------


@extend_schema_view(
    post=extend_schema(
        operation_id="auth_refresh",
        tags=["auth"],
        auth=[],
        request=None,
        responses={
            200: OpenApiResponse(
                response=MessageEnvelopeSerializer,
                description="Rotates the refresh token, reissues auth cookies, and returns a success message.",
            ),
            401: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class RefreshView(APIView):
    """POST /api/v1/auth/refresh/

    Extract refresh token from cookie, rotate tokens, set new cookies.
    """

    permission_classes = [AllowAny]
    authentication_classes = []  # Skip JWT auth — we use the refresh cookie
    serializer_class = MessageSerializer

    def post(self, request):
        refresh_token = request.COOKIES.get("refresh_token")
        if not refresh_token:
            return Response(
                {"success": False, "error": "No refresh token provided", "code": "NO_REFRESH_TOKEN"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            # Look up user from the refresh token payload for full claims
            old_payload = verify_token(refresh_token, token_type="refresh")
            user_id = old_payload.get("user_id")

            user = None
            if user_id:
                try:
                    user = Profile.objects.get(id=user_id, is_active=True)
                except Profile.DoesNotExist:
                    pass

            if user is None:
                return Response(
                    {"success": False, "error": "Invalid or expired refresh token", "code": "TOKEN_EXPIRED"},
                    status=status.HTTP_401_UNAUTHORIZED,
                )

            new_access, new_refresh = rotate_tokens(refresh_token, user=user)
        except jwt.ExpiredSignatureError:
            return Response(
                {"success": False, "error": "Refresh token has expired", "code": "TOKEN_EXPIRED"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        except ValueError as e:
            # "Token has been revoked" or "Token already consumed" — blacklisted/reused
            return Response(
                {"success": False, "error": "Refresh token has been revoked", "code": "TOKEN_EXPIRED"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        except jwt.InvalidTokenError:
            return Response(
                {"success": False, "error": "Invalid refresh token", "code": "TOKEN_EXPIRED"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        except Exception:
            logger.warning("Unexpected error during token refresh", exc_info=True)
            return Response(
                {"success": False, "error": "Token refresh failed", "code": "TOKEN_EXPIRED"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Update device session with new refresh token hash
        old_refresh_hash = _hash_value(refresh_token)
        new_refresh_hash = _hash_value(new_refresh)

        from django.utils import timezone as tz

        refreshed = DeviceSession.objects.filter(
            session_token=old_refresh_hash,
            is_active=True,
        ).update(
            session_token=new_refresh_hash,
            last_activity=tz.now(),
            expires_at=get_refresh_token_expiry(tz.now()),
            updated_at=tz.now(),
        )
        if not refreshed:
            user_agent = request.META.get("HTTP_USER_AGENT", "unknown")
            ip_hash = _hash_value(_get_client_ip(request))
            DeviceSession.objects.create(
                user=user,
                device_id=ip_hash[:32],
                device_info=json.dumps({"user_agent": user_agent}),
                ip_address=ip_hash,
                session_token=new_refresh_hash,
                user_agent=user_agent[:500],
                last_activity=tz.now(),
                is_active=True,
                expires_at=get_refresh_token_expiry(tz.now()),
                updated_at=tz.now(),
            )

        response = Response(
            {"success": True, "data": {"message": "Tokens refreshed"}},
            status=status.HTTP_200_OK,
        )
        _set_auth_cookies(response, new_access, new_refresh)

        # Generate new CSRF token so it doesn't expire before the refresh token
        csrf_token = _generate_csrf_token(user)
        response["X-CSRF-Token"] = csrf_token

        return response


# ---------------------------------------------------------------------------
# RegisterView
# ---------------------------------------------------------------------------


@extend_schema_view(
    post=extend_schema(
        operation_id="auth_register",
        tags=["auth"],
        auth=[],
        request=RegisterSerializer,
        responses={
            201: OpenApiResponse(
                response=RegisterResponseSerializer,
                description="Creates a student profile. Existing emails still return a success-shaped response to avoid account enumeration.",
            ),
            400: OpenApiResponse(response=ErrorResponseSerializer),
        },
    )
)
class RegisterView(APIView):
    """POST /api/v1/auth/register/

    Create profile with hashed password. AllowAny permission.
    Rate-limit 3/IP/10min handled by RateLimitMiddleware + view-level check.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = RegisterSerializer

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            # Build a human-readable summary from field errors
            first_error = ""
            for field, messages in serializer.errors.items():
                msg = messages[0] if isinstance(messages, list) and messages else str(messages)
                if isinstance(msg, dict):
                    msg = str(list(msg.values())[0][0]) if msg else "Invalid value."
                first_error = f"{msg}" if field == "non_field_errors" else f"{field.replace('_', ' ').title()}: {msg}"
                break

            return Response(
                {
                    "success": False,
                    "error": first_error or "Please fix the errors below and try again.",
                    "code": "VALIDATION_ERROR",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = serializer.validated_data

        # Check if email already exists — return generic success to not reveal existence
        if Profile.objects.filter(email__iexact=data["email"]).exists():
            try:
                from django.core.mail import send_mail

                send_mail(
                    subject="MIHAS Account — Sign-in Attempt",
                    message=(
                        "Someone tried to create an account with this email address. "
                        "If this was you, try signing in instead at https://apply.mihas.edu.zm/signin. "
                        "If you forgot your password, reset it at https://apply.mihas.edu.zm/forgot-password."
                    ),
                    from_email=None,
                    recipient_list=[data["email"]],
                    fail_silently=True,
                )
            except Exception:
                logger.debug("Failed to send duplicate-registration notice")

            return Response(
                {
                    "success": True,
                    "data": {"message": "Registration successful. Please check your email."},
                },
                status=status.HTTP_201_CREATED,
            )

        # Create profile
        profile = Profile.objects.create(
            email=data["email"],
            password_hash=hash_password(data["password"]),
            first_name=data["first_name"],
            last_name=data["last_name"],
            phone=data.get("phone", ""),
            nationality=data.get("nationality", "Zambian"),
            role="student",
            is_active=True,
            email_verified=False,
        )

        return Response(
            {
                "success": True,
                "data": {
                    "message": "Registration successful. Please check your email.",
                    "user": {
                        "id": str(profile.id),
                        "email": profile.email,
                        "first_name": profile.first_name,
                        "last_name": profile.last_name,
                        "role": profile.role,
                    },
                },
            },
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# SessionView
# ---------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="auth_session",
        tags=["auth"],
        responses={200: OpenApiResponse(response=SessionResponseSerializer)},
    )
)
class SessionView(APIView):
    """GET /api/v1/auth/session/

    Return current user info when authenticated.

    Public pages call this endpoint during bootstrap. Treat the absence of an
    access token as a valid "not signed in" state so the browser does not log a
    failed 403 request before the frontend can render the public page.

    Uses OptionalJWTCookieAuthentication which silently returns None for
    expired/invalid tokens instead of raising AuthenticationFailed.
    """

    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTCookieAuthentication]
    serializer_class = SessionSerializer

    def get(self, request):
        user = request.user
        if not getattr(user, "is_authenticated", False):
            return Response({"success": True, "data": None})

        serializer = SessionSerializer({
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "role": user.role,
        })
        response = Response({"success": True, "data": serializer.data})
        request_query_params = getattr(request, "query_params", request.GET)
        force_csrf_refresh = (
            request_query_params.get("refresh_csrf") == "1"
            or request.headers.get("X-CSRF-Recovery") == "1"
        )

        # Tolerance window: skip CSRF token creation if the user already has
        # a valid token issued within the last 5 minutes (the frontend still
        # holds it). Login and refresh always rotate tokens; SessionView only
        # needs to issue one when the user has none or the latest is stale.
        if force_csrf_refresh or not _has_recent_csrf_token(user):
            response["X-CSRF-Token"] = _generate_csrf_token(user)

        return response


# ---------------------------------------------------------------------------
# ProfileView
# ---------------------------------------------------------------------------


class ProfileView(APIView):
    """GET/PATCH /api/v1/auth/profile/

    GET: Return the authenticated user's full profile.
    PATCH: Validate and update editable profile fields.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={200: OpenApiTypes.OBJECT})
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

    @extend_schema(request=ProfileUpdateSerializer, responses={200: OpenApiTypes.OBJECT})
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
