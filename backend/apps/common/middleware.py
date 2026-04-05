"""Middleware chain for the MIHAS Django API.

Implements security headers, request ID propagation, rate limiting,
JWT authentication (stub), CSRF enforcement, and audit logging.

Middleware ordering (configured in base.py):
1. SecurityHeadersMiddleware
2. django.middleware.security.SecurityMiddleware
3. whitenoise.middleware.WhiteNoiseMiddleware
4. corsheaders.middleware.CorsMiddleware
5. RequestIDMiddleware
6. RateLimitMiddleware
7. django.middleware.common.CommonMiddleware
8. JWTAuthenticationMiddleware
9. CSRFEnforcementMiddleware
10. AuditMiddleware
"""

import hashlib
import logging
import re
import uuid

from django.http import JsonResponse

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 7.1 — SecurityHeadersMiddleware
# ---------------------------------------------------------------------------


class SecurityHeadersMiddleware:
    """Set security headers on every response.

    Headers: HSTS, X-Content-Type-Options, X-Frame-Options,
    Referrer-Policy, Permissions-Policy.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )
        response["X-Content-Type-Options"] = "nosniff"
        response["X-Frame-Options"] = "DENY"
        response["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )
        return response


# ---------------------------------------------------------------------------
# 7.2 — RequestIDMiddleware
# ---------------------------------------------------------------------------


class RequestIDMiddleware:
    """Generate or propagate an X-Request-ID on every request/response."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Use incoming header if present, otherwise generate a new UUID4.
        request_id = request.META.get("HTTP_X_REQUEST_ID") or str(uuid.uuid4())
        request.request_id = request_id

        response = self.get_response(request)
        response["X-Request-ID"] = request_id
        return response


# ---------------------------------------------------------------------------
# 7.3 — RateLimitMiddleware
# ---------------------------------------------------------------------------


class RateLimitMiddleware:
    """Per-scope rate limiting using django-ratelimit.

    Scopes and limits (matching existing Arcjet configuration):
      /api/v1/auth/          → 60/5m
      /api/v1/admin/         → 60/10m
      /api/v1/documents/     → 20/10m
      /api/v1/sessions/      → 30/10m
      /api/v1/notifications/ → 50/10m
    """

    # (prefix, rate string)
    SCOPE_LIMITS = [
        ("/api/v1/auth/", "60/5m"),
        ("/api/v1/admin/", "60/10m"),
        ("/api/v1/documents/", "20/10m"),
        ("/api/v1/sessions/", "30/10m"),
        ("/api/v1/notifications/", "50/10m"),
        ("/api/v1/errors/", "10/5m"),
    ]

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        from django_ratelimit.core import is_ratelimited

        for prefix, rate in self.SCOPE_LIMITS:
            if request.path.startswith(prefix):
                # Derive a stable group name from the prefix.
                group = prefix.strip("/").replace("/", ".")
                try:
                    limited = is_ratelimited(
                        request=request,
                        group=group,
                        key="ip",
                        rate=rate,
                        increment=True,
                    )
                except Exception:
                    logger.warning(
                        "Rate limiter unavailable for scope %s; failing open",
                        prefix,
                        exc_info=True,
                    )
                    limited = False
                if limited:
                    response = JsonResponse(
                        {
                            "success": False,
                            "error": "Rate limit exceeded",
                            "code": "RATE_LIMITED",
                        },
                        status=429,
                    )
                    response["Retry-After"] = str(
                        self._retry_after_seconds(rate)
                    )
                    return response
                # Only the first matching scope applies.
                break

        return self.get_response(request)

    @staticmethod
    def _retry_after_seconds(rate: str) -> int:
        """Parse a rate string like '60/5m' and return the window in seconds."""
        _, window = rate.split("/")
        match = re.match(r"(\d+)([smh])", window)
        if not match:
            return 60
        value, unit = int(match.group(1)), match.group(2)
        multipliers = {"s": 1, "m": 60, "h": 3600}
        return value * multipliers.get(unit, 60)


# ---------------------------------------------------------------------------
# 7.8 — JWTAuthenticationMiddleware
# ---------------------------------------------------------------------------


