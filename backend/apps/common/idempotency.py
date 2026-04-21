"""Idempotent request processing via decorator.

Apply @idempotent to individual DRF views that need replay protection.
Uses command identity: (idempotency_key, actor, method, path, body hash).
Same key + same body → cached response.  Same key + different body → 409.
"""

import hashlib
import json
import logging
from functools import wraps

from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.utils import timezone

from apps.common.models import IdempotencyKey

logger = logging.getLogger(__name__)


def _body_hash(request) -> str:
    body = request.body or b""
    return hashlib.sha256(body).hexdigest()


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

        if existing:
            if existing.request_hash != req_hash:
                return JsonResponse(
                    {"success": False, "error": "Idempotency key reused with different payload", "code": "IDEMPOTENCY_CONFLICT"},
                    status=409,
                )
            if existing.status == IdempotencyKey.COMPLETED:
                return JsonResponse(existing.response_body, status=existing.response_status)
            if existing.status == IdempotencyKey.PENDING:
                return JsonResponse(
                    {"success": False, "error": "Request already in progress", "code": "IDEMPOTENCY_PENDING"},
                    status=409,
                )

        # Create pending record
        try:
            with transaction.atomic():
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

        # Execute the real view
        try:
            response = view_func(self, request, *args, **kwargs)
        except Exception:
            record.status = IdempotencyKey.FAILED
            record.completed_at = timezone.now()
            record.save(update_fields=["status", "completed_at"])
            raise

        # Store completed response
        try:
            body = json.loads(response.content.decode("utf-8")) if hasattr(response, "content") else {}
        except (json.JSONDecodeError, UnicodeDecodeError):
            body = {}

        record.status = IdempotencyKey.COMPLETED
        record.response_status = response.status_code
        record.response_body = body
        record.completed_at = timezone.now()
        record.save(update_fields=["status", "response_status", "response_body", "completed_at"])

        return response

    return wrapper
