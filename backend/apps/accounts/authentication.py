"""JWT authentication backend for DRF.

Extracts JWT from HTTP-only cookies (access_token) or Authorization Bearer header.
Sets request.user with role and permissions from JWT payload — no database lookup.

Implements task 9.1.
Requirements: 2.1, 3.1
"""

import logging
import re
from django.utils import timezone as tz

import jwt
from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied

from apps.common.metrics import emit_metric

logger = logging.getLogger(__name__)


STATE_CHANGING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
CSRF_EXEMPT_PATTERNS = [
    re.compile(r"^/api/v1/auth/login/?$"),
    re.compile(r"^/api/v1/auth/register/?$"),
    re.compile(r"^/api/v1/auth/password-reset/?$"),
    re.compile(r"^/api/v1/auth/password-reset/confirm/?$"),
    re.compile(r"^/api/v1/auth/logout/?$"),
    re.compile(r"^/api/v1/auth/refresh/?$"),
    re.compile(r"^/api/v1/errors/report/?$"),
    re.compile(r"^/api/v1/payments/webhook/"),
]


class CSRFPermissionDenied(PermissionDenied):
    default_detail = "CSRF validation failed. Please refresh and try again."
    default_code = "CSRF_INVALID"


def _is_csrf_exempt(path: str) -> bool:
    return any(pattern.match(path) for pattern in CSRF_EXEMPT_PATTERNS)


def validate_csrf_token_for_user(user_id: str, csrf_token: str | None) -> None:
    from apps.accounts.models import CSRFToken

    if not csrf_token:
        raise CSRFPermissionDenied(
            "CSRF validation failed. Please refresh and try again.",
            code="CSRF_MISSING",
        )

    import hashlib

    token_hash = hashlib.sha256(csrf_token.encode()).hexdigest()
    exists = CSRFToken.objects.filter(
        token_hash=token_hash,
        expires_at__gt=tz.now(),
        user_id=user_id,
    ).exists()
    if not exists:
        raise CSRFPermissionDenied(
            "CSRF validation failed. Please refresh and try again.",
            code="CSRF_INVALID",
        )


class JWTUser:
    """Lightweight user object built from JWT payload. No DB lookup."""

    def __init__(self, payload: dict):
        self.pk = payload.get("user_id")
        self.id = self.pk
        self.email = payload.get("email", "")
        self.role = payload.get("role", "student")
        self.permissions = payload.get("permissions", [])
        self.first_name = payload.get("first_name", "")
        self.last_name = payload.get("last_name", "")
        self.is_authenticated = True
        self.is_active = True

    def __str__(self):
        return f"{self.email} ({self.role})"


class JWTCookieAuthentication(BaseAuthentication):
    """Extract JWT from HTTP-only cookies or Authorization Bearer header.

    Cookie name: access_token (checked first)
    Header fallback: Authorization: Bearer <token>

    Returns (JWTUser, token_payload) on success.
    Raises AuthenticationFailed on invalid/expired token.
    """

    COOKIE_NAME = "access_token"

    def authenticate_header(self, request) -> str:
        """Force DRF authentication failures to return 401 instead of 403."""
        return 'Bearer realm="api"'

    def authenticate(self, request):
        token, source = self._extract_token(request)
        if token is None:
            return None

        payload = self._decode_token(token)
        user = JWTUser(payload)
        if source == "cookie":
            self._enforce_csrf(request, user)
        return (user, payload)

    def _extract_token(self, request) -> tuple[str | None, str | None]:
        """Extract JWT from cookie first, then Authorization header."""
        # 1. Try HTTP-only cookie
        token = request.COOKIES.get(self.COOKIE_NAME)
        if token:
            return token, "cookie"

        # 2. Fallback to Authorization: Bearer <token>
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if auth_header.startswith("Bearer "):
            return auth_header[7:].strip(), "bearer"

        return None, None

    def _enforce_csrf(self, request, user: JWTUser) -> None:
        if request.method not in STATE_CHANGING_METHODS:
            return
        if _is_csrf_exempt(request.path):
            return

        try:
            validate_csrf_token_for_user(
                str(user.id),
                request.META.get("HTTP_X_CSRF_TOKEN"),
            )
        except CSRFPermissionDenied:
            emit_metric('csrf.validation_failed', user_id=str(user.id), path=request.path)
            raise

    def _decode_token(self, token: str) -> dict:
        """Decode and validate the JWT token."""
        signing_key = settings.SIMPLE_JWT.get("SIGNING_KEY", "")
        algorithm = settings.SIMPLE_JWT.get("ALGORITHM", "HS256")

        if not signing_key:
            logger.error("JWT_SIGNING_KEY is not configured")
            raise AuthenticationFailed(
                "Authentication service unavailable",
                code="AUTH_SERVICE_ERROR",
            )

        try:
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=[algorithm],
            )
        except jwt.ExpiredSignatureError:
            emit_metric('auth.token_expired')
            raise AuthenticationFailed(
                "Token has expired",
                code="TOKEN_EXPIRED",
            )
        except jwt.InvalidTokenError as e:
            logger.warning("Invalid JWT token: %s", str(e))
            emit_metric('auth.token_invalid')
            raise AuthenticationFailed(
                "Invalid authentication token",
                code="INVALID_TOKEN",
            )

        # Validate required claims
        if not payload.get("user_id"):
            raise AuthenticationFailed(
                "Invalid token payload",
                code="INVALID_TOKEN",
            )

        if payload.get("token_type") != "access":
            raise AuthenticationFailed(
                "Invalid token type",
                code="INVALID_TOKEN",
            )

        return payload


class OptionalJWTCookieAuthentication(JWTCookieAuthentication):
    """Best-effort JWT auth for public endpoints.

    Public catalog endpoints can use this authenticator to identify admins when
    a valid cookie is present without failing the request for anonymous users
    who happen to have an expired or invalid cookie.
    """

    def authenticate(self, request):
        try:
            return super().authenticate(request)
        except AuthenticationFailed as exc:
            logger.debug("Ignoring invalid optional JWT on public endpoint: %s", exc)
            return None
