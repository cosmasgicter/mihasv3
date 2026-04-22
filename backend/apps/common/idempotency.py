"""Idempotent request processing via decorator.

Apply @idempotent to individual DRF views that need replay protection.
Uses command identity: (idempotency_key, actor, method, path, body hash).
Same key + same body → cached response.  Same key + different body → 409.
"""

import hashlib
import json
import logging
from functools import wraps

from django.db import IntegrityError
from django.http import JsonResponse
from django.utils import timezone
from rest_framework.response import Response as DRFResponse

from apps.common.models import IdempotencyKey

logger = logging.getLogger(__name__)


def _body_hash(request) -> str:
    body = request.body or b""
    return hashlib.sha256(body).hexdigest()


def _serialize_response_body(response) -> dict | list | None:
    """Extract a replay-safe JSON-ish body from a Django/DRF response."""
    if isinstance(response, DRFResponse):
        return response.data

    if hasattr(response, "content"):
        try:
            return json.loads(response.content.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None

    return None


def idempotent(view_func):
    """Decorator for DRF views. Expects Idempotency-Key header."""

    @wraps(view_func)
    def wrapper(self, request, *args, **kwargs):
        key = request.META.get("HTTP_IDEMPOTENCY_KEY")
        if not key:
            return view_func(self, request, *args, **kwargs)

        actor_id = getattr(request.user, "id", None)
        if not actor_id:
            return view_func(self, request, *args, **kwargs)

        method = request.method
        path = request.path
        req_hash = _body_hash(request)

        existing = (
            IdempotencyKey.objects.filter(
                idempotency_key=key, actor_id=actor_id, method=method, path=path
            )
            .first()
        )

        record = None
        if existing:
            if existing.request_hash != req_hash:
                return JsonResponse(
                    {"success": False, "error": "Idempotency key reused with different payload", "code": "IDEMPOTENCY_CONFLICT"},
                    status=409,
                )
            if existing.status == IdempotencyKey.COMPLETED:
                cached_body = existing.response_body
                if cached_body is None:
                    cached_body = {}
                return JsonResponse(
                    cached_body,
                    status=existing.response_status,
                    safe=isinstance(cached_body, dict),
                )
            if existing.status == IdempotencyKey.PENDING:
                return JsonResponse(
                    {"success": False, "error": "Request already in progress", "code": "IDEMPOTENCY_PENDING"},
                    status=409,
                )
            if existing.status == IdempotencyKey.FAILED:
                record = existing

        if record is None:
            # Create pending record
            try:
                record = IdempotencyKey.objects.create(
                    idempotency_key=key,
                    actor_id=actor_id,
                    method=method,
                    path=path,
                    request_hash=req_hash,
                    status=IdempotencyKey.PENDING,
                )
            except IntegrityError:
                # Lost race — another request created it first
                return JsonResponse(
                    {"success": False, "error": "Request already in progress", "code": "IDEMPOTENCY_PENDING"},
                    status=409,
                )
        else:
            record.status = IdempotencyKey.PENDING
            record.response_status = None
            record.response_body = None
            record.completed_at = None
            record.save(
                update_fields=["status", "response_status", "response_body", "completed_at"]
            )

        # Execute the real view
        try:
            response = view_func(self, request, *args, **kwargs)
        except Exception:
            record.status = IdempotencyKey.FAILED
            record.completed_at = timezone.now()
            record.save(update_fields=["status", "completed_at"])
            raise

        # Cache only successful command results. Validation or permission
        # failures should not poison the idempotency key for future retries.
        if not (200 <= response.status_code < 300):
            record.status = IdempotencyKey.FAILED
            record.completed_at = timezone.now()
            record.save(update_fields=["status", "completed_at"])
            return response

        record.status = IdempotencyKey.COMPLETED
        record.response_status = response.status_code
        record.response_body = _serialize_response_body(response)
        record.completed_at = timezone.now()
        record.save(update_fields=["status", "response_status", "response_body", "completed_at"])

        return response

    return wrapper
