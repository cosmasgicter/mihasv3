"""Idempotent request processing middleware.

Implements task 21.1.
Requirements: 17.4

Checks the `Idempotency-Key` header on POST/PUT/PATCH requests.
If the key exists in the `idempotency_keys` table, returns the cached response.
On first execution, stores the response for future replay.
"""

import json
import logging

from django.http import JsonResponse

from apps.common.models import IdempotencyKey

logger = logging.getLogger(__name__)

# Methods that support idempotency
IDEMPOTENT_METHODS = {"POST", "PUT", "PATCH"}


class IdempotencyMiddleware:
    """Middleware that checks Idempotency-Key header for request deduplication.

    - On POST/PUT/PATCH with an Idempotency-Key header:
      1. Look up the key in idempotency_keys table.
      2. If found, return the cached response immediately.
      3. If not found, process the request, then store the response.
    - GET/DELETE and requests without the header pass through unchanged.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method not in IDEMPOTENT_METHODS:
            return self.get_response(request)

        idempotency_key = request.META.get("HTTP_IDEMPOTENCY_KEY")
        if not idempotency_key:
            return self.get_response(request)

        endpoint = request.path

        # Check for existing cached response
        try:
            existing = IdempotencyKey.objects.filter(key=idempotency_key).first()
            if existing:
                cached = existing.response_json
                return JsonResponse(
                    cached.get("body", {}),
                    status=cached.get("status_code", 200),
                )
        except Exception:
            logger.exception("Error checking idempotency key %s", idempotency_key)

        # Process the request
        response = self.get_response(request)

        # Store the response for future replay (only for successful responses)
        if 200 <= response.status_code < 500:
            try:
                # Extract response body
                if hasattr(response, "content"):
                    body = json.loads(response.content.decode("utf-8"))
                else:
                    body = {}

                IdempotencyKey.objects.create(
                    key=idempotency_key,
                    endpoint=endpoint,
                    response_json={
                        "status_code": response.status_code,
                        "body": body,
                    },
                )
            except Exception:
                logger.exception("Error storing idempotency key %s", idempotency_key)

        return response
