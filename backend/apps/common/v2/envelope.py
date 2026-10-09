"""Canonical V2 envelope builders.

Every V2 response is wrapped in exactly one shape. These builders produce that
shape. Views and the renderer call them; nothing else constructs a V2 envelope.

Design: ``design.md`` §14.1
Requirement: R14.1 (stable code + human-safe message + request ID)
Finding: API-01 (no more dual string/object error variants)
"""

from __future__ import annotations

from typing import Any

API_VERSION = "v2"


def _meta(request_id: str | None) -> dict[str, Any]:
    """Build the standard ``meta`` block."""
    return {
        "request_id": request_id or None,
        "api_version": API_VERSION,
    }


def build_success(
    data: Any,
    *,
    request_id: str | None = None,
) -> dict[str, Any]:
    """Build a V2 success envelope.

    Shape::

        {
          "success": true,
          "data": <payload>,
          "meta": {"request_id": "uuid", "api_version": "v2"}
        }
    """
    return {
        "success": True,
        "data": data,
        "meta": _meta(request_id),
    }


def build_error(
    *,
    code: str,
    message: str,
    fields: dict[str, list[str]] | None = None,
    retryable: bool = False,
    request_id: str | None = None,
) -> dict[str, Any]:
    """Build a V2 error envelope.

    Shape::

        {
          "success": false,
          "error": {
            "code": "STABLE_CODE",
            "message": "User-safe message.",
            "fields": {"field_name": ["error1", "error2"]},
            "retryable": false
          },
          "meta": {"request_id": "uuid", "api_version": "v2"}
        }
    """
    error_body: dict[str, Any] = {
        "code": code,
        "message": message,
        "fields": fields or {},
        "retryable": retryable,
    }
    return {
        "success": False,
        "error": error_body,
        "meta": _meta(request_id),
    }
