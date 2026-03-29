"""Custom exception handler mapping DRF exceptions to the envelope error format.

Maps:
  - ValidationError → 400 + VALIDATION_ERROR
  - AuthenticationFailed → 401 + AUTHENTICATION_REQUIRED
  - PermissionDenied → 403 + INSUFFICIENT_PERMISSIONS
  - NotFound → 404 + NOT_FOUND
  - MethodNotAllowed → 405 + METHOD_NOT_ALLOWED
  - Throttled → 429 + RATE_LIMITED (with Retry-After)

Includes request_id in all error responses when available.

Implements task 6.2.
Requirements: 10.4
"""

from rest_framework.views import exception_handler


def envelope_exception_handler(exc, context):
    """Map DRF exceptions to the envelope error format."""
    response = exception_handler(exc, context)
    if response is None:
        return response

    request = context.get("request")
    request_id = getattr(request, "request_id", None) if request else None

    error_code_map = {
        400: "VALIDATION_ERROR",
        401: "AUTHENTICATION_REQUIRED",
        403: "INSUFFICIENT_PERMISSIONS",
        404: "NOT_FOUND",
        405: "METHOD_NOT_ALLOWED",
        429: "RATE_LIMITED",
    }

    code = error_code_map.get(response.status_code, "INTERNAL_ERROR")

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

    # Retry-After header is already set by DRF throttling for 429 responses

    response.data = envelope
    return response
