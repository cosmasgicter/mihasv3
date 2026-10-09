"""Contract tests for V2 representative endpoints — Task 1.3.

Tests each V2 endpoint for the full contract:
- Success with data
- Validation error (field-level)
- Permission denied
- Not found
- Conflict (409)
- Throttled (429)
- Provider failure (502/503)
- Server error (500)

Requirements: R14.1-R14.2, R17.2
Finding: API-01
Evidence: request tests for success/validation/denial/conflict/provider failure
"""

from __future__ import annotations

import json
import os
import uuid
from decimal import Decimal
from unittest.mock import MagicMock, patch, PropertyMock

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import pytest
from django.test import SimpleTestCase, override_settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.common.v2 import (
    API_VERSION,
    V2APIView,
    V2EnvelopeRenderer,
    v2_exception_handler,
)
from apps.common.v2.demo_views import (
    V2ApplicationDetailView,
    V2DocumentListView,
    V2FeeResolveView,
    V2ProgramListView,
    V2SessionView,
)


factory = APIRequestFactory()


def _make_user(**kwargs):
    """Create a mock user object."""
    user = MagicMock()
    user.id = kwargs.get("id", uuid.uuid4())
    user.pk = user.id
    user.email = kwargs.get("email", "test@example.com")
    user.first_name = kwargs.get("first_name", "Test")
    user.last_name = kwargs.get("last_name", "User")
    user.role = kwargs.get("role", "student")
    user.is_authenticated = True
    user.is_active = True
    return user


def _attach_request_id(request):
    """Simulate the RequestIDMiddleware."""
    request.request_id = str(uuid.uuid4())
    return request


# ---------------------------------------------------------------------------
# Shared envelope shape assertions
# ---------------------------------------------------------------------------


def assert_success_envelope(response):
    """Assert the rendered HTTP response conforms to the V2 success envelope.

    DRF keeps the view's pre-render payload on ``Response.data``.  The V2
    renderer adds the canonical envelope during ``render()``, so contract tests
    must inspect the rendered bytes a real client receives.
    """
    if not response.is_rendered:
        response.render()
    data = json.loads(response.content)
    assert data["success"] is True, f"Expected success=True, got {data}"
    assert "data" in data, f"Missing 'data' key in {data}"
    assert "meta" in data, f"Missing 'meta' key in {data}"
    assert data["meta"]["api_version"] == "v2"
    assert "request_id" in data["meta"]
    return data


def assert_error_envelope(response, expected_code=None, expected_status=None):
    """Assert the response conforms to V2 error envelope shape."""
    if expected_status is not None:
        assert response.status_code == expected_status, (
            f"Expected status {expected_status}, got {response.status_code}"
        )
    data = response.data if hasattr(response, "data") else json.loads(response.content)
    assert data["success"] is False, f"Expected success=False, got {data}"
    assert "error" in data, f"Missing 'error' key in {data}"
    assert "meta" in data, f"Missing 'meta' key in {data}"
    assert data["meta"]["api_version"] == "v2"
    # Error object shape.
    error = data["error"]
    assert "code" in error
    assert "message" in error
    assert "fields" in error
    assert "retryable" in error
    assert isinstance(error["fields"], dict)
    assert isinstance(error["retryable"], bool)
    if expected_code:
        assert error["code"] == expected_code
    return data


def assert_paginated_envelope(response):
    """Assert the response conforms to V2 paginated success envelope."""
    data = assert_success_envelope(response)
    inner = data["data"]
    assert "page" in inner, f"Missing 'page' in paginated data: {inner}"
    assert "page_size" in inner, f"Missing 'page_size' in paginated data"
    assert "total_count" in inner, f"Missing 'total_count' in paginated data"
    assert "results" in inner, f"Missing 'results' in paginated data"
    assert isinstance(inner["results"], list)
    return data


def _paginated_response(results):
    """Return the real DRF response shape produced by ``V2Pagination``."""
    return Response(
        {
            "success": True,
            "data": {
                "page": 1,
                "page_size": 20,
                "total_count": len(results),
                "results": results,
            },
            "meta": {"request_id": "test-id", "api_version": "v2"},
        }
    )


