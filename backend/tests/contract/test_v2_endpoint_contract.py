"""Contract tests for the V2 error handler and the V1 defaults it must not disturb.

Task 1.3 (R14.1-R14.2, R17.2; finding API-01). The five representative V2 demo views and
their per-view contract tests were removed by platform-simplification task 13.1 (decision D5,
requirement 2.6): nothing called them. The cross-cutting cases below do not use a view, so
they stay: throttle (429), server error (500), permission denied (403), conflict (409), and the
proof that V1 keeps its own renderer and exception handler.
"""
from __future__ import annotations

import os
import uuid

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

factory = APIRequestFactory()


# ---------------------------------------------------------------------------
# Cross-cutting: Throttle (429) and Internal Error (500)
# ---------------------------------------------------------------------------


class TestV2ThrottleAndServerError(SimpleTestCase):
    """V2 views produce correct envelopes for throttled and 500 errors."""

    def test_throttled_returns_retryable_error(self):
        """Simulated throttle produces V2 RATE_LIMITED with retryable=True."""
        from rest_framework.exceptions import Throttled

        from apps.common.v2.exceptions import v2_exception_handler

        request = factory.get("/api/v2/test/")
        request.request_id = str(uuid.uuid4())
        exc = Throttled(wait=60)
        ctx = {"request": request, "view": None}

        response = v2_exception_handler(exc, ctx)

        assert response.status_code == 429
        assert response.data["error"]["code"] == "RATE_LIMITED"
        assert response.data["error"]["retryable"] is True
        assert response.data["meta"]["api_version"] == "v2"

    def test_unhandled_exception_returns_500(self):
        """Unhandled exception produces V2 INTERNAL_ERROR (no leak)."""
        from apps.common.v2.exceptions import v2_exception_handler

        request = factory.get("/api/v2/test/")
        request.request_id = str(uuid.uuid4())
        exc = RuntimeError("segfault-like error")
        ctx = {"request": request, "view": None}

        response = v2_exception_handler(exc, ctx)

        assert response.status_code == 500
        data = response.data
        assert data["error"]["code"] == "INTERNAL_ERROR"
        assert "segfault" not in data["error"]["message"]
        assert data["error"]["retryable"] is False

    def test_permission_denied_returns_403(self):
        """PermissionDenied produces V2 INSUFFICIENT_PERMISSIONS."""
        from rest_framework.exceptions import PermissionDenied

        from apps.common.v2.exceptions import v2_exception_handler

        request = factory.get("/api/v2/test/")
        request.request_id = str(uuid.uuid4())
        exc = PermissionDenied()
        ctx = {"request": request, "view": None}

        response = v2_exception_handler(exc, ctx)

        assert response.status_code == 403
        assert response.data["error"]["code"] == "INSUFFICIENT_PERMISSIONS"
        assert response.data["error"]["retryable"] is False

    def test_conflict_domain_error(self):
        """V2ConflictError produces 409 CONFLICT."""
        from apps.common.v2.exceptions import V2ConflictError, v2_exception_handler

        request = factory.get("/api/v2/test/")
        request.request_id = str(uuid.uuid4())
        exc = V2ConflictError("Duplicate entry.")
        ctx = {"request": request, "view": None}

        response = v2_exception_handler(exc, ctx)

        assert response.status_code == 409
        assert response.data["error"]["code"] == "CONFLICT"
        assert response.data["error"]["message"] == "Duplicate entry."


# ---------------------------------------------------------------------------
# V2 envelope immutability: V1 must not be affected
# ---------------------------------------------------------------------------


class TestV1Unaffected(SimpleTestCase):
    """V1 endpoints retain their existing envelope format."""

    def test_v1_envelope_renderer_still_default(self):
        """REST_FRAMEWORK default renderer is still the V1 EnvelopeRenderer."""
        from django.conf import settings

        renderers = settings.REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"]
        assert "apps.common.renderers.EnvelopeRenderer" in renderers

    def test_v1_exception_handler_still_default(self):
        """REST_FRAMEWORK EXCEPTION_HANDLER is still the V1 handler."""
        from django.conf import settings

        handler = settings.REST_FRAMEWORK["EXCEPTION_HANDLER"]
        assert handler == "apps.common.exceptions.envelope_exception_handler"
