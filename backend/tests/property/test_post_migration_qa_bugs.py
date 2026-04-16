"""Bug condition exploration tests for post-migration production QA.

# Feature: post-migration-production-qa

Property 1: Bug Condition — SSE 406, Logout CSRF, Admin Refresh, Legacy Endpoints

CRITICAL: These tests MUST FAIL on unfixed code — failure confirms the bugs exist.
DO NOT attempt to fix the tests or the code when they fail.

These tests encode the expected behavior — they will validate the fixes
when they pass after implementation.

**Validates: Requirements 1.1, 1.6, 1.8, 1.9**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

import pytest  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402
from rest_framework.test import APIRequestFactory, force_authenticate  # noqa: E402

import uuid  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

from apps.accounts.authentication import JWTUser  # noqa: E402
from apps.common.middleware import CSRFEnforcementMiddleware  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(user_id=None, role="student"):
    uid = user_id or uuid.uuid4()
    return JWTUser({
        "user_id": str(uid),
        "email": "test@example.com",
        "role": role,
        "first_name": "Test",
        "last_name": "User",
    })


def _auth_request(factory, method, path, user, **kwargs):
    handler = getattr(factory, method.lower())
    request = handler(path, **kwargs)
    force_authenticate(request, user=user)
    return request


# =========================================================================
# Bug 1 (SSE): REMOVED — SSE infrastructure deleted (sse-removal-simplification)
# =========================================================================


# =========================================================================
# Bug 6 (Logout CSRF): POST /api/v1/auth/logout/ blocked by CSRF
# =========================================================================


class TestLogoutCSRFExemption:
    """Bug 6: Logout returns 403 because CSRFEnforcementMiddleware
    does not exempt /api/v1/auth/logout/.

    The EXEMPT_PATTERNS list includes login, register, password-reset,
    and error report — but NOT logout. Since logout is a POST, CSRF
    enforcement blocks it when the token is stale or missing.

    This test verifies that the logout path IS in the CSRF exempt
    patterns (it should be, but currently isn't).

    **Validates: Requirements 1.6**
    """

    @given(
        trailing_slash=st.booleans(),
    )
    @settings(max_examples=10, deadline=None)
    def test_logout_path_is_csrf_exempt(self, trailing_slash):
        """POST /api/v1/auth/logout/ should be CSRF-exempt.

        On unfixed code, this will FAIL because /api/v1/auth/logout/
        is NOT in EXEMPT_PATTERNS, meaning CSRF enforcement blocks
        logout requests without a valid token.
        """
        path = "/api/v1/auth/logout" + ("/" if trailing_slash else "")

        middleware = CSRFEnforcementMiddleware(lambda r: None)
        is_exempt = middleware._is_exempt(path)

        assert is_exempt, (
            f"Path '{path}' is NOT in CSRF EXEMPT_PATTERNS. "
            f"Current exempt patterns: {[p.pattern for p in CSRFEnforcementMiddleware.EXEMPT_PATTERNS]}. "
            f"Logout POST will be blocked with 403 CSRF_VALIDATION_FAILED."
        )

    def test_logout_csrf_403_response_code(self):
        """Verify the CSRF middleware returns CSRF_VALIDATION_FAILED code.

        This confirms the error code that the frontend needs to handle.
        The frontend currently checks for CSRF_INVALID/CSRF_MISSING but
        the middleware returns CSRF_VALIDATION_FAILED.
        """
        response = CSRFEnforcementMiddleware._forbidden_response()
        import json

        body = json.loads(response.content)
        assert body["code"] == "CSRF_VALIDATION_FAILED", (
            f"Expected CSRF_VALIDATION_FAILED, got {body['code']}"
        )
        assert response.status_code == 403


# =========================================================================
# Bug 8 (Admin Refresh): Admin dashboard returns valid JSON
# =========================================================================


class TestAdminDashboardRefresh:
    """Bug 8: Admin dashboard refresh may return 500 or HTML error.

    When an admin refreshes on /admin/dashboard, the backend endpoint
    at GET /api/v1/admin/dashboard/ should return valid JSON. The bug
    manifests when:
    1. The session check triggers a token refresh (POST), which fails
       due to CSRF enforcement (the refresh endpoint is NOT CSRF-exempt)
    2. The SPA route falls through to Django, returning HTML instead of JSON

    The token refresh endpoint (/api/v1/auth/refresh/) is a POST request
    that requires CSRF validation. On page refresh, the CSRF token may
    be stale, causing the refresh to fail with 403. This is the same
    class of bug as Bug 6 (logout CSRF) — the refresh endpoint is also
    not in EXEMPT_PATTERNS.

    **Validates: Requirements 1.8**
    """

    @given(
        has_csrf_token=st.booleans(),
    )
    @settings(max_examples=10, deadline=None)
    def test_auth_refresh_endpoint_csrf_exempt(self, has_csrf_token):
        """POST /api/v1/auth/refresh/ should be CSRF-exempt or the
        admin dashboard refresh flow will break.

        On page refresh, the frontend calls POST /api/v1/auth/refresh/
        to get a new access token. If this endpoint requires CSRF
        validation and the token is stale, the refresh fails with 403,
        causing the admin dashboard to show an error.

        On unfixed code, this will FAIL because /api/v1/auth/refresh/
        is NOT in CSRF EXEMPT_PATTERNS.
        """
        path = "/api/v1/auth/refresh/"

        middleware = CSRFEnforcementMiddleware(lambda r: None)
        is_exempt = middleware._is_exempt(path)

        assert is_exempt, (
            f"Path '{path}' is NOT in CSRF EXEMPT_PATTERNS. "
            f"On admin dashboard page refresh, the frontend calls "
            f"POST /api/v1/auth/refresh/ to renew the access token. "
            f"If the CSRF token is stale (common after page refresh), "
            f"this request fails with 403 CSRF_VALIDATION_FAILED, "
            f"causing the admin dashboard to display an error. "
            f"Current exempt patterns: {[p.pattern for p in CSRFEnforcementMiddleware.EXEMPT_PATTERNS]}"
        )


# =========================================================================
# Bug 9 (Legacy Endpoints): Frontend API calls use compatible methods
# =========================================================================


class TestLegacyEndpointCompatibility:
    """Bug 9: Frontend uses HTTP methods/paths that backend may not support.

    Audit frontend apiClient.request calls against backend URL patterns
    to verify all used methods/paths are supported.

    Known frontend API calls that use PUT or DELETE:
    - PUT /api/v1/applications/{id}/ (ApplicationDetailView — has put ✓)
    - DELETE /api/v1/applications/{id}/ (ApplicationDetailView — has delete ✓)
    - PUT /api/v1/applications/{id}/interviews/ (ApplicationInterviewView — has put?)
    - DELETE /api/v1/applications/{id}/interviews/ (ApplicationInterviewView — has delete?)
    - PUT /api/v1/notifications/preferences/ (NotificationPreferenceView — has put ✓)
    - PUT /api/v1/notifications/{id}/read/ (NotificationMarkReadView — has put ✓)
    - PUT /api/v1/notifications/read-all/ (NotificationMarkAllReadView — has put ✓)
    - DELETE /api/v1/notifications/{id}/ (NotificationDeleteView — has delete ✓)
    - DELETE /api/v1/catalog/programs/{id}/ (ProgramDetailView — has delete ✓)
    - DELETE /api/v1/catalog/intakes/{id}/ (IntakeDetailView — has delete ✓)
    - DELETE /api/v1/catalog/institutions/{id}/ (InstitutionDetailView — has delete ✓)

    **Validates: Requirements 1.9**
    """

    # Each tuple: (method, view_class_path, expected_handler_name)
    FRONTEND_API_CALLS = [
        ("PUT", "apps.applications.views.ApplicationDetailView", "put"),
        ("DELETE", "apps.applications.views.ApplicationDetailView", "delete"),
        ("PUT", "apps.applications.views.ApplicationInterviewView", "put"),
        ("DELETE", "apps.applications.views.ApplicationInterviewView", "delete"),
        ("PATCH", "apps.applications.views.ApplicationReviewView", "patch"),
        ("POST", "apps.applications.views.ApplicationReviewView", "post"),
        ("PUT", "apps.common.notification_views.NotificationPreferenceView", "put"),
        ("PUT", "apps.common.notification_views.NotificationMarkReadView", "put"),
        ("PUT", "apps.common.notification_views.NotificationMarkAllReadView", "put"),
        ("DELETE", "apps.common.notification_views.NotificationDeleteView", "delete"),
    ]

    @given(
        call_index=st.integers(min_value=0, max_value=len(FRONTEND_API_CALLS) - 1),
    )
    @settings(max_examples=len(FRONTEND_API_CALLS), deadline=None)
    def test_frontend_api_methods_supported_by_backend(self, call_index):
        """For each frontend API call, verify the backend view supports
        the HTTP method used.

        On unfixed code, this will FAIL if any frontend API call uses
        a method that the backend view does not implement (e.g., PUT
        on ApplicationInterviewView which only has get/post/patch).
        """
        import importlib

        method, view_path, handler_name = self.FRONTEND_API_CALLS[call_index]

        # Import the view class
        module_path, class_name = view_path.rsplit(".", 1)
        module = importlib.import_module(module_path)
        view_class = getattr(module, class_name)

        # Check if the view has the required method handler
        has_handler = hasattr(view_class, handler_name) and callable(
            getattr(view_class, handler_name)
        )

        assert has_handler, (
            f"Backend view {class_name} does NOT have a '{handler_name}' method handler. "
            f"Frontend sends {method} requests to this endpoint but the backend "
            f"will return 405 Method Not Allowed. "
            f"Available methods: {[m for m in ('get', 'post', 'put', 'patch', 'delete') if hasattr(view_class, m)]}"
        )


# =========================================================================
# Bug 5 (Payment): Missing payment list endpoint
# =========================================================================


class TestPaymentPageDiscovery:
    """Bug 5: Payment page failure — missing GET /api/v1/payments/ list endpoint.

    Investigation findings:
    - The Payment page at /student/payment uses applicationService.list({ mine: true })
      to fetch applications with payment fields — this works because the
      ApplicationListSerializer includes payment_status, payment_method, etc.
    - The backend has PaymentReceiptView (GET /api/v1/payments/{id}/receipt/)
      and PaymentVerifyView (POST /api/v1/payments/{id}/verify/)
    - BUT there is NO list endpoint at GET /api/v1/payments/ — any request
      to the payments root returns 404 because payment_urlpatterns only has
      {id}/receipt/ and {id}/verify/ patterns
    - The Payment model exists in backend/apps/documents/models.py with
      fields: id, application, user, amount, currency, payment_method,
      transaction_reference, status, verified_by, verified_at, etc.
    - Students cannot list their Payment records from the payments table
    - Admins cannot list all payments for management/reporting

    Root cause: Missing PaymentListView in payment_urlpatterns.

    **Validates: Requirements 1.5**
    """

    def test_payment_list_endpoint_exists_in_url_patterns(self):
        """GET /api/v1/payments/ should resolve to a view.

        On unfixed code, this will FAIL because payment_urlpatterns
        only has {id}/receipt/ and {id}/verify/ — no root list endpoint.
        """
        from django.urls import resolve, Resolver404

        try:
            match = resolve("/api/v1/payments/")
            assert match is not None, "URL resolved but match is None"
            # Verify it's a list-type view, not a detail view
            assert "payment_id" not in match.kwargs, (
                "Root /api/v1/payments/ should be a list endpoint, not a detail endpoint"
            )
        except Resolver404:
            pytest.fail(
                "GET /api/v1/payments/ returns 404 — no list endpoint exists. "
                "payment_urlpatterns only has {id}/receipt/ and {id}/verify/. "
                "Students cannot list their Payment records and admins cannot "
                "list all payments for management/reporting."
            )

    def test_payment_list_view_exists_in_views(self):
        """PaymentListView should exist in apps.documents.views.

        On unfixed code, this will FAIL because PaymentListView does not exist.
        """
        from apps.documents import views

        assert hasattr(views, "PaymentListView"), (
            "PaymentListView does not exist in apps.documents.views. "
            "There is no way to list payments — only receipt and verify endpoints exist."
        )

    def test_payment_list_view_returns_paginated_response(self):
        """GET /api/v1/payments/ should return a paginated list of payments.

        On unfixed code, this will FAIL because the endpoint doesn't exist.
        """
        from apps.documents.views import PaymentListView

        factory = APIRequestFactory()
        view = PaymentListView.as_view()
        user = _make_user()

        with patch("apps.documents.views.Payment.objects") as mock_qs:
            mock_filter = MagicMock()
            mock_filter.filter.return_value = mock_filter
            mock_filter.order_by.return_value = mock_filter
            mock_qs.filter.return_value = mock_filter

            # Mock the paginator to return None (no pagination needed for empty set)
            with patch("apps.documents.views.StandardPagination") as mock_pag_cls:
                mock_paginator = MagicMock()
                mock_paginator.paginate_queryset.return_value = None
                mock_pag_cls.return_value = mock_paginator

                mock_serializer_data = []
                with patch("apps.documents.views.PaymentSerializer") as mock_ser_cls:
                    mock_ser = MagicMock()
                    mock_ser.data = mock_serializer_data
                    mock_ser_cls.return_value = mock_ser

                    request = _auth_request(factory, "get", "/api/v1/payments/", user)
                    response = view(request)

        assert response.status_code == 200, (
            f"Expected 200 from GET /api/v1/payments/, got {response.status_code}"
        )

    @given(
        role=st.sampled_from(["student", "admin", "super_admin"]),
    )
    @settings(max_examples=10, deadline=None)
    def test_payment_list_filters_by_user_for_students(self, role):
        """Students should only see their own payments; admins see all.

        On unfixed code, this will FAIL because PaymentListView doesn't exist.
        """
        from apps.documents.views import PaymentListView

        factory = APIRequestFactory()
        view = PaymentListView.as_view()
        user = _make_user(role=role)

        with patch("apps.documents.views.Payment.objects") as mock_qs:
            mock_all = MagicMock()
            mock_all.order_by.return_value = mock_all
            mock_qs.all.return_value = mock_all

            mock_filter = MagicMock()
            mock_filter.order_by.return_value = mock_filter
            mock_qs.filter.return_value = mock_filter

            with patch("apps.documents.views.StandardPagination") as mock_pag_cls:
                mock_paginator = MagicMock()
                mock_paginator.paginate_queryset.return_value = None
                mock_pag_cls.return_value = mock_paginator

                with patch("apps.documents.views.PaymentSerializer") as mock_ser_cls:
                    mock_ser = MagicMock()
                    mock_ser.data = []
                    mock_ser_cls.return_value = mock_ser

                    request = _auth_request(factory, "get", "/api/v1/payments/", user)
                    response = view(request)

            if role in ("admin", "super_admin"):
                mock_qs.all.assert_called_once()
            else:
                mock_qs.filter.assert_called_once_with(user_id=str(user.id))

        assert response.status_code == 200