# ---------------------------------------------------------------------------
# Auth: V2SessionView
# ---------------------------------------------------------------------------


class TestV2SessionEndpoint(SimpleTestCase):
    """Contract tests for GET /api/v2/auth/session/."""

    def test_success_authenticated_user(self):
        """Authenticated user gets session data in V2 envelope."""
        user = _make_user()
        request = factory.get("/api/v2/auth/session/")
        _attach_request_id(request)
        force_authenticate(request, user=user)

        view = V2SessionView.as_view()
        response = view(request)
        response.render()

        data = assert_success_envelope(response)
        assert data["data"]["authenticated"] is True
        assert data["data"]["email"] == user.email

    def test_success_anonymous_user(self):
        """Anonymous user gets {authenticated: false} in V2 envelope."""
        request = factory.get("/api/v2/auth/session/")
        _attach_request_id(request)
        # Do not authenticate.

        view = V2SessionView.as_view()
        response = view(request)
        response.render()

        data = assert_success_envelope(response)
        assert data["data"]["authenticated"] is False

    def test_meta_includes_request_id(self):
        """Meta block includes the request_id from middleware."""
        request = factory.get("/api/v2/auth/session/")
        req_id = str(uuid.uuid4())
        request.request_id = req_id

        view = V2SessionView.as_view()
        response = view(request)
        response.render()

        data = json.loads(response.content)
        assert data["meta"]["request_id"] == req_id


# ---------------------------------------------------------------------------
# Catalog: V2ProgramListView
# ---------------------------------------------------------------------------


class TestV2ProgramListEndpoint(SimpleTestCase):
    """Contract tests for GET /api/v2/catalog/programs/."""

    @patch("apps.common.v2.demo_views.V2ProgramListView.pagination_class")
    def test_success_with_programs(self, mock_pagination_cls):
        """Returns paginated program list in V2 envelope."""
        # Mock the pagination to return a controlled response.
        mock_paginator = MagicMock()
        mock_pagination_cls.return_value = mock_paginator

        # Simulate paginate_queryset returning a list.
        mock_program = MagicMock()
        mock_program.id = uuid.uuid4()
        mock_program.name = "Computer Science"
        mock_program.code = "CS101"
        mock_program.is_active = True

        mock_paginator.paginate_queryset.return_value = [mock_program]
        mock_paginator.get_paginated_response.side_effect = _paginated_response

        request = factory.get("/api/v2/catalog/programs/")
        _attach_request_id(request)

        with patch("apps.catalog.models.Program") as MockProgram:
            mock_qs = MagicMock()
            MockProgram.objects.filter.return_value = mock_qs
            mock_qs.order_by.return_value = mock_qs

            view = V2ProgramListView.as_view()
            response = view(request)

        # The paginated response shape as rendered over HTTP.
        data = assert_paginated_envelope(response)
        assert data["data"]["total_count"] == 1
        assert data["data"]["results"][0]["name"] == "Computer Science"
        assert data["meta"]["api_version"] == "v2"


# ---------------------------------------------------------------------------
# Applications: V2ApplicationDetailView
# ---------------------------------------------------------------------------


