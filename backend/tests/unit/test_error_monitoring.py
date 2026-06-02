"""Unit tests for error monitoring — ErrorReportView endpoint (GlitchTip migration).

Tests:
- POST /api/v1/errors/report/ returns 200 for valid payload and calls sentry_sdk.capture_message
- POST /api/v1/errors/report/ returns 400 for missing `message` field
- Error report endpoint works for unauthenticated requests
- Batch payloads call sentry_sdk.capture_message per item
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from unittest.mock import patch

import django

django.setup()

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from apps.common.error_views import ErrorReportView


factory = APIRequestFactory()


class TestErrorReportValidPayload(SimpleTestCase):
    """A valid error report with a `message` field should return 200
    and forward to GlitchTip via sentry_sdk.capture_message."""

    @patch("apps.common.error_views.sentry_sdk.capture_message")
    def test_returns_200_and_calls_sentry(self, mock_capture):
        request = factory.post(
            "/api/v1/errors/report/",
            {
                "message": "Uncaught TypeError: Cannot read properties of undefined",
                "stack_trace": "at Object.<anonymous> (app.js:42:15)",
                "url": "https://apply.mihas.edu.zm/apply",
                "user_agent": "Mozilla/5.0",
            },
            format="json",
        )

        view = ErrorReportView.as_view()
        response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])

        # sentry_sdk.capture_message was called with the error message
        mock_capture.assert_called_once()
        call_args = mock_capture.call_args
        self.assertIn("TypeError", call_args[0][0])
        self.assertEqual(call_args[1]["level"], "error")


class TestErrorReportMissingMessage(SimpleTestCase):
    """A payload without a `message` field should return 400."""

    @patch("apps.common.error_views.sentry_sdk.capture_message")
    def test_returns_400_for_missing_message(self, mock_capture):
        request = factory.post(
            "/api/v1/errors/report/",
            {
                "stack_trace": "at Object.<anonymous> (app.js:42:15)",
                "url": "https://apply.mihas.edu.zm/apply",
            },
            format="json",
        )

        view = ErrorReportView.as_view()
        response = view(request)

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.data["success"])
        self.assertEqual(response.data["code"], "VALIDATION_ERROR")

        # sentry_sdk should NOT have been called
        mock_capture.assert_not_called()


class TestErrorReportUnauthenticated(SimpleTestCase):
    """The endpoint should accept requests without any authentication."""

    @patch("apps.common.error_views.sentry_sdk.capture_message")
    def test_unauthenticated_request_returns_200(self, mock_capture):
        request = factory.post(
            "/api/v1/errors/report/",
            {"message": "Script error from anonymous visitor"},
            format="json",
        )

        view = ErrorReportView.as_view()
        response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        mock_capture.assert_called_once()


class TestErrorReportBatchPayload(SimpleTestCase):
    """A batch payload should call sentry_sdk.capture_message per item."""

    @patch("apps.common.error_views.sentry_sdk.capture_message")
    def test_batch_payload_calls_sentry_per_item(self, mock_capture):
        request = factory.post(
            "/api/v1/errors/report/",
            {
                "errors": [
                    {
                        "message": "First client error",
                        "stack_trace": "at first.js:1:1",
                        "url": "https://apply.mihas.edu.zm/apply",
                    },
                    {
                        "message": "Second client error",
                        "stack_trace": "at second.js:2:2",
                        "url": "https://apply.mihas.edu.zm/apply",
                    },
                ],
            },
            format="json",
        )

        view = ErrorReportView.as_view()
        response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["data"]["received"], 2)
        self.assertEqual(mock_capture.call_count, 2)
