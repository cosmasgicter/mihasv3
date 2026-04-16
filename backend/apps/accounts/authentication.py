"""JWT authentication backend for DRF.

Extracts JWT from HTTP-only cookies (access_token) or Authorization Bearer header.
Sets request.user with role and permissions from JWT payload — no database lookup.

Implements task 9.1.
Requirements: 2.1, 3.1
"""

import logging

import jwt
from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

logger = logging.getLogger(__name__)


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

    def authenticate(self, request):
        token = self._extract_token(request)
        if token is None:
            return None

        payload = self._decode_token(token)
        user = JWTUser(payload)
        return (user, payload)

    def _extract_token(self, request) -> str | None:
        """Extract JWT from cookie first, then Authorization header."""
        # 1. Try HTTP-only cookie
        token = request.COOKIES.get(self.COOKIE_NAME)
        if token:
            return token

        # 2. Fallback to Authorization: Bearer <token>
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if auth_header.startswith("Bearer "):
            return auth_header[7:].strip()

        return None

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
            raise AuthenticationFailed(
                "Token has expired",
                code="TOKEN_EXPIRED",
            )
        except jwt.InvalidTokenError as e:
            logger.warning("Invalid JWT token: %s", str(e))
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
