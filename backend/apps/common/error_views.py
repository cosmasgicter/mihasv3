"""Error report endpoint for frontend error monitoring.

Accepts error payloads from the frontend and forwards them to GlitchTip
via sentry_sdk.capture_message(). Kept for backwards compatibility during
the transition from self-hosted ErrorLog to GlitchTip.

Implements task 3.3 (cto-assessment-remediation).
Requirements: 3.4, 3.5, 3.6, 3.11
"""

import hashlib
import logging

import sentry_sdk
from apps.common.request_utils import get_client_ip
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


def _get_client_ip(request) -> str:
    """Extract client IP, respecting X-Forwarded-For behind a proxy."""
    return get_client_ip(request)


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

    @extend_schema(
        request=OpenApiTypes.OBJECT,
        responses={200: OpenApiTypes.OBJECT},
        tags=["errors"],
        summary="Report a frontend error",
    )
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

        # Hash client IP with SHA-256 - never store raw IP.
        raw_ip = _get_client_ip(request)
        ip_hash = hashlib.sha256(raw_ip.encode("utf-8")).hexdigest()

        for report in reports:
            message = str(report["message"])[:2000]
            try:
                sentry_sdk.capture_message(
                    message,
                    level="error",
                    extras={
                        "source": "frontend",
                        "stack_trace": report.get("stack_trace"),
                        "url": report.get("url"),
                        "ip_hash": ip_hash,
                        "context": report.get("context"),
                    },
                )
            except Exception:
                logger.exception("Failed to forward frontend error report to GlitchTip")

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