class TestV2ApplicationDetailEndpoint(SimpleTestCase):
    """Contract tests for GET /api/v2/applications/{id}/."""

    def test_success_owner_read(self):
        """Application owner gets detail in V2 envelope."""
        user = _make_user()
        app_id = uuid.uuid4()

        mock_app = MagicMock()
        mock_app.id = app_id
        mock_app.user_id = user.id
        mock_app.status = "submitted"
        mock_app.program = "Computer Science"
        mock_app.institution = "MIHAS"
        mock_app.created_at = MagicMock()
        mock_app.created_at.isoformat.return_value = "2025-01-01T00:00:00Z"
        mock_app.updated_at = MagicMock()
        mock_app.updated_at.isoformat.return_value = "2025-01-02T00:00:00Z"

        request = factory.get(f"/api/v2/applications/{app_id}/")
        _attach_request_id(request)
        force_authenticate(request, user=user)

        with patch("apps.applications.models.Application.objects") as mock_objects:
            mock_objects.get.return_value = mock_app

            view = V2ApplicationDetailView.as_view()
            response = view(request, application_id=app_id)
            response.render()

        data = assert_success_envelope(response)
        assert data["data"]["id"] == str(app_id)
        assert data["data"]["status"] == "submitted"

    def test_not_found_for_nonexistent(self):
        """Non-existent application returns V2 NOT_FOUND error."""
        user = _make_user()
        app_id = uuid.uuid4()

        request = factory.get(f"/api/v2/applications/{app_id}/")
        _attach_request_id(request)
        force_authenticate(request, user=user)

        with patch("apps.applications.models.Application.objects") as mock_objects:
            from apps.applications.models import Application

            mock_objects.get.side_effect = Application.DoesNotExist

            view = V2ApplicationDetailView.as_view()
            response = view(request, application_id=app_id)
            response.render()

        assert_error_envelope(response, expected_code="NOT_FOUND", expected_status=404)

    def test_not_found_for_non_owner(self):
        """Non-owner gets NOT_FOUND (not 403 to avoid leaking existence)."""
        user = _make_user()
        other_user_id = uuid.uuid4()
        app_id = uuid.uuid4()

        mock_app = MagicMock()
        mock_app.id = app_id
        mock_app.user_id = other_user_id  # Different user.

        request = factory.get(f"/api/v2/applications/{app_id}/")
        _attach_request_id(request)
        force_authenticate(request, user=user)

        with patch("apps.applications.models.Application.objects") as mock_objects:
            mock_objects.get.return_value = mock_app

            view = V2ApplicationDetailView.as_view()
            response = view(request, application_id=app_id)
            response.render()

        assert_error_envelope(response, expected_code="NOT_FOUND", expected_status=404)

    def test_authentication_required(self):
        """Unauthenticated request returns V2 AUTHENTICATION_REQUIRED."""
        app_id = uuid.uuid4()

        request = factory.get(f"/api/v2/applications/{app_id}/")
        _attach_request_id(request)
        # No authentication.

        view = V2ApplicationDetailView.as_view()
        response = view(request, application_id=app_id)
        response.render()

        assert_error_envelope(
            response,
            expected_code="AUTHENTICATION_REQUIRED",
            expected_status=401,
        )


# ---------------------------------------------------------------------------
# Payment: V2FeeResolveView
# ---------------------------------------------------------------------------


class TestV2FeeResolveEndpoint(SimpleTestCase):
    """Contract tests for GET /api/v2/payments/resolve-fee/."""

    def test_success_fee_resolved(self):
        """Valid program code returns fee in V2 success envelope."""
        user = _make_user()

        mock_resolved = MagicMock()
        mock_resolved.amount = Decimal("500.00")
        mock_resolved.currency = "ZMW"
        mock_resolved.residency_category = "local"
        mock_resolved.source = "program_fee"
        mock_resolved.provider_fee_estimate = Decimal("5.00")

        request = factory.get(
            "/api/v2/payments/resolve-fee/",
            {"program_code": "CS101", "nationality": "ZM"},
        )
        _attach_request_id(request)
        force_authenticate(request, user=user)

        with patch("apps.documents.fee_resolver.FeeResolver") as MockResolver:
            mock_instance = MockResolver.return_value
            mock_instance.resolve_fee.return_value = mock_resolved

            view = V2FeeResolveView.as_view()
            response = view(request)
            response.render()

        data = assert_success_envelope(response)
        assert data["data"]["amount"] == "500.00"
        assert data["data"]["currency"] == "ZMW"

    def test_validation_error_missing_program_code(self):
        """Missing program_code returns V2 VALIDATION_ERROR with fields."""
        user = _make_user()

        request = factory.get("/api/v2/payments/resolve-fee/")
        _attach_request_id(request)
        force_authenticate(request, user=user)

        view = V2FeeResolveView.as_view()
        response = view(request)
        response.render()

        data = assert_error_envelope(
            response,
            expected_code="VALIDATION_ERROR",
            expected_status=400,
        )
        assert "program_code" in data["error"]["fields"]

    def test_fee_not_configured(self):
        """Non-existent program returns V2 FEE_NOT_CONFIGURED."""
        user = _make_user()

        request = factory.get(
            "/api/v2/payments/resolve-fee/",
            {"program_code": "NONEXISTENT"},
        )
        _attach_request_id(request)
        force_authenticate(request, user=user)

        with patch("apps.documents.fee_resolver.FeeResolver") as MockResolver:
            from apps.catalog.models import Program

            mock_instance = MockResolver.return_value
            mock_instance.resolve_fee.side_effect = Program.DoesNotExist

            view = V2FeeResolveView.as_view()
            response = view(request)
            response.render()

        data = assert_error_envelope(response, expected_code="FEE_NOT_CONFIGURED")
        assert response.status_code == 422

    def test_provider_unavailable(self):
        """Fee resolver failure returns V2 PROVIDER_UNAVAILABLE (retryable)."""
        user = _make_user()

        request = factory.get(
            "/api/v2/payments/resolve-fee/",
            {"program_code": "CS101"},
        )
        _attach_request_id(request)
        force_authenticate(request, user=user)

        with patch("apps.documents.fee_resolver.FeeResolver") as MockResolver:
            mock_instance = MockResolver.return_value
            mock_instance.resolve_fee.side_effect = RuntimeError("DB connection lost")

            view = V2FeeResolveView.as_view()
            response = view(request)
            response.render()

        data = assert_error_envelope(
            response,
            expected_code="PROVIDER_UNAVAILABLE",
            expected_status=503,
        )
        assert data["error"]["retryable"] is True

    def test_authentication_required(self):
        """Unauthenticated request returns V2 AUTHENTICATION_REQUIRED."""
        request = factory.get(
            "/api/v2/payments/resolve-fee/",
            {"program_code": "CS101"},
        )
        _attach_request_id(request)

        view = V2FeeResolveView.as_view()
        response = view(request)
        response.render()

        assert_error_envelope(
            response,
            expected_code="AUTHENTICATION_REQUIRED",
            expected_status=401,
        )


