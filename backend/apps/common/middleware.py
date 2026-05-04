"""Middleware chain for the MIHAS Django API.

Implements security headers, request ID propagation, rate limiting,
audit logging, and request metrics.

Note: CSRFEnforcementMiddleware and JWTAuthenticationMiddleware have been
moved to ``middleware_compat.py`` — they are no longer in the MIDDLEWARE
stack but are preserved for backward-compatible tests.
"""

import logging
import re
import time
import uuid

from django.conf import settings
from django.http import JsonResponse

from apps.common.audit_network import build_audit_network_fields
from apps.common.logging import bind_request_context, clear_request_context

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 7.1 — SecurityHeadersMiddleware
# ---------------------------------------------------------------------------


class SecurityHeadersMiddleware:
    """Set security headers on every response.

    Headers: HSTS, X-Content-Type-Options, X-Frame-Options,
    Referrer-Policy, Permissions-Policy, X-XSS-Protection,
    Content-Security-Policy.
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
        response["X-XSS-Protection"] = "0"
        response["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://pay.lenco.co https://pay.sandbox.lenco.co; "
            "worker-src 'self' blob:; "
            "child-src 'self' blob:; "
            "style-src 'self' 'unsafe-inline'; "
            "style-src-elem 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob: https:; "
            "connect-src 'self' ***REMOVED*** https://api.lenco.co https://api.sandbox.lenco.co https://cdn.jsdelivr.net; "
            "frame-src 'self' https://pay.lenco.co https://pay.sandbox.lenco.co; "
            "font-src 'self'; "
            "object-src 'none'; "
            "base-uri 'self'"
        )
        if self._is_authenticated_api_request(request):
            response["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
            response["Pragma"] = "no-cache"
            response["Expires"] = "0"
        return response

    @staticmethod
    def _is_authenticated_api_request(request) -> bool:
        """Detect authenticated API traffic before or after DRF auth runs."""
        user = getattr(request, "user", None)
        if bool(user and getattr(user, "is_authenticated", False)):
            return True

        if not getattr(request, "path", "").startswith("/api/v1/"):
            return False

        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if auth_header.lower().startswith("bearer "):
            return True

        return bool(
            request.COOKIES.get("access_token")
            or request.COOKIES.get("refresh_token")
        )


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
        bind_request_context(request_id=request_id, method=request.method, path=request.path)
        try:
            response = self.get_response(request)
        finally:
            clear_request_context()
        response["X-Request-ID"] = request_id
        response["X-Backend-Version"] = getattr(settings, "APP_VERSION", "dev")
        return response


# ---------------------------------------------------------------------------
# 7.2b — MetricsMiddleware
# ---------------------------------------------------------------------------


class MetricsMiddleware:
    """Emit structured request-level metrics for log aggregation.

    Skips health-check endpoints to avoid log noise. Wraps metric
    emission in try/except so it never blocks responses.
    """

    SKIP_PATHS = {"/health/live/", "/health/ready/", "/health/redis/"}

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path in self.SKIP_PATHS:
            return self.get_response(request)

        start = time.monotonic()
        response = self.get_response(request)

        try:
            duration_ms = round((time.monotonic() - start) * 1000, 1)
            logger.info(
                "request_metric",
                extra={
                    "type": "request_metric",
                    "method": request.method,
                    "path": request.path,
                    "status_code": response.status_code,
                    "duration_ms": duration_ms,
                    "request_id": getattr(request, "request_id", None),
                },
            )
        except Exception:
            pass  # Metrics are best-effort — never block the response

        return response


# ---------------------------------------------------------------------------
# 7.3 — RateLimitMiddleware
# ---------------------------------------------------------------------------


class RateLimitMiddleware:
    """Per-scope rate limiting using django-ratelimit.

    Scopes and limits (ordered most-specific first):
      /api/v1/auth/login/          → 10/5m
      /api/v1/auth/register/       → 5/5m
      /api/v1/auth/password-reset/ → 5/5m
      /api/v1/auth/                → 60/5m
      /api/v1/admin/               → 60/10m
      /api/v1/documents/           → 20/10m
      /api/v1/applications/track/  → 20/10m
      /api/v1/sessions/            → 30/10m
      /api/v1/notifications/       → 50/10m
      /api/v1/errors/              → 10/5m
      /api/v1/outreach/            → 30/10m
      /api/v1/email/               → 30/10m
      /api/v1/integrations/        → 20/10m
      /api/v1/payments/            → 60/10m
      /api/v1/                     → 120/10m  (catch-all)
    """

    # (prefix, rate string | None)
    # Order matters: more specific paths MUST come before less specific ones
    # because matching uses startswith() and the first match wins.
    # A rate of None means the path is exempt from rate limiting entirely
    # (no Redis counter increment).
    SCOPE_LIMITS = [
        # Stricter auth sub-scopes (before general /api/v1/auth/)
        ("/api/v1/auth/login/", "10/5m"),
        ("/api/v1/auth/register/", "5/5m"),
        ("/api/v1/auth/password-reset/", "5/5m"),
        # General auth scope
        ("/api/v1/auth/", "60/5m"),
        # Existing scopes
        ("/api/v1/admin/", "60/10m"),
        ("/api/v1/documents/", "20/10m"),
        ("/api/v1/applications/track/", "20/10m"),
        ("/api/v1/sessions/", "30/10m"),
        ("/api/v1/notifications/", "50/10m"),
        ("/api/v1/errors/", "10/5m"),
        # High-risk endpoint scopes
        ("/api/v1/outreach/", "30/10m"),
        ("/api/v1/email/", "30/10m"),
        ("/api/v1/integrations/", "20/10m"),
        ("/api/v1/payments/initiate/", "10/10m"),
        ("/api/v1/payments/mobile-money/", "5/10m"),
        ("/api/v1/payments/defer/", "10/10m"),
        ("/api/v1/payments/resolve-fee/", "30/10m"),
        ("/api/v1/payments/webhook/", "30/10m"),
        ("/api/v1/payments/", "60/10m"),
        # Catch-all (must be last)
        ("/api/v1/", "120/10m"),
    ]

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        from django_ratelimit.core import is_ratelimited

        for prefix, rate in self.SCOPE_LIMITS:
            if request.path.startswith(prefix):
                # A None rate means this path is exempt from rate limiting.
                if rate is None:
                    break
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

        entity_type = self._extract_entity_type(request.path)
        retention = self._retention_category(request.path)
        network_fields = build_audit_network_fields(request)

        AuditLog.objects.create(
            actor_id=actor_id,
            action=request.method,
            entity_type=entity_type,
            ip_address=network_fields["ip_address"],
            user_agent=network_fields["user_agent"],
            ip_address_encrypted=network_fields["ip_address_encrypted"],
            user_agent_encrypted=network_fields["user_agent_encrypted"],
            retention_category=retention,
        )

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
