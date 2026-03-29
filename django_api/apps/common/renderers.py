"""Response envelope renderer.

Wraps all DRF responses in the standard envelope format:
  Success: { "success": true, "data": <payload> }
  Error:   { "success": false, "error": "<message>", "code": "<error_code>" }

Implements task 6.1.
Requirements: 10.3, 10.4
"""

from rest_framework.renderers import JSONRenderer


class EnvelopeRenderer(JSONRenderer):
    """Wraps all responses in the standard envelope format."""

    def render(self, data, accepted_media_type=None, renderer_context=None):
        response = renderer_context.get("response") if renderer_context else None

        if response and response.status_code >= 400:
            # Error responses already formatted by exception handler
            if isinstance(data, dict) and "success" in data:
                return super().render(data, accepted_media_type, renderer_context)
            # Wrap unformatted errors
            envelope = {
                "success": False,
                "error": str(data),
                "code": "UNKNOWN_ERROR",
            }
        else:
            # Success responses
            if isinstance(data, dict) and "success" in data:
                return super().render(data, accepted_media_type, renderer_context)
            envelope = {"success": True, "data": data}

        return super().render(envelope, accepted_media_type, renderer_context)