# ---------------------------------------------------------------------------
# Documents: V2DocumentListView
# ---------------------------------------------------------------------------


class TestV2DocumentListEndpoint(SimpleTestCase):
    """Contract tests for GET /api/v2/documents/."""

    @patch("apps.common.v2.demo_views.V2DocumentListView.pagination_class")
    def test_success_with_documents(self, mock_pagination_cls):
        """Returns paginated document list in V2 envelope."""
        user = _make_user()
        mock_paginator = MagicMock()
        mock_pagination_cls.return_value = mock_paginator

        doc_id = uuid.uuid4()
        mock_doc = MagicMock()
        mock_doc.id = doc_id
        mock_doc.document_type = "nrc"
        mock_doc.document_name = "nrc_scan.pdf"
        mock_doc.verification_status = "verified"
        mock_doc.created_at = MagicMock()
        mock_doc.created_at.isoformat.return_value = "2025-06-01T10:00:00Z"

        mock_paginator.paginate_queryset.return_value = [mock_doc]
        mock_paginator.get_paginated_response.side_effect = _paginated_response

        request = factory.get("/api/v2/documents/")
        _attach_request_id(request)
        force_authenticate(request, user=user)

        with patch("apps.documents.models.ApplicationDocument") as MockDocument:
            mock_qs = MagicMock()
            MockDocument.objects.filter.return_value = mock_qs
            mock_qs.exclude.return_value = mock_qs
            mock_qs.order_by.return_value = mock_qs

            view = V2DocumentListView.as_view()
            response = view(request)

        data = assert_paginated_envelope(response)
        document = data["data"]["results"][0]
        assert document["document_type"] == "nrc"
        assert document["file_name"] == "nrc_scan.pdf"
        assert document["status"] == "verified"
        MockDocument.objects.filter.assert_called_once_with(
            application__user_id=user.id,
            is_current=True,
        )
        mock_qs.exclude.assert_called_once_with(verification_status="deleted")
        mock_qs.order_by.assert_called_once_with("-created_at")

    def test_authentication_required(self):
        """Unauthenticated request returns V2 AUTHENTICATION_REQUIRED."""
        request = factory.get("/api/v2/documents/")
        _attach_request_id(request)

        view = V2DocumentListView.as_view()
        response = view(request)
        response.render()

        assert_error_envelope(
            response,
            expected_code="AUTHENTICATION_REQUIRED",
            expected_status=401,
        )


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
