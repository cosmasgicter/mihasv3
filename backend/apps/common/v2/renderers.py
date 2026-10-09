"""V2 response envelope renderer.

Wraps success responses in the canonical V2 envelope:

    {"success": true, "data": <payload>, "meta": {"request_id": ..., "api_version": "v2"}}

Error responses are already shaped by ``v2_exception_handler``; the renderer
passes them through unchanged.

Design: ``design.md`` §14.1
Requirement: R14.1
Task: 1.3
"""

from __future__ import annotations

from rest_framework.renderers import JSONRenderer

from apps.common.v2.envelope import build_success


class V2EnvelopeRenderer(JSONRenderer):
    """Wrap V2 responses in the canonical envelope with meta block."""

    def render(self, data, accepted_media_type=None, renderer_context=None):
        response = renderer_context.get("response") if renderer_context else None
        request = renderer_context.get("request") if renderer_context else None
        request_id = getattr(request, "request_id", None) if request else None

        # Error responses are already shaped by the exception handler.
        if response and response.status_code >= 400:
            if isinstance(data, dict) and "success" in data:
                return super().render(data, accepted_media_type, renderer_context)
            # Fallback: wrap unformatted errors (shouldn't happen with the handler).
            from apps.common.v2.envelope import build_error

            envelope = build_error(
                code="INTERNAL_ERROR",
                message=str(data) if data else "An unexpected error occurred.",
                request_id=request_id,
            )
            return super().render(envelope, accepted_media_type, renderer_context)

        # Success: if the pagination already produced the envelope, pass through.
        if isinstance(data, dict) and "success" in data and "meta" in data:
            return super().render(data, accepted_media_type, renderer_context)

        # Wrap in the V2 success envelope.
        envelope = build_success(data, request_id=request_id)
        return super().render(envelope, accepted_media_type, renderer_context)
