"""Read-only mode middleware.

Implements task 21.2.
Requirements: 14.5

Checks a setting/env var `READ_ONLY_MODE`. If True, blocks
POST/PUT/PATCH/DELETE with 503. GET continues normally.
"""

import os

from django.http import JsonResponse


class ReadOnlyMiddleware:
    """Block all write requests when READ_ONLY_MODE is enabled.

    Checks (in order):
    1. Environment variable READ_ONLY_MODE
    2. Database Setting with key='READ_ONLY_MODE' (lazy, cached per request)

    If enabled, returns 503 Service Unavailable for POST/PUT/PATCH/DELETE.
    GET/HEAD/OPTIONS pass through normally.
    """

    WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method in self.WRITE_METHODS and self._is_read_only():
            return JsonResponse(
                {
                    "success": False,
                    "error": "System is in read-only mode. Write operations are temporarily disabled.",
                    "code": "READ_ONLY_MODE",
                },
                status=503,
            )
        return self.get_response(request)

    @staticmethod
    def _is_read_only() -> bool:
        """Check if read-only mode is enabled via env var or DB setting."""
        env_val = os.environ.get("READ_ONLY_MODE", "").lower()
        if env_val in ("1", "true", "yes"):
            return True

        # Fallback: check database setting (wrapped in try/except for resilience)
        try:
            from apps.common.models import Setting

            setting = Setting.objects.filter(key="READ_ONLY_MODE").first()
            if setting:
                val = setting.value
                if isinstance(val, bool):
                    return val
                if isinstance(val, str) and val.lower() in ("1", "true", "yes"):
                    return True
        except Exception:
            pass

        return False