class JWTAuthenticationMiddleware:
    """Extract JWT from cookies/Bearer header and set request.user.

    Purely stateless — no database queries. On any validation failure the
    request passes through silently so DRF permission classes can enforce
    authentication downstream.

    Token extraction order:
      1. ``access_token`` HTTP-only cookie (primary)
      2. ``Authorization: Bearer <token>`` header (fallback)

    Requirements: 1.1–1.9
    """

    COOKIE_NAME = "access_token"

    def __init__(self, get_response):
        self.get_response = get_response
        self._signing_key: str | None = None
        self._algorithm: str | None = None

    def __call__(self, request):
        token = self._extract_token(request)
        if token:
            user = self._authenticate(token)
            if user is not None:
                request.user = user
        return self.get_response(request)

    # ------------------------------------------------------------------
    # Token extraction
    # ------------------------------------------------------------------

    def _extract_token(self, request) -> str | None:
        """Return the raw JWT string, or *None* if no token is present."""
        # 1. Cookie first
        token = request.COOKIES.get(self.COOKIE_NAME)
        if token:
            return token
        # 2. Authorization: Bearer fallback
        auth = request.META.get("HTTP_AUTHORIZATION", "")
        if auth.startswith("Bearer "):
            return auth[7:].strip()
        return None

    # ------------------------------------------------------------------
    # Token validation (stateless — no DB queries)
    # ------------------------------------------------------------------

    def _authenticate(self, token: str):
        """Decode *token* and return a ``JWTUser``, or *None* on failure."""
        import jwt as pyjwt

        from apps.accounts.authentication import JWTUser

        signing_key, algorithm = self._get_jwt_config()
        if not signing_key:
            logger.error("JWT_SIGNING_KEY is not configured — middleware cannot authenticate")
            return None

        try:
            payload = pyjwt.decode(token, signing_key, algorithms=[algorithm])
        except pyjwt.ExpiredSignatureError:
            # Expired tokens are expected; pass through silently.
            return None
        except pyjwt.InvalidTokenError as exc:
            logger.warning("Invalid JWT token in middleware: %s", exc)
            return None

        # Validate token_type == 'access'
        if payload.get("token_type") != "access":
            return None

        # Validate user_id is present and non-empty
        user_id = payload.get("user_id")
        if not user_id:
            return None

        return JWTUser(payload)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _get_jwt_config(self) -> tuple[str, str]:
        """Lazy-load signing key and algorithm from ``settings.SIMPLE_JWT``."""
        if self._signing_key is None:
            from django.conf import settings

            jwt_settings = getattr(settings, "SIMPLE_JWT", {})
            self._signing_key = jwt_settings.get("SIGNING_KEY", "")
            self._algorithm = jwt_settings.get("ALGORITHM", "HS256")
        return self._signing_key, self._algorithm


# ---------------------------------------------------------------------------
# 7.4 — CSRFEnforcementMiddleware
# ---------------------------------------------------------------------------


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
    ]

    STATE_CHANGING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method not in self.STATE_CHANGING_METHODS:
            return self.get_response(request)

        # Check exempt paths.
        if self._is_exempt(request.path):
            return self.get_response(request)

        csrf_token = request.META.get("HTTP_X_CSRF_TOKEN")
        if not csrf_token:
            return self._forbidden_response()

        # Hash the token and look it up.
        token_hash = hashlib.sha256(csrf_token.encode()).hexdigest()

        from apps.accounts.models import CSRFToken

        if not CSRFToken.objects.filter(token_hash=token_hash).exists():
            return self._forbidden_response()

        return self.get_response(request)

    def _is_exempt(self, path: str) -> bool:
        return any(pattern.match(path) for pattern in self.EXEMPT_PATTERNS)

    @staticmethod
    def _forbidden_response() -> JsonResponse:
        return JsonResponse(
            {
                "success": False,
                "error": "CSRF validation failed",
                "code": "CSRF_VALIDATION_FAILED",
            },
            status=403,
        )


# ---------------------------------------------------------------------------
# 7.5 — AuditMiddleware
# ---------------------------------------------------------------------------


class AuditMiddleware:
    """Log state-changing operations to the audit_logs table.

    For POST, PUT, PATCH, DELETE requests that return a 2xx status:
    - Record actor_id, action (HTTP method), entity_type (from URL path).
    - Hash IP address and user-agent with SHA-256 (never store PII).
    - Assign retention_category: 'security' for auth/session paths, 'standard' otherwise.
    """

    STATE_CHANGING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

    SECURITY_PREFIXES = ("/api/v1/auth/", "/api/v1/sessions/")

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        if (
            request.method not in self.STATE_CHANGING_METHODS
            or not (200 <= response.status_code < 300)
        ):
            return response

        try:
            self._create_audit_entry(request)
        except Exception:
            # Audit logging must never break the response.
            logger.exception("Failed to create audit log entry")

        return response

    def _create_audit_entry(self, request):
        from apps.common.models import AuditLog

        actor_id = None
        if hasattr(request, "user") and getattr(request.user, "is_authenticated", False):
            actor_id = getattr(request.user, "pk", None)

        ip_address = self._get_client_ip(request)
        ip_hash = hashlib.sha256(ip_address.encode()).hexdigest()

        user_agent = request.META.get("HTTP_USER_AGENT", "")
        ua_hash = hashlib.sha256(user_agent.encode()).hexdigest()

        entity_type = self._extract_entity_type(request.path)
        retention = self._retention_category(request.path)

        AuditLog.objects.create(
            actor_id=actor_id,
            action=request.method,
            entity_type=entity_type,
            ip_address=ip_hash,
            user_agent=ua_hash,
            retention_category=retention,
        )

    @staticmethod
    def _get_client_ip(request) -> str:
        """Return the client IP, respecting X-Forwarded-For behind a proxy."""
        xff = request.META.get("HTTP_X_FORWARDED_FOR")
        if xff:
            return xff.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "")

    @staticmethod
    def _extract_entity_type(path: str) -> str:
        """Derive entity_type from the URL path.

        E.g. /api/v1/applications/123/ → 'applications'
             /api/v1/auth/login/       → 'auth'
        """
        parts = [p for p in path.strip("/").split("/") if p]
        # Skip 'api' and 'v1' prefix segments.
        for i, part in enumerate(parts):
            if part == "v1" and i + 1 < len(parts):
                return parts[i + 1]
        # Fallback: return the last meaningful segment.
        return parts[-1] if parts else "unknown"

    @staticmethod
    def _retention_category(path: str) -> str:
        """Return 'security' for auth/session paths, 'standard' otherwise."""
        for prefix in AuditMiddleware.SECURITY_PREFIXES:
            if path.startswith(prefix):
                return "security"
        return "standard"
