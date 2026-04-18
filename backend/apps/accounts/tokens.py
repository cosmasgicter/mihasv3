"""JWT token generation and verification utilities.

Implements task 9.2.
Requirements: 2.1, 2.3, 18.4
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import redis
from django.conf import settings

logger = logging.getLogger(__name__)

# Redis-backed JTI blacklist (replaces in-memory set).
# Uses the same Upstash Redis instance as Celery broker.
_redis_client = None
JTI_PREFIX = "jti:"


def _get_redis() -> redis.Redis:
    """Lazy-init Redis client from CELERY_BROKER_URL."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            settings.CELERY_BROKER_URL,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
        )
    return _redis_client


def _get_signing_key() -> str:
    return settings.SIMPLE_JWT.get("SIGNING_KEY", "")


def _get_algorithm() -> str:
    return settings.SIMPLE_JWT.get("ALGORITHM", "HS256")


def generate_access_token(user) -> str:
    """Generate a 15-minute access token with user claims.

    Payload includes: user_id, email, role, permissions, token_type, exp, iat, jti.
    """
    now = datetime.now(timezone.utc)
    lifetime = settings.SIMPLE_JWT.get("ACCESS_TOKEN_LIFETIME", timedelta(minutes=15))

    # Build permissions list from role
    permissions = _get_permissions_for_role(getattr(user, "role", "student"))

    payload = {
        "token_type": "access",
        "user_id": str(user.id) if hasattr(user, "id") else str(user.pk),
        "email": getattr(user, "email", ""),
        "role": getattr(user, "role", "student"),
        "first_name": getattr(user, "first_name", ""),
        "last_name": getattr(user, "last_name", ""),
        "permissions": permissions,
        "iat": now,
        "exp": now + lifetime,
        "jti": str(uuid.uuid4()),
    }

    return jwt.encode(payload, _get_signing_key(), algorithm=_get_algorithm())


def generate_refresh_token(user) -> str:
    """Generate a 7-day refresh token with jti for blacklisting.

    Payload includes: user_id, token_type, exp, iat, jti.
    """
    now = datetime.now(timezone.utc)
    lifetime = settings.SIMPLE_JWT.get("REFRESH_TOKEN_LIFETIME", timedelta(days=7))

    payload = {
        "token_type": "refresh",
        "user_id": str(user.id) if hasattr(user, "id") else str(user.pk),
        "iat": now,
        "exp": now + lifetime,
        "jti": str(uuid.uuid4()),
    }

    return jwt.encode(payload, _get_signing_key(), algorithm=_get_algorithm())


def verify_token(token: str, token_type: str = "access") -> dict:
    """Decode and validate a JWT token.

    Args:
        token: The JWT string.
        token_type: Expected token_type claim ('access' or 'refresh').

    Returns:
        The decoded payload dict.

    Raises:
        jwt.ExpiredSignatureError: If the token has expired.
        jwt.InvalidTokenError: If the token is invalid.
        ValueError: If the token_type doesn't match or jti is blacklisted.
    """
    payload = jwt.decode(
        token,
        _get_signing_key(),
        algorithms=[_get_algorithm()],
    )

    if payload.get("token_type") != token_type:
        raise ValueError(f"Expected token_type '{token_type}', got '{payload.get('token_type')}'")

    # Check blacklist for refresh tokens
    if token_type == "refresh":
        jti = payload.get("jti", "")
        if is_jti_blacklisted(jti):
            raise ValueError("Token has been revoked")

    return payload


def rotate_tokens(refresh_token: str, user=None) -> tuple[str, str]:
    """Verify the refresh token, blacklist it, and generate a new pair.

    Args:
        refresh_token: The current refresh token string.
        user: Optional user object. If not provided, a minimal user is built from payload.

    Returns:
        Tuple of (new_access_token, new_refresh_token).

    Raises:
        jwt.ExpiredSignatureError: If the refresh token has expired.
        jwt.InvalidTokenError: If the refresh token is invalid.
        ValueError: If the token is already blacklisted or wrong type.
    """
    payload = verify_token(refresh_token, token_type="refresh")

    # Blacklist the old refresh token's jti
    old_jti = payload.get("jti", "")
    blacklist_jti(old_jti)

    # Build a minimal user-like object from the payload if not provided
    if user is None:
        user = _UserFromPayload(payload)

    new_access = generate_access_token(user)
    new_refresh = generate_refresh_token(user)

    return new_access, new_refresh


def blacklist_jti(jti: str, ttl_seconds: int = 604800) -> None:
    """Store jti in Redis with TTL. Logs errors but does not raise to avoid blocking auth."""
    try:
        _get_redis().setex(f"{JTI_PREFIX}{jti}", ttl_seconds, "1")
    except redis.RedisError:
        logger.error("CRITICAL: Redis write failed for JTI blacklist — old token may remain valid", exc_info=True)


def is_jti_blacklisted(jti: str) -> bool:
    """Check Redis for jti. Fail-closed on read errors."""
    try:
        return _get_redis().exists(f"{JTI_PREFIX}{jti}") > 0
    except redis.RedisError:
        logger.error("Redis read failed for JTI blacklist", exc_info=True)
        return True  # Fail-closed: treat as blacklisted


def _get_permissions_for_role(role: str) -> list[str]:
    """Return deterministic permissions list for a given role. No DB lookup."""
    role_permissions = {
        "super_admin": [
            "users:read", "users:write",
            "applications:read", "applications:write", "applications:review",
            "programs:read", "programs:write",
            "payments:read", "payments:write", "payments:verify",
            "documents:read", "documents:write", "documents:verify",
            "notifications:read", "notifications:write",
            "analytics:read",
            "settings:read", "settings:write",
            "audit:read",
        ],
        "admin": [
            "users:read",
            "applications:read", "applications:write", "applications:review",
            "programs:read",
            "payments:read", "payments:verify",
            "documents:read", "documents:verify",
            "notifications:read", "notifications:write",
            "analytics:read",
        ],
        "reviewer": [
            "applications:read", "applications:review",
            "documents:read",
            "notifications:read",
        ],
        "student": [
            "applications:read", "applications:write",
            "documents:read", "documents:write",
            "payments:read",
            "notifications:read",
        ],
    }
    return role_permissions.get(role, role_permissions["student"])


class _UserFromPayload:
    """Minimal user-like object built from a JWT payload for token rotation."""

    def __init__(self, payload: dict):
        self.id = payload.get("user_id")
        self.pk = self.id
        self.email = payload.get("email", "")
        self.role = payload.get("role", "student")
        self.first_name = payload.get("first_name", "")
        self.last_name = payload.get("last_name", "")
