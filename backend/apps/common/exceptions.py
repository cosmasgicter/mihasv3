"""Custom exception handler mapping DRF exceptions to the envelope error format.

Maps:
  - ValidationError → 400 + VALIDATION_ERROR
  - AuthenticationFailed → 401 + AUTHENTICATION_REQUIRED
  - PermissionDenied → 403 + INSUFFICIENT_PERMISSIONS
  - NotFound → 404 + NOT_FOUND
  - MethodNotAllowed → 405 + METHOD_NOT_ALLOWED
  - Throttled → 429 + RATE_LIMITED (with Retry-After)

Payment-scope throttles (views whose ``throttle_scope`` starts with
``payment_``) additionally populate ``details = {retry_after, scope}``,
use the stable catalogue message from ``PAYMENT_ERROR_CODES['RATE_LIMITED']``,
emit a ``payment.rate_limited`` audit event, and increment the
``payment.rate_limited`` counter. All of that extra machinery is lazy-
imported inside the handler to avoid import cycles at module load time.

Includes request_id in all error responses when available.
On 500 responses, forwards the exception to GlitchTip via sentry_sdk.

Implements task 6.2, 3.2, 44.3.
Requirements: 10.4, 3.2, 3.3, 3.11, R15.2, R19.1, R19.3
"""

import logging

import sentry_sdk
from rest_framework.exceptions import (
    AuthenticationFailed,
    NotAuthenticated,
    Throttled,
)
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def _emit_payment_rate_limit_telemetry(request, view, scope):
    """Emit payment.rate_limited audit + counter. Never raises."""
    endpoint = getattr(request, "path", "") or ""
    user = getattr(request, "user", None) if request is not None else None
    is_authenticated = bool(getattr(user, "is_authenticated", False))
    user_role = (
        str(getattr(user, "role", "") or "").strip() or "student"
        if is_authenticated
        else "anonymous"
    )

    # Audit — lazy import to avoid cycles.
    try:
        from apps.documents.payment_audit_service import PaymentAuditService

        PaymentAuditService.record_payment_event(
            action="payment.rate_limited",
            payment_id=None,
            actor_id=getattr(user, "id", None) if is_authenticated else None,
            actor_role=user_role if is_authenticated else None,
            metadata={
                "scope": scope,
                "endpoint": endpoint,
                "user_role": user_role,
            },
            request=request,
        )
    except Exception:
        logger.warning(
            "payment.rate_limited audit write failed", exc_info=True
        )

    # Counter — lazy import to avoid cycles.
    try:
        from apps.documents import payment_metrics

        # ``payment.rate_limited`` accepts ``endpoint`` + ``user_role``
        # labels — both of which are validated against the allow-list
        # in ``payment_metrics.ALLOWED_LABEL_VALUES``.
        payment_metrics.increment(
            "payment.rate_limited",
            tags={"endpoint": scope.replace("payment_", ""), "user_role": user_role},
        )
    except Exception:
        logger.warning(
            "payment.rate_limited counter emission failed", exc_info=True
        )


def envelope_exception_handler(exc, context):
    """Map DRF exceptions to the envelope error format."""
    response = exception_handler(exc, context)

    request = context.get("request") if context else None
    request_id = getattr(request, "request_id", None) if request else None

    # DRF's exception_handler returns None for non-DRF exceptions (e.g.,
    # ProgrammingError, OperationalError, ValueError).  Catch those here
    # so the client always receives a structured JSON envelope instead of
    # Django's default HTML 500 page.
    if response is None:
        from rest_framework.response import Response

        logger.exception("Unhandled exception in DRF view")

        try:
            sentry_sdk.capture_exception(exc)
        except Exception:
            logger.exception("Failed to report exception to GlitchTip")

        envelope = {
            "success": False,
            "error": "An unexpected error occurred. Please try again later.",
            "code": "INTERNAL_ERROR",
        }
        if request_id:
            envelope["request_id"] = request_id

        return Response(envelope, status=500)

    error_code_map = {
        400: "VALIDATION_ERROR",
        401: "AUTHENTICATION_REQUIRED",
        403: "INSUFFICIENT_PERMISSIONS",
        404: "NOT_FOUND",
        405: "METHOD_NOT_ALLOWED",
        429: "RATE_LIMITED",
    }

    # Force 401 for auth exceptions regardless of DRF's default status code.
    # This ensures AuthenticationFailed (which DRF may map to 403 when
    # authenticate_header is missing) always produces 401.
    if isinstance(exc, (AuthenticationFailed, NotAuthenticated)):
        response.status_code = 401
        if hasattr(exc, "get_codes"):
            code_val = exc.get_codes()
            code = code_val.upper() if isinstance(code_val, str) and code_val else "AUTHENTICATION_REQUIRED"
        elif isinstance(exc, NotAuthenticated):
            code = "AUTHENTICATION_REQUIRED"
        else:
            code = "AUTHENTICATION_REQUIRED"
    else:
        code = error_code_map.get(response.status_code, "INTERNAL_ERROR")
        if response.status_code == 403 and hasattr(exc, "get_codes"):
            code_val = exc.get_codes()
            if isinstance(code_val, str) and code_val and code_val.upper().startswith("CSRF_"):
                code = code_val.upper()

    # Handle validation errors with field details
    if response.status_code == 400 and isinstance(response.data, dict):
        error_msg = "Validation failed"
        details = response.data
    else:
        error_msg = (
            str(response.data.get("detail", "An error occurred"))
            if isinstance(response.data, dict)
            else str(response.data)
        )
        details = None

    envelope = {"success": False, "error": error_msg, "code": code}
    if details and response.status_code == 400:
        envelope["details"] = details

    # -----------------------------------------------------------------
    # Payment-scope throttle enrichment (Task 44.3, R19.1, R19.3)
    # -----------------------------------------------------------------
    if isinstance(exc, Throttled):
        view = context.get("view") if context else None
        scope = getattr(view, "throttle_scope", None) if view else None
        if isinstance(scope, str) and scope.startswith("payment_"):
            # Stable-code message from the catalogue (R15.2).
            try:
                from apps.documents.payment_error_codes import PAYMENT_ERROR_CODES

                envelope["error"] = PAYMENT_ERROR_CODES["RATE_LIMITED"].message
            except Exception:
                # Catalogue unavailable — fall back to the generic message.
                logger.warning(
                    "payment_error_codes import failed during 429 handling",
                    exc_info=True,
                )

            retry_after = 0
            try:
                wait = getattr(exc, "wait", None)
                retry_after = int(wait) if wait is not None else 0
            except Exception:
                retry_after = 0

            envelope["details"] = {
                "retry_after": retry_after,
                "scope": scope,
            }

            _emit_payment_rate_limit_telemetry(request, view, scope)

    if request_id:
        envelope["request_id"] = request_id

    # Forward 500 errors to GlitchTip.
    if response.status_code >= 500:
        try:
            sentry_sdk.capture_exception(exc)
        except Exception:
            logger.exception("Failed to report exception to GlitchTip")

    response.data = envelope
    return response
