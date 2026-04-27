"""Tests that /health/ready/ does not expose redis_latency_ms (Phase 2 fix)."""
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from apps.common.health import ReadinessView

factory = APIRequestFactory()


class TestHealthPublicResponse(SimpleTestCase):
    @patch.object(ReadinessView, "_check_db", return_value=True)
    @patch.object(ReadinessView, "_check_redis_with_latency", return_value=("ok", 1.5))
    def test_healthy_response_omits_redis_latency(self, _redis, _db):
        request = factory.get("/health/ready/")
        response = ReadinessView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertIn("redis", response.data)
        self.assertNotIn("redis_latency_ms", response.data)

    @patch.object(ReadinessView, "_check_db", return_value=False)
    @patch.object(ReadinessView, "_check_redis_with_latency", return_value=("ok", 2.0))
    def test_unhealthy_response_omits_redis_latency(self, _redis, _db):
        request = factory.get("/health/ready/")
        response = ReadinessView.as_view()(request)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("redis_latency_ms", response.data)
