"""Unit tests for error monitoring — ErrorReportView endpoint.

Tests:
- POST /api/v1/errors/report/ returns 200 for valid payload (Requirement 3.4)
- POST /api/v1/errors/report/ returns 400 for missing `message` field (Requirement 3.4)
- Error report endpoint works for unauthenticated requests (Requirement 3.5)
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


# =========================================================================
# Test: POST /api/v1/errors/report/ returns 200 for valid payload
# Requirement 3.4
# =========================================================================


class TestErrorReportValidPayload(SimpleTestCase):
    """A valid error report with a `message` field should return 200."""

    @patch.object(ErrorReportView, "_dispatch_throttled_alert")
    @patch("apps.common.models.ErrorLog.objects.create")
    def test_returns_200_for_valid_payload(self, mock_create, mock_alert):
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

        # ErrorLog.objects.create was called with correct source and level
        mock_create.assert_called_once()
        call_kwargs = mock_create.call_args.kwargs
        self.assertEqual(call_kwargs["source"], "frontend")
        self.assertEqual(call_kwargs["level"], "error")
        self.assertIn("TypeError", call_kwargs["message"])


# =========================================================================
# Test: POST /api/v1/errors/report/ returns 400 for missing `message`
# Requirement 3.4
# =========================================================================


class TestErrorReportMissingMessage(SimpleTestCase):
    """A payload without a `message` field should return 400."""

    @patch.object(ErrorReportView, "_dispatch_throttled_alert")
    @patch("apps.common.models.ErrorLog.objects.create")
    def test_returns_400_for_missing_message(self, mock_create, mock_alert):
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

        # ErrorLog should NOT have been created
        mock_create.assert_not_called()
        mock_alert.assert_not_called()


# =========================================================================
# Test: Error report endpoint works for unauthenticated requests
# Requirement 3.5
# =========================================================================


class TestErrorReportUnauthenticated(SimpleTestCase):
    """The endpoint should accept requests without any authentication."""

    @patch.object(ErrorReportView, "_dispatch_throttled_alert")
    @patch("apps.common.models.ErrorLog.objects.create")
    def test_unauthenticated_request_returns_200(self, mock_create, mock_alert):
        # APIRequestFactory creates unauthenticated requests by default —
        # no cookies, no Authorization header.
        request = factory.post(
            "/api/v1/errors/report/",
            {"message": "Script error from anonymous visitor"},
            format="json",
        )

        view = ErrorReportView.as_view()
        response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        mock_create.assert_called_once()


class TestErrorReportBatchPayload(SimpleTestCase):
    """A batch payload should be accepted and stored item-by-item."""

    @patch.object(ErrorReportView, "_dispatch_throttled_alert")
    @patch("apps.common.models.ErrorLog.objects.create")
    def test_batch_payload_creates_error_log_per_item(self, mock_create, mock_alert):
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
        self.assertEqual(mock_create.call_count, 2)
        self.assertEqual(mock_alert.call_count, 2)
