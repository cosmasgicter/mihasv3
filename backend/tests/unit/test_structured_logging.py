"""Unit tests for structured request-aware logging."""

import json
import logging
from unittest.mock import patch

from django.test import RequestFactory, SimpleTestCase

from apps.common.logging import JsonLogFormatter, RequestContextFilter, bind_request_context, clear_request_context
from apps.common.middleware import RequestIDMiddleware


class TestJsonLogFormatter(SimpleTestCase):
    def tearDown(self):
        clear_request_context()

    def test_includes_request_context_when_bound(self):
        bind_request_context(request_id="req-123", method="POST", path="/api/v1/auth/login/")
        record = logging.LogRecord(
            name="apps.common.tests",
            level=logging.INFO,
            pathname=__file__,
            lineno=10,
            msg="structured event",
            args=(),
            exc_info=None,
        )
        RequestContextFilter().filter(record)

        formatted = JsonLogFormatter().format(record)
        payload = json.loads(formatted)

        self.assertEqual(payload["message"], "structured event")
        self.assertEqual(payload["request_id"], "req-123")
        self.assertEqual(payload["request_method"], "POST")
        self.assertEqual(payload["request_path"], "/api/v1/auth/login/")


class TestRequestIDMiddleware(SimpleTestCase):
    def tearDown(self):
        clear_request_context()

    def test_sets_response_header_and_clears_context(self):
        factory = RequestFactory()
        seen = {}

        def get_response(request):
            record = logging.LogRecord(
                name="apps.common.tests",
                level=logging.INFO,
                pathname=__file__,
                lineno=20,
                msg="request lifecycle",
                args=(),
                exc_info=None,
            )
            RequestContextFilter().filter(record)
            seen["request_id"] = getattr(record, "request_id", None)
            seen["request_method"] = getattr(record, "request_method", None)
            seen["request_path"] = getattr(record, "request_path", None)

            class DummyResponse(dict):
                pass

            return DummyResponse()

        middleware = RequestIDMiddleware(get_response)
        request = factory.get("/health/live/", HTTP_X_REQUEST_ID="req-xyz")
        response = middleware(request)

        self.assertEqual(response["X-Request-ID"], "req-xyz")
        self.assertEqual(seen["request_id"], "req-xyz")
        self.assertEqual(seen["request_method"], "GET")
        self.assertEqual(seen["request_path"], "/health/live/")

        record = logging.LogRecord(
            name="apps.common.tests",
            level=logging.INFO,
            pathname=__file__,
            lineno=30,
            msg="after request",
            args=(),
            exc_info=None,
        )
        RequestContextFilter().filter(record)
        self.assertIsNone(getattr(record, "request_id", None))

    @patch("apps.common.middleware.settings.APP_VERSION", "2026.04.22-sha1234")
    def test_sets_backend_version_header(self):
        factory = RequestFactory()

        def get_response(request):
            class DummyResponse(dict):
                pass

            return DummyResponse()

        middleware = RequestIDMiddleware(get_response)
        request = factory.get("/health/live/")
        response = middleware(request)

        self.assertEqual(response["X-Backend-Version"], "2026.04.22-sha1234")
