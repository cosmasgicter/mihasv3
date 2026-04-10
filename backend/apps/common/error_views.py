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
from rest_framework.throttling import ScopedRateThrottle
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
    Rate-limited to 5 requests per minute via DRF ScopedRateThrottle.
    CSRF-exempt via CSRFEnforcementMiddleware.EXEMPT_PATTERNS.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'error_report'

    def post(self, request):
        # Reject payloads larger than 16 KB before any processing.
        if len(request.body) > 16_384:
            return Response(
                {
                    "success": False,
                    "error": "Payload too large",
                    "code": "PAYLOAD_TOO_LARGE",
                },
                status=413,
            )

        try:
            reports = self._extract_reports(request.data)
        except ValueError as exc:
            return Response(
                {
                    "success": False,
                    "error": str(exc),
                    "code": "VALIDATION_ERROR",
                },
                status=400,
            )

        # Cap batch to first 10 items.
        reports = reports[:10]

        # Hash client IP with SHA-256 — never store raw IP.
        raw_ip = _get_client_ip(request)
        ip_hash = hashlib.sha256(raw_ip.encode("utf-8")).hexdigest()

        for report in reports:
            message = str(report["message"])[:2000]
            try:
                from apps.common.models import ErrorLog

                ErrorLog.objects.create(
                    source="frontend",
                    level="error",
                    message=message,
                    stack_trace=report.get("stack_trace"),
                    context=report.get("context"),
                    request_path=report.get("url"),
                    ip_hash=ip_hash,
                )
            except Exception:
                logger.exception("Failed to create ErrorLog for frontend error report")

            # Dispatch throttled alert email (reuse the same logic as exceptions.py).
            try:
                self._dispatch_throttled_alert(message)
            except Exception:
                # Alert dispatch must never break the response.
                logger.exception("Failed to dispatch alert for frontend error report")

        return Response(
            {
                "success": True,
                "data": {
                    "message": "Error report received",
                    "received": len(reports),
                },
            }
        )

    @staticmethod
    def _extract_reports(data):
        if isinstance(data, dict) and isinstance(data.get("errors"), list):
            reports = data["errors"]
            if not reports:
                raise ValueError("Field 'errors' must be a non-empty list")

            normalized_reports = []
            for report in reports:
                if not isinstance(report, dict):
                    raise ValueError("Each item in 'errors' must be an object")
                if not report.get("message"):
                    raise ValueError("Each error payload must include a non-empty 'message'")
                normalized_reports.append(report)
            return normalized_reports

        message = data.get("message") if hasattr(data, "get") else None
        if not message:
            raise ValueError("Field 'message' is required")
        return [data]

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
