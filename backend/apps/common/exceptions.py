"""Custom exception handler mapping DRF exceptions to the envelope error format.

Maps:
  - ValidationError → 400 + VALIDATION_ERROR
  - AuthenticationFailed → 401 + AUTHENTICATION_REQUIRED
  - PermissionDenied → 403 + INSUFFICIENT_PERMISSIONS
  - NotFound → 404 + NOT_FOUND
  - MethodNotAllowed → 405 + METHOD_NOT_ALLOWED
  - Throttled → 429 + RATE_LIMITED (with Retry-After)

Includes request_id in all error responses when available.
On 500 responses, forwards the exception to GlitchTip via sentry_sdk.

Implements task 6.2, 3.2.
Requirements: 10.4, 3.2, 3.3, 3.11
"""

import logging

import sentry_sdk
from rest_framework.views import exception_handler
from rest_framework.exceptions import AuthenticationFailed, NotAuthenticated

logger = logging.getLogger(__name__)


def envelope_exception_handler(exc, context):
    """Map DRF exceptions to the envelope error format."""
    response = exception_handler(exc, context)

    request = context.get("request")
    request_id = getattr(request, "request_id", None) if request else None

    # DRF's exception_handler returns None for non-DRF exceptions (e.g.,
    # ProgrammingError, OperationalError, ValueError).  Catch those here
    # so the client always receives a structured JSON envelope instead of
    # Django's default HTML 500 page.
    if response is None:
        from rest_framework.response import Response

        error_msg = f"{exc.__class__.__name__}: {exc}"
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

    code = error_code_map.get(response.status_code, "INTERNAL_ERROR")
    if isinstance(exc, (AuthenticationFailed, NotAuthenticated)):
        exc_code = exc.get_codes() if hasattr(exc, "get_codes") else None
        if isinstance(exc_code, str) and exc_code:
            code = exc_code.upper()

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
