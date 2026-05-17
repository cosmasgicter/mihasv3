"""Shared auth helpers for accounts views.

Extracted during Stream 9 backend module decomposition. Originally these
helpers lived inline in ``apps/accounts/views.py`` before that file was
split into ``auth_views.py``, ``password_views.py``, ``profile_views.py``,
and ``session_views.py``. They are kept here so all four submodules can
import the same canonical helpers.

The original ``views.py`` is now a re-export shim that includes these
symbols for backward compatibility with existing tests and integrations.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.response import Response

from apps.accounts.models import CSRFToken, Profile
from apps.accounts.session_lifecycle import get_refresh_token_lifetime


def _get_client_ip(request) -> str:
    """Extract the client IP address, respecting X-Forwarded-For."""
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def _hash_value(value: str) -> str:
    """SHA-256 hash a value (used for refresh-token-hash + email-hash + IP-hash)."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Set HTTP-only access + refresh cookies with the subdomain strategy."""
    cookie_domain = getattr(settings, "AUTH_COOKIE_DOMAIN", ".mihas.edu.zm")
    samesite = getattr(settings, "AUTH_COOKIE_SAMESITE", "Lax")
    secure = getattr(settings, "AUTH_COOKIE_SECURE", True)
    httponly = getattr(settings, "AUTH_COOKIE_HTTPONLY", True)
    refresh_max_age = int(get_refresh_token_lifetime().total_seconds())

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
    """Clear access + refresh cookies."""
    cookie_domain = getattr(settings, "AUTH_COOKIE_DOMAIN", ".mihas.edu.zm")
    response.delete_cookie("access_token", domain=cookie_domain, path="/")
    response.delete_cookie("refresh_token", domain=cookie_domain, path="/")


def _generate_csrf_token(user) -> str:
    """Generate a CSRF token, store its SHA-256 hash, return the raw token.

    The token is stored in the ``csrf_tokens`` table keyed to the user, with
    a 24-hour expiry. The raw token is returned to the caller (typically
    placed in the ``X-CSRF-Token`` response header) and is never persisted
    in the database — only its SHA-256 hash.
    """
    if not isinstance(user, Profile):
        user = Profile.objects.get(id=user.id)

    raw_token = secrets.token_hex(32)
    token_hash = _hash_value(raw_token)

    CSRFToken.objects.create(
        user=user,
        token_hash=token_hash,
        expires_at=timezone.now() + timedelta(hours=24),
    )

    return raw_token


def _has_recent_csrf_token(user) -> bool:
    """Return True when a real user already has a fresh CSRF token (≤5 min old).

    Tolerant of mocked users and JWT-backed test doubles. If the user id is
    not a valid UUID-backed profile identifier, fail open and let
    ``SessionView`` mint a fresh token rather than throwing.
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


__all__ = [
    "_clear_auth_cookies",
    "_generate_csrf_token",
    "_get_client_ip",
    "_has_recent_csrf_token",
    "_hash_value",
    "_set_auth_cookies",
]
