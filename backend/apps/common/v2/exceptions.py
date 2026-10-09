"""V2 exception handler and domain error exceptions.

The handler maps DRF exceptions and domain errors to the canonical V2 error
envelope. It never produces the V1 flat ``"error": "<string>"`` shape.

Design: ``design.md`` §14.1
Requirement: R14.1 (every JSON response uses the registered error envelope)
Finding: API-01
"""

from __future__ import annotations

import logging
from typing import Any

from rest_framework import status
from rest_framework.exceptions import (
    APIException,
    AuthenticationFailed,
    NotAuthenticated,
    Throttled,
    ValidationError,
)
from rest_framework.views import exception_handler

from apps.common.v2.envelope import build_error
from apps.common.v2.error_codes import V2_ERROR_CODES, get_error_code

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Domain error exceptions — raised by services, caught by the handler.
# ---------------------------------------------------------------------------


class V2DomainError(APIException):
    """Base for domain errors that carry a registered V2 error code.

    Subclass this or raise it directly with a registered code:

        raise V2DomainError("FEE_NOT_CONFIGURED")
        raise V2DomainError("FEE_NOT_CONFIGURED", message="Custom user-safe override.")
    """

    def __init__(
        self,
        code: str,
        message: str | None = None,
        *,
        fields: dict[str, list[str]] | None = None,
        retryable: bool | None = None,
    ):
        entry = get_error_code(code)
        self.error_code = entry.code
        self.error_message = message or entry.message
        self.error_fields = fields
        self.error_retryable = retryable if retryable is not None else entry.retryable
        self.status_code = entry.http_status
        super().__init__(detail=self.error_message, code=self.error_code)


class V2ConflictError(V2DomainError):
    """State conflict (409)."""

    def __init__(self, message: str | None = None, **kwargs: Any):
        super().__init__("CONFLICT", message, **kwargs)


class V2VersionConflictError(V2DomainError):
    """Optimistic-version conflict (409)."""

    def __init__(self, message: str | None = None, **kwargs: Any):
        super().__init__("VERSION_CONFLICT", message, **kwargs)


class V2ProviderUnavailable(V2DomainError):
    """External provider outage (503, retryable)."""

    def __init__(self, message: str | None = None, **kwargs: Any):
        super().__init__("PROVIDER_UNAVAILABLE", message, **kwargs)


class V2ConfigurationUnavailable(V2DomainError):
    """Mandatory configuration missing (503, retryable)."""

    def __init__(self, message: str | None = None, **kwargs: Any):
        super().__init__("CONFIGURATION_UNAVAILABLE", message, **kwargs)


class V2FeeNotConfigured(V2DomainError):
    """Fee not configured for this option (422)."""

    def __init__(self, message: str | None = None, **kwargs: Any):
        super().__init__("FEE_NOT_CONFIGURED", message, **kwargs)


# ---------------------------------------------------------------------------
# V2 exception handler — wired to REST_FRAMEWORK["EXCEPTION_HANDLER"] on V2.
# ---------------------------------------------------------------------------


def _extract_field_errors(data: Any) -> dict[str, list[str]]:
    """Normalize DRF's validation error data to a flat {field: [messages]} map."""
    fields: dict[str, list[str]] = {}
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, list):
                fields[key] = [str(v) for v in value]
            elif isinstance(value, dict):
                # Nested serializer errors — flatten with dot notation.
                for sub_key, sub_val in value.items():
                    flat_key = f"{key}.{sub_key}"
                    if isinstance(sub_val, list):
                        fields[flat_key] = [str(v) for v in sub_val]
                    else:
                        fields[flat_key] = [str(sub_val)]
            else:
                fields[key] = [str(value)]
    elif isinstance(data, list):
        # Non-field errors.
        fields["non_field_errors"] = [str(e) for e in data]
    return fields


