"""
Bug 5 (P1) — Preservation Tests for Admin Functionality and Dev Docs Access

These tests verify baseline behavior that MUST be preserved after the fix:
1. Health check endpoints (/health/live/, /health/ready/) remain publicly accessible
2. OpenAPI docs remain accessible in DEBUG=True mode (development)
3. Public endpoints (login, register, etc.) remain accessible without auth

These tests MUST PASS on unfixed code — this confirms baseline behavior to preserve.

**Validates: Requirements 3.8, 3.9, 3.10**
"""

import pytest
from hypothesis import given, settings as hypothesis_settings
from hypothesis import strategies as st
from unittest.mock import MagicMock

from django.test import override_settings
from rest_framework.permissions import AllowAny

from apps.common.health import LivenessView, ReadinessView


# ---------------------------------------------------------------------------
# Health check endpoints: /health/live/ and /health/ready/
# ---------------------------------------------------------------------------

HEALTH_CHECK_VIEWS = [
    ("LivenessView", LivenessView),
    ("ReadinessView", ReadinessView),
]

health_view_strategy = st.sampled_from(HEALTH_CHECK_VIEWS)


class TestHealthCheckEndpointsPreservation:
    """
    Preservation: Health check endpoints must remain publicly accessible
    without any authentication requirement.

    **Validates: Requirements 3.9**
    """

    @given(view_pair=health_view_strategy)
    @hypothesis_settings(max_examples=10, deadline=None)
    def test_health_check_views_allow_any(self, view_pair):
        """
        For any health check view, permission_classes must contain AllowAny
        so that liveness/readiness probes work without auth.

        **Validates: Requirements 3.9**
        """
        view_name, view_class = view_pair
        permission_classes = view_class.permission_classes
        has_allow_any = any(
            perm is AllowAny
            or (isinstance(perm, type) and issubclass(perm, AllowAny))
            for perm in permission_classes
        )
        assert has_allow_any, (
            f"{view_name}.permission_classes == {permission_classes} — "
            f"expected AllowAny for public health check endpoint"
        )

    @given(view_pair=health_view_strategy)
    @hypothesis_settings(max_examples=10, deadline=None)
    def test_health_check_views_disable_auth_backends(self, view_pair):
        """
        For any health check view, authentication_classes must be []
        so that no auth middleware interferes with probes.

        **Validates: Requirements 3.9**
        """
        view_name, view_class = view_pair
        auth_classes = getattr(view_class, "authentication_classes", None)
        assert auth_classes == [], (
            f"{view_name}.authentication_classes == {auth_classes} — "
            f"expected [] for public health check endpoint"
        )


# ---------------------------------------------------------------------------
# OpenAPI docs accessible in DEBUG=True mode
# ---------------------------------------------------------------------------

# Strategy for OpenAPI URL names
OPENAPI_URL_NAMES = ["schema", "swagger-ui", "redoc"]
openapi_url_strategy = st.sampled_from(OPENAPI_URL_NAMES)


class TestOpenAPIDocsAccessibleInDebugMode:
    """
    Preservation: OpenAPI endpoints must remain accessible without
    authentication when DEBUG=True (development mode).

    On unfixed code, docs are publicly accessible regardless of DEBUG.
    After the fix, docs should still be accessible in DEBUG=True mode.
    This test confirms the baseline dev-mode behavior to preserve.

    **Validates: Requirements 3.8**
    """

    @override_settings(DEBUG=True)
    @given(url_name=openapi_url_strategy)
    @hypothesis_settings(max_examples=15, deadline=None)
    def test_openapi_endpoints_accessible_in_debug_mode(self, url_name):
        """
        For any OpenAPI endpoint, an unauthenticated request with DEBUG=True
        should NOT be denied (status code should not be 403).

        On unfixed code: docs are public, so this passes trivially.
        After fix: IsAuthenticatedOrDebug allows access when DEBUG=True.

        **Validates: Requirements 3.8**
        """
        from django.urls import reverse
        from rest_framework.test import APIRequestFactory
        from django.contrib.auth.models import AnonymousUser

        factory = APIRequestFactory()
        url = reverse(url_name)
        request = factory.get(url)
        request.user = AnonymousUser()

        from django.urls import resolve
        match = resolve(url)
        view_func = match.func

        response = view_func(request)

        assert response.status_code != 403, (
            f"GET {url} with DEBUG=True returned 403 — "
            f"OpenAPI docs must remain accessible in development mode"
        )


# ---------------------------------------------------------------------------
# Public endpoints remain accessible without auth
# ---------------------------------------------------------------------------

class TestPublicEndpointsPreservation:
    """
    Preservation: Public endpoints like health checks must remain
    accessible without authentication after the Bug 5 fix.

    This verifies that the URL configuration changes for admin/docs
    do not accidentally break public endpoint routing.

    **Validates: Requirements 3.9, 3.10**
    """

    def test_health_live_url_resolves(self):
        """
        /health/live/ must resolve to a valid view.

        **Validates: Requirements 3.9**
        """
        from django.urls import resolve
        match = resolve("/health/live/")
        assert match is not None, "/health/live/ does not resolve"
        assert match.func is not None, "/health/live/ resolves but has no view"

    def test_health_ready_url_resolves(self):
        """
        /health/ready/ must resolve to a valid view.

        **Validates: Requirements 3.9**
        """
        from django.urls import resolve
        match = resolve("/health/ready/")
        assert match is not None, "/health/ready/ does not resolve"
        assert match.func is not None, "/health/ready/ resolves but has no view"

    def test_health_live_view_is_liveness(self):
        """
        /health/live/ must map to LivenessView.

        **Validates: Requirements 3.9**
        """
        from django.urls import resolve
        match = resolve("/health/live/")
        # DRF views wrap the class — check initkwargs or cls
        view_cls = getattr(match.func, "cls", None) or getattr(
            match.func, "view_class", None
        )
        assert view_cls is LivenessView, (
            f"/health/live/ maps to {view_cls}, expected LivenessView"
        )

    def test_health_ready_view_is_readiness(self):
        """
        /health/ready/ must map to ReadinessView.

        **Validates: Requirements 3.9**
        """
        from django.urls import resolve
        match = resolve("/health/ready/")
        view_cls = getattr(match.func, "cls", None) or getattr(
            match.func, "view_class", None
        )
        assert view_cls is ReadinessView, (
            f"/health/ready/ maps to {view_cls}, expected ReadinessView"
        )

    def test_lenco_webhook_url_resolves(self):
        """
        /api/v1/payments/webhook/lenco/ must resolve to a valid view
        (webhook endpoint must remain publicly accessible).

        **Validates: Requirements 3.10**
        """
        from django.urls import resolve
        match = resolve("/api/v1/payments/webhook/lenco/")
        assert match is not None, (
            "/api/v1/payments/webhook/lenco/ does not resolve — "
            "webhook endpoint must remain accessible"
        )
