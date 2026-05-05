"""Tests for API envelope consistency across SessionView, catalog, analytics, and integrations views.

Verifies that all authenticated endpoints return the standard envelope format:
  {"success": true, "data": ...}

Implements task 7.5.
Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from apps.accounts.views import SessionView
from apps.common.renderers import EnvelopeRenderer

factory = APIRequestFactory()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_unauthenticated_request(path="/api/v1/auth/session/"):
    request = factory.get(path)
    request.user = MagicMock(is_authenticated=False)
    return request


def _make_admin_request(path="/"):
    request = factory.get(path)
    request.user = MagicMock(
        is_authenticated=True,
        id="admin-1",
        email="admin@example.com",
        first_name="Admin",
        last_name="User",
        role="admin",
    )
    request.query_params = {}
    return request


def _render_through_envelope(response):
    """Render a DRF Response through the EnvelopeRenderer and return the envelope dict."""
    import json

    renderer = EnvelopeRenderer()
    rendered = renderer.render(
        response.data,
        renderer_context={"response": response},
    )
    return json.loads(rendered)


# ---------------------------------------------------------------------------
# 1. SessionView unauthenticated response shape
# ---------------------------------------------------------------------------


class TestSessionViewEnvelope(SimpleTestCase):
    """SessionView.get() must return envelope format for unauthenticated users."""

    def test_unauthenticated_returns_success_true(self):
        request = _make_unauthenticated_request()
        response = SessionView().get(request)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])

    def test_unauthenticated_has_data_key(self):
        request = _make_unauthenticated_request()
        response = SessionView().get(request)
        self.assertIn("data", response.data)

    def test_unauthenticated_data_contains_authenticated_false(self):
        request = _make_unauthenticated_request()
        response = SessionView().get(request)
        self.assertEqual(response.data["data"], {"authenticated": False})

    def test_unauthenticated_envelope_shape_exact(self):
        """The full response must be exactly {"success": True, "data": {"authenticated": False}}."""
        request = _make_unauthenticated_request()
        response = SessionView().get(request)
        self.assertEqual(response.data, {"success": True, "data": {"authenticated": False}})

    def test_unauthenticated_renderer_passthrough(self):
        """EnvelopeRenderer should not double-wrap a response that already has 'success'."""
        request = _make_unauthenticated_request()
        response = SessionView().get(request)
        envelope = _render_through_envelope(response)
        self.assertTrue(envelope["success"])
        self.assertEqual(envelope["data"], {"authenticated": False})


# ---------------------------------------------------------------------------
# 2. Catalog views response shape
# ---------------------------------------------------------------------------


class TestCatalogEnvelope(SimpleTestCase):
    """Catalog list views must return {"success": True, "data": ...} envelope."""

    @patch("apps.catalog.views.Subject.objects")
    def test_subject_list_returns_envelope(self, mock_qs):
        from apps.catalog.views import SubjectListView

        mock_qs.all.return_value.order_by.return_value = []

        request = factory.get("/api/v1/catalog/subjects/")
        request.user = MagicMock(is_authenticated=False)
        request.query_params = {}

        response = SubjectListView().get(request)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        self.assertIn("data", response.data)
        self.assertIsInstance(response.data["data"], list)

    @patch("apps.catalog.views.Intake.objects")
    def test_intake_list_returns_envelope(self, mock_qs):
        from apps.catalog.views import IntakeListCreateView

        mock_qs.filter.return_value.exclude.return_value.exclude.return_value.order_by.return_value = []

        request = factory.get("/api/v1/catalog/intakes/")
        request.user = MagicMock(is_authenticated=False)
        request.query_params = {}
        request.method = "GET"

        view = IntakeListCreateView()
        view.request = request
        response = view.get(request)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        self.assertIn("data", response.data)

    @patch("apps.catalog.views.Institution.objects")
    def test_institution_list_returns_envelope(self, mock_qs):
        from apps.catalog.views import InstitutionListCreateView

        mock_qs.filter.return_value.order_by.return_value = []

        request = factory.get("/api/v1/catalog/institutions/")
        request.user = MagicMock(is_authenticated=False)
        request.query_params = {}
        request.method = "GET"

        view = InstitutionListCreateView()
        view.request = request
        response = view.get(request)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        self.assertIn("data", response.data)
        self.assertIsInstance(response.data["data"], list)

    @patch("apps.catalog.views.StandardPagination.paginate_queryset", return_value=None)
    @patch("apps.catalog.views.Program.objects")
    def test_program_list_returns_envelope_unpaginated(self, mock_qs, _mock_paginate):
        from apps.catalog.views import ProgramListCreateView

        mock_chain = MagicMock()
        mock_chain.__iter__ = MagicMock(return_value=iter([]))
        mock_qs.select_related.return_value.filter.return_value.order_by.return_value = mock_chain

        request = factory.get("/api/v1/catalog/programs/")
        request.user = MagicMock(is_authenticated=False)
        request.query_params = {}
        request.method = "GET"

        view = ProgramListCreateView()
        view.request = request
        response = view.get(request)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        self.assertIn("data", response.data)


# ---------------------------------------------------------------------------
# 3. Analytics views response shape (EnvelopeRenderer wrapping)
# ---------------------------------------------------------------------------


class TestAnalyticsEnvelope(SimpleTestCase):
    """Analytics views return raw data; EnvelopeRenderer wraps it in the envelope."""

    def test_source_analytics_envelope(self):
        from apps.analytics.views import SourceAnalyticsView

        request = factory.get("/api/v1/analytics/sources/")
        request.user = MagicMock(
            is_authenticated=True,
            role="admin",
        )

        response = SourceAnalyticsView().get(request)
        self.assertEqual(response.status_code, 200)

        # The view returns raw data; verify the renderer wraps it
        envelope = _render_through_envelope(response)
        self.assertTrue(envelope["success"])
        self.assertIn("data", envelope)
        self.assertIsInstance(envelope["data"], list)

    def test_outreach_analytics_envelope(self):
        from apps.analytics.views import OutreachAnalyticsView

        request = factory.get("/api/v1/analytics/outreach/")
        request.user = MagicMock(
            is_authenticated=True,
            role="admin",
        )

        response = OutreachAnalyticsView().get(request)
        self.assertEqual(response.status_code, 200)

        envelope = _render_through_envelope(response)
        self.assertTrue(envelope["success"])
        self.assertIn("data", envelope)
        self.assertIn("campaigns_sent", envelope["data"])

    def test_daily_digest_envelope(self):
        from apps.analytics.views import DailyDigestReportView

        request = factory.get("/api/v1/reports/daily-digest/")
        request.user = MagicMock(
            is_authenticated=True,
            role="admin",
        )

        response = DailyDigestReportView().get(request)
        self.assertEqual(response.status_code, 200)

        envelope = _render_through_envelope(response)
        self.assertTrue(envelope["success"])
        self.assertIn("data", envelope)
        self.assertIn("headline", envelope["data"])

    @patch("apps.analytics.views.FunnelAnalyticsView.get")
    def test_funnel_analytics_sample_data_envelope(self, mock_get):
        """When the funnel view returns sample data, the renderer wraps it."""
        from apps.common.jobs_ops_seed import sample_funnel_analytics
        from rest_framework.response import Response

        sample = sample_funnel_analytics()
        mock_response = Response(sample)
        mock_response.status_code = 200
        mock_get.return_value = mock_response

        envelope = _render_through_envelope(mock_response)
        self.assertTrue(envelope["success"])
        self.assertIn("data", envelope)
        self.assertIn("discovered", envelope["data"])


# ---------------------------------------------------------------------------
# 4. Integrations views response shape (EnvelopeRenderer wrapping)
# ---------------------------------------------------------------------------


class TestIntegrationsEnvelope(SimpleTestCase):
    """Integrations views return raw data; EnvelopeRenderer wraps it in the envelope."""

    def test_telegram_test_envelope(self):
        from apps.integrations.views import TelegramTestView

        request = factory.post("/api/v1/integrations/telegram/test/")
        request.user = MagicMock(is_authenticated=True)

        response = TelegramTestView().post(request)
        self.assertEqual(response.status_code, 200)

        envelope = _render_through_envelope(response)
        self.assertTrue(envelope["success"])
        self.assertIn("data", envelope)
        self.assertIn("message", envelope["data"])
        self.assertEqual(envelope["data"]["status"], "sent")

    def test_telegram_connect_envelope(self):
        from apps.integrations.views import TelegramConnectView

        request = factory.post("/api/v1/integrations/telegram/connect/")
        request.user = MagicMock(is_authenticated=True)

        response = TelegramConnectView().post(request)
        self.assertEqual(response.status_code, 201)

        envelope = _render_through_envelope(response)
        self.assertTrue(envelope["success"])
        self.assertIn("data", envelope)
        self.assertEqual(envelope["data"]["status"], "connected")

    def test_openai_test_envelope(self):
        from apps.integrations.views import OpenAITestView

        request = factory.post("/api/v1/integrations/openai/test/")
        request.user = MagicMock(is_authenticated=True)

        response = OpenAITestView().post(request)
        self.assertEqual(response.status_code, 200)

        envelope = _render_through_envelope(response)
        self.assertTrue(envelope["success"])
        self.assertIn("data", envelope)
        self.assertEqual(envelope["data"]["status"], "ok")

    def test_telegram_webhook_envelope(self):
        """Webhook (unauthenticated) should also be wrapped by the renderer."""
        from apps.integrations.views import TelegramWebhookView

        request = factory.post("/api/v1/integrations/telegram/webhook/")
        request.user = MagicMock(is_authenticated=False)
        request.headers = {}

        response = TelegramWebhookView().post(request)
        self.assertEqual(response.status_code, 200)

        envelope = _render_through_envelope(response)
        self.assertTrue(envelope["success"])
        self.assertIn("data", envelope)
        self.assertEqual(envelope["data"]["status"], "accepted")


# ---------------------------------------------------------------------------
# 5. EnvelopeRenderer does not double-wrap
# ---------------------------------------------------------------------------


class TestEnvelopeRendererIdempotency(SimpleTestCase):
    """EnvelopeRenderer must not double-wrap responses that already have 'success' key."""

    def test_already_wrapped_success_response(self):
        """A response with {"success": True, "data": ...} passes through unchanged."""
        from rest_framework.response import Response

        data = {"success": True, "data": {"items": [1, 2, 3]}}
        response = Response(data)
        response.status_code = 200

        envelope = _render_through_envelope(response)
        self.assertEqual(envelope, data)

    def test_already_wrapped_error_response(self):
        """A response with {"success": False, "error": ...} passes through unchanged."""
        from rest_framework.response import Response

        data = {"success": False, "error": "Not found", "code": "NOT_FOUND"}
        response = Response(data)
        response.status_code = 404

        envelope = _render_through_envelope(response)
        self.assertEqual(envelope, data)

    def test_raw_data_gets_wrapped(self):
        """A response without 'success' key gets wrapped by the renderer."""
        from rest_framework.response import Response

        data = {"name": "Test Item", "value": 42}
        response = Response(data)
        response.status_code = 200

        envelope = _render_through_envelope(response)
        self.assertTrue(envelope["success"])
        self.assertEqual(envelope["data"], data)