def v2_exception_handler(exc: Exception, context: dict[str, Any]) -> Any:
    """Map DRF and domain exceptions to the V2 error envelope.

    Wired as the ``EXCEPTION_HANDLER`` in V2-specific DRF settings or on
    ``V2APIView``. Returns ``rest_framework.response.Response``.
    """
    from rest_framework.response import Response

    request = context.get("request") if context else None
    request_id = getattr(request, "request_id", None) if request else None

    # --- V2DomainError (our own structured exceptions) --------------------
    if isinstance(exc, V2DomainError):
        envelope = build_error(
            code=exc.error_code,
            message=exc.error_message,
            fields=exc.error_fields,
            retryable=exc.error_retryable,
            request_id=request_id,
        )
        return Response(envelope, status=exc.status_code)

    # --- DRF's built-in exception handler (gives us a Response or None) ---
    response = exception_handler(exc, context)

    if response is None:
        # Non-DRF exception (programming error, DB error, etc.)
        logger.exception("Unhandled exception in V2 view")
        try:
            import sentry_sdk

            sentry_sdk.capture_exception(exc)
        except Exception:
            logger.warning("Failed to report exception to GlitchTip", exc_info=True)

        entry = get_error_code("INTERNAL_ERROR")
        envelope = build_error(
            code=entry.code,
            message=entry.message,
            retryable=entry.retryable,
            request_id=request_id,
        )
        return Response(envelope, status=entry.http_status)

    # --- Auth exceptions → 401 regardless of DRF's choice -----------------
    if isinstance(exc, (AuthenticationFailed, NotAuthenticated)):
        response.status_code = status.HTTP_401_UNAUTHORIZED
        code = "AUTHENTICATION_REQUIRED"
        # Preserve specific auth codes like TOKEN_EXPIRED, NO_REFRESH_TOKEN.
        if hasattr(exc, "get_codes"):
            raw_code = exc.get_codes()
            if isinstance(raw_code, str) and raw_code:
                # Only use known registered codes or auth-prefixed ones.
                upper = raw_code.upper()
                if upper in V2_ERROR_CODES:
                    code = upper
                elif upper in ("TOKEN_EXPIRED", "NO_REFRESH_TOKEN"):
                    code = upper

        entry = get_error_code(code) if code in V2_ERROR_CODES else get_error_code("AUTHENTICATION_REQUIRED")
        envelope = build_error(
            code=code,
            message=entry.message if code in V2_ERROR_CODES else str(exc.detail),
            retryable=entry.retryable if code in V2_ERROR_CODES else False,
            request_id=request_id,
        )
        return Response(envelope, status=status.HTTP_401_UNAUTHORIZED)

    # --- ValidationError → 400 with per-field errors -----------------------
    if isinstance(exc, ValidationError):
        fields = _extract_field_errors(response.data)
        entry = get_error_code("VALIDATION_ERROR")
        envelope = build_error(
            code=entry.code,
            message=entry.message,
            fields=fields,
            retryable=entry.retryable,
            request_id=request_id,
        )
        return Response(envelope, status=status.HTTP_400_BAD_REQUEST)

    # --- Throttled → 429 with retryable=True -------------------------------
    if isinstance(exc, Throttled):
        entry = get_error_code("RATE_LIMITED")
        envelope = build_error(
            code=entry.code,
            message=entry.message,
            retryable=True,
            request_id=request_id,
        )
        return Response(envelope, status=status.HTTP_429_TOO_MANY_REQUESTS)

    # --- Generic mapped exceptions -----------------------------------------
    status_to_code = {
        400: "VALIDATION_ERROR",
        401: "AUTHENTICATION_REQUIRED",
        403: "INSUFFICIENT_PERMISSIONS",
        404: "NOT_FOUND",
        405: "METHOD_NOT_ALLOWED",
        429: "RATE_LIMITED",
    }
    code = status_to_code.get(response.status_code, "INTERNAL_ERROR")

    # For 403, check for CSRF-specific codes.
    if response.status_code == 403 and hasattr(exc, "get_codes"):
        raw_code = exc.get_codes()
        if isinstance(raw_code, str) and raw_code.upper().startswith("CSRF_"):
            code = raw_code.upper()

    entry = get_error_code(code)
    message = entry.message
    # Try to use DRF's detail for the message if it's a string.
    if isinstance(exc, APIException) and isinstance(exc.detail, str):
        message = exc.detail

    envelope = build_error(
        code=entry.code if code in V2_ERROR_CODES else code,
        message=message,
        retryable=entry.retryable,
        request_id=request_id,
    )

    # Forward 500+ to GlitchTip.
    if response.status_code >= 500:
        try:
            import sentry_sdk

            sentry_sdk.capture_exception(exc)
        except Exception:
            logger.warning("Failed to report exception to GlitchTip", exc_info=True)

    response.data = envelope
    return response
