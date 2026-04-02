"""Custom exception handler mapping DRF exceptions to the envelope error format.

Maps:
  - ValidationError → 400 + VALIDATION_ERROR
  - AuthenticationFailed → 401 + AUTHENTICATION_REQUIRED
  - PermissionDenied → 403 + INSUFFICIENT_PERMISSIONS
  - NotFound → 404 + NOT_FOUND
  - MethodNotAllowed → 405 + METHOD_NOT_ALLOWED
  - Throttled → 429 + RATE_LIMITED (with Retry-After)

Includes request_id in all error responses when available.
On 500 responses, creates an ErrorLog record and dispatches a throttled alert email.

Implements task 6.2, 3.2.
Requirements: 10.4, 3.2, 3.3, 3.11
"""

import hashlib
import logging

from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)

_ALERT_THROTTLE_TTL = 900  # 15 minutes in seconds


def _log_error_and_alert(error_msg, request):
    """Create an ErrorLog record for a 500 error and dispatch a throttled alert.

    Wrapped in its own function so the caller can catch all exceptions —
    error logging must never break the original error response.
    """
    from django.conf import settings
    from django.core.cache import cache

    from apps.common.models import ErrorLog
    from apps.common.tasks import send_email_task

    request_path = request.get_full_path() if request else None
    user_id = None
    if request and hasattr(request, "user") and getattr(request.user, "is_authenticated", False):
        user_id = getattr(request.user, "id", None)

    ErrorLog.objects.create(
        source="backend",
        level="error",
        message=error_msg[:2000],
        request_path=request_path,
        user_id=user_id,
    )

    # Throttled alert email — one per unique message per 15 minutes.
    msg_hash = hashlib.sha256(error_msg.encode("utf-8")).hexdigest()[:16]
    cache_key = f"error_alert:{msg_hash}"

    should_alert = True
    try:
        # cache.add returns True only if the key did NOT already exist.
        should_alert = cache.add(cache_key, 1, _ALERT_THROTTLE_TTL)
    except Exception:
        # Redis unavailable — fail-open, dispatch alert anyway.
        logger.warning("Redis unavailable for error alert throttle check, dispatching alert")

    if should_alert:
        alert_email = settings.ERROR_ALERT_EMAIL
        from apps.common.models import EmailQueue

        email_record = EmailQueue.objects.create(
            recipient_email=alert_email,
            subject=f"[ALERT] Backend error: {error_msg[:100]}",
            body=(
                f"<p>A backend error occurred:</p>"
                f"<pre>{error_msg[:2000]}</pre>"
                f"<p>Path: {request_path or 'N/A'}</p>"
            ),
            status="pending",
        )
        send_email_task.delay(str(email_record.id))


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

    # Log 500 errors and dispatch throttled alert email.
    if response.status_code >= 500:
        try:
            _log_error_and_alert(error_msg, request)
        except Exception:
            logger.exception("Failed to log error or dispatch alert for 500 response")

    response.data = envelope
    return response
