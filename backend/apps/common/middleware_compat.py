"""Backward-compatible middleware classes - NOT mounted in MIDDLEWARE.

CSRFEnforcementMiddleware and JWTAuthenticationMiddleware were removed from
the Django MIDDLEWARE stack. CSRF is now enforced inside DRF's
``JWTCookieAuthentication._enforce_csrf`` and auth is handled entirely by
DRF authentication classes.

These classes are preserved here **only** so existing unit and property tests
that exercise them directly continue to pass. Do not add them back to
``config.settings.base.MIDDLEWARE``.
"""

import hashlib
import json
import logging
import re
import time

from django.http import JsonResponse
from django.utils import timezone as tz

logger = logging.getLogger(__name__)

# Rate-limit Redis degradation warnings to once per 60 seconds.
_last_redis_warning_time: float = 0.0


class JWTAuthenticationMiddleware:
    """Compatibility helper for JWT middleware semantics.

    This class is intentionally no longer mounted in Django's ``MIDDLEWARE``
    stack. DRF authentication classes are the only production authority for
    setting ``request.user``.

    The class remains available for two reasons:
    1. Backward-compatible unit/property tests still exercise it directly.
    2. It preserves the expired-token 403→401 conversion behavior for any
       explicit/direct use outside the global middleware stack.

    When used directly, it still performs stateless JWT decoding with no DB
    lookups so older tests retain their original guarantees.
    """

    COOKIE_NAME = "access_token"

    def __init__(self, get_response):
        self.get_response = get_response
        self._signing_key: str | None = None
        self._algorithm: str | None = None

    def __call__(self, request):
        token = self._extract_token(request)
        if token:
            user = self._authenticate(token, request)
            if user is not None:
                request.user = user
            self._flag_if_expired(token, request)

        response = self.get_response(request)

        if getattr(request, "_jwt_expired", False) and response.status_code == 403:
            if hasattr(response, "content"):
                try:
                    body = json.loads(response.content)
                    if body.get("code") == "CSRF_INVALID":
                        return response
                except (json.JSONDecodeError, AttributeError):
                    pass
            response = JsonResponse(
                {
                    "success": False,
                    "error": "Access token has expired",
                    "code": "TOKEN_EXPIRED",
                },
                status=401,
            )

        return response

    def _extract_token(self, request) -> str | None:
        token = request.COOKIES.get(self.COOKIE_NAME)
        if token:
            return token
        auth = request.META.get("HTTP_AUTHORIZATION", "")
        if auth.startswith("Bearer "):
            return auth[7:].strip()
        return None

    def _authenticate(self, token: str, request=None):
        import jwt as pyjwt

        from apps.accounts.authentication import JWTUser

        signing_key, algorithm = self._get_jwt_config()
        if not signing_key:
            logger.error("JWT_SIGNING_KEY is not configured -- middleware cannot authenticate")
            return None

        try:
            payload = pyjwt.decode(token, signing_key, algorithms=[algorithm])
        except pyjwt.ExpiredSignatureError:
            if request is not None:
                request._jwt_expired = True
            return None
        except pyjwt.InvalidTokenError:
            return None

        if payload.get("token_type") != "access":
            return None

        if not payload.get("user_id"):
            return None

        return JWTUser(payload)

    @staticmethod
    def _flag_if_expired(token: str, request) -> None:
        import jwt as pyjwt

        try:
            pyjwt.decode(token, options={"verify_signature": False, "verify_exp": True})
        except pyjwt.ExpiredSignatureError:
            request._jwt_expired = True
        except Exception:
            pass

    def _get_jwt_config(self) -> tuple[str, str]:
        if self._signing_key is None:
            from django.conf import settings

            jwt_settings = getattr(settings, "SIMPLE_JWT", {})
            self._signing_key = jwt_settings.get("SIGNING_KEY", "")
            self._algorithm = jwt_settings.get("ALGORITHM", "HS256")
        return self._signing_key, self._algorithm or "HS256"


class CSRFEnforcementMiddleware:
    """Custom CSRF token validation via X-CSRF-Token header.

    For POST, PUT, PATCH, DELETE requests:
    - Skip exempt paths (login, register, password-reset).
    - Extract X-CSRF-Token header, SHA-256 hash it, look up in csrf_tokens table.
    - Reject with 403 if missing or invalid.
    """

    EXEMPT_PATTERNS = [
        re.compile(r"^/api/v1/auth/login/?$"),
        re.compile(r"^/api/v1/auth/register/?$"),
        re.compile(r"^/api/v1/auth/password-reset/?$"),
        re.compile(r"^/api/v1/auth/password-reset/confirm/?$"),
        re.compile(r"^/api/v1/auth/logout/?$"),
        re.compile(r"^/api/v1/auth/refresh/?$"),
        re.compile(r"^/api/v1/errors/report/?$"),
        re.compile(r"^/api/v1/payments/webhook/"),
    ]

    STATE_CHANGING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        self._check_redis_health(request)

        if request.method not in self.STATE_CHANGING_METHODS:
            return self.get_response(request)

        if self._is_exempt(request.path):
            return self.get_response(request)

        if not getattr(request, "user", None) or not getattr(
            request.user, "is_authenticated", False
        ):
            return self._forbidden_response()

        user_id = request.user.pk

        csrf_token = request.META.get("HTTP_X_CSRF_TOKEN")
        if not csrf_token:
            return self._forbidden_response()

        token_hash = hashlib.sha256(csrf_token.encode()).hexdigest()

        from apps.accounts.models import CSRFToken

        if not CSRFToken.objects.filter(
            token_hash=token_hash,
            expires_at__gt=tz.now(),
            user_id=user_id,
        ).exists():
            return self._forbidden_response()

        return self.get_response(request)

    @staticmethod
    def _check_redis_health(request):
        global _last_redis_warning_time  # noqa: PLW0603
        try:
            from django.core.cache import cache

            cache.set("_csrf_redis_ping", "1", 10)
            if cache.get("_csrf_redis_ping") == "1":
                return
        except Exception:
            pass

        now = time.monotonic()
        if now - _last_redis_warning_time < 60:
            return
        _last_redis_warning_time = now

        logger.warning(
            "redis_degraded",
            extra={
                "type": "csrf_redis_warning",
                "detail": "Redis unavailable — CSRF validation using Postgres only",
                "request_id": getattr(request, "request_id", None),
            },
        )

    def _is_exempt(self, path: str) -> bool:
        return any(pattern.match(path) for pattern in self.EXEMPT_PATTERNS)

    @staticmethod
    def _forbidden_response() -> JsonResponse:
        return JsonResponse(
            {
                "success": False,
                "error": "CSRF validation failed. Please refresh and try again.",
                "code": "CSRF_INVALID",
            },
            status=403,
        )
