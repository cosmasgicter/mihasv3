"""Unit tests for health check endpoints.

Tests liveness and readiness probes at /health/live/ and /health/ready/.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, TestCase
from django.test.client import RequestFactory
from rest_framework.test import APIRequestFactory

from apps.common.health import LivenessView, ReadinessView


class TestLivenessView(SimpleTestCase):
    """Tests for /health/live/ endpoint."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.view = LivenessView.as_view()

    def test_returns_200_ok(self):
        request = self.factory.get("/health/live/")
        response = self.view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "ok")

    def test_no_auth_required(self):
        """Liveness should work without any authentication."""
        request = self.factory.get("/health/live/")
        response = self.view(request)
        self.assertEqual(response.status_code, 200)

    def test_response_structure(self):
        request = self.factory.get("/health/live/")
        response = self.view(request)
        self.assertIn("status", response.data)
        self.assertEqual(len(response.data), 1)


class TestReadinessView(SimpleTestCase):
    """Tests for /health/ready/ endpoint."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.view = ReadinessView.as_view()

    @patch.object(ReadinessView, "_check_db", return_value=True)
    @patch.object(ReadinessView, "_check_redis", return_value=True)
    def test_returns_200_when_all_healthy(self, mock_redis, mock_db):
        request = self.factory.get("/health/ready/")
        response = self.view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["db"], "ok")
        self.assertEqual(response.data["redis"], "ok")

    @patch.object(ReadinessView, "_check_db", return_value=False)
    @patch.object(ReadinessView, "_check_redis", return_value=True)
    def test_returns_503_when_db_unhealthy(self, mock_redis, mock_db):
        request = self.factory.get("/health/ready/")
        response = self.view(request)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["status"], "unhealthy")
        self.assertEqual(response.data["db"], "error")
        self.assertEqual(response.data["redis"], "ok")

    @patch.object(ReadinessView, "_check_db", return_value=True)
    @patch.object(ReadinessView, "_check_redis", return_value=False)
    def test_returns_200_when_redis_unhealthy(self, mock_redis, mock_db):
        """Redis failure is non-critical — returns 200 with degraded status."""
        request = self.factory.get("/health/ready/")
        response = self.view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["db"], "ok")
        self.assertEqual(response.data["redis"], "degraded")

    @patch.object(ReadinessView, "_check_db", return_value=False)
    @patch.object(ReadinessView, "_check_redis", return_value=False)
    def test_returns_503_when_both_unhealthy(self, mock_redis, mock_db):
        request = self.factory.get("/health/ready/")
        response = self.view(request)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["status"], "unhealthy")
        self.assertEqual(response.data["db"], "error")
        self.assertEqual(response.data["redis"], "error")

    def test_no_auth_required(self):
        """Readiness should work without any authentication."""
        with patch.object(ReadinessView, "_check_db", return_value=True), \
             patch.object(ReadinessView, "_check_redis", return_value=True):
            request = self.factory.get("/health/ready/")
            response = self.view(request)
            self.assertEqual(response.status_code, 200)

    @patch.object(ReadinessView, "_check_db", return_value=True)
    @patch.object(ReadinessView, "_check_redis", return_value=True)
    def test_response_structure_healthy(self, mock_redis, mock_db):
        request = self.factory.get("/health/ready/")
        response = self.view(request)
        self.assertIn("status", response.data)
        self.assertIn("db", response.data)
        self.assertIn("redis", response.data)
        self.assertEqual(len(response.data), 3)
