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

    The env var ``READ_ONLY_MODE`` is checked once at init time.
    When the env var is not set (the common case), the middleware is a
    no-op - no database query, no per-request overhead.

    When the env var *is* set to a truthy value, write requests
    (POST/PUT/PATCH/DELETE) are rejected with 503 Service Unavailable.
    """

    WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

    def __init__(self, get_response):
        self.get_response = get_response
        # Cache the env var check at init time so we never hit the DB
        # when read-only mode is not enabled.
        self.is_read_only = os.environ.get("READ_ONLY_MODE", "").lower() in (
            "true",
            "1",
            "yes",
        )

    def __call__(self, request):
        if not self.is_read_only:
            return self.get_response(request)  # Fast path: no DB query

        if request.method in self.WRITE_METHODS:
            return JsonResponse(
                {
                    "success": False,
                    "error": "System is in read-only mode. Write operations are temporarily disabled.",
                    "code": "READ_ONLY_MODE",
                },
                status=503,
            )
        return self.get_response(request)
