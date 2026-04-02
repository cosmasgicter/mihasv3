"""Error report endpoint for frontend error monitoring.

Accepts error payloads from the frontend, stores them in the ErrorLog table,
and dispatches throttled alert emails for error-level reports.

Implements task 3.3 (cto-assessment-remediation).
Requirements: 3.4, 3.5, 3.6, 3.11
"""

import hashlib
import logging

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


def _get_client_ip(request) -> str:
    """Extract client IP, respecting X-Forwarded-For behind a proxy."""
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


class ErrorReportView(APIView):
    """POST /api/v1/errors/report/

    Accept frontend error reports. No authentication required.
    Rate-limited to 10 requests per IP per 5 minutes via RateLimitMiddleware.
    CSRF-exempt via CSRFEnforcementMiddleware.EXEMPT_PATTERNS.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        data = request.data

        message = data.get("message")
        if not message:
            return Response(
                {
                    "success": False,
                    "error": "Field 'message' is required",
                    "code": "VALIDATION_ERROR",
                },
                status=400,
            )

        # Hash client IP with SHA-256 — never store raw IP.
        raw_ip = _get_client_ip(request)
        ip_hash = hashlib.sha256(raw_ip.encode("utf-8")).hexdigest()

        try:
            from apps.common.models import ErrorLog

            ErrorLog.objects.create(
                source="frontend",
                level="error",
                message=str(message)[:2000],
                stack_trace=data.get("stack_trace"),
                context=data.get("context"),
                request_path=data.get("url"),
                ip_hash=ip_hash,
            )
        except Exception:
            logger.exception("Failed to create ErrorLog for frontend error report")

        # Dispatch throttled alert email (reuse the same logic as exceptions.py).
        try:
            self._dispatch_throttled_alert(str(message)[:2000])
        except Exception:
            # Alert dispatch must never break the response.
            logger.exception("Failed to dispatch alert for frontend error report")

        return Response({"success": True, "data": {"message": "Error report received"}})

    @staticmethod
    def _dispatch_throttled_alert(error_msg: str):
        """Send a throttled alert email for a frontend error report."""
        from django.conf import settings
        from django.core.cache import cache

        from apps.common.models import EmailQueue
        from apps.common.tasks import send_email_task

        msg_hash = hashlib.sha256(error_msg.encode("utf-8")).hexdigest()[:16]
        cache_key = f"error_alert:{msg_hash}"

        should_alert = True
        try:
            should_alert = cache.add(cache_key, 1, 900)  # 15-min TTL
        except Exception:
            logger.warning("Redis unavailable for error alert throttle check, dispatching alert")

        if should_alert:
            alert_email = settings.ERROR_ALERT_EMAIL
            email_record = EmailQueue.objects.create(
                recipient_email=alert_email,
                subject=f"[ALERT] Frontend error: {error_msg[:100]}",
                body=(
                    f"<p>A frontend error was reported:</p>"
                    f"<pre>{error_msg[:2000]}</pre>"
                ),
                status="pending",
            )
            send_email_task.delay(str(email_record.id))
