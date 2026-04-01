"""Property-based tests for health endpoint dependency state.

Feature: go-live-readiness, Property 9: Health endpoint reflects dependency state

Tests that for any combination of database connectivity (reachable/unreachable)
and Redis connectivity (reachable/unreachable), the /health/ready/ endpoint
returns the correct HTTP status code and response body.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from unittest.mock import patch

import django

django.setup()

from django.test import SimpleTestCase
from hypothesis import given, settings
from hypothesis import strategies as st
from rest_framework.test import APIRequestFactory

from apps.common.health import ReadinessView

# ---------------------------------------------------------------------------
# Strategy: all 4 combinations of (db_ok, redis_ok) booleans
# ---------------------------------------------------------------------------

_dependency_states = st.tuples(st.booleans(), st.booleans())


class TestHealthEndpointReflectsDependencyState(SimpleTestCase):
    """Property 9: Health endpoint reflects dependency state.

    For any combination of database connectivity (reachable/unreachable)
    and Redis connectivity (reachable/unreachable), the /health/ready/
    endpoint should:
    - Return HTTP 200 with {"status": "ok", "db": "ok", "redis": "ok"}
      when both are reachable
    - Return HTTP 503 with the failing component marked as "error"
      when either is unreachable

    Feature: go-live-readiness, Property 9: Health endpoint reflects
    dependency state

    **Validates: Requirements 4.5, 4.6**
    """

    @given(state=_dependency_states)
    @settings(max_examples=100, deadline=None)
    def test_readiness_reflects_dependency_state(self, state):
        """The readiness endpoint returns the correct status code and body
        for every combination of DB and Redis connectivity."""
        db_ok, redis_ok = state

        factory = APIRequestFactory()
        request = factory.get("/health/ready/")

        with patch.object(ReadinessView, "_check_db", return_value=db_ok), \
             patch.object(ReadinessView, "_check_redis", return_value=redis_ok):
            view = ReadinessView.as_view()
            response = view(request)

        if db_ok and redis_ok:
            # Both healthy → 200
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["status"], "ok")
            self.assertEqual(response.data["db"], "ok")
            self.assertEqual(response.data["redis"], "ok")
        else:
            # At least one unhealthy → 503
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.data["status"], "unhealthy")
            self.assertEqual(response.data["db"], "ok" if db_ok else "error")
            self.assertEqual(response.data["redis"], "ok" if redis_ok else "error")
